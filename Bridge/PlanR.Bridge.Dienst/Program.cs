using PlanR.Bridge;

if (args.Contains("--version"))
{
    Console.WriteLine(Umfrage.Version);
    return 0;
}

// Vergleichslauf gegen den Python-Connector: je Zeile der Datei ein GET-Pfad, je Zeile der Ausgabe eine Antwort.
if (Argument(args, "--z1-datei") is { } z1Datei)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    // Geschrieben wird im Vergleichslauf nur in eine ausdrücklich über Z1_MDB benannte Kopie, nie in die Praxisdatenbank.
    var darf = args.Contains("--z1-schreiben") && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("Z1_MDB"));
    var z1 = new PlanR.Bridge.Z1.Z1Connector(PlanR.Bridge.Z1.Z1Daten.Pfad(), schreiben: darf);
    var json = new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    foreach (var zeile in File.ReadAllLines(z1Datei).Where(z => z.Length > 0))
    {
        // "POST <Pfad> <JSON>" schreibt, alles andere ist ein GET-Pfad.
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
    var daten = new PlanR.Bridge.Z1.Z1Daten(PlanR.Bridge.Z1.Z1Daten.Pfad());
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
        Console.WriteLine(PlanR.Bridge.Z1.Z1Vergleich.Zeile(zeile));
    return 0;
}

// DENS-Vergleichslauf gegen den Python-Connector: je Zeile ein GET-Pfad oder "POST <Pfad> <JSON>".
if (Argument(args, "--dens-datei") is { } densDatei)
{
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    var darf = args.Contains("--dens-schreiben") && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DENS_OFFICE_INI"));
    var dens = new PlanR.Bridge.Dens.DensConnector();
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
    var ds = new PlanR.Bridge.Dampsoft.DsWinConnector(dsRoot, enableWrite: darf, backupBase: backupBase);
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

if (args.Contains("--pruefen"))
{
    Console.WriteLine($"Konfiguration gültig. Mandant {cfg.Mandant}, PVS {cfg.Pvs}.");
    return 0;
}

Console.Error.WriteLine("Die kompilierte Bridge ersetzt den laufenden Dienst noch nicht. Der Download in PlanR bleibt gesperrt.");
return 4;

static string? Argument(string[] args, string name)
{
    var i = Array.IndexOf(args, name);
    return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
}
