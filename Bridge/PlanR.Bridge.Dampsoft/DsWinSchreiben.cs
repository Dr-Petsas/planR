using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Dampsoft;

/// <summary>1:1-Port von notiz.py, befund_writer.py, hkp_writer.py, plan_writer.py und hkp_live.py.</summary>
public static class DsWinSchreiben
{
    public static readonly string[] Tables = ["HKPPLAN", "HKPPLAN2", "HKPLST", "BEFUND"];
    public static readonly byte[] Eor = [0xAA, 0x55, 0xCC, 0x33];
    static readonly byte[] Rnr = Encoding.ASCII.GetBytes("       0");

    static readonly Regex Beb4Re = new(@"^\d{4}$", RegexOptions.Compiled);
    static readonly Regex ZaFieldRe = new(@"^ZA[1-4][1-8]$", RegexOptions.Compiled);
    static readonly Regex AnalogRe = new(@"^(\d{4})a$", RegexOptions.Compiled);
    static readonly Regex AnalogCiRe = new(@"^(\d{4})a$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex Word4Re = new(@"[a-zäöüß]{4,}", RegexOptions.Compiled);

    static readonly Dictionary<string, int> PlanungArt = new(StringComparer.Ordinal) { ["kva"] = 2, ["mkv"] = 8 };
    static readonly Dictionary<string, string> ListenArt = new(StringComparer.Ordinal) { ["kva"] = "3", ["mkv"] = "4" };
    static readonly Dictionary<string, string> Label = new(StringComparer.Ordinal) { ["kva"] = "Kostenvoranschlag", ["mkv"] = "Mehrkostenvereinbarung" };
    static readonly HashSet<string> Upper = new(DsWinBefund.Teeth.Where(t => t[0] is '1' or '2'), StringComparer.Ordinal);
    static readonly Dictionary<char, byte> MkvMaterial = new() { ['I'] = 0xA0, ['Y'] = 0xA1, ['F'] = 0xA3 };
    static readonly Dictionary<string, string> MkvGoz = new(StringComparer.Ordinal)
    {
        ["2060"] = "2060mk", ["2080"] = "2080mk", ["2100"] = "2100mk", ["2120"] = "2120mk",
        ["2150"] = "2150mk", ["2160"] = "2160mk", ["2170"] = "2170mk",
    };
    static readonly HashSet<string> Zuschlag = new(StringComparer.Ordinal) { "0110", "0120", "0500", "0510", "0520", "0530" };
    static readonly Dictionary<string, double> Punktwert = new(StringComparer.Ordinal) { ["GOZ"] = 0.0562421, ["GOAE"] = 0.0582873 };
    static readonly int[] BebKandidaten = [4, 3, 5, 6, 7, 8, 9];
    static readonly Dictionary<int, string> ListenName = new()
    {
        [3] = "BEB", [4] = "BEB 97", [5] = "BEB 1", [6] = "BEB 2", [7] = "BEB 3", [8] = "BEB 4", [9] = "BEB 5",
    };

    const string Kommentar = "komen1";
    const int MemoZeile = 100;
    const int MemoBreite = 200;

    static readonly Dictionary<string, object?> CommonHead = new(StringComparer.Ordinal)
    {
        ["DEQ_PLAN"] = "T", ["MWST1"] = "N", ["MWST2"] = "N", ["OSTAB35"] = "N", ["WAEHRUNG"] = 1, ["WNA"] = "N",
        ["LABTYPKASS"] = 2, ["LABTYPAUSF"] = 2, ["LABTYPKF"] = 2, ["LABTYPAF"] = 2, ["LABTYPPRIV"] = 2, ["LABTYPPRIF"] = 2,
        ["PREISPRIV"] = 1, ["PREISPRIVF"] = 1, ["PREISKASS"] = 1, ["PREISKASSF"] = 1, ["PREISAUSF"] = 1, ["PREISAUSFF"] = 1,
    };

    static readonly string[] ZeroHeadKva = ["PVM"];
    static readonly string[] ZeroHeadMkv = BuildZeroHeadMkv();
    static string[] BuildZeroHeadMkv()
    {
        var l = new List<string>
        {
            "AB1", "AB2", "AB3", "AB4", "AB5", "AB6", "AB7", "AB8", "AB9", "AB10", "AB11", "AB12", "ABDSUMME", "ALTER",
        };
        for (var i = 1; i <= 7; i++) l.Add($"AKOST_{i}");
        for (var i = 1; i <= 7; i++) l.Add($"KKOST_{i}");
        for (var i = 1; i <= 15; i++) l.Add($"FZ{i}");
        l.AddRange([
            "BEGLEIT", "BEGLEITE", "BEGLEITF", "BILDQUELLE", "EXTRAKASS", "FFORMA", "FFORMK", "FGOLDA", "FGOLDK", "FLABA", "FLABK",
            "GOLDE", "GOLDF", "GVDM", "GVGES", "GVMATLAB", "HKPTEIL1", "HKPTEIL2", "LABOR1", "LABOR2", "LABOR3", "LABOR4",
            "LABORAUSW", "LABORE", "LSTART", "MEHRLAB", "MEHRLABF", "MKVABFORM", "MKVABFORMF", "MKVKASSE", "MKVLABOR", "MKVLABORF",
            "MKVLEIST", "MKVLEISTF", "MKVMETALL", "MKVMETALLF", "NLBWINS", "NLDM", "NLSUMME4", "PABFORM", "PABFORMF", "PGESAMT",
            "PKTSUMME", "PLABOR", "PLABORF", "PLEIST", "PLEISTF", "PMETALL", "PMETALLF", "PROZENT", "PVM", "PVMP", "PZAHNHON",
            "PZAHNHONP", "STIFTELAB", "STIFTELABN", "THNR", "VERS_DM", "VORSUM", "WUERZBURG", "WUERZLAB",
        ]);
        return [.. l];
    }

    static readonly Dictionary<string, byte[]> RawHeadMkv = new(StringComparer.Ordinal)
    {
        ["GVDM"] = Encoding.ASCII.GetBytes("     .  "),
        ["GVGES"] = Encoding.ASCII.GetBytes("     .  "),
        ["NLDM"] = Encoding.ASCII.GetBytes("     .  "),
        ["AB12"] = Encoding.ASCII.GetBytes("     .  "),
        ["GVMATLAB"] = Encoding.ASCII.GetBytes("     .00"),
    };

    static readonly Dictionary<(string, string), string[]> ZeroRow = new()
    {
        [("kva", "Z+")] = ["ABZUG", "AUFSCHLAG", "BEWZAHL", "D_ANZAHL", "PATINFO_PK", "SUMME"],
        [("mkv", "Z+")] = ["ABZUG", "AUFSCHLAG", "BEWZAHL", "D_ANZAHL", "LABORBEHA", "MWST", "PATINFO_PK", "PREISLISTE", "PSRID", "SUMME"],
        [("mkv", "Z-")] = ["AUFSCHLAG", "BETRAG", "D_ANZAHL", "EINFACH", "FAKTOR", "LABORBEHA", "MWST", "PATINFO_PK", "PREIS", "PREISLISTE", "PSRID"],
        [("mkv", "L-")] = ["AUFSCHLAG", "BETRAG", "BEWZAHL", "D_ANZAHL", "EINFACH", "FAKTOR", "LABORBEHA", "MWST", "PATINFO_PK", "PREIS", "SUMME"],
        [("mkv", "F-")] = ["AUFSCHLAG", "BETRAG", "BEWZAHL", "D_ANZAHL", "EINFACH", "FAKTOR", "LABORBEHA", "MWST", "PATINFO_PK", "PREIS", "SUMME"],
    };

    static readonly Dictionary<string, object?> KvaHead = new(StringComparer.Ordinal) { ["BILDQUELLE"] = 2 };
    static readonly Dictionary<string, object?> MkvHead = new(StringComparer.Ordinal)
    {
        ["EHKP"] = "N", ["BEHABEGON"] = "N", ["FORTG"] = "N", ["EXML"] = "N", ["FTYP"] = 1, ["FESTMODUS"] = "2",
        ["ABDBERECHN"] = "J", ["ABDGBLAU"] = new string('N', 32), ["PALLAD"] = "N", ["UNFALL"] = "N", ["UNBRAUCH"] = "N",
        ["VERSORG"] = "N", ["INTER"] = "N", ["IMMED"] = "N", ["HKP_OK"] = "F", ["HKP_UK"] = "F", ["D"] = "N",
        ["KASSENANT"] = 65, ["BONUS"] = "M", ["TEILLSTG"] = "N", ["MWSTKMET"] = "N", ["PRIVABD"] = "N",
        ["HLAND"] = "Deutschland", ["GUEB"] = "N", ["MEHRBEHA"] = "N", ["HKP24"] = "J", ["MB"] = "J",
    };

    static double RoundPy(double v, int digits) => Math.Round(v, digits, MidpointRounding.ToEven);
    static int RoundIntPy(double v) => (int)Math.Round(v, 0, MidpointRounding.ToEven);

    static double Dbl(Dictionary<string, object?> d, string key, double def = 0.0) =>
        d.TryGetValue(key, out var v) && v is not null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : def;

    static string Str(Dictionary<string, object?> d, string key, string def = "") =>
        d.TryGetValue(key, out var v) && v is not null ? Convert.ToString(v, CultureInfo.InvariantCulture) ?? def : def;

    static bool IsDigits(string s) => s.Length > 0 && s.All(c => c is >= '0' and <= '9');

    static string TokenHex(int numBytes) => Convert.ToHexString(RandomNumberGenerator.GetBytes(numBytes)).ToLowerInvariant();

    static byte[] Blank(Dictionary<string, DbfField> fields, int width)
    {
        var row = new byte[width];
        Array.Fill(row, (byte)' ');
        foreach (var (_, f) in fields)
            if (f.Kind is 'B' or 'M')
                Array.Clear(row, f.Offset, f.Length);
        return row;
    }

    // -------------------------------------------------------------------------
    // notiz.py
    // -------------------------------------------------------------------------

    public static List<string> Bloecke(string? text, int breite, string encoding)
    {
        var roh = string.Join(" ", (text ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (roh.Length == 0) throw new EditError("Der Dokumentationstext fehlt.");
        try { DsWinPfad.EncodingByName(encoding, strict: true).GetBytes(roh); }
        catch (EncoderFallbackException) { throw new EditError("Der Text ist in DS-Win nicht darstellbar."); }
        var zeilen = new List<string>();
        while (roh.Length > 0)
        {
            if (roh.Length <= breite) { zeilen.Add(roh); break; }
            var limit = Math.Min(breite, roh.Length - 1);
            var schnitt = roh.LastIndexOf(' ', limit);
            if (schnitt <= 0) schnitt = breite;
            zeilen.Add(roh[..schnitt].TrimEnd());
            roh = roh[schnitt..].TrimStart();
        }
        if (zeilen.Count > 40) throw new EditError("Der Text ist länger als 40 Zeilen.");
        return zeilen;
    }

    public static Dictionary<string, object?> SaveNotiz(
        string patient, string? text, string root, string encoding, string? datum = null, string? uhrzeit = null, string? dllPath = null)
    {
        if (string.IsNullOrEmpty(patient) || !IsDigits(patient) || patient.Length > 5)
            throw new EditError("Ungültige Patientennummer.");
        var path = Path.Combine(root, "daten", "NOTIZEN.DBF");
        if (!File.Exists(path))
            throw new EditError("NOTIZEN fehlt in dieser DS-Win-Installation.");
        var zeilen = Bloecke(text, 80, encoding);
        var jetzt = DateTime.Now;
        var tag = string.IsNullOrEmpty(datum) ? jetzt.ToString("yyyyMMdd", CultureInfo.InvariantCulture) : datum;
        var zeit = string.IsNullOrEmpty(uhrzeit) ? jetzt.ToString("HH:mm", CultureInfo.InvariantCulture) : uhrzeit;
        if (tag.Length != 8 || !IsDigits(tag) || zeit.Length != 5)
            throw new EditError("Datum oder Uhrzeit ist ungültig.");
        var (fields, _, width) = DbfTabelle.Table(path);
        var blank = new byte[width];
        Array.Fill(blank, (byte)' ');
        using var app = new DsWinAppender(dllPath ?? DsWinEngine.ResolveDll(root), encoding);
        var handle = app.Open(path);
        for (var i = 0; i < zeilen.Count; i++)
        {
            app.Put(handle, fields, blank, new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["PATNR"] = patient, ["DATUM"] = tag, ["UHRZEIT"] = zeit, ["COUNT"] = i + 1,
                ["NOTIZ"] = zeilen[i], ["TEXTNR"] = 0, ["SHOW"] = "J",
            });
        }
        app.Verify(handle);
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["patient"] = patient, ["datum"] = tag, ["uhrzeit"] = zeit, ["zeilen"] = zeilen.Count,
        };
    }

    // -------------------------------------------------------------------------
    // befund_writer.py
    // -------------------------------------------------------------------------

    public static Dictionary<string, object?> SaveFinding(
        string patient, JsonElement payload, string root, string encoding, string backupRoot, bool dummy = false, string? dllPath = null)
    {
        var blocker = DsWinPfad.WriteBlocker(root);
        if (blocker is not null) throw new EditUnavailable(blocker);
        if (string.IsNullOrEmpty(patient) || !IsDigits(patient) || patient.Length > 5)
            throw new EditError("Ungültige Patientennummer.");
        var daten = Path.Combine(root, "daten");
        var patientPath = Path.Combine(daten, "patient.dbf");
        var praxis = DsWinPfad.PraxisVon(daten, patient, encoding);
        var path = Path.Combine(daten, $"PRAX{praxis}", "BEFUND.DBF");
        var parentPath = Path.Combine(daten, $"PRAX{praxis}", "HKPPLAN.DBF");
        var (pf, patients, _) = DbfTabelle.Table(patientPath);
        var selected = new List<(int RecNo, byte[] Row)>();
        for (var i = 0; i < patients.Count; i++)
            if (DbfTabelle.Active(patients[i], pf, encoding) && Convert.ToString(DbfTabelle.Value(patients[i], pf, "PATNR", encoding)) == patient)
                selected.Add((i + 1, patients[i]));
        if (selected.Count != 1) throw new EditConflict("Patient fehlt oder ist nicht eindeutig.");
        var patientRecno = selected[0].RecNo;
        Directory.CreateDirectory(backupRoot);
        var pending = Path.Combine(backupRoot, "pending.json");
        if (File.Exists(pending))
            throw new EditUnavailable("Vorheriges Befund-Speicherergebnis ist ungeprüft. Sicherungsprotokoll prüfen.");

        var app = new DsWinAppender(dllPath ?? DsWinEngine.ResolveDll(root), encoding);
        var committing = false;
        string? journal = null;
        var info = new Dictionary<string, object?>(StringComparer.Ordinal);
        try
        {
            using var l1 = new DsWinLocks.AppLock(patientPath, patientRecno);
            using var l2 = new DsWinLocks.AppLock(parentPath, 1);
            var handle = app.Open(path);
            if (app.E.LockAll(handle) != 0)
                throw new EditConflict("DS-Win speichert gerade Befunde. Bitte erneut versuchen.");
            using var notifyPatient = new DsWinLocks.TimNotify(patientPath);
            using var notifyHkp = new DsWinLocks.TimNotify(parentPath);

            var (fields, rows, width) = DbfTabelle.Table(path);
            var selectedTeeth = new List<string>();
            var payloadDict = JsonObjToDict(payload);
            var (recno, before, wanted) = DsWinBefund.PrepareFinding(fields, rows, width, patient, payloadDict, encoding, selectedTeeth, DsWinBefund.FindingCodes(root));
            if (app.E.RecordWidth(handle) != width || app.E.Go(handle, recno, 1) != 0 || !app.E.ReadRecordBytes(handle, width).SequenceEqual(before))
                throw new EditConflict("Befund wurde während des Lesens geändert.");
            var key = Encoding.ASCII.GetBytes(patient.PadLeft(5, ' '));
            var patField = fields["PATNR"];
            if (!before.AsSpan(patField.Offset, patField.Length).SequenceEqual(key))
                throw new EditUnavailable("Patientenschlüssel hat ein unbekanntes Format.");
            var maxPk = rows.Count == 0 ? 0 : rows.Max(r => Convert.ToInt32(DbfTabelle.Value(r, fields, "PK", encoding) ?? 0));
            var number = Math.Max(1 + maxPk, (int)app.E.CounterGet(handle));
            var sources = new List<byte[]>();
            if (!DsWinBefund.InHistory(fields, rows, patient, before, encoding)) sources.Add(before);
            sources.Add(wanted);
            var historyIds = Enumerable.Range(0, sources.Count).Select(i => number + i).ToList();

            var operation = DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + "-" + TokenHex(6);
            var folder = Path.Combine(backupRoot, operation);
            Directory.CreateDirectory(folder);
            foreach (var suffix in new[] { ".DBF", ".cdx" })
            {
                var src = Path.ChangeExtension(path, suffix);
                File.WriteAllBytes(Path.Combine(folder, Path.GetFileName(src)), DbfTabelle.ReadBytesShared(src));
            }
            File.WriteAllBytes(Path.Combine(folder, "current-before.bin"), before);
            journal = Path.Combine(folder, "operation.json");
            info = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["state"] = "prepared", ["patient"] = patient, ["source"] = path, ["record"] = recno,
                ["operation"] = operation, ["dummy"] = dummy, ["historyIds"] = historyIds,
            };
            File.WriteAllText(journal, JsonSerializer.Serialize(info), Encoding.UTF8);
            var today = DateOnly.FromDateTime(DateTime.Now);
            var date = today.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
            info["state"] = "committing";
            File.WriteAllText(journal, JsonSerializer.Serialize(info), Encoding.UTF8);
            File.WriteAllText(pending, JsonSerializer.Serialize(new { journal }), Encoding.UTF8);
            committing = true;

            for (var i = 0; i < sources.Count; i++)
            {
                app.Put(handle, fields, sources[i], new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["PK"] = historyIds[i], ["BEFTYP"] = "0", ["DATUM"] = date, ["GEBNR"] = "BEFUND", ["PATINFO_PK"] = 0,
                });
            }
            if (app.E.Go(handle, recno, 1) != 0)
                throw new EditUnavailable("Aktueller Befund kann nicht geladen werden.");
            foreach (var (name, f) in fields)
            {
                var raw = wanted.AsSpan(f.Offset, f.Length);
                if (!raw.SequenceEqual(before.AsSpan(f.Offset, f.Length)))
                {
                    var target = app.E.Field(handle, name);
                    if (target == IntPtr.Zero) throw new EditUnavailable("Befundfeld fehlt.");
                    app.E.Assign(target, raw.ToArray());
                    if (app.E.Error(app.Ctx) != 0) throw new EditUnavailable("Befundfeld konnte nicht gesetzt werden.");
                }
            }
            if (app.E.Write(handle, -1, 0, 1) != 0)
                throw new EditUnavailable("Befund konnte nicht gespeichert werden.");
            app.Verify(handle);

            var (actualFields, actualRows, actualWidth) = DbfTabelle.Table(path);
            if (!FieldsEqual(actualFields, fields) || actualWidth != width || actualRows.Count != rows.Count + sources.Count)
                throw new EditUnavailable("Befundstruktur oder Datensatzanzahl stimmt nicht.");
            for (var i = 0; i < rows.Count; i++)
            {
                var exp = i == recno - 1 ? wanted : rows[i];
                if (!actualRows[i].SequenceEqual(exp))
                    throw new EditUnavailable("Aktueller Befund oder andere Datensätze weichen ab.");
            }
            var todayIso = today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            for (var i = 0; i < sources.Count; i++)
            {
                var newRow = actualRows[rows.Count + i];
                var srcRow = sources[i];
                var pk = historyIds[i];
                var changes = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["PK"] = (double)pk, ["BEFTYP"] = "0", ["DATUM"] = todayIso, ["GEBNR"] = "BEFUND", ["PATINFO_PK"] = 0.0,
                };
                foreach (var name in fields.Keys)
                {
                    var got = DbfTabelle.Value(newRow, fields, name, encoding);
                    var exp = changes.TryGetValue(name, out var cv) ? cv : DbfTabelle.Value(srcRow, fields, name, encoding);
                    if (!ValuesEqual(got, exp))
                        throw new EditUnavailable("Befundhistorie konnte nicht bestätigt werden.");
                }
            }
            notifyPatient.Notify();
            notifyHkp.Notify();
            var result = DsWinBefund.ReadFindings(daten, patient, praxis, encoding);
            info["state"] = "committed";
            File.WriteAllText(journal, JsonSerializer.Serialize(info), Encoding.UTF8);
            File.Delete(pending);
            committing = false;
            var outDict = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["selectedTeeth"] = selectedTeeth, ["saved"] = true, ["id"] = historyIds[^1], ["dummy"] = dummy,
                ["backup"] = operation, ["version"] = result["version"], ["loadVerified"] = false,
                ["message"] = "Befund geändert (ohne 01, ohne Abrechnung) und aktueller Zahnstatus gespeichert. In DS-Win den Patienten beziehungsweise akt. Befund erneut öffnen.",
            };
            foreach (var (k, v) in result) outDict[k] = v;
            return outDict;
        }
        catch
        {
            if (committing && journal is not null)
            {
                info["state"] = "verification-required";
                File.WriteAllText(journal, JsonSerializer.Serialize(info), Encoding.UTF8);
                throw new EditUnavailable("Befund-Speicherergebnis nicht vollständig bestätigt. Nicht erneut klicken; Befund und Sicherungsprotokoll prüfen.");
            }
            throw;
        }
        finally
        {
            app.Dispose();
        }
    }

    static Dictionary<string, object?> JsonObjToDict(JsonElement el)
    {
        var d = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (el.ValueKind != JsonValueKind.Object) return d;
        foreach (var p in el.EnumerateObject())
            d[p.Name] = JsonToObj(p.Value);
        return d;
    }

    static object? JsonToObj(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Object => JsonObjToDict(el),
        JsonValueKind.Array => el.EnumerateArray().Select(JsonToObj).ToList(),
        JsonValueKind.String => el.GetString(),
        JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null,
    };

    static bool FieldsEqual(Dictionary<string, DbfField> a, Dictionary<string, DbfField> b) =>
        a.Count == b.Count && a.All(kv => b.TryGetValue(kv.Key, out var fv) && fv == kv.Value);

    static bool ValuesEqual(object? a, object? b)
    {
        if (a is null && b is null) return true;
        if (a is null || b is null) return false;
        if (a is double da && b is double db) return da == db;
        if (a is byte[] ba && b is byte[] bb) return ba.SequenceEqual(bb);
        return Equals(a, b);
    }

    // -------------------------------------------------------------------------
    // hkp_writer.py
    // -------------------------------------------------------------------------

    public static (List<Dictionary<string, object?>> Rows, Dictionary<string, int> Changes, List<string> Notes) LaborPlanen(
        List<Dictionary<string, object?>> positions, DsWinLabor.Listen listen, Dictionary<string, object?> header)
    {
        var lab = new Dictionary<(string, string), HashSet<string>>();
        foreach (var p in positions)
        {
            var lv = Str(p, "level");
            if (lv is "BEL" or "BEB")
            {
                var key = (Str(p, "tooth"), Str(p, "lab"));
                if (!lab.TryGetValue(key, out var s)) lab[key] = s = new HashSet<string>(StringComparer.Ordinal);
                s.Add(lv);
            }
        }
        var rows = new List<Dictionary<string, object?>>();
        var notes = new List<string>();
        var sections = new Dictionary<(string, string), List<Dictionary<string, object?>>>();
        foreach (var p in positions)
        {
            var lv = Str(p, "level");
            if (lv is "BEMA" or "GOZ")
            {
                var r = new Dictionary<string, object?>(p, StringComparer.Ordinal)
                {
                    ["kind"] = "Z", ["planart"] = lv == "BEMA" ? "1" : "3", ["fee"] = Str(p, "number"),
                };
                rows.Add(r);
                continue;
            }
            var kind = Str(p, "lab") == "eigen" ? "L" : "F";
            string planart;
            string? fee;
            if (lv == "BEL")
            {
                var nr = Str(p, "number");
                planart = "1";
                fee = Beb4Re.IsMatch(nr) ? nr[..3] + "-" + nr[3] : nr;
            }
            else if (lv == "BEB") { planart = "3"; fee = "5" + Str(p, "number"); }
            else
            {
                var k = (Str(p, "tooth"), Str(p, "lab"));
                var levels = lab.TryGetValue(k, out var set) && set.Count > 0
                    ? set
                    : lab.Where(kv => kv.Key.Item2 == Str(p, "lab")).SelectMany(kv => kv.Value).ToHashSet(StringComparer.Ordinal);
                planart = levels.Contains("BEB") && !levels.Contains("BEL") ? "3" : "1";
                fee = null;
            }
            var row = new Dictionary<string, object?>(p, StringComparer.Ordinal)
            {
                ["kind"] = kind, ["planart"] = planart, ["fee"] = fee,
            };
            rows.Add(row);
            var sk = (planart, kind);
            if (!sections.TryGetValue(sk, out var list)) sections[sk] = list = [];
            list.Add(row);
        }

        var changes = new Dictionary<string, int>(StringComparer.Ordinal);
        var missing = new List<string>();
        var notOwn = new List<string>();
        foreach (var ((planart, kind), items) in sections)
        {
            var field = DsWinLabor.Header[(planart, kind)];
            var preferred = header.TryGetValue(field, out var hv) && hv is not null ? Convert.ToInt32(hv, CultureInfo.InvariantCulture) : 0;
            var bel = items.Where(r => Str(r, "level") == "BEL").Select(r => Str(r, "fee")).ToList();
            var beb = items.Where(r => Str(r, "level") == "BEB").Select(r => Str(r, "fee")).ToList();
            var belList = listen.ListeFuer(bel, preferred, DsWinLabor.BelLists);
            int? bebList = beb.Count > 0 ? listen.ListeFuer(beb, preferred, DsWinLabor.BebLists) : null;
            var sectionList = bebList ?? belList;
            changes[field] = sectionList;
            foreach (var r in items)
            {
                var lv = Str(r, "level");
                var labtyp = lv == "BEB" ? bebList!.Value : lv == "BEL" ? belList : sectionList;
                r["labtyp"] = labtyp;
                if (lv == "MAT")
                {
                    var txt = Str(r, "text");
                    var (code, reason) = listen.Material(txt, labtyp);
                    if (string.IsNullOrEmpty(code))
                    {
                        missing.Add($"{(txt.Length > 0 ? txt : "Material")} ({reason})");
                        r["skip"] = true;
                        continue;
                    }
                    r["fee"] = code;
                }
                var fee = Str(r, "fee");
                var codesMap = listen.Codes(labtyp);
                if (!codesMap.TryGetValue(fee.ToUpperInvariant(), out var entry))
                    missing.Add($"{fee} nicht in {listen.Name(labtyp)}");
                else if (kind == "L" && !entry.Eigen)
                    notOwn.Add(fee);
            }
        }
        rows = rows.Where(r => !r.TryGetValue("skip", out var sk) || sk is not true).ToList();
        if (missing.Count > 0)
            notes.Add("Laborzeilen nur in der Summe Material und Labor bzw. ohne Listeneintrag: " + string.Join("; ", missing) + ". Kürzel in dswin_laborzuordnung.json hinterlegen oder in DS-Win nachtragen.");
        if (notOwn.Count > 0)
            notes.Add("In der DS-Win-Liste nicht als Eigenlabor gekennzeichnet: " + string.Join(", ", notOwn.Distinct(StringComparer.Ordinal)) + ".");
        return (rows, changes, notes);
    }

    public static Dictionary<string, object?> KopfSummen(Dictionary<string, object?> importData, List<Dictionary<string, object?>> rows)
    {
        var rate = 1.0 + Dbl(importData, "labRate", 0.07);
        double Net(string planart, string kind, bool material) =>
            RoundPy(rows.Where(r => Str(r, "planart") == planart && Str(r, "kind") == kind && (Str(r, "level") == "MAT") == material)
                .Sum(r => Dbl(r, "amount")), 2);

        var outMap = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (kind, suffix) in new[] { ("L", ""), ("F", "F") })
        {
            var leist = RoundPy(Net("3", kind, false) * rate, 2);
            var metall = RoundPy(Net("3", kind, true) * rate, 2);
            outMap["PLEIST" + suffix] = leist;
            outMap["PMETALL" + suffix] = metall;
            outMap["PLABOR" + suffix] = RoundPy(leist + metall, 2);
        }
        var goz = Dbl(importData, "gozHonorar");
        var bema = Dbl(importData, "bemaHonorar");
        var matlab = Dbl(importData, "materialUndLabor");
        var labFremd = Dbl(importData, "labFremd");
        var bemaRows = rows.Where(r => Str(r, "level") == "BEMA").ToList();
        if (bemaRows.Count > 0 && bemaRows.All(r => r.ContainsKey("points")))
        {
            var totalPoints = RoundPy(bemaRows.Sum(r => Dbl(r, "points")), 2);
            outMap["PKTSUMME"] = totalPoints;
            outMap["NLSUMME4"] = totalPoints;
            outMap["NLBWINS"] = totalPoints;
            outMap["PKTWERT"] = Dbl(bemaRows[0], "pointValue");
            outMap["PKTWERTV"] = Dbl(bemaRows[0], "pointValue");
        }
        var plabor = Convert.ToDouble(outMap["PLABOR"], CultureInfo.InvariantCulture);
        var plaborf = Convert.ToDouble(outMap["PLABORF"], CultureInfo.InvariantCulture);
        outMap["LABORE"] = RoundIntPy(plabor);
        outMap["LABOR1"] = RoundIntPy(plaborf);
        outMap["LABOR2"] = 0;
        outMap["LABOR3"] = 0;
        outMap["LABOR4"] = 0;
        outMap["PZAHNHON"] = goz;
        outMap["PGESAMT"] = RoundPy(goz + plabor + plaborf, 2);
        outMap["FLABA"] = Net("1", "F", false);
        outMap["FGOLDA"] = Net("1", "F", true);
        outMap["FLABK"] = Net("1", "L", false);
        outMap["FGOLDK"] = Net("1", "L", true);
        outMap["FGOLD"] = 0;
        outMap["GVDM"] = bema;
        outMap["NLDM"] = bema;
        outMap["AB6"] = RoundIntPy(goz);
        outMap["GVMATLAB"] = RoundIntPy(matlab);
        outMap["GVGES"] = RoundPy(bema + RoundIntPy(goz) + RoundIntPy(matlab), 2);
        outMap["FZLINKS"] = RoundPy(bema + RoundIntPy(goz) + RoundIntPy(matlab), 2);
        outMap["VORSUM"] = Dbl(importData, "subsidy");
        outMap["AB2"] = labFremd;
        outMap["AB3"] = RoundPy(matlab - labFremd, 2);
        outMap["AKOST_1"] = bema;
        for (var i = 2; i <= 6; i++) outMap[$"AKOST_{i}"] = 0;
        for (var i = 1; i <= 6; i++) outMap[$"KKOST_{i}"] = 0;
        return outMap;
    }

    public static Dictionary<string, object?> StagePlan(
        string praxis, string stage, string dll, string patient, string encoding, Dictionary<string, object?>? importData = null)
    {
        var (fields, plans, _) = DbfTabelle.Table(Path.Combine(stage, "HKPPLAN.DBF"));
        var number = 1 + (plans.Count == 0 ? 0 : plans.Max(r => Convert.ToInt32(DbfTabelle.Value(r, fields, "HKPNR", encoding) ?? 0)));
        if (number > 999999) throw new HkpError("HKP-Nummern aufgebraucht.");
        var (mf, mr, _) = DbfTabelle.Table(Path.Combine(praxis, "HKPPLANM.DBF"));
        var available = new List<(int Rec, byte[] Row)>();
        for (var i = 0; i < mr.Count; i++)
            if (DbfTabelle.Active(mr[i], mf, encoding) && Convert.ToInt32(DbfTabelle.Value(mr[i], mf, "PLANUNGART", encoding) ?? 0) == 19)
                available.Add((i + 1, mr[i]));
        if (available.Count == 0) throw new HkpError("Kein passender Muster-HKP vorhanden.");
        var (_, template) = available[RandomNumberGenerator.GetInt32(available.Count)];
        var templateNumber = Convert.ToInt32(DbfTabelle.Value(template, mf, "HKPNR", encoding) ?? 0);
        var date = DateTime.Now.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var title = "TEST API " + TokenHex(3).ToUpperInvariant();
        var daten = Path.GetDirectoryName(praxis)!;
        var (pf, patients, _) = DbfTabelle.Table(Path.Combine(daten, "patient.dbf"));
        var matches = patients.Where(r => DbfTabelle.Active(r, pf, encoding) && Convert.ToString(DbfTabelle.Value(r, pf, "PATNR", encoding)) == patient).ToList();
        if (matches.Count != 1) throw new HkpError("Patient nicht eindeutig gefunden.");
        var patientRow = matches[0];

        List<Dictionary<string, object?>> labRows = [];
        Dictionary<string, int> labHeader = new(StringComparer.Ordinal);
        List<string> labNotes = [];
        if (importData is not null)
        {
            var headerVals = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var k in DsWinLabor.Header.Values)
                if (mf.ContainsKey(k)) headerVals[k] = DbfTabelle.Value(template, mf, k, encoding);
            (labRows, labHeader, labNotes) = LaborPlanen(
                (List<Dictionary<string, object?>>)importData["positions"]!,
                new DsWinLabor.Listen(daten, encoding), headerVals);
        }

        using var app = new DsWinAppender(dll, encoding);
        var mapping = new (string Dest, string? Src)[]
        {
            ("HKPLST", "HKPLSTM"), ("BEFUND", "BEFUNDM"), ("HKPPLAN2", null), ("HKPPLAN", "HKPPLANM"),
        };
        foreach (var (destName, sourceName) in mapping)
        {
            var (df, dr, width) = DbfTabelle.Table(Path.Combine(stage, destName + ".DBF"));
            var pk = 1 + (dr.Count == 0 ? 0 : dr.Max(r => Convert.ToInt32(DbfTabelle.Value(r, df, "PK", encoding) ?? 0)));
            var dst = app.Open(Path.Combine(stage, destName + ".DBF"));
            pk = Math.Max(pk, (int)app.E.CounterGet(dst));

            IntPtr src = IntPtr.Zero;
            var selected = new List<(int? SourceRec, byte[] Row, Dictionary<string, object?> ImportChanges)>();
            if (sourceName is not null)
            {
                var (sf, sr, sw) = DbfTabelle.Table(Path.Combine(praxis, sourceName + ".DBF"));
                if (!FieldsEqual(sf, df) || sw != width) throw new HkpError("Musterstruktur unterscheidet sich.");
                foreach (var suffix in new[] { ".DBF", ".cdx", ".FPT" })
                {
                    var orig = Path.Combine(praxis, sourceName + suffix);
                    if (File.Exists(orig)) File.WriteAllBytes(Path.Combine(stage, Path.GetFileName(orig)), DbfTabelle.ReadBytesShared(orig));
                }
                src = app.Open(Path.Combine(stage, sourceName + ".DBF"));
                for (var i = 0; i < sr.Count; i++)
                    if (DbfTabelle.Active(sr[i], sf, encoding) && Convert.ToInt32(DbfTabelle.Value(sr[i], sf, "HKPNR", encoding) ?? 0) == templateNumber)
                        selected.Add((i + 1, sr[i], new Dictionary<string, object?>(StringComparer.Ordinal)));

                if (destName == "HKPLST" && importData is not null)
                {
                    var groups = new Dictionary<string, List<(int Rec, byte[] Row)>>(StringComparer.Ordinal);
                    foreach (var (srec, srow, _) in selected)
                    {
                        var kind = Convert.ToString(DbfTabelle.Value(srow, sf, "LST_ART", encoding)) ?? "";
                        var gk = kind is "L" or "F" ? "LAB" : kind;
                        if (!groups.TryGetValue(gk, out var list)) groups[gk] = list = [];
                        list.Add((srec!.Value, srow));
                    }
                    selected = [];
                    var ordinals = new Dictionary<(string, string), int>();
                    var findings = ((List<Dictionary<string, object?>>)importData["findings"]!)
                        .Select(f => new Dictionary<string, object?>(f, StringComparer.Ordinal)
                        {
                            ["level"] = "Festzuschuss", ["kind"] = "N", ["planart"] = "5", ["fee"] = Str(f, "number"),
                        }).ToList();
                    var pointValue = labRows.Where(r => r.ContainsKey("pointValue")).Select(r => Dbl(r, "pointValue")).FirstOrDefault();
                    foreach (var position in labRows.Concat(findings))
                    {
                        var kind = Str(position, "kind");
                        var planart = Str(position, "planart");
                        var gk = kind is "L" or "F" ? "LAB" : kind;
                        if (!groups.TryGetValue(gk, out var candidates) || candidates.Count == 0)
                            throw new HkpError("Muster-HKP enthält keine passende " + Str(position, "level") + "-Zeilenstruktur.");
                        var ok = (kind, planart);
                        var ordinal = ordinals.GetValueOrDefault(ok, 0);
                        ordinals[ok] = ordinal + 1;
                        var (srec, srow) = candidates[ordinal % candidates.Count];
                        var imp = new Dictionary<string, object?>(StringComparer.Ordinal)
                        {
                            ["LST_ART"] = kind, ["PLANART"] = planart, ["LFD_NR"] = ordinal,
                            ["GEBNR"] = Str(position, "fee"), ["ANZAHL"] = Dbl(position, "count"),
                            ["ZAHN"] = Str(position, "tooth"), ["PREIS"] = Dbl(position, "price"),
                            ["BETRAG"] = Dbl(position, "amount"),
                        };
                        var calc = new Dictionary<string, object?>(StringComparer.Ordinal)
                        {
                            ["BEWZAHL"] = 0, ["SUMME"] = 0, ["EINFACH"] = 0, ["FAKTOR"] = 0,
                            ["SIGN"] = (kind, planart) == ("Z", "3") ? "+" : "-",
                            ["ART"] = (kind, planart) == ("Z", "3") ? "ZE" : "",
                        };
                        if (Str(position, "level") == "BEMA" && position.ContainsKey("points"))
                        {
                            calc["BEWZAHL"] = RoundPy(Dbl(position, "points") / Dbl(position, "count"), 2);
                            calc["SUMME"] = Dbl(position, "points");
                            calc["FAKTOR"] = Dbl(position, "pointValue");
                        }
                        else if (Str(position, "level") == "GOZ")
                        {
                            var factor = position.ContainsKey("factor") ? Dbl(position, "factor", 2.3) : 2.3;
                            calc["FAKTOR"] = factor;
                            calc["EINFACH"] = RoundPy(Dbl(position, "price") / factor, 2);
                        }
                        else if (kind is "L" or "F" && planart == "1")
                            calc["FAKTOR"] = pointValue;
                        foreach (var (k, v) in calc) if (sf.ContainsKey(k)) imp[k] = v;
                        if (kind is "L" or "F")
                        {
                            imp["LABTYP"] = Convert.ToString(position["labtyp"], CultureInfo.InvariantCulture) ?? "0";
                            imp["VERLLST"] = "";
                            imp["PREISLISTE"] = 1;
                        }
                        else imp["VERLLST"] = kind == "N" ? "" : "N";
                        selected.Add((srec, srow, imp));
                    }
                }
            }
            else
            {
                var blank = new byte[width];
                Array.Fill(blank, (byte)' ');
                foreach (var (_, f) in df)
                {
                    if (f.Kind is 'B' or 'M') Array.Clear(blank, f.Offset, f.Length);
                    else if (f.Kind is 'N' or 'F') blank[f.Offset + f.Length - 1] = (byte)'0';
                }
                selected.Add((null, blank, new Dictionary<string, object?>(StringComparer.Ordinal)));
            }

            foreach (var (srec, row, importChanges) in selected)
            {
                var changes = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["PK"] = pk, ["HKPNR"] = number, ["PATNR"] = patient, ["DEL"] = "", ["LOESCH"] = "",
                };
                pk++;
                if (destName == "HKPPLAN")
                {
                    var name = Convert.ToString(DbfTabelle.Value(patientRow, pf, "NAME", encoding)) ?? "";
                    var vorname = Convert.ToString(DbfTabelle.Value(patientRow, pf, "VORNAME", encoding)) ?? "";
                    changes["HKPBEZ"] = title;
                    changes["NAME"] = name.Length > 25 ? name[..25] : name;
                    changes["VORNAME"] = vorname.Length > 1 ? vorname[..1] : vorname;
                    changes["DATUM"] = date;
                    changes["LETZTEAEND"] = date;
                    changes["BEMERK1"] = "DUMMY-TESTPLAN - nicht zur Behandlung oder Abrechnung";
                    foreach (var emptyKey in new[] { "STATUS", "RNR", "PRNR", "ANTRAG", "ABRECH", "EINGLIED", "EHKP", "ANTRAGNR", "UANTRAG", "MITNR", "UMITNR" })
                        changes[emptyKey] = "";
                    foreach (var zeroKey in new[] { "URHKPNR", "THNR", "TP2NR", "HKPTEIL1", "HKPTEIL2" })
                        changes[zeroKey] = 0;

                    if (importData is not null)
                    {
                        var impDate = Str(importData, "date");
                        var bem = "JSON-IMPORT " + Str(importData, "note");
                        if (bem.Length > 120) bem = bem[..120];
                        changes["HKPBEZ"] = "IMPORT JSON " + impDate;
                        changes["DATUM"] = impDate;
                        changes["LETZTEAEND"] = impDate;
                        changes["BEMERK1"] = bem;
                        changes["AB1"] = Dbl(importData, "bemaHonorar");
                        changes["AB2"] = 0;
                        changes["AB3"] = Dbl(importData, "materialUndLabor");
                        changes["AB4"] = 0;
                        changes["AB5"] = Dbl(importData, "total");
                        changes["AB6"] = 0;
                        changes["AB7"] = 0;
                        changes["AB8"] = importData.ContainsKey("subsidyPaid") ? Dbl(importData, "subsidyPaid") : Dbl(importData, "subsidy");
                        changes["AB9"] = 0;
                        changes["AB10"] = Dbl(importData, "gozHonorar");
                        changes["AB11"] = Dbl(importData, "patientShare");
                        changes["PGESAMT"] = Dbl(importData, "total");
                        changes["FKZBETRAG"] = Dbl(importData, "subsidyBase");
                        changes["PROZENT"] = Dbl(importData, "bonusPercent");
                        changes["KASSENANT"] = Dbl(importData, "bonusPercent");
                        changes["HKP24"] = "J";
                        foreach (var (k, v) in KopfSummen(importData, labRows))
                            if (df.ContainsKey(k)) changes[k] = v;
                        foreach (var (k, v) in labHeader)
                            if (df.ContainsKey(k)) changes[k] = v;
                    }
                }
                if (destName == "HKPLST")
                {
                    changes["RNR"] = ""; changes["PATINFO_PK"] = 0; changes["BPLEI_PK"] = 0; changes["PSRID"] = 0;
                }
                if (destName == "HKPPLAN2")
                {
                    var clock = DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture);
                    foreach (var (k, v) in new (string, object)[] { ("BONUS2020", "J"), ("E_DATUM", date), ("E_ZEIT", clock), ("G_DATUM", date), ("G_ZEIT", clock) })
                        if (df.ContainsKey(k)) changes[k] = v;
                }
                if (destName == "BEFUND")
                {
                    changes["PATINFO_PK"] = 0;
                    changes["DATUM"] = date;
                    if (importData is not null)
                    {
                        var findingType = Convert.ToString(DbfTabelle.Value(row, df, "BEFTYP", encoding)) ?? "";
                        var cells = new Dictionary<string, string>(StringComparer.Ordinal);
                        var teeth = (Dictionary<string, string>)importData["teeth"]!;
                        if (findingType == "Z")
                        {
                            foreach (var (tooth, code) in teeth) cells[tooth] = "1" + code;
                        }
                        else if (findingType == "H")
                        {
                            var rowsMap = importData.TryGetValue("rows", out var rm) && rm is Dictionary<string, Dictionary<string, string>> rd && rd.Count > 0
                                ? rd
                                : teeth.ToDictionary(kv => kv.Key, kv => new Dictionary<string, string>(StringComparer.Ordinal) { ["B"] = kv.Value }, StringComparer.Ordinal);
                            foreach (var name in df.Keys)
                                if (ZaFieldRe.IsMatch(name)) cells[name[2..]] = "";
                            foreach (var (tooth, r) in rowsMap)
                                cells[tooth] = DsWinHkp.HCell(tooth, r.GetValueOrDefault("B", ""), r.GetValueOrDefault("R", ""), r.GetValueOrDefault("TP", ""));
                        }
                        foreach (var (tooth, cell) in cells)
                        {
                            var field = "ZA" + tooth;
                            if (!df.ContainsKey(field)) throw new HkpError("Befundstruktur enthält Zahn " + tooth + " nicht.");
                            changes[field] = cell;
                        }
                    }
                }
                foreach (var (k, v) in importChanges) changes[k] = v;
                app.Put(dst, df, row, changes, src, srec);
            }
            app.Verify(dst);
        }
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["number"] = number,
            ["title"] = importData is not null ? "IMPORT JSON " + Str(importData, "date") : title,
            ["test"] = importData is null,
            ["imported"] = importData is not null,
            ["hinweise"] = labNotes,
        };
    }

    // -------------------------------------------------------------------------
    // plan_writer.py
    // -------------------------------------------------------------------------

    public static Dictionary<string, byte[]> BegruendungMemos(string text, string encoding)
    {
        var enc = DsWinPfad.EncodingByName(encoding, strict: true);
        var lines = new List<string>();
        var line = "";
        foreach (var rawWord in text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
        {
            var word = rawWord;
            while (word.Length > MemoZeile)
            {
                if (line.Length > 0) { lines.Add(line); line = ""; }
                lines.Add(word[..MemoZeile]);
                word = word[MemoZeile..];
            }
            if (line.Length > 0 && line.Length + 1 + word.Length > MemoZeile)
            {
                lines.Add(line);
                line = word;
            }
            else
            {
                line = (line.Length > 0 ? line + " " + word : word).Trim();
            }
        }
        if (line.Length > 0) lines.Add(line);
        var roebef = string.Concat(lines.Select(l => l.PadRight(MemoBreite)));
        return new Dictionary<string, byte[]>(StringComparer.Ordinal)
        {
            ["GRUENDE"] = enc.GetBytes(text),
            ["ROEBEF"] = enc.GetBytes(roebef),
        };
    }

    public sealed class Gebuehren
    {
        public Dictionary<string, string> Goz { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, List<string>> Analog { get; } = new(StringComparer.Ordinal);
        public HashSet<string> Bema { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, double> Einfach { get; } = new(StringComparer.Ordinal);

        public Gebuehren(string daten, string encoding)
        {
            var (f, rows, _) = DbfTabelle.Table(Path.Combine(daten, "GOZ08.DBF"));
            foreach (var r in rows)
            {
                var nr = (Convert.ToString(DbfTabelle.Value(r, f, "GEBNR", encoding)) ?? "").Trim();
                if (!DbfTabelle.Active(r, f, encoding) || nr.Length == 0
                    || Convert.ToString(DbfTabelle.Value(r, f, "NOTVISIBLE", encoding)) == "J")
                    continue;
                Goz.TryAdd(nr.ToUpperInvariant(), nr);
                Einfach.TryAdd(nr, RoundPy(Convert.ToDouble(DbfTabelle.Value(r, f, "BUGO", encoding) ?? 0.0, CultureInfo.InvariantCulture), 2));
                var rf = (Convert.ToString(DbfTabelle.Value(r, f, "GOZREF", encoding)) ?? "").Trim();
                var bez = (Convert.ToString(DbfTabelle.Value(r, f, "BEZ", encoding)) ?? "").ToLowerInvariant();
                if (rf.Length > 0 && bez.Contains("analog", StringComparison.Ordinal))
                {
                    if (!Analog.TryGetValue(rf, out var l)) Analog[rf] = l = [];
                    l.Add(nr);
                }
            }
            var bugo = Path.Combine(daten, "BUGO.DBF");
            if (File.Exists(bugo))
            {
                var (bf, brows, _) = DbfTabelle.Table(bugo);
                foreach (var r in brows)
                    if (DbfTabelle.Active(r, bf, encoding))
                        Bema.Add((Convert.ToString(DbfTabelle.Value(r, bf, "GEBNR", encoding)) ?? "").Trim());
            }
        }

        public string? GozCode(string nr, bool mkv = false, string gegen = "")
        {
            if (mkv && MkvGoz.TryGetValue(nr, out var mk))
            {
                var code = nr == "2170" && gegen == "13d" ? "2170m2" : mk;
                if (Goz.TryGetValue(code.ToUpperInvariant(), out var g)) return g;
            }
            if (Goz.TryGetValue(nr.ToUpperInvariant(), out var g2)) return g2;
            var m = AnalogRe.Match(nr);
            if (m.Success && Analog.TryGetValue(m.Groups[1].Value, out var al) && al.Count == 1)
                return al[0];
            return null;
        }

        public string? GoaeCode(string nr)
        {
            // Treffer = Ziffern existieren (auch als Ž3/Ä3). Rückgabe immer „ä…“, nie das
            // vergiftete Katalogkürzel. Goz wird hier nicht umgeschrieben — die saubere
            // GOZ08-Zeile legt PlanRows/GebuehrFehlt bei Bedarf neu an.
            var ziffern = GoaeZiffern(nr);
            if (ziffern.Length == 0) return null;
            var canon = GoaeGebNr(ziffern);
            string? fund = null;
            foreach (var c in new[] { canon, "\u00C4" + ziffern, "A" + ziffern, ziffern })
            {
                if (Goz.TryGetValue(c.ToUpperInvariant(), out var g)) { fund = g; break; }
            }
            if (fund is null)
            {
                foreach (var (key, g) in Goz)
                {
                    if (GoaeZiffern(key) == ziffern && key.Length > ziffern.Length) { fund = g; break; }
                }
            }
            if (fund is null) return null;
            if (!Einfach.ContainsKey(canon) && Einfach.TryGetValue(fund, out var preis))
                Einfach[canon] = preis;
            return canon;
        }

        /// <summary>True, wenn GOZ08 die GOÄ bereits als kleines ä+Ziffern führt.</summary>
        public bool GoaeSauber(string nr)
        {
            var canon = GoaeGebNr(nr);
            return Goz.TryGetValue(canon.ToUpperInvariant(), out var g)
                && string.Equals(g, canon, StringComparison.Ordinal);
        }

        public string? BemaCode(string nr)
        {
            var mkv = nr + "0";
            if (Bema.Contains(mkv)) return mkv;
            return Bema.Contains(nr) ? nr : null;
        }
    }

    /// <summary>GOÄ-Ziffer ohne Präfix (PlanR „3“, Katalog „ä3“/„Ä3“/„Ž3“/„A3“).</summary>
    public static string GoaeZiffern(string? nr)
    {
        var s = (nr ?? "").Trim();
        while (s.Length > 0 && !char.IsDigit(s[0])) s = s[1..].TrimStart();
        return s;
    }

    /// <summary>Schreibweise wie in GOZ08: kleines ä + Ziffern (Unicode \u00E4, encoding-sicher).</summary>
    public static string GoaeGebNr(string? nr) => "\u00E4" + GoaeZiffern(nr);

    static void ZuschlagAngleichen(Dictionary<string, object?> p)
    {
        if (Str(p, "level") != "GOZ" || !Zuschlag.Contains(Str(p, "number"))) return;
        var factor = Dbl(p, "factor", 1.0);
        if (factor == 0) factor = 1.0;
        if (factor == 1.0) return;
        var einfach = RoundPy(Dbl(p, "price") / factor, 2);
        p["price"] = einfach;
        p["amount"] = RoundPy(einfach * Dbl(p, "count"), 2);
        p["factor"] = 1.0;
    }

    static (string Code, Dictionary<string, object?>? Neu) GebuehrFehlt(Dictionary<string, object?> p, Gebuehren gebuehren)
    {
        var lv = Str(p, "level");
        var code = lv == "GOAE" ? GoaeGebNr(Str(p, "number")) : Str(p, "number");
        // GOÄ: nur die exakte Schreibweise „ä3“ zählt als vorhanden — „Ä3“/„Ž3“ sind Altlast.
        if (gebuehren.Goz.TryGetValue(code.ToUpperInvariant(), out var known)
            && (lv != "GOAE" || string.Equals(known, code, StringComparison.Ordinal)))
            return (known, null);
        var factor = Dbl(p, "factor", 1.0);
        if (factor == 0) factor = 1.0;
        var einfach = factor != 0 ? RoundPy(Dbl(p, "price") / factor, 2) : Dbl(p, "price");
        var pv = Dbl(p, "pointValue", Punktwert.GetValueOrDefault(lv, Punktwert["GOZ"]));
        if (pv == 0) pv = Punktwert.GetValueOrDefault(lv, Punktwert["GOZ"]);
        var punkte = pv != 0 ? RoundIntPy(einfach / pv) : (int)Dbl(p, "points");
        var text = Str(p, "text").Trim();
        var bezug = "";
        var analog = AnalogCiRe.Match(code);
        if (analog.Success)
        {
            bezug = analog.Groups[1].Value;
            if (!text.Contains("analog", StringComparison.OrdinalIgnoreCase))
                text = text.Length > 0 ? (text + " analog").Trim() : $"Analog zu {bezug}";
        }
        gebuehren.Goz[code.ToUpperInvariant()] = code;
        gebuehren.Einfach[code] = einfach;
        return (code, new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["goz"] = true, ["fee"] = code, ["text"] = text.Length > 0 ? text : code,
            ["punkte"] = punkte, ["bugo"] = einfach, ["bezug"] = bezug, ["druck"] = bezug.Length > 0 ? bezug : code,
        });
    }

    static byte[]? MkvSymbol(string symbol)
    {
        if (symbol.Length < 2 || !MkvMaterial.TryGetValue(symbol[0], out var mat)) return null;
        if (!int.TryParse(symbol[1..], out var surfaces) || surfaces < 1 || surfaces > 4) return null;
        return [mat, (byte)(0xA3 + surfaces)];
    }

    static byte[] HCellBytes(string tooth, byte[] b, byte[] r, byte[] tp)
    {
        byte[][] lines = Upper.Contains(tooth) ? [tp, r, b] : [b, r, tp];
        var len = lines[0].Length + lines[1].Length + lines[2].Length + 4;
        var buf = new byte[len];
        var pos = 0;
        for (var i = 0; i < 3; i++)
        {
            if (i > 0) { buf[pos++] = (byte)'\r'; buf[pos++] = (byte)'\n'; }
            Buffer.BlockCopy(lines[i], 0, buf, pos, lines[i].Length);
            pos += lines[i].Length;
        }
        return buf;
    }

    static HashSet<string> Woerter(string? text)
    {
        var s = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match m in Word4Re.Matches((text ?? "").ToLowerInvariant())) s.Add(m.Value);
        return s;
    }

    static bool BezeichnungPasst(string? katalog, string? plan)
    {
        var a = Woerter(katalog);
        var b = Woerter(plan);
        if (a.Count == 0 || b.Count == 0) return false;
        var inter = a.Count(w => b.Contains(w));
        return (double)inter / Math.Min(a.Count, b.Count) >= 0.6;
    }

    static string BebGebNr(int liste, string nummer) => (liste == 4 ? "0" : "5") + nummer;

    static bool MaterialPasst(string? katalog, string? plan)
    {
        var a = string.Join(" ", (katalog ?? "").ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var b = string.Join(" ", (plan ?? "").ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (a.Length == 0 || b.Length == 0) return false;
        if (a == b || a.StartsWith(b, StringComparison.Ordinal) || b.StartsWith(a, StringComparison.Ordinal)) return true;
        var m = Word4Re.Match(b);
        return m.Success && a.Contains(m.Value, StringComparison.Ordinal) && BezeichnungPasst(katalog, plan);
    }

    static (string? Fee, bool Neu) PlanrMaterial(string text, double preis, Dictionary<string, (string Bez, bool Eigen, double Preis)> codes)
    {
        foreach (var (fee, eintrag) in codes)
            if (eintrag.Eigen && MaterialPasst(eintrag.Bez, text))
                return (fee.ToUpperInvariant(), false);
        var hash = SHA1.HashData(Encoding.UTF8.GetBytes((text ?? "").Trim().ToLowerInvariant()));
        var basis = (hash[0] << 8) | hash[1];
        var belegt = codes.Keys.Select(c => c.ToUpperInvariant()).ToHashSet(StringComparer.Ordinal);
        for (var i = 0; i < 1000; i++)
        {
            var fee = $"5{9000 + ((basis + i) % 1000):0000}";
            if (!belegt.Contains(fee))
            {
                codes[fee] = (text ?? "", true, preis);
                return (fee, true);
            }
        }
        return (null, false);
    }

    static (int Liste, List<(Dictionary<string, object?> Pos, string Bez)> Blocked, List<Dictionary<string, object?>> Inserts) WaehleBeb(
        List<Dictionary<string, object?>> beb, DsWinLabor.Listen listen)
    {
        var kandidaten = BebKandidaten.Where(n => listen.Datei(n) is not null).ToList();
        if (kandidaten.Count == 0) return (3, [], [.. beb]);

        (int Blocked, int Inserts, int Prio, int Liste) Wert(int liste)
        {
            var codes = listen.Codes(liste);
            var blocked = 0; var inserts = 0;
            foreach (var p in beb)
            {
                if (!codes.TryGetValue(BebGebNr(liste, Str(p, "number")).ToUpperInvariant(), out var eintrag))
                    inserts++;
                else if (!string.IsNullOrEmpty(eintrag.Bez) && !BezeichnungPasst(eintrag.Bez, Str(p, "text")))
                    blocked++;
            }
            return (blocked, inserts, liste == 4 ? 0 : 1, liste);
        }

        var liste = kandidaten.OrderBy(Wert).First();
        var codesMap = listen.Codes(liste);
        var blockedList = new List<(Dictionary<string, object?>, string)>();
        var insertsList = new List<Dictionary<string, object?>>();
        foreach (var p in beb)
        {
            if (!codesMap.TryGetValue(BebGebNr(liste, Str(p, "number")).ToUpperInvariant(), out var eintrag))
                insertsList.Add(p);
            else if (!string.IsNullOrEmpty(eintrag.Bez) && !BezeichnungPasst(eintrag.Bez, Str(p, "text")))
                blockedList.Add((p, eintrag.Bez));
        }
        return (liste, blockedList, insertsList);
    }

    static (List<Dictionary<string, object?>> Rows, List<string> Notes, List<Dictionary<string, object?>> Inserts) LaborPrivat(
        List<Dictionary<string, object?>> lab, DsWinLabor.Listen listen)
    {
        if (lab.Count == 0) return ([], [], []);
        var beb = lab.Where(p => Str(p, "level") == "BEB").ToList();
        int? liste = null;
        List<(Dictionary<string, object?> Pos, string Bez)> blocked = [];
        List<Dictionary<string, object?>> neue = [];
        if (beb.Count > 0) (liste, blocked, neue) = WaehleBeb(beb, listen);
        var rows = new List<Dictionary<string, object?>>();
        var notes = new List<string>();
        var inserts = new List<Dictionary<string, object?>>();
        if (liste is int lnr && beb.Count > 0)
            notes.Add("Laborpositionen in der Liste " + ListenName.GetValueOrDefault(lnr, lnr.ToString()) + ".");
        if (blocked.Count > 0)
            notes.Add("In " + ListenName.GetValueOrDefault(liste!.Value, liste.Value.ToString()) + " steht schon eine andere Leistung: "
                + string.Join(", ", blocked.Select(b => $"{Str(b.Pos, "number")} ({b.Bez})")) + ".");
        foreach (var p in neue)
        {
            var nr = Str(p, "number");
            var txt = Str(p, "text");
            inserts.Add(new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["liste"] = liste!.Value, ["number"] = nr, ["fee"] = BebGebNr(liste.Value, nr),
                ["text"] = txt.Length > 0 ? txt : nr, ["price"] = Dbl(p, "price"), ["lab"] = Str(p, "lab"),
            });
        }
        foreach (var p in beb)
        {
            var kind = Str(p, "lab") == "eigen" ? "L" : "F";
            rows.Add(new Dictionary<string, object?>(p, StringComparer.Ordinal)
            {
                ["kind"] = kind, ["fee"] = BebGebNr(liste!.Value, Str(p, "number")), ["labtyp"] = liste.Value,
            });
        }
        var mats = lab.Where(p => Str(p, "level") == "MAT").ToList();
        if (mats.Count > 0)
        {
            int use;
            if (liste is int l) use = l;
            else
            {
                var foundCodes = new List<string>();
                foreach (var p in mats)
                {
                    var m = DsWinLabor.DsWinCodeRe.Match(Str(p, "text"));
                    if (m.Success) foundCodes.Add(m.Groups[1].Value.ToUpperInvariant());
                }
                use = listen.ListeFuer(foundCodes, 0, DsWinLabor.BebLists);
            }
            var codes = listen.Codes(use);
            var missing = new List<string>();
            var angelegt = false;
            foreach (var p in mats)
            {
                var txt = Str(p, "text");
                var (fee, _) = listen.Material(txt, use);
                if (!string.IsNullOrEmpty(fee) && codes.ContainsKey(fee.ToUpperInvariant()))
                {
                    var kind = Str(p, "lab") == "eigen" ? "L" : "F";
                    rows.Add(new Dictionary<string, object?>(p, StringComparer.Ordinal)
                    {
                        ["kind"] = kind, ["fee"] = fee.ToUpperInvariant(), ["labtyp"] = use,
                    });
                    continue;
                }
                var label = txt.Length > 0 ? txt : "Material";
                var (eigener, neu) = PlanrMaterial(label, Dbl(p, "price"), codes);
                if (string.IsNullOrEmpty(eigener)) { missing.Add(label); continue; }
                if (neu)
                {
                    inserts.Add(new Dictionary<string, object?>(StringComparer.Ordinal)
                    {
                        ["liste"] = use, ["number"] = eigener[1..], ["fee"] = eigener,
                        ["text"] = label, ["price"] = Dbl(p, "price"), ["lab"] = "eigen",
                    });
                    angelegt = true;
                }
                rows.Add(new Dictionary<string, object?>(p, StringComparer.Ordinal)
                {
                    ["kind"] = "L", ["fee"] = eigener, ["labtyp"] = use, ["lab"] = "eigen",
                });
            }
            if (angelegt) notes.Add("Material und Implantatteile in der Liste " + listen.Name(use) + ".");
            if (missing.Count > 0) notes.Add("Laborzeilen nur in der Laborsumme (nicht in " + listen.Name(use) + "): " + string.Join(", ", missing) + ".");
        }
        return (rows, notes, inserts);
    }

    public static (List<Dictionary<string, object?>> Rows, Dictionary<string, object?> Head, List<string> Notes, List<Dictionary<string, object?>> Inserts)
        PlanRows(Dictionary<string, object?> data, Gebuehren gebuehren, DsWinLabor.Listen listen, string encoding)
    {
        var planart = Str(data, "planart");
        var art = Str(data, "art");
        var listenart = ListenArt[planart];
        var notes = new List<string>((List<string>)data["notes"]!);
        var rows = new List<Dictionary<string, object?>>();
        var ordinal = new Dictionary<string, int>(StringComparer.Ordinal);

        void Add(string kind, Dictionary<string, object?> extra)
        {
            var n = ordinal.GetValueOrDefault(kind, 0);
            ordinal[kind] = n + 1;
            var r = new Dictionary<string, object?>(StringComparer.Ordinal);
            if (ZeroRow.TryGetValue((planart, kind + Str(extra, "SIGN")), out var zeros))
                foreach (var name in zeros) r[name] = 0;
            r["LST_ART"] = kind;
            r["PLANART"] = listenart;
            r["LFD_NR"] = n;
            r["RNR"] = Rnr;
            foreach (var (k, v) in extra) r[k] = v;
            rows.Add(r);
        }

        var positions = (List<Dictionary<string, object?>>)data["positions"]!;
        var missing = new List<string>();
        var fees = positions.Where(p => Str(p, "level") is "GOZ" or "GOAE" or "BEMA").ToList();
        var gegen = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var p in fees)
            if (Str(p, "level") == "BEMA") gegen[Str(p, "tooth")] = Str(p, "number");

        var honorar = 0.0; var kasse = 0.0;
        var gozNeu = new List<Dictionary<string, object?>>();
        var begruendet = 0;
        var ohneGrund = new List<string>();

        foreach (var p in fees)
        {
            var lv = Str(p, "level");
            if (lv == "BEMA")
            {
                kasse += Dbl(p, "amount");
                var bcode = gebuehren.BemaCode(Str(p, "number"));
                if (bcode is null) { missing.Add(Str(p, "number")); continue; }
                Add("Z", new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["GEBNR"] = bcode, ["ANZAHL"] = Dbl(p, "count"), ["BEWZAHL"] = Dbl(p, "points"),
                    ["SUMME"] = RoundPy(Dbl(p, "points") * Dbl(p, "count"), 1), ["FAKTOR"] = Dbl(p, "pointValue"),
                    ["PREIS"] = Dbl(p, "price"), ["BETRAG"] = Dbl(p, "amount"), ["ZAHN"] = Str(p, "tooth"),
                    ["SIGN"] = "-", ["LABTYP"] = "0", ["VERLLST"] = "N", ["ART"] = "KO",
                });
                continue;
            }
            ZuschlagAngleichen(p);
            honorar += Dbl(p, "amount");
            var nr = Str(p, "number");
            var isMkv = p.TryGetValue("mkv", out var mv) && mv is true;
            var code = lv == "GOZ"
                ? gebuehren.GozCode(nr, isMkv, gegen.GetValueOrDefault(Str(p, "tooth"), ""))
                : gebuehren.GoaeCode(nr);
            if (code is null || (lv == "GOAE" && !gebuehren.GoaeSauber(nr)))
            {
                var (c, neu) = GebuehrFehlt(p, gebuehren);
                code = c;
                if (neu is not null) gozNeu.Add(neu);
            }
            var factor = Dbl(p, "factor", 1.0);
            if (factor == 0) factor = 1.0;
            var einfach = gebuehren.Einfach.TryGetValue(code, out var ef) && ef != 0.0 ? ef : RoundPy(Dbl(p, "price") / factor, 2);
            var itemArt = Str(p, "art");
            if (itemArt.Length == 0) itemArt = art;
            Add("Z", new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["GEBNR"] = code, ["ANZAHL"] = Dbl(p, "count"), ["FAKTOR"] = factor, ["EINFACH"] = einfach,
                ["PREIS"] = Dbl(p, "price"), ["BETRAG"] = Dbl(p, "amount"), ["ZAHN"] = Str(p, "tooth"),
                ["SIGN"] = "+", ["LABTYP"] = "0", ["VERLLST"] = "N", ["ART"] = itemArt,
            });
            var reason = Str(p, "reason");
            if (reason.Length > 0)
            {
                if (planart == "kva" && gebuehren.Goz.TryGetValue(Kommentar.ToUpperInvariant(), out var komm))
                {
                    var kRow = new Dictionary<string, object?>(StringComparer.Ordinal)
                    {
                        ["GEBNR"] = komm, ["ANZAHL"] = 1, ["FAKTOR"] = 1.0, ["EINFACH"] = 0, ["PREIS"] = 0, ["BETRAG"] = 0,
                        ["ZAHN"] = "", ["SIGN"] = "+", ["LABTYP"] = "0", ["VERLLST"] = "N", ["ART"] = itemArt,
                    };
                    foreach (var (mk, mval) in BegruendungMemos(reason, encoding)) kRow[mk] = mval;
                    Add("Z", kRow);
                    begruendet++;
                }
                else ohneGrund.Add(nr);
            }
        }

        if (missing.Count > 0)
            notes.Add("In der DS-Win-Gebührenliste nicht gefunden, nur in der Summe: " + string.Join(", ", missing.Distinct(StringComparer.Ordinal))
                + ". Analogpositionen in DS-Win anlegen (GOZ-Liste, Bezug auf die Referenznummer).");
        if (begruendet > 0)
            notes.Add($"{begruendet} Begründung{(begruendet > 1 ? "en" : "")} zum erhöhten Faktor als Kommentarzeile hinter der Leistung eingetragen.");
        if (ohneGrund.Count > 0)
            notes.Add("Begründung zum erhöhten Faktor bitte in DS-Win ergänzen: " + string.Join(", ", ohneGrund.Distinct(StringComparer.Ordinal)) + ".");
        if (gozNeu.Count > 0)
            notes.Add("In die DS-Win-Gebührenliste aufgenommen: " + string.Join(", ", gozNeu.Select(i => Str(i, "fee"))) + ".");

        var (labRows, labNotes, inserts) = LaborPrivat(positions.Where(p => Str(p, "level") is "BEB" or "MAT").ToList(), listen);
        notes.AddRange(labNotes);

        var umgelegt = 0.0;
        foreach (var r in labRows)
        {
            if (Str(r, "level") is "BEB" or "MAT" && Str(r, "kind") == "F")
            {
                r["kind"] = "L";
                r["lab"] = "eigen";
                umgelegt = RoundPy(umgelegt + Dbl(r, "amount"), 2);
            }
        }
        foreach (var eintrag in inserts) eintrag["lab"] = "eigen";
        if (labRows.Any(r => Str(r, "level") is "BEB" or "MAT"))
            notes.Add("Die Laborpositionen liegen im Eigenlabor und können über HKP-Leistung in die Laborrechnung übernommen werden.");
        foreach (var r in labRows)
        {
            var zeile = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["GEBNR"] = Str(r, "fee"), ["ANZAHL"] = Dbl(r, "count"), ["ZAHN"] = Str(r, "tooth"), ["SIGN"] = "-",
                ["LABTYP"] = Convert.ToString(r["labtyp"], CultureInfo.InvariantCulture) ?? "0",
                ["PREISLISTE"] = 1, ["FAKTOR"] = 0, ["EINFACH"] = 0, ["VERLLST"] = "",
                ["PREIS"] = Dbl(r, "price"), ["BETRAG"] = Dbl(r, "amount"),
            };
            if (Str(r, "level") is "BEB" or "MAT") zeile["PLANART"] = "3";
            Add(Str(r, "kind"), zeile);
        }
        if (positions.Any(p => Str(p, "level") == "LABOR"))
            notes.Add("Laborpauschale ohne BEB-Nummer nur in der Laborsumme.");

        var labor = RoundPy(Dbl(data, "labOwn") + Dbl(data, "labExt"), 2);
        var head = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var name in planart == "kva" ? ZeroHeadKva : ZeroHeadMkv) head[name] = 0;
        if (planart == "mkv") foreach (var (k, v) in RawHeadMkv) head[k] = v;
        foreach (var (k, v) in CommonHead) head[k] = v;

        var eigenlabor = labRows.Any(r => Str(r, "level") is "BEB" or "MAT" && Str(r, "kind") == "L");
        if (planart == "kva")
        {
            var plabor = RoundPy(Dbl(data, "labOwn") + umgelegt, 2);
            var plaborf = RoundPy(Dbl(data, "labExt") - umgelegt, 2);
            foreach (var (k, v) in KvaHead) head[k] = v;
            head["PZAHNHON"] = RoundPy(honorar, 2);
            head["PLABOR"] = plabor;
            head["PGESAMT"] = RoundPy(honorar + labor, 2);
            if (plaborf != 0.0) head["PLABORF"] = plaborf;
            if (eigenlabor) { head["LABORE"] = RoundIntPy(plabor); head["LABORAUSW"] = 1; }
            if (plaborf != 0.0 && umgelegt != 0.0) head["LABOR1"] = RoundIntPy(plaborf);
        }
        else
        {
            var pointValue = fees.Where(p => Str(p, "level") == "BEMA").Select(p => Dbl(p, "pointValue")).FirstOrDefault();
            var h = RoundPy(honorar, 2);
            var k = RoundPy(kasse, 2);
            foreach (var (mk, mv) in MkvHead) head[mk] = mv;
            head["MKVZAHNHON"] = h;
            head["MKVKASSE"] = k;
            head["MKVLABOR"] = labor;
            head["MKVGESAMT"] = RoundPy(h - k + labor, 2);
            if (pointValue != 0.0) { head["PKTWERT"] = pointValue; head["PKTWERTV"] = pointValue; }
            if (eigenlabor) { head["LABORE"] = RoundIntPy(labor); head["LABORAUSW"] = 1; }
        }
        foreach (var (kind, field) in new[] { ("F", "LABTYPPRIF"), ("L", "LABTYPPRIV") })
        {
            var lnr = labRows.Where(r => Str(r, "kind") == kind).Select(r => (int?)Convert.ToInt32(r["labtyp"], CultureInfo.InvariantCulture)).FirstOrDefault();
            if (lnr is int nr && nr != 0) head[field] = nr;
        }
        return (rows, head, notes, inserts.Concat(gozNeu).ToList());
    }

    static (Dictionary<string, byte[]> Cells, List<string> Notes) BefundCells(
        Dictionary<string, object?> data, string root, int praxisNr, string patient, string encoding)
    {
        var current = new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            var res = DsWinBefund.ReadFindings(Path.Combine(root, "daten"), patient, praxisNr, encoding);
            if (res["current"] is Dictionary<string, object?> cur && cur["teeth"] is Dictionary<string, object?> teeth)
                foreach (var (t, v) in teeth)
                    if (v is Dictionary<string, object?> td && td.TryGetValue("status", out var st) && st is string s)
                        current[t] = s;
        }
        catch (EditError) { }
        catch (IOException) { }
        catch (InvalidOperationException) { }

        var codes = DsWinBefund.FindingCodes(root);
        var findings = (Dictionary<string, string>)data["findings"]!;
        var symbols = (Dictionary<string, string>)data["symbols"]!;
        var notes = new List<string>();
        var unknown = new List<string>();
        var cells = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var tooth in DsWinBefund.Teeth)
        {
            var b = findings.TryGetValue(tooth, out var fb) ? fb : current.GetValueOrDefault(tooth, "");
            if (b.Length > 0 && !codes.Contains(b))
            {
                unknown.Add($"{tooth} {b}");
                b = current.TryGetValue(tooth, out var cb) && codes.Contains(cb) ? cb : "";
            }
            byte[] r = [], tp = [];
            if (symbols.TryGetValue(tooth, out var symbol) && symbol.Length > 0)
            {
                tp = MkvSymbol(symbol) ?? [];
                r = MkvSymbol("F" + symbol[1..]) ?? [];
                if (tp.Length == 0) unknown.Add($"{tooth} {symbol}");
            }
            cells[tooth] = HCellBytes(tooth, Encoding.ASCII.GetBytes(b), r, tp);
        }
        if (unknown.Count > 0) notes.Add("Im DS-Win-Befund des Plans nicht übernommen: " + string.Join(", ", unknown) + ".");
        return (cells, notes);
    }

    static void KatalogErgaenzen(string daten, List<Dictionary<string, object?>> inserts, string dll, string encoding)
    {
        if (inserts.Count == 0) return;
        var gruppen = new Dictionary<int, List<Dictionary<string, object?>>>();
        foreach (var e in inserts)
        {
            var l = Convert.ToInt32(e["liste"], CultureInfo.InvariantCulture);
            if (!gruppen.TryGetValue(l, out var list)) gruppen[l] = list = [];
            list.Add(e);
        }
        var listen = new DsWinLabor.Listen(daten, encoding);
        using var app = new DsWinAppender(dll, encoding);
        foreach (var (liste, gruppe) in gruppen)
        {
            var path = listen.Datei(liste) ?? throw new HkpError("Laborliste fehlt.");
            var (fields, vorhandenRows, width) = DbfTabelle.Table(path);
            var dst = app.Open(path);
            if (app.E.LockAll(dst) != 0) throw new HkpError("Laborliste ist gerade gesperrt.");
            var empty = Blank(fields, width);
            var vorhanden = vorhandenRows
                .Where(r => DbfTabelle.Active(r, fields, encoding))
                .Select(r => (Convert.ToString(DbfTabelle.Value(r, fields, "GEBNR", encoding)) ?? "").Trim().ToUpperInvariant())
                .ToHashSet(StringComparer.Ordinal);
            var breite = fields.TryGetValue("BEZ", out var bf) ? bf.Length : 300;
            foreach (var p in gruppe)
            {
                var rawFee = Str(p, "fee");
                var fee = rawFee.ToUpperInvariant();
                if (vorhanden.Contains(fee)) continue;
                var txt = Str(p, "text");
                if (txt.Length == 0) txt = Str(p, "number");
                if (txt.Length > breite) txt = txt[..breite];
                var rawChanges = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["IGEBNR"] = rawFee.PadLeft(6, '0'), ["GEBNR"] = rawFee, ["BEZ"] = txt,
                    ["PREIS_1"] = Dbl(p, "price"), ["PREIS_2"] = Dbl(p, "price"), ["KATEGORIE"] = "0", ["WAEHRUNG"] = 1,
                    ["EIGENLABOR"] = Str(p, "lab") == "eigen" ? "J" : "N",
                    ["HKP"] = "J", ["GOZ"] = "J", ["KONS"] = "J", ["KFO"] = "J", ["NOTVISIBLE"] = "N", ["GESETZ"] = "J",
                };
                if (fields.ContainsKey("EOR")) rawChanges["EOR"] = Eor;
                var filtered = rawChanges.Where(kv => fields.ContainsKey(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);
                app.Put(dst, fields, empty, filtered);
                vorhanden.Add(fee);
            }
            app.Verify(dst);
        }
    }

    static void KatalogGoz(string daten, List<Dictionary<string, object?>> inserts, string dll, string encoding)
    {
        if (inserts.Count == 0) return;
        var path = Path.Combine(daten, "GOZ08.DBF");
        if (!File.Exists(path)) throw new HkpError("GOZ-Liste fehlt.");
        var (fields, vorhandenRows, width) = DbfTabelle.Table(path);
        using var app = new DsWinAppender(dll, encoding);
        var dst = app.Open(path);
        if (app.E.LockAll(dst) != 0) throw new HkpError("GOZ-Liste ist gerade gesperrt.");
        var empty = Blank(fields, width);
        // Exakter Vergleich (nicht ToUpper): sonst blockiert vergiftetes „Ä3“/„Ž3“ (Byte 0x8E)
        // das Anlegen der sauberen GOÄ-Zeile „ä3“.
        var vorhanden = vorhandenRows
            .Where(r => DbfTabelle.Active(r, fields, encoding))
            .Select(r => (Convert.ToString(DbfTabelle.Value(r, fields, "GEBNR", encoding)) ?? "").Trim())
            .ToHashSet(StringComparer.Ordinal);
        var breite = fields.TryGetValue("BEZ", out var bf) ? bf.Length : 200;
        foreach (var p in inserts)
        {
            var fee = Str(p, "fee");
            if (vorhanden.Contains(fee)) continue;
            var txt = Str(p, "text");
            if (txt.Length == 0) txt = fee;
            if (txt.Length > breite) txt = txt[..breite];
            var druck = Str(p, "druck");
            if (druck.Length == 0) druck = fee;
            var rawChanges = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["KUERZEL"] = fee, ["GEBNR"] = fee, ["DGEBNR"] = druck, ["BEZ"] = txt,
                ["PUNKTE"] = (int)Dbl(p, "punkte"), ["BUGO"] = Dbl(p, "bugo"),
                ["FAKTOR"] = 0, ["GOZREF"] = Str(p, "bezug"), ["NOTVISIBLE"] = "N",
            };
            if (fields.ContainsKey("EOR")) rawChanges["EOR"] = Eor;
            var filtered = rawChanges.Where(kv => fields.ContainsKey(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);
            app.Put(dst, fields, empty, filtered);
            vorhanden.Add(fee.ToUpperInvariant());
        }
        app.Verify(dst);
    }

    public static Dictionary<string, object?> StagePrivat(
        string praxis, string stage, string dll, string patient, string encoding, Dictionary<string, object?>? data)
    {
        if (data is null) throw new HkpError("Plandaten fehlen.");
        var (fields, plans, _) = DbfTabelle.Table(Path.Combine(stage, "HKPPLAN.DBF"));
        var number = 1 + (plans.Count == 0 ? 0 : plans.Max(r => Convert.ToInt32(DbfTabelle.Value(r, fields, "HKPNR", encoding) ?? 0)));
        if (number > 999999) throw new HkpError("HKP-Nummern aufgebraucht.");
        var daten = Path.GetDirectoryName(praxis)!;
        var root = Path.GetDirectoryName(daten)!;
        var (pf, patients, _) = DbfTabelle.Table(Path.Combine(daten, "patient.dbf"));
        var matches = patients.Where(r => DbfTabelle.Active(r, pf, encoding) && Convert.ToString(DbfTabelle.Value(r, pf, "PATNR", encoding)) == patient).ToList();
        if (matches.Count != 1) throw new HkpError("Patient nicht eindeutig gefunden.");
        var p = matches[0];
        var kasse = (Convert.ToString(DbfTabelle.Value(p, pf, "MFRP", encoding)) ?? "").Trim();
        var planart = Str(data, "planart");
        if (planart == "mkv" && kasse is "" or "P")
            throw new HkpError("Eine Mehrkostenvereinbarung gibt es nur für Kassenpatienten.");
        var behandler = Convert.ToInt32(DbfTabelle.Value(p, pf, "BEHANDLER", encoding) ?? 0);
        if (behandler == 0) behandler = 1;

        var (rows, head, notes, inserts) = PlanRows(data, new Gebuehren(daten, encoding), new DsWinLabor.Listen(daten, encoding), encoding);
        var labor = inserts.Where(i => !i.TryGetValue("goz", out var g) || g is not true).ToList();
        var goz = inserts.Where(i => i.TryGetValue("goz", out var g) && g is true).ToList();
        if (labor.Count > 0)
        {
            try { KatalogErgaenzen(daten, labor, dll, encoding); }
            catch (Exception ex) when (ex is HkpError or IOException or NativeError)
            { notes.Add("Die Laborbezeichnungen konnten nicht in die Liste geschrieben werden."); }
        }
        if (goz.Count > 0)
        {
            try { KatalogGoz(daten, goz, dll, encoding); }
            catch (Exception ex) when (ex is HkpError or IOException or NativeError)
            { notes.Add("Die Gebührennummern konnten nicht in die GOZ-Liste geschrieben werden."); }
        }
        if (rows.Count == 0) throw new HkpError("Keine Planposition ist in DS-Win bekannt.");
        var praxisNr = int.Parse(Path.GetFileName(praxis)[4..], CultureInfo.InvariantCulture);
        var (cells, befundNotes) = BefundCells(data, root, praxisNr, patient, encoding);
        notes.AddRange(befundNotes);
        var today = DateTime.Now.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var clock = DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture);
        var vorname = Convert.ToString(DbfTabelle.Value(p, pf, "VORNAME", encoding)) ?? "";
        var name = Convert.ToString(DbfTabelle.Value(p, pf, "NAME", encoding)) ?? "";
        var planHead = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["PATNR"] = patient,
            ["VORNAME"] = vorname.Length > 1 ? vorname[..1] : vorname,
            ["NAME"] = name.Length > 25 ? name[..25] : name,
            ["MFRP"] = kasse,
            ["KKNR"] = Convert.ToString(DbfTabelle.Value(p, pf, "KKNR", encoding)) ?? "",
            ["KKZU"] = Convert.ToString(DbfTabelle.Value(p, pf, "KKZU", encoding)) ?? "",
            ["BEHANDLER"] = behandler,
            ["DATUM"] = Str(data, "date"),
            ["PLANUNGART"] = PlanungArt[planart],
            ["BEMERK1"] = Str(data, "title"),
        };
        foreach (var (k, v) in head) planHead[k] = v;

        var befundRec = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["PATNR"] = patient, ["DATUM"] = Str(data, "date"), ["BEFTYP"] = "H",
        };
        foreach (var (t, c) in cells) befundRec["ZA" + t] = c;

        var plan2Rec = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["E_DATUM"] = today, ["E_ZEIT"] = clock, ["G_DATUM"] = today, ["G_ZEIT"] = clock,
        };
        if (planart == "mkv")
        {
            plan2Rec["KVADLAINR"] = 0;
            plan2Rec["BONUS2020"] = "J";
        }

        var hkpLstRecs = rows.Select(r =>
        {
            var d = new Dictionary<string, object?>(r, StringComparer.Ordinal) { ["BEHANDLER"] = behandler, ["PATNR"] = patient };
            return d;
        }).ToList();

        var tablePlan = new (string Stem, List<Dictionary<string, object?>> Records)[]
        {
            ("HKPLST", hkpLstRecs), ("BEFUND", [befundRec]), ("HKPPLAN2", [plan2Rec]), ("HKPPLAN", [planHead]),
        };

        using var app = new DsWinAppender(dll, encoding);
        foreach (var (stem, records) in tablePlan)
        {
            var (df, dr, width) = DbfTabelle.Table(Path.Combine(stage, stem + ".DBF"));
            var pk = 1 + (dr.Count == 0 ? 0 : dr.Max(r => Convert.ToInt32(DbfTabelle.Value(r, df, "PK", encoding) ?? 0)));
            var dst = app.Open(Path.Combine(stage, stem + ".DBF"));
            pk = Math.Max(pk, (int)app.E.CounterGet(dst));
            var empty = Blank(df, width);
            foreach (var record in records)
            {
                var changes = new Dictionary<string, object?>(record, StringComparer.Ordinal) { ["PK"] = pk, ["HKPNR"] = number };
                if (df.ContainsKey("EOR")) changes["EOR"] = Eor;
                var unknown = changes.Keys.Where(k => !df.ContainsKey(k)).OrderBy(k => k, StringComparer.Ordinal).ToList();
                if (unknown.Count > 0) throw new HkpError("Tabellenstruktur weicht ab: " + string.Join(", ", unknown));
                app.Put(dst, df, empty, changes);
                pk++;
            }
            app.Verify(dst);
        }
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["number"] = number, ["title"] = Str(data, "title"), ["planart"] = planart,
            ["label"] = Label[planart], ["test"] = false, ["imported"] = true, ["hinweise"] = notes,
        };
    }

    // -------------------------------------------------------------------------
    // hkp_live.py
    // -------------------------------------------------------------------------

    public delegate Dictionary<string, object?> StagerFn(
        string praxis, string stage, string dll, string patient, string encoding, Dictionary<string, object?>? importData);

    public static Dictionary<string, object?> AppendShared(
        string root, string patient, string backupBase, string encoding,
        string? dllPath = null, Dictionary<string, object?>? importData = null, StagerFn? stager = null)
    {
        stager ??= StagePlan;
        var daten = Path.Combine(root, "daten");
        var praxis = Path.Combine(daten, $"PRAX{DsWinPfad.PraxisVon(daten, patient, encoding)}");
        var blocker = DsWinPfad.WriteBlocker(root);
        if (blocker is not null) throw new HkpError(blocker);

        foreach (var stem in Tables)
        {
            foreach (var suffix in new[] { ".DBF", ".cdx", ".FPT" })
            {
                var path = Path.Combine(praxis, stem + suffix);
                if (suffix == ".FPT" && !File.Exists(path)) continue;
                try
                {
                    using var _ = File.Open(path, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite);
                }
                catch (IOException ex)
                {
                    var winErr = ex.HResult & 0xFFFF;
                    if (winErr is 32 or 33) throw new HkpError("HKP-Datei momentan gesperrt. Bitte erneut versuchen.");
                    throw new HkpError("Windows verweigert dem laufenden API-Prozess den Schreibzugriff. Connector-Service beenden und Start-Connector-Service.cmd als normalen Windows-Benutzer starten.");
                }
                catch (UnauthorizedAccessException)
                {
                    throw new HkpError("Windows verweigert dem laufenden API-Prozess den Schreibzugriff. Connector-Service beenden und Start-Connector-Service.cmd als normalen Windows-Benutzer starten.");
                }
            }
        }

        var backupRoot = DsWinPfad.SicherungsOrdner(backupBase, praxis);
        Directory.CreateDirectory(backupRoot);
        var pending = Path.Combine(backupRoot, "pending.json");
        if (File.Exists(pending))
            throw new HkpError("Vorheriges Speicherergebnis muss anhand des HKP-Protokolls geprüft werden. Nicht erneut anlegen.");
        var (pf, patients, _) = DbfTabelle.Table(Path.Combine(daten, "patient.dbf"));
        if (patients.Count(r => DbfTabelle.Active(r, pf, encoding) && Convert.ToString(DbfTabelle.Value(r, pf, "PATNR", encoding)) == patient) != 1)
            throw new HkpError("Patient ist nicht eindeutig vorhanden.");

        var dll = dllPath ?? DsWinEngine.ResolveDll(root);
        var app = new DsWinAppender(dll, encoding);
        DsWinAppender? sources = null;
        var operation = DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + "-" + TokenHex(6);
        var folder = Path.Combine(backupRoot, operation);
        Directory.CreateDirectory(folder);
        var journal = Path.Combine(folder, "operation.json");
        var committing = false;
        var start = Environment.TickCount64;

        void Schritt(string name)
        {
            try
            {
                var secs = (Environment.TickCount64 - start) / 1000.0;
                File.AppendAllText(Path.Combine(folder, "zeiten.log"),
                    string.Format(CultureInfo.InvariantCulture, "{0,7:F1}s {1}\n", secs, name), Encoding.UTF8);
            }
            catch { }
        }
        void State(string status, int? num = null)
        {
            Schritt(status);
            var rec = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["state"] = status, ["source"] = praxis, ["patient"] = patient, ["operation"] = operation,
            };
            if (num is int n) rec["number"] = n;
            File.WriteAllText(journal, JsonSerializer.Serialize(rec), Encoding.UTF8);
            if (status == "committing")
                File.WriteAllText(pending, JsonSerializer.Serialize(new { journal }), Encoding.UTF8);
        }

        try
        {
            using var lockObj = new DsWinLocks.AppLock(Path.Combine(praxis, "HKPPLAN.DBF"), 1);
            var handles = new Dictionary<string, IntPtr>(StringComparer.Ordinal);
            foreach (var stem in Tables)
            {
                var handle = app.Open(Path.Combine(praxis, stem + ".DBF"));
                handles[stem] = handle;
                if (app.E.LockAll(handle) != 0)
                    throw new HkpError("DS-Win speichert gerade HKP-Daten. Bitte erneut versuchen.");
            }
            using var notify = new DsWinLocks.TimNotify(Path.Combine(praxis, "HKPPLAN.DBF"));
            Schritt("gesperrt");

            var temp = Path.Combine(backupRoot, "tmp-" + TokenHex(6));
            Directory.CreateDirectory(temp);
            try
            {
                var stage = Path.Combine(temp, Path.GetFileName(praxis));
                Directory.CreateDirectory(stage);
                var before = new Dictionary<string, int>(StringComparer.Ordinal);
                var definitions = new Dictionary<string, (Dictionary<string, DbfField> Fields, int Width)>(StringComparer.Ordinal);
                foreach (var stem in Tables)
                {
                    var (f, r, w) = DbfTabelle.Table(Path.Combine(praxis, stem + ".DBF"));
                    before[stem] = r.Count;
                    definitions[stem] = (f, w);
                    foreach (var suffix in new[] { ".DBF", ".cdx", ".FPT" })
                    {
                        var path = Path.Combine(praxis, stem + suffix);
                        if (File.Exists(path))
                        {
                            var data = DbfTabelle.ReadBytesShared(path);
                            File.WriteAllBytes(Path.Combine(folder, Path.GetFileName(path)), data);
                            File.WriteAllBytes(Path.Combine(stage, Path.GetFileName(path)), data);
                        }
                    }
                }
                State("prepared");
                var result = stager(praxis, stage, dll, patient, encoding, importData);
                Schritt("vorbereitet");

                sources = new DsWinAppender(dll, encoding);
                var staged = new Dictionary<string, List<byte[]>>(StringComparer.Ordinal);
                var expected = new Dictionary<string, int>(StringComparer.Ordinal);
                var sourceHandles = new Dictionary<string, IntPtr>(StringComparer.Ordinal);
                foreach (var stem in Tables)
                {
                    var (fields, rows, width) = DbfTabelle.Table(Path.Combine(stage, stem + ".DBF"));
                    if (!FieldsEqual(fields, definitions[stem].Fields) || width != definitions[stem].Width)
                        throw new HkpError("HKP-Struktur hat sich geändert.");
                    staged[stem] = rows.Skip(before[stem]).ToList();
                    expected[stem] = rows.Count;
                    sourceHandles[stem] = sources.Open(Path.Combine(stage, stem + ".DBF"));
                    if (staged[stem].Count == 0)
                        throw new HkpError("HKP enthält unvollständige Verknüpfungen.");
                }
                var planNum = Convert.ToInt32(result["number"], CultureInfo.InvariantCulture);
                State("committing", planNum);
                committing = true;

                foreach (var stem in new[] { "HKPLST", "BEFUND", "HKPPLAN2", "HKPPLAN" })
                {
                    var (fields, _) = definitions[stem];
                    for (var idx = 0; idx < staged[stem].Count; idx++)
                    {
                        var row = staged[stem][idx];
                        var srcRec = before[stem] + 1 + idx;
                        app.Put(handles[stem], fields, row,
                            new Dictionary<string, object?>(StringComparer.Ordinal) { ["PK"] = DbfTabelle.Value(row, fields, "PK", encoding) },
                            sourceHandles[stem], srcRec);
                    }
                    app.Verify(handles[stem]);
                    var (_, actualRows, _) = DbfTabelle.Table(Path.Combine(praxis, stem + ".DBF"));
                    if (actualRows.Count != expected[stem])
                        throw new HkpError("Anzahl gespeicherter Datensätze stimmt nicht.");
                    for (var idx = 0; idx < staged[stem].Count; idx++)
                    {
                        var recno = before[stem] + 1 + idx;
                        var want = staged[stem][idx];
                        var got = actualRows[before[stem] + idx];
                        foreach (var (name, f) in fields)
                        {
                            if (f.Kind != 'M' && !want.AsSpan(f.Offset, f.Length).SequenceEqual(got.AsSpan(f.Offset, f.Length)))
                                throw new HkpError("Gespeicherter HKP konnte nicht bestätigt werden.");
                            if (f.Kind == 'M')
                            {
                                if (app.E.Go(handles[stem], recno, 1) != 0) throw new HkpError("Memo-Prüfung fehlgeschlagen.");
                                if (sources.E.Go(sourceHandles[stem], recno, 1) != 0) throw new HkpError("Memo-Quelle nicht lesbar.");
                                var a = app.E.Field(handles[stem], name);
                                var b = sources.E.Field(sourceHandles[stem], name);
                                var lenA = app.E.MemoLen(a);
                                var lenB = sources.E.MemoLen(b);
                                if (lenA != lenB || (lenA > 0 && !app.E.MemoBytes(a).SequenceEqual(sources.E.MemoBytes(b))))
                                    throw new HkpError("Memo-Inhalt wurde nicht bestätigt.");
                            }
                        }
                    }
                }

                sources.Dispose();
                sources = null;
                notify.Notify();
                State("committed", planNum);
                File.Delete(pending);
                committing = false;
                var saved = (result.TryGetValue("label", out var lbl) && lbl is string ls
                    ? ls + " als Plan "
                    : importData is not null ? "HKP-JSON als Plan " : "HKP ") + planNum;
                result["test"] = false;
                result["source"] = praxis;
                result["backup"] = operation;
                result["loadVerified"] = false;
                result["message"] = saved + " im echten DS-Win-Bestand gespeichert. HKP-Auswahl in DS-Win erneut laden.";
                return result;
            }
            finally
            {
                sources?.Dispose();
                sources = null;
                try { Directory.Delete(temp, recursive: true); } catch { }
            }
        }
        catch
        {
            if (committing)
            {
                State("verification-required");
                throw new HkpError("Speicherergebnis nicht vollständig bestätigt. Nicht erneut klicken; HKP und Sicherungsprotokoll prüfen.");
            }
            throw;
        }
        finally
        {
            sources?.Dispose();
            foreach (var h in app.Handles) app.E.Changed(h, 0);
            app.Dispose();
        }
    }
}
