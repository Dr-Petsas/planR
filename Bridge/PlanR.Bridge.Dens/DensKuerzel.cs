namespace PlanR.Bridge.Dens;

public sealed class KuerzelError : Exception
{
    public KuerzelError(string message) : base(message) { }
}

/// <summary>1:1-Port von dens_kuerzel.py (Befund- und HuK-Plansymbol-Tabellen).</summary>
public static class DensKuerzel
{
    public static readonly HashSet<string> HkpBefundDens = new(StringComparer.Ordinal)
    {
        ")(", "a", "ab", "abw", "aw", "b", "bw", "e", "ew", "f", "fi", "ix", "k", "kw", "pkw", "pw", "r", "rw",
        "sb", "sbw", "se", "sew", "sk", "skw", "so", "sow", "st", "stw", "t", "t2w", "tw", "ur", "ww", "x",
    };

    public static readonly Dictionary<string, string> BefundAufnahmeNachKasse = new(StringComparer.Ordinal)
    {
        [""] = "", ["f"] = "f", ["e"] = "e", ["ew"] = "ew", ["b"] = "b", ["bw"] = "bw",
        ["k"] = "k", ["kw"] = "kw", ["t"] = "t", ["tw"] = "tw",
        ["c"] = "ww", ["z"] = "x", ["ck"] = "kw", ["ct"] = "tw", ["zk"] = "x", ["zt"] = "x",
        ["ww"] = "ww", ["pw"] = "pw", ["x"] = "x", [")("] = ")(", ["("] = ")(",
        ["i"] = "f", ["ix"] = "ix", ["ie"] = "so", ["iew"] = "sow",
        ["ik"] = "sk", ["ikw"] = "skw", ["it"] = "st", ["itw"] = "stw",
        ["r"] = "r", ["rw"] = "rw", ["sw"] = "skw", ["fi"] = "fi",
        ["a"] = "a", ["ab"] = "ab", ["abw"] = "abw", ["aw"] = "aw",
        ["sb"] = "sb", ["sbw"] = "sbw", ["se"] = "se", ["sew"] = "sew",
        ["sk"] = "sk", ["skw"] = "skw", ["so"] = "so", ["sow"] = "sow",
        ["st"] = "st", ["stw"] = "stw", ["ur"] = "ur", ["pkw"] = "pkw", ["t2w"] = "t2w",
    };

    public static readonly HashSet<string> KasseBefund = new(
        BefundAufnahmeNachKasse.Values.Where(v => v.Length > 0), StringComparer.Ordinal);

    public static readonly HashSet<string> HukPlan = new(StringComparer.Ordinal)
    {
        "a", "abv", "abm", "b", "bm", "bv", "e", "eo", "h",
        "k", "kh", "km", "kmh", "kmo", "ko", "kv", "kvh", "kvo",
        "pk", "pkm", "pkv", "r",
        "sb", "sbv", "sbm", "se", "seo",
        "sk", "skm", "skmo", "sko", "skv", "skvo", "so",
        "st", "stm", "stv", "t", "tm", "tv", "t2", "t2v", "t2m",
        "ve", "za", "zab", "zas", "tz", "tzv", "stz", "stzv",
        "i1", "i2", "i3", "i4", "c1", "c2", "c3", "c4", "on", "onk",
        ")(",
    };

    public static readonly Dictionary<string, string> RDens = new(StringComparer.Ordinal)
    {
        ["a"] = "a", ["abv"] = "abv", ["b"] = "b", ["bm"] = "bm", ["bv"] = "bv", ["e"] = "e", ["h"] = "h",
        ["k"] = "k", ["kh"] = "kh", ["km"] = "km", ["kmh"] = "kmh", ["kmo"] = "km-o", ["ko"] = "k-o", ["kv"] = "kv", ["kvh"] = "kvh", ["kvo"] = "kv-o",
        ["pk"] = "pk", ["r"] = "r", ["se"] = "se", ["sk"] = "sk", ["skm"] = "skm", ["skv"] = "skv",
        ["t"] = "t", ["tm"] = "tm", ["tv"] = "tv", ["t2"] = "t2", ["t2v"] = "tv2",
    };

    public static readonly Dictionary<string, string> RAnker = new(StringComparer.Ordinal)
    {
        ["k"] = "k-", ["kh"] = "kh-", ["km"] = "km-", ["kmh"] = "kmh-", ["kv"] = "kv-", ["kvh"] = "kvh-", ["pk"] = "pk-",
    };

    public static readonly Dictionary<string, string> TpBema = new(StringComparer.Ordinal)
    {
        ["a"] = "a", ["abm"] = "abm", ["abv"] = "abv", ["b"] = "b", ["bm"] = "bm", ["bv"] = "bv", ["e"] = "e", ["eo"] = "eo", ["h"] = "h",
        ["k"] = "k", ["kh"] = "kh", ["km"] = "km", ["kmh"] = "kmh", ["kmo"] = "kmo-", ["ko"] = "ko", ["kv"] = "kv", ["kvh"] = "kvh", ["kvo"] = "kvo-",
        ["pk"] = "pk", ["pkm"] = "pkm", ["pkv"] = "pkv", ["r"] = "r",
        ["se"] = "se", ["sk"] = "sk", ["skm"] = "skm", ["skv"] = "skv", ["so"] = "so", ["st"] = "st", ["stm"] = "stm", ["stv"] = "stv",
        ["t"] = "t", ["tm"] = "tm", ["tv"] = "tv", ["t2"] = "t2", ["t2v"] = "tv2",
        ["za"] = "km", ["zab"] = "bm", ["zas"] = "skm", ["tz"] = "tm", ["tzv"] = "tm", ["stz"] = "stm", ["stzv"] = "stm",
    };

    public static readonly Dictionary<string, string> TpBemaAnker = new(StringComparer.Ordinal)
    {
        ["k"] = "k-", ["kh"] = "kh-", ["km"] = "km-", ["kmh"] = "kmh-", ["kmo"] = "km-o", ["ko"] = "k-o", ["kv"] = "kv-", ["kvh"] = "kvh-",
        ["kvo"] = "kv-o", ["pk"] = "pk-", ["pkm"] = "pkm-", ["pkv"] = "pkv-", ["za"] = "km-",
    };

    public static readonly Dictionary<string, string> TpGoz = new(StringComparer.Ordinal)
    {
        ["a"] = "A", ["abm"] = "ABM", ["abv"] = "ABV", ["b"] = "B", ["bm"] = "BM", ["bv"] = "BV", ["e"] = "E", ["eo"] = "EO", ["h"] = "H",
        ["k"] = "K", ["kh"] = "KH", ["km"] = "KM", ["kmh"] = "KMH", ["kmo"] = "KMO-", ["ko"] = "KO", ["kv"] = "KV", ["kvh"] = "KVH", ["kvo"] = "KVO-",
        ["pk"] = "PK", ["pkm"] = "PKM", ["pkv"] = "PKV", ["r"] = "R",
        ["sb"] = "SB", ["sbm"] = "SBM", ["sbv"] = "SBV", ["se"] = "SE", ["seo"] = "SEO",
        ["sk"] = "SK", ["skm"] = "SKM", ["skmo"] = "SKMO", ["sko"] = "SKO", ["skv"] = "SKV", ["skvo"] = "SKVO", ["so"] = "SO",
        ["st"] = "ST", ["stm"] = "STM", ["stv"] = "STV", ["t"] = "T", ["tm"] = "TM", ["tv"] = "TV", ["t2"] = "T2", ["t2m"] = "T2M", ["t2v"] = "T2V",
        ["ve"] = "VE", ["i1"] = "I1", ["i2"] = "I2", ["i3"] = "I3", ["i4"] = "I4", ["c1"] = "IM1", ["c2"] = "IM2", ["c3"] = "IM3", ["c4"] = "IM4",
        ["on"] = "I4", ["onk"] = "IM4",
        ["za"] = "KM", ["zab"] = "BM", ["zas"] = "SKM", ["tz"] = "TM", ["tzv"] = "TM", ["stz"] = "STM", ["stzv"] = "STM",
    };

    public static readonly Dictionary<string, string> TpGozAnker = new(StringComparer.Ordinal)
    {
        ["k"] = "K-", ["kh"] = "KH-", ["km"] = "KM-", ["kmh"] = "KMH-", ["kmo"] = "KM-O", ["ko"] = "K-O", ["kv"] = "KV-", ["kvh"] = "KVH-",
        ["kvo"] = "KV-O", ["pk"] = "PK-", ["pkm"] = "PKM-", ["pkv"] = "PKV-", ["sk"] = "SK-", ["skm"] = "SKM-", ["skv"] = "SKV-",
        ["t"] = "T-", ["tm"] = "TM-", ["tv"] = "TV-", ["za"] = "KM-", ["zas"] = "SKM-", ["tz"] = "TM-", ["tzv"] = "TM-", ["stz"] = "STM", ["stzv"] = "STM",
    };

    public static readonly HashSet<string> Brueckenglied = new(StringComparer.Ordinal) { "b", "bv", "bm", "sb", "sbv", "sbm", "zab" };

    public static readonly int[][] Zahnreihen =
    [
        [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
        [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
    ];

    public static readonly Dictionary<string, string> RAmtlich = new(StringComparer.Ordinal)
    {
        ["a"] = "a", ["abv"] = "abv", ["abv2"] = "abv", ["b"] = "b", ["bm"] = "bv", ["bv"] = "bv", ["e"] = "e", ["ei"] = "e", ["ek"] = "e", ["et"] = "e",
        ["eti"] = "e", ["etm"] = "e", ["h"] = "h", ["hh"] = "h", ["hh2"] = "h", ["k"] = "k", ["k-"] = "k", ["k-o"] = "ko", ["kg"] = "k", ["kg-"] = "k",
        ["kh"] = "kh", ["kh-"] = "kh", ["khg"] = "kh", ["khg-"] = "kh", ["khk"] = "kh", ["khk-"] = "kh", ["kk"] = "k", ["kk-"] = "k", ["km"] = "kv",
        ["km-"] = "kv", ["km-o"] = "kvo", ["kmg"] = "kv", ["kmg-"] = "kv", ["kmh"] = "kvh", ["kmh-"] = "kvh", ["kmk"] = "kv", ["kmk-"] = "kv", ["kv"] = "kv",
        ["kv-"] = "kv", ["kv-o"] = "kvo", ["kvg"] = "kv", ["kvg-"] = "kv", ["kvh"] = "kvh", ["kvh-"] = "kvh", ["kvk"] = "kv", ["kvk-"] = "kv", ["o-k"] = "ko",
        ["o-kv"] = "kvo", ["pk"] = "pk", ["pk-"] = "pk", ["pkg"] = "pk", ["pkg-"] = "pk", ["pkk"] = "pk", ["pkk-"] = "pk", ["r"] = "r", ["se"] = "se",
        ["sk"] = "sk", ["skm"] = "skv", ["skv"] = "skv", ["t"] = "t", ["t2"] = "t2", ["tm"] = "tv", ["tv"] = "tv", ["tv2"] = "t2v",
    };

    public static readonly Dictionary<string, string> TpAmtlich = new(StringComparer.Ordinal)
    {
        ["a"] = "a", ["a."] = "a", ["abm"] = "abm", ["abmm"] = "abm", ["abv"] = "abv", ["abv2"] = "abv", ["ak"] = "k", ["ak*"] = "kh", ["ak*-"] = "kh",
        ["ak-"] = "k", ["akh"] = "kh", ["akh-"] = "kh", ["aks"] = "k", ["aks-"] = "k", ["at"] = "t", ["b"] = "b", ["bm"] = "bm", ["bv"] = "bv",
        ["e"] = "e", ["ei"] = "e", ["ek"] = "e", ["eo"] = "eo", ["et"] = "e", ["eti"] = "e", ["etm"] = "e", ["h"] = "h", ["k"] = "k", ["k-"] = "k",
        ["k-o"] = "ko", ["kg"] = "k", ["kg-"] = "k", ["kh"] = "kh", ["kh-"] = "kh", ["khg"] = "kh", ["khg-"] = "kh", ["khk"] = "kh", ["khk-"] = "kh",
        ["kk"] = "k", ["kk-"] = "k", ["km"] = "km", ["km-"] = "km", ["km-o"] = "kmo", ["kmg"] = "km", ["kmg-"] = "km", ["kmh"] = "kmh", ["kmh-"] = "kmh",
        ["kmk"] = "km", ["kmk-"] = "km", ["kmo-"] = "kmo", ["kmst"] = "km", ["ko"] = "ko", ["kv"] = "kv", ["kv-"] = "kv", ["kv-o"] = "kvo",
        ["kvg"] = "kv", ["kvg-"] = "kv", ["kvh"] = "kvh", ["kvh-"] = "kvh", ["kvk"] = "kv", ["kvk-"] = "kv", ["kvo-"] = "kvo", ["m"] = "km", ["mg"] = "km",
        ["o-k"] = "ko", ["o-km"] = "kmo", ["o-kv"] = "kvo", ["ok-"] = "ko", ["okv-"] = "kvo", ["pk"] = "pk", ["pk-"] = "pk", ["pkg"] = "pk",
        ["pkg-"] = "pk", ["pkk"] = "pk", ["pkk-"] = "pk", ["pkm"] = "pkm", ["pkm-"] = "pkm", ["pkv"] = "pkv", ["pkv-"] = "pkv", ["r"] = "r", ["r*"] = "r",
        ["se"] = "se", ["sk"] = "sk", ["skm"] = "skm", ["skms"] = "skm", ["sks"] = "sk", ["skv"] = "skv", ["skvs"] = "skv", ["sm"] = "skm",
        ["smg"] = "skm", ["so"] = "so", ["sr"] = "so", ["sro"] = "so", ["st"] = "st", ["stm"] = "stm", ["stv"] = "stv", ["t"] = "t", ["t."] = "t",
        ["t2"] = "t2", ["tm"] = "tm", ["tv"] = "tv", ["tv."] = "tv", ["tv2"] = "t2v", ["tvv"] = "tv",
        ["za"] = "km", ["zas"] = "skm", ["zab"] = "bm", ["tz"] = "tm", ["tzv"] = "tm", ["stz"] = "stm", ["stzv"] = "stm",
        ["A"] = "a", ["ABM"] = "abm", ["ABMM"] = "abm", ["ABV"] = "abv", ["ABVV"] = "abv", ["B"] = "b", ["BM"] = "bm", ["BMV"] = "bv", ["BV"] = "bv",
        ["E"] = "e", ["EI"] = "e", ["EO"] = "eo", ["ET"] = "e", ["ETC"] = "e", ["ETM"] = "e", ["H"] = "h", ["I1"] = "i1", ["I2"] = "i2", ["I3"] = "i3",
        ["I4"] = "i4", ["IC1"] = "i1", ["IC2"] = "i2", ["IC3"] = "i3", ["IM1"] = "i1", ["IM2"] = "i2", ["IM3"] = "i3", ["IM4"] = "i4",
        ["K"] = "k", ["K-"] = "k", ["K-O"] = "ko", ["KH"] = "kh", ["KH-"] = "kh", ["KM"] = "km", ["KM-"] = "km", ["KM-O"] = "kmo", ["KMH"] = "kmh",
        ["KMH-"] = "kmh", ["KMO-"] = "kmo", ["KO"] = "ko", ["KV"] = "kv", ["KV-"] = "kv", ["KV-O"] = "kvo", ["KVH"] = "kvh", ["KVH-"] = "kvh",
        ["KVO-"] = "kvo", ["M"] = "km", ["MG"] = "km", ["O-K"] = "ko", ["O-KM"] = "kmo", ["O-KV"] = "kvo", ["OK-"] = "ko", ["OKM-"] = "kmo",
        ["OKV-"] = "kvo", ["PK"] = "pk", ["PK-"] = "pk", ["PKM"] = "pkm", ["PKM-"] = "pkm", ["PKV"] = "pkv", ["PKV-"] = "pkv", ["R"] = "r",
        ["SB"] = "sb", ["SBM"] = "sbm", ["SBV"] = "sbv", ["SE"] = "se", ["SEE"] = "se", ["SEO"] = "seo", ["SK"] = "sk", ["SK-"] = "sk", ["SKM"] = "skm",
        ["SKM-"] = "skm", ["SKMO"] = "skmo", ["SKMS"] = "skm", ["SKO"] = "sko", ["SKS"] = "sk", ["SKV"] = "skv", ["SKV-"] = "skv",
        ["SKVO"] = "skvo", ["SKVS"] = "skv", ["SM"] = "skm", ["SM-"] = "skm", ["SMG"] = "skm", ["SO"] = "so", ["SR"] = "so", ["SRO"] = "so",
        ["ST"] = "st", ["STM"] = "stm", ["STMS"] = "stm", ["STS"] = "sk", ["STV"] = "stv", ["STVS"] = "stv", ["T"] = "t", ["T-"] = "t",
        ["T2"] = "t2", ["T2M"] = "t2m", ["T2V"] = "t2v", ["TM"] = "tm", ["TM-"] = "tm", ["TV"] = "tv", ["TV-"] = "tv", ["VE"] = "ve",
    };

    static string Norm(object? code)
    {
        if (code is null) return "";
        if (code is not string s) throw new KuerzelError("Befund- oder Plansymbol muss Text sein.");
        return s.Trim();
    }

    public static string BefundKasse(object? code)
    {
        var raw = Norm(code);
        if (raw.Length == 0) return "";
        var key = raw.ToLowerInvariant();
        string mapped;
        if (key == ")(") mapped = ")(";
        else if (BefundAufnahmeNachKasse.TryGetValue(key, out var m)) mapped = m;
        else if (KasseBefund.Contains(key)) mapped = key;
        else throw new KuerzelError($"Unbekanntes Befundkürzel: {raw}");
        if (mapped.Length > 0 && DensPfad.Cp1252.GetByteCount(mapped) > 3)
            throw new KuerzelError($"Befundkürzel zu lang für DENS-Schema: {mapped}");
        return mapped;
    }

    public static string PlanHuk(object? code)
    {
        var raw = Norm(code);
        if (raw.Length == 0) return "";
        var key = raw.ToLowerInvariant();
        if (!HukPlan.Contains(key))
            throw new KuerzelError($"Unbekanntes HuK-Plansymbol: {raw}");
        return key;
    }

    public static bool Ankersymbole() => Environment.GetEnvironmentVariable("DENS_ANKERSYMBOLE") != "0";

    public static HashSet<int> AnkerZaehne(Dictionary<int, string> zeile, HashSet<int>? lueckeGeschlossen = null)
    {
        if (!Ankersymbole()) return [];
        var anker = new HashSet<int>();
        foreach (var reihe in Zahnreihen)
        {
            var sitz = lueckeGeschlossen is null ? reihe.ToList() : reihe.Where(n => !lueckeGeschlossen.Contains(n)).ToList();
            for (var i = 0; i < sitz.Count; i++)
            {
                if (zeile.TryGetValue(sitz[i], out var sym) && Brueckenglied.Contains(sym))
                {
                    for (var j = Math.Max(i - 1, 0); j < Math.Min(i + 2, sitz.Count); j++)
                        anker.Add(sitz[j]);
                }
            }
        }
        return anker.Where(n => zeile.TryGetValue(n, out var sym) && sym.Length > 0 && !Brueckenglied.Contains(sym)).ToHashSet();
    }

    public static string RSymbol(object? code, bool anker = false)
    {
        var key = PlanHuk(code);
        if (anker && RAnker.TryGetValue(key, out var a)) return a;
        return RDens.TryGetValue(key, out var r) ? r : "";
    }

    static readonly HashSet<string> ImplantatBefund = new(StringComparer.Ordinal)
    {
        "i", "ix", "sk", "skw", "sb", "sbw", "se", "sew", "so", "sow", "st", "stw",
    };

    /** Implantatkrone oder implantatgetragenes Glied in der Planung, auch in der alten Schreibweise. */
    public static bool ImplantatPlan(string code)
    {
        var k = code.Trim().ToLowerInvariant();
        return k is "zas" or "stz" or "stzv" or "skm" or "sbm" or "stm" || (k.Length > 0 && k[0] == 's');
    }

    /** ZAB an einem Implantat wird SBM, zwischen eigenen Zähnen BM. */
    public static bool ImplantatGlied(int zahn, string befund, IReadOnlyDictionary<int, string> planung)
    {
        if (ImplantatBefund.Contains(befund.Trim().ToLowerInvariant())) return true;
        foreach (var reihe in Zahnreihen)
        {
            var i = Array.IndexOf(reihe, zahn);
            if (i < 0) continue;
            if (i > 0 && planung.TryGetValue(reihe[i - 1], out var links) && ImplantatPlan(links)) return true;
            if (i + 1 < reihe.Length && planung.TryGetValue(reihe[i + 1], out var rechts) && ImplantatPlan(rechts)) return true;
        }
        return false;
    }

    /** Interne Planungskürzel auf die amtliche Zeile TP. Schon amtliche Kürzel bleiben. */
    public static string PlanungNachAmtlich(string code, bool implantatGlied)
    {
        var roh = code.Trim();
        switch (roh.ToLowerInvariant())
        {
            case "za": return "km";
            case "zas": return "skm";
            case "zab": return implantatGlied ? "sbm" : "bm";
            case "tz":
            case "tzv": return "tm";
            case "stz":
            case "stzv": return "stm";
            default: return roh;
        }
    }

    public static string TpSymbol(object? code, string versorgung, bool anker = false)
    {
        var key = PlanHuk(code);
        if (versorgung != "andersartig" && TpBema.TryGetValue(key, out var b))
            return anker && TpBemaAnker.TryGetValue(key, out var ba) ? ba : b;
        if (anker && TpGozAnker.TryGetValue(key, out var ga)) return ga;
        return TpGoz.TryGetValue(key, out var g) ? g : "";
    }

    public static string AmtlichR(string symbol) => RAmtlich.TryGetValue(symbol, out var v) ? v : symbol;

    public static string AmtlichTp(string symbol)
    {
        if (TpAmtlich.TryGetValue(symbol, out var v)) return v;
        var low = symbol.ToLowerInvariant();
        return TpAmtlich.TryGetValue(low, out var v2) ? v2 : low;
    }
}
