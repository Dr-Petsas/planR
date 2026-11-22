using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Z1;

using Zeile = Dictionary<string, object?>;

/// <summary>Ungültige Eingabe: wird zu 400 wie ValueError im Python-Connector.</summary>
public sealed class Z1Eingabe(string text) : Exception(text);

static class Py
{
    public static string S(Zeile? z, string name) => z is not null && z.TryGetValue(name, out var w) && w is not null ? Convert.ToString(w, CultureInfo.InvariantCulture) ?? "" : "";
    public static string Klein(string s) => s.ToLowerInvariant().Replace("ß", "ss");
    public static string[] Worte(string s) => s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
    public static bool Ziffern(string s) => s.Length > 0 && s.All(char.IsDigit);
    public static bool Ganz(string s, out long wert) =>
        long.TryParse(s.Trim(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out wert);
}

/// <summary>01-Befund zwischen PlanR und Z1 (z1_befund.py).</summary>
public static class Z1Befund
{
    public static readonly int[] Reihe =
    [
        18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
        48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
    ];

    public static readonly Dictionary<char, string> AusZ1 = new()
    {
        ['f'] = "f", ['n'] = "f", ['k'] = "k", ['t'] = "t", ['b'] = "b", ['e'] = "e", ['i'] = "i", ['x'] = "x", [')'] = ")(",
        ['z'] = "ww", ['w'] = "ww", ['g'] = "k", ['h'] = "b",
    };

    public static readonly Dictionary<string, char> NachZ1 = new()
    {
        [""] = ' ', ["f"] = 'f', [")("] = ')', ["e"] = 'e', ["ew"] = 'e', ["b"] = 'b', ["bw"] = 'b', ["ab"] = 'b', ["abw"] = 'b',
        ["a"] = 'k', ["aw"] = 'k', ["k"] = 'k', ["kw"] = 'k', ["t"] = 't', ["tw"] = 't', ["t2w"] = 't', ["x"] = 'x', ["ww"] = 'w',
        ["pw"] = 'w', ["pkw"] = 'w', ["r"] = 'k', ["rw"] = 'k', ["ur"] = ' ', ["i"] = 'i', ["ix"] = 'x', ["sw"] = 'i',
        ["sk"] = 'i', ["st"] = 'i', ["se"] = 'i', ["sb"] = 'b', ["so"] = 'i', ["skw"] = 'i', ["stw"] = 'i', ["sew"] = 'i', ["sbw"] = 'b', ["sow"] = 'i',
    };

    static readonly List<string> Kuerzel = [.. NachZ1.Keys.Order(StringComparer.Ordinal)];

    public static string Version(string? befund)
    {
        var text = befund ?? "";
        text = (text.Length > 32 ? text[..32] : text).PadRight(32);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant()[..16];
    }

    /// <summary>{date, befund} aus Z1 → Antwort für GET /patients/nr/befunde/01.</summary>
    public static Zeile Lesen(Zeile? roh)
    {
        var text = Py.S(roh, "befund").PadRight(32);
        var teeth = new Zeile();
        for (var i = 0; i < Reihe.Length; i++)
            teeth[Reihe[i].ToString()] = new Zeile { ["status"] = AusZ1.GetValueOrDefault(text[i], "") };
        var datum = Py.S(roh, "date");
        return new Zeile
        {
            ["version"] = Version(text),
            ["current"] = new Zeile { ["date"] = datum, ["teeth"] = teeth },
            ["items"] = datum.Length > 0 ? new List<object?> { new Zeile { ["date"] = datum } } : new List<object?>(),
            ["pvs"] = "Z1.PRO",
            ["scope"] = "Z1 führt je Zahn ein Zeichen; erneuerungsbedürftig (w) bleibt in PlanR.",
            ["codes"] = Kuerzel,
        };
    }
}

/// <summary>Suche in der Patientenliste (z1_stamm.py).</summary>
public static class Z1Stamm
{
    /// <summary>Vier Telefonfelder ohne feste Bedeutung: die erste Mobilnummer ist mobile, der Rest phone/phone2.</summary>
    public static void Telefone(Zeile patient)
    {
        var roh = patient.TryGetValue("phones", out var p) && p is List<string> liste ? liste : [];
        patient.Remove("phones");
        var sauber = roh.Select(n => string.Concat(Py.Worte(n))).Where(n => n.Count(char.IsDigit) >= 5).ToList();
        var mobil = sauber.FirstOrDefault(n =>
        {
            var kern = n.TrimStart('+');
            return kern.StartsWith("01", StringComparison.Ordinal) || kern.StartsWith("491", StringComparison.Ordinal) || kern.StartsWith("00491", StringComparison.Ordinal);
        }) ?? "";
        var fest = sauber.Where(n => n != mobil).ToList();
        patient["phone"] = fest.Count > 0 ? fest[0] : "";
        patient["mobile"] = mobil;
        patient["phone2"] = fest.Count > 1 ? fest[1] : "";
    }

    static string Text(Zeile p)
    {
        var geburt = Py.S(p, "birthDate");
        var deutsch = "";
        if (Regex.IsMatch(geburt, @"\A\d{4}-\d{2}-\d{2}\z"))
        {
            var t = geburt.Split('-');
            deutsch = $"{t[2]}.{t[1]}.{t[0]} {int.Parse(t[2], CultureInfo.InvariantCulture)}.{int.Parse(t[1], CultureInfo.InvariantCulture)}.{t[0]}";
        }
        return Py.Klein(string.Join(' ', Py.S(p, "id"), Py.S(p, "lastName"), Py.S(p, "firstName"), geburt, deutsch));
    }

    public static List<Zeile> Suchen(List<Zeile> alle, string suche, int limit)
    {
        var woerter = Py.Worte(Py.Klein(suche)).Take(4).ToList();
        if (woerter.Count == 0) throw new Z1Eingabe("Suchtext fehlt.");
        if (limit is < 1 or > 100) throw new Z1Eingabe("limit muss zwischen 1 und 100 liegen.");
        return alle.Where(p => { var t = Text(p); return woerter.All(w => t.Contains(w, StringComparison.Ordinal)); }).Take(limit).ToList();
    }

    public static List<Zeile> Namen(List<Zeile> alle, string vorname, string nachname, int limit)
    {
        string v = Py.Klein(vorname).Trim(), n = Py.Klein(nachname).Trim();
        if (v.Length == 0 && n.Length == 0) throw new Z1Eingabe("Suchtext fehlt.");
        return alle.Where(p => Py.Klein(Py.S(p, "firstName")).StartsWith(v, StringComparison.Ordinal)
                            && Py.Klein(Py.S(p, "lastName")).StartsWith(n, StringComparison.Ordinal)).Take(limit).ToList();
    }

    public static Zeile? Einer(List<Zeile> alle, string patnr)
    {
        var nummer = patnr.Trim();
        return alle.FirstOrDefault(p => Py.S(p, "id") == nummer);
    }
}

/// <summary>Z1-Gebührenliste → dieselbe Form wie DS-Win /praxis/katalog (z1_katalog.py).</summary>
public static class Z1Katalog
{
    static readonly Regex Analog = new(@"(\d{4})a$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    static readonly Regex Preis = new(@"^([ef])\s*(\d+)\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    static object Punkte(string wert)
    {
        var text = wert.Trim();
        return Py.Ziffern(text) ? double.Parse(text, CultureInfo.InvariantCulture) / 100 : 0;
    }

    static (bool Eigen, double Betrag)? Laborpreis(string wert)
    {
        var m = Preis.Match(wert.Trim());
        if (!m.Success) return null;
        return (m.Groups[1].Value.ToLowerInvariant() == "e", double.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) / 100);
    }

    static string Vier(string nr)
    {
        var ziffern = string.Concat(nr.Where(char.IsDigit));
        return ziffern.Length >= 4 ? ziffern[^4..] : "";
    }

    /// <summary>Makros → Leistungsketten. Privat (Gebührenordnung 7, GOZ) und Kasse (5, BEMA); wahlweise Zeilen bleiben weg.</summary>
    public static List<Zeile> Komplexe(Zeile? makros)
    {
        var arten = new Dictionary<string, (string Goart, string Ebene)> { ["7"] = ("q", "GOZ"), ["5"] = ("g", "BEMA") };
        var texte = new Dictionary<(string Id, string Go), string>();
        foreach (var m in Liste(makros, "makros"))
        {
            var go = Py.S(m, "go").Trim();
            if (arten.ContainsKey(go)) texte[(Py.S(m, "id").Trim(), go)] = Py.S(m, "text").Trim();
        }
        long Lfd(Zeile z)
        {
            var roh = Py.S(z, "lfd");
            var text = (roh.Length > 0 ? roh : "0").Trim();
            if (text.Length == 0) return 0;
            if (!Py.Ganz(text, out var wert)) throw new Z1Eingabe($"invalid literal for int() with base 10: '{text}'");
            return wert;
        }
        var ketten = new Dictionary<(string Id, string Go), List<object?>>();
        foreach (var z in Liste(makros, "zeilen").OrderBy(Lfd))
        {
            var key = (Py.S(z, "id").Trim(), Py.S(z, "go").Trim());
            var nr = Py.S(z, "nr").Trim();
            if (!texte.ContainsKey(key) || Py.S(z, "goart").Trim() != arten[key.Item2].Goart) continue;
            if (Py.S(z, "fakultativ").Trim() == "1" || nr.Length == 0 || nr.ToLowerInvariant().StartsWith("fz", StringComparison.Ordinal) || nr.Length > 12) continue;
            var roh = Py.S(z, "anzahl");
            double anzahl = Py.Ganz(roh.Length > 0 ? roh : "100", out var a) ? a / 100.0 : 1;
            var pos = new Zeile { ["ebene"] = arten[key.Item2].Ebene, ["nr"] = nr };
            if (anzahl > 1) pos["anzahl"] = anzahl;
            if (!ketten.TryGetValue(key, out var kette)) ketten[key] = kette = [];
            kette.Add(pos);
        }
        return ketten
            .OrderBy(k => k.Key.Id, StringComparer.Ordinal).ThenBy(k => k.Key.Go, StringComparer.Ordinal)
            .Where(k => k.Key.Id.Length is > 0 and <= 12)
            .Select(k => new Zeile { ["kuerzel"] = k.Key.Id, ["text"] = texte[k.Key], ["positionen"] = k.Value.Take(40).ToList() })
            .ToList();
    }

    static IEnumerable<Zeile> Liste(Zeile? quelle, string name) =>
        quelle is not null && quelle.TryGetValue(name, out var w) && w is List<Zeile> liste ? liste : [];

    public static Zeile Bauen(List<Zeile> zeilen, Zeile? makros)
    {
        var labor = new List<object?>();
        var goz = new List<object?>();
        int belN = 0, bebN = 0;
        foreach (var row in zeilen)
        {
            string nr = Py.S(row, "nr").Trim(), art = Py.S(row, "art").Trim(), text = Py.S(row, "text").Trim();
            if (nr.Length == 0 || text.Length == 0) continue;
            var analog = Analog.Match(nr);
            if (art == "q" || (analog.Success && art == "p"))
            {
                if (!analog.Success && !Regex.IsMatch(nr, @"\A\d{4}\z")) continue;
                var eintrag = new Zeile { ["nr"] = nr, ["text"] = text, ["punkte"] = Punkte(Py.S(row, "punkte")), ["eigen"] = analog.Success };
                if (analog.Success) eintrag["analogZu"] = analog.Groups[1].Value;
                goz.Add(eintrag);
                continue;
            }
            var preis = Laborpreis(Py.S(row, "lab"));
            if (preis is null || preis.Value.Betrag <= 0) continue;
            var (eigen, betrag) = preis.Value;
            var preise = new List<object?> { betrag, 0, 0, 0 };
            if (art == "1")
            {
                var bel = Vier(nr);
                if (bel.Length == 0) continue;
                belN++;
                labor.Add(new Zeile { ["liste"] = 2, ["code"] = nr, ["text"] = text, ["preise"] = preise, ["bel"] = bel });
            }
            else if (art is "3" or "4")
            {
                var beb = Vier(nr);
                if (beb.Length == 0) continue;
                bebN++;
                labor.Add(new Zeile { ["liste"] = 4, ["code"] = nr, ["text"] = text, ["preise"] = preise, ["nr"] = beb, ["eigenlabor"] = eigen });
            }
            else if (art == "8")
            {
                bebN++;
                var zeile = new Zeile
                {
                    ["liste"] = 4, ["code"] = nr, ["text"] = text, ["preise"] = preise,
                    ["material"] = (nr.Length > 4 ? nr[..4] : nr).ToLowerInvariant(), ["eigenlabor"] = eigen,
                };
                if (text.Contains("NEM", StringComparison.Ordinal)) zeile["werkstoff"] = "nem";
                labor.Add(zeile);
            }
        }
        return new Zeile
        {
            ["pvs"] = "Z1.PRO",
            ["listen"] = new List<object?>
            {
                new Zeile { ["nr"] = 2, ["name"] = "Z1 BEL", ["mitPreis"] = new List<object?> { belN, 0, 0, 0 }, ["art"] = "BEL" },
                new Zeile { ["nr"] = 4, ["name"] = "Z1 Labor", ["mitPreis"] = new List<object?> { bebN, 0, 0, 0 }, ["art"] = "BEB" },
            },
            ["vorschlag"] = new Zeile { ["liste"] = 4, ["spalte"] = 1, ["quelle"] = "Z1-Gebührenliste" },
            ["vorschlagKasse"] = new Zeile { ["liste"] = 2, ["spalte"] = 1, ["quelle"] = "Z1-Gebührenliste" },
            ["labor"] = labor,
            ["goz"] = goz,
            ["komplexe"] = Komplexe(makros),
        };
    }
}

/// <summary>Z1-Plan → PlanR-HKP in derselben Form wie bei DS-Win und DENSoffice (z1_hkp_planr.py).</summary>
public static class Z1Planr
{
    /// <summary>Hex-Maske (ein Bit je Zahn) → '15-13', '16,26', 'OK', 'UK'.</summary>
    public static string ZaehneAusMaske(string maske)
    {
        var text = maske.Length > 0 ? maske : "0";
        text = text.Length > 8 ? text[..8] : text;
        if (!uint.TryParse(text.Trim(), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var wert)) return "";
        var bits = Convert.ToString(wert, 2).PadLeft(32, '0');
        var teile = new List<string>();
        foreach (var (start, name) in new[] { (0, "OK"), (16, "UK") })
        {
            var kiefer = bits.Substring(start, 16);
            if (kiefer == new string('1', 16)) { teile.Add(name); continue; }
            var i = 0;
            while (i < 16)
            {
                if (kiefer[i] != '1') { i++; continue; }
                var j = i;
                while (j + 1 < 16 && kiefer[j + 1] == '1') j++;
                int a = Z1Befund.Reihe[start + i], b = Z1Befund.Reihe[start + j];
                teile.Add(a == b ? a.ToString() : $"{a}-{b}");
                i = j + 1;
            }
        }
        return string.Join(',', teile);
    }

    static double Cent(string wert) => Py.Ganz(wert.Trim().TrimStart('e'), out var w) ? w / 100.0 : 0;

    static double Anzahl(string wert)
    {
        if (!Py.Ganz(wert.Trim().TrimStart('g'), out var w)) return 1;
        return w == 0 ? 1 : w / 100.0;
    }

    public static Zeile AusZ1(Zeile patient, Zeile plan)
    {
        var hinweise = new List<object?>();
        var befund = Py.S(plan, "_befund").PadRight(32);
        string oben = Py.S(plan, "_oben").PadRight(96), unten = Py.S(plan, "_unten").PadRight(96);
        var zaehne = new Zeile();
        for (var i = 0; i < Z1Befund.Reihe.Length; i++)
        {
            var schema = i < 16 ? oben : unten;
            var tp = schema.Substring(i % 16 * 6, 6).Trim().ToUpperInvariant();
            var b = Z1Befund.AusZ1.GetValueOrDefault(befund[i], "");
            if (b.Length > 0 || tp.Length > 0)
                zaehne[Z1Befund.Reihe[i].ToString()] = new Zeile { ["B"] = b, ["R"] = "", ["TP"] = tp };
        }

        var positionen = new List<Zeile>();
        var befunde = new List<Zeile>();
        var fremd = 0;
        var zeilen = plan.TryGetValue("zeilen", out var zl) && zl is List<Zeile> liste ? liste : [];
        foreach (var z in zeilen)
        {
            string goart = Py.S(z, "goart").Trim(), nr = Py.S(z, "nr").Trim();
            var key = "z1-" + Py.S(z, "lfd").Trim();
            var zahn = ZaehneAusMaske(Py.S(z, "zaehne"));
            var menge = Anzahl(Py.S(z, "anzahl"));
            var fz = nr.ToLowerInvariant().StartsWith("fz", StringComparison.Ordinal);
            if (goart is "g" or "k" && fz)
                befunde.Add(new Zeile { ["id"] = key, ["nr"] = nr[2..], ["zahnGebiet"] = zahn, ["anzahl"] = menge });
            else if (goart is "g" or "k")
                positionen.Add(new Zeile { ["id"] = key, ["ebene"] = "BEMA", ["nr"] = nr, ["zahn"] = zahn, ["anzahl"] = menge });
            else if (goart is "q" or "p")
            {
                var faktor = Py.Ganz(Py.S(z, "faktor"), out var f) ? f / 10000.0 : 2.3;
                if (faktor == 0) faktor = 2.3;
                positionen.Add(new Zeile { ["id"] = key, ["ebene"] = "GOZ", ["nr"] = nr, ["zahn"] = zahn, ["anzahl"] = menge, ["faktor"] = faktor });
            }
            else if (goart is "1" or "2" or "3" or "4" or "7" or "8")
            {
                var labor = Py.S(z, "labor").Trim() == "f" ? "fremd" : "eigen";
                var zeile = new Zeile { ["id"] = key, ["zahn"] = zahn, ["anzahl"] = menge, ["labor"] = labor };
                if (goart is "7" or "8")
                {
                    var text = Py.S(z, "text").Trim();
                    zeile["ebene"] = "MAT";
                    zeile["nr"] = "";
                    zeile["preis"] = Cent(Py.S(z, "einzel"));
                    zeile["text"] = text.Length > 0 ? text : $"Material Z1 {nr}";
                }
                else
                {
                    zeile["ebene"] = goart is "1" or "2" ? "BEL" : "BEB";
                    zeile["nr"] = nr;
                }
                positionen.Add(zeile);
            }
            else fremd++;
        }
        if (fremd > 0) hinweise.Add($"{fremd} Z1-Zeile(n) anderer Gebührenarten nicht übernommen.");
        hinweise.Add(Py.S(plan, "kassenplan").Trim() == "7"
            ? "Den Bonus führt Z1 nicht am Plan – in PlanR prüfen (60 % angenommen)."
            : "Privater Z1-Plan – Versorgungsart in PlanR prüfen.");

        // „HKP berechnen“ ersetzt automatische Zeilen, statt sie zu verdoppeln.
        foreach (var zeile in positionen.Concat(befunde)) zeile["auto"] = true;
        var labore = positionen.Where(p => Py.S(p, "ebene") is "BEL" or "BEB" or "MAT").Select(p => Py.S(p, "labor")).ToHashSet();
        var b2 = Py.S(plan, "bemerkung2");
        var titel = (b2.Length > 0 ? b2 : Py.S(plan, "bemerkung1")).Trim();
        var datum = Py.S(plan, "datum");
        var planr = new Zeile();
        if (labore.SetEquals(["eigen"])) planr["einstellungen"] = new Zeile { ["labor"] = "praxis" };
        planr["patient"] = new Zeile
        {
            ["anrede"] = "", ["vorname"] = Py.S(patient, "firstName"), ["name"] = Py.S(patient, "lastName"),
            ["geburtsdatum"] = Py.S(patient, "birthDate"), ["strasse"] = "", ["plz"] = "", ["ort"] = Py.S(patient, "city"),
            ["kasse"] = "", ["kassenNr"] = "", ["versichertenNr"] = "",
        };
        planr["verwaltung"] = new Zeile { ["ausstellungsdatum"] = datum, ["erlaeuterung"] = titel };
        planr["zaehne"] = zaehne;
        planr["positionen"] = positionen;
        planr["befunde"] = befunde;
        planr["zuschuss"] = new Zeile { ["bonus"] = "60", ["haertefall"] = false };
        return new Zeile
        {
            ["plan"] = planr,
            ["z1Plan"] = new Zeile { ["number"] = plan.GetValueOrDefault("number"), ["date"] = datum, ["description"] = titel },
            ["hinweise"] = hinweise,
        };
    }
}
