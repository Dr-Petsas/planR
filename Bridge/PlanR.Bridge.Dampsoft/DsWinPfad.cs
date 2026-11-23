using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Dampsoft;

public class EditError : Exception
{
    public virtual int Status => 400;
    public EditError(string message) : base(message) { }
}

public sealed class EditConflict : EditError
{
    public override int Status => 409;
    public EditConflict(string message) : base(message) { }
}

public sealed class EditUnavailable : EditError
{
    public override int Status => 503;
    public EditUnavailable(string message) : base(message) { }
}

public sealed class PraxisFehler : Exception
{
    public int Status => 404;
    public PraxisFehler(string message) : base(message) { }
}

public sealed class HkpError : Exception
{
    public HkpError(string message) : base(message) { }
}

public sealed class DbfError : Exception
{
    public DbfError(string message) : base(message) { }
}

public class SourceError : Exception
{
    public SourceError(string message) : base(message) { }
}

public sealed class SourceChanged : SourceError
{
    public SourceChanged(string message) : base(message) { }
}

public sealed class NativeError : Exception
{
    public NativeError(string message) : base(message) { }
}

/// <summary>1:1-Port von dswin_path.py, praxen.py und sicherung.py.</summary>
public static class DsWinPfad
{
    static readonly HashSet<string> Programs = new(StringComparer.OrdinalIgnoreCase)
    {
        "dswin.exe", "dsprg.exe", "dswart.exe", "dbexp.exe",
    };

    static readonly HashSet<string> TextFields = new(StringComparer.Ordinal)
    {
        "NAME", "VORNAME", "PATORT", "PATSTRA",
    };

    static readonly HashSet<byte> Cp850Umlauts = [0x81, 0x84, 0x94, 0x8e, 0x99, 0x9a, 0xe1];
    static readonly HashSet<byte> Cp1252Umlauts = [0xe4, 0xf6, 0xfc, 0xc4, 0xd6, 0xdc, 0xdf];
    static readonly Regex LnkTarget = new(@"([A-Za-z]:\\[\x20-\x7e\x80-\xff]{0,200}?\\)dswin\.exe", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex PraxenKopfRe = new(@"^\s*[1-9](\s*,\s*[1-9])*\s*$", RegexOptions.Compiled);

    public const string PraxenKopf = "X-DSWin-Praxen";
    public const long SicherungReserve = 64L * 1024 * 1024;
    public static readonly string[] SicherungTabellen = ["HKPPLAN", "HKPPLAN2", "HKPLST", "BEFUND"];

    static DsWinPfad() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public static Encoding EncodingByName(string name, bool strict = true)
    {
        var cp = name.Equals("cp1252", StringComparison.OrdinalIgnoreCase) ? 1252 : 850;
        return strict
            ? Encoding.GetEncoding(cp, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback)
            : Encoding.GetEncoding(cp, EncoderFallback.ReplacementFallback, DecoderFallback.ReplacementFallback);
    }

    public static bool Valid(string root)
    {
        try { return File.Exists(Path.Combine(root, "daten", "patient.dbf")); }
        catch { return false; }
    }

    [DllImport("psapi.dll")] static extern bool EnumProcesses([Out] uint[] lpidProcess, uint cb, out uint lpcbNeeded);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool QueryFullProcessImageNameW(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr hObject);
    [DllImport("kernel32.dll")] static extern uint GetLogicalDrives();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetDriveTypeW(string lpRootPathName);

    static IEnumerable<string> RunningPrograms()
    {
        if (!OperatingSystem.IsWindows()) yield break;
        var ids = new uint[4096];
        if (!EnumProcesses(ids, (uint)(ids.Length * sizeof(uint)), out var needed)) yield break;
        var count = (int)(needed / sizeof(uint));
        for (var i = 0; i < count; i++)
        {
            var handle = OpenProcess(0x1000, false, ids[i]);
            if (handle == IntPtr.Zero) continue;
            try
            {
                var sb = new StringBuilder(1024);
                var len = (uint)sb.Capacity;
                if (QueryFullProcessImageNameW(handle, 0, sb, ref len))
                {
                    var exe = sb.ToString();
                    var name = Path.GetFileName(exe);
                    if (Programs.Contains(name))
                    {
                        var dir = Path.GetDirectoryName(exe);
                        if (!string.IsNullOrEmpty(dir)) yield return dir;
                    }
                }
            }
            finally { CloseHandle(handle); }
        }
    }

    static IEnumerable<string> Shortcuts()
    {
        var folders = new List<string>();
        foreach (var v in new[] { "PUBLIC", "USERPROFILE", "ALLUSERSPROFILE", "APPDATA" })
        {
            var val = Environment.GetEnvironmentVariable(v);
            if (!string.IsNullOrEmpty(val)) folders.Add(val);
        }
        var users = Path.Combine((Environment.GetEnvironmentVariable("SystemDrive") ?? "C:") + "\\", "Users");
        if (Directory.Exists(users))
        {
            try { folders.AddRange(Directory.EnumerateDirectories(users)); }
            catch { }
        }
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var subs = new[]
        {
            "Desktop", @"Microsoft\Windows\Start Menu\Programs",
            @"Start Menu\Programs", @"AppData\Roaming\Microsoft\Windows\Start Menu\Programs",
        };
        foreach (var baseDir in folders)
        {
            foreach (var sub in subs)
            {
                var folder = Path.Combine(baseDir, sub);
                if (!Directory.Exists(folder)) continue;
                var lnks = new List<string>();
                try { lnks.AddRange(Directory.EnumerateFiles(folder, "*.lnk")); } catch { }
                try
                {
                    foreach (var child in Directory.EnumerateDirectories(folder))
                    {
                        try { lnks.AddRange(Directory.EnumerateFiles(child, "*.lnk")); } catch { }
                    }
                }
                catch { }
                foreach (var lnk in lnks)
                {
                    byte[] data;
                    try
                    {
                        using var fs = File.OpenRead(lnk);
                        var n = (int)Math.Min(16384, fs.Length);
                        data = new byte[n];
                        var r = fs.Read(data, 0, n);
                        if (r < n) Array.Resize(ref data, r);
                    }
                    catch { continue; }
                    var latin = Encoding.Latin1.GetString(data);
                    foreach (Match m in LnkTarget.Matches(latin))
                    {
                        var rawBytes = Encoding.Latin1.GetBytes(m.Groups[1].Value);
                        var path = Encoding.Default.GetString(rawBytes);
                        if (seen.Add(path)) yield return path;
                    }
                }
            }
        }
    }

    static IEnumerable<string> Drives()
    {
        if (!OperatingSystem.IsWindows()) yield break;
        var mask = GetLogicalDrives();
        for (var i = 0; i < 26; i++)
        {
            var letter = (char)('A' + i);
            if (((mask >> i) & 1) == 0 || letter is 'A' or 'B') continue;
            var root = $"{letter}:\\";
            yield return Path.Combine(root, "TDAMP", "DS");
            string[] children;
            try { children = Directory.GetDirectories(root); }
            catch { continue; }
            foreach (var child in children)
                yield return Path.Combine(child, "TDAMP", "DS");
        }
    }

    static long DataStamp(string root)
    {
        long max = 0;
        foreach (var name in new[] { "patient.dbf", "patient.cdx" })
        {
            try
            {
                var p = Path.Combine(root, "daten", name);
                if (File.Exists(p))
                {
                    var t = File.GetLastWriteTimeUtc(p).Ticks;
                    if (t > max) max = t;
                }
            }
            catch { }
        }
        return max;
    }

    static List<(string Root, string Label, long Stamp)> Collect(params (Func<IEnumerable<string>> Source, string Label)[] sources)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var found = new List<(string Root, string Label, long Stamp)>();
        foreach (var (source, label) in sources)
        {
            try
            {
                foreach (var root in source())
                {
                    string abs;
                    try { abs = Path.GetFullPath(root).TrimEnd('\\'); }
                    catch { continue; }
                    if (!seen.Add(abs) || !Valid(abs)) continue;
                    found.Add((abs, label, DataStamp(abs)));
                }
            }
            catch { }
        }
        found.Sort((a, b) => b.Stamp.CompareTo(a.Stamp));
        return found;
    }

    public static (string? Root, string FoundBy) FindRoot()
    {
        var env = Environment.GetEnvironmentVariable("DSWIN_ROOT");
        if (!string.IsNullOrEmpty(env)) return (Path.GetFullPath(env).TrimEnd('\\'), "DSWIN_ROOT");
        var found = Collect((RunningPrograms, "laufendes DS-Win"));
        if (found.Count == 0) found = Collect((Shortcuts, "Verknüpfung"), (Drives, "Laufwerkssuche"));
        return found.Count == 0 ? (null, "nicht gefunden") : (found[0].Root, found[0].Label);
    }

    public static string? WriteBlocker(string root)
    {
        if (File.Exists(Path.Combine(root, "SQLSERVER.FLG")))
            return "DS-Win arbeitet hier mit einem SQL-Server; dafür ist das Zurückschreiben nicht freigegeben.";
        var serverCfg = Path.Combine(root, "SERVER.CFG");
        if (!File.Exists(serverCfg))
            return "Die DS-Win-Konfiguration ist nicht eindeutig (SERVER.CFG fehlt); das Zurückschreiben bleibt sicherheitshalber aus.";
        byte[] bytes;
        try { bytes = File.ReadAllBytes(serverCfg); }
        catch { return "Die DS-Win-Konfiguration (SERVER.CFG) ist nicht lesbar; das Zurückschreiben bleibt sicherheitshalber aus."; }
        if (Encoding.Latin1.GetString(bytes).Trim().Length > 0)
            return "DS-Win läuft hier im Server-Betrieb; dafür ist das Zurückschreiben nicht freigegeben.";
        return null;
    }

    public static string GuessEncoding(string dbfPath)
    {
        var env = Environment.GetEnvironmentVariable("DSWIN_ENCODING");
        if (!string.IsNullOrEmpty(env)) return env;
        try
        {
            var b = File.ReadAllBytes(dbfPath);
            if (b.Length < 32) return "cp850";
            var count = BitConverter.ToUInt32(b, 4);
            var header = BitConverter.ToUInt16(b, 8);
            var width = BitConverter.ToUInt16(b, 10);
            var spans = new List<(int Start, int Length)>();
            var offset = 1;
            for (var i = 32; i < header - 1 && i + 32 <= b.Length; i += 32)
            {
                if (b[i] == 13) break;
                var len = b[i + 16];
                var nul = Array.IndexOf(b, (byte)0, i, 11);
                var nameLen = nul < 0 ? 11 : nul - i;
                var name = Encoding.ASCII.GetString(b, i, nameLen);
                if (TextFields.Contains(name)) spans.Add((offset, len));
                offset += len;
            }
            int dos = 0, win = 0;
            for (uint r = 0; r < count; r++)
            {
                var rowStart = (long)header + r * width;
                if (rowStart + width > b.Length) break;
                foreach (var (s, l) in spans)
                {
                    for (var k = 0; k < l; k++)
                    {
                        var bt = b[rowStart + s + k];
                        if (Cp850Umlauts.Contains(bt)) dos++;
                        if (Cp1252Umlauts.Contains(bt)) win++;
                    }
                }
            }
            return win > dos ? "cp1252" : "cp850";
        }
        catch { return "cp850"; }
    }

    // --- praxen.py ---
    public static int PraxisNummer(object? roh)
    {
        if (roh is null) return 1;
        try
        {
            var n = roh switch
            {
                int i => i,
                long l => (int)l,
                double d => (int)d,
                string s => string.IsNullOrWhiteSpace(s) ? 0 : int.Parse(s.Trim()),
                _ => Convert.ToInt32(roh),
            };
            return n is >= 1 and <= 9 ? n : 1;
        }
        catch { return 1; }
    }

    public static HashSet<int>? ErlaubtePraxen(string? kopfwert)
    {
        if (kopfwert is null) return null;
        if (!PraxenKopfRe.IsMatch(kopfwert)) return [];
        return kopfwert.Split(',').Select(x => int.Parse(x.Trim())).ToHashSet();
    }

    public static string PraxisOrdner(string daten, int praxis)
    {
        var pfad = Path.Combine(daten, $"PRAX{praxis}");
        if (!Directory.Exists(pfad))
            throw new PraxisFehler($"Der Datenordner PRAX{praxis} von Praxis {praxis} fehlt im DS-Win-Bestand.");
        return pfad;
    }

    public static int PraxisVon(string daten, string patnr, string encoding)
    {
        var (f, rows, _) = DbfTabelle.Table(Path.Combine(daten, "patient.dbf"));
        var treffer = rows.Where(r => DbfTabelle.Active(r, f, encoding)
            && (Convert.ToString(DbfTabelle.Value(r, f, "PATNR", encoding)) ?? "") == patnr).ToList();
        if (treffer.Count != 1) throw new PraxisFehler("Patient fehlt oder ist nicht eindeutig.");
        return f.ContainsKey("PRAXIS") ? PraxisNummer(DbfTabelle.Value(treffer[0], f, "PRAXIS", encoding)) : 1;
    }

    public static List<Dictionary<string, object?>> PraxenListe(string daten, string encoding)
    {
        var zahl = new Dictionary<int, int>();
        try
        {
            var (pf, rows, _) = DbfTabelle.Table(Path.Combine(daten, "patient.dbf"));
            foreach (var r in rows)
            {
                if (!DbfTabelle.Active(r, pf, encoding)) continue;
                var n = pf.ContainsKey("PRAXIS") ? PraxisNummer(DbfTabelle.Value(r, pf, "PRAXIS", encoding)) : 1;
                zahl[n] = zahl.GetValueOrDefault(n) + 1;
            }
        }
        catch (IOException) { }
        var namen = new Dictionary<int, (string Name, string KzvNr)>();
        try
        {
            var praxdat = Path.Combine(daten, "PRAXDAT.DBF");
            if (File.Exists(praxdat))
            {
                var (f, prax, _) = DbfTabelle.Table(praxdat);
                for (var idx = 0; idx < Math.Min(9, prax.Count); idx++)
                {
                    var r = prax[idx];
                    var teile = new List<string>();
                    foreach (var k in new[] { "TITEL", "VORNAME", "NAME" })
                        if (f.ContainsKey(k)) teile.Add((Convert.ToString(DbfTabelle.Value(r, f, k, encoding)) ?? "").Trim());
                    var name = string.Join(" ", teile).Trim();
                    if (name.Length == 0 && f.ContainsKey("ANAME"))
                        name = (Convert.ToString(DbfTabelle.Value(r, f, "ANAME", encoding)) ?? "").Trim();
                    var kzv = "";
                    if (f.ContainsKey("ANUMMER"))
                    {
                        var anr = Convert.ToInt32(DbfTabelle.Value(r, f, "ANUMMER", encoding) ?? 0);
                        kzv = anr != 0 ? anr.ToString() : "";
                    }
                    namen[idx + 1] = (name, kzv);
                }
            }
        }
        catch { }

        var outList = new List<Dictionary<string, object?>>();
        for (var n = 1; n <= 9; n++)
        {
            var count = zahl.GetValueOrDefault(n);
            var hasDir = Directory.Exists(Path.Combine(daten, $"PRAX{n}"));
            if (count == 0 && !hasDir) continue;
            namen.TryGetValue(n, out var info);
            outList.Add(new Dictionary<string, object?>
            {
                ["nummer"] = n,
                ["name"] = info.Name ?? "",
                ["kzvNr"] = info.KzvNr ?? "",
                ["patienten"] = count,
                ["ordner"] = hasDir,
            });
        }
        return outList;
    }

    // --- sicherung.py ---
    public static long PlatzFrei(string pfad)
    {
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(pfad));
            return string.IsNullOrEmpty(root) ? -1 : new DriveInfo(root).AvailableFreeSpace;
        }
        catch { return -1; }
    }

    public static List<string> FesteLaufwerke()
    {
        var outList = new List<string>();
        if (!OperatingSystem.IsWindows()) return outList;
        var mask = GetLogicalDrives();
        for (var i = 0; i < 26; i++)
        {
            var b = (char)('A' + i);
            var lw = $"{b}:\\";
            if (((mask >> i) & 1) != 0 && GetDriveTypeW(lw) == 3) outList.Add(lw);
        }
        return outList;
    }

    public static long Dateigroesse(string praxis, string[]? tabellen = null)
    {
        long n = 0;
        foreach (var stem in tabellen ?? SicherungTabellen)
        {
            foreach (var suffix in new[] { ".DBF", ".cdx", ".FPT" })
            {
                var p = Path.Combine(praxis, stem + suffix);
                try { if (File.Exists(p)) n += new FileInfo(p).Length; } catch { }
            }
        }
        return n;
    }

    public static bool Beschreibbar(string ordner)
    {
        try
        {
            Directory.CreateDirectory(ordner);
            var probe = Path.Combine(ordner, ".planr-platz");
            File.WriteAllBytes(probe, "0"u8.ToArray());
            File.Delete(probe);
            return true;
        }
        catch { return false; }
    }

    public static string SicherungsOrdner(string standard, string praxis, string[]? tabellen = null)
    {
        if (File.Exists(Path.Combine(standard, "pending.json"))) return standard;
        var noetig = Dateigroesse(praxis, tabellen) * 2 + SicherungReserve;
        if (PlatzFrei(standard) >= noetig) return standard;
        var eigen = (Path.GetPathRoot(Path.GetFullPath(standard)) ?? "").ToLowerInvariant();
        var kandidaten = new List<(long Frei, string Ziel)>();
        foreach (var lw in FesteLaufwerke())
        {
            if (lw.ToLowerInvariant() == eigen) continue;
            var frei = PlatzFrei(lw);
            if (frei >= noetig) kandidaten.Add((frei, Path.Combine(lw, "PlanR-Sicherungen", "hkp")));
        }
        foreach (var (_, ziel) in kandidaten.OrderByDescending(k => k.Frei))
            if (Beschreibbar(ziel)) return ziel;
        return standard;
    }
}
