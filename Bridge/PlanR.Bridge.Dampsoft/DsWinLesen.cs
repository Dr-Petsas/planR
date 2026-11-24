using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Dampsoft;

/// <summary>1:1-Port von dswin_labor.py, befund.py, hkp.py, hkp_planr.py und praxis_katalog.py.</summary>
public static class DsWinLabor
{
    public static readonly Dictionary<int, string[]> Files = new()
    {
        [1] = ["BEL1"], [2] = ["BEL204", "BEL2"], [3] = ["BEB"], [4] = ["BEB97"],
        [5] = ["BEB01"], [6] = ["BEB02"], [7] = ["BEB03"], [8] = ["BEB04"], [9] = ["BEB05"],
    };
    public static readonly int[] BelLists = [2, 1];
    public static readonly int[] BebLists = [3, 5, 6, 7, 8, 9];
    public static readonly Dictionary<(string Planart, string Kind), string> Header = new()
    {
        [("1", "L")] = "LABTYPKASS", [("1", "F")] = "LABTYPKF",
        [("3", "L")] = "LABTYPPRIV", [("3", "F")] = "LABTYPPRIF",
    };

    static readonly (string Name, string Art, Regex Pattern)[] Werkstoffe =
    [
        ("nem", "metall", new(@"\bnem\b|nichtedel|co-?cr|kobalt|wirobond|remanium", RegexOptions.Compiled)),
        ("goldreduziert", "metall", new(@"reduz|\bred\b|spargold|palladium|\bpd\b", RegexOptions.Compiled)),
        ("hochgold", "metall", new(@"hochgold|edelmetall|\bgold\b|\bau\b|herador|degunorm", RegexOptions.Compiled)),
        ("presskeramik", "keramik", new(@"press", RegexOptions.Compiled)),
        ("lithiumdisilikat", "keramik", new(@"lithium|disilikat|e\.?\s?max|\blisi\b", RegexOptions.Compiled)),
        ("zirkon", "keramik", new(@"zirkon|\bzro|\bzr\b", RegexOptions.Compiled)),
    ];

    public static readonly Regex MaterialCodeRe = new(@"^([A-Za-z]{1,2}\d{0,3}|NEMPS)$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    public static readonly Regex DsWinCodeRe = new(@"DS-Win ([A-Za-z0-9-]{1,6})\)?$", RegexOptions.Compiled);

    public static (string? Name, string? Art) Werkstoff(string? text)
    {
        var t = (text ?? "").ToLowerInvariant();
        foreach (var (name, art, pat) in Werkstoffe)
            if (pat.IsMatch(t)) return (name, art);
        return (null, null);
    }

    public sealed class Listen
    {
        readonly string _daten;
        readonly string _encoding;
        readonly Dictionary<int, Dictionary<string, (string Bez, bool Eigen, double Preis)>> _cache = new();
        readonly Dictionary<string, string> _texte = new(StringComparer.Ordinal);
        readonly Dictionary<string, string> _werkstoffe = new(StringComparer.Ordinal);

        public Listen(string daten, string encoding, string? mappingPath = null)
        {
            _daten = daten;
            _encoding = encoding;
            var path = mappingPath
                ?? Environment.GetEnvironmentVariable("DSWIN_LABORZUORDNUNG")
                ?? Path.Combine(AppContext.BaseDirectory, "dswin_laborzuordnung.json");
            if (File.Exists(path))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
                if (doc.RootElement.TryGetProperty("texte", out var t) && t.ValueKind == JsonValueKind.Object)
                    foreach (var p in t.EnumerateObject()) if (p.Value.ValueKind == JsonValueKind.String) _texte[p.Name] = p.Value.GetString()!;
                if (doc.RootElement.TryGetProperty("werkstoffe", out var w) && w.ValueKind == JsonValueKind.Object)
                    foreach (var p in w.EnumerateObject()) if (p.Value.ValueKind == JsonValueKind.String) _werkstoffe[p.Name] = p.Value.GetString()!;
            }
        }

        public string? Datei(int nummer)
        {
            if (!Files.TryGetValue(nummer, out var stems)) return null;
            foreach (var stem in stems)
            {
                var p = Path.Combine(_daten, stem + ".DBF");
                if (File.Exists(p)) return p;
            }
            return null;
        }

        public Dictionary<string, (string Bez, bool Eigen, double Preis)> Codes(int nummer)
        {
            if (_cache.TryGetValue(nummer, out var cached)) return cached;
            var outMap = new Dictionary<string, (string Bez, bool Eigen, double Preis)>(StringComparer.Ordinal);
            if (Files.TryGetValue(nummer, out var stems))
            {
                foreach (var stem in stems)
                {
                    var p = Path.Combine(_daten, stem + ".DBF");
                    if (!File.Exists(p)) continue;
                    var (f, rows, _) = DbfTabelle.Table(p);
                    foreach (var r in rows)
                    {
                        var code = (Convert.ToString(DbfTabelle.Value(r, f, "GEBNR", _encoding)) ?? "").ToUpperInvariant();
                        if (DbfTabelle.Active(r, f, _encoding) && code.Length > 0
                            && Convert.ToString(DbfTabelle.Value(r, f, "NOTVISIBLE", _encoding)) != "J")
                        {
                            outMap[code] = (
                                Convert.ToString(DbfTabelle.Value(r, f, "BEZ", _encoding)) ?? "",
                                Convert.ToString(DbfTabelle.Value(r, f, "EIGENLABOR", _encoding)) == "J",
                                Convert.ToDouble(DbfTabelle.Value(r, f, "PREIS_1", _encoding) ?? 0.0)
                            );
                        }
                    }
                    break;
                }
            }
            _cache[nummer] = outMap;
            return outMap;
        }

        public string Name(int nummer) => nummer switch
        {
            2 => "BEL2", 3 => "BEB", 4 => "BEB97",
            _ => Files.TryGetValue(nummer, out var s) && s.Length > 0 ? s[0] : "?",
        };

        public int ListeFuer(List<string> codes, int bevorzugt, int[] kandidaten)
        {
            var order = kandidaten.Contains(bevorzugt)
                ? new[] { bevorzugt }.Concat(kandidaten.Where(k => k != bevorzugt)).ToList()
                : kandidaten.ToList();
            foreach (var k in order)
            {
                var map = Codes(k);
                if (codes.Count > 0 && codes.All(c => map.ContainsKey(c.ToUpperInvariant()))) return k;
            }
            foreach (var k in order) if (Codes(k).Count > 0) return k;
            return order[0];
        }

        public (string? Code, string? Reason) Material(string? text, int nummer)
        {
            var liste = Codes(nummer);
            var herkunft = DsWinCodeRe.Match(text ?? "");
            if (herkunft.Success && liste.ContainsKey(herkunft.Groups[1].Value.ToUpperInvariant()))
                return (herkunft.Groups[1].Value.ToUpperInvariant(), null);
            string? fest = null;
            if (!string.IsNullOrEmpty(text) && _texte.TryGetValue(text, out var ft)) fest = ft;
            var (name, art) = Werkstoff(text);
            if (string.IsNullOrEmpty(fest) && !string.IsNullOrEmpty(name) && _werkstoffe.TryGetValue(name, out var fw)) fest = fw;
            if (!string.IsNullOrEmpty(fest))
                return liste.ContainsKey(fest.ToUpperInvariant()) ? (fest.ToUpperInvariant(), null) : (null, $"Kürzel {fest} fehlt in {Name(nummer)}");
            if (string.IsNullOrEmpty(name)) return (null, "Werkstoff nicht erkannt");
            var prefix = art == "metall" ? "M" : "";
            var treffer = liste.Where(kv => MaterialCodeRe.IsMatch(kv.Key) && kv.Key.StartsWith(prefix, StringComparison.Ordinal)
                && Werkstoff(kv.Value.Bez).Name == name).Select(kv => kv.Key).ToList();
            if (treffer.Count == 1) return (treffer[0], null);
            if (treffer.Count > 0) return (null, $"{name} mehrdeutig in {Name(nummer)} ({string.Join(", ", treffer)})");
            return (null, $"kein Kürzel für {name} in {Name(nummer)}");
        }
    }
}

public static class DsWinBefund
{
    public static readonly string[] Teeth =
        [.. from q in new[] { 1, 2, 3, 4 } from n in Enumerable.Range(1, 8) select (q * 10 + n).ToString()];

    static readonly string[] EhkpCodes =
    [
        "a", "ab", "abw", "aw", "b", "bw", "e", "ew", "f", "ix", "k", "kw", "pw", "pkw", "r", "rw",
        "sb", "sbw", "se", "sew", "sk", "skw", "so", "sow", "st", "stw", "t", "t2w", "tw", "ur", "ww", "x", ")(",
    ];
    public static readonly HashSet<string> DpfCodes = new(StringComparer.Ordinal) { "f", "k", "x", "w", "ww", "kw" };
    static readonly Regex CodeRe = new(@"^[a-z0-9)(]{1,4}$", RegexOptions.Compiled);
    static readonly Regex Sha64Re = new(@"^[0-9a-f]{64}$", RegexOptions.Compiled);
    static readonly Dictionary<string, char> NeutralShape = Teeth
        .Zip("66621333666213336661122266611222", (t, c) => (t, c))
        .ToDictionary(x => x.t, x => x.c, StringComparer.Ordinal);

    public static HashSet<string> FindingCodes(string? root = null)
    {
        var codes = new HashSet<string>(EhkpCodes, StringComparer.Ordinal) { "i" };
        foreach (var d in DpfCodes) codes.Add(d);
        if (!string.IsNullOrEmpty(root))
        {
            var pfad = Path.Combine(root, "eHKPBefunde.txt");
            if (File.Exists(pfad))
            {
                try
                {
                    var text = DsWinPfad.EncodingByName("cp850", strict: false).GetString(File.ReadAllBytes(pfad));
                    foreach (var line in text.Split('\n'))
                    {
                        var c = line.Trim();
                        if (CodeRe.IsMatch(c)) codes.Add(c);
                    }
                }
                catch { }
            }
        }
        return codes;
    }

    public static string ToothStatus(byte[] raw) =>
        Encoding.ASCII.GetString(raw, 1, 4).Trim();

    public static byte[] ZaBytes(byte[] row, Dictionary<string, DbfField> fields, string tooth)
    {
        var f = fields["ZA" + tooth];
        var buf = new byte[f.Length];
        Buffer.BlockCopy(row, f.Offset, buf, 0, f.Length);
        return buf;
    }

    public static void ValidateLayout(Dictionary<string, DbfField> fields, int width)
    {
        var req = new Dictionary<string, (char Kind, int Len)>(StringComparer.Ordinal)
        {
            ["PK"] = ('B', 8), ["PATNR"] = ('C', 5), ["DATUM"] = ('D', 8), ["BEFTYP"] = ('C', 1),
            ["HKPNR"] = ('N', 6), ["GEBNR"] = ('C', 6), ["PATINFO_PK"] = ('N', 8), ["DEL"] = ('C', 1),
        };
        foreach (var t in Teeth) { req["ZA" + t] = ('C', 80); req["ZF" + t] = ('C', 36); }
        for (var i = 1; i <= 3; i++) req["SONST" + i] = ('C', 30);
        if (width != 3870 || req.Any(kv => !fields.TryGetValue(kv.Key, out var f) || f.Kind != kv.Value.Kind || f.Length != kv.Value.Len))
            throw new EditUnavailable("Befundstruktur unterscheidet sich von der geprüften Installation.");
    }

    public static bool GleichePatnr(object? gespeichert, string gesucht)
    {
        var a = (Convert.ToString(gespeichert) ?? "").Trim();
        var b = (gesucht ?? "").Trim();
        if (a == b) return true;
        if (a.Length > 0 && b.Length > 0 && a.All(char.IsAsciiDigit) && b.All(char.IsAsciiDigit))
        {
            var al = a.TrimStart('0');
            return al.Length > 0 && al == b.TrimStart('0');
        }
        return false;
    }

    public static List<(int RecNo, byte[] Row)> Befundzeilen(
        Dictionary<string, DbfField> fields, List<byte[]> rows, string patient, string typ, bool nurOhneHkp, string encoding)
    {
        var treffer = new List<(int, byte[])>();
        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (!DbfTabelle.Active(row, fields, encoding) || !GleichePatnr(DbfTabelle.Value(row, fields, "PATNR", encoding), patient))
                continue;
            if (Convert.ToString(DbfTabelle.Value(row, fields, "BEFTYP", encoding)) != typ) continue;
            if (nurOhneHkp && Convert.ToDouble(DbfTabelle.Value(row, fields, "HKPNR", encoding) ?? 0.0) != 0.0) continue;
            treffer.Add((i + 1, row));
        }
        return treffer;
    }

    static (int RecNo, byte[] Row) Neueste(Dictionary<string, DbfField> fields, List<(int RecNo, byte[] Row)> treffer, string encoding) =>
        treffer.OrderByDescending(p => Convert.ToString(DbfTabelle.Value(p.Row, fields, "DATUM", encoding)) ?? "", StringComparer.Ordinal)
               .ThenByDescending(p => Convert.ToDouble(DbfTabelle.Value(p.Row, fields, "PK", encoding) ?? 0.0))
               .First();

    public static (int RecNo, byte[] Row) CurrentRow(Dictionary<string, DbfField> fields, List<byte[]> rows, string patient, string encoding)
    {
        var found = Befundzeilen(fields, rows, patient, "A", true, encoding);
        if (found.Count != 1)
            throw new EditConflict("Aktueller Befund fehlt oder ist nicht eindeutig. Patient zunächst in DS-Win öffnen.");
        return found[0];
    }

    public static (int RecNo, byte[] Row) WaehleAktuell(Dictionary<string, DbfField> fields, List<byte[]> rows, string patient, string encoding)
    {
        var status = Befundzeilen(fields, rows, patient, "A", true, encoding);
        if (status.Count == 1) return status[0];
        if (status.Count > 1) return Neueste(fields, status, encoding);
        var angehaengt = Befundzeilen(fields, rows, patient, "A", false, encoding);
        if (angehaengt.Count > 0) return Neueste(fields, angehaengt, encoding);
        var historie = Befundzeilen(fields, rows, patient, "0", true, encoding);
        if (historie.Count > 0) return Neueste(fields, historie, encoding);
        throw new EditConflict("Aktueller Befund fehlt oder ist nicht eindeutig. Patient zunächst in DS-Win öffnen.");
    }

    public static Dictionary<string, object?> Describe(byte[] row, Dictionary<string, DbfField> fields, string encoding)
    {
        var teeth = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var t in Teeth)
        {
            var st = ToothStatus(ZaBytes(row, fields, t));
            teeth[t] = new Dictionary<string, object?>
            {
                ["raw"] = DbfTabelle.Value(row, fields, "ZA" + t, encoding),
                ["status"] = st,
                ["missing"] = st == "f",
            };
        }
        return new Dictionary<string, object?>
        {
            ["id"] = Convert.ToInt32(DbfTabelle.Value(row, fields, "PK", encoding)),
            ["date"] = DbfTabelle.Value(row, fields, "DATUM", encoding),
            ["kind"] = DbfTabelle.Value(row, fields, "BEFTYP", encoding),
            ["code"] = DbfTabelle.Value(row, fields, "GEBNR", encoding),
            ["notes"] = new List<object?>
            {
                DbfTabelle.Value(row, fields, "SONST1", encoding),
                DbfTabelle.Value(row, fields, "SONST2", encoding),
                DbfTabelle.Value(row, fields, "SONST3", encoding),
            },
            ["teeth"] = teeth,
        };
    }

    public static bool InHistory(Dictionary<string, DbfField> fields, List<byte[]> rows, string patient, byte[] current, string encoding)
    {
        var history = Befundzeilen(fields, rows, patient, "0", true, encoding);
        if (history.Count == 0) return false;
        var newest = Neueste(fields, history, encoding).Row;
        foreach (var t in Teeth)
        {
            foreach (var n in new[] { "ZA" + t, "ZF" + t })
            {
                var f = fields[n];
                if (!newest.AsSpan(f.Offset, f.Length).SequenceEqual(current.AsSpan(f.Offset, f.Length))) return false;
            }
        }
        return true;
    }

    public static Dictionary<string, object?> ReadFindings(string dataRoot, string patient, int praxis, string encoding)
    {
        var (fields, rows, width) = DbfTabelle.TableGecacht(Path.Combine(dataRoot, $"PRAX{praxis}", "BEFUND.DBF"));
        ValidateLayout(fields, width);
        var (_, current) = WaehleAktuell(fields, rows, patient, encoding);
        var history = Befundzeilen(fields, rows, patient, "0", true, encoding)
            .Select(p => Describe(p.Row, fields, encoding))
            .OrderByDescending(r => Convert.ToString(r["date"]) ?? "", StringComparer.Ordinal)
            .ThenByDescending(r => Convert.ToInt32(r["id"]))
            .Cast<object?>().ToList();
        return new Dictionary<string, object?>
        {
            ["current"] = Describe(current, fields, encoding),
            ["version"] = Convert.ToHexString(SHA256.HashData(current)).ToLowerInvariant(),
            ["items"] = history,
        };
    }

    public static Dictionary<string, (byte[] Za, byte[] Zf)> NeutralTeeth(Dictionary<string, DbfField> fields, List<byte[]> rows, string encoding)
    {
        var unique = new Dictionary<string, Dictionary<string, (byte[] Za, byte[] Zf)>>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            if (!DbfTabelle.Active(row, fields, encoding)) continue;
            if (Convert.ToString(DbfTabelle.Value(row, fields, "PATNR", encoding)) != "#####") continue;
            if (Convert.ToString(DbfTabelle.Value(row, fields, "BEFTYP", encoding)) != "A") continue;
            var map = new Dictionary<string, (byte[] Za, byte[] Zf)>(StringComparer.Ordinal);
            var keySb = new StringBuilder();
            foreach (var t in Teeth)
            {
                var fa = fields["ZA" + t]; var ff = fields["ZF" + t];
                var za = new byte[fa.Length]; Buffer.BlockCopy(row, fa.Offset, za, 0, fa.Length);
                var zf = new byte[ff.Length]; Buffer.BlockCopy(row, ff.Offset, zf, 0, ff.Length);
                map[t] = (za, zf);
                keySb.Append(Convert.ToHexString(za)).Append('|').Append(Convert.ToHexString(zf)).Append(';');
            }
            unique[keySb.ToString()] = map;
        }
        if (unique.Count == 1) return unique.Values.First();
        var zaSize = fields["ZA11"].Length;
        var zfSize = fields["ZF11"].Length;
        var res = new Dictionary<string, (byte[] Za, byte[] Zf)>(StringComparer.Ordinal);
        foreach (var t in Teeth)
        {
            var za = new byte[zaSize]; Array.Fill(za, (byte)' ');
            var s = NeutralShape[t] + "    " + new string('A', 24);
            Encoding.ASCII.GetBytes(s, 0, s.Length, za, 0);
            var zf = new byte[zfSize]; Array.Fill(zf, (byte)' ');
            res[t] = (za, zf);
        }
        return res;
    }

    public static (int RecNo, byte[] Before, byte[] Wanted) PrepareFinding(
        Dictionary<string, DbfField> fields, List<byte[]> rows, int width, string patient,
        Dictionary<string, object?> payload, string encoding, List<string>? selection = null, HashSet<string>? codes = null)
    {
        ValidateLayout(fields, width);
        var (recno, before) = CurrentRow(fields, rows, patient, encoding);
        var allowedKeys = new HashSet<string>(StringComparer.Ordinal) { "version", "teeth", "note" };
        if (payload.Keys.Any(k => !allowedKeys.Contains(k))
            || payload.GetValueOrDefault("version") is not string ver || !Sha64Re.IsMatch(ver))
            throw new EditError("Befundversion und gültiger JSON-Auftrag erforderlich.");
        if (Convert.ToHexString(SHA256.HashData(before)).ToLowerInvariant() != ver)
            throw new EditConflict("Befund wurde inzwischen geändert. Erneut laden.");
        if (payload.GetValueOrDefault("teeth") is not Dictionary<string, object?> teethObj || teethObj.Count == 0)
            throw new EditError("teeth enthält einen nicht unterstützten Zahnstatus.");
        var teethSet = new HashSet<string>(Teeth, StringComparer.Ordinal);
        var teeth = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (t, sv) in teethObj)
        {
            if (!teethSet.Contains(t) || sv is not string s)
                throw new EditError("teeth enthält einen nicht unterstützten Zahnstatus.");
            teeth[t] = s;
        }
        var allowedStatuses = new HashSet<string>(codes ?? FindingCodes(), StringComparer.Ordinal) { "healthy", "missing" };
        var unsupported = teeth.Where(kv => !allowedStatuses.Contains(kv.Value))
            .Select(kv => $"{kv.Key} {kv.Value}").OrderBy(x => x, StringComparer.Ordinal).ToList();
        if (unsupported.Count > 0)
            throw new EditError("DS-Win kennt diese Befundkürzel nicht: " + string.Join(", ", unsupported));

        var filtered = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (t, s) in teeth)
        {
            var wantedCode = s == "healthy" ? "" : s == "missing" ? "f" : s;
            if (ToothStatus(ZaBytes(before, fields, t)) != wantedCode) filtered[t] = s;
        }
        selection?.AddRange(filtered.Keys);

        var noteObj = payload.TryGetValue("note", out var nVal) ? nVal : (Convert.ToString(DbfTabelle.Value(before, fields, "SONST3", encoding)) ?? "");
        if (noteObj is not string note || note.Length > 30 || note.Any(c => c < 32))
            throw new EditError("note darf höchstens 30 Zeichen enthalten.");
        byte[] noteBytes;
        try { noteBytes = DsWinPfad.EncodingByName(encoding, strict: true).GetBytes(note); }
        catch (EncoderFallbackException) { throw new EditError($"Befundnotiz ist nicht in {encoding} darstellbar."); }

        var neutral = NeutralTeeth(fields, rows, encoding);
        var wanted = (byte[])before.Clone();
        void Put(string name, byte[] raw)
        {
            var f = fields[name];
            if (raw.Length > f.Length) throw new EditError("Befundwert zu lang.");
            Array.Fill(wanted, (byte)' ', f.Offset, f.Length);
            Buffer.BlockCopy(raw, 0, wanted, f.Offset, raw.Length);
        }
        foreach (var (tooth, status) in filtered)
        {
            var (za, zf) = neutral[tooth];
            var raw = (byte[])za.Clone();
            var ok = raw[0] is (byte)'1' or (byte)'2' or (byte)'3' or (byte)'6'
                && raw[1] == ' ' && raw[2] == ' ' && raw[3] == ' ' && raw[4] == ' '
                && Enumerable.Range(5, 24).All(i => raw[i] == (byte)'A')
                && Enumerable.Range(29, raw.Length - 29).All(i => raw[i] == (byte)' ');
            if (!ok) throw new EditUnavailable("Neutraler Zahnstatus hat ein unbekanntes Format.");
            if (status == "missing") raw[1] = (byte)'f';
            else if (status != "healthy")
            {
                var stBytes = Encoding.ASCII.GetBytes(status.PadRight(4));
                Buffer.BlockCopy(stBytes, 0, raw, 1, 4);
            }
            Put("ZA" + tooth, raw);
            Put("ZF" + tooth, zf);
        }
        Put("SONST3", noteBytes);
        Put("GEBNR", "BEFUND"u8.ToArray());
        Put("DATUM", []);
        return (recno, before, wanted);
    }
}

public static class DsWinHkp
{
    static readonly Dictionary<int, string> Titles = new() { [2] = "Kostenvoranschlag", [8] = "Mehrkostenvereinbarung" };
    static readonly Dictionary<int, string> Boni = new() { [60] = "60", [70] = "70", [75] = "75" };
    static readonly Dictionary<string, string> Anreden = new(StringComparer.Ordinal) { ["H"] = "Herr", ["F"] = "Frau" };
    static readonly Regex ToothRe = new(@"^ZA([1-4][1-8])$", RegexOptions.Compiled);
    static readonly Regex LabRe = new(@"^(\d{3})-(\d)$", RegexOptions.Compiled);
    static readonly Regex BebRe = new(@"^[05](\d{4})$", RegexOptions.Compiled);
    static readonly Regex Date8Re = new(@"^\d{8}$", RegexOptions.Compiled);
    static readonly Regex Digits9Re = new(@"^\d{9}$", RegexOptions.Compiled);
    static readonly Regex StatusRe = new(@"^\d{1,7}$", RegexOptions.Compiled);

    static double? Amount(byte[] row, Dictionary<string, DbfField> fields, string name, string encoding)
    {
        if (!fields.ContainsKey(name)) return null;
        return Math.Round(Convert.ToDouble(DbfTabelle.Value(row, fields, name, encoding) ?? 0.0), 2, MidpointRounding.ToEven);
    }

    public static Dictionary<string, object?> PlanAmounts(byte[] row, Dictionary<string, DbfField> fields, string encoding)
    {
        var kind = Convert.ToInt32(DbfTabelle.Value(row, fields, "PLANUNGART", encoding) ?? 0);
        if ((kind & 1) != 0)
            return new Dictionary<string, object?>
            {
                ["total"] = Amount(row, fields, "AB5", encoding),
                ["subsidy"] = Amount(row, fields, "AB8", encoding),
                ["patientShare"] = Amount(row, fields, "AB11", encoding),
                ["amountSource"] = "HKP Abschnitt V",
            };
        if (kind == 2)
        {
            var total = Amount(row, fields, "PGESAMT", encoding);
            return new Dictionary<string, object?>
            {
                ["total"] = total, ["subsidy"] = 0, ["patientShare"] = total, ["amountSource"] = "Privatplan",
            };
        }
        if (kind == 8 && fields.ContainsKey("MKVGESAMT"))
        {
            var total = Math.Round((Amount(row, fields, "MKVZAHNHON", encoding) ?? 0.0) + (Amount(row, fields, "MKVLABOR", encoding) ?? 0.0), 2, MidpointRounding.ToEven);
            return new Dictionary<string, object?>
            {
                ["total"] = total, ["subsidy"] = Amount(row, fields, "MKVKASSE", encoding),
                ["patientShare"] = Amount(row, fields, "MKVGESAMT", encoding), ["amountSource"] = "Mehrkostenvereinbarung",
            };
        }
        return new Dictionary<string, object?>
        {
            ["total"] = null, ["subsidy"] = null, ["patientShare"] = null, ["amountSource"] = "Planart noch nicht zugeordnet",
        };
    }

    static object? TruthyVal(object? v) => v switch
    {
        null => null,
        string s when s.Length == 0 => null,
        long l when l == 0 => null,
        int i when i == 0 => null,
        double d when d == 0.0 => null,
        bool b when !b => null,
        _ => v,
    };

    public static object PlanTitle(byte[] row, Dictionary<string, DbfField> fields, string encoding)
    {
        var kind = Convert.ToInt32(DbfTabelle.Value(row, fields, "PLANUNGART", encoding) ?? 0);
        var note = fields.ContainsKey("BEMERK1") ? Convert.ToString(DbfTabelle.Value(row, fields, "BEMERK1", encoding)) ?? "" : "";
        var bez = TruthyVal(DbfTabelle.Value(row, fields, "HKPBEZ", encoding));
        if (bez is not null) return bez;
        if (Titles.ContainsKey(kind) && note.Length > 0) return note;
        return Titles.TryGetValue(kind, out var t) ? t : "Heil- und Kostenplan";
    }

    public static List<Dictionary<string, object?>> ListPlans(string dataRoot, string patientNumber, int praxis, string encoding)
    {
        var planPath = Path.Combine(dataRoot, $"PRAX{praxis}", "HKPPLAN.DBF");
        var (fields, rows, _) = DbfTabelle.Table(planPath);
        foreach (var req in new[] { "PK", "PATNR", "HKPNR", "DATUM", "HKPBEZ" })
            if (!fields.ContainsKey(req)) throw new ArgumentException("HKP-Struktur wird nicht unterstützt.");
        var (lf, lines, _) = DbfTabelle.Table(Path.Combine(dataRoot, $"PRAX{praxis}", "HKPLST.DBF"));
        var counts = new Dictionary<int, int>();
        foreach (var line in lines)
        {
            if (DbfTabelle.Active(line, lf, encoding) && Convert.ToString(DbfTabelle.Value(line, lf, "PATNR", encoding)) == patientNumber)
            {
                var key = Convert.ToInt32(DbfTabelle.Value(line, lf, "HKPNR", encoding));
                counts[key] = counts.GetValueOrDefault(key) + 1;
            }
        }
        var plans = new List<Dictionary<string, object?>>();
        foreach (var row in rows)
        {
            if (!DbfTabelle.Active(row, fields, encoding) || Convert.ToString(DbfTabelle.Value(row, fields, "PATNR", encoding)) != patientNumber)
                continue;
            var number = Convert.ToInt32(DbfTabelle.Value(row, fields, "HKPNR", encoding));
            var st = Convert.ToString(DbfTabelle.Value(row, fields, "STATUS", encoding)) ?? "";
            var item = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["number"] = number, ["title"] = PlanTitle(row, fields, encoding),
                ["date"] = DbfTabelle.Value(row, fields, "DATUM", encoding),
                ["status"] = st.Length > 0 ? st : "ohne Statuskennzeichen",
            };
            foreach (var (k, v) in PlanAmounts(row, fields, encoding)) item[k] = v;
            item["lineCount"] = counts.GetValueOrDefault(number);
            item["test"] = false;
            plans.Add(item);
        }
        plans.Sort((a, b) => Convert.ToInt32(b["number"]).CompareTo(Convert.ToInt32(a["number"])));
        return plans;
    }

    static string PatNr(object? raw) => raw switch
    {
        double d => d == Math.Truncate(d) ? ((long)d).ToString() : "",
        _ => (Convert.ToString(raw) ?? "").Trim(),
    };

    static string? Datum(byte[] row, Dictionary<string, DbfField> fields, string name, string encoding)
    {
        if (!fields.ContainsKey(name)) return null;
        return DbfTabelle.Value(row, fields, name, encoding) is string s && s.Length == 10 ? s : null;
    }

    public static List<Dictionary<string, object?>> GenehmigtOffen(string dataRoot, HashSet<int>? praxen, string encoding)
    {
        var namen = new Dictionary<(int, string), (string Vor, string Nach)>();
        var patPfad = Path.Combine(dataRoot, "patient.dbf");
        if (File.Exists(patPfad))
        {
            var (pf, prows, _) = DbfTabelle.Table(patPfad);
            foreach (var r in prows)
            {
                if (!DbfTabelle.Active(r, pf, encoding)) continue;
                var pat = PatNr(DbfTabelle.Value(r, pf, "PATNR", encoding));
                if (pat.Length == 0) continue;
                var pr = pf.ContainsKey("PRAXIS") ? DsWinPfad.PraxisNummer(DbfTabelle.Value(r, pf, "PRAXIS", encoding)) : 1;
                if (praxen is not null && !praxen.Contains(pr)) continue;
                namen[(pr, pat)] = (
                    (Convert.ToString(DbfTabelle.Value(r, pf, "VORNAME", encoding)) ?? "").Trim(),
                    (Convert.ToString(DbfTabelle.Value(r, pf, "NAME", encoding)) ?? "").Trim()
                );
            }
        }
        var treffer = new List<Dictionary<string, object?>>();
        for (var n = 1; n <= 9; n++)
        {
            if (praxen is not null && !praxen.Contains(n)) continue;
            var planPath = Path.Combine(dataRoot, $"PRAX{n}", "HKPPLAN.DBF");
            if (!File.Exists(planPath)) continue;
            var (f, rows, _) = DbfTabelle.Table(planPath);
            if (!f.ContainsKey("PATNR") || !f.ContainsKey("HKPNR") || !f.ContainsKey("ZUSCHUSS") || !f.ContainsKey("ABRECH"))
                continue;
            foreach (var r in rows)
            {
                if (!DbfTabelle.Active(r, f, encoding)) continue;
                var genehmigt = Datum(r, f, "ZUSCHUSS", encoding);
                if (genehmigt is null || Datum(r, f, "ABRECH", encoding) is not null) continue;
                var pat = PatNr(DbfTabelle.Value(r, f, "PATNR", encoding));
                if (pat.Length == 0) continue;
                namen.TryGetValue((n, pat), out var nm);
                var vor = nm.Vor ?? ""; var nach = nm.Nach ?? "";
                if (nach.Length == 0 && f.ContainsKey("NAME"))
                {
                    nach = (Convert.ToString(DbfTabelle.Value(r, f, "NAME", encoding)) ?? "").Trim();
                    vor = f.ContainsKey("VORNAME") ? (Convert.ToString(DbfTabelle.Value(r, f, "VORNAME", encoding)) ?? "").Trim() : "";
                }
                var titel = PlanTitle(r, f, encoding);
                treffer.Add(new Dictionary<string, object?>
                {
                    ["praxis"] = n, ["patient"] = pat,
                    ["number"] = Convert.ToInt32(DbfTabelle.Value(r, f, "HKPNR", encoding) ?? 0),
                    ["title"] = titel is string ts && ts == "Heil- und Kostenplan" ? "" : titel,
                    ["name"] = nach, ["vorname"] = vor,
                    ["date"] = Datum(r, f, "DATUM", encoding),
                    ["genehmigt"] = genehmigt,
                    ["eingliederung"] = Datum(r, f, "EINGLIED", encoding),
                });
            }
        }
        treffer.Sort((a, b) =>
        {
            var c = string.CompareOrdinal(Convert.ToString(b["genehmigt"]), Convert.ToString(a["genehmigt"]));
            if (c != 0) return c;
            c = Convert.ToInt32(b["praxis"]).CompareTo(Convert.ToInt32(a["praxis"]));
            return c != 0 ? c : Convert.ToInt32(b["number"]).CompareTo(Convert.ToInt32(a["number"]));
        });
        return treffer.Count > 2000 ? treffer.GetRange(0, 2000) : treffer;
    }

    // --- hkp_planr.py ---
    public static Dictionary<string, string> ToothRows(string tooth, string? text)
    {
        var raw = (text ?? "").Split("\r\n");
        var lines = new string[3];
        for (var i = 0; i < 3; i++) lines[i] = i < raw.Length ? raw[i].Replace("-", "").Trim() : "";
        var (tp, r, b) = tooth[0] is '1' or '2' ? (lines[0], lines[1], lines[2]) : (lines[2], lines[1], lines[0]);
        return new Dictionary<string, string>(StringComparer.Ordinal) { ["B"] = b, ["R"] = r, ["TP"] = tp };
    }

    public static string HCell(string tooth, string b = "", string r = "", string tp = "")
    {
        var lines = tooth[0] is '1' or '2' ? new List<string> { tp, r, b } : new List<string> { b, r, tp };
        while (lines.Count > 0 && lines[^1].Length == 0) lines.RemoveAt(lines.Count - 1);
        return string.Join("\r\n", lines);
    }

    static Dictionary<string, object?> Versicherung(string praxisDir, string patnr, string encoding)
    {
        var daten = Path.GetDirectoryName(praxisDir)!;
        var kopf = new Dictionary<string, object?>(StringComparer.Ordinal);
        (Dictionary<string, DbfField>? F, List<byte[]> Rows) Zeilen(string pfad)
        {
            try
            {
                var (f, rows, _) = DbfTabelle.Table(pfad);
                return (f, rows.Where(r => DbfTabelle.Active(r, f, encoding)
                    && (Convert.ToString(DbfTabelle.Value(r, f, "PATNR", encoding)) ?? "") == patnr).ToList());
            }
            catch (IOException) { return (null, []); }
        }
        var (pf, pat) = Zeilen(Path.Combine(daten, "patient.dbf"));
        var (kf, karten) = Zeilen(Path.Combine(praxisDir, "KARTE.DBF"));
        var karte = karten.Count > 0 && kf is not null
            ? karten.OrderByDescending(r => Convert.ToString(DbfTabelle.Value(r, kf, "LESEDATUM", encoding) ?? DbfTabelle.Value(r, kf, "GUELTIGAB", encoding)) ?? "", StringComparer.Ordinal).First()
            : null;
        var p = pat.Count == 1 ? pat[0] : null;
        var kknr = (p is not null && pf is not null ? Convert.ToString(DbfTabelle.Value(p, pf, "KKNR", encoding)) ?? "" : "");
        if (kknr.Length == 0 && karte is not null && kf is not null) kknr = Convert.ToString(DbfTabelle.Value(karte, kf, "KKNUM", encoding)) ?? "";
        var versnr = (p is not null && pf is not null ? Convert.ToString(DbfTabelle.Value(p, pf, "MITNUM", encoding)) ?? "" : "");
        if (versnr.Length == 0 && karte is not null && kf is not null) versnr = Convert.ToString(DbfTabelle.Value(karte, kf, "VERSNUM", encoding)) ?? "";
        if (p is not null && pf is not null && Convert.ToString(DbfTabelle.Value(p, pf, "ANREDE", encoding)) is string anr && Anreden.TryGetValue(anr, out var anrede))
            kopf["anrede"] = anrede;
        if (versnr.Length > 0) kopf["versichertenNr"] = versnr;
        byte[]? kasse = null; Dictionary<string, DbfField>? cf = null;
        if (kknr.Length > 0)
        {
            try
            {
                var (f, alle, _) = DbfTabelle.Table(Path.Combine(daten, "KKASSEN.DBF"));
                cf = f;
                kasse = alle.FirstOrDefault(r => DbfTabelle.Active(r, f, encoding) && (Convert.ToString(DbfTabelle.Value(r, f, "KKNR", encoding)) ?? "") == kknr);
            }
            catch (IOException) { }
        }
        var name = kasse is not null && cf is not null ? Convert.ToString(DbfTabelle.Value(kasse, cf, "KKNAME", encoding)) ?? "" : "";
        if (name.Length == 0 && karte is not null && kf is not null) name = Convert.ToString(DbfTabelle.Value(karte, kf, "KASSE", encoding)) ?? "";
        if (name.Length > 0) kopf["kasse"] = name.Split('>')[0].Trim();
        if (kasse is not null && cf is not null)
        {
            var aik = Convert.ToString(DbfTabelle.Value(kasse, cf, "AIK", encoding)) ?? "";
            var ik = aik.Length > 0 ? (Convert.ToString(DbfTabelle.Value(kasse, cf, "AVORIK", encoding)) ?? "") + aik : Convert.ToString(DbfTabelle.Value(kasse, cf, "HIK", encoding)) ?? "";
            if (Digits9Re.IsMatch(ik)) kopf["kassenNr"] = ik;
            if (!kknr.StartsWith("PRI", StringComparison.OrdinalIgnoreCase))
                kopf["kassenart"] = (Convert.ToString(DbfTabelle.Value(kasse, cf, "KKART", encoding)) ?? "") == "5" ? "ersatz" : "primaer";
        }
        var status = karte is not null && kf is not null ? Convert.ToString(DbfTabelle.Value(karte, kf, "STATUS", encoding)) ?? "" : "";
        if (StatusRe.IsMatch(status)) kopf["status"] = status.PadRight(7, '0');
        return kopf;
    }

    public static Dictionary<string, object?>? PlanrAusDsWin(string praxisDir, Dictionary<string, object?> patientRow, int number, string encoding)
    {
        var patient = Convert.ToString(patientRow["patientNumber"])!;
        var (pf, plans, _) = DbfTabelle.Table(Path.Combine(praxisDir, "HKPPLAN.DBF"));
        var plan = plans.FirstOrDefault(r => DbfTabelle.Active(r, pf, encoding)
            && Convert.ToString(DbfTabelle.Value(r, pf, "PATNR", encoding)) == patient
            && Convert.ToInt32(DbfTabelle.Value(r, pf, "HKPNR", encoding)) == number);
        if (plan is null) return null;

        var hinweise = new List<string>();
        var listen = new DsWinLabor.Listen(Path.GetDirectoryName(praxisDir)!, encoding);
        var (lf, lines, _) = DbfTabelle.Table(Path.Combine(praxisDir, "HKPLST.DBF"));
        var own = lines.Where(r => DbfTabelle.Active(r, lf, encoding)
            && Convert.ToString(DbfTabelle.Value(r, lf, "PATNR", encoding)) == patient
            && Convert.ToInt32(DbfTabelle.Value(r, lf, "HKPNR", encoding)) == number)
            .OrderBy(r => Convert.ToString(DbfTabelle.Value(r, lf, "LST_ART", encoding)) ?? "", StringComparer.Ordinal)
            .ThenBy(r => Convert.ToString(DbfTabelle.Value(r, lf, "PLANART", encoding)) ?? "", StringComparer.Ordinal)
            .ThenBy(r => Convert.ToDouble(DbfTabelle.Value(r, lf, "LFD_NR", encoding) ?? 0.0))
            .ToList();

        var positionen = new List<Dictionary<string, object?>>();
        var befunde = new List<Dictionary<string, object?>>();
        int neben = 0, weitere = 0;
        for (var i = 0; i < own.Count; i++)
        {
            var r = own[i]; var idx = i + 1;
            var art = Convert.ToString(DbfTabelle.Value(r, lf, "LST_ART", encoding)) ?? "";
            var planart = Convert.ToString(DbfTabelle.Value(r, lf, "PLANART", encoding)) ?? "";
            var nr = Convert.ToString(DbfTabelle.Value(r, lf, "GEBNR", encoding)) ?? "";
            var zahn = Convert.ToString(DbfTabelle.Value(r, lf, "ZAHN", encoding)) ?? "";
            var anzahl = Convert.ToDouble(DbfTabelle.Value(r, lf, "ANZAHL", encoding) ?? 0.0);
            var anzWert = anzahl != 0.0 ? anzahl : 1.0;
            if (art == "Z" && planart == "2") continue;
            if (art == "N" && planart == "2") { neben++; continue; }
            if (art == "N" && planart == "5" && nr.Length > 0)
                befunde.Add(new Dictionary<string, object?> { ["id"] = $"dswin-fz-{idx}", ["nr"] = nr, ["zahnGebiet"] = zahn, ["anzahl"] = anzWert });
            else if (art == "Z" && planart == "1" && nr.Length > 0)
                positionen.Add(new Dictionary<string, object?> { ["id"] = $"dswin-{idx}", ["ebene"] = "BEMA", ["nr"] = nr, ["zahn"] = zahn, ["anzahl"] = anzWert });
            else if (art == "Z" && planart == "3" && nr.Length > 0)
            {
                var fak = Convert.ToDouble(DbfTabelle.Value(r, lf, "FAKTOR", encoding) ?? 0.0);
                positionen.Add(new Dictionary<string, object?> { ["id"] = $"dswin-{idx}", ["ebene"] = "GOZ", ["nr"] = nr, ["zahn"] = zahn, ["anzahl"] = anzWert, ["faktor"] = fak != 0.0 ? fak : 2.3 });
            }
            else if (art is "F" or "L" && nr.Length > 0)
            {
                var zeile = new Dictionary<string, object?> { ["id"] = $"dswin-lab-{idx}", ["zahn"] = zahn, ["anzahl"] = anzWert, ["labor"] = art == "L" ? "eigen" : "fremd" };
                var lm = LabRe.Match(nr);
                var bm = BebRe.Match(nr);
                if (lm.Success) { zeile["ebene"] = "BEL"; zeile["nr"] = lm.Groups[1].Value + lm.Groups[2].Value; }
                else if (bm.Success) { zeile["ebene"] = "BEB"; zeile["nr"] = bm.Groups[1].Value; }
                else
                {
                    var labtyp = Convert.ToString(DbfTabelle.Value(r, lf, "LABTYP", encoding)) ?? "";
                    var bez = labtyp.Length > 0 && labtyp.All(char.IsAsciiDigit)
                        && listen.Codes(int.Parse(labtyp)).TryGetValue(nr.ToUpperInvariant(), out var entry) ? entry.Bez : "";
                    zeile["ebene"] = "MAT"; zeile["nr"] = "";
                    zeile["preis"] = Convert.ToDouble(DbfTabelle.Value(r, lf, "PREIS", encoding) ?? 0.0);
                    zeile["text"] = bez.Length > 0 ? $"{bez} (DS-Win {nr})" : $"Material DS-Win {nr}";
                }
                positionen.Add(zeile);
            }
            else weitere++;
        }
        if (neben > 0) hinweise.Add($"{neben} Nebenleistung(en) aus DS-Win (ohne Anzahl) nicht übernommen.");
        if (weitere > 0) hinweise.Add($"{weitere} DS-Win-Zeile(n) unbekannter Art nicht übernommen.");

        var zaehne = new Dictionary<string, object?>(StringComparer.Ordinal);
        var (bf, findings, _) = DbfTabelle.Table(Path.Combine(praxisDir, "BEFUND.DBF"));
        var hRow = findings.FirstOrDefault(r => DbfTabelle.Active(r, bf, encoding)
            && Convert.ToString(DbfTabelle.Value(r, bf, "PATNR", encoding)) == patient
            && Convert.ToInt32(DbfTabelle.Value(r, bf, "HKPNR", encoding)) == number
            && Convert.ToString(DbfTabelle.Value(r, bf, "BEFTYP", encoding)) == "H");
        if (hRow is not null)
        {
            foreach (var name in bf.Keys)
            {
                var tm = ToothRe.Match(name);
                if (!tm.Success) continue;
                var tr = ToothRows(tm.Groups[1].Value, Convert.ToString(DbfTabelle.Value(hRow, bf, name, encoding)));
                if (tr.Values.Any(v => v.Length > 0)) zaehne[tm.Groups[1].Value] = tr;
            }
        }
        else hinweise.Add("Im DS-Win-Plan steht kein Zahnschema (Befund, Regelversorgung, Therapieplanung).");

        foreach (var row in positionen) row["auto"] = true;
        foreach (var row in befunde) row["auto"] = true;

        var planObj = new Dictionary<string, object?>(StringComparer.Ordinal);
        var anders = Convert.ToString(DbfTabelle.Value(plan, pf, "ANDERS", encoding)) ?? "";
        if (anders.Contains('J')) planObj["versorgungsart"] = "andersartig";
        var labore = positionen.Where(x => Convert.ToString(x["ebene"]) is "BEL" or "BEB" or "MAT")
            .Select(x => Convert.ToString(x.GetValueOrDefault("labor"))).ToHashSet(StringComparer.Ordinal);
        if (labore.Count == 1 && labore.Contains("eigen"))
            planObj["einstellungen"] = new Dictionary<string, object?> { ["labor"] = "praxis" };

        var prozent = (int)Math.Round(Convert.ToDouble(DbfTabelle.Value(plan, pf, "PROZENT", encoding) ?? 0.0), MidpointRounding.ToEven);
        var bonus = Boni.TryGetValue(prozent, out var bVal) ? bVal : "60";
        if (!Boni.ContainsKey(prozent)) hinweise.Add($"Bonus {prozent} % aus DS-Win unbekannt – 60 % angenommen.");
        var titel = TruthyVal(DbfTabelle.Value(plan, pf, "HKPBEZ", encoding)) ?? "";
        var datumRaw = Convert.ToString(DbfTabelle.Value(plan, pf, "DATUM", encoding)) ?? "";
        var datum = Date8Re.IsMatch(datumRaw) ? $"{datumRaw[..4]}-{datumRaw[4..6]}-{datumRaw[6..8]}" : datumRaw;

        var poc = Convert.ToString(patientRow.GetValueOrDefault("postalCodeAndCity")) ?? "";
        var sp = poc.IndexOf(' ');
        var plz = sp > 0 && poc[..sp].All(char.IsAsciiDigit) ? poc[..sp] : "";
        var ort = sp > 0 && plz.Length > 0 ? poc[(sp + 1)..] : poc;
        var patOut = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["vorname"] = Convert.ToString(patientRow.GetValueOrDefault("firstName")) ?? "",
            ["name"] = Convert.ToString(patientRow.GetValueOrDefault("lastName")) ?? "",
            ["geburtsdatum"] = Convert.ToString(patientRow.GetValueOrDefault("birthDate")) ?? "",
            ["strasse"] = Convert.ToString(patientRow.GetValueOrDefault("street")) ?? "",
            ["plz"] = plz, ["ort"] = ort,
        };
        foreach (var (k, v) in Versicherung(praxisDir, patient, encoding)) patOut[k] = v;

        planObj["patient"] = patOut;
        planObj["verwaltung"] = new Dictionary<string, object?> { ["ausstellungsdatum"] = datum, ["erlaeuterung"] = titel };
        planObj["zaehne"] = zaehne;
        planObj["positionen"] = positionen.Cast<object?>().ToList();
        planObj["befunde"] = befunde.Cast<object?>().ToList();
        planObj["zuschuss"] = new Dictionary<string, object?> { ["bonus"] = bonus, ["haertefall"] = false };

        return new Dictionary<string, object?>
        {
            ["plan"] = planObj,
            ["dswinPlan"] = new Dictionary<string, object?> { ["number"] = number, ["date"] = datum, ["title"] = titel },
            ["hinweise"] = hinweise.Cast<object?>().ToList(),
        };
    }
}

/// <summary>1:1-Port von praxis_katalog.py.</summary>
public static class DsWinKatalog
{
    static readonly int[] BelListen = [1, 2];
    static readonly int[] BebListen = [3, 4, 5, 6, 7, 8, 9];
    static readonly Dictionary<int, string> ListenNamen = new() { [1] = "BEL 1", [2] = "BEL II", [3] = "BEB", [4] = "BEB 97" };
    static readonly Regex BebIdxRe = new(@"^BEB_0([1-5])$", RegexOptions.Compiled);
    static readonly Regex BebNrRe = new(@"^[05](\d{4})$", RegexOptions.Compiled);
    static readonly Regex BelNrRe = new(@"^(\d{3})-(\d)$", RegexOptions.Compiled);
    static readonly Regex GozNrRe = new(@"^\d{4}$", RegexOptions.Compiled);
    static readonly Regex GoaeRe = new(@"^([äÄ].*|A\d{1,4}[a-z]?)$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Dictionary<int, string> KetteListe = new() { [3] = "GOZ", [5] = "BEMA" };

    static (List<byte[]> Rows, Dictionary<string, DbfField> Fields) ActiveRows(string path, string encoding)
    {
        if (!File.Exists(path)) return ([], new Dictionary<string, DbfField>());
        var (f, rows, _) = DbfTabelle.Table(path);
        return (rows.Where(r => DbfTabelle.Active(r, f, encoding)).ToList(), f);
    }

    static Dictionary<int, string> GetListenNamen(string daten, string encoding)
    {
        var namen = new Dictionary<int, string>(ListenNamen);
        var (rows, f) = ActiveRows(Path.Combine(daten, "VOREINST.DBF"), encoding);
        foreach (var r in rows)
        {
            var idx = (Convert.ToString(DbfTabelle.Value(r, f, "INDEX", encoding)) ?? "").Trim();
            var m = BebIdxRe.Match(idx);
            if (!m.Success) continue;
            try
            {
                var name = (Convert.ToString(DbfTabelle.Value(r, f, "VOREINST", encoding)) ?? "").Trim();
                if (name.Length > 0) namen[4 + int.Parse(m.Groups[1].Value)] = name;
            }
            catch (DecoderFallbackException) { }
        }
        return namen;
    }

    static Dictionary<string, object?> Vorschlag(string daten, Dictionary<int, Dictionary<string, object?>> listen,
        string feld, string art, IEnumerable<int> praxen, string encoding)
    {
        var gefiltert = listen.Where(kv => Convert.ToString(kv.Value["art"]) == art).ToDictionary(kv => kv.Key, kv => kv.Value);
        var zaehler = new Dictionary<int, int>();
        foreach (var nr in praxen)
        {
            var pfad = Path.Combine(daten, $"PRAX{nr}", "HKPPLAN.DBF");
            if (!File.Exists(pfad)) continue;
            var (rows, f) = ActiveRows(pfad, encoding);
            if (!f.ContainsKey(feld)) continue;
            foreach (var r in rows)
            {
                var v = Convert.ToInt32(DbfTabelle.Value(r, f, feld, encoding) ?? 0);
                zaehler[v] = zaehler.GetValueOrDefault(v) + 1;
            }
        }
        var genutzt = zaehler.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).Where(gefiltert.ContainsKey).ToList();
        var mitPreis = gefiltert.Where(kv => ((int[])kv.Value["mitPreis"]!)[0] > 0).Select(kv => kv.Key).ToList();
        var standard = art == "BEL" ? 2 : 3;
        var gewaehlt = genutzt.Count > 0 ? genutzt[0] : mitPreis.Count > 0 ? mitPreis[0] : gefiltert.Count > 0 ? gefiltert.Keys.First() : standard;
        return new Dictionary<string, object?>
        {
            ["liste"] = gewaehlt, ["spalte"] = 1,
            ["quelle"] = genutzt.Count > 0 ? "HKPs der Praxis" : "Standard",
        };
    }

    static (Dictionary<int, Dictionary<string, object?>> Listen, List<object?> Zeilen) Labor(string daten, string encoding)
    {
        var namen = GetListenNamen(daten, encoding);
        var listen = new Dictionary<int, Dictionary<string, object?>>();
        var zeilen = new List<object?>();
        foreach (var nummer in BelListen.Concat(BebListen))
        {
            var stem = DsWinLabor.Files[nummer].FirstOrDefault(s => File.Exists(Path.Combine(daten, s + ".DBF")));
            if (stem is null) continue;
            var (rows, f) = ActiveRows(Path.Combine(daten, stem + ".DBF"), encoding);
            var mitPreis = new int[4];
            foreach (var r in rows)
            {
                var code = (Convert.ToString(DbfTabelle.Value(r, f, "GEBNR", encoding)) ?? "").Trim();
                if (code.Length == 0 || Convert.ToString(DbfTabelle.Value(r, f, "NOTVISIBLE", encoding)) == "J") continue;
                var preise = new double[4];
                for (var i = 0; i < 4; i++)
                    preise[i] = Math.Round(Convert.ToDouble(DbfTabelle.Value(r, f, $"PREIS_{i + 1}", encoding) ?? 0.0), 2, MidpointRounding.ToEven);
                var bez = (Convert.ToString(DbfTabelle.Value(r, f, "BEZ", encoding)) ?? "").Trim();
                if (BelListen.Contains(nummer))
                {
                    var bel = BelNrRe.Match(code);
                    if (bel.Success)
                    {
                        for (var i = 0; i < 4; i++) if (preise[i] > 0) mitPreis[i]++;
                        zeilen.Add(new Dictionary<string, object?>
                        {
                            ["liste"] = nummer, ["code"] = code, ["text"] = bez,
                            ["preise"] = preise, ["bel"] = bel.Groups[1].Value + bel.Groups[2].Value,
                        });
                    }
                    continue;
                }
                var beb = BebNrRe.Match(code);
                var low2 = code.Length >= 2 ? code[..2].ToLowerInvariant() : code.ToLowerInvariant();
                var low1 = code[..1].ToLowerInvariant();
                var material = !beb.Success && (DsWinLabor.MaterialCodeRe.IsMatch(code) || low2 is "ab" or "m" or "f" || low1 is "m" or "f" or "z");
                if (!beb.Success && !material) continue;
                if (material && bez.Length == 0) continue;
                for (var i = 0; i < 4; i++) if (preise[i] > 0) mitPreis[i]++;
                var zeile = new Dictionary<string, object?>
                {
                    ["liste"] = nummer, ["code"] = code, ["text"] = bez, ["preise"] = preise,
                    ["eigenlabor"] = Convert.ToString(DbfTabelle.Value(r, f, "EIGENLABOR", encoding)) == "J",
                    ["mwst"] = Convert.ToDouble(DbfTabelle.Value(r, f, "MWST", encoding) ?? 0.0),
                };
                if (beb.Success) zeile["nr"] = beb.Groups[1].Value;
                else
                {
                    zeile["material"] = low2 == "ab" ? "ab" : low1;
                    var (wName, _) = DsWinLabor.Werkstoff(bez);
                    if (wName is not null) zeile["werkstoff"] = wName;
                }
                zeilen.Add(zeile);
            }
            listen[nummer] = new Dictionary<string, object?>
            {
                ["nr"] = nummer, ["name"] = namen.GetValueOrDefault(nummer, stem), ["datei"] = stem,
                ["mitPreis"] = mitPreis, ["art"] = BelListen.Contains(nummer) ? "BEL" : "BEB",
            };
        }
        return (listen, zeilen);
    }

    static List<(string Nr, byte[] Row, Dictionary<string, DbfField> Fields)> GozZeilen(string daten, string encoding)
    {
        var (rows, f) = ActiveRows(Path.Combine(daten, "GOZ08.DBF"), encoding);
        var outList = new List<(string, byte[], Dictionary<string, DbfField>)>();
        foreach (var r in rows)
        {
            var nr = (Convert.ToString(DbfTabelle.Value(r, f, "GEBNR", encoding)) ?? "").Trim();
            if (nr.Length > 0 && Convert.ToString(DbfTabelle.Value(r, f, "NOTVISIBLE", encoding)) != "J")
                outList.Add((nr, r, f));
        }
        return outList;
    }

    static List<object?> Goz(string daten, string encoding)
    {
        var outList = new List<object?>();
        foreach (var (nr, r, f) in GozZeilen(daten, encoding))
        {
            if (GoaeRe.IsMatch(nr) || nr.StartsWith('+')) continue;
            var text = (Convert.ToString(DbfTabelle.Value(r, f, "BEZ", encoding)) ?? "").Trim();
            var punkte = Convert.ToDouble(DbfTabelle.Value(r, f, "PUNKTE", encoding) ?? 0.0);
            var betrag = Math.Round(Convert.ToDouble(DbfTabelle.Value(r, f, "BUGO", encoding) ?? 0.0), 2, MidpointRounding.ToEven);
            var isAmt = GozNrRe.IsMatch(nr);
            var material = nr[0] is 'v' or 'V' && !isAmt;
            if (!isAmt && punkte == 0.0 && !(material && text.Length > 0)) continue;
            var kuerzel = (Convert.ToString(DbfTabelle.Value(r, f, "KUERZEL", encoding)) ?? "").Trim();
            var druck = (Convert.ToString(DbfTabelle.Value(r, f, "DGEBNR", encoding)) ?? "").Trim();
            var bezug = (Convert.ToString(DbfTabelle.Value(r, f, "GOZREF", encoding)) ?? "").Trim();
            var faktor = Convert.ToDouble(DbfTabelle.Value(r, f, "FAKTOR", encoding) ?? 0.0);
            var eintrag = new Dictionary<string, object?> { ["nr"] = nr, ["text"] = text, ["punkte"] = punkte, ["eigen"] = !isAmt };
            if (material) eintrag["betrag"] = betrag;
            if (kuerzel.Length > 0 && !kuerzel.Equals(nr, StringComparison.OrdinalIgnoreCase)) eintrag["kuerzel"] = kuerzel;
            if (druck.Length > 0 && druck != nr) eintrag["druckNr"] = druck;
            if (GozNrRe.IsMatch(bezug) && bezug != nr && bezug != druck) eintrag["analogZu"] = bezug;
            if (faktor > 0) eintrag["faktor"] = Math.Round(faktor, 4, MidpointRounding.ToEven);
            outList.Add(eintrag);
        }
        return outList;
    }

    static List<object?> Komplexe(string daten, string encoding)
    {
        var outList = new List<object?>();
        var (priRows, priF) = ActiveRows(Path.Combine(daten, "PRIKUERZ.DBF"), encoding);
        foreach (var r in priRows)
        {
            var k = (Convert.ToString(DbfTabelle.Value(r, priF, "KUERZEL", encoding)) ?? "").Trim();
            var nr = (Convert.ToString(DbfTabelle.Value(r, priF, "GEBNR08", encoding)) ?? "").Trim();
            var text = (Convert.ToString(DbfTabelle.Value(r, priF, "BEZ", encoding)) ?? "").Trim();
            if (k.Length > 0 && GozNrRe.IsMatch(nr) && !text.StartsWith("frei verfügbar", StringComparison.OrdinalIgnoreCase))
                outList.Add(new Dictionary<string, object?>
                {
                    ["kuerzel"] = k, ["text"] = text,
                    ["positionen"] = new List<object?> { new Dictionary<string, object?> { ["ebene"] = "GOZ", ["nr"] = nr } },
                });
        }
        var texte = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (nr, r, f) in GozZeilen(daten, encoding))
            if (nr.StartsWith('+')) texte[nr] = (Convert.ToString(DbfTabelle.Value(r, f, "BEZ", encoding)) ?? "").Trim();
        var ketten = new Dictionary<string, List<(double Sort, Dictionary<string, object?> Pos)>>(StringComparer.Ordinal);
        var (verRows, verF) = ActiveRows(Path.Combine(daten, "VERKETT.DBF"), encoding);
        foreach (var r in verRows)
        {
            var kette = (Convert.ToString(DbfTabelle.Value(r, verF, "GEBNR", encoding)) ?? "").Trim();
            var ziel = (Convert.ToString(DbfTabelle.Value(r, verF, "VGEBNR", encoding)) ?? "").Trim();
            var vlst = Convert.ToInt32(DbfTabelle.Value(r, verF, "VLSTVERZ", encoding) ?? 0);
            if (!KetteListe.TryGetValue(vlst, out var ebene)) continue;
            if (kette.StartsWith('+') && ziel.Length > 0 && !GoaeRe.IsMatch(ziel))
            {
                if (!ketten.TryGetValue(kette, out var list)) ketten[kette] = list = [];
                var anz = Convert.ToDouble(DbfTabelle.Value(r, verF, "ANZAHL", encoding) ?? 0.0);
                list.Add((Convert.ToDouble(DbfTabelle.Value(r, verF, "VSORT", encoding) ?? 0.0), new Dictionary<string, object?>
                {
                    ["ebene"] = ebene, ["nr"] = ziel, ["anzahl"] = anz != 0.0 ? anz : 1.0,
                }));
            }
        }
        foreach (var (kette, schritte) in ketten)
        {
            var t = texte.TryGetValue(kette, out var tv) && tv.Length > 0 ? tv : $"Leistungskette {kette[1..]}";
            outList.Add(new Dictionary<string, object?>
            {
                ["kuerzel"] = kette, ["text"] = t,
                ["positionen"] = schritte.OrderBy(s => s.Sort).Select(s => (object?)s.Pos).ToList(),
            });
        }
        return outList;
    }

    public static Dictionary<string, object?> PraxisKatalog(string daten, HashSet<int>? praxen, string encoding)
    {
        var (listen, zeilen) = Labor(daten, encoding);
        var praxList = praxen is not null && praxen.Count > 0 ? praxen.OrderBy(x => x).ToList() : Enumerable.Range(1, 9).ToList();
        return new Dictionary<string, object?>
        {
            ["pvs"] = "DS-Win",
            ["listen"] = listen.Values.Cast<object?>().ToList(),
            ["vorschlag"] = Vorschlag(daten, listen, "LABTYPPRIV", "BEB", praxList, encoding),
            ["vorschlagKasse"] = Vorschlag(daten, listen, "LABTYPKASS", "BEL", praxList, encoding),
            ["labor"] = zeilen,
            ["goz"] = Goz(daten, encoding),
            ["komplexe"] = Komplexe(daten, encoding),
        };
    }
}
