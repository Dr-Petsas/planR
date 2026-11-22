using System.Net;
using System.Text.Json;
using PlanR.Bridge;
using Xunit;

namespace PlanR.Bridge.Tests;

public class AgentTests
{
    const string Schluessel = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    [Fact]
    public void Konfig_nimmt_dieselben_Regeln_wie_die_Python_Bridge()
    {
        var ordner = Verzeichnis();
        var cfg = Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, cfClientId = "id", cfClientSecret = "geheim" });
        Assert.Equal(("praxis", "auto", true), (cfg.Mandant, cfg.Pvs, cfg.Schreiben));
        Assert.False(Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, schreiben = false }).Schreiben);

        foreach (var falsch in new object[]
        {
            new { planr = "http://planr.example.com", mandant = "praxis", schluessel = Schluessel },
            new { planr = "https://x.de/pfad", mandant = "praxis", schluessel = Schluessel },
            new { planr = "https://planr.pickadoc-tunnel.com", mandant = "Praxis A", schluessel = Schluessel },
            new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = "kurz" },
            new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, pvs = "charly" },
            new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, dswin = @"TDAMP\DS" },
            new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, z1mdb = "z1.mdb" },
        })
            Assert.Throws<KonfigFehler>(() => Schreiben(ordner, falsch));

        Assert.Equal(@"\\SERVER\TDAMP\DS", Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, dswin = @"\\SERVER\TDAMP\DS" }).Dswin);
        Assert.Equal(@"D:\TDAMP\DS", Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, dswin = @"D:\TDAMP\DS" }).Dswin);
    }

    [Fact]
    public void Pfade_sind_der_bestehende_Vertrag()
    {
        Assert.True(Pfade.Erlaubt("GET", "/patients?q=muster&limit=100"));
        Assert.True(Pfade.Erlaubt("POST", "/patients/0/hkps/import"));
        Assert.True(Pfade.Erlaubt("POST", "/patients/12/plaene/import"));
        Assert.False(Pfade.Erlaubt("GET", "/patients/12/plaene/import"));
        Assert.False(Pfade.Erlaubt("POST", "/patients/12/plaene"));
        Assert.True(Pfade.Erlaubt("GET", "/praxis/katalog"));
        Assert.True(Pfade.Erlaubt("GET", "/hkps/offen"));
        Assert.False(Pfade.Erlaubt("GET", "/hkps/offen?alle=1"));
        Assert.False(Pfade.Erlaubt("POST", "/hkps/offen"));
        Assert.False(Pfade.Erlaubt("GET", "/praxis/katalog?alles=1"));
        Assert.False(Pfade.Erlaubt("GET", "/patients/0/../../health"));
        Assert.False(Pfade.Erlaubt("POST", "/patients/0/befunde"));
        Assert.True(Pfade.Erlaubt("GET", "/patients/12/befunde/01"));
        Assert.True(Pfade.Erlaubt("POST", "/patients/12/befunde/01"));
        Assert.False(Pfade.Erlaubt("POST", "/patients/12/befunde/01/dummy"));
        Assert.False(Pfade.Erlaubt("DELETE", "/appointments/1"));
    }

    [Fact]
    public void Ausfuehren_reicht_nur_Erlaubtes_weiter()
    {
        var ordner = Verzeichnis();
        var cfg = Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel });
        var connector = new MerkConnector();
        var auftrag = JsonDocument.Parse("""{"method":"POST","pfad":"/patients/0/hkps/import","body":{"json":"{}"},"headers":{"X-DSWIN-EDIT":"1","Cookie":"a"},"ms":70000}""").RootElement;
        var (status, _) = Ausfuehren.Auftrag(auftrag, connector, cfg);
        Assert.Equal(200, status);
        Assert.Equal("1", connector.Kopf["X-DSWIN-EDIT"]);
        Assert.False(connector.Kopf.ContainsKey("Cookie"));

        var fremd = JsonDocument.Parse("""{"method":"GET","pfad":"/dashboard"}""").RootElement;
        Assert.Equal(403, Ausfuehren.Auftrag(fremd, connector, cfg).Status);

        var nurLesen = cfg with { Schreiben = false };
        var schreiben = JsonDocument.Parse("""{"method":"POST","pfad":"/patients/0/hkps"}""").RootElement;
        Assert.Equal(403, Ausfuehren.Auftrag(schreiben, connector, nurLesen).Status);

        File.WriteAllText(Path.Combine(ordner, "STOP"), "");
        var lesend = JsonDocument.Parse("""{"method":"GET","pfad":"/patients/0/hkps"}""").RootElement;
        Assert.Equal(503, Ausfuehren.Auftrag(lesend, connector, cfg).Status);
        Assert.Single(connector.Aufrufe);
    }

    [Fact]
    public async Task Ein_Zug_holt_den_Auftrag_und_liefert_die_Antwort()
    {
        var ordner = Verzeichnis();
        var port = FreierPort();
        using var lauscher = new HttpListener();
        lauscher.Prefixes.Add($"http://127.0.0.1:{port}/");
        lauscher.Start();
        var antworten = new List<string>();
        var schleife = Task.Run(async () =>
        {
            while (lauscher.IsListening)
            {
                var ctx = await lauscher.GetContextAsync();
                var pfad = ctx.Request.Url?.PathAndQuery ?? "";
                if (ctx.Request.HttpMethod == "GET" && pfad.Contains("pvs=dampsoft", StringComparison.Ordinal)
                    && ctx.Request.Headers["Authorization"] == "Bearer " + Schluessel)
                {
                    var body = """{"auftrag":{"id":"a1","method":"GET","pfad":"/patients?q=muster","ms":5000}}"""u8.ToArray();
                    ctx.Response.StatusCode = 200;
                    ctx.Response.ContentLength64 = body.Length;
                    await ctx.Response.OutputStream.WriteAsync(body);
                }
                else if (ctx.Request.HttpMethod == "POST")
                {
                    using var leser = new StreamReader(ctx.Request.InputStream);
                    antworten.Add(await leser.ReadToEndAsync());
                    var ok = """{"ok":true}"""u8.ToArray();
                    ctx.Response.StatusCode = 200;
                    ctx.Response.ContentLength64 = ok.Length;
                    await ctx.Response.OutputStream.WriteAsync(ok);
                }
                else ctx.Response.StatusCode = 401;
                ctx.Response.Close();
            }
        });

        var cfg = Schreiben(ordner, new { planr = $"http://127.0.0.1:{port}", mandant = "praxis", schluessel = Schluessel });
        using var kunde = new PlanRKunde(cfg, "dampsoft");
        await Schleife.EinZug(kunde, new MerkConnector(), cfg, "", CancellationToken.None);
        lauscher.Stop();
        try { await schleife; } catch (HttpListenerException) { }
        Assert.Contains("\"id\":\"a1\"", antworten[0]);
        Assert.Contains("\"status\":200", antworten[0]);
    }

    [Fact]
    public void Dswin_Fehler_geht_an_PlanR_und_nicht_an_den_Connector()
    {
        var connector = new MerkConnector();
        var cfg = Schreiben(Verzeichnis(), new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel });
        var fehler = @"DS-Win-Ordner \\SERVER\DS ist für das Konto SYSTEM der PlanR-Bridge nicht erreichbar.";
        var auftrag = JsonDocument.Parse("""{"method":"GET","pfad":"/patients?q=muster","ms":5000}""").RootElement;
        var (status, daten) = Ausfuehren.Auftrag(auftrag, connector, cfg, fehler);
        Assert.Equal(503, status);
        Assert.Equal(fehler, daten["error"]);
        Assert.Empty(connector.Aufrufe);
        Assert.Contains("status=DS-Win-Ordner", Umfrage.Abfrage("dampsoft", fehler, null));
    }

    [Fact]
    public void Praxisprogramme_auf_diesem_Rechner()
    {
        var ordner = Verzeichnis();
        var ini = Path.Combine(ordner, "DENSoffice.ini");
        File.WriteAllText(ini, "x");
        var cfg = Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, densini = ini, z1mdb = Path.Combine(ordner, "fehlt.mdb") });
        Assert.Equal(new[] { "dens" }, Praxis.Vorhanden(cfg, "dens"));
        Directory.CreateDirectory(Path.Combine(ordner, "daten"));
        File.WriteAllText(Path.Combine(ordner, "daten", "patient.dbf"), "x");
        var mitDswin = cfg with { Dswin = ordner };
        Assert.Equal(new[] { "dampsoft", "dens" }, Praxis.Vorhanden(mitDswin, "dens"));
        Assert.Equal(new[] { "dampsoft", "dens" }, Praxis.Vorhanden(cfg, "dens", () => "dampsoft"));
    }

    [Fact]
    public void PlanR_stellt_das_Praxisprogramm_um()
    {
        var ordner = Verzeichnis();
        var cfg = Schreiben(ordner, new { planr = "https://planr.pickadoc-tunnel.com", mandant = "praxis", schluessel = Schluessel, pvs = "auto" });
        var connector = new UmschaltConnector();
        using var kunde = new PlanRKunde(cfg, "dampsoft");
        Assert.True(Praxis.Uebernehmen("dens", connector, kunde, cfg));
        Assert.Equal("dens", kunde.Pvs);
        Assert.Equal("dens", connector.Pvs);
        Assert.Equal("dens", JsonDocument.Parse(File.ReadAllText(cfg.Datei)).RootElement.GetProperty("pvs").GetString());
        Assert.False(Praxis.Uebernehmen("dens", connector, kunde, cfg));
        Assert.False(Praxis.Uebernehmen("charly", connector, kunde, cfg));
    }

    [Fact]
    public void Ort_Antwort_nur_fuer_PlanR()
    {
        var cfg = Schreiben(Verzeichnis(), new { planr = "https://planr.pickadoc.de", mandant = "pc-abc123", schluessel = Schluessel });
        var (kopf, daten) = Ort.Antwort(cfg, "https://planr.pickadoc.de");
        Assert.Equal("pc-abc123", daten["bridge"]);
        Assert.Equal("https://planr.pickadoc.de", kopf["Access-Control-Allow-Origin"]);
        Assert.Equal("true", kopf["Access-Control-Allow-Private-Network"]);
        var fremd = Ort.Antwort(cfg, "https://fremd.example");
        Assert.False(fremd.Kopf.ContainsKey("Access-Control-Allow-Origin"));
        Assert.True(Ort.IstEinzelplatz("pc-abc123"));
        Assert.False(Ort.IstEinzelplatz("p-kkztef66ogt8l91yjcnu"));
    }

    [Fact]
    public void Umfrage_liest_Auftrag_und_Pvs_Vorgabe()
    {
        var (auftrag, pvs) = Umfrage.Lesen("""{"auftrag":{"id":"a1","method":"GET","pfad":"/praxen"},"pvs":"dens"}""");
        Assert.Equal("dens", pvs);
        Assert.Equal("a1", auftrag?.GetProperty("id").GetString());
        Assert.Contains("kann=dampsoft%2Cdens", Umfrage.Abfrage("dampsoft", "bereit", ["dampsoft", "dens"]));
        var leer = Umfrage.Lesen("{}");
        Assert.Null(leer.Auftrag);
    }

    static int FreierPort()
    {
        var tcp = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        tcp.Start();
        var port = ((IPEndPoint)tcp.LocalEndpoint).Port;
        tcp.Stop();
        return port;
    }

    static string Verzeichnis()
    {
        var ordner = Path.Combine(Path.GetTempPath(), "planr-bridge-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(ordner);
        return ordner;
    }

    static Konfig Schreiben(string ordner, object roh)
    {
        var datei = Path.Combine(ordner, "agent.json");
        File.WriteAllText(datei, JsonSerializer.Serialize(roh));
        return Konfig.Laden(datei);
    }

    sealed class UmschaltConnector : MerkConnector, IUmschaltbar
    {
        public string Pvs { get; private set; } = "dampsoft";
        public void Stoppen() { }
        public void Umstellen(string pvs) => Pvs = pvs;
    }

    class MerkConnector : IConnector
    {
        public List<string> Aufrufe { get; } = [];
        public Dictionary<string, string> Kopf { get; } = new(StringComparer.OrdinalIgnoreCase);

        public (int Status, Dictionary<string, object?> Daten) Rufen(string methode, string pfad, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms)
        {
            Aufrufe.Add(methode + " " + pfad);
            foreach (var eintrag in kopf) Kopf[eintrag.Key] = eintrag.Value;
            return (200, new Dictionary<string, object?> { ["items"] = new[] { new Dictionary<string, object?> { ["id"] = "0" } } });
        }
    }
}
