using PlanR.Bridge;
using PlanR.Bridge.Dampsoft;
using PlanR.Bridge.Dens;
using PlanR.Bridge.Dienst;
using PlanR.Bridge.Z1;

if (args.Contains("--version"))
{
    Console.WriteLine(Umfrage.Version);
    return 0;
}

// Prüft eine Datei unter dem laufenden Windows-Konto (Setup -> KontoEinrichten ohne Python).
if (Argument(args, "--datei-pruefen") is { } pruefDatei)
{
    return File.Exists(pruefDatei) ? 0 : 1;
}

// Signiert ein Update-Paket auf dem Entwickler-PC (paket-bauen.ps1).
if (args.Length == 4 && args[0] == "--update-signieren")
{
    var pem = Environment.GetEnvironmentVariable("PLANR_UPDATE_SCHLUESSEL")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".planr", "bridge-update.pem");
    Aktualisieren.SignierenMitPem(pem, args[1], args[2], args[3]);
    return 0;
}

// Einrichtungs-Hilfsbefehle für PlanR-Bridge-Setup.exe (einloesen, melden, warten, dswin, dens).
if (Argument(args, "--einrichten") is { } einrichtBefehl)
{
    return await Einrichten.Ausfuehren(einrichtBefehl);
}

// Vergleichslauf gegen den Python-Connector: je Zeile der Datei ein GET-Pfad, je Zeile der Ausgabe eine Antwort.
if (Argument(args, "--z1-datei") is { } z1Datei)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    // Geschrieben wird im Vergleichslauf nur in eine ausdrücklich über Z1_MDB benannte Kopie, nie in die Praxisdatenbank.
    var darf = args.Contains("--z1-schreiben") && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("Z1_MDB"));
    var z1 = new Z1Connector(Z1Daten.Pfad(), schreiben: darf);
    var json = new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    foreach (var zeile in File.ReadAllLines(z1Datei).Where(z => z.Length > 0))
    {
        var teile = zeile.StartsWith("POST ") ? zeile.Split(' ', 3) : ["GET", zeile];
        var pfad = teile[1];
        System.Text.Json.JsonElement? body = teile.Length > 2 ? System.Text.Json.JsonDocument.Parse(teile[2]).RootElement : null;
        var (status, daten) = z1.Rufen(teile[0], pfad, body, new Dictionary<string, string>(), 10_000);
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { pfad, status, daten }, json));
    }
    return 0;
}

// Abzug einzelner Z1-Tabellen (kommagetrennt), um zwei Datenbankkopien nach einem Schreibvergleich gegenüberzustellen.
if (Argument(args, "--z1-abzug") is { } tabellen)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    var daten = new Z1Daten(Z1Daten.Pfad());
    foreach (var tabelle in tabellen.Split(','))
        foreach (var satz in daten.Abzug(tabelle))
            Console.WriteLine(tabelle + "\t" + satz);
    return 0;
}

// Schreib-Vergleich gegen den Python-Connector: je Zeile eine JSON-Anfrage, je Zeile eine JSON-Antwort (ohne Datenbank).
if (Argument(args, "--z1-schreib-datei") is { } schreibDatei)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    foreach (var zeile in File.ReadAllLines(schreibDatei).Where(z => z.Trim().Length > 0))
        Console.WriteLine(Z1Vergleich.Zeile(zeile));
    return 0;
}

// DENS-Vergleichslauf gegen den Python-Connector: je Zeile ein GET-Pfad oder "POST <Pfad> <JSON>".
if (Argument(args, "--dens-datei") is { } densDatei)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    var darf = args.Contains("--dens-schreiben") && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DENS_OFFICE_INI"));
    var dens = new DensConnector();
    var json = new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    foreach (var zeile in File.ReadAllLines(densDatei).Where(z => z.Length > 0))
    {
        var teile = zeile.StartsWith("POST ") ? zeile.Split(' ', 3) : ["GET", zeile];
        var methode = teile[0];
        var pfad = teile[1];
        if (methode == "POST" && !darf)
        {
            Console.Error.WriteLine("Schreiben nach DENS erfordert --dens-schreiben und DENS_OFFICE_INI auf eine Datenbankkopie.");
            return 3;
        }
        System.Text.Json.JsonElement? body = teile.Length > 2 ? System.Text.Json.JsonDocument.Parse(teile[2]).RootElement : null;
        var (status, daten) = dens.Rufen(methode, pfad, body, new Dictionary<string, string>(), 30_000);
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { pfad, status, daten }, json));
    }
    return 0;
}

// DS-Win-Vergleichslauf gegen den Python-Connector: je Zeile ein GET-Pfad, "H <Header> <Pfad>" oder "POST <Pfad> <JSON>".
if (Argument(args, "--dswin-datei") is { } dsDatei)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    var dsRoot = Environment.GetEnvironmentVariable("DSWIN_ROOT");
    var darf = args.Contains("--dswin-schreiben") && !string.IsNullOrEmpty(dsRoot);
    var backupBase = Argument(args, "--dswin-backup");
    var ds = new DsWinConnector(dsRoot, enableWrite: darf, backupBase: backupBase);
    var json = new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    foreach (var zeile in File.ReadAllLines(dsDatei).Where(z => z.Length > 0))
    {
        var kopf = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var rest = zeile;
        while (rest.StartsWith("H "))
        {
            var p = rest.Split(' ', 3);
            var kv = p[1].Split(':', 2);
            kopf[kv[0]] = kv.Length > 1 ? kv[1] : "";
            rest = p[2];
        }
        var teile = rest.StartsWith("POST ") ? rest.Split(' ', 3) : ["GET", rest];
        var methode = teile[0];
        var pfad = teile[1];
        if (methode == "POST" && !darf)
        {
            Console.Error.WriteLine("Schreiben nach DS-Win erfordert --dswin-schreiben und DSWIN_ROOT auf eine Datenbankkopie.");
            return 3;
        }
        System.Text.Json.JsonElement? body = teile.Length > 2 ? System.Text.Json.JsonDocument.Parse(teile[2]).RootElement : null;
        var (status, daten) = ds.Rufen(methode, pfad, body, kopf, 30_000);
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { pfad, status, daten }, json));
    }
    return 0;
}

var configPfad = Argument(args, "--config") ?? Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PlanR-Bridge", "agent.json");

Konfig cfg;
try
{
    cfg = Konfig.Laden(configPfad);
}
catch (KonfigFehler exc)
{
    Console.Error.WriteLine($"Konfiguration: {exc.Message}");
    return 2;
}

var log = new Protokoll(cfg.Ordner);
var pvs = ConnectorVerwalter.Erkennen(cfg);

// --pruefen: prüft PVS-Connector + Erreichbarkeit von PlanR und beendet sich mit 0/1.
if (args.Contains("--pruefen"))
{
    using var verwalter = new ConnectorVerwalter(cfg, log, pvs);
    var zustand = verwalter.Zustand();
    Console.WriteLine(zustand == "bereit" ? $"Connector bereit ({pvs})." : $"Connector: {zustand}");
    using var kunde = new PlanRKunde(cfg, pvs);
    using var kurz = new CancellationTokenSource(TimeSpan.FromSeconds(30));
    try
    {
        // Leerer Status signalisiert PlanR die reine Installationsprüfung (nurPruefung -> HTTP 204 ohne Auftrag).
        await kunde.Abholen("", kurz.Token);
        Console.WriteLine($"PlanR verbunden ({cfg.Planr}, Mandant {cfg.Mandant}).");
        return zustand == "bereit" ? 0 : 1;
    }
    catch (Exception exc)
    {
        Console.Error.WriteLine($"PlanR nicht erreichbar: {exc.Message}");
        return 1;
    }
}

// Produktivbetrieb: 3 Arbeiter + Erreichbarkeits-Wächter + Einzelplatz-Erkennung + signierte Updates.
log.Info($"PlanR-Bridge {Umfrage.Version} startet (Mandant {cfg.Mandant}, PVS {pvs}, PlanR {cfg.Planr})");

using var haltQuelle = new CancellationTokenSource();
var updateNeustart = 0;

Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    haltQuelle.Cancel();
};
AppDomain.CurrentDomain.ProcessExit += (_, _) =>
{
    try { haltQuelle.Cancel(); } catch { }
};

using var connector = new ConnectorVerwalter(cfg, log, pvs);
using var kundeAktiv = new PlanRKunde(cfg, pvs);
var laufend = new Laufend();

using OrtDienst? ort = Ort.IstEinzelplatz(cfg.Mandant) ? new OrtDienst(cfg, log) : null;
ort?.Starten();

// Hintergrund-Scan nach vorhandenen Praxisprogrammen für die Umschalt-Anzeige in PlanR.
_ = Task.Run(() =>
{
    try
    {
        var gefunden = Praxis.Vorhanden(cfg, connector.Pvs, () =>
        {
            var (ds, _) = DsWinPfad.FindRoot();
            return !string.IsNullOrEmpty(ds) && DsWinPfad.Valid(ds) ? "dampsoft" : null;
        });
        // Auch DENS-Autoerkennung ergänzen, wenn keine densini explizit in agent.json steht.
        var menge = new SortedSet<string>(gefunden, StringComparer.Ordinal);
        if (!menge.Contains("dens") && !string.IsNullOrEmpty(DensPfad.Ini()))
            menge.Add("dens");
        kundeAktiv.Kann = menge.ToList();
        log.Info($"Erkannte Praxisprogramme: {string.Join(", ", kundeAktiv.Kann)}");
    }
    catch (Exception exc)
    {
        log.Warn($"PVS-Erkennung: {exc.Message}");
    }
}, haltQuelle.Token);

const int ArbeiterAnzahl = 3;
var aufgaben = new List<Task>(ArbeiterAnzahl + 2);
for (var i = 0; i < ArbeiterAnzahl; i++)
{
    aufgaben.Add(Task.Run(() => Schleife.Arbeit(
        kundeAktiv,
        connector,
        cfg,
        connector.Zustand,
        haltQuelle.Token,
        laufend,
        log.Info), haltQuelle.Token));
}

// Periodische Erreichbarkeits-Prüfung (30 s): holt DS-Win/DENS/Z1 zurück, sobald Freigabe wieder da ist.
aufgaben.Add(Task.Run(async () =>
{
    while (!haltQuelle.IsCancellationRequested)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), haltQuelle.Token); }
        catch (OperationCanceledException) { break; }
        connector.Nachsehen();
    }
}, haltQuelle.Token));

// Selbstaktualisierung (RSA-3072-signiertes Paket, prüft nach 2 min und danach stündlich).
aufgaben.Add(Task.Run(() => Aktualisieren.Schleife(
    kundeAktiv,
    cfg,
    laufend,
    log,
    () =>
    {
        Interlocked.Exchange(ref updateNeustart, 1);
        haltQuelle.Cancel();
    },
    haltQuelle.Token), haltQuelle.Token));

try
{
    await Task.WhenAll(aufgaben);
}
catch (OperationCanceledException) { }

laufend.Abwarten(TimeSpan.FromSeconds(10));
var exitCode = Volatile.Read(ref updateNeustart) == 1 ? Aktualisieren.ExitCodeNeustart : 0;
log.Info($"PlanR-Bridge beendet (Code {exitCode}).");
return exitCode;

static string? Argument(string[] args, string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}
