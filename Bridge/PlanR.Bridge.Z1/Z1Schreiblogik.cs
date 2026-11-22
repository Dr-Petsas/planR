using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Z1;

using Zeile = Dictionary<string, object?>;

/// <summary>
/// Reiner Transformations-Vergleich gegen den Python-Connector: eine JSON-Anfrage,
/// eine JSON-Antwort – ohne Datenbank. Prüft genau die Zeilen, die an Z1Schreiben gehen.
/// </summary>
public static class Z1Vergleich
{
    static readonly JsonSerializerOptions Opt = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static string Zeile(string anfrage)
    {
        try
        {
            using var doc = JsonDocument.Parse(anfrage);
            var req = (Zeile)Pj.Baum(doc.RootElement)!;
            var op = Pj.StrOr(Pj.Get(req, "op"));
            if (op == "befund")
            {
                var roh = Pj.Get(req, "roh") as Zeile;
                var teeth = Pj.Get(req, "teeth") as Zeile ?? [];
                try
                {
                    var (neu, ge, un) = Z1Befund.Auftrag(roh, teeth);
                    return Gut(new Zeile { ["neu"] = neu, ["geaendert"] = ge.Cast<object?>().ToList(), ["ungefaehr"] = un.Cast<object?>().ToList(), ["meldung"] = Z1Befund.Meldung(ge, un) });
                }
                catch (BefundFehler exc) { return Fehler(exc.Message); }
            }
            var patnr = Pj.StrOr(Pj.Get(req, "patnr"));
            var json = Pj.StrOr(Pj.Get(req, "json"));
            var zeilen = Pj.Get(req, "zeilen") is List<object?> l ? l.Select(x => x as Zeile ?? []).ToList() : null;
            try
            {
                Zeile plan;
                if (op == "planr") plan = Z1Hkp.PlanAusPlanr(json, patnr, zeilen);
                else
                {
                    var makros = Pj.Get(req, "makros") is List<object?> m ? m.Select(Pj.Str).ToHashSet() : null;
                    plan = Z1Hkp.PlanAusJson(json, patnr, zeilen, makros);
                }
                return Gut(new Zeile { ["zeilen"] = Z1Plan.PlanZeilen(plan), ["hinweise"] = plan["hinweise"], ["label"] = plan.GetValueOrDefault("label") });
            }
            catch (HkpFehler exc) { return Fehler(exc.Message); }
        }
        catch (Exception exc) { return Fehler("Vergleich: " + exc.Message); }
    }

    static string Gut(Zeile ok) => JsonSerializer.Serialize(new Zeile { ["ok"] = ok }, Opt);
    static string Fehler(string text) => JsonSerializer.Serialize(new Zeile { ["error"] = text }, Opt);
}

/// <summary>Ungültiger HKP: wird zu 400 wie HkpFehler/ValueError im Python-Connector.</summary>
public sealed class HkpFehler(string text) : Exception(text);

/// <summary>Entspricht dem ValueError aus z1_plan.py: der Dienst antwortet darauf mit 503, nicht 400.</summary>
public sealed class Z1WertFehler(string text) : Exception(text);

/// <summary>Ungültiger Befundauftrag: wird zu 400 wie BefundFehler im Python-Connector.</summary>
public sealed class BefundFehler(string text) : Exception(text);

/// <summary>Python-Semantik für die geparsten JSON-Bäume (str(x or ''), float(x or 1), Wahrheitswert).</summary>
static class Pj
{
    /// <summary>JSON → Python-naher Objektbaum: Zeile, List&lt;object?&gt;, string, long, double, bool, null.</summary>
    public static object? Baum(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Object => e.EnumerateObject().Aggregate(new Zeile(), (d, p) => { d[p.Name] = Baum(p.Value); return d; }),
        JsonValueKind.Array => e.EnumerateArray().Select(Baum).ToList(),
        JsonValueKind.String => e.GetString(),
        JsonValueKind.Number => e.TryGetInt64(out var l) ? (object)l : e.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null,
    };

    public static object? Get(object? d, string name) =>
        d is Zeile z && z.TryGetValue(name, out var w) ? w : null;

    /// <summary>Python-Wahrheitswert: None/0/""/False/leere Liste/leeres Dict = falsch.</summary>
    public static bool Wahr(object? v) => v switch
    {
        null => false,
        bool b => b,
        string s => s.Length > 0,
        long l => l != 0,
        int i => i != 0,
        double d => d != 0,
        List<object?> li => li.Count > 0,
        Zeile z => z.Count > 0,
        _ => true,
    };

    /// <summary>str(v) wie Python (für die Werte, die hier vorkommen).</summary>
    public static string Str(object? v) => v switch
    {
        null => "None",
        bool b => b ? "True" : "False",
        string s => s,
        long l => l.ToString(CultureInfo.InvariantCulture),
        int i => i.ToString(CultureInfo.InvariantCulture),
        double d => Float(d),
        _ => Convert.ToString(v, CultureInfo.InvariantCulture) ?? "",
    };

    /// <summary>str(v or '') – leerer String bei Falsy.</summary>
    public static string StrOr(object? v) => Wahr(v) ? Str(v) : "";

    static string Float(double d)
    {
        if (d == Math.Floor(d) && !double.IsInfinity(d)) return ((long)d).ToString(CultureInfo.InvariantCulture) + ".0";
        return d.ToString("R", CultureInfo.InvariantCulture);
    }

    /// <summary>float(v) – wirft bei None/unlesbar (wie Python float()).</summary>
    public static double ToFloat(object? v) => v switch
    {
        long l => l,
        int i => i,
        double d => d,
        bool b => b ? 1 : 0,
        string s => double.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture),
        _ => throw new FormatException("float"),
    };

    /// <summary>float(v or default).</summary>
    public static double FloatOr(object? v, double standard) => Wahr(v) ? ToFloat(v) : standard;
}

/// <summary>PlanR-Plan → Zeilen für Z1 (z1_plan.py): ZPLAN, LBLOCKENTRY und BEH.</summary>
public static class Z1Plan
{
    static readonly int[] Oben = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
    static readonly int[] Unten = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
    static readonly int[] Reihe = [.. Oben, .. Unten];

    public static string Pad(object? wert, int breite, bool links = true)
    {
        var text = Pj.StrOr(wert).Trim();
        if (text.Length > breite) text = text[..breite];
        return links ? text.PadLeft(breite) : text.PadRight(breite);
    }

    public static string Anzahl(object? wert)
    {
        var n = Pj.FloatOr(wert, 1);
        if (n < 0.01 || n > 99) throw new Z1WertFehler("Anzahl muss zwischen 1 und 99 liegen.");
        var stueck = (int)Math.Round(n * 100, MidpointRounding.ToEven);
        if (Math.Abs(n * 100 - stueck) > 0.001) throw new Z1WertFehler("Anzahl muss auf einen Cent genau sein.");
        return Pad(stueck, 6);
    }

    public static List<string> Dokumentation(object? text)
    {
        var roh = string.Join(' ', Py.Worte(Pj.StrOr(text)));
        var zeilen = new List<string>();
        while (roh.Length > 0 && zeilen.Count < 8)
        {
            if (roh.Length <= 60) { zeilen.Add(roh); break; }
            var schnitt = roh.LastIndexOf(' ', 60);
            if (schnitt <= 0) schnitt = 60;
            zeilen.Add(roh[..schnitt].TrimEnd());
            roh = roh[schnitt..].TrimStart();
        }
        return zeilen;
    }

    static string Zahnmaske(object? zaehne)
    {
        var bits = new int[72];
        foreach (var teil in Pj.StrOr(zaehne).Replace(" ", "").Split(','))
        {
            if (teil.Length == 0) continue;
            if (teil is "OK" or "UK")
            {
                var start = teil == "OK" ? 0 : 16;
                for (var k = start; k < start + 16; k++) bits[k] = 1;
                continue;
            }
            var enden = teil.Split('-').Select(z => int.Parse(z, CultureInfo.InvariantCulture)).ToArray();
            if (enden.Any(z => Array.IndexOf(Reihe, z) < 0)) throw new Z1WertFehler($"Zahnangabe '{teil}' kennt Z1 nicht.");
            int a = Array.IndexOf(Reihe, enden[0]), b = Array.IndexOf(Reihe, enden[^1]);
            for (var i = Math.Min(a, b); i <= Math.Max(a, b); i++) bits[i] = 1;
        }
        var aus = new System.Text.StringBuilder();
        for (var i = 0; i < 72; i += 4)
        {
            var v = bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3];
            aus.Append(v.ToString("X", CultureInfo.InvariantCulture));
        }
        return aus.ToString();
    }

    static string Schluessel(object? nr)
    {
        var text = Pj.StrOr(nr).Trim().ToLowerInvariant();
        foreach (var (von, nach) in new[] { ("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss") })
            text = text.Replace(von, nach);
        return text.Length > 6 ? text[..6] : text;
    }

    static string Betrag(object? wert, int breite = 10)
    {
        var cent = (int)Math.Round(Pj.FloatOr(wert, 0) * 100, MidpointRounding.ToEven);
        return cent < 0
            ? "e-" + (-cent).ToString(CultureInfo.InvariantCulture).PadLeft(breite - 1)
            : "e" + cent.ToString(CultureInfo.InvariantCulture).PadLeft(breite);
    }

    static string Sieben(double w) => ((int)Math.Round(w * 100, MidpointRounding.ToEven)).ToString(CultureInfo.InvariantCulture).PadLeft(7);

    /// <summary>plan: patnr, datum (JJJJMMTT), bemerkung, positionen, text, kasse, schema, kassenplan, muster.</summary>
    public static Zeile PlanZeilen(Zeile plan)
    {
        var datum = Pj.StrOr(Pj.Get(plan, "datum"));
        if (datum.Length != 8 || !Py.Ziffern(datum)) throw new Z1WertFehler("Datum muss JJJJMMTT sein.");
        var positionen = Pj.Get(plan, "positionen") as List<object?> ?? (Pj.Get(plan, "positionen") is null ? [] : throw new Z1WertFehler("Leistungen sind ungültig."));
        var dokumente = Dokumentation(Pj.Get(plan, "text"));
        if (positionen.Count == 0 && dokumente.Count == 0)
            throw new Z1WertFehler("Der Plan braucht eine Leistung oder einen Dokumentationstext.");
        var zeilen = new List<Zeile>();
        var summe = 0.0;
        var i = 0;
        foreach (var roh in positionen)
        {
            i++;
            var p = roh as Zeile ?? new Zeile();
            var nr = Pj.StrOr(Pj.Get(p, "nr")).Trim();
            var artRoh = Pj.StrOr(Pj.Get(p, "art"));
            if (artRoh.Length == 0) artRoh = "q";
            var art = artRoh.Trim();
            art = art.Length > 0 ? art[..1] : "";
            if (nr.Length == 0 || nr.Length > 6) throw new Z1WertFehler($"Leistungsnummer '{nr}' passt nicht in Z1.");
            var einzel = Pj.Get(p, "einzel");
            if (einzel is not null) summe += Pj.ToFloat(einzel) * Pj.FloatOr(Pj.Get(p, "anzahl"), 1);
            var faktor = Pj.Get(p, "faktor");
            var labor = art.Length == 1 && "12345678".Contains(art[0]);
            zeilen.Add(new Zeile
            {
                ["lfd"] = Pad(i, 3),
                ["goart"] = art,
                ["nr"] = nr,
                ["schluessel"] = Schluessel(nr),
                ["anzahl"] = art == "8" ? "g" + Anzahl(Pj.Get(p, "anzahl"))[1..] : Anzahl(Pj.Get(p, "anzahl")),
                ["einzel"] = einzel is null ? "" : Betrag(einzel),
                ["faktor"] = Pj.Wahr(faktor) && !labor ? Pad((int)Math.Round(Pj.ToFloat(faktor) * 10000, MidpointRounding.ToEven), 6) : "",
                ["zaehne"] = Zahnmaske(Pj.Get(p, "zaehne")),
                ["text"] = Schnitt(string.Join(' ', Py.Worte(Pj.StrOr(Pj.Get(p, "text")))), 60),
                ["art"] = Pj.Wahr(Pj.Get(p, "abzug")) ? "A" : labor ? "1" : "",
                ["labor"] = labor ? (Pj.Wahr(Pj.Get(p, "fremd")) ? "f" : "e") : "",
                ["begrtb"] = Pj.Wahr(Pj.Get(p, "kasse")) ? "" : "x",
                ["ust"] = labor && Pj.Wahr(Pj.Get(p, "kasse")) ? "0" : "",
            });
        }
        var hatSumme = zeilen.Count > 0 && zeilen.All(z => ((string)z["einzel"]!).Length > 0);
        var nullE = Betrag(0);
        var kasse = Pj.Get(plan, "kasse") as Zeile;
        var schema = Pj.Get(plan, "schema") as Zeile ?? new Zeile();
        string betraege, summen;
        if (kasse is not null)
        {
            double b = Pj.ToFloat(kasse["bema"]), g = Pj.ToFloat(kasse["goz"]), lab = Pj.ToFloat(kasse["labor"]), mat = Pj.ToFloat(kasse["material"]);
            var gesamt = b + g + lab;
            var zuschuss = Pj.FloatOr(kasse.GetValueOrDefault("festzuschuss"), 0);
            betraege = string.Concat(nullE, Betrag(b), nullE, nullE, Betrag(lab), Betrag(zuschuss), Betrag(gesamt - zuschuss), Betrag(mat), Betrag(g), nullE);
            summen = "e" + Sieben(lab) + "e" + Sieben(gesamt) + "e" + Sieben(zuschuss) + "1e" + new string(' ', 14);
        }
        else
        {
            betraege = hatSumme ? string.Concat(nullE, nullE, nullE, nullE, nullE, nullE, Betrag(summe), nullE, Betrag(summe), nullE) : "";
            summen = hatSumme ? "e" + "0".PadLeft(7) + "e" + Sieben(summe) + "e" + new string(' ', 8) + "e" : "";
        }
        return new Zeile
        {
            ["oben"] = Pj.StrOr(schema.GetValueOrDefault("oben")),
            ["unten"] = Pj.StrOr(schema.GetValueOrDefault("unten")),
            ["bemerkung"] = Pad(Pj.Wahr(Pj.Get(plan, "bemerkung")) ? Pj.Get(plan, "bemerkung") : "PlanR", 40, false).TrimEnd(),
            ["datum"] = datum,
            ["planart"] = "3",
            ["befundart"] = "z",
            ["kassenplan"] = Erstes(Pj.Wahr(Pj.Get(plan, "kassenplan")) ? Pj.StrOr(Pj.Get(plan, "kassenplan")) : "1"),
            ["muster"] = Erstes(Pj.StrOr(Pj.Get(plan, "muster"))),
            ["status"] = "0",
            ["betraege"] = betraege,
            ["summen"] = summen,
            ["nurDokument"] = positionen.Count == 0,
            ["zeilen"] = zeilen,
            ["dokumente"] = dokumente.Cast<object?>().ToList(),
        };
    }

    static string Schnitt(string s, int n) => s.Length > n ? s[..n] : s;
    static string Erstes(string s) => s.Length > 0 ? s[..1] : "";
}

/// <summary>PlanR-HKP-JSON (wie nach DS-Win) → Z1-Plan (z1_hkp.py).</summary>
public static class Z1Hkp
{
    static readonly Regex NrRe = new(@"\A[0-9A-Za-zÄÖÜäöü.\-]{1,6}\z", RegexOptions.CultureInvariant);
    static readonly Regex ZahnRe = new(@"\A(?:|OK|UK|OK,UK|[1-4][1-8](?:-[1-4][1-8])?(?:,[1-4][1-8](?:-[1-4][1-8])?)*)\z", RegexOptions.CultureInvariant);

    static readonly Dictionary<string, (char, char)> Bevorzugt = new()
    {
        ["GOZ"] = ('q', 'p'), ["BEMA"] = ('g', 'k'), ["BEL"] = ('1', '2'), ["BEB"] = ('3', '4'), ["MAT"] = ('7', '8'),
    };

    static readonly int[] Oben = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
    static readonly int[] Unten = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

    static double Zahl(object? wert, string name, int index)
    {
        try { return Pj.ToFloat(wert); }
        catch { throw new HkpFehler($"{name} Position {index} ist ungültig."); }
    }

    static List<Zeile> Liste(object? v) => (v as List<object?>)?.OfType<object?>().Select(x => x as Zeile ?? new Zeile()).ToList() ?? [];

    static string Art((char, char) bevorzugt, string ebene, string nr, object? labor, List<Zeile>? zeilen)
    {
        var treffer = (zeilen ?? []).Where(z => Pj.StrOr(Pj.Get(z, "nr")).Trim() == nr).Select(z => Pj.StrOr(Pj.Get(z, "art")).Trim()).ToList();
        if (treffer.Contains(bevorzugt.Item1.ToString())) return bevorzugt.Item1.ToString();
        if (treffer.Contains(bevorzugt.Item2.ToString())) return bevorzugt.Item2.ToString();
        if (treffer.Distinct().Count() == 1) return treffer[0];
        if (ebene == "BEB" && Pj.StrOr(labor) == "fremd") return "4";
        return bevorzugt.Item1.ToString();
    }

    static Zeile Geld(Zeile item, int index)
    {
        var aus = new Zeile();
        var menge = Zahl(Pj.Wahr(Pj.Get(item, "anzahl")) ? Pj.Get(item, "anzahl") : 1L, "Anzahl", index);
        if (Pj.Get(item, "betrag") is not null && menge != 0) aus["einzel"] = Zahl(Pj.Get(item, "betrag"), "Betrag", index) / menge;
        else if (Pj.Get(item, "einzelpreis") is not null) aus["einzel"] = Zahl(Pj.Get(item, "einzelpreis"), "Einzelpreis", index);
        if (Pj.Wahr(Pj.Get(item, "faktor")))
        {
            var f = Zahl(Pj.Get(item, "faktor"), "Faktor", index);
            aus["faktor"] = f;
            if (!(0 < f && f <= 9.9)) throw new HkpFehler($"Faktor Position {index} ist ungültig.");
        }
        if (aus.TryGetValue("einzel", out var e) && !(-99999 <= (double)e! && (double)e! <= 99999))
            throw new HkpFehler($"Einzelpreis Position {index} ist ungültig.");
        return aus;
    }

    static string Text(Zeile item, string nr, string art, List<Zeile>? zeilen)
    {
        var eigen = string.Join(' ', Py.Worte(Pj.StrOr(Pj.Get(item, "bezeichnung"))));
        if (eigen.Length > 0) return eigen;
        foreach (var z in zeilen ?? [])
            if (Pj.StrOr(Pj.Get(z, "nr")).Trim() == nr && Pj.StrOr(Pj.Get(z, "art")).Trim() == art) return Pj.StrOr(Pj.Get(z, "text"));
        return "";
    }

    static double Punkte(string nr, string art, List<Zeile>? zeilen)
    {
        foreach (var z in zeilen ?? [])
            if (Pj.StrOr(Pj.Get(z, "nr")).Trim() == nr && Pj.StrOr(Pj.Get(z, "art")).Trim() == art)
            {
                var text = Pj.StrOr(Pj.Get(z, "punkte")).Trim();
                return Py.Ganz(text.Length > 0 ? text : "0", out var w) ? w / 100.0 : 0;
            }
        return 0;
    }

    static string Nummer(string ebene, string nr, List<Zeile>? zeilen)
    {
        if (ebene == "GOAE" && nr.Length > 0 && !"ÄäAa".Contains(nr[0]))
        {
            var mit = "Ä" + nr;
            if (zeilen is null || zeilen.Any(z => Pj.StrOr(Pj.Get(z, "nr")).Trim() == mit)) return mit;
        }
        return nr;
    }

    static (string?, string?) Schema(object? zaehne, HashSet<string>? makros, List<object?> hinweise)
    {
        if (zaehne is not Zeile tabelle) return (null, null);
        var fremd = new List<string>();
        string Kiefer(int[] reihe)
        {
            var aus = "";
            foreach (var zahn in reihe)
            {
                var v = tabelle.GetValueOrDefault(zahn.ToString());
                var k = Pj.StrOr(v is Zeile d ? (Pj.Wahr(Pj.Get(d, "planung")) ? Pj.Get(d, "planung") : Pj.Get(d, "TP")) : "").Trim().ToLowerInvariant();
                if (k.Length > 0 && (k.Length > 6 || (makros is not null && !makros.Contains(k)))) { fremd.Add($"{zahn} {k.ToUpperInvariant()}"); k = ""; }
                aus += k.PadRight(6);
            }
            return aus;
        }
        string oben = Kiefer(Oben), unten = Kiefer(Unten);
        if (fremd.Count > 0) hinweise.Add("Diese Planungskürzel kennt Z1 nicht, sie fehlen im Zahnschema: " + string.Join(", ", fremd) + ".");
        return (oben + unten).Trim().Length > 0 ? (oben, unten) : (null, null);
    }

    public static Zeile PlanAusJson(string text, string patnr, List<Zeile>? zeilen = null, HashSet<string>? makros = null)
    {
        if (string.IsNullOrWhiteSpace(text)) throw new HkpFehler("HKP-JSON ist leer.");
        if (System.Text.Encoding.UTF8.GetByteCount(text) > 65536) throw new HkpFehler("HKP-JSON ist zu groß.");
        Zeile daten;
        object? positionenRoh;
        string datum;
        try
        {
            using var doc = JsonDocument.Parse(text);
            daten = (Zeile)Pj.Baum(doc.RootElement)!;
            positionenRoh = daten["positionen"];
            datum = IsoDatum(Pj.Str(((Zeile)daten["verwaltung"]!)["ausstellungsdatum"]));
        }
        catch (Exception exc) when (exc is not HkpFehler)
        {
            throw new HkpFehler("HKP-JSON enthält kein Ausstellungsdatum oder keine Positionen.");
        }
        if (positionenRoh is not List<object?> positionen || positionen.Count is < 1 or > 100) throw new HkpFehler("HKP-JSON enthält keine unterstützten Planpositionen.");
        var nummer = (patnr ?? "").Trim();
        if (!Py.Ziffern(nummer)) throw new HkpFehler("Patientennummer fehlt.");
        var hinweise = new List<object?>();
        var ergebnis = Pj.Get(daten, "ergebnis") as Zeile ?? new Zeile();
        var geld = new Dictionary<string, Zeile>();
        foreach (var pRoh in Liste(Pj.Get(ergebnis, "positionen")))
            if (Pj.Wahr(Pj.Get(pRoh, "id"))) geld[Pj.Str(Pj.Get(pRoh, "id"))] = pRoh;
        var schema = Schema(Pj.Get(daten, "zaehne"), makros, hinweise);
        var summe = new Dictionary<string, double> { ["bema"] = 0, ["goz"] = 0, ["labor"] = 0, ["material"] = 0 };
        var zeilenAus = new List<Zeile>();
        var bekannt = (zeilen ?? []).Select(z => Pj.StrOr(Pj.Get(z, "nr")).Trim()).ToHashSet();
        var index = 0;
        foreach (var itemRoh in positionen)
        {
            index++;
            if (itemRoh is not Zeile roh) throw new HkpFehler($"Position {index} ist ungültig.");
            var item = new Zeile(geld.GetValueOrDefault(Pj.Str(Pj.Get(roh, "id")), []));
            foreach (var kv in roh) item[kv.Key] = kv.Value;
            var ebene = Pj.StrOr(Pj.Get(item, "ebene"));
            if (!Bevorzugt.TryGetValue(ebene, out var bev))
            {
                hinweise.Add($"Position {index} ({(ebene.Length > 0 ? ebene : "ohne Art")}) übernimmt Z1 nicht.");
                continue;
            }
            var gesamt = Zahl(Pj.Wahr(Pj.Get(item, "betrag")) ? Pj.Get(item, "betrag") : 0L, "Betrag", index);
            summe[ebene == "BEMA" ? "bema" : ebene == "GOZ" ? "goz" : "labor"] += gesamt;
            if (ebene == "MAT") summe["material"] += gesamt;
            var nr = Pj.StrOr(Pj.Get(item, "nr")).Trim();
            if (!NrRe.IsMatch(nr))
            {
                var tz = Pj.StrOr(Pj.Get(item, "bezeichnung")).Trim();
                hinweise.Add($"Position {index}" + (tz.Length > 0 ? $" ({tz})" : "") + " hat keine Z1-Nummer und bleibt in der Summe.");
                continue;
            }
            var zahnRoh = Pj.Wahr(Pj.Get(item, "zahn")) ? Pj.Get(item, "zahn") : "";
            if (zahnRoh is not string zahn || !ZahnRe.IsMatch(zahn.Replace(" ", "")))
                throw new HkpFehler($"Zahnangabe Position {index} ist ungültig.");
            double menge;
            try { menge = Pj.FloatOr(Pj.Get(item, "anzahl"), 1); }
            catch { throw new HkpFehler($"Anzahl Position {index} ist ungültig."); }
            if (!(0.01 <= menge && menge <= 99)) throw new HkpFehler($"Anzahl Position {index} ist ungültig.");
            if (zeilen is not null && !bekannt.Contains(nr))
                hinweise.Add($"{nr} steht nicht in der Z1-Gebührenliste und wird mit der üblichen Art geschrieben.");
            var art = Art(bev, ebene, nr, Pj.Get(item, "labor"), zeilen);
            var zeile = new Zeile(Geld(item, index))
            {
                ["nr"] = nr, ["art"] = art, ["anzahl"] = menge, ["zaehne"] = zahn.Replace(" ", ""),
                ["text"] = Text(item, nr, art, zeilen), ["kasse"] = true,
            };
            if (ebene == "BEMA")
            {
                var punkte = Pj.Wahr(Pj.Get(item, "punkte")) ? Pj.Get(item, "punkte") : Punkte(nr, art, zeilen);
                if (Pj.Wahr(punkte)) zeile["einzel"] = Zahl(punkte, "Punkte", index);
                else { zeile.Remove("einzel"); hinweise.Add($"Zu BEMA {nr} fehlen die Punkte; Z1 zeigt die Zeile ohne Betrag."); }
                zeile.Remove("faktor");
            }
            else if (ebene != "GOZ" && Pj.StrOr(Pj.Get(item, "labor")) == "fremd") zeile["fremd"] = true;
            zeilenAus.Add(zeile);
        }
        if (zeilenAus.Count == 0) throw new HkpFehler("Keine der Positionen kann Z1 als Leistung schreiben.");
        var zuschuss = 0.0;
        var bi = 0;
        foreach (var bObjekt in Pj.Get(ergebnis, "befunde") as List<object?> ?? [])
        {
            bi++;
            if (bObjekt is not Zeile bRoh || !NrRe.IsMatch("fz" + Pj.StrOr(Pj.Get(bRoh, "nr")).Trim())) { hinweise.Add($"Festzuschuss-Befund {bi} übernimmt Z1 nicht."); continue; }
            // Wie im Python-Connector: fehlt das Feld ganz, ist das ein Absturz (dort HTTP 500), kein Hinweis.
            var gebiet = Pj.StrOr(Pj.Get(bRoh, "zahnGebiet")).Replace(" ", "");
            var menge = Zahl(Pj.Wahr(Pj.Get(bRoh, "anzahl")) ? Pj.Get(bRoh, "anzahl") : 1L, "Anzahl Befund", bi);
            var einzel = Zahl(Pj.Wahr(Pj.Get(bRoh, "einzelbetrag")) ? Pj.Get(bRoh, "einzelbetrag") : 0L, "Festzuschuss", bi);
            zuschuss += Zahl(Pj.Get(bRoh, "betrag") is not null ? Pj.Get(bRoh, "betrag") : einzel * menge, "Festzuschuss", bi);
            var bnr = Pj.Str(bRoh["nr"]).Trim();
            zeilenAus.Add(new Zeile
            {
                ["nr"] = "fz" + bnr, ["art"] = "g", ["anzahl"] = menge, ["einzel"] = einzel, ["kasse"] = true,
                ["zaehne"] = ZahnRe.IsMatch(gebiet) ? gebiet : "", ["fz"] = true,
                ["text"] = Text(new Zeile { ["bezeichnung"] = Pj.Get(bRoh, "text") }, "fz" + bnr, "g", zeilen),
            });
        }
        int Rang(Zeile z)
        {
            if (Pj.Wahr(Pj.Get(z, "fz"))) return 1;
            var a = Pj.StrOr(Pj.Get(z, "art"));
            if ("gk".Contains(a, StringComparison.Ordinal)) return 0;
            if ("12345678".Contains(a, StringComparison.Ordinal)) return 3;
            return 2;
        }
        var sortiert = zeilenAus.OrderBy(Rang).ToList();
        var summen = Pj.Get(ergebnis, "summen") as Zeile ?? new Zeile();
        if (Pj.Get(summen, "festzuschuss") is not null) zuschuss = Zahl(summen["festzuschuss"], "Festzuschuss", 0);
        return new Zeile
        {
            ["patnr"] = nummer, ["datum"] = datum, ["bemerkung"] = "PlanR", ["kassenplan"] = "7", ["muster"] = "4",
            ["positionen"] = sortiert.Cast<object?>().ToList(),
            ["kasse"] = new Zeile { ["bema"] = summe["bema"], ["goz"] = summe["goz"], ["labor"] = summe["labor"], ["material"] = summe["material"], ["festzuschuss"] = zuschuss },
            ["schema"] = schema.Item1 is null ? null : new Zeile { ["oben"] = schema.Item1, ["unten"] = schema.Item2 },
            ["hinweise"] = hinweise,
        };
    }

    public static Zeile PlanAusPlanr(string text, string patnr, List<Zeile>? zeilen = null)
    {
        if (string.IsNullOrWhiteSpace(text) || System.Text.Encoding.UTF8.GetByteCount(text) > 65536)
            throw new HkpFehler("Plan-JSON ist leer oder zu groß.");
        Zeile daten;
        try { using var doc = JsonDocument.Parse(text); daten = (Zeile)Pj.Baum(doc.RootElement)!; }
        catch (Exception exc) when (exc is not HkpFehler) { throw new HkpFehler("Plan-JSON ist ungültig."); }
        if (Pj.StrOr(Pj.Get(daten, "format")) != "planr-plan" || Pj.Get(daten, "version") is not (1L or 1.0 or true))
            throw new HkpFehler("Kein PlanR-Plan (format planr-plan, Version 1).");
        var planart = Pj.StrOr(Pj.Get(daten, "planart"));
        if (planart is not ("kva" or "mkv")) throw new HkpFehler("Planart muss kva oder mkv sein.");
        if (Pj.Get(daten, "positionen") is not List<object?> positionen || positionen.Count is < 1 or > 200)
            throw new HkpFehler("Plan enthält keine Positionen.");
        var nummer = (patnr ?? "").Trim();
        if (!Py.Ziffern(nummer)) throw new HkpFehler("Patientennummer fehlt.");
        string datum;
        try { datum = IsoDatum(Pj.StrOr(Pj.Get(daten, "datum")).Length >= 10 ? Pj.StrOr(Pj.Get(daten, "datum"))[..10] : Pj.StrOr(Pj.Get(daten, "datum"))); }
        catch { datum = DateTime.Today.ToString("yyyyMMdd", CultureInfo.InvariantCulture); }
        var ebenen = new Dictionary<string, (char, char)>(Bevorzugt) { ["GOAE"] = ('q', 'p') };
        var hinweise = new List<object?>();
        var aus = new List<Zeile>();
        var hatMkv = false;
        var i = 0;
        while (i < positionen.Count)
        {
            var item = positionen[i] as Zeile ?? (positionen[i] is null ? throw new HkpFehler($"Position {i + 1} ist ungültig.") : new Zeile());
            if (positionen[i] is not Zeile) throw new HkpFehler($"Position {i + 1} ist ungültig.");
            var index = i + 1;
            i++;
            var ebene = Pj.StrOr(Pj.Get(item, "ebene"));
            if (ebene == "BEMA") throw new HkpFehler($"BEMA-Position {Pj.Str(Pj.Get(item, "nr"))} ohne zugehörige Mehrkostenfüllung.");
            if (!ebenen.TryGetValue(ebene, out var bev))
            {
                hinweise.Add($"Position {index} ({(ebene.Length > 0 ? ebene : "ohne Art")}) übernimmt Z1 nicht.");
                continue;
            }
            var nr = Nummer(ebene, Pj.StrOr(Pj.Get(item, "nr")).Trim(), zeilen);
            if (!NrRe.IsMatch(nr))
            {
                var name = Pj.StrOr(Pj.Get(item, "bezeichnung")).Trim();
                hinweise.Add($"Position {index}" + (name.Length > 0 ? $" ({name})" : "") + " hat keine Z1-Nummer und fehlt im Z1-Plan.");
                continue;
            }
            var zahn = Pj.StrOr(Pj.Get(item, "zahn")).Replace(" ", "");
            if (!ZahnRe.IsMatch(zahn)) throw new HkpFehler($"Zahnangabe Position {index} ist ungültig.");
            var menge = Zahl(Pj.Wahr(Pj.Get(item, "anzahl")) ? Pj.Get(item, "anzahl") : 1L, "Anzahl", index);
            if (!(0.01 <= menge && menge <= 99)) throw new HkpFehler($"Anzahl Position {index} ist ungültig.");
            string? art = null;
            foreach (var a in new[] { bev.Item1, bev.Item2 })
                if ((zeilen ?? []).Any(z => Pj.StrOr(Pj.Get(z, "nr")).Trim() == nr && Pj.StrOr(Pj.Get(z, "art")).Trim() == a.ToString())) { art = a.ToString(); break; }
            if (art is null)
            {
                art = Art(bev, ebene == "GOAE" ? "GOZ" : ebene, nr, Pj.Get(item, "labor"), zeilen);
                if (zeilen is not null) hinweise.Add($"{nr} steht nicht in der Z1-Gebührenliste und wird mit der üblichen Art geschrieben.");
            }
            aus.Add(new Zeile(Geld(item, index)) { ["nr"] = nr, ["art"] = art, ["anzahl"] = menge, ["zaehne"] = zahn, ["text"] = Text(item, nr, art, zeilen) });
            if (ebene == "GOZ" && Pj.Wahr(Pj.Get(item, "mkv")))
            {
                var bema = i < positionen.Count ? positionen[i] as Zeile : null;
                if (bema is null || Pj.StrOr(Pj.Get(bema, "ebene")) != "BEMA" || Pj.StrOr(Pj.Get(bema, "zahn")).Replace(" ", "") != zahn)
                    throw new HkpFehler($"Mehrkostenfüllung {nr} an {zahn} ohne BEMA-Vergleichsleistung.");
                i++;
                hatMkv = true;
                var abzug = Zahl(Pj.Wahr(Pj.Get(bema, "betrag")) ? Pj.Get(bema, "betrag") : 0L, "Betrag", i);
                aus.Add(new Zeile
                {
                    ["nr"] = "MKF", ["art"] = art, ["anzahl"] = 1L, ["zaehne"] = zahn, ["einzel"] = -Math.Abs(abzug), ["abzug"] = true,
                    ["text"] = $"abzüglich Bema-Sachleistung ({Pj.StrOr(Pj.Get(bema, "nr")).Trim()})",
                });
            }
        }
        if (aus.Count == 0) throw new HkpFehler("Keine der Positionen kann Z1 als Leistung schreiben.");
        if (planart == "mkv" && !hatMkv) throw new HkpFehler("Mehrkostenvereinbarung ohne Mehrkostenfüllung.");
        var titel = string.Join(' ', Py.Worte(Pj.StrOr(Pj.Get(daten, "titel"))));
        if (titel.Length == 0) titel = "PlanR";
        return new Zeile
        {
            ["patnr"] = nummer, ["datum"] = datum, ["bemerkung"] = titel.Length > 40 ? titel[..40] : titel,
            ["kassenplan"] = planart == "mkv" ? "3" : "1", ["muster"] = planart == "mkv" ? "6" : "",
            ["label"] = planart == "mkv" ? "Mehrkostenvereinbarung" : "Privatplan",
            ["positionen"] = aus.Cast<object?>().ToList(), ["hinweise"] = hinweise,
        };
    }

    static string IsoDatum(string iso)
    {
        var d = DateOnly.ParseExact(iso, ["yyyy-MM-dd", "yyyyMMdd"], CultureInfo.InvariantCulture);
        return d.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
    }
}
