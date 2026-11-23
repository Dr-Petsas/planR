using System.Security.Cryptography;
using System.Text;

namespace PlanR.Bridge.Dens;

public sealed class BefundFehler : Exception
{
    public BefundFehler(string message) : base(message) { }
}

public sealed class BefundKonflikt : Exception
{
    public BefundKonflikt(string message) : base(message) { }
}

/// <summary>Port von dens_befund.py und dens_befund01.py.</summary>
public static class DensBefund
{
    // Aus dummy_clinical_templates.json["tooth"]: 92-Byte-Zahnvorlage
    public static readonly byte[] ZahnVorlage = Convert.FromBase64String(
        "DwAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

    static readonly (ushort Mask, string Code, string Label)[] WholeToothFlags =
    [
        (0x0004, "f", "fehlt"),
        (0x0002, "c", "kariös"),
        (0x0008, "z", "zerstört"),
    ];

    public static Dictionary<string, byte[]> DummyPatterns(byte[] template)
    {
        if (template.Length != 92) throw new BefundFehler("Nicht unterstützte DENS-Zahnvorlage.");
        var patterns = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var (mask, code, _) in WholeToothFlags)
        {
            var raw = (byte[])template.Clone();
            var flags = BitConverter.ToUInt16(raw, 4);
            BitConverter.GetBytes((ushort)((flags & ~0x000f) | mask)).CopyTo(raw, 4);
            patterns[code] = raw;
        }
        return patterns;
    }

    public static Dictionary<string, object?> DecodeTooth(byte[] raw)
    {
        if (raw.Length != 92) throw new BefundFehler("Nicht unterstützte DENS-Zahndatenlänge.");
        var flags = BitConverter.ToUInt16(raw, 4);
        var findings = new List<Dictionary<string, object?>>();
        foreach (var (mask, code, label) in WholeToothFlags)
            if ((flags & mask) != 0)
                findings.Add(new Dictionary<string, object?> { ["code"] = code, ["label"] = label });
        return new Dictionary<string, object?>
        {
            ["findings"] = findings,
            ["unmappedFlags"] = flags & ~0x000f,
            ["decodingScope"] = "wholeTooth",
        };
    }

    public static void AnnotateBefunde(Dictionary<string, object?> result)
    {
        var patterns = DummyPatterns(ZahnVorlage);
        if (!result.TryGetValue("befunde", out var bObj) || bObj is not List<object?> befunde) return;
        foreach (var item in befunde)
        {
            if (item is not Dictionary<string, object?> finding) continue;
            if (!finding.TryGetValue("teeth", out var tObj) || tObj is not List<object?> teeth) continue;
            foreach (var ti in teeth)
            {
                if (ti is not Dictionary<string, object?> tooth) continue;
                var dataStr = tooth.TryGetValue("data", out var d) ? Convert.ToString(d) ?? "" : "";
                tooth.Remove("data");
                var raw = Convert.FromBase64String(dataStr);
                tooth["dummyPattern"] = patterns.Values.Any(p => raw.AsSpan(2).SequenceEqual(p.AsSpan(2)));
                foreach (var kv in DecodeTooth(raw))
                    tooth[kv.Key] = kv.Value;
            }
        }
    }

    // --- 01-Befund (dens_befund01.py) ---
    public static readonly string[] Zaehne =
        Enumerable.Range(1, 4).SelectMany(q => Enumerable.Range(1, 8).Select(t => (q * 10 + t).ToString())).ToArray();

    const int OStatus = 4, OWurzel = 10, OImpl = 12, OKopf = 14, OKrone = 16, OStatus2 = 86;
    static readonly int[] OFlaechen = [40, 44, 48, 52, 56, 60];

    const ushort Ohne = 0x1, Karies = 0x2, Fehlt = 0x4, Zerstoert = 0x8;
    const ushort Luecke = 0x200, Ersetzt = 0x400, Krone = 0x1000, Glied = 0x2000, Erneuern = 0x8000;
    const ushort SEigen = Ohne | Karies | Fehlt | Zerstoert | Luecke | Ersetzt | Krone | Glied | Erneuern;
    const ushort S2Anker = 0x8000, S2Entfernen = 0x4000, S2AdhGlied = 0x0200;
    const ushort S2Eigen = S2Anker | S2Entfernen | 0x0600;
    const ushort WurzelImplantat = 3, KopfStiftkappe = 4, KopfAufbau = 3, KroneTeleskop = 2;
    const ushort FlDefekt1 = 1, FlDefekt2 = 2, FlTeilkroneW = 10;

    static readonly Dictionary<string, (ushort S, ushort S2, ushort W, ushort K, ushort Kr, ushort Fl)> Felder = new(StringComparer.Ordinal)
    {
        [""] = (Ohne, 0, 0, 0, 0, 0),
        ["f"] = (Fehlt, 0, 0, 0, 0, 0),
        [")("] = (Fehlt | Luecke, 0, 0, 0, 0, 0),
        ["e"] = (Fehlt | Ersetzt, 0, 0, 0, 0, 0),
        ["ew"] = (Fehlt | Ersetzt | Erneuern, 0, 0, 0, 0, 0),
        ["b"] = (Fehlt | Glied, 0, 0, 0, 0, 0),
        ["bw"] = (Fehlt | Glied | Erneuern, 0, 0, 0, 0, 0),
        ["ab"] = (Fehlt, S2AdhGlied, 0, 0, 0, 0),
        ["abw"] = (Fehlt | Erneuern, S2AdhGlied, 0, 0, 0, 0),
        ["a"] = (Ohne, S2Anker, 0, 0, 0, 0),
        ["aw"] = (Ohne | Erneuern, S2Anker, 0, 0, 0, 0),
        ["k"] = (Ohne | Krone, 0, 0, 0, 0, 0),
        ["kw"] = (Ohne | Krone | Erneuern, 0, 0, 0, 0, 0),
        ["t"] = (Ohne | Krone, 0, 0, 0, KroneTeleskop, 0),
        ["tw"] = (Ohne | Krone | Erneuern, 0, 0, 0, KroneTeleskop, 0),
        ["x"] = (Zerstoert, 0, 0, 0, 0, 0),
        ["ww"] = (Karies, 0, 0, 0, 0, 0),
        ["pw"] = (Ohne, 0, 0, 0, 0, FlDefekt1),
        ["pkw"] = (Ohne, 0, 0, 0, 0, FlTeilkroneW),
        ["r"] = (Ohne, 0, 0, KopfStiftkappe, 0, 0),
        ["rw"] = (Ohne | Erneuern, 0, 0, KopfStiftkappe, 0, 0),
        ["i"] = (Ohne, 0, WurzelImplantat, 0, 0, 0),
        ["sk"] = (Ohne | Krone, 0, WurzelImplantat, KopfAufbau, 0, 0),
        ["skw"] = (Ohne | Krone | Erneuern, 0, WurzelImplantat, KopfAufbau, 0, 0),
        ["st"] = (Ohne | Krone, 0, WurzelImplantat, KopfAufbau, KroneTeleskop, 0),
        ["stw"] = (Ohne | Krone | Erneuern, 0, WurzelImplantat, KopfAufbau, KroneTeleskop, 0),
        ["ix"] = (Ohne, S2Entfernen, WurzelImplantat, 0, 0, 0),
    };

    static readonly Dictionary<string, string> Ersatz = new(StringComparer.Ordinal)
    {
        ["ur"] = "", ["sb"] = "b", ["sbw"] = "bw", ["se"] = "e", ["sew"] = "ew", ["so"] = "sk", ["sow"] = "skw", ["t2w"] = "tw",
    };

    public static readonly List<string> KuerzelListe =
        Felder.Keys.Union(Ersatz.Keys).OrderBy(x => x, StringComparer.Ordinal).ToList();

    static readonly Dictionary<string, string> Frueher = new(StringComparer.Ordinal) { ["sw"] = "skw" };
    static readonly Dictionary<string, string> FrueherInDens = new(StringComparer.Ordinal) { ["i"] = "sk", ["sw"] = "skw" };

    public static string Eingang(string wert)
    {
        var code = wert is "healthy" or "" ? "" : wert == "missing" ? "f" : wert.Trim().ToLowerInvariant();
        return Frueher.TryGetValue(code, out var f) ? f : code;
    }

    public static Dictionary<string, object?>? Aktueller(List<object?>? befunde)
    {
        if (befunde is null) return null;
        Dictionary<string, object?>? beste = null;
        (string d, string t, int n) bestKey = ("", "", int.MinValue);
        foreach (var item in befunde)
        {
            if (item is not Dictionary<string, object?> b) continue;
            if (Convert.ToInt32(b.GetValueOrDefault("kind") ?? 0) != 1) continue;
            var key = (Convert.ToString(b.GetValueOrDefault("date")) ?? "", Convert.ToString(b.GetValueOrDefault("time")) ?? "", Convert.ToInt32(b.GetValueOrDefault("number") ?? 0));
            if (beste is null || CompareKey(key, bestKey) > 0)
            {
                beste = b;
                bestKey = key;
            }
        }
        return beste;
    }

    static int CompareKey((string d, string t, int n) a, (string d, string t, int n) b)
    {
        var c = string.CompareOrdinal(a.d, b.d);
        if (c != 0) return c;
        c = string.CompareOrdinal(a.t, b.t);
        return c != 0 ? c : a.n.CompareTo(b.n);
    }

    static ushort U16(byte[] raw, int o) => BitConverter.ToUInt16(raw, o);

    public static string Kuerzel(byte[] raw)
    {
        var s = U16(raw, OStatus);
        var s2 = U16(raw, OStatus2);
        var wurzel = U16(raw, OWurzel);
        var kopf = U16(raw, OKopf);
        var krone = U16(raw, OKrone);
        var fl = OFlaechen.Select(o => U16(raw, o)).ToArray();
        var w = (s & Erneuern) != 0 ? "w" : "";
        if ((s2 & S2Anker) != 0) return "a" + w;
        if ((s & Fehlt) != 0)
        {
            if ((s2 & 0x0600) != 0) return "ab" + w;
            if ((s & Glied) != 0) return "b" + w;
            if ((s & Ersetzt) != 0) return "e" + w;
            return (s & Luecke) != 0 ? ")(" : "f";
        }
        if (wurzel == WurzelImplantat)
        {
            if ((s2 & S2Entfernen) != 0) return "ix";
            var kaputt = (s & (Erneuern | Zerstoert)) != 0 ? "w" : "";
            if ((s & Krone) != 0) return (krone == KroneTeleskop ? "st" : "sk") + kaputt;
            return (s & Ersetzt) != 0 ? "so" + kaputt : "i";
        }
        if ((s & Ersetzt) != 0) return "e" + ((s & Zerstoert) != 0 ? "" : w);
        var defekt = (s & Karies) != 0 || fl.Any(f => f is FlDefekt1 or FlDefekt2);
        if ((s & Zerstoert) != 0) return "x";
        if ((s & Krone) != 0) return (krone == KroneTeleskop ? "t" : "k") + (defekt || (s & Erneuern) != 0 ? "w" : "");
        if ((s & Karies) != 0) return "ww";
        if (defekt) return "pw";
        if (fl.Contains(FlTeilkroneW)) return "pkw";
        if (kopf == KopfStiftkappe) return "r" + w;
        return "";
    }

    public static byte[] Satz(byte[]? alt, byte[] vorlage, string zahn, string code)
    {
        var (status, status2, wurzel, kopf, krone, flaeche) = Felder[code];
        byte[] raw;
        if (alt is not null) raw = (byte[])alt.Clone();
        else
        {
            raw = (byte[])vorlage.Clone();
            BitConverter.GetBytes((ushort)0).CopyTo(raw, OStatus);
        }
        BitConverter.GetBytes((short)int.Parse(zahn)).CopyTo(raw, 0);
        BitConverter.GetBytes((ushort)((U16(raw, OStatus) & ~SEigen) | status)).CopyTo(raw, OStatus);
        BitConverter.GetBytes((ushort)((U16(raw, OStatus2) & ~S2Eigen) | status2)).CopyTo(raw, OStatus2);
        var warImplantat = U16(raw, OWurzel) == WurzelImplantat;
        if (wurzel == WurzelImplantat)
        {
            BitConverter.GetBytes(wurzel).CopyTo(raw, OWurzel);
            if (U16(raw, OImpl) == 0) BitConverter.GetBytes((ushort)1).CopyTo(raw, OImpl);
            BitConverter.GetBytes(kopf).CopyTo(raw, OKopf);
        }
        else
        {
            if (warImplantat)
            {
                BitConverter.GetBytes((ushort)0).CopyTo(raw, OWurzel);
                BitConverter.GetBytes((ushort)0).CopyTo(raw, OImpl);
            }
            if (kopf != 0 || warImplantat || U16(raw, OKopf) == KopfStiftkappe)
                BitConverter.GetBytes(kopf).CopyTo(raw, OKopf);
        }
        if ((status & Krone) != 0 || U16(raw, OKrone) == KroneTeleskop)
            BitConverter.GetBytes(krone).CopyTo(raw, OKrone);
        var schon = false;
        foreach (var o in OFlaechen)
        {
            var wert = U16(raw, o);
            if (wert == flaeche && flaeche != 0 && !schon) schon = true;
            else if (wert is FlDefekt1 or FlDefekt2 or FlTeilkroneW)
            {
                BitConverter.GetBytes((ushort)0).CopyTo(raw, o);
                BitConverter.GetBytes((ushort)0).CopyTo(raw, o + 2);
            }
        }
        if (flaeche != 0 && !schon)
        {
            var frei = OFlaechen.FirstOrDefault(o => U16(raw, o) == 0);
            if (frei == 0) frei = OFlaechen[0];
            BitConverter.GetBytes(flaeche).CopyTo(raw, frei);
            BitConverter.GetBytes((ushort)0).CopyTo(raw, frei + 2);
        }
        if (Kuerzel(raw) != code)
            throw new BefundFehler($"Kürzel {code} lässt sich an Zahn {zahn} nicht eindeutig in DENS ablegen.");
        return raw;
    }

    public static Dictionary<string, byte[]> Saetze(Dictionary<string, object?>? befund)
    {
        var aus = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        if (befund is null || !befund.TryGetValue("teeth", out var tObj) || tObj is not List<object?> teeth) return aus;
        foreach (var ti in teeth)
        {
            if (ti is not Dictionary<string, object?> t || !t.TryGetValue("data", out var dObj) || dObj is not string d) continue;
            var nr = Convert.ToString(t.GetValueOrDefault("number")) ?? "";
            aus[nr] = Convert.FromBase64String(d);
        }
        return aus;
    }

    static string? Gemerkt(Dictionary<string, object?>? m, byte[]? raw, string code)
    {
        if (m is null || !m.TryGetValue("code", out var cObj) || cObj is not string mc || mc.Length == 0) return null;
        if (m.TryGetValue("dens", out var dObj) && dObj is string md)
        {
            var erwartet = FrueherInDens.TryGetValue(md, out var fd) ? fd : md;
            return erwartet == code ? (Frueher.TryGetValue(mc, out var fc) ? fc : mc) : null;
        }
        var bits = (raw is not null ? U16(raw, OStatus) : 0) & (Fehlt | Zerstoert);
        var mBits = m.TryGetValue("bits", out var bObj) && bObj is not null ? Convert.ToInt32(bObj) : -1;
        return mBits == bits && code is "" or "f" or "x" ? mc : null;
    }

    public static Dictionary<string, object?> Lesen(Dictionary<string, object?>? befund, Dictionary<string, Dictionary<string, object?>>? merk)
    {
        var dens = Saetze(befund);
        var teeth = new Dictionary<string, object?>(StringComparer.Ordinal);
        var paarListe = new List<(string Z, string S)>();
        foreach (var z in Zaehne)
        {
            dens.TryGetValue(z, out var raw);
            var code = raw is not null ? Kuerzel(raw) : "";
            Dictionary<string, object?>? m = null;
            merk?.TryGetValue(z, out m);
            var st = Gemerkt(m, raw, code) ?? code;
            teeth[z] = new Dictionary<string, object?> { ["status"] = st };
            paarListe.Add((z, st));
        }
        var datum = Convert.ToString(befund?.GetValueOrDefault("date")) ?? "";
        var nr = befund is not null && befund.TryGetValue("number", out var nObj) && nObj is not null ? Convert.ToInt32(nObj) : 0;
        // Identische JSON-Serialisierung wie Python json.dumps([number, sorted((z, status) ...)]) mit ", "-Trennern.
        paarListe.Sort((a, b) => string.CompareOrdinal(a.Z, b.Z));
        var sb = new StringBuilder();
        sb.Append('[').Append(nr).Append(", [");
        for (var i = 0; i < paarListe.Count; i++)
        {
            if (i > 0) sb.Append(", ");
            sb.Append("[\"").Append(paarListe[i].Z).Append("\", \"").Append(paarListe[i].S).Append("\"]");
        }
        sb.Append("]]");
        var version = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()))).ToLowerInvariant()[..16];
        var items = datum.Length > 0 ? new List<object?> { new Dictionary<string, object?> { ["date"] = datum } } : new List<object?>();
        return new Dictionary<string, object?>
        {
            ["version"] = version,
            ["current"] = new Dictionary<string, object?> { ["date"] = datum, ["teeth"] = teeth },
            ["items"] = items,
            ["pvs"] = "DENSoffice",
            ["scope"] = "Alle Befundkürzel stehen in der DENS-Zahngrafik.",
            ["codes"] = KuerzelListe,
        };
    }

    public static (List<byte[]> Neue, Dictionary<string, Dictionary<string, object?>> NeuMerk, List<string> Geaendert, List<string> Gemerkt)
        Auftrag(Dictionary<string, object?>? befund, Dictionary<string, Dictionary<string, object?>>? merk,
                Dictionary<string, object?> teethIn, byte[] vorlage)
    {
        if (teethIn.Count == 0 || teethIn.Count > 32)
            throw new BefundFehler("Befund ohne Zähne.");
        var gelesen = Lesen(befund, merk);
        var jetzt = (Dictionary<string, object?>)((Dictionary<string, object?>)gelesen["current"]!)["teeth"]!;
        var dens = Saetze(befund);
        var ziel = new Dictionary<string, string>(StringComparer.Ordinal);
        var zaehneSet = new HashSet<string>(Zaehne, StringComparer.Ordinal);
        foreach (var (z, wertObj) in teethIn)
        {
            if (!zaehneSet.Contains(z) || wertObj is not string wert || wert.Length > 8)
                throw new BefundFehler($"Ungültige Zahnangabe: {z}");
            var code = Eingang(wert);
            if (!Felder.ContainsKey(code) && !Ersatz.ContainsKey(code))
                throw new BefundFehler($"Befundkürzel '{code}' an Zahn {z} ist unbekannt.");
            ziel[z] = code;
        }
        var geaendert = ziel.Where(kv => kv.Value != (string)((Dictionary<string, object?>)jetzt[kv.Key]!)["status"]!).Select(kv => kv.Key).ToList();
        if (merk is not null)
        {
            foreach (var (z, m) in merk)
            {
                if (zaehneSet.Contains(z) && !m.ContainsKey("dens") && !ziel.ContainsKey(z)
                    && m.TryGetValue("code", out var mcObj) && mcObj is string mc
                    && (string)((Dictionary<string, object?>)jetzt[z]!)["status"]! == mc
                    && KuerzelListe.Contains(mc))
                {
                    ziel[z] = mc;
                }
            }
        }
        var neuMerk = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        if (merk is not null)
            foreach (var (z, m) in merk)
                if (!ziel.ContainsKey(z)) neuMerk[z] = new Dictionary<string, object?>(m);
        var neue = new List<byte[]>();
        var gemerkt = new List<string>();
        foreach (var (z, code) in ziel)
        {
            dens.TryGetValue(z, out var alt);
            if (alt is not null && Kuerzel(alt) == code) continue;
            var inDens = Ersatz.TryGetValue(code, out var ers) ? ers : code;
            if ((alt is not null ? Kuerzel(alt) : "") != inDens)
                neue.Add(Satz(alt, vorlage, z, inDens));
            if (inDens != code)
            {
                neuMerk[z] = new Dictionary<string, object?> { ["code"] = code, ["dens"] = inDens };
                gemerkt.Add(z);
            }
        }
        return (neue, neuMerk, geaendert, gemerkt);
    }

    public static string Meldung(List<string> geaendert, List<string> inDens, List<string> gemerkt)
    {
        if (geaendert.Count == 0 && inDens.Count == 0)
            return "Der Befund in DENSoffice stimmt schon.";
        var teile = new List<string>();
        if (inDens.Count > 0) teile.Add($"In die DENS-Zahngrafik geschrieben: {string.Join(", ", inDens)}.");
        if (gemerkt.Count > 0) teile.Add($"Ohne eigenes Feld in DENS, dort in der nächsten Entsprechung: {string.Join(", ", gemerkt)}.");
        if (inDens.Count > 0) teile.Add("In DENSoffice den Patienten beziehungsweise den aktuellen Befund erneut öffnen.");
        return teile.Count > 0 ? string.Join(" ", teile) : "Der Befund in DENSoffice stimmt schon.";
    }
}
