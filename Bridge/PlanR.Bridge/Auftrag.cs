using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge;

/// <summary>
/// Dieselben Pfade wie pvs_agent.PFADE und PlanR pvs-agent-server.ts.
/// Die Muster sind der bestehende Vertrag, keine neue Spracherkennung.
/// </summary>
public static class Pfade
{
    static readonly (string Methode, Regex Muster)[] Liste =
    [
        ("GET", new Regex(@"^/patients\?[\w%=&.+-]{0,300}$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/patients/\d{1,9}$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/patients/\d{1,9}/(clinical|hkps)$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/patients/\d{1,9}/hkps/\d{1,5}/planr$", RegexOptions.CultureInvariant)),
        ("POST", new Regex(@"^/patients/\d{1,9}/hkps(/import)?$", RegexOptions.CultureInvariant)),
        ("POST", new Regex(@"^/patients/\d{1,9}/plaene/import$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/patients/\d{1,9}/befunde/01$", RegexOptions.CultureInvariant)),
        ("POST", new Regex(@"^/patients/\d{1,9}/befunde/01$", RegexOptions.CultureInvariant)),
        ("POST", new Regex(@"^/patients/\d{1,9}/dokumentation$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/praxis/katalog$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/praxen$", RegexOptions.CultureInvariant)),
        ("GET", new Regex(@"^/hkps/offen$", RegexOptions.CultureInvariant)),
    ];

    public static bool Erlaubt(string methode, string pfad) =>
        Liste.Any(eintrag => eintrag.Methode == methode && eintrag.Muster.IsMatch(pfad));
}

public static class Kopfzeilen
{
    static readonly HashSet<string> Weiter = new(StringComparer.OrdinalIgnoreCase) { "x-dswin-edit", "x-dswin-praxen" };

    public static Dictionary<string, string> Filtern(IReadOnlyDictionary<string, string>? kopf)
    {
        var aus = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (kopf is null) return aus;
        foreach (var (name, wert) in kopf)
            if (Weiter.Contains(name)) aus[name] = wert;
        return aus;
    }
}

public interface IConnector
{
    (int Status, Dictionary<string, object?> Daten) Rufen(string methode, string pfad, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms);
}

public static class Ausfuehren
{
    public static (int Status, Dictionary<string, object?> Daten) Auftrag(JsonElement auftrag, IConnector connector, Konfig cfg, string fehler = "")
    {
        var methode = auftrag.TryGetProperty("method", out var m) ? m.GetString() ?? "" : "";
        var pfad = auftrag.TryGetProperty("pfad", out var p) ? p.GetString() ?? "" : "";
        if (File.Exists(Path.Combine(cfg.Ordner, "STOP")))
            return Fehler(503, "Die PlanR-Bridge der Praxis ist per Notaus angehalten.");
        if (fehler.Length > 0)
            return Fehler(503, fehler);
        if (!Pfade.Erlaubt(methode, pfad))
            return Fehler(403, "Diesen Aufruf führt die PlanR-Bridge nicht aus.");
        if (methode == "POST" && !cfg.Schreiben)
            return Fehler(403, "An der PlanR-Bridge der Praxis ist das Schreiben abgeschaltet.");

        JsonElement? body = auftrag.TryGetProperty("body", out var b) && b.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined ? b : null;
        var kopf = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (auftrag.TryGetProperty("headers", out var h) && h.ValueKind == JsonValueKind.Object)
            foreach (var eintrag in h.EnumerateObject())
                if (eintrag.Value.ValueKind == JsonValueKind.String)
                    kopf[eintrag.Name] = eintrag.Value.GetString() ?? "";
        var ms = 10_000;
        if (auftrag.TryGetProperty("ms", out var msEl) && msEl.TryGetInt32(out var wert))
            ms = Math.Clamp(wert, 1000, 600_000);
        return connector.Rufen(methode, pfad, body, Kopfzeilen.Filtern(kopf), ms);
    }

    public static (int Status, Dictionary<string, object?> Daten) Fehler(int status, string text) =>
        (status, new Dictionary<string, object?> { ["error"] = text });
}

public static class Umfrage
{
    public const string Version = "0.1.0";

    public static string Abfrage(string pvs, string? status, IReadOnlyList<string>? kann)
    {
        var teile = new List<string> { "pvs=" + Uri.EscapeDataString(pvs), "version=" + Uri.EscapeDataString(Version) };
        if (!string.IsNullOrEmpty(status)) teile.Add("status=" + Uri.EscapeDataString(status.Length > 160 ? status[..160] : status));
        if (kann is not null) teile.Add("kann=" + Uri.EscapeDataString(string.Join(',', kann)));
        return string.Join('&', teile);
    }

    /// <summary>200 mit Auftrag und optionaler PVS-Vorgabe. 204 ist kein Auftrag.</summary>
    public static (JsonElement? Auftrag, string? Pvs) Lesen(string json)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        var wurzel = doc.RootElement;
        string? pvs = wurzel.TryGetProperty("pvs", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
        JsonElement? auftrag = wurzel.TryGetProperty("auftrag", out var a) && a.ValueKind == JsonValueKind.Object ? a.Clone() : null;
        return (auftrag, pvs);
    }
}
