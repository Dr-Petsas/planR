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
    var z1 = new PlanR.Bridge.Z1.Z1Connector(PlanR.Bridge.Z1.Z1Daten.Pfad(), schreiben: false);
    var json = new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    foreach (var pfad in File.ReadAllLines(z1Datei).Where(z => z.Length > 0))
    {
        var (status, daten) = z1.Rufen("GET", pfad, null, new Dictionary<string, string>(), 10_000);
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { pfad, status, daten }, json));
    }
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
