using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace PlanR.Bridge.Dampsoft;

public readonly record struct DbfField(char Kind, int Offset, int Length, int Decimals);

/// <summary>1:1-Port von dbf_tables.py + read_patients aus connector_service.py.</summary>
public static class DbfTabelle
{
    static readonly HashSet<byte> SupportedVersions = [0x03, 0x30, 0x31, 0x32, 0x83, 0xF5];

    static readonly Dictionary<string, string> PatientFields = new(StringComparer.Ordinal)
    {
        ["PATNR"] = "patientNumber", ["PATID"] = "patientId", ["NAME"] = "lastName",
        ["VORNAME"] = "firstName", ["GEBDATP"] = "birthDate", ["PATSTRA"] = "street",
        ["PZUSATZ"] = "addressExtra", ["PATORT"] = "postalCodeAndCity", ["PLAND"] = "country",
        ["TELEFON"] = "phone", ["TELEFON2"] = "phone2", ["HANDY"] = "mobile", ["EMAIL"] = "email",
    };

    static readonly object CacheLock = new();
    static (string Path, string Enc, long Size, long Mtime)? _patCacheKey;
    static List<Dictionary<string, object?>> _patCacheRows = [];

    public static byte[] ReadBytesShared(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var b = new byte[fs.Length];
        var total = 0;
        while (total < b.Length)
        {
            var r = fs.Read(b, total, b.Length - total);
            if (r == 0) break;
            total += r;
        }
        if (total != b.Length) Array.Resize(ref b, total);
        return b;
    }

    public static string Revision(byte[] record) =>
        Convert.ToHexString(SHA256.HashData(record)).ToLowerInvariant();

    public static (Dictionary<string, DbfField> Fields, List<byte[]> Rows, int Width) Table(string path)
    {
        var fi1 = new FileInfo(path);
        if (!fi1.Exists) throw new FileNotFoundException("DBF-Datei fehlt.", path);
        var b1 = (fi1.Length, fi1.LastWriteTimeUtc.Ticks);
        byte[] b;
        using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            b = new byte[fs.Length];
            var total = 0;
            while (total < b.Length)
            {
                var r = fs.Read(b, total, b.Length - total);
                if (r == 0) break;
                total += r;
            }
            if (total != b.Length) Array.Resize(ref b, total);
        }
        var fi2 = new FileInfo(path);
        if (b1 != (fi2.Length, fi2.LastWriteTimeUtc.Ticks))
            throw new DbfError("Datenquelle wurde während des Lesens geändert.");
        if (b.Length < 33 || !SupportedVersions.Contains(b[0]))
            throw new DbfError("Unbekanntes Tabellenformat.");
        var count = BitConverter.ToUInt32(b, 4);
        var header = BitConverter.ToUInt16(b, 8);
        var width = BitConverter.ToUInt16(b, 10);
        if (header < 33 || width < 2 || header + (long)count * width > b.Length)
            throw new DbfError("Unvollständige Tabelle.");
        var descriptors = new List<byte[]>();
        for (var i = 32; i < header; i += 32)
        {
            if (b[i] == 13) break;
            if (i + 32 > b.Length) throw new DbfError("Ungültige Feldstruktur.");
            var d = new byte[32];
            Buffer.BlockCopy(b, i, d, 0, 32);
            descriptors.Add(d);
        }
        Dictionary<string, DbfField>? matched = null;
        foreach (var wide in new[] { false, true })
        {
            var fields = new Dictionary<string, DbfField>(StringComparer.Ordinal);
            var offset = 1;
            var ok = true;
            foreach (var d in descriptors)
            {
                var nul = Array.IndexOf(d, (byte)0, 0, 11);
                var name = Encoding.ASCII.GetString(d, 0, nul < 0 ? 11 : nul);
                var kind = (char)d[11];
                int length = d[16], decimals = d[17];
                if (wide && kind == 'C') { length += 256 * decimals; decimals = 0; }
                if (fields.ContainsKey(name) || length == 0) { ok = false; break; }
                fields[name] = new DbfField(kind, offset, length, decimals);
                offset += length;
            }
            if (ok && offset == width) { matched = fields; break; }
        }
        if (matched is null) throw new DbfError("Unbekannte Satzstruktur.");
        var rows = new List<byte[]>((int)count);
        for (uint i = 0; i < count; i++)
        {
            var row = new byte[width];
            Buffer.BlockCopy(b, (int)(header + i * width), row, 0, width);
            rows.Add(row);
        }
        return (matched, rows, width);
    }

    public static object? Value(byte[] record, Dictionary<string, DbfField> fields, string name, string encoding)
    {
        if (!fields.TryGetValue(name, out var f)) return null;
        if (f.Kind == 'B')
        {
            var res = BitConverter.ToDouble(record, f.Offset);
            if (!double.IsFinite(res)) throw new DbfError("Ungültiger numerischer Wert.");
            return res;
        }
        if (f.Kind == 'M')
        {
            long val = 0;
            for (var i = f.Length - 1; i >= 0; i--) val = (val << 8) | record[f.Offset + i];
            return val;
        }
        var enc = DsWinPfad.EncodingByName(encoding, strict: true);
        var text = enc.GetString(record, f.Offset, f.Length).Trim(' ', '\0');
        if (f.Kind is 'N' or 'F')
        {
            if (text.Trim('.').Length == 0) return 0.0;
            return double.Parse(text, CultureInfo.InvariantCulture);
        }
        if (f.Kind == 'D')
        {
            if (text.Length == 0 || text == "00000000") return null;
            return DateOnly.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
                ? d.ToString("yyyy-MM-dd") : null;
        }
        if (f.Kind == 'L') return text is "T" or "Y" or "J";
        return text;
    }

    public static bool Active(byte[] record, Dictionary<string, DbfField> fields, string encoding)
    {
        if (record.Length == 0 || record[0] != 0x20) return false;
        foreach (var key in new[] { "DEL", "LOESCH" })
        {
            if (!fields.ContainsKey(key)) continue;
            var v = Convert.ToString(Value(record, fields, key, encoding));
            if (v is "J" or "Y" or "1" or "*" or "D") return false;
        }
        return true;
    }

    public static List<Dictionary<string, object?>> ReadPatients(string path, string encoding)
    {
        lock (CacheLock)
        {
            var fi = new FileInfo(path);
            if (!fi.Exists) throw new FileNotFoundException("Patiententabelle fehlt.", path);
            var key = (path, encoding, fi.Length, fi.LastWriteTimeUtc.Ticks);
            if (_patCacheKey != key)
            {
                _patCacheRows = LiesPatienten(path, encoding);
                _patCacheKey = key;
            }
            return _patCacheRows.Select(r => new Dictionary<string, object?>(r, StringComparer.Ordinal)).ToList();
        }
    }

    public static void CacheLeeren()
    {
        lock (CacheLock) { _patCacheKey = null; _patCacheRows = []; }
    }

    static List<Dictionary<string, object?>> LiesPatienten(string path, string encoding)
    {
        var encReplace = DsWinPfad.EncodingByName(encoding, strict: false);
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var beforeFi = new FileInfo(path);
        var beforeSig = (fs.Length, beforeFi.LastWriteTimeUtc.Ticks);
        var head = new byte[32];
        if (fs.Read(head, 0, 32) != 32 || !SupportedVersions.Contains(head[0]))
            throw new SourceError("Unsupported DBF header");
        var count = BitConverter.ToUInt32(head, 4);
        var headerSize = BitConverter.ToUInt16(head, 8);
        var recordSize = BitConverter.ToUInt16(head, 10);
        if (headerSize < 33 || recordSize < 2) throw new SourceError("Invalid DBF dimensions");
        if (headerSize + (long)count * recordSize > fs.Length) throw new SourceError("Incomplete DBF file");

        var desc = new byte[headerSize - 32];
        if (fs.Read(desc, 0, desc.Length) != desc.Length) throw new SourceError("Incomplete field descriptor");
        var offset = 1;
        var selected = new List<(string Name, int Start, int Width)>();
        var names = new HashSet<string>(StringComparer.Ordinal);
        var terminated = false;
        for (var i = 0; i < desc.Length; i += 32)
        {
            if (desc[i] == 13) { terminated = true; break; }
            if (i + 32 > desc.Length) throw new SourceError("Incomplete field descriptor");
            var nul = Array.IndexOf(desc, (byte)0, i, 11);
            var name = Encoding.ASCII.GetString(desc, i, nul < 0 ? 11 : nul - i);
            int width = desc[i + 16];
            if (width == 0 || !names.Add(name)) throw new SourceError("Invalid field layout");
            var ftype = (char)desc[i + 11];
            if (PatientFields.ContainsKey(name))
            {
                var expected = name == "GEBDATP" ? 'D' : 'C';
                if (ftype != expected) throw new SourceError("Unexpected patient field type");
                selected.Add((name, offset, width));
            }
            else if (name == "PRAXIS" && ftype is 'N' or 'C')
            {
                selected.Add((name, offset, width));
            }
            offset += width;
        }
        if (!terminated || offset != recordSize || !names.Contains("PATNR") || !names.Contains("NAME") || !names.Contains("VORNAME"))
            throw new SourceError("Unsupported patient table layout");

        var rows = new List<Dictionary<string, object?>>((int)count);
        var record = new byte[recordSize];
        for (uint i = 0; i < count; i++)
        {
            var r = fs.Read(record, 0, recordSize);
            if (r != recordSize) throw new SourceChanged("Source changed during read");
            if (record[0] == 42 || record[0] != 32) continue;
            var row = new Dictionary<string, object?>(StringComparer.Ordinal) { ["praxis"] = 1 };
            foreach (var (name, start, width) in selected)
            {
                var val = encReplace.GetString(record, start, width);
                if (val.Any(c => c < 32)) val = new string(val.Where(c => c >= 32).ToArray());
                val = val.Trim(' ');
                if (name == "PRAXIS")
                {
                    row["praxis"] = DsWinPfad.PraxisNummer(val);
                    continue;
                }
                if (name == "GEBDATP")
                {
                    string? birth = null;
                    if (val.Trim('0').Length > 0
                        && DateOnly.TryParseExact(val, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                        birth = d.ToString("yyyy-MM-dd");
                    row[PatientFields[name]] = birth;
                    continue;
                }
                row[PatientFields[name]] = val;
            }
            row["version"] = Revision(record);
            rows.Add(row);
        }
        var afterFi = new FileInfo(path);
        if (beforeSig != (fs.Length, afterFi.LastWriteTimeUtc.Ticks))
            throw new SourceChanged("Source changed during read; retry");
        return rows;
    }
}
