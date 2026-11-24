using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using PlanR.Bridge;

namespace PlanR.Bridge.Dampsoft;

/// <summary>1:1-Port von connector_service.py als direkter In-Prozess-Connector.</summary>
public sealed class DsWinConnector : IConnector
{
    static readonly Regex PatientRouteRe = new(@"^/patients/([0-9]{1,5})/(befunde/01|hkps|hkps/([0-9]{1,6})/planr)$", RegexOptions.Compiled);
    static readonly Regex PatNrPrefixRe = new(@"^/patients/([0-9]{1,5})(/|$)", RegexOptions.Compiled);
    static readonly Regex HkpImportRe = new(@"^/patients/([0-9]{1,5})/hkps/import$", RegexOptions.Compiled);
    static readonly Regex PlanImportRe = new(@"^/patients/([0-9]{1,5})/plaene/import$", RegexOptions.Compiled);
    static readonly Regex FindingRe = new(@"^/patients/([0-9]{1,5})/befunde/01(/dummy)?$", RegexOptions.Compiled);
    static readonly Regex DokuRe = new(@"^/patients/([0-9]{1,5})/dokumentation$", RegexOptions.Compiled);
    static readonly Regex HkpDummyRe = new(@"^/patients/([0-9]{1,5})/hkps$", RegexOptions.Compiled);

    readonly string _root;
    readonly string _foundBy;
    readonly string _daten;
    readonly string _patientDbf;
    readonly string _encoding;
    readonly bool _enableWrite;
    readonly string? _readOnlyError;
    readonly string _backupBase;
    readonly string? _dllPath;
    readonly object _sourceLock = new();
    readonly object _writeLock = new();

    public string Root => _root;
    public string EncodingName => _encoding;
    public bool SchreibenAktiv => _enableWrite;
    public string? ReadOnlyGrund => _readOnlyError;

    public DsWinConnector(string? root = null, bool enableWrite = true, string? encoding = null, string? backupBase = null, string? dllPath = null)
    {
        if (string.IsNullOrWhiteSpace(root))
        {
            var (found, by) = DsWinPfad.FindRoot();
            if (found is null)
                throw new InvalidOperationException("DS-Win nicht gefunden (kein laufendes DS-Win, keine Verknüpfung, kein X:\\TDAMP\\DS).");
            _root = found;
            _foundBy = by ?? "Konfiguration";
        }
        else
        {
            _root = root;
            _foundBy = "Konfiguration";
        }
        _daten = Path.Combine(_root, "daten");
        _patientDbf = Path.Combine(_daten, "patient.dbf");
        _encoding = string.IsNullOrWhiteSpace(encoding) ? DsWinPfad.GuessEncoding(_patientDbf) : encoding;
        _dllPath = dllPath;
        _backupBase = backupBase ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "PlanR-Bridge", "backups", "dswin");

        if (enableWrite)
        {
            var reason = DsWinPfad.WriteBlocker(_root);
            if (reason is null)
            {
                try
                {
                    var dll = _dllPath ?? DsWinEngine.ResolveDll(_root);
                    _ = new DsWinEngine(dll);
                }
                catch
                {
                    reason = "Die Datenbank-Bibliothek von DS-Win (cbstand.dll) lässt sich nicht laden; das Zurückschreiben bleibt aus.";
                }
            }
            if (reason is not null)
            {
                _enableWrite = false;
                _readOnlyError = reason;
            }
            else
            {
                _enableWrite = true;
                _readOnlyError = null;
            }
        }
        else
        {
            _enableWrite = false;
            _readOnlyError = "Schreibweg ist deaktiviert.";
        }

        // Patientenliste und Befunde einmal lesen, solange noch niemand sucht.
        var patientDatei = _patientDbf;
        var zeichensatz = _encoding;
        var daten = _daten;
        _ = Task.Run(() =>
        {
            DbfTabelle.Warm(patientDatei, zeichensatz);
            try
            {
                if (!Directory.Exists(daten)) return;
                foreach (var dir in Directory.EnumerateDirectories(daten, "PRAX*"))
                {
                    var befund = Path.Combine(dir, "BEFUND.DBF");
                    if (File.Exists(befund)) DbfTabelle.TableGecacht(befund);
                }
            }
            catch { /* der nächste Befund lädt selbst */ }
        });
    }

    static string? Header(IReadOnlyDictionary<string, string>? headers, string name)
    {
        if (headers is null) return null;
        foreach (var (k, v) in headers)
            if (string.Equals(k, name, StringComparison.OrdinalIgnoreCase))
                return v;
        return null;
    }

    static HashSet<int>? Zulassen(IReadOnlyDictionary<string, string>? headers) =>
        DsWinPfad.ErlaubtePraxen(Header(headers, "X-DSWin-Praxen"));

    static (int Status, Dictionary<string, object?> Daten) Fehler(int status, string text) =>
        (status, new Dictionary<string, object?>(StringComparer.Ordinal) { ["error"] = text });

    static (int Status, Dictionary<string, object?> Daten) Ok(int status, Dictionary<string, object?> daten) =>
        (status, daten);

    Dictionary<string, object?> Patient(string number, HashSet<int>? z)
    {
        var (zeile, mehrdeutig) = DbfTabelle.NachNummer(_patientDbf, _encoding, number);
        if (mehrdeutig || zeile is null) throw new PraxisFehler("Patient nicht eindeutig gefunden.");
        var row = zeile;
        var praxis = row.TryGetValue("praxis", out var pv) && pv is not null ? Convert.ToInt32(pv, CultureInfo.InvariantCulture) : 1;
        row["praxis"] = praxis;
        if (z is not null && !z.Contains(praxis)) throw new PraxisFehler("Patient nicht gefunden.");
        return row;
    }

    (int Status, Dictionary<string, object?> Daten)? PruefeFreigabe(string pfad, HashSet<int>? z)
    {
        if (z is null) return null;
        var m = PatNrPrefixRe.Match(pfad);
        try
        {
            lock (_sourceLock)
            {
                if (m.Success)
                {
                    Patient(m.Groups[1].Value, z);
                    return null;
                }
            }
        }
        catch (PraxisFehler err) { return Fehler(404, err.Message); }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or SourceError or DbfError)
        { return Fehler(503, "Patientendaten momentan nicht lesbar."); }
        return Fehler(404, "Route not found");
    }

    public (int Status, Dictionary<string, object?> Daten) Rufen(
        string methode, string pfad, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms)
    {
        if (string.Equals(methode, "GET", StringComparison.OrdinalIgnoreCase))
        {
            lock (_sourceLock) return GetLocked(pfad, kopf);
        }
        if (string.Equals(methode, "POST", StringComparison.OrdinalIgnoreCase))
            return DoPost(pfad, body, kopf);
        return Fehler(405, "Method not supported");
    }

    static (string PathPart, string QueryPart) SplitUrl(string url)
    {
        var idx = url.IndexOf('?');
        return idx < 0 ? (url, "") : (url[..idx], url[(idx + 1)..]);
    }

    static Dictionary<string, List<string>> ParseQs(string query)
    {
        var dict = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(query)) return dict;
        var parts = query.Split('&');
        if (parts.Length > 10) throw new ArgumentException();
        foreach (var part in parts)
        {
            if (part.Length == 0) continue;
            var eq = part.IndexOf('=');
            var rawK = eq < 0 ? part : part[..eq];
            var rawV = eq < 0 ? "" : part[(eq + 1)..];
            var k = Uri.UnescapeDataString(rawK.Replace('+', ' '));
            var v = Uri.UnescapeDataString(rawV.Replace('+', ' '));
            if (!dict.TryGetValue(k, out var list)) dict[k] = list = [];
            list.Add(v);
        }
        return dict;
    }

    (int Status, Dictionary<string, object?> Daten) GetLocked(string fullPath, IReadOnlyDictionary<string, string> kopf)
    {
        var (pathPart, queryPart) = SplitUrl(fullPath);
        var z = Zulassen(kopf);

        if (pathPart == "/health")
        {
            return Ok(200, new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["status"] = "ok",
                ["mode"] = _enableWrite ? "shared-write" : "read-only",
                ["encoding"] = _encoding,
                ["dswin"] = _root,
                ["foundBy"] = _foundBy,
                ["readOnly"] = _enableWrite ? null : _readOnlyError,
            });
        }

        if (pathPart == "/praxen")
        {
            try
            {
                var items = DsWinPfad.PraxenListe(_daten, _encoding)
                    .Where(p => z is null || z.Contains(Convert.ToInt32(p["nummer"], CultureInfo.InvariantCulture)))
                    .ToList();
                return Ok(200, new Dictionary<string, object?>(StringComparer.Ordinal) { ["items"] = items });
            }
            catch (Exception ex) when (ex is IOException or InvalidOperationException or DbfError)
            { return Fehler(503, "Praxisdaten momentan nicht lesbar."); }
        }

        var pm = PatientRouteRe.Match(pathPart);
        if (pm.Success)
        {
            if (queryPart.Length > 0) return Fehler(400, "Keine Query-Parameter erlaubt.");
            try
            {
                var row = Patient(pm.Groups[1].Value, z);
                var praxis = Convert.ToInt32(row["praxis"], CultureInfo.InvariantCulture);
                DsWinPfad.PraxisOrdner(_daten, praxis);
                var patNr = Convert.ToString(row["patientNumber"])!;
                var sub = pm.Groups[2].Value;
                if (sub == "befunde/01")
                    return Ok(200, DsWinBefund.ReadFindings(_daten, patNr, praxis, _encoding));
                if (sub == "hkps")
                    return Ok(200, new Dictionary<string, object?>(StringComparer.Ordinal) { ["items"] = DsWinHkp.ListPlans(_daten, patNr, praxis, _encoding) });
                var hkpNum = int.Parse(pm.Groups[3].Value, CultureInfo.InvariantCulture);
                var res = DsWinHkp.PlanrAusDsWin(Path.Combine(_daten, $"PRAX{praxis}"), row, hkpNum, _encoding);
                return res is not null ? Ok(200, res) : Fehler(404, "HKP nicht gefunden.");
            }
            catch (PraxisFehler err) { return Fehler(404, err.Message); }
            catch (EditError err) { return Fehler(err.Status, err.Message); }
            catch (SourceChanged) { return Fehler(409, "Patientendaten ändern sich gerade – bitte erneut versuchen."); }
            catch (Exception ex) when (ex is IOException or InvalidOperationException or DbfError or SourceError or FormatException)
            { return Fehler(503, "Daten momentan nicht lesbar. Bitte erneut versuchen."); }
        }

        if (pathPart == "/hkps/offen")
        {
            if (queryPart.Length > 0) return Fehler(400, "Keine Query-Parameter erlaubt.");
            try
            {
                return Ok(200, new Dictionary<string, object?>(StringComparer.Ordinal) { ["items"] = DsWinHkp.GenehmigtOffen(_daten, z, _encoding) });
            }
            catch (Exception ex) when (ex is IOException or InvalidOperationException or DbfError)
            { return Fehler(503, "HKP-Daten momentan nicht lesbar. Bitte erneut versuchen."); }
        }

        if (pathPart == "/praxis/katalog")
        {
            if (queryPart.Length > 0) return Fehler(400, "Keine Query-Parameter erlaubt.");
            try
            {
                return Ok(200, DsWinKatalog.PraxisKatalog(_daten, z, _encoding));
            }
            catch (Exception ex) when (ex is IOException or InvalidOperationException or DbfError)
            { return Fehler(503, "Leistungsverzeichnisse momentan nicht lesbar. Bitte erneut versuchen."); }
        }

        if (pathPart != "/patients" && !pathPart.StartsWith("/patients/", StringComparison.Ordinal))
            return Fehler(404, "Route not found");

        string query = "";
        int limit = 20, offset = 0;
        try
        {
            var paramsMap = ParseQs(queryPart);
            if (pathPart == "/patients")
            {
                var allowed = new HashSet<string>(StringComparer.Ordinal) { "q", "limit", "offset" };
                if (paramsMap.Keys.Any(k => !allowed.Contains(k)) || paramsMap.Values.Any(v => v.Count != 1))
                    throw new ArgumentException();
                query = (paramsMap.TryGetValue("q", out var qv) ? qv[0] : "").Trim().ToLowerInvariant();
                limit = int.Parse(paramsMap.TryGetValue("limit", out var lv) ? lv[0] : "20", CultureInfo.InvariantCulture);
                offset = int.Parse(paramsMap.TryGetValue("offset", out var ov) ? ov[0] : "0", CultureInfo.InvariantCulture);
                if (query.Length == 0 || query.Length > 200 || limit < 1 || limit > 100 || offset < 0)
                    throw new ArgumentException();
            }
            else if (queryPart.Length > 0)
            {
                throw new ArgumentException();
            }
        }
        catch
        {
            return Fehler(400, "Use q (1-200 characters), limit (1-100), offset (>=0)");
        }

        try
        {
            if (pathPart == "/patients")
            {
                var (page, total) = DbfTabelle.Suchen(_patientDbf, _encoding, query, limit, offset,
                    z is null ? null : p => z.Contains(p));
                return Ok(200, new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["items"] = page, ["total"] = total, ["limit"] = limit, ["offset"] = offset,
                });
            }
            var number = Uri.UnescapeDataString(pathPart["/patients/".Length..]);
            var (zeile, mehrdeutig) = DbfTabelle.NachNummer(_patientDbf, _encoding, number);
            if (mehrdeutig) return Fehler(409, "Patient number is ambiguous");
            if (zeile is null) return Fehler(404, "Patient not found");
            var praxis = zeile.TryGetValue("praxis", out var pv) && pv is not null
                ? Convert.ToInt32(pv, CultureInfo.InvariantCulture) : 1;
            if (z is not null && !z.Contains(praxis)) return Fehler(404, "Patient not found");
            return Ok(200, zeile);
        }
        catch (SourceChanged) { return Fehler(409, "Source changed during read; retry"); }
        catch (Exception ex) when (ex is IOException or SourceError or DbfError or InvalidOperationException or FormatException)
        { return Fehler(503, "Patient source unavailable or unsupported"); }
    }

    (int Status, Dictionary<string, object?> Daten) DoPost(string fullPath, JsonElement? body, IReadOnlyDictionary<string, string> kopf)
    {
        if (Header(kopf, "X-DSWIN-EDIT") != "1")
            return Fehler(403, "Zugriff verweigert.");
        if (!_enableWrite)
            return Fehler(403, _readOnlyError ?? "Schreibweg ist deaktiviert.");

        var z = Zulassen(kopf);
        var deny = PruefeFreigabe(fullPath, z);
        if (deny is not null) return deny.Value;

        var hm = HkpImportRe.Match(fullPath);
        if (hm.Success) return CreateHkpImport(hm.Groups[1].Value, body);

        var pm = PlanImportRe.Match(fullPath);
        if (pm.Success) return CreatePlanImport(pm.Groups[1].Value, body);

        var fm = FindingRe.Match(fullPath);
        if (fm.Success) return CreateFinding(fm.Groups[1].Value, fm.Groups[2].Success, body);

        var dm = DokuRe.Match(fullPath);
        if (dm.Success) return CreateDokumentation(dm.Groups[1].Value, body);

        var dmHkp = HkpDummyRe.Match(fullPath);
        if (dmHkp.Success) return CreateDummyHkp(dmHkp.Groups[1].Value, body);

        return Fehler(404, "Route not found");
    }

    (int Status, Dictionary<string, object?> Daten) CreateDokumentation(string patNr, JsonElement? body)
    {
        string text;
        string? tag = null;
        try
        {
            if (body is null || body.Value.ValueKind != JsonValueKind.Object) throw new ArgumentException();
            var root = body.Value;
            foreach (var p in root.EnumerateObject())
                if (p.Name is not ("text" or "date")) throw new ArgumentException();
            if (!root.TryGetProperty("text", out var tEl) || tEl.ValueKind != JsonValueKind.String) throw new ArgumentException();
            text = tEl.GetString()!;
            if (root.TryGetProperty("date", out var dEl) && dEl.ValueKind != JsonValueKind.Null)
            {
                if (dEl.ValueKind != JsonValueKind.String) throw new ArgumentException();
                var ds = dEl.GetString()!;
                if (ds.Length > 0)
                {
                    if (!DateOnly.TryParseExact(ds, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                        throw new ArgumentException();
                    tag = d.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
                }
            }
        }
        catch
        {
            return Fehler(400, "Body muss {\"text\":\"...\"} sein.");
        }

        try
        {
            lock (_sourceLock) Patient(patNr, null);
        }
        catch (PraxisFehler err) { return Fehler(404, err.Message); }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or SourceError or DbfError)
        { return Fehler(503, "Patientendaten momentan nicht lesbar."); }

        if (!Monitor.TryEnter(_writeLock))
            return Fehler(409, "Es wird gerade geschrieben. Bitte gleich noch einmal.");
        try
        {
            var res = DsWinSchreiben.SaveNotiz(patNr, text, _root, _encoding, datum: tag, dllPath: _dllPath);
            var d = Convert.ToString(res["datum"])!;
            var norm = string.Join(" ", text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
            return Ok(201, new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["id"] = patNr,
                ["date"] = $"{d[..4]}-{d[4..6]}-{d[6..]}",
                ["time"] = res["uhrzeit"],
                ["zeilen"] = res["zeilen"],
                ["text"] = norm,
            });
        }
        catch (EditError err) { return Fehler(err.Status, err.Message); }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or HkpError or NativeError)
        { return Fehler(503, "Der Karteieintrag wurde nicht geschrieben."); }
        finally { Monitor.Exit(_writeLock); }
    }

    (int Status, Dictionary<string, object?> Daten) CreateHkpImport(string patNr, JsonElement? body)
    {
        Dictionary<string, object?> imported;
        try
        {
            if (body is null || body.Value.ValueKind != JsonValueKind.Object) throw new ArgumentException();
            var props = body.Value.EnumerateObject().ToList();
            if (props.Count != 1 || props[0].Name != "json" || props[0].Value.ValueKind != JsonValueKind.String)
                throw new ArgumentException();
            imported = DsWinFormate.ParseHkpJson(props[0].Value.GetString(), _encoding);
        }
        catch (EditError err) { return Fehler(400, err.Message); }
        catch { return Fehler(400, "Ungültige HKP-JSON-Datei."); }

        if (!Monitor.TryEnter(_writeLock))
            return Fehler(409, "Ein HKP wird bereits angelegt.");
        try
        {
            var result = DsWinSchreiben.AppendShared(_root, patNr, Path.Combine(_backupBase, "hkp"), _encoding,
                dllPath: _dllPath, importData: imported, stager: DsWinSchreiben.StagePlan);
            var notes = new List<string>((List<string>)imported["notes"]!);
            if (result.TryGetValue("hinweise", out var hw) && hw is List<string> l) notes.AddRange(l);
            result["hinweise"] = notes;
            return Ok(201, result);
        }
        catch (Exception ex) when (ex is HkpError or EditError or NativeError or IOException or InvalidOperationException)
        { return Fehler(503, ex.Message); }
        finally { Monitor.Exit(_writeLock); }
    }

    (int Status, Dictionary<string, object?> Daten) CreatePlanImport(string patNr, JsonElement? body)
    {
        Dictionary<string, object?> plan;
        try
        {
            if (body is null || body.Value.ValueKind != JsonValueKind.Object) throw new ArgumentException();
            var props = body.Value.EnumerateObject().ToList();
            if (props.Count != 1 || props[0].Name != "json" || props[0].Value.ValueKind != JsonValueKind.String)
                throw new ArgumentException();
            plan = DsWinFormate.ParsePlanJson(props[0].Value.GetString(), _encoding);
        }
        catch (EditError err) { return Fehler(400, err.Message); }
        catch { return Fehler(400, "Ungültige Plan-JSON-Datei."); }

        if (!Monitor.TryEnter(_writeLock))
            return Fehler(409, "Ein Plan wird bereits angelegt.");
        try
        {
            var result = DsWinSchreiben.AppendShared(_root, patNr, Path.Combine(_backupBase, "hkp"), _encoding,
                dllPath: _dllPath, importData: plan, stager: DsWinSchreiben.StagePrivat);
            return Ok(201, result);
        }
        catch (Exception ex) when (ex is HkpError or EditError or NativeError or IOException or InvalidOperationException)
        { return Fehler(409, ex.Message); }
        finally { Monitor.Exit(_writeLock); }
    }

    (int Status, Dictionary<string, object?> Daten) CreateFinding(string patNr, bool dummy, JsonElement? body)
    {
        if (body is null || body.Value.ValueKind != JsonValueKind.Object)
            return Fehler(400, "Ungültiger Befundauftrag.");

        if (!Monitor.TryEnter(_writeLock))
            return Fehler(409, "Befund- oder HKP-Schreibauftrag läuft bereits.");
        try
        {
            lock (_sourceLock)
            {
                var res = DsWinSchreiben.SaveFinding(patNr, body.Value, _root, _encoding,
                    Path.Combine(_backupBase, "befund"), dummy: dummy, dllPath: _dllPath);
                return Ok(201, res);
            }
        }
        catch (EditError err)
        {
            var st = err.Status is 400 or 403 or 409 or 503 ? err.Status : 503;
            return Ok(st, new Dictionary<string, object?>(StringComparer.Ordinal) { ["error"] = err.Message, ["status"] = err.Status });
        }
        catch
        {
            return Ok(503, new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["error"] = "Befund-Datenbankzugriff fehlgeschlagen. Sicherungsprotokoll und Speicherstand prüfen.",
                ["status"] = 503,
            });
        }
        finally { Monitor.Exit(_writeLock); }
    }

    (int Status, Dictionary<string, object?> Daten) CreateDummyHkp(string patNr, JsonElement? body)
    {
        if (body is not null)
            return Fehler(400, "Dieser Endpunkt akzeptiert keine Patientendaten.");
        if (!Monitor.TryEnter(_writeLock))
            return Fehler(409, "Ein HKP wird bereits angelegt.");
        try
        {
            var result = DsWinSchreiben.AppendShared(_root, patNr, Path.Combine(_backupBase, "hkp"), _encoding,
                dllPath: _dllPath, importData: null, stager: DsWinSchreiben.StagePlan);
            return Ok(201, result);
        }
        catch (Exception ex) when (ex is HkpError or EditError or NativeError or IOException or InvalidOperationException)
        { return Fehler(409, ex.Message); }
        finally { Monitor.Exit(_writeLock); }
    }
}
