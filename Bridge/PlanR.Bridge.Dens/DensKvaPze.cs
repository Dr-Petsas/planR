using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Dens;

public sealed class KvaImportError : Exception
{
    public KvaImportError(string message) : base(message) { }
}

public sealed class KatalogError : Exception
{
    public KatalogError(string message) : base(message) { }
}

/// <summary>Port von dens_laborkatalog.py, dens_praxis_katalog.py, dens_kva.py, dens_pze.py und dens_notiz.py.</summary>
public static class DensKvaPze
{
    // --- dens_laborkatalog.py ---
    public const int TypTechnik = 31, TypMaterial = 32, TypGold = 33;
    public const int ArtBel = 1, ArtBeb = 2;
    public const string ItzPraefix = "ITZ";

    public static readonly Dictionary<string, (string Code, string Text, int Typ)> WerkstoffDens = new(StringComparer.Ordinal)
    {
        ["nem"] = ("NEM", "Nichtedelmetall", TypGold),
        ["goldreduziert"] = ("GOLDRED", "Goldreduzierte Edelmetalllegierung", TypGold),
        ["hochgold"] = ("HOCHGOLD", "Hochgoldlegierung", TypGold),
        ["zirkon"] = ("ZIRKON", "Zirkonoxid", TypMaterial),
        ["presskeramik"] = ("PRESSK", "Presskeramik", TypMaterial),
        ["lithiumdisilikat"] = ("LIDISI", "Lithiumdisilikat", TypMaterial),
    };

    static readonly (string Titel, string Key)[] WerkstoffTitel =
    [
        ("NEM-Legierung", "nem"),
        ("Goldreduzierte Edelmetalllegierung", "goldreduziert"),
        ("Hochgoldlegierung", "hochgold"),
        ("Zirkonoxid", "zirkon"),
        ("Presskeramik", "presskeramik"),
        ("Lithiumdisilikat", "lithiumdisilikat"),
    ];

    public static string ZuordnungPfad()
    {
        var env = Environment.GetEnvironmentVariable("DENS_LABORZUORDNUNG");
        if (!string.IsNullOrWhiteSpace(env)) return env;
        return Path.Combine(AppContext.BaseDirectory, "dens_laborzuordnung.json");
    }

    public static Dictionary<string, Dictionary<string, object?>> KatalogAusNative(List<object?> rows)
    {
        var katalog = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        foreach (var row in rows.OfType<Dictionary<string, object?>>())
        {
            var code = Convert.ToString(row["code"]) ?? "";
            if (katalog.ContainsKey(code)) continue;
            var raw = Convert.FromBase64String(Convert.ToString(row["data"])!);
            katalog[code] = new Dictionary<string, object?>
            {
                ["text"] = Convert.ToString(row.GetValueOrDefault("text")) ?? "",
                ["typ"] = (int)BitConverter.ToInt16(raw, 644),
                ["art"] = (int)BitConverter.ToInt16(raw, 646),
            };
        }
        return katalog;
    }

    public static Dictionary<string, string> ZuordnungLaden(string? pfad = null)
    {
        var p = pfad ?? ZuordnungPfad();
        if (!File.Exists(p)) return new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(p, Encoding.UTF8));
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                throw new KatalogError($"{Path.GetFileName(p)}: erwartet {{\"BEB 2251\": \"DENS-Kürzel\", ...}}.");
            var res = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind != JsonValueKind.String)
                    throw new KatalogError($"{Path.GetFileName(p)}: erwartet {{\"BEB 2251\": \"DENS-Kürzel\", ...}}.");
                if (!prop.Name.StartsWith('_'))
                    res[prop.Name.Trim()] = prop.Value.GetString()!.Trim();
            }
            return res;
        }
        catch (KatalogError) { throw; }
        catch (Exception exc) { throw new KatalogError($"{Path.GetFileName(p)} ist kein gültiges JSON: {exc.Message}"); }
    }

    static string Norm(string? text)
    {
        var s = (text ?? "").ToLowerInvariant().Replace("ß", "ss").Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue");
        return string.Join(' ', Regex.Matches(s, "[a-z0-9]+").Select(m => m.Value));
    }

    /// <summary>Exakte Entsprechung von Python difflib.SequenceMatcher(None, a, b).ratio().</summary>
    static double SequenceMatcherRatio(string a, string b)
    {
        if (a.Length == 0 && b.Length == 0) return 1.0;
        var b2j = new Dictionary<char, List<int>>();
        for (var i = 0; i < b.Length; i++)
        {
            if (!b2j.TryGetValue(b[i], out var list)) b2j[b[i]] = list = [];
            list.Add(i);
        }
        var queue = new Queue<(int alo, int ahi, int blo, int bhi)>();
        queue.Enqueue((0, a.Length, 0, b.Length));
        var matches = 0;
        while (queue.Count > 0)
        {
            var (alo, ahi, blo, bhi) = queue.Dequeue();
            var bestI = alo;
            var bestJ = blo;
            var bestSize = 0;
            var j2len = new Dictionary<int, int>();
            for (var i = alo; i < ahi; i++)
            {
                var newj2len = new Dictionary<int, int>();
                if (b2j.TryGetValue(a[i], out var indices))
                {
                    foreach (var j in indices)
                    {
                        if (j < blo) continue;
                        if (j >= bhi) break;
                        var k = (j2len.TryGetValue(j - 1, out var prev) ? prev : 0) + 1;
                        newj2len[j] = k;
                        if (k > bestSize) { bestI = i - k + 1; bestJ = j - k + 1; bestSize = k; }
                    }
                }
                j2len = newj2len;
            }
            if (bestSize > 0)
            {
                matches += bestSize;
                if (alo < bestI && blo < bestJ) queue.Enqueue((alo, bestI, blo, bestJ));
                if (bestI + bestSize < ahi && bestJ + bestSize < bhi) queue.Enqueue((bestI + bestSize, ahi, bestJ + bestSize, bhi));
            }
        }
        return 2.0 * matches / (a.Length + b.Length);
    }

    public static bool GleicheBedeutung(string? a, string? b)
    {
        var na = Norm(a);
        var nb = Norm(b);
        if (na.Length == 0 || nb.Length == 0) return false;
        return na == nb || SequenceMatcherRatio(na, nb) >= 0.6;
    }

    public static string Werkstoff(string? text)
    {
        var t = text ?? "";
        foreach (var (titel, key) in WerkstoffTitel)
            if (t.StartsWith(titel, StringComparison.Ordinal)) return key;
        return "";
    }

    static string Schluessel(Dictionary<string, object?> p)
    {
        var level = Convert.ToString(p["level"])!;
        var text = Convert.ToString(p.GetValueOrDefault("text")) ?? "";
        if (level == "MAT")
        {
            var w = Werkstoff(text);
            return "MAT " + (w.Length > 0 ? w : (text.Length > 40 ? text[..40] : text));
        }
        if (level == "LAB") return "LAB " + (text.Length > 40 ? text[..40] : text);
        return $"{level} {p["number"]}";
    }

    static bool Passt(Dictionary<string, object?> eintrag, Dictionary<string, object?> p)
    {
        var level = Convert.ToString(p["level"])!;
        var typ = Convert.ToInt32(eintrag["typ"]);
        var art = Convert.ToInt32(eintrag["art"]);
        if (level == "MAT") return typ is TypMaterial or TypGold;
        if (level == "LAB") return typ == TypTechnik;
        return typ == TypTechnik && art == (level == "BEL" ? ArtBel : ArtBeb);
    }

    static bool ItzAnlegenErlaubt() => (Environment.GetEnvironmentVariable("DENS_ITZ_ANLEGEN") ?? "1").Trim() != "0";

    static string BebNummer(Dictionary<string, object?> p) => (Convert.ToString(p["number"]) ?? "").Trim().PadLeft(4, '0');

    static string Sha1Hex6(string s) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s)))[..6];

    static (string Code, string Text, int Typ) MaterialZiel(Dictionary<string, object?> p)
    {
        var t = Convert.ToString(p.GetValueOrDefault("text")) ?? "";
        var w = Werkstoff(t);
        if (WerkstoffDens.TryGetValue(w, out var z)) return z;
        var text = (string.IsNullOrEmpty(t) ? "Material" : t).Trim();
        if (text.Length > 127) text = text[..127];
        return ("M" + Sha1Hex6(Norm(text)), text, TypMaterial);
    }

    static (string Code, string Text) FremdlaborZiel(Dictionary<string, object?> p)
    {
        var t = Convert.ToString(p.GetValueOrDefault("text")) ?? "";
        var text = (string.IsNullOrEmpty(t) ? "Fremdlabor" : t).Trim();
        if (text.Length > 127) text = text[..127];
        return ("L" + Sha1Hex6(Norm(text)), text);
    }

    static int PosCents(Dictionary<string, object?> p) =>
        Math.Max(0, (int)Math.Round(Convert.ToDouble(p.GetValueOrDefault("price") ?? 0.0) * 100.0, MidpointRounding.ToEven));

    public static List<Dictionary<string, object?>> ItzBedarf(
        List<Dictionary<string, object?>> positions,
        Dictionary<string, Dictionary<string, object?>> katalog,
        Dictionary<string, string> zuordnung)
    {
        var neu = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        foreach (var p in positions)
        {
            if (zuordnung.TryGetValue(Schluessel(p), out var zuo) && !string.IsNullOrEmpty(zuo)) continue;
            var level = Convert.ToString(p["level"])!;
            if (level == "MAT")
            {
                var (code, text, typ) = MaterialZiel(p);
                if (!katalog.ContainsKey(code) && !neu.ContainsKey(code))
                    neu[code] = new Dictionary<string, object?> { ["code"] = code, ["text"] = text, ["art"] = 0, ["typ"] = typ };
                continue;
            }
            if (level == "LAB")
            {
                var (code, text) = FremdlaborZiel(p);
                if (!katalog.ContainsKey(code) && !neu.ContainsKey(code))
                    neu[code] = new Dictionary<string, object?> { ["code"] = code, ["text"] = text, ["art"] = ArtBeb, ["cents"] = PosCents(p) };
                continue;
            }
            if (level == "BEL")
            {
                var code = DensHkp.BelLaborkuerzel(Convert.ToString(p["number"]));
                if (!katalog.ContainsKey(code) && !neu.ContainsKey(code))
                {
                    var txt = Convert.ToString(p.GetValueOrDefault("text"));
                    if (string.IsNullOrEmpty(txt)) txt = $"BEL {code}";
                    if (txt.Length > 127) txt = txt[..127];
                    neu[code] = new Dictionary<string, object?> { ["code"] = code, ["text"] = txt, ["art"] = ArtBel, ["cents"] = PosCents(p) };
                }
                continue;
            }
            if (level != "BEB") continue;
            var nummer = BebNummer(p);
            var itzCode = ItzPraefix + nummer;
            if (katalog.ContainsKey(itzCode) || neu.ContainsKey(itzCode)) continue;
            if (katalog.TryGetValue("BEB" + nummer, out var alt) && Passt(alt, p)
                && GleicheBedeutung(Convert.ToString(alt["text"]), Convert.ToString(p.GetValueOrDefault("text"))))
                continue;
            var btxt = Convert.ToString(p.GetValueOrDefault("text"));
            if (string.IsNullOrEmpty(btxt)) btxt = $"BEB {nummer}";
            if (btxt.Length > 127) btxt = btxt[..127];
            neu[itzCode] = new Dictionary<string, object?> { ["code"] = itzCode, ["text"] = btxt, ["art"] = ArtBeb, ["cents"] = PosCents(p) };
        }
        return neu.Values.ToList();
    }

    static string KuerzelSetzen(
        Dictionary<string, object?> p, string key,
        Dictionary<string, Dictionary<string, object?>> katalog,
        Dictionary<string, string> zuordnung)
    {
        if (zuordnung.TryGetValue(key, out var code) && !string.IsNullOrEmpty(code))
        {
            if (!katalog.TryGetValue(code, out var eintrag))
                return $"Kürzel „{code}“ aus der Zuordnung fehlt im DENS-Laborkatalog";
            if (!Passt(eintrag, p))
                return $"Kürzel „{code}“ ist in DENS kein {(Convert.ToString(p["level"]) == "MAT" ? "Material/Gold" : p["level"])}-Eintrag";
            p["code"] = code;
            return "";
        }
        var level = Convert.ToString(p["level"])!;
        if (level == "BEL")
        {
            code = DensHkp.BelLaborkuerzel(Convert.ToString(p["number"]));
            if (!katalog.TryGetValue(code, out var eintrag) || !Passt(eintrag, p))
                return $"„{code}“ fehlt im DENS-Laborkatalog";
        }
        else if (level == "BEB")
        {
            var nummer = BebNummer(p);
            var hatItz = katalog.ContainsKey(ItzPraefix + nummer);
            code = hatItz ? ItzPraefix + nummer : "BEB" + nummer;
            var text = Convert.ToString(p.GetValueOrDefault("text")) ?? "";
            if (text.Length > 40) text = text[..40];
            if (!katalog.TryGetValue(code, out var eintrag) || !Passt(eintrag, p))
                return $"„{text}“ – {code} fehlt im DENS-Laborkatalog";
            if (!hatItz && !GleicheBedeutung(Convert.ToString(eintrag["text"]), Convert.ToString(p.GetValueOrDefault("text"))))
            {
                var et = Convert.ToString(eintrag["text"]) ?? "";
                if (et.Length > 40) et = et[..40];
                return $"„{text}“ – in DENS steht {code} für „{et}“";
            }
        }
        else if (level == "LAB")
        {
            code = FremdlaborZiel(p).Code;
            if (!katalog.TryGetValue(code, out var eintrag) || !Passt(eintrag, p))
                return "kein DENS-Kürzel für diesen Fremdlaborposten hinterlegt";
        }
        else
        {
            code = MaterialZiel(p).Code;
            if (!katalog.TryGetValue(code, out var eintrag) || !Passt(eintrag, p))
                return "kein DENS-Kürzel für dieses Material hinterlegt";
        }
        p["code"] = code;
        return "";
    }

    public static List<Dictionary<string, object?>> LaborkuerzelZuordnen(
        List<Dictionary<string, object?>> positions,
        Dictionary<string, Dictionary<string, object?>> katalog,
        Dictionary<string, string> zuordnung,
        Func<List<Dictionary<string, object?>>, Dictionary<string, Dictionary<string, object?>>>? anlegen = null)
    {
        if (anlegen is not null && ItzAnlegenErlaubt())
        {
            var neu = ItzBedarf(positions, katalog, zuordnung);
            if (neu.Count > 0) katalog = anlegen(neu);
        }
        var offen = new List<(string Key, string Fehler)>();
        foreach (var p in positions)
        {
            var key = Schluessel(p);
            var fehler = KuerzelSetzen(p, key, katalog, zuordnung);
            if (fehler.Length > 0) offen.Add((key, fehler));
        }
        if (offen.Count > 0)
        {
            var texte = offen.Select(o => $"{o.Key}: {o.Fehler}").ToList();
            var mehr = texte.Count > 8 ? $" (und {texte.Count - 8} weitere)" : "";
            throw new KatalogError(
                "Laborzeilen ohne passendes DENS-Kürzel – Plan wird nicht übernommen: "
                + string.Join("; ", texte.Take(8)) + mehr
                + $". Zuordnung in {Path.GetFileName(ZuordnungPfad())} eintragen, z. B. {{\"{offen[0].Key}\": \"DENS-Kürzel\"}}.");
        }
        return positions;
    }

    // --- dens_praxis_katalog.py ---
    static readonly Regex GozAmtRe = new(@"^\d{4}$", RegexOptions.Compiled);
    static readonly Regex GozAnalogRe = new(@"^(\d{4})a$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    static string VierZiffern(string code)
    {
        var d = new string(code.Where(char.IsDigit).ToArray());
        return d.Length >= 4 ? d[^4..] : "";
    }

    public static Dictionary<string, object?> PraxisKatalogBauen(List<object?> laborRows, List<object?> serviceRows)
    {
        var labor = new List<object?>();
        int belN = 0, bebN = 0;
        foreach (var row in laborRows.OfType<Dictionary<string, object?>>())
        {
            var code = (Convert.ToString(row.GetValueOrDefault("code")) ?? "").Trim();
            var text = (Convert.ToString(row.GetValueOrDefault("text")) ?? "").Trim();
            var preis = Math.Round(Convert.ToInt32(row.GetValueOrDefault("cents") ?? 0) / 100.0, 2, MidpointRounding.ToEven);
            if (code.Length == 0 || text.Length == 0 || preis <= 0) continue;
            int typ, art;
            if (row.ContainsKey("typ") && row.ContainsKey("art"))
            {
                typ = Convert.ToInt32(row["typ"]);
                art = Convert.ToInt32(row["art"]);
            }
            else
            {
                var raw = Convert.FromBase64String(Convert.ToString(row["data"])!);
                typ = BitConverter.ToInt16(raw, 644);
                art = BitConverter.ToInt16(raw, 646);
            }
            var preise = new object[] { preis, 0, 0, 0 };
            if (typ == TypTechnik && art == ArtBel)
            {
                var bel = VierZiffern(code);
                if (bel.Length == 0) continue;
                belN++;
                labor.Add(new Dictionary<string, object?> { ["liste"] = 2, ["code"] = code, ["text"] = text, ["preise"] = preise, ["bel"] = bel });
            }
            else if (typ == TypTechnik && art == ArtBeb)
            {
                var nr = VierZiffern(code);
                if (nr.Length == 0) continue;
                bebN++;
                labor.Add(new Dictionary<string, object?> { ["liste"] = 4, ["code"] = code, ["text"] = text, ["preise"] = preise, ["nr"] = nr, ["eigenlabor"] = true });
            }
            else if (typ is TypMaterial or TypGold)
            {
                bebN++;
                var zeile = new Dictionary<string, object?>
                {
                    ["liste"] = 4, ["code"] = code, ["text"] = text, ["preise"] = preise,
                    ["material"] = (code.Length > 0 ? code[..1] : "m").ToLowerInvariant(), ["eigenlabor"] = true,
                };
                var name = Werkstoff(text);
                if (name.Length > 0) zeile["werkstoff"] = name;
                labor.Add(zeile);
            }
        }
        var goz = new List<object?>();
        foreach (var row in serviceRows.OfType<Dictionary<string, object?>>())
        {
            var nr = (Convert.ToString(row.GetValueOrDefault("number")) ?? "").Trim();
            if (nr.Length == 0) continue;
            var analog = GozAnalogRe.Match(nr);
            if (!analog.Success && !GozAmtRe.IsMatch(nr)) continue;
            if (analog.Success) nr = nr.ToLowerInvariant();
            var eintrag = new Dictionary<string, object?>
            {
                ["nr"] = nr, ["text"] = (Convert.ToString(row.GetValueOrDefault("text")) ?? "").Trim(),
                ["punkte"] = Convert.ToInt32(row.GetValueOrDefault("points") ?? 0), ["eigen"] = analog.Success,
            };
            if (analog.Success) eintrag["analogZu"] = analog.Groups[1].Value;
            var code = (Convert.ToString(row.GetValueOrDefault("code")) ?? "").Trim();
            if (code.Length > 0 && !code.Equals(nr, StringComparison.OrdinalIgnoreCase)) eintrag["kuerzel"] = code;
            goz.Add(eintrag);
        }
        return new Dictionary<string, object?>
        {
            ["pvs"] = "DENSoffice",
            ["listen"] = new object[]
            {
                new Dictionary<string, object?> { ["nr"] = 2, ["name"] = "DENS BEL", ["mitPreis"] = new[] { belN, 0, 0, 0 }, ["art"] = "BEL" },
                new Dictionary<string, object?> { ["nr"] = 4, ["name"] = "DENS Labor", ["mitPreis"] = new[] { bebN, 0, 0, 0 }, ["art"] = "BEB" },
            },
            ["vorschlag"] = new Dictionary<string, object?> { ["liste"] = 4, ["spalte"] = 1, ["quelle"] = "DENS-Laborkatalog" },
            ["vorschlagKasse"] = new Dictionary<string, object?> { ["liste"] = 2, ["spalte"] = 1, ["quelle"] = "DENS-Laborkatalog" },
            ["labor"] = labor,
            ["goz"] = goz,
            ["komplexe"] = new List<object?>(),
        };
    }

    // --- dens_kva.py ---
    const int KvaSize = 88, LeistungSize = 118, AnmerkungSize = 200;
    const int ErklaerungSize = 97, FolgeSize = 95, ErklaerungText = 86, FolgeText = 94, ErklaerungFreitext = 512;
    const int ErklaerungMax = ErklaerungText + 2 * FolgeText;
    const int LaborplanSize = 62, LaborpositionSize = 72;
    const short LaborplanKva = 3, LaborplanProthetik = 1, Euro = 2;
    const decimal FreiAbFaktor = 3.5m;
    const int MwstLabor = 700;
    static readonly Dictionary<string, string> GozFuellung = new(StringComparer.Ordinal) { ["2060"] = "F1K", ["2080"] = "F2K", ["2100"] = "F3K", ["2120"] = "F4K" };
    static readonly Dictionary<string, short> KatalogMerkmal = new(StringComparer.Ordinal) { ["2060"] = 1, ["2080"] = 1, ["2100"] = 1, ["2120"] = 1, ["2197"] = -1 };
    const short GoaeMerkmal = -1;
    static readonly Regex NrRe = new(@"^[0-9]{4}[a-z]?$", RegexOptions.Compiled);
    static readonly Regex GoaeNrRe = new(@"^[0-9]{1,4}[a-z]?$", RegexOptions.Compiled);
    static readonly HashSet<string> LaborEbenen = new(StringComparer.Ordinal) { "BEB", "MAT", "LABOR" };

    static string BemaZiffer(string? nr)
    {
        var s = (nr ?? "").Trim();
        if (!Regex.IsMatch(s, @"^\d{2}[a-d]?$"))
            throw new KvaImportError($"BEMA-Ziffer '{s}' ist für die Mehrkostenvereinbarung ungültig.");
        return s.PadRight(4, '0');
    }

    static string BemaKuerzel(string ziffer)
    {
        var m = Regex.Match(ziffer, @"^13([a-d])0$");
        return m.Success ? $"f{"abcd".IndexOf(m.Groups[1].Value[0]) + 1}0" : "";
    }

    static byte[] DateBytesIso(string? iso)
    {
        if (string.IsNullOrEmpty(iso) || iso.Length < 10
            || !DateOnly.TryParseExact(iso[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            throw new KvaImportError("Plandatum ist ungültig.");
        var r = new byte[4];
        r[0] = (byte)d.Day;
        r[1] = (byte)d.Month;
        BitConverter.GetBytes((ushort)d.Year).CopyTo(r, 2);
        return r;
    }

    static decimal Dec(object? value, string name, decimal? lo = null, decimal? hi = null)
    {
        decimal x;
        try
        {
            x = value switch
            {
                decimal d => d,
                int i => i,
                long l => l,
                double db when double.IsFinite(db) => DensHkp.DecFromDouble(db),
                JsonElement je when je.ValueKind == JsonValueKind.Number => DensHkp.DecFromDouble(je.GetDouble()),
                JsonElement je when je.ValueKind == JsonValueKind.String => decimal.Parse(je.GetString()!, NumberStyles.Float, CultureInfo.InvariantCulture),
                string s => decimal.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture),
                _ => throw new Exception(),
            };
        }
        catch { throw new KvaImportError($"{name} ist keine Zahl."); }
        if ((lo.HasValue && x < lo.Value) || (hi.HasValue && x > hi.Value))
            throw new KvaImportError($"{name} liegt außerhalb des gültigen Bereichs.");
        return x;
    }

    static string Cp1252Check(string text, string name)
    {
        try { DensPfad.Cp1252Strict.GetBytes(text); return text; }
        catch (EncoderFallbackException) { throw new KvaImportError($"{name} enthält Zeichen, die DENS nicht speichern kann."); }
    }

    static string ZahnStr(Dictionary<string, object?> p)
    {
        var t = (Convert.ToString(p.GetValueOrDefault("zahn")) ?? "").Trim();
        if (t == "OK,UK") return "OK";
        return t.Length > 31 ? t[..31] : t;
    }

    public static List<byte[]> EncodeErklaerung(object? textObj, string name = "Begründung")
    {
        var raw = Convert.ToString(textObj) ?? "";
        var collapsed = string.Join(' ', raw.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var text = Cp1252Check(collapsed, name);
        if (text.Length == 0) return [];
        if (text.Length > ErklaerungMax)
            throw new KvaImportError($"{name} hat {text.Length} Zeichen, DENS speichert höchstens {ErklaerungMax} – bitte in PlanR kürzen.");
        var head = new byte[ErklaerungSize];
        BitConverter.GetBytes((short)ErklaerungFreitext).CopyTo(head, 0);
        BitConverter.GetBytes((short)(DensPfad.Cp1252Strict.GetByteCount(text) + 1)).CopyTo(head, 8);
        DensHkp.Put(head, 10, ErklaerungText + 1, text.Length > ErklaerungText ? text[..ErklaerungText] : text);
        var outList = new List<byte[]> { head };
        var rest = text.Length > ErklaerungText ? text[ErklaerungText..] : "";
        while (rest.Length > 0)
        {
            var folge = new byte[FolgeSize];
            var chunk = rest.Length > FolgeText ? rest[..FolgeText] : rest;
            DensHkp.Put(folge, 0, FolgeSize, chunk);
            outList.Add(folge);
            rest = rest.Length > FolgeText ? rest[FolgeText..] : "";
        }
        return outList;
    }

    public static string DensNummer(Dictionary<string, object?> p)
    {
        var nr = (Convert.ToString(p.GetValueOrDefault("nr")) ?? "").Trim();
        if (Convert.ToString(p.GetValueOrDefault("ebene")) == "GOAE")
        {
            nr = nr.TrimStart('Ä', 'A');
            if (!GoaeNrRe.IsMatch(nr)) throw new KvaImportError($"GOÄ-Nummer '{nr}' ist ungültig.");
            return "Ä" + nr;
        }
        if (!NrRe.IsMatch(nr)) throw new KvaImportError($"GOZ-Nummer '{nr}' ist ungültig.");
        return nr.ToUpperInvariant();
    }

    public static Dictionary<string, string> AnalogZiffern(Dictionary<string, object?> plan)
    {
        var outDict = new Dictionary<string, string>(StringComparer.Ordinal);
        if (plan.GetValueOrDefault("positionen") is not List<object?> list) return outDict;
        foreach (var item in list)
        {
            if (item is not Dictionary<string, object?> p || Convert.ToString(p.GetValueOrDefault("ebene")) != "GOZ") continue;
            var nr = (Convert.ToString(p.GetValueOrDefault("nr")) ?? "").Trim();
            if (NrRe.IsMatch(nr) && nr.Length == 5)
            {
                var bez = (Convert.ToString(p.GetValueOrDefault("bezeichnung")) ?? "").Trim();
                outDict.TryAdd(nr.ToUpperInvariant(), bez.Length > 0 ? bez : $"Analogleistung {nr}");
            }
        }
        return outDict;
    }

    public static List<string> KatalogNummern(Dictionary<string, object?> plan)
    {
        var outList = new List<string>();
        if (plan.GetValueOrDefault("positionen") is not List<object?> list) return outList;
        foreach (var item in list)
        {
            if (item is not Dictionary<string, object?> p) continue;
            var eb = Convert.ToString(p.GetValueOrDefault("ebene"));
            if (eb is not ("GOZ" or "GOAE")) continue;
            try
            {
                var nr = DensNummer(p);
                if (!outList.Contains(nr)) outList.Add(nr);
            }
            catch (KvaImportError) { }
        }
        return outList;
    }

    public static Dictionary<string, string> KuerzelAusKatalog(List<object?> rows, string? datum)
    {
        var tag = (datum ?? "").Length >= 10 ? datum![..10] : (datum ?? "");
        var beste = new Dictionary<string, (bool Gilt, string From, string Code)>(StringComparer.Ordinal);
        foreach (var r in rows.OfType<Dictionary<string, object?>>())
        {
            var code = Convert.ToString(r.GetValueOrDefault("code")) ?? "";
            if (code.Length == 0) continue;
            var from = Convert.ToString(r.GetValueOrDefault("from")) ?? "";
            var to = Convert.ToString(r.GetValueOrDefault("to")) ?? "";
            var gilt = (from.Length == 0 || string.CompareOrdinal(from, tag) <= 0) && (to.Length == 0 || string.CompareOrdinal(tag, to) <= 0);
            var nr = Convert.ToString(r["number"])!;
            if (!beste.TryGetValue(nr, out var alt) || (gilt && !alt.Gilt) || (gilt == alt.Gilt && string.CompareOrdinal(from, alt.From) > 0))
                beste[nr] = (gilt, from, code);
        }
        return beste.ToDictionary(kv => kv.Key, kv => kv.Value.Code, StringComparer.Ordinal);
    }

    public static HashSet<string> KatalogZiffern(List<object?> rows)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var r in rows.OfType<Dictionary<string, object?>>())
            if (Convert.ToString(r.GetValueOrDefault("number")) is { Length: > 0 } nr) set.Add(nr);
        return set;
    }

    public static (Dictionary<string, object?> Plan, List<Dictionary<string, object?>> Skipped) PositionenOhneFehlendeGoae(
        Dictionary<string, object?> plan, HashSet<string> vorhanden)
    {
        if (plan.GetValueOrDefault("positionen") is not List<object?> positionen || vorhanden.Count == 0)
            return (plan, []);
        var neu = new List<object?>();
        var skipped = new List<Dictionary<string, object?>>();
        foreach (var item in positionen)
        {
            if (item is Dictionary<string, object?> p && Convert.ToString(p.GetValueOrDefault("ebene")) == "GOAE")
            {
                string nr;
                try { nr = DensNummer(p); }
                catch (KvaImportError)
                {
                    skipped.Add(new Dictionary<string, object?>
                    {
                        ["ebene"] = "GOAE", ["nr"] = Convert.ToString(p.GetValueOrDefault("nr")) ?? "",
                        ["zahn"] = Convert.ToString(p.GetValueOrDefault("zahn")) ?? "",
                        ["betrag"] = (double)Dec(p.GetValueOrDefault("betrag") ?? 0, "Betrag"),
                        ["grund"] = "fehlt im DENS-Leistungskatalog",
                    });
                    continue;
                }
                if (!vorhanden.Contains(nr))
                {
                    skipped.Add(new Dictionary<string, object?>
                    {
                        ["ebene"] = "GOAE", ["nr"] = nr.TrimStart('Ä'),
                        ["zahn"] = Convert.ToString(p.GetValueOrDefault("zahn")) ?? "",
                        ["betrag"] = (double)Dec(p.GetValueOrDefault("betrag") ?? 0, "Betrag"),
                        ["grund"] = "fehlt im DENS-Leistungskatalog",
                    });
                    continue;
                }
            }
            neu.Add(item);
        }
        if (skipped.Count == 0) return (plan, []);
        var kopie = new Dictionary<string, object?>(plan, StringComparer.Ordinal) { ["positionen"] = neu };
        return (kopie, skipped);
    }

    static (byte[] Raw, byte[]? Note, List<byte[]> Erklaerung) EncodeLeistung(
        Dictionary<string, object?> p, Dictionary<string, object?>? bema, Dictionary<string, string>? kuerzel)
    {
        var goae = Convert.ToString(p.GetValueOrDefault("ebene")) == "GOAE";
        var nr = DensNummer(p);
        var anzahl = (int)Dec(p.GetValueOrDefault("anzahl") ?? 1, $"Anzahl {nr}", 1, 99);
        var faktor = Dec(p.GetValueOrDefault("faktor") ?? 1, $"Faktor {nr}", 0.1m, 10m);
        var einzel = Dec(p.GetValueOrDefault("einzelpreis"), $"Einzelpreis {nr}", 0, 99999);
        var raw = new byte[LeistungSize];
        var zahn = ZahnStr(p);
        DensHkp.Put(raw, 8, 32, zahn);
        DensHkp.Put(raw, 40, 8, nr);
        var ku = (kuerzel is not null && kuerzel.TryGetValue(nr, out var kv) && kv.Length > 0) ? kv : GozFuellung.GetValueOrDefault(nr, "");
        DensHkp.Put(raw, 48, 10, ku);
        BitConverter.GetBytes((short)anzahl).CopyTo(raw, 58);
        BitConverter.GetBytes(DensHkp.Away0(faktor * 100m)).CopyTo(raw, 60);
        BitConverter.GetBytes(goae ? GoaeMerkmal : KatalogMerkmal.GetValueOrDefault(nr, (short)0)).CopyTo(raw, 80);
        BitConverter.GetBytes(goae ? DensHkp.Cents(einzel / faktor) : DensHkp.Cents(einzel)).CopyTo(raw, 84);
        if (bema is not null)
        {
            var ziffer = BemaZiffer(Convert.ToString(bema.GetValueOrDefault("nr")));
            DensHkp.Put(raw, 88, 8, ziffer);
            DensHkp.Put(raw, 96, 10, BemaKuerzel(ziffer));
            BitConverter.GetBytes((short)(int)Dec(bema.GetValueOrDefault("punkte") ?? 0, $"BEMA-Punkte {ziffer}", 0, 9999)).CopyTo(raw, 106);
        }
        BitConverter.GetBytes((short)(faktor > FreiAbFaktor ? 1 : 0)).CopyTo(raw, 108);
        if (!goae)
        {
            var punkte = faktor != 0 ? einzel / (faktor * DensHkp.GozPunktwertRaw / 10_000_000m) : 0m;
            BitConverter.GetBytes((short)DensHkp.Away0(punkte)).CopyTo(raw, 114);
            BitConverter.GetBytes((short)1).CopyTo(raw, 116);
        }
        var text = bema is not null
            ? $"abzügl. BEMA-Ziffer: {BemaZiffer(Convert.ToString(bema.GetValueOrDefault("nr")))}"
            : (Convert.ToString(p.GetValueOrDefault("bezeichnung")) ?? "").Trim();
        byte[]? note = null;
        if (text.Length > 0)
        {
            note = new byte[AnmerkungSize];
            var safe = DensPfad.Cp1252.GetString(DensPfad.Cp1252.GetBytes(text));
            DensHkp.Put(note, 0, AnmerkungSize - 1, safe);
            BitConverter.GetBytes((short)1).CopyTo(raw, 68);
        }
        var begrLabel = $"Begründung zu {(goae ? "GOÄ" : "GOZ")} {nr.TrimStart('Ä')} {zahn}".Trim();
        return (raw, note, EncodeErklaerung(p.GetValueOrDefault("begruendung"), begrLabel));
    }

    static Dictionary<string, object?> LaborPosition(Dictionary<string, object?> p, int index)
    {
        var ebene = Convert.ToString(p.GetValueOrDefault("ebene")) ?? "";
        var nr = (Convert.ToString(p.GetValueOrDefault("nr")) ?? "").Trim();
        if (ebene == "BEB" && !Regex.IsMatch(nr, @"^\d{4}$"))
            throw new KvaImportError($"BEB-Nummer '{nr}' in Position {index} ist ungültig.");
        var count = Dec(p.GetValueOrDefault("anzahl") ?? 1, $"Anzahl Position {index}", 0.01m, 99m);
        var betrag = Dec(p.GetValueOrDefault("betrag") ?? 0, $"Betrag Position {index}", 0, 99999);
        var price = p.ContainsKey("einzelpreis") && p["einzelpreis"] is not null
            ? Dec(p["einzelpreis"], $"Einzelpreis Position {index}", 0, 99999)
            : Dec(betrag / count, $"Einzelpreis Position {index}", 0, 99999);
        var lab = Convert.ToString(p.GetValueOrDefault("labor"));
        if (string.IsNullOrEmpty(lab)) lab = ebene == "MAT" ? "eigen" : "fremd";
        if (lab is not ("eigen" or "fremd"))
            throw new KvaImportError($"Labor in Position {index} ist ungültig.");
        var bez = (Convert.ToString(p.GetValueOrDefault("bezeichnung")) ?? "").Trim();
        if (bez.Length > 200) bez = bez[..200];
        var text = Cp1252Check(bez, $"Bezeichnung Position {index}");
        var vat = Dec(p.ContainsKey("mwst") && p["mwst"] is not null ? p["mwst"] : MwstLabor / 100m, $"MwSt. Position {index}", 0, 25);
        var level = ebene switch { "BEB" => "BEB", "MAT" => "MAT", _ => "LAB" };
        return new Dictionary<string, object?>
        {
            ["level"] = level, ["number"] = nr, ["count"] = (double)count, ["price"] = (double)price,
            ["tooth"] = ZahnStr(p), ["lab"] = lab, ["text"] = text, ["vat"] = (double)vat,
        };
    }

    static byte[] EncodeLaborPosition(Dictionary<string, object?> p)
    {
        var raw = new byte[LaborpositionSize];
        DensHkp.Put(raw, 12, 32, Convert.ToString(p["tooth"]));
        DensHkp.Put(raw, 44, 8, Convert.ToString(p["code"]));
        BitConverter.GetBytes(DensHkp.Away0(DensHkp.DecFromDouble(Convert.ToDouble(p["count"])) * 100m)).CopyTo(raw, 52);
        BitConverter.GetBytes((short)(Convert.ToString(p["lab"]) == "eigen" ? DensHkp.LaborEigen : DensHkp.LaborFremd1)).CopyTo(raw, 56);
        BitConverter.GetBytes(DensHkp.Cents(Convert.ToDouble(p["price"]))).CopyTo(raw, 60);
        var vat = p.ContainsKey("vat") && p["vat"] is not null ? Convert.ToDouble(p["vat"]) : MwstLabor / 100.0;
        BitConverter.GetBytes((short)DensHkp.Away0(DensHkp.DecFromDouble(vat) * 100m)).CopyTo(raw, 64);
        return raw;
    }

    public static Dictionary<string, object?> EncodeKva(
        Dictionary<string, object?> plan,
        Dictionary<string, string>? kuerzel = null,
        string[]? arten = null,
        HashSet<string>? katalog = null)
    {
        arten ??= ["KO", "IM"];
        if (Convert.ToString(plan.GetValueOrDefault("format")) != "planr-plan"
            || !Equals(plan.GetValueOrDefault("version"), 1) && !Equals(plan.GetValueOrDefault("version"), 1L))
            throw new KvaImportError("Kein PlanR-Plan (format planr-plan, Version 1).");
        var planart = Convert.ToString(plan.GetValueOrDefault("planart"));
        if (planart is not ("kva" or "mkv"))
            throw new KvaImportError("Planart muss kva oder mkv sein.");
        var art = Convert.ToString(plan.GetValueOrDefault("art"));
        if (!arten.Contains(art))
            throw new KvaImportError("Als Kostenvoranschlag übernimmt DENS Kons-, Füllungs- und Implantologiepläne; Privat-ZE geht in die Privatprothetik.");
        if (plan.GetValueOrDefault("positionen") is not List<object?> positionen || positionen.Count == 0)
            throw new KvaImportError("Plan enthält keine Positionen.");

        var services = new List<byte[]>();
        var notes = new List<byte[]?>();
        var reasons = new List<List<byte[]>>();
        var labor = new List<Dictionary<string, object?>>();
        var skipped = new List<Dictionary<string, object?>>();
        decimal? punktwert = null;
        var i = 0;
        while (i < positionen.Count)
        {
            if (positionen[i] is not Dictionary<string, object?> p)
                throw new KvaImportError($"Position {i + 1} ist ungültig.");
            var ebene = Convert.ToString(p.GetValueOrDefault("ebene"));
            if (ebene is "GOZ" or "GOAE")
            {
                if (ebene == "GOAE" && katalog is not null)
                {
                    var nr = DensNummer(p);
                    if (!katalog.Contains(nr))
                    {
                        skipped.Add(new Dictionary<string, object?>
                        {
                            ["ebene"] = "GOAE", ["nr"] = nr.TrimStart('Ä'),
                            ["zahn"] = Convert.ToString(p.GetValueOrDefault("zahn")) ?? "",
                            ["betrag"] = (double)Dec(p.GetValueOrDefault("betrag") ?? 0, "Betrag"),
                            ["grund"] = "fehlt im DENS-Leistungskatalog",
                        });
                        i++;
                        continue;
                    }
                }
                Dictionary<string, object?>? bema = null;
                if (ebene == "GOZ" && IstWahr(p.GetValueOrDefault("mkv")))
                {
                    var nxt = i + 1 < positionen.Count ? positionen[i + 1] as Dictionary<string, object?> : null;
                    if (nxt is null || Convert.ToString(nxt.GetValueOrDefault("ebene")) != "BEMA"
                        || Convert.ToString(nxt.GetValueOrDefault("zahn")) != Convert.ToString(p.GetValueOrDefault("zahn")))
                        throw new KvaImportError($"Mehrkostenfüllung {p.GetValueOrDefault("nr")} an {p.GetValueOrDefault("zahn")} ohne BEMA-Vergleichsleistung.");
                    bema = nxt;
                    var pw = Dec(nxt.GetValueOrDefault("punktwert") ?? 0, "BEMA-Punktwert", 0, 10);
                    if (punktwert.HasValue && pw != punktwert.Value)
                        throw new KvaImportError("BEMA-Punktwerte im Plan sind uneinheitlich.");
                    punktwert = pw;
                    i++;
                }
                var (raw, note, erklaerung) = EncodeLeistung(p, bema, kuerzel);
                services.Add(raw);
                notes.Add(note);
                reasons.Add(erklaerung);
            }
            else if (ebene == "BEMA")
                throw new KvaImportError($"BEMA-Position {p.GetValueOrDefault("nr")} ohne zugehörige Mehrkostenfüllung.");
            else if (ebene is not null && LaborEbenen.Contains(ebene))
                labor.Add(LaborPosition(p, i + 1));
            else
                skipped.Add(new Dictionary<string, object?>
                {
                    ["ebene"] = ebene, ["nr"] = Convert.ToString(p.GetValueOrDefault("nr")) ?? "",
                    ["zahn"] = Convert.ToString(p.GetValueOrDefault("zahn")) ?? "",
                    ["betrag"] = (double)Dec(p.GetValueOrDefault("betrag") ?? 0, "Betrag"),
                });
            i++;
        }
        if (services.Count == 0) throw new KvaImportError("Plan enthält keine GOZ- oder GOÄ-Leistungen.");
        if (planart == "mkv" && !punktwert.HasValue) throw new KvaImportError("Mehrkostenvereinbarung ohne Mehrkostenfüllung.");

        var head = new byte[KvaSize];
        var title = Convert.ToString(plan.GetValueOrDefault("titel"));
        if (string.IsNullOrEmpty(title)) title = "PlanR";
        if (title.Length > 39) title = title[..39];
        DensHkp.Put(head, 6, 40, title);
        DateBytesIso(Convert.ToString(plan.GetValueOrDefault("datum"))).CopyTo(head, 48);
        BitConverter.GetBytes((int)((punktwert ?? 0m) * 10000m)).CopyTo(head, 56);
        BitConverter.GetBytes(Euro).CopyTo(head, 70);
        BitConverter.GetBytes(DensHkp.GozPunktwertRaw).CopyTo(head, 80);
        return new Dictionary<string, object?>
        {
            ["kva"] = DensHkp.B64(head),
            ["services"] = services.Select(DensHkp.B64).ToList(),
            ["notes"] = notes.Select(n => n is null ? "" : DensHkp.B64(n)).ToList(),
            ["reasons"] = reasons.Select(rs => rs.Select(DensHkp.B64).ToList()).ToList(),
            ["labPositions"] = labor,
            ["skipped"] = skipped,
            ["title"] = title,
        };
    }

    public static Dictionary<string, object?> EncodeLabor(List<Dictionary<string, object?>> positions)
    {
        if (positions.Count == 0) return new Dictionary<string, object?>();
        var head = new byte[LaborplanSize];
        BitConverter.GetBytes(LaborplanKva).CopyTo(head, 6);
        BitConverter.GetBytes(Euro).CopyTo(head, 60);
        return new Dictionary<string, object?>
        {
            ["labPlan"] = DensHkp.B64(head),
            ["labServices"] = positions.Select(p => DensHkp.B64(EncodeLaborPosition(p))).ToList(),
        };
    }

    // --- dens_pze.py ---
    const int PlanSize = 674, PlanzahnSize = 92, PlanbefundSize = 46;
    const short PlanbefundPrivat = 2, KeinMaterial = -1;
    const decimal LaborToleranz = 0.05m;

    public static List<string> GebissNummern(Dictionary<string, object?> plan)
    {
        var set = new SortedSet<string>(StringComparer.Ordinal);
        if (plan.GetValueOrDefault("positionen") is List<object?> list)
            foreach (var item in list)
                if (item is Dictionary<string, object?> p && Convert.ToString(p.GetValueOrDefault("ebene")) == "GOZ")
                    set.Add((Convert.ToString(p.GetValueOrDefault("nr")) ?? "").Trim().ToUpperInvariant());
        return set.ToList();
    }

    public static int LaborBrutto(List<Dictionary<string, object?>> positions)
    {
        decimal total = 0;
        foreach (var p in positions)
        {
            decimal net = DensHkp.Cents(DensHkp.DecFromDouble(Convert.ToDouble(p["count"])) * DensHkp.DecFromDouble(Convert.ToDouble(p["price"])));
            var vat = p.ContainsKey("vat") && p["vat"] is not null ? DensHkp.DecFromDouble(Convert.ToDouble(p["vat"])) : 7m;
            total += net * (1m + vat / 100m);
        }
        return DensHkp.Away0(total);
    }

    public static bool PasstInPrivatprothetik(Dictionary<string, object?> plan)
    {
        if (plan.GetValueOrDefault("positionen") is not List<object?> list || !list.All(x => x is Dictionary<string, object?>))
            return true;
        var ebenen = list.Cast<Dictionary<string, object?>>().Select(p => Convert.ToString(p.GetValueOrDefault("ebene")) ?? "").ToList();
        return ebenen.All(e => e == "GOZ" || LaborEbenen.Contains(e)) && ebenen.Any(LaborEbenen.Contains);
    }

    public static Dictionary<string, object?> EncodePrivatZe(Dictionary<string, object?> plan, Dictionary<string, int> punkte)
    {
        if (Convert.ToString(plan.GetValueOrDefault("format")) != "planr-plan"
            || !Equals(plan.GetValueOrDefault("version"), 1) && !Equals(plan.GetValueOrDefault("version"), 1L))
            throw new KvaImportError("Kein PlanR-Plan (format planr-plan, Version 1).");
        if (Convert.ToString(plan.GetValueOrDefault("planart")) != "kva" || Convert.ToString(plan.GetValueOrDefault("art")) != "ZE")
            throw new KvaImportError("Privatprothetik erwartet einen Privat-ZE-Plan (Planart kva, Art ZE).");
        if (plan.GetValueOrDefault("positionen") is not List<object?> positionen || positionen.Count == 0)
            throw new KvaImportError("Plan enthält keine Positionen.");

        var services = new List<byte[]>();
        var reasons = new List<List<byte[]>>();
        var labor = new List<Dictionary<string, object?>>();
        var honorar = 0;
        for (var i = 0; i < positionen.Count; i++)
        {
            var idx = i + 1;
            if (positionen[i] is not Dictionary<string, object?> p) throw new KvaImportError($"Position {idx} ist ungültig.");
            var ebene = Convert.ToString(p.GetValueOrDefault("ebene"));
            if (ebene == "GOZ")
            {
                var nr = (Convert.ToString(p.GetValueOrDefault("nr")) ?? "").Trim();
                if (!NrRe.IsMatch(nr)) throw new KvaImportError($"GOZ-Nummer '{nr}' in Position {idx} ist ungültig.");
                nr = nr.ToUpperInvariant();
                if (!punkte.TryGetValue(nr, out var pkt))
                    throw new KvaImportError($"GOZ {nr} fehlt im DENS-Leistungskatalog der Praxis – Plan wird nicht übernommen.");
                var anzahlDec = Dec(p.GetValueOrDefault("anzahl") ?? 1, $"Anzahl Position {idx}", 1, 99);
                var count = (int)anzahlDec;
                if (count != anzahlDec) throw new KvaImportError($"Anzahl in Position {idx} muss ganzzahlig sein.");
                var factor = Dec(p.GetValueOrDefault("faktor") ?? 1, $"Faktor Position {idx}", 0.1m, 10m);
                var price = Dec(p.GetValueOrDefault("einzelpreis") ?? 0, $"Einzelpreis Position {idx}", 0, 99999);
                var zahn = ZahnStr(p);
                var raw = Convert.FromBase64String(DensHkp.EncodeService(0, zahn.Length > 0 ? zahn : "Plan", nr, count,
                    points: pkt, factor: DensHkp.Away0(factor * 100m), baseCents: DensHkp.Cents(price)));
                BitConverter.GetBytes(0).CopyTo(raw, 64);
                BitConverter.GetBytes(KeinMaterial).CopyTo(raw, 68);
                services.Add(raw);
                reasons.Add(EncodeErklaerung(p.GetValueOrDefault("begruendung"), $"Begründung zu GOZ {nr} {zahn}".Trim()));
                honorar += count * DensHkp.Cents(price);
            }
            else if (ebene is not null && LaborEbenen.Contains(ebene))
                labor.Add(LaborPosition(p, idx));
            else
                throw new KvaImportError($"Position {idx} ({ebene} {p.GetValueOrDefault("nr") ?? ""}) gehört nicht in die Privatprothetik – Plan wird nicht übernommen.");
        }
        if (services.Count == 0) throw new KvaImportError("Plan enthält keine GOZ-Leistungen.");

        var summen = plan.GetValueOrDefault("summen") as Dictionary<string, object?> ?? new Dictionary<string, object?>();
        var soll = Dec(summen.GetValueOrDefault("laborEigen") ?? 0, "Laborsumme Eigenlabor", 0, 999999)
            + Dec(summen.GetValueOrDefault("laborFremd") ?? 0, "Laborsumme Fremdlabor", 0, 999999);
        var title = Convert.ToString(plan.GetValueOrDefault("titel"));
        if (string.IsNullOrEmpty(title)) title = "PlanR Privat-ZE";
        if (title.Length > 39) title = title[..39];
        var head = new byte[PlanSize];
        DensHkp.Put(head, 6, 40, title);
        BitConverter.GetBytes(honorar).CopyTo(head, 80);
        BitConverter.GetBytes((short)6).CopyTo(head, 128);
        BitConverter.GetBytes(Euro).CopyTo(head, 130);
        BitConverter.GetBytes((short)1).CopyTo(head, 148);
        BitConverter.GetBytes(DensHkp.GozPunktwertRaw).CopyTo(head, 236);

        var befund = new Dictionary<int, string>();
        if (plan.GetValueOrDefault("zaehne") is Dictionary<string, object?> zaehne)
            foreach (var (z, v) in zaehne)
                if (z.Length > 0 && z.All(char.IsDigit))
                {
                    var vd = v as Dictionary<string, object?>;
                    befund[int.Parse(z)] = DensKuerzel.BefundKasse(vd?.GetValueOrDefault("B"));
                }
        for (var k = 0; k < DensHkp.FdiOrder.Length; k++)
        {
            var b = befund.GetValueOrDefault(DensHkp.FdiOrder[k], "");
            DensHkp.Put(head, 418 + k * 4, 4, b.Length > 0 ? b : " ");
        }
        var planTeeth = new List<string>();
        foreach (var n in DensHkp.FdiOrder)
            if (befund.GetValueOrDefault(n) == "f")
            {
                var row = new byte[PlanzahnSize];
                BitConverter.GetBytes((short)n).CopyTo(row, 0);
                BitConverter.GetBytes((ushort)4).CopyTo(row, 4);
                BitConverter.GetBytes((short)2).CopyTo(row, 64);
                row[78] = 0x80; row[79] = 0x2d;
                planTeeth.Add(DensHkp.B64(row));
            }
        var bundle = new Dictionary<string, object?>
        {
            ["plan"] = head,
            ["services"] = services.Select(DensHkp.B64).ToList(),
            ["reasons"] = reasons.Select(rs => rs.Select(DensHkp.B64).ToList()).ToList(),
            ["labPositions"] = labor,
            ["planTeeth"] = planTeeth,
            ["title"] = title,
            ["laborSoll"] = DensHkp.Cents(soll),
        };
        if (planTeeth.Count > 0)
        {
            var finding = new byte[PlanbefundSize];
            BitConverter.GetBytes(PlanbefundPrivat).CopyTo(finding, 20);
            bundle["planFinding"] = DensHkp.B64(finding);
        }
        return bundle;
    }

    public static Dictionary<string, object?> EncodePrivatLabor(Dictionary<string, object?> bundle)
    {
        var positions = (List<Dictionary<string, object?>>)bundle["labPositions"]!;
        var ist = positions.Count > 0 ? LaborBrutto(positions) : 0;
        var soll = Convert.ToInt32(bundle["laborSoll"]);
        if (Math.Abs((decimal)(ist - soll) / 100m) > LaborToleranz)
            throw new KvaImportError($"Laborpositionen ergeben {(ist / 100.0).ToString("F2", CultureInfo.InvariantCulture)} EUR, der Plan {(soll / 100.0).ToString("F2", CultureInfo.InvariantCulture)} EUR – Plan wird nicht übernommen.");
        var head = (byte[])bundle["plan"]!;
        BitConverter.GetBytes(ist).CopyTo(head, 84);
        var res = new Dictionary<string, object?> { ["plan"] = DensHkp.B64(head) };
        if (positions.Count > 0)
        {
            var labPlan = new byte[LaborplanSize];
            BitConverter.GetBytes(LaborplanProthetik).CopyTo(labPlan, 6);
            BitConverter.GetBytes(Euro).CopyTo(labPlan, 60);
            res["labPlan"] = DensHkp.B64(labPlan);
            res["labServices"] = positions.Select(p => DensHkp.B64(EncodeLaborPosition(p))).ToList();
        }
        return res;
    }

    // --- dens_notiz.py ---
    const int Seite = 199, Seitenlaenge = 200, MaxSeiten = 20;

    public static List<byte[]> NotizSeiten(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) throw new ArgumentException("Dokumentation ohne Text.");
        byte[] roh;
        try { roh = DensPfad.Cp1252Strict.GetBytes(text); }
        catch (EncoderFallbackException) { throw new ArgumentException("Dokumentation enthält Zeichen, die DENS nicht speichert."); }
        if (roh.Length > MaxSeiten * Seite) throw new ArgumentException("Dokumentation zu lang.");
        var seiten = new List<byte[]>();
        for (var start = 0; start < roh.Length; start += Seite)
        {
            var len = Math.Min(Seite, roh.Length - start);
            var page = new byte[Seitenlaenge];
            Array.Copy(roh, start, page, 0, len);
            seiten.Add(page);
        }
        return seiten;
    }

    // --- KVA Hinweise (dens_connector_service.py) ---
    static readonly Dictionary<string, string> EbenenNamen = new(StringComparer.Ordinal)
        { ["MAT"] = "Material", ["BEB"] = "Labor", ["LABOR"] = "Labor", ["GOAE"] = "GOÄ" };

    public static List<string> KvaHinweise(List<Dictionary<string, object?>> skipped)
    {
        if (skipped.Count == 0) return [];
        var katalog = new List<string>();
        var rest = new List<string>();
        foreach (var s in skipped)
        {
            var eb = Convert.ToString(s.GetValueOrDefault("ebene")) ?? "";
            var ebName = EbenenNamen.GetValueOrDefault(eb, eb);
            var nr = Convert.ToString(s.GetValueOrDefault("nr")) ?? "";
            var zahn = Convert.ToString(s.GetValueOrDefault("zahn")) ?? "";
            var betrag = Convert.ToDouble(s.GetValueOrDefault("betrag") ?? 0.0).ToString("F2", CultureInfo.InvariantCulture);
            var teil = $"{ebName} {nr} {zahn} {betrag} €".Replace("  ", " ").Replace('.', ',');
            if (Convert.ToString(s.GetValueOrDefault("grund")) == "fehlt im DENS-Leistungskatalog") katalog.Add(teil);
            else rest.Add(teil);
        }
        var outList = new List<string>();
        if (katalog.Count > 0) outList.Add($"Nicht übertragen (fehlt im DENS-Leistungskatalog): {string.Join("; ", katalog)}.");
        if (rest.Count > 0) outList.Add($"Nicht übertragen, bitte in DENS ergänzen: {string.Join("; ", rest)}.");
        return outList;
    }

    static bool IstWahr(object? v) => v switch
    {
        bool b => b,
        int i => i != 0,
        long l => l != 0,
        double d => d != 0,
        string s => s.Length > 0,
        _ => false,
    };

    /// <summary>Rekursive Konvertierung eines JsonElement in Dictionary/List/Primitive (wie json.loads in Python).</summary>
    public static object? AusJson(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Object => el.EnumerateObject().ToDictionary(p => p.Name, p => AusJson(p.Value), StringComparer.Ordinal),
        JsonValueKind.Array => el.EnumerateArray().Select(AusJson).ToList(),
        JsonValueKind.String => el.GetString(),
        JsonValueKind.Number => el.TryGetInt32(out var i) ? (object)i : el.TryGetInt64(out var l) ? (object)l : el.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null,
    };
}
