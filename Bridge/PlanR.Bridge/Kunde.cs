using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PlanR.Bridge;

/// <summary>Dieselbe Leitung wie die Python-Bridge: Long-Poll auf /api/pvs-agent/auftrag, Antwort per POST.</summary>
public sealed class PlanRKunde : IDisposable
{
    readonly HttpClient http;
    readonly Konfig cfg;
    public string Pvs { get; set; }
    public string? Vorgabe { get; private set; }
    public IReadOnlyList<string>? Kann { get; set; }

    public PlanRKunde(Konfig cfg, string pvs, HttpMessageHandler? handler = null)
    {
        this.cfg = cfg;
        Pvs = pvs;
        http = handler is null ? new HttpClient() : new HttpClient(handler);
        http.Timeout = TimeSpan.FromSeconds(60);
    }

    public async Task<JsonElement?> Abholen(string status, CancellationToken halt)
    {
        var url = $"{cfg.Planr}/api/pvs-agent/auftrag?{Umfrage.Abfrage(Pvs, status, Kann)}";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        Kopf(req);
        using var antwort = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, halt);
        if (antwort.StatusCode == HttpStatusCode.NoContent)
        {
            Vorgabe = null;
            return null;
        }
        if (antwort.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new PlanRAbgelehnt((int)antwort.StatusCode);
        antwort.EnsureSuccessStatusCode();
        var json = await antwort.Content.ReadAsStringAsync(halt);
        var (auftrag, pvs) = Umfrage.Lesen(json);
        Vorgabe = pvs;
        return auftrag;
    }

    public async Task Antworten(string id, int status, Dictionary<string, object?> daten, CancellationToken halt)
    {
        var body = JsonSerializer.Serialize(new { id, status, daten });
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{cfg.Planr}/api/pvs-agent/antwort")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        Kopf(req);
        using var antwort = await http.SendAsync(req, halt);
        antwort.EnsureSuccessStatusCode();
    }

    public async Task<string> HoleText(string pfad, CancellationToken halt)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{cfg.Planr}{pfad}");
        Kopf(req);
        using var antwort = await http.SendAsync(req, halt);
        antwort.EnsureSuccessStatusCode();
        return await antwort.Content.ReadAsStringAsync(halt);
    }

    public async Task<byte[]> HoleBytes(string pfad, int maxBytes, CancellationToken halt)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{cfg.Planr}{pfad}");
        Kopf(req);
        using var antwort = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, halt);
        antwort.EnsureSuccessStatusCode();
        if (antwort.Content.Headers.ContentLength is { } len && len > maxBytes)
            throw new UpdateFehler("Update-Paket zu groß.");
        await using var strom = await antwort.Content.ReadAsStreamAsync(halt);
        using var speicher = new MemoryStream();
        var puffer = new byte[64 * 1024];
        int gelesen;
        while ((gelesen = await strom.ReadAsync(puffer, halt)) > 0)
        {
            if (speicher.Length + gelesen > maxBytes)
                throw new UpdateFehler("Update-Paket zu groß.");
            speicher.Write(puffer, 0, gelesen);
        }
        return speicher.ToArray();
    }

    void Kopf(HttpRequestMessage req)
    {
        req.Headers.TryAddWithoutValidation("X-PlanR-Mandant", cfg.Mandant);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.Schluessel);
        req.Headers.TryAddWithoutValidation("User-Agent", $"PlanR-Agent/{Umfrage.Version}");
        if (cfg.CfClientId.Length > 0 && cfg.CfClientSecret.Length > 0)
        {
            req.Headers.TryAddWithoutValidation("CF-Access-Client-Id", cfg.CfClientId);
            req.Headers.TryAddWithoutValidation("CF-Access-Client-Secret", cfg.CfClientSecret);
        }
    }

    public void Dispose() => http.Dispose();
}

public sealed class PlanRAbgelehnt : Exception
{
    public int Status { get; }
    public PlanRAbgelehnt(int status) : base($"PlanR lehnt den Agenten ab (HTTP {status}).") => Status = status;
}

public static class Schleife
{
    static readonly object WechselSperre = new();

    public static async Task EinZug(
        PlanRKunde kunde,
        IConnector connector,
        Konfig cfg,
        string zustand,
        CancellationToken halt,
        Laufend? laufend = null,
        Action<string>? log = null)
    {
        var auftrag = await kunde.Abholen(zustand, halt);
        if (kunde.Vorgabe is { Length: > 0 } neu && neu != kunde.Pvs)
        {
            lock (WechselSperre)
            {
                if (neu != kunde.Pvs)
                {
                    laufend?.Abwarten(TimeSpan.FromSeconds(60));
                    if (Praxis.Uebernehmen(neu, connector, kunde, cfg))
                        log?.Invoke($"PVS umgestellt auf {neu}.");
                }
            }
        }
        if (auftrag is null) return;
        var id = auftrag.Value.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
        var fehler = zustand == "bereit" ? "" : zustand;
        int status;
        Dictionary<string, object?> daten;
        using (laufend?.Beginnen())
        {
            (status, daten) = Ausfuehren.Auftrag(auftrag.Value, connector, cfg, fehler);
        }
        await kunde.Antworten(id, status, daten, halt);
    }

    /// <summary>Wie die Python-Schleife: ein Fehler beendet den Arbeiter nicht.</summary>
    public static async Task Arbeit(
        PlanRKunde kunde,
        IConnector connector,
        Konfig cfg,
        Func<string> zustand,
        CancellationToken halt,
        Laufend? laufend = null,
        Action<string>? log = null,
        int? fehlerPauseMs = null)
    {
        var pauseMs = fehlerPauseMs ?? 2000;
        var maxPauseMs = fehlerPauseMs ?? 30_000;
        while (!halt.IsCancellationRequested)
        {
            try
            {
                await EinZug(kunde, connector, cfg, zustand(), halt, laufend, log);
                pauseMs = fehlerPauseMs ?? 2000;
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (PlanRAbgelehnt exc)
            {
                log?.Invoke(exc.Message);
                try { await Task.Delay(fehlerPauseMs ?? 60_000, halt); } catch (OperationCanceledException) { break; }
            }
            catch (Exception exc)
            {
                log?.Invoke($"Verbindung zu PlanR unterbrochen: {exc.Message}");
                try { await Task.Delay(pauseMs, halt); } catch (OperationCanceledException) { break; }
                pauseMs = Math.Min(pauseMs * 2, maxPauseMs);
            }
        }
    }
}

public interface IUmschaltbar
{
    string Pvs { get; }
    void Stoppen();
    void Umstellen(string pvs);
}

public static class Praxis
{
    public static string DswinFehler(string pfad, string konto)
    {
        try
        {
            if (File.Exists(Path.Combine(pfad, "daten", "patient.dbf"))) return "";
        }
        catch (IOException) { }
        return $"DS-Win-Ordner {pfad} ist für das Konto {konto} der PlanR-Bridge nicht erreichbar (daten\\patient.dbf fehlt).";
    }

    public static IReadOnlyList<string> Vorhanden(Konfig cfg, string laufend, Func<string?>? erkennen = null)
    {
        var da = new SortedSet<string>(StringComparer.Ordinal) { laufend };
        if (cfg.Dswin.Length > 0 && File.Exists(Path.Combine(cfg.Dswin, "daten", "patient.dbf")))
            da.Add("dampsoft");
        if (cfg.DensIni.Length > 0 && File.Exists(cfg.DensIni))
            da.Add("dens");
        var z1 = cfg.Z1Mdb.Length > 0 ? cfg.Z1Mdb : @"C:\CGM\Z1\data\z1.mdb";
        if (File.Exists(z1)) da.Add("cgm-z1pro");
        if (!da.Contains("dampsoft") && erkennen?.Invoke() == "dampsoft")
            da.Add("dampsoft");
        return da.ToList();
    }

    public static bool Uebernehmen(string neu, IConnector connector, PlanRKunde kunde, Konfig cfg)
    {
        if (!Konfig.Programme.Contains(neu) || connector is not IUmschaltbar schalter) return false;
        if (neu == kunde.Pvs) return false;
        schalter.Stoppen();
        schalter.Umstellen(neu);
        kunde.Pvs = neu;
        Merken(cfg, neu);
        return true;
    }

    public static void Merken(Konfig cfg, string pvs)
    {
        if (!Konfig.Programme.Contains(pvs) || !File.Exists(cfg.Datei)) return;
        try
        {
            var knoten = JsonNode.Parse(File.ReadAllText(cfg.Datei)) as JsonObject;
            if (knoten is null) return;
            if (knoten["pvs"]?.GetValue<string>() == pvs) return;
            knoten["pvs"] = pvs;
            var tmp = cfg.Datei + ".tmp";
            File.WriteAllText(tmp, knoten.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n");
            File.Move(tmp, cfg.Datei, true);
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return;
        }
    }
}

public static class Ort
{
    public static bool IstEinzelplatz(string mandant) => mandant.StartsWith("pc-", StringComparison.Ordinal);

    public static (Dictionary<string, string> Kopf, Dictionary<string, string> Daten) Antwort(Konfig cfg, string? origin)
    {
        var erlaubt = origin == cfg.Planr || (origin is not null && System.Text.RegularExpressions.Regex.IsMatch(origin, @"^http://(localhost|127\.0\.0\.1)(:\d+)?$"));
        var kopf = new Dictionary<string, string> { ["Cache-Control"] = "no-store", ["Vary"] = "Origin" };
        if (erlaubt && origin is not null)
        {
            kopf["Access-Control-Allow-Origin"] = origin;
            kopf["Access-Control-Allow-Private-Network"] = "true";
            kopf["Access-Control-Allow-Methods"] = "GET";
        }
        return (kopf, new Dictionary<string, string> { ["bridge"] = cfg.Mandant, ["version"] = Umfrage.Version });
    }
}
