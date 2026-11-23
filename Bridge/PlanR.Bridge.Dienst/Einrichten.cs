using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using PlanR.Bridge;
using PlanR.Bridge.Dampsoft;
using PlanR.Bridge.Dens;

namespace PlanR.Bridge.Dienst;

/// <summary>
/// Hilfsbefehle für das Setup der PlanR-Bridge (ersetzt einrichten.py komplett):
/// Eingabe als JSON-Objekt auf stdin, jede Ausgabezeile ist ein JSON-Objekt.
///   --einrichten einloesen  {"planr", "code"}
///   --einrichten melden     {"config", "schritt", "gesamt", "text", "fehler", "fertig", "details", "hinweis", "version"}
///   --einrichten warten     {"config", "sekunden"}
///   --einrichten dswin      {}
///   --einrichten dens       {}
/// </summary>
public static class Einrichten
{
    static readonly JsonSerializerOptions JsonOpt = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static async Task<int> Ausfuehren(string befehl)
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        var roh = await Console.In.ReadToEndAsync();
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(roh) ? "{}" : roh);
        var e = doc.RootElement;

        switch (befehl.ToLowerInvariant())
        {
            case "einloesen":
                await Einloesen(e);
                return 0;
            case "melden":
                await Melden(e);
                return 0;
            case "warten":
                await Warten(e);
                return 0;
            case "dswin":
                DsWin();
                return 0;
            case "dens":
                Dens();
                return 0;
            default:
                Console.Error.WriteLine($"Unbekannter Einrichtungsbefehl: {befehl}");
                return 2;
        }
    }

    static void Ausgeben(object daten)
    {
        Console.WriteLine(JsonSerializer.Serialize(daten, JsonOpt));
        Console.Out.Flush();
    }

    static string Text(JsonElement e, string feld, string standard = "") =>
        e.TryGetProperty(feld, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? standard : standard;

    static HttpClient ErstelleClient(int sekunden)
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(sekunden) };
        http.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", $"PlanR-Setup/{Umfrage.Version}");
        return http;
    }

    static void ZugangKopf(HttpRequestMessage req, Konfig cfg)
    {
        req.Headers.TryAddWithoutValidation("X-PlanR-Mandant", cfg.Mandant);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.Schluessel);
        if (cfg.CfClientId.Length > 0 && cfg.CfClientSecret.Length > 0)
        {
            req.Headers.TryAddWithoutValidation("CF-Access-Client-Id", cfg.CfClientId);
            req.Headers.TryAddWithoutValidation("CF-Access-Client-Secret", cfg.CfClientSecret);
        }
    }

    static string FehlerGrund(Exception exc)
    {
        var text = exc.InnerException?.Message ?? exc.Message;
        if (text.Contains("certificate", StringComparison.OrdinalIgnoreCase)
            || text.Contains("SSL", StringComparison.OrdinalIgnoreCase)
            || text.Contains("TLS", StringComparison.OrdinalIgnoreCase))
            return "das Sicherheitszertifikat von PlanR wird nicht anerkannt – prüft ein Virenschutz oder Proxy die Verbindung?";
        return text;
    }

    static async Task Einloesen(JsonElement e)
    {
        var planr = Text(e, "planr", "https://planr.pickadoc.de").TrimEnd('/');
        if (planr.Length == 0) planr = "https://planr.pickadoc.de";
        var code = Text(e, "code");
        using var http = ErstelleClient(25);
        try
        {
            var body = JsonSerializer.Serialize(new { code }, JsonOpt);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{planr}/api/bridge-setup/einloesen")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };
            using var resp = await http.SendAsync(req);
            var text = await resp.Content.ReadAsStringAsync();
            JsonElement antwort;
            try { antwort = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text).RootElement.Clone(); }
            catch { antwort = default; }

            if (!resp.IsSuccessStatusCode)
            {
                var meldung = antwort.ValueKind == JsonValueKind.Object ? Text(antwort, "meldung") : "";
                Ausgeben(new { fehler = meldung.Length > 0 ? meldung : $"PlanR nimmt den Einrichtungscode nicht an (HTTP {(int)resp.StatusCode})." });
                return;
            }
            var ok = antwort.ValueKind == JsonValueKind.Object && antwort.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
            if (!ok)
            {
                var meldung = antwort.ValueKind == JsonValueKind.Object ? Text(antwort, "meldung") : "";
                Ausgeben(new { fehler = meldung.Length > 0 ? meldung : "PlanR nimmt den Einrichtungscode nicht an." });
                return;
            }
            var zielPlanr = Text(antwort, "planr", planr).TrimEnd('/');
            if (zielPlanr.Length == 0) zielPlanr = planr;
            Ausgeben(new
            {
                planr = zielPlanr,
                mandant = Text(antwort, "mandant"),
                schluessel = Text(antwort, "schluessel"),
                praxis = Text(antwort, "praxis"),
                pvs = Text(antwort, "pvs"),
            });
        }
        catch (Exception exc)
        {
            Ausgeben(new { fehler = $"PlanR ist nicht erreichbar: {FehlerGrund(exc)} Hat dieser Rechner Internet?" });
        }
    }

    static async Task Melden(JsonElement e)
    {
        try
        {
            var cfg = Konfig.Laden(Text(e, "config"));
            var details = Text(e, "details");
            if (details.Length > 4000) details = details[^4000..];
            var daten = new Dictionary<string, object?>
            {
                ["schritt"] = e.TryGetProperty("schritt", out var sc) && sc.TryGetInt32(out var sv) ? sv : 0,
                ["gesamt"] = e.TryGetProperty("gesamt", out var ge) && ge.TryGetInt32(out var gv) ? gv : 0,
                ["text"] = Text(e, "text"),
                ["fehler"] = e.TryGetProperty("fehler", out var fe) && fe.ValueKind == JsonValueKind.True,
                ["fertig"] = e.TryGetProperty("fertig", out var ft) && ft.ValueKind == JsonValueKind.True,
                ["details"] = details,
                ["hinweis"] = Text(e, "hinweis"),
                ["version"] = Text(e, "version", Umfrage.Version),
            };
            using var http = ErstelleClient(15);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{cfg.Planr}/api/pvs-agent/setup")
            {
                Content = new StringContent(JsonSerializer.Serialize(daten, JsonOpt), Encoding.UTF8, "application/json"),
            };
            ZugangKopf(req, cfg);
            using var resp = await http.SendAsync(req);
            resp.EnsureSuccessStatusCode();
            Ausgeben(new { ok = true });
        }
        catch (Exception exc)
        {
            Ausgeben(new { ok = false, fehler = FehlerGrund(exc) });
        }
    }

    static string NurLesenAusStatus(Konfig cfg)
    {
        try
        {
            var pfad = Path.Combine(cfg.Ordner, "status.json");
            if (!File.Exists(pfad)) return "";
            using var doc = JsonDocument.Parse(File.ReadAllText(pfad, Encoding.UTF8));
            return Text(doc.RootElement, "nurLesen");
        }
        catch
        {
            return "";
        }
    }

    static async Task Warten(JsonElement e)
    {
        var cfg = Konfig.Laden(Text(e, "config"));
        var sekunden = e.TryGetProperty("sekunden", out var sk) && sk.TryGetDouble(out var sv) ? sv : 150.0;
        var ende = DateTime.UtcNow.AddSeconds(sekunden);
        (bool Verbunden, string Status)? letzter = null;
        using var http = ErstelleClient(15);

        while (true)
        {
            (bool Verbunden, string Status) jetzt;
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, $"{cfg.Planr}/api/pvs-agent/setup");
                ZugangKopf(req, cfg);
                using var resp = await http.SendAsync(req);
                resp.EnsureSuccessStatusCode();
                var text = await resp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
                var r = doc.RootElement;
                var verbunden = r.TryGetProperty("verbunden", out var vb) && vb.ValueKind == JsonValueKind.True;
                var status = Text(r, "status");
                jetzt = (verbunden, status);
            }
            catch (Exception exc)
            {
                jetzt = (false, $"PlanR nicht erreichbar: {FehlerGrund(exc)}");
            }

            if (letzter != jetzt)
            {
                letzter = jetzt;
                Ausgeben(new { verbunden = jetzt.Verbunden, status = jetzt.Status });
            }
            if (jetzt.Verbunden && jetzt.Status == "bereit")
            {
                var nurLesen = cfg.Pvs is "dens" or "cgm-z1pro" ? "" : NurLesenAusStatus(cfg);
                Ausgeben(new { fertig = true, nurLesen });
                return;
            }
            if (DateTime.UtcNow >= ende)
            {
                Ausgeben(new { fertig = false });
                return;
            }
            await Task.Delay(2000);
        }
    }

    static void DsWin()
    {
        try
        {
            var (root, wie, kandidaten) = DsWinPfad.FindAll();
            var liste = kandidaten.Select(k => new
            {
                pfad = k.Root,
                wie = k.Label,
                stand = k.Stamp > 0 ? new DateTime(k.Stamp, DateTimeKind.Utc).ToLocalTime().ToString("dd.MM.yyyy HH:mm") : "",
            }).ToList();
            Ausgeben(new { dswin = root ?? "", wie, kandidaten = liste });
        }
        catch (Exception exc)
        {
            Ausgeben(new { dswin = "", wie = $"Fehler: {exc.Message}", kandidaten = Array.Empty<object>() });
        }
    }

    static void Dens()
    {
        try
        {
            var gefunden = DensPfad.Ini();
            Ausgeben(new { ini = !string.IsNullOrEmpty(gefunden) && File.Exists(gefunden) ? gefunden : "" });
        }
        catch (Exception exc)
        {
            Ausgeben(new { ini = "", wie = $"Fehler: {exc.Message}" });
        }
    }
}
