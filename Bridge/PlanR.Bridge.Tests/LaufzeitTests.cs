using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PlanR.Bridge;
using Xunit;

namespace PlanR.Bridge.Tests;

public class LaufzeitTests
{
    const string Schluessel = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    [Fact]
    public void Aktualisieren_prueft_Versionen_und_RSA_Signatur()
    {
        Assert.True(Aktualisieren.IstNeuer("2.0", "1.29"));
        Assert.True(Aktualisieren.IstNeuer("2.1", "2.0"));
        Assert.True(Aktualisieren.IstNeuer("2.0.1", "2.0"));
        Assert.False(Aktualisieren.IstNeuer("2.0", "2.0.0"));
        Assert.False(Aktualisieren.IstNeuer("1.29", "2.0"));
        Assert.False(Aktualisieren.IstNeuer("kaputt", "2.0"));

        using var rsa = RSA.Create(3072);
        var pub = rsa.ExportParameters(includePrivateParameters: false);
        var daten = Encoding.UTF8.GetBytes("PlanR-Bridge-Testpaket");
        var sig = rsa.SignData(daten, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);

        Assert.True(Aktualisieren.SignaturGueltig(daten, sig, pub));
        var manipuliert = (byte[])daten.Clone();
        manipuliert[0] ^= 0xff;
        Assert.False(Aktualisieren.SignaturGueltig(manipuliert, sig, pub));
        Assert.False(Aktualisieren.SignaturGueltig(daten, [1, 2, 3], pub));
    }

    [Fact]
    public void Aktualisieren_bereitet_signiertes_Paket_sicher_vor()
    {
        var ordner = Verzeichnis();
        using var rsa = RSA.Create(3072);
        var pub = rsa.ExportParameters(includePrivateParameters: false);

        var zipBytes = ZipErstellen(new Dictionary<string, string>
        {
            ["programm/PlanR.Bridge.Dienst.exe"] = "dummy-exe",
            ["programm/dens_laborzuordnung.json"] = "{}",
            ["programm/../ausbruch.txt"] = "verboten",
            ["fremd/ignoriert.txt"] = "weg",
        });
        var sha = Convert.ToHexString(SHA256.HashData(zipBytes)).ToLowerInvariant();
        var sigHex = Convert.ToHexString(rsa.SignData(zipBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)).ToLowerInvariant();

        var info = new UpdateInfo(true, "2.1", sha, sigHex);
        var (neu, version) = Aktualisieren.Vorbereiten(info, zipBytes, ordner, "2.0", pub, _ => "2.1");

        Assert.Equal("2.1", version);
        Assert.True(File.Exists(Path.Combine(neu, "PlanR.Bridge.Dienst.exe")));
        Assert.True(File.Exists(Path.Combine(neu, "dens_laborzuordnung.json")));
        Assert.False(File.Exists(Path.Combine(ordner, "update", "ausbruch.txt")));
        Assert.False(File.Exists(Path.Combine(neu, "ignoriert.txt")));
        Assert.Equal("2.1", File.ReadAllText(Path.Combine(ordner, "update", "bereit.txt")).Trim());

        // Ältere Version wird abgelehnt
        Assert.Throws<UpdateFehler>(() =>
            Aktualisieren.Vorbereiten(new UpdateInfo(true, "1.9", sha, sigHex), zipBytes, ordner, "2.0", pub, _ => "1.9"));

        // Falsche Prüfsumme wird abgelehnt
        Assert.Throws<UpdateFehler>(() =>
            Aktualisieren.Vorbereiten(new UpdateInfo(true, "2.1", new string('0', 64), sigHex), zipBytes, ordner, "2.0", pub, _ => "2.1"));

        // Ungültige Signatur wird abgelehnt
        Assert.Throws<UpdateFehler>(() =>
            Aktualisieren.Vorbereiten(new UpdateInfo(true, "2.1", sha, new string('a', 768)), zipBytes, ordner, "2.0", pub, _ => "2.1"));
    }

    [Fact]
    public async Task OrtDienst_antwortet_auf_planr_bridge_mit_CORS()
    {
        var ordner = Verzeichnis();
        var cfg = Schreiben(ordner, new { planr = "https://planr.pickadoc.de", mandant = "pc-test123", schluessel = Schluessel });
        var port = FreierPort();
        using var ort = new OrtDienst(cfg, port: port);
        Assert.True(ort.Starten());

        using var http = new HttpClient();
        using var req = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{port}/planr-bridge");
        req.Headers.Add("Origin", "https://planr.pickadoc.de");
        using var resp = await http.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("https://planr.pickadoc.de", resp.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", resp.Headers.GetValues("Access-Control-Allow-Private-Network").Single());
        var body = JsonDocument.Parse(await resp.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("pc-test123", body.GetProperty("bridge").GetString());
        Assert.Equal(Umfrage.Version, body.GetProperty("version").GetString());

        using var reqFremd = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{port}/planr-bridge");
        reqFremd.Headers.Add("Origin", "https://evil.example");
        using var respFremd = await http.SendAsync(reqFremd);
        Assert.False(respFremd.Headers.Contains("Access-Control-Allow-Origin"));

        using var resp404 = await http.GetAsync($"http://127.0.0.1:{port}/andere");
        Assert.Equal(HttpStatusCode.NotFound, resp404.StatusCode);
    }

    [Fact]
    public async Task Laufend_wartet_bis_alle_Auftraege_abgeschlossen_sind()
    {
        var laufend = new Laufend();
        var halter = laufend.Beginnen();
        Assert.Equal(1, laufend.Anzahl);
        Assert.False(laufend.Abwarten(TimeSpan.FromMilliseconds(30)));

        var freigabe = Task.Run(async () =>
        {
            await Task.Delay(50);
            halter.Dispose();
        });
        Assert.True(laufend.Abwarten(TimeSpan.FromSeconds(2)));
        await freigabe;
        Assert.Equal(0, laufend.Anzahl);
    }

    [Fact]
    public void Protokoll_rotiert_bei_Groessenlimit()
    {
        var ordner = Verzeichnis();
        var log = new Protokoll(ordner, "agent.log", maxBytes: 120, sicherungen: 2);
        for (var i = 0; i < 10; i++)
            log.Info($"Zeile {i} mit ausreichend Text fuer eine saubere Rotation");

        Assert.True(File.Exists(Path.Combine(ordner, "agent.log")));
        Assert.True(File.Exists(Path.Combine(ordner, "agent.log.1")));
    }

    [Fact]
    public async Task Ein_Zug_wechselt_PVS_bei_Vorgabe_und_schreibt_agent_json()
    {
        var ordner = Verzeichnis();
        var port = FreierPort();
        using var lauscher = new HttpListener();
        lauscher.Prefixes.Add($"http://127.0.0.1:{port}/");
        lauscher.Start();

        var antworten = new List<string>();
        var server = Task.Run(async () =>
        {
            while (lauscher.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await lauscher.GetContextAsync(); }
                catch { break; }
                if (ctx.Request.HttpMethod == "GET")
                {
                    var body = """{"pvs":"dens","auftrag":{"id":"u1","method":"GET","pfad":"/praxen","ms":5000}}"""u8.ToArray();
                    ctx.Response.StatusCode = 200;
                    ctx.Response.ContentLength64 = body.Length;
                    await ctx.Response.OutputStream.WriteAsync(body);
                }
                else
                {
                    using var r = new StreamReader(ctx.Request.InputStream);
                    antworten.Add(await r.ReadToEndAsync());
                    var ok = """{"ok":true}"""u8.ToArray();
                    ctx.Response.StatusCode = 200;
                    ctx.Response.ContentLength64 = ok.Length;
                    await ctx.Response.OutputStream.WriteAsync(ok);
                }
                ctx.Response.Close();
            }
        });

        var cfg = Schreiben(ordner, new { planr = $"http://127.0.0.1:{port}", mandant = "praxis", schluessel = Schluessel, pvs = "dampsoft" });
        var connector = new UmschaltDummy();
        using var kunde = new PlanRKunde(cfg, "dampsoft");
        await Schleife.EinZug(kunde, connector, cfg, "bereit", CancellationToken.None, new Laufend());

        lauscher.Stop();
        try { await server; } catch { }

        Assert.Equal("dens", kunde.Pvs);
        Assert.Equal("dens", connector.Pvs);
        Assert.Equal("dens", JsonDocument.Parse(File.ReadAllText(cfg.Datei)).RootElement.GetProperty("pvs").GetString());
        Assert.Single(antworten);
        Assert.Contains("\"id\":\"u1\"", antworten[0]);
    }

    static byte[] ZipErstellen(Dictionary<string, string> dateien)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, inhalt) in dateien)
            {
                var e = zip.CreateEntry(name);
                using var w = new StreamWriter(e.Open(), new UTF8Encoding(false));
                w.Write(inhalt);
            }
        }
        return ms.ToArray();
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
        var ordner = Path.Combine(Path.GetTempPath(), "planr-bridge-rt-" + Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(ordner);
        return ordner;
    }

    static Konfig Schreiben(string ordner, object roh)
    {
        var datei = Path.Combine(ordner, "agent.json");
        File.WriteAllText(datei, JsonSerializer.Serialize(roh));
        return Konfig.Laden(datei);
    }

    sealed class UmschaltDummy : IConnector, IUmschaltbar
    {
        public string Pvs { get; private set; } = "dampsoft";
        public void Stoppen() { }
        public void Umstellen(string pvs) => Pvs = pvs;
        public (int Status, Dictionary<string, object?> Daten) Rufen(string methode, string pfad, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms)
            => (200, new Dictionary<string, object?> { ["praxen"] = Array.Empty<object>() });
    }
}
