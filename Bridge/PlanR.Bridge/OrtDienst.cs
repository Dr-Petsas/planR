using System.Net;
using System.Text;
using System.Text.Json;

namespace PlanR.Bridge;

/// <summary>
/// Lokaler Erkennungsdienst auf 127.0.0.1:8764 für Einzelplatz-Bridges (mandant pc-*),
/// damit der Browser im selben PC seine eigene Bridge erkennt (GET /planr-bridge).
/// </summary>
public sealed class OrtDienst : IDisposable
{
    public const int StandardPort = 8764;
    readonly HttpListener listener = new();
    readonly Konfig cfg;
    readonly Protokoll? log;
    CancellationTokenSource? cts;
    Task? schleife;

    public OrtDienst(Konfig cfg, Protokoll? log = null, int port = StandardPort)
    {
        this.cfg = cfg;
        this.log = log;
        Port = port;
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
    }

    public int Port { get; }

    public bool Starten()
    {
        try
        {
            listener.Start();
            cts = new CancellationTokenSource();
            schleife = Task.Run(() => Laufen(cts.Token));
            log?.Info($"Einzelplatz-Erkennung aktiv auf http://127.0.0.1:{Port}/planr-bridge");
            return true;
        }
        catch (Exception exc)
        {
            log?.Warn($"Einzelplatz-Erkennung (127.0.0.1:{Port}) nicht gestartet: {exc.Message}");
            return false;
        }
    }

    async Task Laufen(CancellationToken halt)
    {
        while (!halt.IsCancellationRequested && listener.IsListening)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await listener.GetContextAsync().WaitAsync(halt);
            }
            catch (OperationCanceledException) { break; }
            catch (HttpListenerException) { break; }
            catch (ObjectDisposedException) { break; }
            catch { continue; }

            try { Bearbeiten(ctx); }
            catch { try { ctx.Response.Close(); } catch { } }
        }
    }

    void Bearbeiten(HttpListenerContext ctx)
    {
        var req = ctx.Request;
        var res = ctx.Response;
        var pfad = req.Url?.AbsolutePath ?? "/";
        if (pfad != "/planr-bridge")
        {
            res.StatusCode = 404;
            res.Close();
            return;
        }

        var origin = req.Headers["Origin"];
        var (kopf, daten) = Ort.Antwort(cfg, origin);
        foreach (var (k, v) in kopf) res.Headers[k] = v;

        if (string.Equals(req.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            res.StatusCode = 204;
            res.Close();
            return;
        }
        if (!string.Equals(req.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase))
        {
            res.StatusCode = 405;
            res.Close();
            return;
        }

        var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(daten));
        res.StatusCode = 200;
        res.ContentType = "application/json; charset=utf-8";
        res.ContentLength64 = payload.Length;
        res.OutputStream.Write(payload, 0, payload.Length);
        res.Close();
    }

    public void Dispose()
    {
        try { cts?.Cancel(); } catch { }
        try { if (listener.IsListening) listener.Stop(); } catch { }
        try { listener.Close(); } catch { }
        try { schleife?.Wait(TimeSpan.FromSeconds(2)); } catch { }
        cts?.Dispose();
    }
}
