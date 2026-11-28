using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Dens;

public sealed class HkpImportError : Exception
{
    public HkpImportError(string message) : base(message) { }
}

/// <summary>Port von dens_hkp.py, dens_hkp_planr.py, dens_hkp_import.py und dens_hkp_encode.py.</summary>
public static class DensHkp
{
    public static readonly int[] FdiOrder =
        [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
         38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48];

    public static readonly HashSet<string> Fdi =
        Enumerable.Range(1, 4).SelectMany(q => Enumerable.Range(1, 8).Select(t => (q * 10 + t).ToString())).ToHashSet(StringComparer.Ordinal);

    public const int GozPunktwertRaw = 562421;
    public const decimal GozPunktwert = 0.0562421m;
    public const int LaborEigen = 0, LaborFremd1 = 1;
    const string LabSammel = "012 0";

    static readonly Dictionary<string, short> VersorgungCode = new(StringComparer.Ordinal)
        { ["regel"] = 0, ["gleichartig"] = 1, ["andersartig"] = 2 };

    static readonly Dictionary<int, string> Boni = new() { [60] = "60", [70] = "70", [75] = "75" };

    // --- Gemeinsame Byte-/Rundungshelfer ---
    public static void Put(byte[] buf, int offset, int width, string? text)
    {
        var raw = DensPfad.Cp1252Strict.GetBytes(text ?? "");
        Array.Clear(buf, offset, width);
        Array.Copy(raw, 0, buf, offset, Math.Min(raw.Length, width));
    }

    public static string B64(byte[] raw) => Convert.ToBase64String(raw);

    public static int Cents(decimal value) =>
        (int)Math.Round(Math.Round(value, 2, MidpointRounding.AwayFromZero) * 100m, 0, MidpointRounding.AwayFromZero);

    public static int Cents(double value) => Cents(DecFromDouble(value));

    public static int Away0(decimal value) => (int)Math.Round(value, 0, MidpointRounding.AwayFromZero);

    public static decimal DecFromDouble(double value) =>
        decimal.Parse(value.ToString(CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture);

    public static string BelLaborkuerzel(string? nr)
    {
        var text = (nr ?? "").Trim();
        if (text.Contains(' '))
        {
            var idx = text.IndexOf(' ');
            var dl = new string(text[..idx].Where(char.IsDigit).ToArray());
            var dr = new string(text[(idx + 1)..].Where(char.IsDigit).ToArray());
            if (dl.Length > 0)
            {
                var res = $"{(dl.Length > 3 ? dl[..3] : dl.PadLeft(3, '0'))} {(dr.Length > 0 ? dr[..1] : "0")}";
                return res.Length > 8 ? res[..8] : res;
            }
        }
        var digits = new string(text.Where(char.IsDigit).ToArray());
        if (digits.Length >= 4) return $"{digits[..3]} {digits[3]}";
        if (digits.Length > 0) return $"{digits.PadLeft(3, '0')} 0";
        return text.Length > 8 ? text[..8] : text;
    }

    // --- dens_hkp.py: AnnotateHkps ---
    static string Text(byte[] raw, int offset, int length) =>
        DensPfad.Cp1252.GetString(raw, offset, length).Split('\0')[0].Trim();

    public static Dictionary<string, object?> DecodePosition(string encoded)
    {
        var raw = Convert.FromBase64String(encoded);
        if (raw.Length != 106) throw new ArgumentException("Unbekannte DENS-Planposition.");
        var category = (int)BitConverter.ToInt16(raw, 88);
        var count = (int)BitConverter.ToInt16(raw, 46);
        var result = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["category"] = category,
            ["categoryLabel"] = category switch { 0 => "GOZ", 1 => "BEMA", 2 => "Zahnplanung", 3 => "Festzuschuss", _ => "Weitere Position" },
            ["region"] = Text(raw, 6, 32),
            ["code"] = Text(raw, 38, 8),
            ["count"] = count,
        };
        if (category == 0)
        {
            var unitCents = BitConverter.ToInt32(raw, 56);
            result["factor"] = BitConverter.ToInt32(raw, 48) / 100.0;
            result["points"] = (int)BitConverter.ToInt16(raw, 94);
            result["unitAmount"] = unitCents / 100.0;
            result["estimatedAmount"] = (double)Math.Round((decimal)unitCents * count / 100m, 2, MidpointRounding.ToEven);
        }
        else if (category == 1)
        {
            var points = BitConverter.ToInt32(raw, 56);
            var pv = BitConverter.ToInt32(raw, 48);
            result["points"] = points;
            result["pointValue"] = pv / 10000.0;
            var amount = (decimal)count * points * pv / 10000m;
            result["estimatedAmount"] = (double)Math.Round(amount, 2, MidpointRounding.AwayFromZero);
        }
        else if (category == 3)
        {
            result["baseAmount"] = BitConverter.ToInt32(raw, 56) / 100.0;
        }
        return result;
    }

    public static Dictionary<string, object?> DecodeLaboratory(Dictionary<string, object?> lab)
    {
        var dataStr = Convert.ToString(lab["data"]) ?? "";
        lab.Remove("data");
        var head = Convert.FromBase64String(dataStr);
        if (head.Length != 62) throw new ArgumentException("Unbekannte DENS-Laborplanung.");
        var surcharge = (int)BitConverter.ToInt16(head, 18);
        lab["surchargePercent"] = surcharge;
        var positions = new List<object?>();
        decimal net = 0;
        var taxes = new Dictionary<decimal, decimal>();
        foreach (var encoded in (List<object?>)lab["positions"]!)
        {
            var raw = Convert.FromBase64String(Convert.ToString(encoded)!);
            if (raw.Length != 72) throw new ArgumentException("Unbekannte DENS-Laborposition.");
            var count = (decimal)BitConverter.ToInt32(raw, 52) / 100m;
            var price = (decimal)BitConverter.ToInt32(raw, 60) / 100m;
            var amount = Math.Round(count * price, 2, MidpointRounding.AwayFromZero);
            var tax = (decimal)BitConverter.ToInt16(raw, 64) / 100m;
            positions.Add(new Dictionary<string, object?>
            {
                ["region"] = Text(raw, 12, 32), ["code"] = Text(raw, 44, 8),
                ["count"] = (double)count, ["unitPrice"] = (double)price,
                ["amount"] = (double)amount, ["taxPercent"] = (double)tax,
                ["lab"] = BitConverter.ToInt32(raw, 56),
            });
            net += amount;
            taxes[tax] = taxes.GetValueOrDefault(tax) + amount;
        }
        decimal vat = 0;
        foreach (var (rate, amt) in taxes) vat += Math.Round(amt * rate / 100m, 2, MidpointRounding.AwayFromZero);
        var gross = net + vat;
        var estimate = Math.Round(gross * (100 + surcharge) / 100m, 2, MidpointRounding.AwayFromZero);
        lab["positions"] = positions;
        lab["netAmount"] = (double)net;
        lab["vatAmount"] = (double)vat;
        lab["grossAmount"] = (double)gross;
        lab["estimatedAmount"] = (double)estimate;
        return lab;
    }

    static string DateAt(byte[] raw, int offset)
    {
        try { return new DateOnly(BitConverter.ToUInt16(raw, offset + 2), raw[offset + 1], raw[offset]).ToString("yyyy-MM-dd"); }
        catch (ArgumentOutOfRangeException) { return ""; }
    }

    public static void AnnotateHkps(Dictionary<string, object?> result)
    {
        if (!result.TryGetValue("hkps", out var hkpsObj) || hkpsObj is not List<object?> hkps) return;
        var befunde = result.TryGetValue("befunde", out var bObj) && bObj is List<object?> bl ? bl : new List<object?>();
        foreach (var item in hkps)
        {
            if (item is not Dictionary<string, object?> plan) continue;
            var raw = Convert.FromBase64String(Convert.ToString(plan["data"])!);
            plan.Remove("data");
            if (raw.Length != 674) throw new ArgumentException("Unbekannte DENS-Planstruktur.");
            var pt = BitConverter.ToInt16(raw, 62);
            plan["planType"] = pt == 0 ? "Privat" : pt == 2 ? "Regelversorgung" : "Andere Planart";
            plan["currency"] = BitConverter.ToInt16(raw, 130) == 2 ? "EUR" : "DM";
            var labCost = BitConverter.ToInt32(raw, 84) / 100.0;
            plan["estimatedLaboratoryCost"] = labCost;
            var subPct = BitConverter.ToInt16(raw, 88);
            plan["estimatedSubsidyPercent"] = subPct / 100.0;
            var st = BitConverter.ToInt16(raw, 132);
            plan["supplyType"] = st == 1 ? "gleichartig" : st == 2 ? "andersartig" : "regel";
            var posRaw = plan.TryGetValue("positions", out var po) && po is List<object?> pl ? pl : new List<object?>();
            var positions = posRaw.Select(v => (object?)DecodePosition(Convert.ToString(v)!)).ToList();
            plan["positions"] = positions;
            decimal gozFee = 0;
            var planned = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var p in positions.OfType<Dictionary<string, object?>>())
            {
                var cat = Convert.ToInt32(p["category"]);
                if (cat == 0) gozFee += DecFromDouble(Convert.ToDouble(p["estimatedAmount"]));
                else if (cat == 2) planned[Convert.ToString(p["region"]) ?? ""] = Convert.ToString(p["code"]) ?? "";
            }
            plan["estimatedGozFee"] = (double)gozFee;
            plan["estimatedBemaFee"] = (double)((decimal)BitConverter.ToInt32(raw, 80) / 100m - gozFee);
            var schema = new List<object?>();
            for (var i = 0; i < FdiOrder.Length; i++)
            {
                var n = FdiOrder[i];
                schema.Add(new Dictionary<string, object?>
                {
                    ["number"] = n,
                    ["finding"] = Text(raw, 418 + i * 4, 4),
                    ["regular"] = planned.TryGetValue(n.ToString(), out var reg) ? reg : "",
                    ["therapy"] = Text(raw, 248 + i * 5, 5),
                });
            }
            plan["toothSchema"] = schema;
            var approval = DateAt(raw, 156);
            plan["approvalDate"] = approval;
            var d172 = DateAt(raw, 172);
            var abgerechnet = BitConverter.ToInt32(raw, 116) != 0 || BitConverter.ToInt16(raw, 168) != 0 || d172.Length > 0;
            plan["billingDate"] = d172.Length > 0 ? d172 : (abgerechnet ? DateAt(raw, 56) : "");
            plan["status"] = abgerechnet ? "Abgerechnet" : approval.Length > 0 ? "Bewilligt" : "In Planung";
            plan["provider"] = Text(raw, 64, 6);
            plan["positionCount"] = positions.Count;
            var percent = (decimal)subPct / 10000m;
            decimal subsidy = 0;
            foreach (var p in positions.OfType<Dictionary<string, object?>>())
                if (Convert.ToInt32(p["category"]) == 3)
                    subsidy += Math.Round(DecFromDouble(Convert.ToDouble(p["baseAmount"])) * percent, 2, MidpointRounding.AwayFromZero) * Convert.ToInt32(p["count"]);
            var total = (decimal)(BitConverter.ToInt32(raw, 80) + BitConverter.ToInt32(raw, 84)) / 100m;
            plan["estimatedTotal"] = (double)total;
            plan["estimatedSubsidy"] = (double)subsidy;
            plan["estimatedPatientShare"] = (double)(total - subsidy);
            if (plan.TryGetValue("laboratory", out var labObj) && labObj is Dictionary<string, object?> lab)
            {
                DecodeLaboratory(lab);
                if (Convert.ToDouble(lab["estimatedAmount"]) != labCost)
                    throw new ArgumentException("Laborplanung und HKP-Kostenschätzung stimmen nicht überein.");
            }
            var planNr = Convert.ToInt32(plan["number"]);
            plan["planFindings"] = befunde.OfType<Dictionary<string, object?>>()
                .Where(r => Convert.ToInt32(r.GetValueOrDefault("kind") ?? 0) == 3 && Convert.ToInt32(r.GetValueOrDefault("planNumber") ?? 0) == planNr)
                .Select(r => r["number"]).ToList();
        }
    }

    // --- dens_hkp_planr.py: PlanrAusDens ---
    static string BelNummer(string? code)
    {
        var digits = new string((code ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length == 0) return "";
        return digits.Length >= 4 ? digits[..4] : digits.PadRight(4, '0');
    }

    static string RegionAusDens(string? text)
    {
        var t = (text ?? "").Trim();
        return t.Equals("plan", StringComparison.OrdinalIgnoreCase) ? "" : t;
    }

    static Dictionary<string, object?> PlanrPatient(Dictionary<string, object?> p)
    {
        var title = Convert.ToString(p.GetValueOrDefault("title")) ?? "";
        return new Dictionary<string, object?>
        {
            ["anrede"] = title is "Frau" or "Herr" ? title : "",
            ["vorname"] = Convert.ToString(p.GetValueOrDefault("firstName")) ?? "",
            ["name"] = Convert.ToString(p.GetValueOrDefault("lastName")) ?? "",
            ["geburtsdatum"] = Convert.ToString(p.GetValueOrDefault("birthDate")) ?? "",
            ["strasse"] = Convert.ToString(p.GetValueOrDefault("street")) ?? "",
            ["plz"] = Convert.ToString(p.GetValueOrDefault("postalCode")) ?? "",
            ["ort"] = Convert.ToString(p.GetValueOrDefault("city")) ?? "",
            ["kasse"] = Convert.ToString(p.GetValueOrDefault("insurance")) ?? "",
            ["kassenNr"] = Convert.ToString(p.GetValueOrDefault("insuranceIk")) ?? "",
            ["versichertenNr"] = Convert.ToString(p.GetValueOrDefault("insuranceNumber")) ?? "",
        };
    }

    public static Dictionary<string, object?> PlanrAusDens(Dictionary<string, object?> patient, Dictionary<string, object?> plan)
    {
        var hinweise = new List<string>();
        var zaehne = new Dictionary<string, object?>(StringComparer.Ordinal);
        var schema = plan.TryGetValue("toothSchema", out var tsObj) && tsObj is List<object?> tsl ? tsl.OfType<Dictionary<string, object?>>().ToList() : [];
        var ohneTp = !schema.Any(row => !string.IsNullOrEmpty(Convert.ToString(row.GetValueOrDefault("therapy"))));
        var rohTherapie = new Dictionary<int, string>();
        var rohBefund = new Dictionary<int, string>();
        foreach (var row in schema)
        {
            if (!int.TryParse(Convert.ToString(row.GetValueOrDefault("number")), out var n)) continue;
            rohBefund[n] = Convert.ToString(row.GetValueOrDefault("finding")) ?? "";
            rohTherapie[n] = Convert.ToString(row.GetValueOrDefault("therapy")) ?? "";
        }
        foreach (var row in schema)
        {
            var befund = Convert.ToString(row.GetValueOrDefault("finding")) ?? "";
            var regel = DensKuerzel.AmtlichR(Convert.ToString(row.GetValueOrDefault("regular")) ?? "");
            var nummer = Convert.ToString(row["number"]) ?? "";
            var therapie = regel;
            if (!ohneTp && int.TryParse(nummer, out var n))
            {
                var roh = rohTherapie.GetValueOrDefault(n, "");
                var implantat = roh.Trim().ToLowerInvariant() == "zab" && DensKuerzel.ImplantatGlied(n, rohBefund.GetValueOrDefault(n, ""), rohTherapie);
                therapie = DensKuerzel.AmtlichTp(DensKuerzel.PlanungNachAmtlich(roh, implantat));
            }
            if (befund.Length > 0 || regel.Length > 0 || therapie.Length > 0)
                zaehne[nummer] = new Dictionary<string, object?> { ["B"] = befund, ["R"] = regel, ["TP"] = therapie };
        }
        var positionen = new List<Dictionary<string, object?>>();
        var befunde = new List<Dictionary<string, object?>>();
        var weitere = 0;
        var posList = plan.TryGetValue("positions", out var pObj) && pObj is List<object?> pl ? pl.OfType<Dictionary<string, object?>>().ToList() : [];
        for (var i = 0; i < posList.Count; i++)
        {
            var pos = posList[i];
            var cat = Convert.ToInt32(pos["category"]);
            var cnt = Convert.ToInt32(pos["count"]);
            if (cnt == 0) cnt = 1;
            if (cat == 1)
                positionen.Add(new Dictionary<string, object?> { ["id"] = $"dens-{i + 1}", ["ebene"] = "BEMA", ["nr"] = pos["code"], ["zahn"] = RegionAusDens(Convert.ToString(pos.GetValueOrDefault("region"))), ["anzahl"] = cnt });
            else if (cat == 0)
            {
                var fac = pos.TryGetValue("factor", out var fv) && fv is not null ? Convert.ToDouble(fv) : 0;
                positionen.Add(new Dictionary<string, object?> { ["id"] = $"dens-{i + 1}", ["ebene"] = "GOZ", ["nr"] = pos["code"], ["zahn"] = RegionAusDens(Convert.ToString(pos.GetValueOrDefault("region"))), ["anzahl"] = cnt, ["faktor"] = fac == 0 ? 2.3 : fac });
            }
            else if (cat == 3)
                befunde.Add(new Dictionary<string, object?> { ["id"] = $"dens-fz-{i + 1}", ["nr"] = pos["code"], ["zahnGebiet"] = RegionAusDens(Convert.ToString(pos.GetValueOrDefault("region"))), ["anzahl"] = cnt });
            else if (cat != 2) weitere++;
        }
        var labPositions = plan.TryGetValue("laboratory", out var lObj) && lObj is Dictionary<string, object?> labDict
            && labDict.TryGetValue("positions", out var lpObj) && lpObj is List<object?> lpl
            ? lpl.OfType<Dictionary<string, object?>>().ToList() : [];
        for (var i = 0; i < labPositions.Count; i++)
        {
            var pos = labPositions[i];
            var code = (Convert.ToString(pos.GetValueOrDefault("code")) ?? "").Trim();
            var cnt = pos.TryGetValue("count", out var cv) && cv is not null ? Convert.ToDouble(cv) : 0;
            var zeile = new Dictionary<string, object?>
            {
                ["id"] = $"dens-lab-{i + 1}",
                ["zahn"] = RegionAusDens(Convert.ToString(pos.GetValueOrDefault("region"))),
                ["anzahl"] = cnt == 0 ? 1 : cnt,
                ["labor"] = Convert.ToInt32(pos.GetValueOrDefault("lab") ?? 1) == 0 ? "eigen" : "fremd",
            };
            if (Regex.IsMatch(code, @"^(?:BEB|ITZ)\w{4}$"))
            {
                zeile["ebene"] = "BEB";
                zeile["nr"] = code[3..];
                positionen.Add(zeile);
            }
            else if (Regex.IsMatch(code, @"^\d{3} \d$"))
            {
                zeile["ebene"] = "BEL";
                zeile["nr"] = BelNummer(code);
                positionen.Add(zeile);
            }
            else if (code.Length > 0)
            {
                zeile["ebene"] = "MAT";
                zeile["nr"] = "";
                zeile["preis"] = pos.TryGetValue("unitPrice", out var up) && up is not null ? Convert.ToDouble(up) : 0;
                zeile["text"] = $"Material DENS {code}";
                positionen.Add(zeile);
            }
        }
        if (weitere > 0)
            hinweise.Add($"{weitere} DENS-Position(en) außerhalb von BEMA/Planung/Festzuschuss nicht übernommen.");
        var prozent = (int)Math.Round(Convert.ToDouble(plan.GetValueOrDefault("estimatedSubsidyPercent") ?? 0), MidpointRounding.ToEven);
        var bonus = Boni.TryGetValue(prozent, out var bv) ? bv : "60";
        if (!Boni.ContainsKey(prozent)) hinweise.Add($"Bonus {prozent} % aus DENS unbekannt – 60 % angenommen.");
        var planType = Convert.ToString(plan.GetValueOrDefault("planType")) ?? "";
        if (planType != "Regelversorgung") hinweise.Add($"DENS-Planart „{planType}“ – in PlanR prüfen.");
        foreach (var row in positionen.Concat(befunde)) row["auto"] = true;
        var planOut = new Dictionary<string, object?>(StringComparer.Ordinal);
        var supply = Convert.ToString(plan.GetValueOrDefault("supplyType")) ?? "";
        if (supply is "gleichartig" or "andersartig") planOut["versorgungsart"] = supply;
        var labore = positionen.Where(x => Convert.ToString(x["ebene"]) is "BEL" or "BEB" or "MAT").Select(x => Convert.ToString(x["labor"])).ToHashSet();
        if (labore.Count == 1 && labore.Contains("eigen"))
            planOut["einstellungen"] = new Dictionary<string, object?> { ["labor"] = "praxis" };
        planOut["patient"] = PlanrPatient(patient);
        planOut["verwaltung"] = new Dictionary<string, object?>
        {
            ["ausstellungsdatum"] = Convert.ToString(plan.GetValueOrDefault("date")) ?? "",
            ["erlaeuterung"] = Convert.ToString(plan.GetValueOrDefault("description")) ?? "",
        };
        planOut["zaehne"] = zaehne;
        planOut["positionen"] = positionen.Cast<object?>().ToList();
        planOut["befunde"] = befunde.Cast<object?>().ToList();
        planOut["zuschuss"] = new Dictionary<string, object?> { ["bonus"] = bonus, ["haertefall"] = false };
        return new Dictionary<string, object?>
        {
            ["plan"] = planOut,
            ["densPlan"] = new Dictionary<string, object?>
            {
                ["number"] = plan["number"],
                ["date"] = Convert.ToString(plan.GetValueOrDefault("date")) ?? "",
                ["description"] = Convert.ToString(plan.GetValueOrDefault("description")) ?? "",
                ["planType"] = planType,
            },
            ["hinweise"] = hinweise,
        };
    }

    // --- dens_hkp_import.py: ParsePlanrHkp ---
    public static double GozEinzelbetrag(int points, double factor) =>
        (double)Math.Round((decimal)points * GozPunktwert * DecFromDouble(factor), 2, MidpointRounding.AwayFromZero);

    static double Num(JsonElement el, string label, double minimum = 0, double maximum = 999999.99)
    {
        if (el.ValueKind != JsonValueKind.Number || !el.TryGetDouble(out var val) || !double.IsFinite(val) || val < minimum || val > maximum)
            throw new HkpImportError($"{label} ist ungültig.");
        return Math.Round(val, 2, MidpointRounding.ToEven);
    }

    static double NumObj(double val, string label, double minimum = 0, double maximum = 999999.99)
    {
        if (!double.IsFinite(val) || val < minimum || val > maximum)
            throw new HkpImportError($"{label} ist ungültig.");
        return Math.Round(val, 2, MidpointRounding.ToEven);
    }

    static bool Prop(JsonElement obj, string name, out JsonElement val)
    {
        if (obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out val)) return true;
        val = default;
        return false;
    }

    static bool PropNotNull(JsonElement obj, string name, out JsonElement val) =>
        Prop(obj, name, out val) && val.ValueKind != JsonValueKind.Null;

    static List<string> SymbolHinweise(Dictionary<string, Dictionary<string, string>> teeth, string versorgung)
    {
        var ohneR = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var ohneTp = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var (tooth, row) in teeth)
        {
            var r = row["R"];
            if (r.Length > 0 && DensKuerzel.RSymbol(r).Length == 0)
            {
                var k = r.ToUpperInvariant();
                if (!ohneR.TryGetValue(k, out var l)) ohneR[k] = l = [];
                l.Add(tooth);
            }
            if (versorgung != "regel")
            {
                var code = row.TryGetValue("planung", out var pl) ? pl : (row["TP"].Length > 0 ? row["TP"] : r);
                if (code.Length > 0 && DensKuerzel.TpSymbol(code, versorgung).Length == 0)
                {
                    var k = code.ToUpperInvariant();
                    if (!ohneTp.TryGetValue(k, out var l)) ohneTp[k] = l = [];
                    l.Add(tooth);
                }
            }
        }
        var outList = new List<string>();
        foreach (var (sym, z) in ohneR)
            outList.Add($"DENS führt in der Regelversorgung kein Symbol {sym} – die Zeile R bleibt bei Zahn {string.Join(", ", z)} leer.");
        foreach (var (sym, z) in ohneTp)
            outList.Add($"DENS führt kein Plansymbol {sym} – die Zeile TP bleibt bei Zahn {string.Join(", ", z)} leer.");
        return outList;
    }

    // DENS legt jede Leistung als eigenen Satz an. Ein digitaler Eigenlabor-Plan
    // (BEB je Krone) liegt weit über 100 Zeilen; 64 KB reichen dafür nicht.
    const int MaxHkpBytes = 262144;
    const int MaxHkpPositionen = 500;

    public static Dictionary<string, object?> ParsePlanrHkp(string text)
    {
        if (string.IsNullOrWhiteSpace(text) || Encoding.UTF8.GetByteCount(text) > MaxHkpBytes)
            throw new HkpImportError("HKP-JSON ist leer oder zu groß.");
        JsonDocument doc;
        try { doc = JsonDocument.Parse(text); }
        catch (JsonException) { throw new HkpImportError("Ungültiges HKP-JSON."); }
        using var _ = doc;
        var data = doc.RootElement;
        if (data.ValueKind != JsonValueKind.Object) throw new HkpImportError("Ungültiges HKP-JSON.");
        if (!Prop(data, "verwaltung", out var administration) || !Prop(data, "ergebnis", out var result)
            || !Prop(data, "positionen", out var positions) || !Prop(result, "summen", out var amounts)
            || administration.ValueKind != JsonValueKind.Object || result.ValueKind != JsonValueKind.Object || positions.ValueKind != JsonValueKind.Array)
            throw new HkpImportError("HKP-JSON enthält keine unterstützten Planfelder.");
        var positionsAnzahl = positions.GetArrayLength();
        if (positionsAnzahl < 1)
            throw new HkpImportError("HKP-JSON enthält keine unterstützten Planpositionen.");
        if (positionsAnzahl > MaxHkpPositionen)
            throw new HkpImportError($"HKP-JSON enthält {positionsAnzahl} Planpositionen. Der DENS-Connector übernimmt höchstens {MaxHkpPositionen}.");
        var versorgung = PropNotNull(result, "versorgungsart", out var vEl) && vEl.ValueKind == JsonValueKind.String && vEl.GetString() is { Length: > 0 } vs ? vs : "regel";
        if (versorgung is not ("regel" or "gleichartig" or "andersartig"))
            throw new HkpImportError("Versorgungsart ist ungültig.");

        JsonElement zuschuss = default;
        if (PropNotNull(data, "zuschuss", out var zEl))
        {
            if (zEl.ValueKind != JsonValueKind.Object) throw new HkpImportError("HKP-JSON enthält keinen gültigen Bonuswert.");
            zuschuss = zEl;
        }
        if (zuschuss.ValueKind == JsonValueKind.Object && PropNotNull(zuschuss, "haertefall", out var hf)
            && ((hf.ValueKind == JsonValueKind.True) || (hf.ValueKind == JsonValueKind.Number && hf.GetDouble() != 0) || (hf.ValueKind == JsonValueKind.String && hf.GetString()!.Length > 0)))
            throw new HkpImportError("Härtefall-HKPs werden vom DENS-Connector derzeit nicht übernommen.");

        double bonus;
        try
        {
            if (zuschuss.ValueKind != JsonValueKind.Object || !Prop(zuschuss, "bonus", out var bEl))
                throw new HkpImportError("Bonus fehlt.");
            var bv = bEl.ValueKind == JsonValueKind.Number ? bEl.GetDouble()
                : bEl.ValueKind == JsonValueKind.String ? double.Parse(bEl.GetString()!, NumberStyles.Float, CultureInfo.InvariantCulture)
                : throw new HkpImportError("Bonus ungültig.");
            bonus = NumObj(bv, "Bonus", 0, 100);
        }
        catch { throw new HkpImportError("HKP-JSON enthält keinen gültigen Bonuswert."); }
        if (bonus is not (60 or 70 or 75))
            throw new HkpImportError("Bonus muss 60, 70 oder 75 Prozent sein.");

        string date;
        double bemaHonorar, gozHonorar, material, total, subsidy, subsidy100, patientShare;
        try
        {
            if (!Prop(administration, "ausstellungsdatum", out var adEl) || adEl.ValueKind != JsonValueKind.String)
                throw new HkpImportError("Datum fehlt.");
            date = DateOnly.ParseExact(adEl.GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture).ToString("yyyy-MM-dd");
            bemaHonorar = Num(amounts.GetProperty("bemaHonorar"), "BEMA-Honorar");
            gozHonorar = Prop(amounts, "gozHonorar", out var gh) ? Num(gh, "GOZ-Honorar") : 0;
            material = Num(amounts.GetProperty("materialUndLabor"), "Material- und Laborkosten");
            total = Num(amounts.GetProperty("gesamt"), "Gesamtsumme");
            subsidy = Num(amounts.GetProperty("festzuschuss"), "Festzuschuss");
            subsidy100 = Prop(amounts, "festzuschuss100", out var s100) ? Num(s100, "Festzuschuss 100 Prozent") : NumObj(subsidy * 100.0 / bonus, "Festzuschuss 100 Prozent");
            patientShare = Num(amounts.GetProperty("eigenanteil"), "Eigenanteil");
        }
        catch { throw new HkpImportError("HKP-JSON enthält keine gültigen Summen oder kein Ausstellungsdatum."); }

        if (Math.Abs((subsidy + patientShare) - total) > 0.02)
            throw new HkpImportError("Gesamtsumme, Festzuschuss und Eigenanteil stimmen nicht überein.");
        if (Math.Abs(subsidy100 * bonus / 100.0 - subsidy) > 0.05)
            throw new HkpImportError("Festzuschuss und Bonuswert stimmen nicht überein.");

        var calc = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (Prop(result, "positionen", out var resPos) && resPos.ValueKind == JsonValueKind.Array)
            foreach (var rp in resPos.EnumerateArray())
                if (rp.ValueKind == JsonValueKind.Object && PropNotNull(rp, "id", out var idEl))
                    calc[idEl.ValueKind == JsonValueKind.String ? idEl.GetString()! : idEl.GetRawText()] = rp;

        var importedPos = new List<Dictionary<string, object?>>();
        var gozPos = new List<Dictionary<string, object?>>();
        var labPos = new List<Dictionary<string, object?>>();
        var index = 0;
        foreach (var item in positions.EnumerateArray())
        {
            index++;
            if (item.ValueKind != JsonValueKind.Object) throw new HkpImportError($"Position {index} ist ungültig.");
            var level = PropNotNull(item, "ebene", out var lvEl) && lvEl.ValueKind == JsonValueKind.String ? lvEl.GetString() : null;
            if (level is not ("BEMA" or "GOZ" or "BEL" or "BEB" or "MAT"))
                throw new HkpImportError($"Position {index} ist ungültig.");
            string nr;
            if (level == "MAT" && (!Prop(item, "nr", out var nrEl) || nrEl.ValueKind == JsonValueKind.Null || (nrEl.ValueKind == JsonValueKind.String && nrEl.GetString() == "")))
                nr = "";
            else if (Prop(item, "nr", out var nrEl2) && nrEl2.ValueKind == JsonValueKind.String && Regex.IsMatch(nrEl2.GetString()!, @"^[0-9A-Za-z./-]{1,8}$"))
                nr = nrEl2.GetString()!;
            else throw new HkpImportError($"Position {index} hat ungültige Nummer.");

            var textVal = "";
            if (PropNotNull(item, "bezeichnung", out var bezEl))
            {
                if (bezEl.ValueKind != JsonValueKind.String) throw new HkpImportError($"Bezeichnung Position {index} ist ungültig.");
                textVal = bezEl.GetString()!;
            }
            JsonElement calculated = default;
            var hasCalc = PropNotNull(item, "id", out var pidEl) && calc.TryGetValue(pidEl.ValueKind == JsonValueKind.String ? pidEl.GetString()! : pidEl.GetRawText(), out calculated);

            if (Prop(item, "anzahl", out var mEl) && mEl.ValueKind == JsonValueKind.Number && mEl.GetDouble() == 0)
            {
                var betrZero = hasCalc && Prop(calculated, "betrag", out var cb) ? (cb.ValueKind == JsonValueKind.Number && cb.GetDouble() == 0)
                    : (!Prop(item, "betrag", out var ib) || (ib.ValueKind == JsonValueKind.Number && ib.GetDouble() == 0));
                if (betrZero) continue;
            }
            if (!Prop(item, "anzahl", out var anzahlEl)) throw new HkpImportError($"Anzahl Position {index} ist ungültig.");
            var count = Num(anzahlEl, $"Anzahl Position {index}", 0.01, 99);
            var tooth = "";
            if (Prop(item, "zahn", out var tEl))
            {
                if (tEl.ValueKind != JsonValueKind.String || tEl.GetString()!.Length > 30)
                    throw new HkpImportError($"Zahnangabe Position {index} ist ungültig.");
                tooth = tEl.GetString()!;
            }
            double amount;
            if (hasCalc && Prop(calculated, "betrag", out var cbEl)) amount = Num(cbEl, $"Betrag Position {index}");
            else if (Prop(item, "betrag", out var ibEl)) amount = Num(ibEl, $"Betrag Position {index}");
            else amount = 0;

            double price;
            if (hasCalc && Prop(calculated, "einzelpreis", out var cpEl)) price = Num(cpEl, $"Einzelpreis Position {index}");
            else if (Prop(item, "einzelpreis", out var ipEl)) price = Num(ipEl, $"Einzelpreis Position {index}");
            else price = NumObj(count != 0 ? amount / count : 0, $"Einzelpreis Position {index}");

            double? points = null;
            if (hasCalc && PropNotNull(calculated, "punkte", out var pkEl))
                points = Num(pkEl, $"Punkte Position {index}", 0, 9999);

            string? lab = null;
            if (hasCalc && PropNotNull(calculated, "labor", out var clEl) && clEl.ValueKind == JsonValueKind.String && clEl.GetString()!.Length > 0)
                lab = clEl.GetString();
            else if (PropNotNull(item, "labor", out var ilEl))
                lab = ilEl.ValueKind == JsonValueKind.String ? (ilEl.GetString()!.Length > 0 ? ilEl.GetString() : null) : "INVALID";
            if (lab is not (null or "eigen" or "fremd"))
                throw new HkpImportError($"Labor Position {index} ist ungültig.");

            var trimmed = textVal.Trim();
            if (trimmed.Length > 200) trimmed = trimmed[..200];
            var row = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["level"] = level, ["number"] = nr, ["count"] = count, ["tooth"] = tooth,
                ["amount"] = amount, ["price"] = price, ["points"] = points, ["lab"] = lab, ["text"] = trimmed,
            };
            if (level == "BEMA")
            {
                if (points is null or 0)
                    throw new HkpImportError($"BEMA {nr}: Punktzahl fehlt – DENS würde die Leistung mit 0 € anlegen.");
                if (hasCalc && PropNotNull(calculated, "punktwert", out var pwEl))
                {
                    Num(pwEl, $"Punktwert BEMA {nr}", 0.01, 10);
                    row["pointValue"] = Math.Round(pwEl.GetDouble(), 4, MidpointRounding.ToEven);
                }
                importedPos.Add(row);
            }
            else if (level == "GOZ")
            {
                if (points is null || points.Value != Math.Truncate(points.Value) || points.Value < 1)
                    throw new HkpImportError($"GOZ {nr}: Punktzahl fehlt – ohne GOZ-Punkte kann DENS den Betrag nicht berechnen.");
                if (count != Math.Truncate(count))
                    throw new HkpImportError($"GOZ {nr}: Anzahl {count.ToString(CultureInfo.InvariantCulture)} – DENS führt nur ganze Anzahlen.");
                if (!hasCalc || !Prop(calculated, "faktor", out var fEl))
                    throw new HkpImportError($"Faktor GOZ {nr} ist ungültig.");
                var factor = Num(fEl, $"Faktor GOZ {nr}", 0.01, 10);
                if (Math.Abs(GozEinzelbetrag((int)points.Value, factor) - price) > 0.011)
                    throw new HkpImportError($"GOZ {nr}: Einzelbetrag {price.ToString("F2", CultureInfo.InvariantCulture)} € passt nicht zu {(int)points.Value} Punkten × Faktor {factor.ToString("F2", CultureInfo.InvariantCulture)} – DENS rechnet GOZ nur über Punkte und Faktor (manuellen Preis in PlanR entfernen).");
                row["points"] = (int)points.Value;
                row["factor"] = factor;
                gozPos.Add(row);
            }
            else
            {
                if (level == "MAT" && lab is null) row["lab"] = "eigen";
                if (level == "BEB" && Prop(item, "eigen", out var eEl) && eEl.ValueKind == JsonValueKind.String)
                    row["eigen"] = eEl.GetString();
                labPos.Add(row);
            }
        }
        if (importedPos.Count == 0 && gozPos.Count == 0)
            throw new HkpImportError("Mindestens eine BEMA- oder GOZ-Position ist erforderlich.");
        if (versorgung == "regel" && gozPos.Count > 0)
            throw new HkpImportError("GOZ-Positionen bei Regelversorgung – Versorgungsart in PlanR prüfen.");
        if (Math.Abs(gozPos.Sum(p => Convert.ToDouble(p["amount"])) - gozHonorar) > 0.02)
            throw new HkpImportError("GOZ-Positionen und GOZ-Honorar stimmen nicht überein.");
        var bemaDens = importedPos.Sum(p => p.TryGetValue("pointValue", out var pv) && pv is double pvd && pvd != 0
            ? Math.Round(Convert.ToDouble(p["points"]) * Convert.ToDouble(p["count"]) * pvd, 2, MidpointRounding.ToEven)
            : Convert.ToDouble(p["amount"]));
        if (Math.Abs(bemaDens - bemaHonorar) > 0.02 + 0.01 * importedPos.Count)
            throw new HkpImportError($"BEMA-Punkte × Punktwert ergeben {bemaDens.ToString("F2", CultureInfo.InvariantCulture)} €, das BEMA-Honorar {bemaHonorar.ToString("F2", CultureInfo.InvariantCulture)} € – Punktwert in PlanR prüfen.");

        var teeth = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        if (PropNotNull(data, "zaehne", out var teethIn))
        {
            if (teethIn.ValueKind != JsonValueKind.Object) throw new HkpImportError("Zahnstatus im HKP-JSON ist ungültig.");
            foreach (var prop in teethIn.EnumerateObject())
            {
                if (!Fdi.Contains(prop.Name)) throw new HkpImportError($"Zahnnummer {prop.Name} ist ungültig.");
                if (prop.Value.ValueKind != JsonValueKind.Object) throw new HkpImportError($"Zahnstatus {prop.Name} ist ungültig.");
                try
                {
                    object? GetVal(string k) => Prop(prop.Value, k, out var v) ? (v.ValueKind == JsonValueKind.Null ? "" : v.ValueKind == JsonValueKind.String ? v.GetString() : (object)1) : "";
                    var b = DensKuerzel.BefundKasse(GetVal("B"));
                    var r = DensKuerzel.PlanHuk(GetVal("R"));
                    var tp = DensKuerzel.PlanHuk(GetVal("TP"));
                    string? planung = Prop(prop.Value, "planung", out var plEl) ? DensKuerzel.PlanHuk(plEl.ValueKind == JsonValueKind.Null ? "" : plEl.ValueKind == JsonValueKind.String ? plEl.GetString() : (object)1) : null;
                    if (b.Length > 0 || r.Length > 0 || tp.Length > 0)
                    {
                        var td = new Dictionary<string, string>(StringComparer.Ordinal) { ["B"] = b, ["R"] = r, ["TP"] = tp };
                        if (planung is not null) td["planung"] = planung;
                        teeth[prop.Name] = td;
                    }
                }
                catch (KuerzelError exc) { throw new HkpImportError(exc.Message); }
            }
        }

        JsonElement befundeSrc = default;
        if (Prop(result, "befunde", out var rb) && rb.ValueKind == JsonValueKind.Array && rb.GetArrayLength() > 0) befundeSrc = rb;
        else if (Prop(data, "befunde", out var db) && db.ValueKind == JsonValueKind.Array && db.GetArrayLength() > 0) befundeSrc = db;
        else if (PropNotNull(result, "befunde", out var rb2) && rb2.ValueKind != JsonValueKind.Array) throw new HkpImportError("Festzuschuss-Befunde sind ungültig.");
        else if (PropNotNull(data, "befunde", out var db2) && db2.ValueKind != JsonValueKind.Array) throw new HkpImportError("Festzuschuss-Befunde sind ungültig.");

        var befunde = new List<Dictionary<string, object?>>();
        if (befundeSrc.ValueKind == JsonValueKind.Array)
        {
            var sumAnz = 0;
            foreach (var it in befundeSrc.EnumerateArray())
                if (it.ValueKind == JsonValueKind.Object)
                    sumAnz += PropNotNull(it, "anzahl", out var ae) && ae.TryGetDouble(out var ad) ? (int)ad : 1;
            var bi = 0;
            foreach (var item in befundeSrc.EnumerateArray())
            {
                bi++;
                if (item.ValueKind != JsonValueKind.Object) throw new HkpImportError($"Festzuschuss {bi} ist ungültig.");
                if (!Prop(item, "nr", out var nrEl) || nrEl.ValueKind != JsonValueKind.String || !Regex.IsMatch(nrEl.GetString()!, @"^[0-9]{1,2}\.[0-9]{1,2}$"))
                    throw new HkpImportError($"Festzuschuss {bi} hat ungültige Nummer.");
                var count = Prop(item, "anzahl", out var ae) ? (int)Num(ae, $"Anzahl Festzuschuss {bi}", 1, 99) : 1;
                string tooth;
                if (PropNotNull(item, "zahnGebiet", out var zg) && !(zg.ValueKind == JsonValueKind.String && zg.GetString() == ""))
                {
                    if (zg.ValueKind != JsonValueKind.String) throw new HkpImportError($"Festzuschuss {bi} hat ungültiges Zahngebiet.");
                    tooth = zg.GetString()!;
                }
                else if (PropNotNull(item, "zahn", out var zz) && !(zz.ValueKind == JsonValueKind.String && zz.GetString() == ""))
                {
                    if (zz.ValueKind != JsonValueKind.String) throw new HkpImportError($"Festzuschuss {bi} hat ungültiges Zahngebiet.");
                    tooth = zz.GetString()!;
                }
                else tooth = "OK";

                double? baseVal = null;
                if (PropNotNull(item, "betrag100", out var b100) && b100.TryGetDouble(out var b100d)) baseVal = b100d / count;
                if (baseVal is null && PropNotNull(item, "einzelbetrag", out var eb) && eb.TryGetDouble(out var ebd)) baseVal = ebd;
                if (baseVal is null && PropNotNull(item, "betrag", out var bt) && bt.TryGetDouble(out var btd)) baseVal = btd / count;
                baseVal ??= subsidy100 / Math.Max(sumAnz, 1);
                befunde.Add(new Dictionary<string, object?>
                {
                    ["number"] = nrEl.GetString()!, ["count"] = count, ["tooth"] = tooth,
                    ["baseAmount"] = NumObj(baseVal.Value, $"Festzuschuss {bi}"),
                });
            }
        }

        var pointValue = 0.0;
        foreach (var pos in importedPos)
        {
            if (pos.TryGetValue("pointValue", out var pv) && pv is double pvd && pvd != 0) { pointValue = pvd; break; }
            var pts = Convert.ToDouble(pos["points"] ?? 0);
            var cnt = Convert.ToDouble(pos["count"] ?? 0);
            var amt = Convert.ToDouble(pos["amount"] ?? 0);
            if (pts != 0 && cnt != 0 && amt != 0) { pointValue = amt / (pts * cnt); break; }
        }

        return new Dictionary<string, object?>
        {
            ["date"] = date, ["bonusPercent"] = bonus, ["versorgungsart"] = versorgung,
            ["bemaHonorar"] = bemaHonorar, ["gozHonorar"] = gozHonorar, ["materialUndLabor"] = material,
            ["total"] = total, ["subsidy"] = subsidy, ["patientShare"] = patientShare,
            ["positions"] = importedPos, ["gozPositions"] = gozPos, ["labPositions"] = labPos,
            ["teeth"] = teeth, ["befunde"] = befunde, ["pointValue"] = pointValue,
            ["description"] = $"PlanR {date}", ["hinweise"] = SymbolHinweise(teeth, versorgung),
        };
    }

    // --- dens_hkp_encode.py: EncodeHkpBundle ---
    static string Region(string? tooth)
    {
        var t = (tooth ?? "").Trim();
        if (t.Length == 0) return "Plan";
        if (t is "OK" or "UK") return t;
        if (t == "OK,UK") return "OK";
        return t.Length > 32 ? t[..32] : t;
    }

    public static string EncodeService(short category, string region, string code, int count,
        int points = 0, double pointValue = 0, int factor = 100, int baseCents = 0, int planFlag = 0)
    {
        var raw = new byte[106];
        Put(raw, 6, 32, region);
        Put(raw, 38, 8, code);
        BitConverter.GetBytes((short)count).CopyTo(raw, 46);
        if (category == 1)
        {
            BitConverter.GetBytes((int)Math.Round(pointValue * 10000.0, MidpointRounding.ToEven)).CopyTo(raw, 48);
            BitConverter.GetBytes(factor).CopyTo(raw, 52);
            BitConverter.GetBytes(points).CopyTo(raw, 56);
            BitConverter.GetBytes(planFlag).CopyTo(raw, 60);
            BitConverter.GetBytes((short)-1).CopyTo(raw, 68);
        }
        else if (category == 0)
        {
            BitConverter.GetBytes(factor).CopyTo(raw, 48);
            BitConverter.GetBytes(baseCents).CopyTo(raw, 56);
            BitConverter.GetBytes(1).CopyTo(raw, 64);
            BitConverter.GetBytes((short)points).CopyTo(raw, 94);
            BitConverter.GetBytes((short)1).CopyTo(raw, 96);
        }
        else if (category == 2)
        {
            BitConverter.GetBytes(1).CopyTo(raw, 52);
        }
        else if (category == 3)
        {
            BitConverter.GetBytes(100).CopyTo(raw, 52);
            BitConverter.GetBytes(baseCents).CopyTo(raw, 56);
        }
        BitConverter.GetBytes(category).CopyTo(raw, 88);
        return B64(raw);
    }

    static string EncodeLabService(string region, string code, double count, double unitPriceEuros, int lab = LaborFremd1)
    {
        var raw = new byte[72];
        Put(raw, 12, 32, region);
        Put(raw, 44, 8, code);
        BitConverter.GetBytes((int)Math.Round(DecFromDouble(count) * 100m, 0, MidpointRounding.ToEven)).CopyTo(raw, 52);
        BitConverter.GetBytes(lab).CopyTo(raw, 56);
        BitConverter.GetBytes(Cents(unitPriceEuros)).CopyTo(raw, 60);
        BitConverter.GetBytes((short)700).CopyTo(raw, 64);
        return B64(raw);
    }

    public static int LabEstimateCents(List<string> labServicesB64, int surchargePercent = 0)
    {
        decimal net = 0;
        foreach (var encoded in labServicesB64)
        {
            var raw = Convert.FromBase64String(encoded);
            net += (decimal)BitConverter.ToInt32(raw, 52) * BitConverter.ToInt32(raw, 60) / 100m;
        }
        var tax = Away0(net * 0.07m);
        return Away0((net + tax) * (100 + surchargePercent) / 100m);
    }

    static (List<string> Services, int Estimate, short Surcharge) LabForTarget(int targetCents, List<Dictionary<string, object?>> positions)
    {
        short surcharge = 0;
        if (positions.Count > 0)
        {
            var services = positions.Select(p => EncodeLabService(
                Region(Convert.ToString(p.GetValueOrDefault("tooth"))),
                Convert.ToString(p.GetValueOrDefault("code")) is { Length: > 0 } c ? c : BelLaborkuerzel(Convert.ToString(p["number"])),
                Convert.ToDouble(p["count"]),
                Convert.ToDouble(p["price"]),
                Convert.ToString(p.GetValueOrDefault("lab")) == "eigen" ? LaborEigen : LaborFremd1
            )).ToList();
            return (services, LabEstimateCents(services, surcharge), surcharge);
        }
        if (targetCents <= 0)
            return ([EncodeLabService("Plan", LabSammel, 1, 0)], 0, surcharge);
        var netCents = targetCents != 0 ? Away0((decimal)targetCents / 1.07m) : 1;
        if (netCents < 1) netCents = 1;
        for (var delta = 0; delta < 20; delta++)
        {
            foreach (var sign in new[] { 0, 1, -1 })
            {
                var candidate = netCents + sign * delta;
                if (candidate < 1) continue;
                var services = new List<string> { EncodeLabService("Plan", LabSammel, 1, candidate / 100.0) };
                var estimate = LabEstimateCents(services, surcharge);
                if (estimate == targetCents) return (services, targetCents, surcharge);
            }
        }
        var fallback = new List<string> { EncodeLabService("Plan", LabSammel, 1, netCents / 100.0) };
        return (fallback, LabEstimateCents(fallback, surcharge), surcharge);
    }

    /// <summary>Offsets im Plansatz PROTHETIK_PLAN_RDM (674 Byte), Wert jeweils Prozent mal 100.</summary>
    public const int PlanBonusProz = 88;      // PROTH_BONUS_PROZ
    public const int PlanHkpBonusProz = 190;  // PROTH_HKP_BONUS_PROZ

    public static Dictionary<string, object?> EncodeHkpBundle(Dictionary<string, object?> imported)
    {
        var versorgung = Convert.ToString(imported.GetValueOrDefault("versorgungsart")) is { Length: > 0 } v ? v : "regel";
        var teeth = (Dictionary<string, Dictionary<string, string>>)imported["teeth"]!;
        var findings = new Dictionary<int, string>();
        var zeileR = new Dictionary<int, string>();
        var zeileTp = new Dictionary<int, string>();
        var rohTp = new Dictionary<int, string>();
        var rohBefund = new Dictionary<int, string>();
        foreach (var (tooth, row) in teeth)
        {
            var n = int.Parse(tooth);
            var befund = row.GetValueOrDefault("B", "");
            findings[n] = DensKuerzel.BefundKasse(befund);
            rohBefund[n] = befund;
            zeileR[n] = DensKuerzel.PlanHuk(row.GetValueOrDefault("R", ""));
            if (versorgung != "regel")
            {
                rohTp[n] = row.TryGetValue("planung", out var pl) ? pl : (row.GetValueOrDefault("TP", "") is { Length: > 0 } tp ? tp : row.GetValueOrDefault("R", ""));
            }
        }
        foreach (var (n, src) in rohTp)
        {
            var implantat = src.Trim().ToLowerInvariant() == "zab" && DensKuerzel.ImplantatGlied(n, rohBefund.GetValueOrDefault(n, ""), rohTp);
            zeileTp[n] = DensKuerzel.PlanHuk(DensKuerzel.PlanungNachAmtlich(src, implantat));
        }
        var geschlossen = findings.Where(kv => kv.Value == ")(").Select(kv => kv.Key).ToHashSet();
        var ankerR = DensKuerzel.AnkerZaehne(zeileR, geschlossen);
        var ankerTp = DensKuerzel.AnkerZaehne(zeileTp, geschlossen);
        var therapy = zeileTp.ToDictionary(kv => kv.Key, kv => DensKuerzel.TpSymbol(kv.Value, versorgung, ankerTp.Contains(kv.Key)));
        var planning = new SortedDictionary<int, string>();
        foreach (var (n, code) in zeileR)
            if (DensKuerzel.RSymbol(code).Length > 0) planning[n] = DensKuerzel.RSymbol(code, ankerR.Contains(n));

        var positions = (List<Dictionary<string, object?>>)imported["positions"]!;
        var goz = (List<Dictionary<string, object?>>)imported["gozPositions"]!;
        if (positions.Count == 0 && goz.Count == 0) throw new ArgumentException("Keine BEMA- oder GOZ-Positionen zum Schreiben.");

        var services = new List<string>();
        var pointValue = Convert.ToDouble(imported.GetValueOrDefault("pointValue") ?? 0);
        foreach (var pos in positions)
        {
            var pv = pos.TryGetValue("pointValue", out var pvObj) && pvObj is double pvd && pvd != 0 ? pvd : pointValue;
            if ((pvObj is null || (pvObj is double pv0 && pv0 == 0)) && pos.GetValueOrDefault("points") is double pts && pts != 0
                && Convert.ToDouble(pos["count"]) != 0 && pos.GetValueOrDefault("amount") is not null)
            {
                try { pv = (double)(DecFromDouble(Convert.ToDouble(pos["amount"])) / (DecFromDouble(pts) * DecFromDouble(Convert.ToDouble(pos["count"])))); }
                catch { pv = pointValue; }
            }
            var region = Region(Convert.ToString(pos.GetValueOrDefault("tooth")));
            services.Add(EncodeService(1, region, Convert.ToString(pos["number"])!, (int)Convert.ToDouble(pos["count"]),
                points: (int)Convert.ToDouble(pos.GetValueOrDefault("points") ?? 0), pointValue: pv, planFlag: region == "Plan" ? 1 : 0));
        }
        foreach (var pos in goz)
        {
            services.Add(EncodeService(0, Region(Convert.ToString(pos.GetValueOrDefault("tooth"))), Convert.ToString(pos["number"])!,
                (int)Convert.ToDouble(pos["count"]), points: Convert.ToInt32(pos["points"]),
                factor: (int)Math.Round(Convert.ToDouble(pos["factor"]) * 100.0, MidpointRounding.ToEven),
                baseCents: Cents(Convert.ToDouble(pos["price"]))));
        }
        foreach (var (tooth, code) in planning)
            services.Add(EncodeService(2, tooth.ToString(), code, 1));
        foreach (var fz in (List<Dictionary<string, object?>>)imported["befunde"]!)
        {
            var z = (Convert.ToString(fz.GetValueOrDefault("tooth")) ?? "OK").Trim();
            if (z.Length == 0) z = "OK";
            if (z.Length > 32) z = z[..32];
            services.Add(EncodeService(3, z, Convert.ToString(fz["number"])!, Convert.ToInt32(fz["count"]),
                baseCents: Cents(Convert.ToDouble(fz["baseAmount"]))));
        }

        var targetLab = Cents(Convert.ToDouble(imported["materialUndLabor"]));
        var (labServices, labCents, surcharge) = LabForTarget(targetLab, (List<Dictionary<string, object?>>)imported["labPositions"]!);
        if (Math.Abs(labCents - targetLab) > 2)
            throw new ArgumentException($"Laborpositionen ergeben {(labCents / 100.0).ToString("F2", CultureInfo.InvariantCulture)} EUR, der Plan {(targetLab / 100.0).ToString("F2", CultureInfo.InvariantCulture)} EUR – HKP wird nicht übernommen, damit DENS keine falschen Laborkosten bekommt.");

        var labPlan = new byte[62];
        BitConverter.GetBytes((short)1).CopyTo(labPlan, 6);
        BitConverter.GetBytes(surcharge).CopyTo(labPlan, 18);
        BitConverter.GetBytes((short)2).CopyTo(labPlan, 60);

        var plan = new byte[674];
        BitConverter.GetBytes((short)2).CopyTo(plan, 62);
        BitConverter.GetBytes((short)2).CopyTo(plan, 130);
        BitConverter.GetBytes(Cents(Convert.ToDouble(imported["bemaHonorar"])) + Cents(Convert.ToDouble(imported.GetValueOrDefault("gozHonorar") ?? 0))).CopyTo(plan, 80);
        BitConverter.GetBytes(VersorgungCode[versorgung]).CopyTo(plan, 132);
        BitConverter.GetBytes(GozPunktwertRaw).CopyTo(plan, 236);
        BitConverter.GetBytes(labCents).CopyTo(plan, 84);
        var bonusRaw = (short)Math.Round(Convert.ToDouble(imported["bonusPercent"]) * 100.0, MidpointRounding.ToEven);
        BitConverter.GetBytes(bonusRaw).CopyTo(plan, PlanBonusProz);
        // DENS rechnet "Betrag Euro" je Befund und die "Vorläufige Summe" der Ansicht "Befunde für Zuschüsse / Festsetzung"
        // mit diesem zweiten Prozentfeld; bleibt es 0, stehen dort 0,00, obwohl die Festzuschusszeilen stimmen.
        BitConverter.GetBytes(bonusRaw).CopyTo(plan, PlanHkpBonusProz);
        if (pointValue != 0)
        {
            var pvRaw = (int)Math.Round(pointValue * 10000.0, MidpointRounding.ToEven);
            BitConverter.GetBytes(pvRaw).CopyTo(plan, 136);
            BitConverter.GetBytes(pvRaw).CopyTo(plan, 140);
        }
        BitConverter.GetBytes((short)6).CopyTo(plan, 128);
        BitConverter.GetBytes((short)1).CopyTo(plan, 148);
        for (var i = 0; i < FdiOrder.Length; i++)
        {
            var n = FdiOrder[i];
            Put(plan, 248 + i * 5, 5, therapy.GetValueOrDefault(n, ""));
            var fnd = findings.GetValueOrDefault(n, "");
            Put(plan, 418 + i * 4, 4, fnd.Length > 0 ? fnd : " ");
        }

        var missing = FdiOrder.Where(n => findings.GetValueOrDefault(n) == "f").ToList();
        var toothPattern = new byte[92];
        BitConverter.GetBytes((ushort)4).CopyTo(toothPattern, 4);
        BitConverter.GetBytes((short)2).CopyTo(toothPattern, 64);
        var planTeeth = new List<string>();
        foreach (var n in missing)
        {
            var row = (byte[])toothPattern.Clone();
            BitConverter.GetBytes((short)n).CopyTo(row, 0);
            planTeeth.Add(B64(row));
        }

        var desc = Convert.ToString(imported.GetValueOrDefault("description")) is { Length: > 0 } ds ? ds : $"PlanR {imported["date"]}";
        if (desc.Length > 39) desc = desc[..39];
        var bundle = new Dictionary<string, object?>
        {
            ["plan"] = B64(plan), ["services"] = services, ["labPlan"] = B64(labPlan),
            ["labServices"] = labServices, ["description"] = desc, ["source"] = "planr", ["planTeeth"] = planTeeth,
        };
        if (planTeeth.Count > 0)
        {
            var head = new byte[46];
            BitConverter.GetBytes((short)3).CopyTo(head, 20);
            bundle["planFinding"] = B64(head);
        }
        return bundle;
    }
}
