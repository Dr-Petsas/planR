using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using PlanR.Bridge;

namespace PlanR.Bridge.Dens;

/// <summary>
/// PlanR-Connector für DENSoffice: implementiert IConnector mit allen Routen aus dens_connector_service.py
/// und der Geschäftslogik aus dens_native.py.
/// </summary>
public sealed class DensConnector : IConnector
{
    readonly string patientFile;
    readonly string bank;
    readonly string? konfigDensIni;

    public DensConnector(string? patientFile = null, string? konfigDensIni = null)
    {
        this.konfigDensIni = konfigDensIni;
        if (!string.IsNullOrWhiteSpace(patientFile))
        {
            this.patientFile = Path.GetFullPath(patientFile);
            bank = Path.GetDirectoryName(this.patientFile)!;
        }
        else
        {
            var cfg = DensPfad.InstallationConfig(konfigDensIni);
            bank = cfg.Bank;
            this.patientFile = Path.Combine(bank, "PATIENT.DAT");
        }
    }

    public string BankPfad => bank;
    public string PatientDatei => patientFile;

    static bool IstZiffern(string s) => s.Length > 0 && s.All(c => c is >= '0' and <= '9');

    static Dictionary<string, string> ParseQuery(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(query)) return result;
        foreach (var part in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var idx = part.IndexOf('=');
            var key = Uri.UnescapeDataString((idx < 0 ? part : part[..idx]).Replace('+', ' '));
            var val = idx < 0 ? "" : Uri.UnescapeDataString(part[(idx + 1)..].Replace('+', ' '));
            result.TryAdd(key, val);
        }
        return result;
    }

    static (int Status, Dictionary<string, object?> Daten) Fehler(int status, string meldung) =>
        (status, new Dictionary<string, object?> { ["error"] = meldung });

    object? Native(string op, Dictionary<string, object?>? data = null) =>
        DensNative.Invoke(bank, op, data, konfigDensIni);

    // --- Geschäftslogik aus dens_native.py ---
    List<Dictionary<string, object?>> ReadPatients() =>
        ((List<object?>)Native("list")!).Cast<Dictionary<string, object?>>().ToList();

    static string Suchtext(Dictionary<string, object?> p)
    {
        var geburt = Convert.ToString(p.GetValueOrDefault("birthDate")) ?? "";
        var teile = geburt.Split('-');
        var deutsch = teile.Length == 3 && teile.All(IstZiffern) ? $"{teile[2]}.{teile[1]}.{teile[0]}" : "";
        return $"{p.GetValueOrDefault("id") ?? ""} {p.GetValueOrDefault("firstName") ?? ""} {p.GetValueOrDefault("lastName") ?? ""} {geburt} {deutsch}".ToLowerInvariant();
    }

    List<Dictionary<string, object?>> SearchPatients(string query, string firstName, string lastName, int limit)
    {
        var q = (query ?? "").Trim().ToLowerInvariant();
        var first = (firstName ?? "").Trim().ToLowerInvariant();
        var last = (lastName ?? "").Trim().ToLowerInvariant();
        if (Math.Max(q.Length, Math.Max(first.Length, last.Length)) > 80 || limit is < 1 or > 100)
            throw new ArgumentException("Suchbegriff oder Suchgrenze ist ungültig.");
        if (q.Length == 0 && first.Length == 0 && last.Length == 0) return [];
        var hits = new List<Dictionary<string, object?>>();
        foreach (var p in ReadPatients())
        {
            var fn = (Convert.ToString(p.GetValueOrDefault("firstName")) ?? "").ToLowerInvariant();
            var ln = (Convert.ToString(p.GetValueOrDefault("lastName")) ?? "").ToLowerInvariant();
            if (first.Length > 0 && !fn.Contains(first, StringComparison.Ordinal)) continue;
            if (last.Length > 0 && !ln.Contains(last, StringComparison.Ordinal)) continue;
            if (q.Length > 0 && !Suchtext(p).Contains(q, StringComparison.Ordinal)) continue;
            hits.Add(p);
            if (hits.Count >= limit) break;
        }
        return hits;
    }

    Dictionary<string, object?>? PatientById(string patientId)
    {
        if (!IstZiffern(patientId)) return null;
        return Native("patient", new Dictionary<string, object?> { ["id"] = int.Parse(patientId).ToString() }) as Dictionary<string, object?>;
    }

    Dictionary<string, object?> ClinicalList(string patientId)
    {
        var result = (Dictionary<string, object?>)Native("clinical-list", new Dictionary<string, object?> { ["id"] = patientId })!;
        DensBefund.AnnotateBefunde(result);
        DensHkp.AnnotateHkps(result);
        return result;
    }

    List<object?> HkpsOffen()
    {
        var rows = ((List<object?>)Native("open-plans", new Dictionary<string, object?>())!).Cast<Dictionary<string, object?>>();
        var items = rows.Select(r => new Dictionary<string, object?>
        {
            ["patient"] = r["patient"], ["number"] = r["number"], ["title"] = r["title"],
            ["name"] = r["name"], ["vorname"] = r["vorname"],
            ["date"] = string.IsNullOrEmpty(Convert.ToString(r["date"])) ? null : r["date"],
            ["genehmigt"] = r["genehmigt"], ["eingliederung"] = null,
        }).ToList();
        items.Sort((a, b) =>
        {
            var cmp = string.CompareOrdinal(Convert.ToString(b["genehmigt"]), Convert.ToString(a["genehmigt"]));
            return cmp != 0 ? cmp : Convert.ToInt32(b["number"]).CompareTo(Convert.ToInt32(a["number"]));
        });
        return items.Take(2000).Cast<object?>().ToList();
    }

    Dictionary<string, object?> PraxisKatalog()
    {
        var labor = (List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!;
        var goz = (List<object?>)Native("service-catalog", new Dictionary<string, object?> { ["numbers"] = new[] { "*" } })!;
        return DensKvaPze.PraxisKatalogBauen(labor, goz);
    }

    Dictionary<string, object?> LeistungsKatalog()
    {
        var zeilen = (List<object?>)Native("service-catalog", new Dictionary<string, object?> { ["numbers"] = new[] { "**" } })!;
        var gewaehlt = new Dictionary<(string Art, string Nr), (bool Gilt, Dictionary<string, object?> Item)>();
        var reihenfolge = new List<(string Art, string Nr)>();
        foreach (var zeile in zeilen.OfType<Dictionary<string, object?>>())
        {
            var nr = (Convert.ToString(zeile.GetValueOrDefault("number")) ?? "").Trim();
            if (nr.Length == 0) continue;
            string art;
            if (zeile.TryGetValue("kasse", out var kv) && kv is true) art = "bema";
            else if (nr[0] is 'Ä' or 'ä') art = "goae";
            else if (nr.Length is 4 or 5 && nr[..4].All(char.IsDigit)) art = "goz";
            else art = "sonst";
            var gilt = string.IsNullOrEmpty(Convert.ToString(zeile.GetValueOrDefault("to")));
            var key = (art, nr);
            if (gewaehlt.TryGetValue(key, out var alt) && (alt.Gilt || !gilt)) continue;
            if (!gewaehlt.ContainsKey(key)) reihenfolge.Add(key);
            gewaehlt[key] = (gilt, new Dictionary<string, object?>
            {
                ["art"] = art, ["nr"] = nr,
                ["kuerzel"] = (Convert.ToString(zeile.GetValueOrDefault("code")) ?? "").Trim(),
                ["text"] = (Convert.ToString(zeile.GetValueOrDefault("text")) ?? "").Trim(),
                ["punkte"] = Convert.ToInt32(zeile.GetValueOrDefault("points") ?? 0),
            });
        }
        var items = reihenfolge.Where(k => gewaehlt[k].Gilt).Select(k => (object?)gewaehlt[k].Item).ToList();
        return new Dictionary<string, object?> { ["items"] = items, ["total"] = items.Count };
    }

    string BefundMerkPfad(string patientId)
    {
        var dir = Environment.GetEnvironmentVariable("DENS_BEFUND_DIR");
        if (string.IsNullOrWhiteSpace(dir)) dir = Path.Combine(AppContext.BaseDirectory, "befund01");
        var tenant = DensPfad.InstallationConfig(konfigDensIni).Tenant;
        return Path.Combine(dir, $"{tenant}-{int.Parse(patientId)}.json");
    }

    static readonly JsonSerializerOptions JsonOpt = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    Dictionary<string, Dictionary<string, object?>> MerkLesen(string patientId)
    {
        var d = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        try
        {
            var pfad = BefundMerkPfad(patientId);
            if (!File.Exists(pfad)) return d;
            using var doc = JsonDocument.Parse(File.ReadAllText(pfad, Encoding.UTF8));
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
                foreach (var p in doc.RootElement.EnumerateObject())
                    if (p.Value.ValueKind == JsonValueKind.Object && DensKvaPze.AusJson(p.Value) is Dictionary<string, object?> val)
                        d[p.Name] = val;
        }
        catch { }
        return d;
    }

    string BackupDir()
    {
        var env = Environment.GetEnvironmentVariable("DENS_BACKUP_DIR");
        return string.IsNullOrWhiteSpace(env) ? Path.Combine(AppContext.BaseDirectory, "backups") : env;
    }

    void BankSichern(string anlass)
    {
        var ordner = BackupDir();
        var ziel = Path.Combine(ordner, $"{DateTime.Now:yyyyMMdd-HHmmss}-{anlass}");
        Directory.CreateDirectory(ziel);
        foreach (var datei in Directory.EnumerateFiles(bank))
            File.Copy(datei, Path.Combine(ziel, Path.GetFileName(datei)), true);
    }

    Dictionary<string, object?>? Befund01Lesen(string patientId)
    {
        var id = int.Parse(patientId).ToString();
        if (Native("patient", new Dictionary<string, object?> { ["id"] = id }) is null) return null;
        var overview = (Dictionary<string, object?>)Native("clinical-list", new Dictionary<string, object?> { ["id"] = id })!;
        var befunde = overview.GetValueOrDefault("befunde") as List<object?>;
        return DensBefund.Lesen(DensBefund.Aktueller(befunde), MerkLesen(patientId));
    }

    Dictionary<string, object?> Befund01Schreiben(string patientId, string version, Dictionary<string, object?> teeth)
    {
        var overview = (Dictionary<string, object?>)Native("clinical-list", new Dictionary<string, object?> { ["id"] = patientId })!;
        var befund = DensBefund.Aktueller(overview.GetValueOrDefault("befunde") as List<object?>);
        var merk = MerkLesen(patientId);
        if (Convert.ToString(DensBefund.Lesen(befund, merk)["version"]) != version)
            throw new BefundKonflikt("Der Befund in DENSoffice hat sich geändert. Bitte neu lesen.");
        var (saetze, neuMerk, geaendert, gemerkt) = DensBefund.Auftrag(befund, merk, teeth, DensBefund.ZahnVorlage);
        var inDens = new List<string>();
        if (saetze.Count > 0)
        {
            var bdir = BackupDir();
            var alt = Directory.Exists(bdir)
                ? Directory.EnumerateDirectories(bdir, "*-befund").OrderBy(p => p, StringComparer.Ordinal).ToList()
                : [];
            if (alt.Count == 0 || (DateTime.UtcNow - Directory.GetLastWriteTimeUtc(alt[^1])).TotalSeconds > 1800)
                BankSichern("befund");
            var geschrieben = saetze.Select(Convert.ToBase64String).ToHashSet(StringComparer.Ordinal);
            var sortedGeschrieben = geschrieben.OrderBy(s => s, StringComparer.Ordinal).ToList();
            var res = (Dictionary<string, object?>)Native("befund", new Dictionary<string, object?>
            {
                ["id"] = patientId, ["replaceTeeth"] = true, ["toothRecords"] = sortedGeschrieben,
            })!;
            var ov2 = (Dictionary<string, object?>)Native("clinical-list", new Dictionary<string, object?> { ["id"] = patientId })!;
            var stored = (ov2["befunde"] as List<object?>)?.OfType<Dictionary<string, object?>>()
                .FirstOrDefault(b => Convert.ToInt32(b["number"]) == Convert.ToInt32(res["number"]));
            var storedData = stored is null ? [] : ((List<object?>)stored["teeth"]!).Cast<Dictionary<string, object?>>()
                .Select(t => Convert.ToString(t["data"])!).OrderBy(s => s, StringComparer.Ordinal).ToList();
            var writtenData = ((List<object?>)res["writtenToothRecords"]!).Select(x => Convert.ToString(x)!).OrderBy(s => s, StringComparer.Ordinal).ToList();
            if (stored is null || !storedData.SequenceEqual(writtenData) || !geschrieben.IsSubsetOf(storedData))
                throw new DensReadError("Befund gespeichert, aber Rückleseprüfung fehlgeschlagen.");
            befund = stored;
            inDens = saetze.Select(s => BitConverter.ToInt16(s, 0).ToString()).OrderBy(s => s, StringComparer.Ordinal).ToList();
        }
        var datei = BefundMerkPfad(patientId);
        Directory.CreateDirectory(Path.GetDirectoryName(datei)!);
        File.WriteAllText(datei, JsonSerializer.Serialize(neuMerk, JsonOpt), Encoding.UTF8);
        var neu = DensBefund.Lesen(befund, neuMerk);
        var currentTeeth = (Dictionary<string, object?>)((Dictionary<string, object?>)neu["current"]!)["teeth"]!;
        foreach (var (z, w) in teeth)
        {
            var soll = DensBefund.Eingang(Convert.ToString(w) ?? "");
            var cur = (Dictionary<string, object?>)currentTeeth[z]!;
            if (Convert.ToString(cur["status"]) != soll)
                throw new DensReadError("Befund gespeichert, aber der gelesene Stand weicht ab.");
        }
        return new Dictionary<string, object?>
        {
            ["selectedTeeth"] = geaendert, ["writtenToDens"] = inDens, ["heldByBridge"] = gemerkt,
            ["message"] = DensBefund.Meldung(geaendert, inDens, gemerkt),
            ["version"] = neu["version"], ["current"] = neu["current"],
        };
    }

    static bool PlanbefundVoll() => Environment.GetEnvironmentVariable("DENS_PLANBEFUND_VOLL") != "0";

    static bool PlanbefundPruefen(Dictionary<string, object?>? befund, int art, int planNummer, List<string> planZaehne, List<string>? geschrieben)
    {
        if (befund is null || Convert.ToInt32(befund.GetValueOrDefault("kind") ?? 0) != art
            || Convert.ToInt32(befund.GetValueOrDefault("planNumber") ?? 0) != planNummer)
            return false;
        var zaehne = ((List<object?>)befund["teeth"]!).Cast<Dictionary<string, object?>>()
            .Select(t => Convert.ToString(t["data"])!).OrderBy(s => s, StringComparer.Ordinal).ToList();
        var erwartet = (geschrieben ?? planZaehne).OrderBy(s => s, StringComparer.Ordinal).ToList();
        return planZaehne.ToHashSet(StringComparer.Ordinal).IsSubsetOf(zaehne) && zaehne.SequenceEqual(erwartet);
    }

    Dictionary<string, object?> CreateClinicalHkp(string patientId, string planJson)
    {
        Dictionary<string, object?> imported;
        try { imported = DensHkp.ParsePlanrHkp(planJson); }
        catch (Exception exc) when (exc is HkpImportError or KuerzelError or ArgumentException or EncoderFallbackException)
        { throw new ArgumentException(exc.Message, exc); }

        Dictionary<string, object?> bundle;
        try
        {
            var labPositions = (List<Dictionary<string, object?>>)imported["labPositions"]!;
            if (labPositions.Count > 0)
            {
                var katalog = DensKvaPze.KatalogAusNative((List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!);
                DensKvaPze.LaborkuerzelZuordnen(labPositions, katalog, DensKvaPze.ZuordnungLaden(), neu =>
                {
                    Native("lab-catalog-add", new Dictionary<string, object?> { ["entries"] = neu });
                    return DensKvaPze.KatalogAusNative((List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!);
                });
            }
            bundle = DensHkp.EncodeHkpBundle(imported);
        }
        catch (Exception exc) when (exc is KatalogError or KuerzelError or ArgumentException or EncoderFallbackException)
        { throw new ArgumentException(exc.Message, exc); }

        var data = new Dictionary<string, object?>(bundle, StringComparer.Ordinal) { ["id"] = patientId };
        if (data.ContainsKey("planFinding") && PlanbefundVoll()) data["planFindingFull"] = true;
        var result = (Dictionary<string, object?>)Native("hkp", data)!;
        var overview = (Dictionary<string, object?>)Native("clinical-list", new Dictionary<string, object?> { ["id"] = patientId })!;
        var planNr = Convert.ToInt32(result["number"]);
        var plan = (overview["hkps"] as List<object?>)?.OfType<Dictionary<string, object?>>()
            .FirstOrDefault(p => Convert.ToInt32(p["number"]) == planNr);
        if (plan is null) throw new DensReadError("Gespeichert, aber Rückleseprüfung fehlgeschlagen.");
        if (!Equals(plan.GetValueOrDefault("data"), result.GetValueOrDefault("writtenPlan"))
            || !JsonGleich(plan.GetValueOrDefault("positions"), result.GetValueOrDefault("writtenServices")))
            throw new DensReadError("Gespeicherter HKP oder seine Positionen stimmen nicht mit der Eingabe überein.");
        if (data.ContainsKey("planFinding"))
        {
            var pfNr = Convert.ToInt32(result["planFindingNumber"]);
            var finding = (overview["befunde"] as List<object?>)?.OfType<Dictionary<string, object?>>()
                .FirstOrDefault(p => Convert.ToInt32(p["number"]) == pfNr);
            if (finding is null || Convert.ToInt32(finding["kind"]) != 3 || Convert.ToInt32(finding["planNumber"]) != planNr)
                throw new DensReadError("Verknüpfter Prothetikbefund konnte nicht bestätigt werden.");
            var writtenPt = (result.GetValueOrDefault("writtenPlanTeeth") as List<object?>)?.Select(x => Convert.ToString(x)!).ToList();
            if (!PlanbefundPruefen(finding, 3, planNr, (List<string>)data["planTeeth"]!, writtenPt))
                throw new DensReadError("Prothetikbefund-Zähne stimmen nicht mit der Eingabe überein.");
        }
        var lab = plan.GetValueOrDefault("laboratory") as Dictionary<string, object?>;
        var labSrv = (List<string>)data["labServices"]!;
        if (lab is null || ((List<object?>)lab["positions"]!).Count != labSrv.Count)
            throw new DensReadError("Verknüpfte Laborplanung konnte nicht bestätigt werden.");
        foreach (var field in new[] { "writtenPlan", "writtenServices", "writtenToothRecords", "writtenPlanTeeth" })
            result.Remove(field);
        DensBefund.AnnotateBefunde(overview);
        DensHkp.AnnotateHkps(overview);
        var hinweise = (List<string>)imported["hinweise"]!;
        if (hinweise.Count > 0) result["hinweise"] = hinweise;
        result["overview"] = overview;
        result["source"] = "planr";
        return result;
    }

    static bool PlaeneAbgeschaltet() =>
        Environment.GetEnvironmentVariable("DENS_PLAENE_AUS") == "1"
        || File.Exists(Path.Combine(AppContext.BaseDirectory, "PLAENE-AUS"));

    void AnalogSichern(Dictionary<string, object?> plan)
    {
        var analog = DensKvaPze.AnalogZiffern(plan);
        if (analog.Count == 0) return;
        var nummern = analog.Keys.Concat(analog.Keys.Select(n => n[..4]).Distinct().OrderBy(s => s, StringComparer.Ordinal)).ToList();
        var stand = (List<object?>)Native("service-catalog", new Dictionary<string, object?> { ["numbers"] = nummern })!;
        var vorhanden = stand.Cast<Dictionary<string, object?>>()
            .Select(r => (Convert.ToString(r["number"]) ?? "").ToUpperInvariant()).ToHashSet(StringComparer.Ordinal);
        var neu = new List<Dictionary<string, object?>>();
        foreach (var (nummer, text) in analog)
        {
            if (vorhanden.Contains(nummer)) continue;
            if (!vorhanden.Contains(nummer[..4]))
                throw new ArgumentException($"GOZ {nummer[..4]} fehlt im DENS-Leistungskatalog – die Analogziffer {nummer.ToLowerInvariant()} lässt sich nicht anlegen.");
            var kurz = text.Contains("analog", StringComparison.OrdinalIgnoreCase) ? text : $"{text} (analog {nummer[..4]})";
            var kurzSafe = DensPfad.Cp1252.GetString(DensPfad.Cp1252.GetBytes(kurz));
            if (kurzSafe.Length > 127) kurzSafe = kurzSafe[..127];
            var lang = $"{text} – entsprechend GOZ {nummer[..4]} gemäß § 6 Abs. 1 GOZ";
            var langSafe = DensPfad.Cp1252.GetString(DensPfad.Cp1252.GetBytes(lang));
            if (langSafe.Length > 499) langSafe = langSafe[..499];
            neu.Add(new Dictionary<string, object?>
            {
                ["number"] = nummer, ["base"] = nummer[..4], ["code"] = $"AN{nummer}",
                ["text"] = kurzSafe, ["longText"] = langSafe,
            });
        }
        if (neu.Count > 0) Native("service-catalog-add", new Dictionary<string, object?> { ["entries"] = neu });
    }

    Dictionary<string, object?> WritePrivatZe(string patientId, Dictionary<string, object?> plan)
    {
        Dictionary<string, object?> bundle;
        Dictionary<string, object?> nativeData;
        try
        {
            AnalogSichern(plan);
            var katalog = (List<object?>)Native("service-catalog", new Dictionary<string, object?> { ["numbers"] = DensKvaPze.GebissNummern(plan) })!;
            var punkte = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var k in katalog.OfType<Dictionary<string, object?>>())
                punkte[Convert.ToString(k["number"])!] = Convert.ToInt32(k["points"]);
            bundle = DensKvaPze.EncodePrivatZe(plan, punkte);
            var labPositions = (List<Dictionary<string, object?>>)bundle["labPositions"]!;
            if (labPositions.Count > 0)
            {
                var labor = DensKvaPze.KatalogAusNative((List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!);
                DensKvaPze.LaborkuerzelZuordnen(labPositions, labor, DensKvaPze.ZuordnungLaden(), neu =>
                {
                    Native("lab-catalog-add", new Dictionary<string, object?> { ["entries"] = neu });
                    return DensKvaPze.KatalogAusNative((List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!);
                });
            }
            nativeData = new Dictionary<string, object?>(DensKvaPze.EncodePrivatLabor(bundle), StringComparer.Ordinal)
            {
                ["id"] = patientId, ["services"] = bundle["services"],
                ["reasons"] = bundle["reasons"], ["planTeeth"] = bundle["planTeeth"],
            };
            if (bundle.TryGetValue("planFinding", out var pf))
            {
                nativeData["planFinding"] = pf;
                if (PlanbefundVoll()) nativeData["planFindingFull"] = true;
            }
            if (!nativeData.ContainsKey("labServices"))
                throw new KvaImportError("DENS verlangt zum Privatplan eine Laborplanung; der Plan hat keine Labor- oder Materialzeile.");
        }
        catch (Exception exc) when (exc is KatalogError or KvaImportError or KuerzelError or ArgumentException or EncoderFallbackException)
        { throw new ArgumentException(exc.Message, exc); }

        var result = (Dictionary<string, object?>)Native("privat-hkp", nativeData)!;
        var stored = (Dictionary<string, object?>)Native("clinical-list", new Dictionary<string, object?> { ["id"] = patientId })!;
        var planNr = Convert.ToInt32(result["number"]);
        var hkp = (stored["hkps"] as List<object?>)?.OfType<Dictionary<string, object?>>()
            .FirstOrDefault(h => Convert.ToInt32(h["number"]) == planNr);
        if (hkp is null) throw new DensReadError("Gespeichert, aber Rückleseprüfung fehlgeschlagen.");
        if (!Equals(hkp["data"], result["writtenPlan"])
            || !JsonGleich(hkp["positions"], result["writtenServices"])
            || !JsonGleich(hkp.GetValueOrDefault("reasons"), result["writtenReasons"])
            || !JsonGleich(hkp.GetValueOrDefault("laboratory"), result["writtenLab"]))
            throw new DensReadError("Gespeicherter Privatplan stimmt nicht mit der Eingabe überein.");
        var pfNr = Convert.ToInt32(result["planFindingNumber"]);
        if (pfNr != 0)
        {
            var befund = (stored["befunde"] as List<object?>)?.OfType<Dictionary<string, object?>>()
                .FirstOrDefault(b => Convert.ToInt32(b["number"]) == pfNr);
            var writtenPt = (result.GetValueOrDefault("writtenPlanTeeth") as List<object?>)?.Select(x => Convert.ToString(x)!).ToList();
            if (!PlanbefundPruefen(befund, 2, planNr, (List<string>)bundle["planTeeth"]!, writtenPt))
                throw new DensReadError("Planbefund zum Privatplan stimmt nicht mit der Eingabe überein.");
        }
        var reasons = (List<List<string>>)bundle["reasons"]!;
        return new Dictionary<string, object?>
        {
            ["id"] = result["id"], ["number"] = result["number"], ["title"] = bundle["title"],
            ["services"] = ((List<string>)bundle["services"]!).Count,
            ["labPositions"] = ((List<Dictionary<string, object?>>)bundle["labPositions"]!).Count,
            ["reasons"] = reasons.Count(r => r.Count > 0),
            ["skipped"] = new List<Dictionary<string, object?>>(),
            ["source"] = "planr", ["kind"] = "privatprothetik",
        };
    }

    Dictionary<string, object?> CreateKva(string patientId, string planJson)
    {
        if (PlaeneAbgeschaltet()) throw new DensReadError("Planexport nach DENS ist abgeschaltet (Notaus).");
        Dictionary<string, object?> plan;
        List<string> nummern;
        try
        {
            using var doc = JsonDocument.Parse(planJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                throw new KvaImportError("Kein PlanR-Plan (format planr-plan, Version 1).");
            plan = (Dictionary<string, object?>)DensKvaPze.AusJson(doc.RootElement)!;
            if (Convert.ToString(plan.GetValueOrDefault("art")) == "ZE" && DensKvaPze.PasstInPrivatprothetik(plan))
                return WritePrivatZe(patientId, plan);
            nummern = DensKvaPze.KatalogNummern(plan);
        }
        catch (Exception exc) when (exc is KvaImportError or JsonException or ArgumentException)
        { throw new ArgumentException($"Kein gültiger PlanR-Plan: {exc.Message}", exc); }

        Dictionary<string, object?> bundle;
        try
        {
            AnalogSichern(plan);
            var katalog = nummern.Count > 0
                ? (List<object?>)Native("service-catalog", new Dictionary<string, object?> { ["numbers"] = nummern })!
                : new List<object?>();
            var vorhanden = DensKvaPze.KatalogZiffern(katalog);
            var goaeSkipped = new List<Dictionary<string, object?>>();
            if (Convert.ToString(plan.GetValueOrDefault("art")) == "ZE")
            {
                (plan, goaeSkipped) = DensKvaPze.PositionenOhneFehlendeGoae(plan, vorhanden);
                if (DensKvaPze.PasstInPrivatprothetik(plan))
                {
                    var res = WritePrivatZe(patientId, plan);
                    res["skipped"] = goaeSkipped;
                    return res;
                }
            }
            bundle = DensKvaPze.EncodeKva(plan, DensKvaPze.KuerzelAusKatalog(katalog, Convert.ToString(plan.GetValueOrDefault("datum"))),
                arten: ["KO", "IM", "ZE"], katalog: vorhanden.Count > 0 ? vorhanden : null);
            var bSkipped = (List<Dictionary<string, object?>>)bundle["skipped"]!;
            bundle["skipped"] = goaeSkipped.Concat(bSkipped).ToList();
        }
        catch (Exception exc) when (exc is KvaImportError or ArgumentException or EncoderFallbackException)
        { throw new ArgumentException(exc.Message, exc); }

        Dictionary<string, object?> labor;
        try
        {
            labor = new Dictionary<string, object?>();
            var labPositions = (List<Dictionary<string, object?>>)bundle["labPositions"]!;
            if (labPositions.Count > 0)
            {
                var labKatalog = DensKvaPze.KatalogAusNative((List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!);
                DensKvaPze.LaborkuerzelZuordnen(labPositions, labKatalog, DensKvaPze.ZuordnungLaden(), neu =>
                {
                    Native("lab-catalog-add", new Dictionary<string, object?> { ["entries"] = neu });
                    return DensKvaPze.KatalogAusNative((List<object?>)Native("lab-catalog", new Dictionary<string, object?>())!);
                });
                labor = DensKvaPze.EncodeLabor(labPositions);
            }
        }
        catch (Exception exc) when (exc is KatalogError or KvaImportError or ArgumentException or EncoderFallbackException)
        { throw new ArgumentException(exc.Message, exc); }

        var payload = new Dictionary<string, object?>(labor, StringComparer.Ordinal)
        {
            ["id"] = patientId, ["kva"] = bundle["kva"], ["services"] = bundle["services"],
            ["notes"] = bundle["notes"], ["reasons"] = bundle["reasons"],
        };
        var result = (Dictionary<string, object?>)Native("kva", payload)!;
        var kvaList = (List<object?>)Native("kva-list", new Dictionary<string, object?> { ["id"] = patientId })!;
        var stored = kvaList.OfType<Dictionary<string, object?>>().FirstOrDefault(k => Convert.ToInt32(k["number"]) == Convert.ToInt32(result["number"]));
        if (stored is null) throw new DensReadError("Gespeichert, aber Rückleseprüfung fehlgeschlagen.");
        var erwarteteNotizen = ((List<object?>)result["writtenNotes"]!)
            .Select(n => string.IsNullOrEmpty(Convert.ToString(n)) ? new List<object?>() : new List<object?> { n }).ToList();
        if (!Equals(stored["data"], result["writtenKva"])
            || !JsonGleich(stored["services"], result["writtenServices"])
            || !JsonGleich(stored["notes"], erwarteteNotizen)
            || !JsonGleich(stored.GetValueOrDefault("reasons"), result["writtenReasons"]))
            throw new DensReadError("Gespeicherter Kostenvoranschlag stimmt nicht mit der Eingabe überein.");
        if (!JsonGleich(stored.GetValueOrDefault("laboratory"), result.GetValueOrDefault("writtenLab")))
            throw new DensReadError("Gespeicherter Beleg zum Kostenvoranschlag stimmt nicht mit der Eingabe überein.");
        var reasons = (List<List<string>>)bundle["reasons"]!;
        return new Dictionary<string, object?>
        {
            ["id"] = result["id"], ["number"] = result["number"], ["title"] = bundle["title"],
            ["services"] = ((List<string>)bundle["services"]!).Count,
            ["labPositions"] = ((List<Dictionary<string, object?>>)bundle["labPositions"]!).Count,
            ["reasons"] = reasons.Count(r => r.Count > 0),
            ["skipped"] = bundle["skipped"], ["source"] = "planr",
        };
    }

    Dictionary<string, object?> LeistungSchreiben(string patientId, string code, string zahn, object? anzahlObj)
    {
        if (!IstZiffern(patientId)) throw new ArgumentException("Patientennummer fehlt.");
        code = (code ?? "").Trim();
        zahn = (zahn ?? "").Trim();
        if (code.Length == 0 || code.Length > 7) throw new ArgumentException("Ziffer fehlt.");
        if (zahn.Length > 41) throw new ArgumentException("Zahn ist zu lang.");
        int anzahl;
        try { anzahl = Convert.ToInt32(anzahlObj ?? 1); }
        catch { throw new ArgumentException("Anzahl fehlt."); }
        if (anzahl is < 1 or > 99) throw new ArgumentException("Anzahl muss zwischen 1 und 99 liegen.");
        try { DensPfad.Cp1252Strict.GetBytes(code); DensPfad.Cp1252Strict.GetBytes(zahn); }
        catch (EncoderFallbackException) { throw new ArgumentException("Ziffer oder Zahn enthält Zeichen, die DENS nicht speichert."); }
        var result = (Dictionary<string, object?>)Native("leistung", new Dictionary<string, object?>
        {
            ["id"] = int.Parse(patientId).ToString(), ["code"] = code, ["zahn"] = zahn, ["anzahl"] = anzahl,
        })!;
        if (Convert.ToString(result.GetValueOrDefault("kind")) != code
            || Convert.ToString(result.GetValueOrDefault("zahn")) != zahn
            || Convert.ToInt32(result.GetValueOrDefault("anzahl") ?? 0) != anzahl)
            throw new DensReadError("Abrechnungsposition wurde abweichend gespeichert.");
        return result;
    }

    Dictionary<string, object?> Dokumentieren(string patientId, string text, string? datum)
    {
        if (!IstZiffern(patientId)) throw new ArgumentException("Patientennummer fehlt.");
        var tag = string.IsNullOrEmpty(datum) ? DateTime.Now.ToString("yyyy-MM-dd") : datum;
        if (!DateOnly.TryParseExact(tag, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            throw new ArgumentException("Ungültiges Datum.");
        var pages = DensKvaPze.NotizSeiten(text);
        var result = (Dictionary<string, object?>)Native("documentation", new Dictionary<string, object?>
        {
            ["id"] = patientId, ["text"] = text, ["date"] = tag,
            ["pages"] = pages.Select(Convert.ToBase64String).ToList(),
        })!;
        if (Convert.ToString(result.GetValueOrDefault("text")) != text
            || Convert.ToString(result.GetValueOrDefault("kind")) != "Notiz"
            || Convert.ToInt32(result.GetValueOrDefault("pages") ?? 0) != pages.Count)
            throw new DensReadError("Dokumentation wurde abweichend gespeichert.");
        return result;
    }

    static bool JsonGleich(object? a, object? b) =>
        JsonSerializer.Serialize(a, JsonOpt) == JsonSerializer.Serialize(b, JsonOpt);

    // --- IConnector ---
    public (int Status, Dictionary<string, object?> Daten) Rufen(
        string methode, string pfadMitQuery, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms)
    {
        var qIdx = pfadMitQuery.IndexOf('?');
        var pfad = qIdx < 0 ? pfadMitQuery : pfadMitQuery[..qIdx];
        var query = qIdx < 0 ? "" : pfadMitQuery[(qIdx + 1)..];
        var m = methode.ToUpperInvariant();
        if (m == "GET") return Get(pfad, query);
        if (m == "POST") return Post(pfad, body);
        return Fehler(404, "Route nicht gefunden.");
    }

    (int Status, Dictionary<string, object?> Daten) Get(string pfad, string queryString)
    {
        if (pfad == "/kartei-stand")
        {
            var teile = new List<string>();
            foreach (var name in new[] { "behandl.dat", "behandl.key" })
            {
                var p = Path.Combine(bank, name);
                if (File.Exists(p))
                {
                    var fi = new FileInfo(p);
                    var ns = (fi.LastWriteTimeUtc - DateTime.UnixEpoch).Ticks * 100L;
                    teile.Add($"{name}:{ns}:{fi.Length}");
                }
            }
            return (200, new Dictionary<string, object?> { ["stand"] = string.Join('|', teile) });
        }
        if (pfad == "/health")
        {
            try
            {
                var lm = DensPfad.LockManagerConfig(konfigDensIni);
                return (200, new Dictionary<string, object?>
                {
                    ["service"] = "dens-connector", ["mode"] = "native-shared",
                    ["patientCreate"] = true, ["clinicalCreate"] = true,
                    ["lockManagerType"] = lm.LockManagerType, ["lockManagerAddress"] = lm.LockManagerAddress,
                });
            }
            catch (DensReadError exc) { return Fehler(503, exc.Message); }
        }
        try
        {
            if (pfad == "/hkps/offen") return (200, new Dictionary<string, object?> { ["items"] = HkpsOffen() });
            if (pfad == "/leistungskatalog") return (200, LeistungsKatalog());
            if (pfad == "/praxis/katalog") return (200, PraxisKatalog());
            if (pfad == "/patients")
            {
                var q = ParseQuery(queryString);
                if (q.GetValueOrDefault("alle") == "1")
                {
                    var alle = ReadPatients();
                    return (200, new Dictionary<string, object?> { ["items"] = alle, ["total"] = alle.Count });
                }
                int limit;
                try
                {
                    if (!int.TryParse(q.GetValueOrDefault("limit", "100"), NumberStyles.Integer, CultureInfo.InvariantCulture, out limit))
                        throw new ArgumentException("Suchgrenze ist ungültig.");
                    var items = SearchPatients(
                        q.GetValueOrDefault("q", ""),
                        q.TryGetValue("firstName", out var fn) ? fn : q.GetValueOrDefault("vorname", ""),
                        q.TryGetValue("lastName", out var ln) ? ln : q.GetValueOrDefault("nachname", ""),
                        limit);
                    return (200, new Dictionary<string, object?> { ["items"] = items, ["total"] = items.Count, ["limit"] = limit });
                }
                catch (ArgumentException exc)
                { return Fehler(400, string.IsNullOrEmpty(exc.Message) ? "Suchgrenze ist ungültig." : exc.Message); }
            }
            var parts = pfad.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 5 && parts[0] == "patients" && IstZiffern(parts[1]) && parts[2] == "hkps" && IstZiffern(parts[3]) && parts[4] == "planr")
            {
                var patient = PatientById(parts[1]);
                var cl = ClinicalList(parts[1]);
                var plan = (cl["hkps"] as List<object?>)?.OfType<Dictionary<string, object?>>()
                    .FirstOrDefault(h => Convert.ToString(h["number"]) == parts[3]);
                if (patient is null || plan is null) return Fehler(404, "HKP nicht gefunden.");
                return (200, DensHkp.PlanrAusDens(patient, plan));
            }
            if (parts.Length == 4 && parts[0] == "patients" && IstZiffern(parts[1]) && parts[2] == "befunde" && parts[3] == "01")
            {
                var befund = Befund01Lesen(parts[1]);
                return befund is not null ? (200, befund) : Fehler(404, "Patient nicht gefunden.");
            }
            if (parts.Length == 3 && parts[0] == "patients" && IstZiffern(parts[1]) && parts[2] == "clinical")
                return (200, ClinicalList(parts[1]));
            if (parts.Length == 2 && parts[0] == "patients")
            {
                var item = PatientById(parts[1]);
                return item is not null ? (200, item) : Fehler(404, "Patient nicht gefunden.");
            }
        }
        catch (DensReadError exc) { return Fehler(503, exc.Message); }
        return Fehler(404, "Route nicht gefunden.");
    }

    (int Status, Dictionary<string, object?> Daten) Post(string pfad, JsonElement? body)
    {
        var teile = pfad.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (teile.Length == 4 && teile[0] == "patients" && IstZiffern(teile[1]) && teile[2] == "befunde" && teile[3] == "01")
        {
            try
            {
                if (body is null) throw new ArgumentException("Ungültige Anfragegröße.");
                var root = body.Value;
                if (root.ValueKind != JsonValueKind.Object
                    || !root.TryGetProperty("version", out var vEl) || vEl.ValueKind != JsonValueKind.String
                    || !root.TryGetProperty("teeth", out var tEl) || tEl.ValueKind != JsonValueKind.Object)
                    throw new ArgumentException("Body muss {\"version\":\"…\",\"teeth\":{…}} sein.");
                if (PatientById(teile[1]) is null) return Fehler(404, "Patient nicht gefunden.");
                var teeth = (Dictionary<string, object?>)DensKvaPze.AusJson(tEl)!;
                return (201, Befund01Schreiben(teile[1], vEl.GetString()!, teeth));
            }
            catch (BefundKonflikt exc) { return Fehler(409, exc.Message); }
            catch (Exception exc) when (exc is BefundFehler or ArgumentException or JsonException or DecoderFallbackException)
            { return Fehler(400, exc.Message); }
            catch (DensReadError exc) { return Fehler(503, exc.Message); }
        }
        if (teile.Length == 4 && teile[0] == "patients" && IstZiffern(teile[1]) && teile[2] == "plaene" && teile[3] == "import")
        {
            try
            {
                if (body is null) throw new ArgumentException("Ungültige Anfragegröße.");
                var root = body.Value;
                if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 1
                    || !root.TryGetProperty("json", out var jEl) || jEl.ValueKind != JsonValueKind.String)
                    throw new ArgumentException("Body muss {\"json\":\"<PlanR-Plan>\"} sein.");
                var result = CreateKva(teile[1], jEl.GetString()!);
                result["label"] = Convert.ToString(result.GetValueOrDefault("kind")) == "privatprothetik" ? "Privatprothetik" : "Kostenvoranschlag";
                result["hinweise"] = DensKvaPze.KvaHinweise((List<Dictionary<string, object?>>)result["skipped"]!);
                return (201, result);
            }
            catch (Exception exc) when (exc is ArgumentException or JsonException or DecoderFallbackException)
            { return Fehler(400, exc.Message); }
            catch (DensReadError exc) { return Fehler(503, exc.Message); }
        }
        if (teile.Length == 3 && teile[0] == "patients" && IstZiffern(teile[1]) && teile[2] == "hkps")
        {
            try
            {
                if (body is null) throw new ArgumentException("Ungültige Anfragegröße.");
                var root = body.Value;
                if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 1
                    || !root.TryGetProperty("json", out var jEl) || jEl.ValueKind != JsonValueKind.String)
                    throw new ArgumentException("Body muss {\"json\":\"<PlanR-HKP>\"} sein.");
                return (201, CreateClinicalHkp(teile[1], jEl.GetString()!));
            }
            catch (Exception exc) when (exc is ArgumentException or JsonException or DecoderFallbackException)
            { return Fehler(400, exc.Message); }
            catch (DensReadError exc) { return Fehler(503, exc.Message); }
        }
        if (teile.Length == 3 && teile[0] == "patients" && IstZiffern(teile[1]) && teile[2] == "leistung")
        {
            try
            {
                if (body is null) throw new ArgumentException("Ungültige Anfragegröße.");
                var root = body.Value;
                if (root.ValueKind != JsonValueKind.Object
                    || root.EnumerateObject().Any(p => p.Name is not ("code" or "zahn" or "anzahl"))
                    || !root.TryGetProperty("code", out var cEl) || cEl.ValueKind != JsonValueKind.String)
                    throw new ArgumentException("Body muss {\"code\":\"...\"} sein.");
                var zahn = root.TryGetProperty("zahn", out var zEl) && zEl.ValueKind != JsonValueKind.Null ? zEl.ToString() : "";
                object? anzahl = root.TryGetProperty("anzahl", out var aEl) ? DensKvaPze.AusJson(aEl) : 1;
                return (201, LeistungSchreiben(teile[1], cEl.GetString()!, zahn, anzahl));
            }
            catch (Exception exc) when (exc is ArgumentException or JsonException or DecoderFallbackException)
            { return Fehler(400, exc.Message); }
            catch (DensReadError exc) { return Fehler(503, exc.Message); }
        }
        if (teile.Length == 3 && teile[0] == "patients" && IstZiffern(teile[1]) && teile[2] == "dokumentation")
        {
            try
            {
                if (body is null) throw new ArgumentException("Ungültige Anfragegröße.");
                var root = body.Value;
                if (root.ValueKind != JsonValueKind.Object
                    || root.EnumerateObject().Any(p => p.Name is not ("text" or "date"))
                    || !root.TryGetProperty("text", out var tEl) || tEl.ValueKind != JsonValueKind.String)
                    throw new ArgumentException("Body muss {\"text\":\"...\"} sein.");
                string? datum = null;
                if (root.TryGetProperty("date", out var dEl))
                {
                    if (dEl.ValueKind != JsonValueKind.String) throw new ArgumentException("Datum muss yyyy-mm-dd sein.");
                    datum = dEl.GetString();
                }
                return (201, Dokumentieren(teile[1], tEl.GetString()!, datum));
            }
            catch (Exception exc) when (exc is ArgumentException or JsonException or DecoderFallbackException)
            { return Fehler(400, exc.Message); }
            catch (DensReadError exc) { return Fehler(503, exc.Message); }
        }
        return Fehler(404, "Route nicht gefunden.");
    }
}
