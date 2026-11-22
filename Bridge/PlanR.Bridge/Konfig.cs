using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge;

public sealed class KonfigFehler : Exception
{
    public KonfigFehler(string meldung) : base(meldung) { }
}

/// <summary>Dieselbe agent.json wie die Python-Bridge (pvs_agent.konfig_laden).</summary>
public sealed record Konfig(
    string Planr,
    string Mandant,
    string Schluessel,
    string Pvs,
    string Dswin,
    string Z1Mdb,
    string DensIni,
    string CfClientId,
    string CfClientSecret,
    bool Schreiben,
    bool Aktualisieren,
    string Ordner,
    string Datei)
{
    public static readonly string[] Programme = ["dampsoft", "dens", "cgm-z1pro", "t2med"];

    public static Konfig Laden(string datei)
    {
        JsonElement roh;
        try
        {
            using var strom = File.OpenRead(datei);
            using var doc = JsonDocument.Parse(strom, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip });
            roh = doc.RootElement.Clone();
        }
        catch (Exception exc) when (exc is IOException or JsonException or UnauthorizedAccessException)
        {
            throw new KonfigFehler($"{datei}: {exc.Message}");
        }

        var planr = Text(roh, "planr").TrimEnd('/');
        if (!Uri.TryCreate(planr, UriKind.Absolute, out var uri) || !string.IsNullOrEmpty(uri.AbsolutePath.TrimEnd('/'))
            || uri.Scheme == "http" && uri.Host is not ("127.0.0.1" or "localhost")
            || uri.Scheme is not ("https" or "http"))
            throw new KonfigFehler("planr muss eine https-Adresse ohne Pfad sein (z. B. https://planr.pickadoc.de).");

        var mandant = Text(roh, "mandant");
        if (!Regex.IsMatch(mandant, "^[a-z0-9-]{1,40}$"))
            throw new KonfigFehler("mandant fehlt oder ist ungültig (a-z, 0-9, Bindestrich).");

        var schluessel = Text(roh, "schluessel");
        if (schluessel.Length < 32)
            throw new KonfigFehler("schluessel fehlt (node pvs-agent-schluessel.ts <mandant> in PlanR).");

        var pvs = roh.TryGetProperty("pvs", out var pvsEl) && pvsEl.ValueKind == JsonValueKind.String ? pvsEl.GetString() ?? "auto" : "auto";
        if (pvs != "auto" && !Programme.Contains(pvs))
            throw new KonfigFehler("pvs muss auto, dampsoft, dens, cgm-z1pro oder t2med sein.");

        var dswin = Text(roh, "dswin").Trim();
        if (dswin.Length > 0 && !dswin.StartsWith(@"\\", StringComparison.Ordinal) && !Regex.IsMatch(dswin, "^[A-Za-z]:\\\\"))
            throw new KonfigFehler(@"dswin muss ein vollständiger Pfad sein (z. B. D:\TDAMP\DS oder \\SERVER\TDAMP\DS).");

        var z1 = Text(roh, "z1mdb").Trim();
        if (z1.Length > 0 && !z1.StartsWith(@"\\", StringComparison.Ordinal) && !Regex.IsMatch(z1, "^[A-Za-z]:\\\\"))
            throw new KonfigFehler("z1mdb muss ein vollständiger Pfad zur Z1-Datenbank sein.");

        var schreiben = !roh.TryGetProperty("schreiben", out var s) || s.ValueKind != JsonValueKind.False;
        var aktualisieren = !roh.TryGetProperty("aktualisieren", out var a) || a.ValueKind != JsonValueKind.False;
        var ordner = Path.GetFullPath(Path.GetDirectoryName(datei) ?? ".");
        return new Konfig(planr, mandant, schluessel, pvs, dswin, z1, Text(roh, "densini").Trim(),
            Text(roh, "cfClientId"), Text(roh, "cfClientSecret"), schreiben, aktualisieren, ordner, Path.GetFullPath(datei));
    }

    static string Text(JsonElement roh, string name) =>
        roh.TryGetProperty(name, out var wert) && wert.ValueKind == JsonValueKind.String ? wert.GetString() ?? "" : "";
}
