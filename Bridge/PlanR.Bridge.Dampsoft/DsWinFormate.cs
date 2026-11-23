using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Dampsoft;

/// <summary>1:1-Port von import_formats.py und plan_formats.py.</summary>
public static class DsWinFormate
{
    public static readonly string[] FdiOrder =
    [
        "18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28",
        "38", "37", "36", "35", "34", "33", "32", "31", "41", "42", "43", "44", "45", "46", "47", "48",
    ];
    static readonly HashSet<string> FdiSet = new(FdiOrder, StringComparer.Ordinal);
    static readonly HashSet<string> DpfCodes = new(StringComparer.Ordinal) { "f", "k", "x", "w", "ww", "kw" };

    static readonly Regex HkpNrRe = new(@"^[0-9A-Za-z.-]{1,6}$", RegexOptions.Compiled);
    static readonly Regex Beb4Re = new(@"^\d{4}$", RegexOptions.Compiled);
    static readonly Regex ToothRe = new(@"^(?:|OK|UK|OK,UK|[1-4][1-8](?:-[1-4][1-8])?(?:,[1-4][1-8](?:-[1-4][1-8])?)*)$", RegexOptions.Compiled);
    static readonly Regex BefNrRe = new(@"^\d{1,2}\.\d{1,2}$", RegexOptions.Compiled);
    static readonly Regex BefAreaRe = new(@"^[0-9OKUK,\-]*$", RegexOptions.Compiled);
    static readonly Regex SymbolRe = new(@"^[A-Za-z0-9()]{1,6}$", RegexOptions.Compiled);
    static readonly Regex CommaSpaceRe = new(@"\s*,\s*", RegexOptions.Compiled);

    static readonly Regex PlanNrRe = new(@"^[0-9A-Za-zÄä.-]{1,6}$", RegexOptions.Compiled);
    static readonly Regex MkvSymbolRe = new(@"^[A-Z][1-4]$", RegexOptions.Compiled);
    static readonly Regex PlanBefundRe = new(@"^[a-z0-9)(]{1,4}$", RegexOptions.Compiled);
    static readonly Regex EigenMatRe = new(@"^(?:[A-Za-z]{1,2}\d{0,3}|NEMPS)$", RegexOptions.Compiled);

    static readonly HashSet<string> PlanArten = new(StringComparer.Ordinal) { "kva", "mkv" };
    static readonly HashSet<string> Arten = new(StringComparer.Ordinal) { "ZE", "IM", "KO" };
    static readonly Dictionary<string, HashSet<string>> Ebenen = new(StringComparer.Ordinal)
    {
        ["kva"] = new(StringComparer.Ordinal) { "GOZ", "GOAE", "BEB", "MAT", "LABOR" },
        ["mkv"] = new(StringComparer.Ordinal) { "GOZ", "BEMA", "BEB", "MAT", "LABOR" },
    };

    const int BegruendungMax = 500;

    static double RoundPy(double v, int digits) => Math.Round(v, digits, MidpointRounding.ToEven);

    static bool TryFinite(JsonElement el, out double val)
    {
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDouble(out var d) && double.IsFinite(d))
        {
            val = d;
            return true;
        }
        val = 0;
        return false;
    }

    static double FiniteNumber(JsonElement? el, string label, double min = 0, double max = 999999.99, int digits = 2)
    {
        if (el is null || !TryFinite(el.Value, out var d) || d < min || d > max)
            throw new EditError($"{label} ist ungültig.");
        return RoundPy(d, digits);
    }

    static JsonElement? Prop(JsonElement obj, string name) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var v) ? v : null;

    static string? StrProp(JsonElement obj, string name) =>
        Prop(obj, name) is { ValueKind: JsonValueKind.String } v ? v.GetString() : null;

    static string PlanText(JsonElement? el, string label, int limit, string encoding)
    {
        if (el is null || el.Value.ValueKind == JsonValueKind.Null) return "";
        if (el.Value.ValueKind != JsonValueKind.String) throw new EditError($"{label} ist ungültig.");
        var s = el.Value.GetString() ?? "";
        if (s.Length > limit || s.Any(c => c < 32)) throw new EditError($"{label} ist ungültig.");
        try { DsWinPfad.EncodingByName(encoding, strict: true).GetBytes(s); }
        catch (EncoderFallbackException) { throw new EditError($"{label} ist in DS-Win nicht darstellbar."); }
        return s;
    }

    /// <summary>Port von import_formats.parse_hkp_json.</summary>
    public static Dictionary<string, object?> ParseHkpJson(string? text, string encoding)
    {
        if (text is null || Encoding.UTF8.GetByteCount(text) > 65536)
            throw new EditError("HKP-JSON ist leer oder zu groß.");
        JsonDocument doc;
        try { doc = JsonDocument.Parse(text); }
        catch (JsonException) { throw new EditError("Ungültiges HKP-JSON."); }
        using (doc)
        {
            var data = doc.RootElement;
            if (data.ValueKind != JsonValueKind.Object
                || !data.TryGetProperty("verwaltung", out var administration)
                || !data.TryGetProperty("ergebnis", out var result)
                || !data.TryGetProperty("positionen", out var positions))
                throw new EditError("Ungültiges HKP-JSON.");
            if (administration.ValueKind != JsonValueKind.Object
                || result.ValueKind != JsonValueKind.Object
                || positions.ValueKind != JsonValueKind.Array
                || positions.GetArrayLength() < 1 || positions.GetArrayLength() > 100)
                throw new EditError("HKP-JSON enthält keine unterstützten Planpositionen.");

            string date;
            double bemaHonorar, gozHonorar, materialUndLabor, total, subsidy, subsidy100, patientShare, labFremd, labRate;
            try
            {
                var dateStr = StrProp(administration, "ausstellungsdatum") ?? throw new FormatException();
                if (!DateOnly.TryParseExact(dateStr, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                    throw new FormatException();
                date = d.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
                if (!result.TryGetProperty("summen", out var amounts) || amounts.ValueKind != JsonValueKind.Object)
                    throw new KeyNotFoundException();
                bemaHonorar = FiniteNumber(Prop(amounts, "bemaHonorar"), "BEMA-Honorar");
                gozHonorar = FiniteNumber(Prop(amounts, "gozHonorar"), "GOZ-Honorar");
                materialUndLabor = FiniteNumber(Prop(amounts, "materialUndLabor"), "Material- und Laborkosten");
                total = FiniteNumber(Prop(amounts, "gesamt"), "Gesamtsumme");
                subsidy = FiniteNumber(Prop(amounts, "festzuschuss"), "Festzuschuss");
                subsidy100 = FiniteNumber(Prop(amounts, "festzuschuss100"), "Festzuschuss 100 Prozent");
                patientShare = FiniteNumber(Prop(amounts, "eigenanteil"), "Eigenanteil");
                if (amounts.TryGetProperty("fremdNetto", out var fnEl) && amounts.TryGetProperty("fremdMwst", out var fmEl))
                {
                    var fn = FiniteNumber(fnEl, "Fremdlabor");
                    var fm = FiniteNumber(fmEl, "Fremdlabor-MwSt.");
                    labFremd = Math.Min(materialUndLabor, RoundPy(fn + fm, 2));
                    var rawFn = fnEl.GetDouble();
                    var rawFm = fmEl.GetDouble();
                    labRate = rawFn != 0.0 ? rawFm / rawFn : 0.07;
                }
                else { labFremd = 0.0; labRate = 0.07; }
            }
            catch (EditError) { throw; }
            catch { throw new EditError("HKP-JSON enthält keine gültigen Summen oder kein Ausstellungsdatum."); }

            if (Math.Abs(Math.Min(subsidy, total) + patientShare - total) > 0.02)
                throw new EditError("Gesamtsumme, Festzuschuss und Eigenanteil stimmen nicht überein.");

            double bonusPercent;
            try
            {
                var zuschuss = Prop(data, "zuschuss");
                if (zuschuss is null || zuschuss.Value.ValueKind != JsonValueKind.Object || !zuschuss.Value.TryGetProperty("bonus", out var bEl))
                    throw new KeyNotFoundException();
                double bVal = bEl.ValueKind switch
                {
                    JsonValueKind.Number => bEl.GetDouble(),
                    JsonValueKind.String => double.Parse(bEl.GetString()!, CultureInfo.InvariantCulture),
                    _ => throw new FormatException(),
                };
                if (!double.IsFinite(bVal) || bVal < 0 || bVal > 100)
                    throw new EditError("Bonus ist ungültig.");
                bonusPercent = RoundPy(bVal, 2);
            }
            catch (EditError) { throw; }
            catch { throw new EditError("HKP-JSON enthält keinen gültigen Bonuswert."); }

            if (bonusPercent <= 0 || Math.Abs(subsidy100 * bonusPercent / 100.0 - subsidy) > 0.03)
                throw new EditError("Festzuschuss und Bonuswert stimmen nicht überein.");

            var results = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            if (result.TryGetProperty("positionen", out var resPos) && resPos.ValueKind == JsonValueKind.Array)
            {
                foreach (var rp in resPos.EnumerateArray())
                {
                    if (rp.ValueKind == JsonValueKind.Object && rp.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String)
                        results[idEl.GetString()!] = rp;
                }
            }

            var posList = positions.EnumerateArray().ToList();
            var skippedIdx = new HashSet<int>();
            for (var idx = 0; idx < posList.Count; idx++)
            {
                var item = posList[idx];
                if (item.ValueKind == JsonValueKind.Object && StrProp(item, "ebene") == "MAT")
                {
                    var id = StrProp(item, "id");
                    var calcLab = id is not null && results.TryGetValue(id, out var ce) ? StrProp(ce, "labor") : null;
                    var lab = !string.IsNullOrEmpty(calcLab) ? calcLab : StrProp(item, "labor");
                    if (lab is not ("eigen" or "fremd")) skippedIdx.Add(idx);
                }
            }

            var imported = new List<Dictionary<string, object?>>();
            var notes = new List<string>();
            if (skippedIdx.Count > 0)
                notes.Add($"{skippedIdx.Count} Praxismaterial-Zeile(n) nur in der Summe Material und Labor, nicht als Einzelzeile.");

            for (var i = 0; i < posList.Count; i++)
            {
                var index = i + 1;
                if (skippedIdx.Contains(i)) continue;
                var item = posList[i];
                var material = item.ValueKind == JsonValueKind.Object && StrProp(item, "ebene") == "MAT";
                if (material)
                {
                    var bezEl = Prop(item, "bezeichnung");
                    if (bezEl is not null && (bezEl.Value.ValueKind != JsonValueKind.String || (bezEl.Value.GetString() ?? "").Length > 300))
                        throw new EditError($"Materialtext Position {index} ist ungültig.");
                }
                if (item.ValueKind != JsonValueKind.Object)
                    throw new EditError($"Position {index} ist ungültig.");
                var ebene = StrProp(item, "ebene") ?? "";
                var nr = StrProp(item, "nr");
                if (!material && (ebene is not ("BEMA" or "BEL" or "BEB" or "GOZ") || nr is null || !HkpNrRe.IsMatch(nr)))
                    throw new EditError($"Position {index} ist ungültig.");
                if (ebene == "BEB" && !Beb4Re.IsMatch(nr!))
                    throw new EditError($"BEB-Nummer Position {index} ist ungültig.");
                var count = FiniteNumber(Prop(item, "anzahl"), $"Anzahl Position {index}", 0.01, 99);
                var zahnEl = Prop(item, "zahn");
                string? tooth;
                if (zahnEl is null) tooth = "";
                else if (zahnEl.Value.ValueKind == JsonValueKind.String) tooth = CommaSpaceRe.Replace(zahnEl.Value.GetString()!.Trim(), ",");
                else tooth = null;
                if (tooth is null || tooth.Length > 30 || !ToothRe.IsMatch(tooth))
                    throw new EditError($"Zahnangabe Position {index} ist ungültig.");
                var id = StrProp(item, "id");
                JsonElement calculated = default;
                var hasCalc = id is not null && results.TryGetValue(id, out calculated);
                var amount = FiniteNumber(hasCalc ? Prop(calculated, "betrag") : null, $"Betrag Position {index}");
                var price = FiniteNumber(hasCalc ? Prop(calculated, "einzelpreis") : null, $"Einzelpreis Position {index}");
                if (Math.Abs(amount - price * count) > 0.02)
                    throw new EditError($"Betrag Position {index} passt nicht zur Anzahl.");

                var row = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["level"] = ebene, ["number"] = material ? "" : nr!,
                    ["count"] = count, ["tooth"] = tooth, ["amount"] = amount, ["price"] = price,
                };
                if (ebene == "BEMA" && hasCalc
                    && Prop(calculated, "punkte") is { } pkEl && TryFinite(pkEl, out var pk)
                    && Prop(calculated, "punktwert") is { } pwEl && TryFinite(pwEl, out var pw))
                {
                    row["points"] = RoundPy(pk * count, 2);
                    row["pointValue"] = pw;
                }
                if (ebene == "GOZ" && hasCalc
                    && Prop(calculated, "faktor") is { } fkEl && TryFinite(fkEl, out var fk) && fk > 0 && fk <= 10)
                {
                    row["factor"] = fk;
                }
                if (material) row["text"] = StrProp(item, "bezeichnung") ?? "";
                if (ebene is "BEL" or "BEB" or "MAT")
                {
                    var calcLab = hasCalc ? StrProp(calculated, "labor") : null;
                    var lab = !string.IsNullOrEmpty(calcLab) ? calcLab : StrProp(item, "labor");
                    row["lab"] = lab == "eigen" ? "eigen" : "fremd";
                }
                imported.Add(row);
            }

            var findings = new List<Dictionary<string, object?>>();
            if (result.TryGetProperty("befunde", out var befArr) && befArr.ValueKind == JsonValueKind.Array)
            {
                var bIdx = 0;
                foreach (var item in befArr.EnumerateArray())
                {
                    bIdx++;
                    var nr = item.ValueKind == JsonValueKind.Object ? (Prop(item, "nr")?.ToString() ?? "") : "";
                    if (item.ValueKind != JsonValueKind.Object || !BefNrRe.IsMatch(nr))
                        throw new EditError($"Festzuschuss-Befund {bIdx} ist ungültig.");
                    var areaRaw = Prop(item, "zahnGebiet") is { ValueKind: JsonValueKind.String } zg ? zg.GetString()! : "";
                    var area = CommaSpaceRe.Replace(areaRaw.Trim(), ",");
                    if (area.Length > 30 || !BefAreaRe.IsMatch(area))
                        throw new EditError($"Zahngebiet Festzuschuss-Befund {bIdx} ist ungültig.");
                    var count = FiniteNumber(Prop(item, "anzahl"), $"Anzahl Festzuschuss-Befund {bIdx}", 0.01, 99);
                    var b100 = FiniteNumber(Prop(item, "betrag100"), $"Festzuschuss-Befund {bIdx}");
                    var betrag = FiniteNumber(Prop(item, "betrag"), $"Festzuschuss-Befund {bIdx}");
                    findings.Add(new Dictionary<string, object?>(StringComparer.Ordinal)
                    {
                        ["number"] = nr, ["tooth"] = area, ["count"] = count,
                        ["price"] = RoundPy(b100 / count, 2), ["amount"] = betrag,
                    });
                }
            }

            var teethEl = Prop(data, "zaehne");
            if (teethEl is not null && teethEl.Value.ValueKind != JsonValueKind.Object)
                throw new EditError("Zahnstatus im HKP-JSON ist ungültig.");
            var statuses = new Dictionary<string, string>(StringComparer.Ordinal);
            var rows = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
            var unsupported = new List<string>();
            var dropped = new List<string>();
            if (teethEl is not null)
            {
                foreach (var kv in teethEl.Value.EnumerateObject())
                {
                    if (!FdiSet.Contains(kv.Name)) throw new EditError("Zahnstatus im HKP-JSON ist ungültig.");
                    var item = kv.Value.ValueKind == JsonValueKind.Object ? kv.Value : default;
                    var code = item.ValueKind == JsonValueKind.Object ? (StrProp(item, "B") ?? "") : "";
                    if (code.Length > 0 && !DpfCodes.Contains(code)) { unsupported.Add($"{kv.Name} {code}"); code = ""; }
                    else if (code.Length > 0) statuses[kv.Name] = code;
                    var row = new Dictionary<string, string>(StringComparer.Ordinal) { ["B"] = code };
                    foreach (var key in new[] { "R", "TP" })
                    {
                        var sym = item.ValueKind == JsonValueKind.Object ? (StrProp(item, key) ?? "").Trim() : "";
                        if (sym.Length > 0 && !SymbolRe.IsMatch(sym)) { dropped.Add($"{kv.Name} {key} {sym}"); sym = ""; }
                        row[key] = sym;
                    }
                    if (row.Values.Any(v => v.Length > 0)) rows[kv.Name] = row;
                }
            }
            if (unsupported.Count > 0)
            {
                unsupported.Sort(StringComparer.Ordinal);
                notes.Add("Befund nicht übertragen (in DS-Win nachtragen): " + string.Join(", ", unsupported) + ".");
            }
            if (dropped.Count > 0)
            {
                dropped.Sort(StringComparer.Ordinal);
                notes.Add("Planungskürzel nicht übertragen: " + string.Join(", ", dropped) + ".");
            }
            if (imported.Count == 0)
                throw new EditError("HKP-JSON enthält keine BEMA-, BEL-, BEB- oder GOZ-Position.");
            var noteEl = Prop(administration, "erlaeuterung");
            string note;
            if (noteEl is null) note = "";
            else if (noteEl.Value.ValueKind == JsonValueKind.String) note = noteEl.Value.GetString()!;
            else throw new EditError("HKP-Erläuterung ist zu lang oder enthält nicht darstellbare Zeichen.");
            try
            {
                if (DsWinPfad.EncodingByName(encoding, strict: true).GetByteCount(note) > 80)
                    throw new EditError("HKP-Erläuterung ist zu lang oder enthält nicht darstellbare Zeichen.");
            }
            catch (EncoderFallbackException)
            {
                throw new EditError("HKP-Erläuterung ist zu lang oder enthält nicht darstellbare Zeichen.");
            }

            return new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["date"] = date, ["positions"] = imported, ["total"] = total, ["subsidy"] = subsidy,
                ["subsidyPaid"] = Math.Min(subsidy, total), ["patientShare"] = patientShare,
                ["bemaHonorar"] = bemaHonorar, ["gozHonorar"] = gozHonorar, ["materialUndLabor"] = materialUndLabor,
                ["labFremd"] = labFremd, ["labRate"] = RoundPy(labRate, 4), ["findings"] = findings,
                ["bonusPercent"] = bonusPercent, ["subsidyBase"] = RoundPy(subsidy * 100.0 / bonusPercent, 2),
                ["teeth"] = statuses, ["rows"] = rows, ["note"] = note, ["notes"] = notes,
            };
        }
    }

    /// <summary>Port von plan_formats.parse_plan_json.</summary>
    public static Dictionary<string, object?> ParsePlanJson(string? text, string encoding)
    {
        if (text is null || Encoding.UTF8.GetByteCount(text) > 65536)
            throw new EditError("Plan-JSON ist leer oder zu groß.");
        JsonDocument doc;
        try { doc = JsonDocument.Parse(text); }
        catch (JsonException) { throw new EditError("Ungültiges Plan-JSON."); }
        using (doc)
        {
            var data = doc.RootElement;
            if (data.ValueKind != JsonValueKind.Object
                || StrProp(data, "format") != "planr-plan"
                || Prop(data, "version") is not { ValueKind: JsonValueKind.Number } vEl || !vEl.TryGetInt32(out var ver) || ver != 1)
                throw new EditError("Plan-JSON hat kein unterstütztes Format.");
            var planart = StrProp(data, "planart") ?? "";
            if (!PlanArten.Contains(planart)) throw new EditError("Planart muss kva oder mkv sein.");
            var artEl = Prop(data, "art");
            var art = artEl is null ? "KO" : (artEl.Value.ValueKind == JsonValueKind.String ? artEl.Value.GetString()! : "");
            if (!Arten.Contains(art)) throw new EditError("Art muss ZE, IM oder KO sein.");
            string date;
            var datumStr = StrProp(data, "datum");
            if (datumStr is null || !DateOnly.TryParseExact(datumStr, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                throw new EditError("Plan-JSON enthält kein gültiges Datum.");
            date = d.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
            var title = PlanText(Prop(data, "titel"), "Plantitel", 120, encoding);
            var positions = Prop(data, "positionen");
            if (positions is null || positions.Value.ValueKind != JsonValueKind.Array
                || positions.Value.GetArrayLength() < 1 || positions.Value.GetArrayLength() > 150)
                throw new EditError("Plan-JSON enthält keine Planpositionen.");

            var rows = new List<Dictionary<string, object?>>();
            var notes = new List<string>();
            var allowed = Ebenen[planart];
            var index = 0;
            foreach (var item in positions.Value.EnumerateArray())
            {
                index++;
                var level = item.ValueKind == JsonValueKind.Object ? StrProp(item, "ebene") : null;
                if (level is null || !allowed.Contains(level))
                    throw new EditError($"Position {index} hat keine für diese Planart zulässige Ebene.");
                var nrEl = Prop(item, "nr");
                var nr = nrEl is null ? "" : (nrEl.Value.ValueKind == JsonValueKind.String ? nrEl.Value.GetString()! : null);
                if (level is "GOZ" or "GOAE" or "BEMA" or "BEB" && (nr is null || !PlanNrRe.IsMatch(nr)))
                    throw new EditError($"Nummer Position {index} ist ungültig.");
                if (level == "BEB" && !Beb4Re.IsMatch(nr!))
                    throw new EditError($"BEB-Nummer Position {index} ist ungültig.");
                var count = FiniteNumber(Prop(item, "anzahl"), $"Anzahl Position {index}", 0.01, 99, 4);
                var zahnEl = Prop(item, "zahn");
                string? tooth = zahnEl is null ? "" : zahnEl.Value.ValueKind == JsonValueKind.String ? CommaSpaceRe.Replace(zahnEl.Value.GetString()!.Trim(), ",") : null;
                if (tooth is null || tooth.Length > 30 || !ToothRe.IsMatch(tooth))
                    throw new EditError($"Zahnangabe Position {index} ist ungültig.");
                var price = RoundPy(FiniteNumber(Prop(item, "einzelpreis"), $"Einzelpreis Position {index}", 0, 999999.99, 4), 2);
                var amount = RoundPy(FiniteNumber(Prop(item, "betrag"), $"Betrag Position {index}", 0, 999999.99, 4), 2);
                if (Math.Abs(amount - price * count) > 0.02 + 0.005 * count)
                    throw new EditError($"Betrag Position {index} passt nicht zur Anzahl.");
                var row = new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["level"] = level, ["number"] = level != "MAT" ? (nr ?? "") : "",
                    ["count"] = count, ["tooth"] = tooth, ["price"] = price, ["amount"] = amount,
                    ["text"] = PlanText(Prop(item, "bezeichnung"), $"Text Position {index}", 300, encoding),
                };
                if (level is "GOZ" or "GOAE")
                {
                    var fakEl = Prop(item, "faktor");
                    row["factor"] = fakEl is not null && fakEl.Value.ValueKind != JsonValueKind.Null
                        ? FiniteNumber(fakEl, $"Faktor Position {index}", 0.01, 10, 4) : 1.0;
                    var itemArt = StrProp(item, "art");
                    row["art"] = itemArt is not null && Arten.Contains(itemArt) ? itemArt : art;
                    row["mkv"] = Prop(item, "mkv") is { ValueKind: JsonValueKind.True } && planart == "mkv";
                    var rEl = Prop(item, "begruendung");
                    if (rEl is not null && rEl.Value.ValueKind != JsonValueKind.Null)
                    {
                        if (rEl.Value.ValueKind != JsonValueKind.String)
                            throw new EditError($"Begründung Position {index} ist ungültig.");
                        var reason = string.Join(" ", rEl.Value.GetString()!.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
                        if (reason.Length > BegruendungMax)
                            throw new EditError($"Begründung Position {index} ist länger als {BegruendungMax} Zeichen. Bitte in PlanR kürzen.");
                        if (reason.Any(c => c < 32)) throw new EditError($"Begründung Position {index} ist ungültig.");
                        try { DsWinPfad.EncodingByName(encoding, strict: true).GetBytes(reason); }
                        catch (EncoderFallbackException) { throw new EditError($"Begründung Position {index} ist in DS-Win nicht darstellbar."); }
                        row["reason"] = reason;
                    }
                }
                if (level == "BEMA")
                {
                    var pts = FiniteNumber(Prop(item, "punkte"), $"Punkte Position {index}", 0.1, 9999, 4);
                    var pv = FiniteNumber(Prop(item, "punktwert"), $"Punktwert Position {index}", 0.1, 5, 4);
                    row["points"] = pts;
                    row["pointValue"] = pv;
                    if (Math.Abs(RoundPy(pts * pv, 2) - price) > 0.02)
                        throw new EditError($"BEMA-Betrag Position {index} passt nicht zu Punkten und Punktwert.");
                }
                if (level is "BEB" or "MAT" or "LABOR")
                    row["lab"] = StrProp(item, "labor") == "eigen" ? "eigen" : "fremd";
                if (level == "MAT")
                {
                    var code = StrProp(item, "eigen");
                    if (code is not null && EigenMatRe.IsMatch(code))
                    {
                        var cur = (string)row["text"]!;
                        row["text"] = $"{(cur.Length > 0 ? cur : "Material")} (DS-Win {code.ToUpperInvariant()})";
                    }
                }
                rows.Add(row);
            }
            if (!rows.Any(r => (string)r["level"]! is "GOZ" or "GOAE"))
                throw new EditError("Plan-JSON enthält keine GOZ- oder GOÄ-Position.");

            var sums = Prop(data, "summen");
            if (sums is null || sums.Value.ValueKind != JsonValueKind.Object)
                throw new EditError("Plan-JSON enthält keine Summen.");
            var honorar = RoundPy(FiniteNumber(Prop(sums.Value, "honorar"), "Honorar", 0, 999999.99, 4), 2);
            var labOwnEl = Prop(sums.Value, "laborEigen");
            var labOwn = labOwnEl is null ? 0.0 : RoundPy(FiniteNumber(labOwnEl, "Eigenlabor", 0, 999999.99, 4), 2);
            var labExtEl = Prop(sums.Value, "laborFremd");
            var labExt = labExtEl is null ? 0.0 : RoundPy(FiniteNumber(labExtEl, "Fremdlabor", 0, 999999.99, 4), 2);
            var total = RoundPy(FiniteNumber(Prop(sums.Value, "gesamt"), "Gesamtsumme", 0, 999999.99, 4), 2);
            var feeRows = RoundPy(rows.Where(r => (string)r["level"]! is "GOZ" or "GOAE").Sum(r => (double)r["amount"]!), 2);
            if (Math.Abs(feeRows - honorar) > 0.05)
                throw new EditError("Honorarsumme passt nicht zu den Positionen.");
            if (planart == "kva" && Math.Abs(honorar + labOwn + labExt - total) > 0.05)
                throw new EditError("Gesamtsumme passt nicht zu Honorar und Labor.");

            var teethEl = Prop(data, "zaehne");
            if (teethEl is not null && teethEl.Value.ValueKind != JsonValueKind.Object)
                throw new EditError("Zahnangaben im Plan-JSON sind ungültig.");
            var findings = new Dictionary<string, string>(StringComparer.Ordinal);
            var symbols = new Dictionary<string, string>(StringComparer.Ordinal);
            var dropped = new List<string>();
            if (teethEl is not null)
            {
                foreach (var kv in teethEl.Value.EnumerateObject())
                {
                    if (!FdiSet.Contains(kv.Name)) throw new EditError("Zahnangaben im Plan-JSON sind ungültig.");
                    if (kv.Value.ValueKind != JsonValueKind.Object) throw new EditError($"Zahn {kv.Name} ist ungültig.");
                    if (kv.Value.TryGetProperty("B", out var bEl))
                    {
                        string code;
                        if (bEl.ValueKind == JsonValueKind.Null) code = "";
                        else if (bEl.ValueKind == JsonValueKind.String) code = bEl.GetString()!;
                        else throw new EditError($"Befund an Zahn {kv.Name} ist ungültig.");
                        if (code.Length > 0 && !PlanBefundRe.IsMatch(code))
                            throw new EditError($"Befund an Zahn {kv.Name} ist ungültig.");
                        findings[kv.Name] = code;
                    }
                    if (kv.Value.TryGetProperty("TP", out var tpEl) && planart == "mkv" && tpEl.ValueKind != JsonValueKind.Null)
                    {
                        var sym = tpEl.ValueKind == JsonValueKind.String ? tpEl.GetString()! : "";
                        if (sym.Length > 0)
                        {
                            if (!MkvSymbolRe.IsMatch(sym)) dropped.Add($"{kv.Name} {sym}");
                            else symbols[kv.Name] = sym;
                        }
                    }
                }
            }
            if (dropped.Count > 0)
            {
                dropped.Sort(StringComparer.Ordinal);
                notes.Add("MKV-Kürzel nicht übertragen: " + string.Join(", ", dropped) + ".");
            }
            return new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["planart"] = planart, ["art"] = art, ["date"] = date, ["title"] = title, ["positions"] = rows,
                ["honorar"] = honorar, ["labOwn"] = labOwn, ["labExt"] = labExt, ["total"] = total,
                ["findings"] = findings, ["symbols"] = symbols, ["notes"] = notes,
            };
        }
    }
}
