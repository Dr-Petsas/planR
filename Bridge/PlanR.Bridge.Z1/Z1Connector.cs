using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Z1;

using Zeile = Dictionary<string, object?>;

/// <summary>
/// Z1.PRO ohne lokalen Port: dieselben Routen und Antworten wie z1_connector_service.py.
/// Schreiben ist noch nicht enthalten und wird abgelehnt.
/// </summary>
public sealed class Z1Connector(string mdb, bool schreiben) : IConnector
{
    const string SucheFehler = "Use q (1-200 characters) or firstName/lastName, limit (1-100)";
    readonly Z1Daten daten = new(mdb);

    public (int Status, Zeile Daten) Rufen(string methode, string pfad, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms)
    {
        if (methode == "GET") return Get(pfad);
        return Fehler(501, "Schreiben nach Z1 ist in der kompilierten PlanR-Bridge noch nicht enthalten.");
    }

    static (int, Zeile) Fehler(int status, string text) => (status, new Zeile { ["error"] = text });

    List<Zeile> Patienten()
    {
        var liste = daten.Patienten();
        foreach (var p in liste) Z1Stamm.Telefone(p);
        return liste;
    }

    (int, Zeile) Get(string ziel)
    {
        var frage = ziel.IndexOf('?');
        var pfad = frage < 0 ? ziel : ziel[..frage];
        var query = frage < 0 ? "" : ziel[(frage + 1)..];
        try
        {
            if (pfad == "/health")
                return (200, new Zeile
                {
                    ["status"] = "ok", ["service"] = "z1-connector", ["mode"] = "jet",
                    ["mdb"] = daten.Mdb, ["schreiben"] = schreiben, ["found"] = File.Exists(daten.Mdb),
                });
            if (pfad == "/praxis/katalog")
                return (200, Z1Katalog.Bauen(daten.Katalog(), daten.Makros()));
            if (pfad == "/patients")
                return Suche(query);
            if (pfad == "/hkps/offen")
                return (200, new Zeile { ["items"] = daten.Offen() });
            Match m;
            if ((m = Regex.Match(pfad, @"\A/patients/(\d{1,9})/befunde/01\z")).Success)
            {
                var roh = daten.Befund(m.Groups[1].Value);
                return roh is null ? Fehler(404, "Patient nicht gefunden.") : (200, Z1Befund.Lesen(roh));
            }
            if ((m = Regex.Match(pfad, @"\A/patients/(\d{1,9})/clinical\z")).Success)
                return (200, new Zeile { ["hkps"] = daten.Plaene(m.Groups[1].Value) });
            if ((m = Regex.Match(pfad, @"\A/patients/(\d{1,9})/hkps/(\d{1,5})/planr\z")).Success)
            {
                var patient = Z1Stamm.Einer(Patienten(), m.Groups[1].Value);
                var roh = patient is null ? null : daten.Plan(m.Groups[1].Value, m.Groups[2].Value);
                return roh is null ? Fehler(404, "Plan nicht gefunden.") : (200, Z1Planr.AusZ1(patient!, roh));
            }
            if ((m = Regex.Match(pfad, @"\A/patients/(\d{1,9})/hkps\z")).Success)
                return (200, new Zeile { ["items"] = daten.Plaene(m.Groups[1].Value) });
            if ((m = Regex.Match(pfad, @"\A/patients/(\d{1,9})\z")).Success)
            {
                var patient = Z1Stamm.Einer(Patienten(), m.Groups[1].Value);
                return patient is null ? Fehler(404, "Patient nicht gefunden.") : (200, patient);
            }
        }
        catch (Z1Fehler exc) { return Fehler(503, exc.Message); }
        catch (Z1Eingabe exc) { return Fehler(400, exc.Message); }
        return Fehler(404, "Route nicht gefunden.");
    }

    (int, Zeile) Suche(string roh)
    {
        var query = new Dictionary<string, List<string>>();
        var felder = 0;
        foreach (var paar in roh.Split('&'))
        {
            if (paar.Length == 0) continue;
            if (++felder > 6) throw new Z1Eingabe("Max number of fields exceeded");
            var gleich = paar.IndexOf('=');
            var name = Uri.UnescapeDataString((gleich < 0 ? paar : paar[..gleich]).Replace('+', ' '));
            var wert = gleich < 0 ? "" : Uri.UnescapeDataString(paar[(gleich + 1)..].Replace('+', ' '));
            if (!query.TryGetValue(name, out var werte)) query[name] = werte = [];
            werte.Add(wert);
        }
        string[] erlaubt = ["q", "limit", "firstName", "lastName"];
        if (query.Keys.Any(k => !erlaubt.Contains(k)) || query.Values.Any(v => v.Count != 1))
            return Fehler(400, SucheFehler);
        string Feld(string name, string sonst = "") => query.TryGetValue(name, out var w) ? w[0] : sonst;
        string q = Feld("q").Trim(), vor = Feld("firstName").Trim(), nach = Feld("lastName").Trim();
        var limitText = Feld("limit", "30");
        if (!int.TryParse(limitText.Trim(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var limit))
            throw new Z1Eingabe($"invalid literal for int() with base 10: '{limitText}'");
        if (limit is < 1 or > 100 || q.Length > 200 || vor.Length > 80 || nach.Length > 80 || (q.Length == 0 && vor.Length == 0 && nach.Length == 0))
            return Fehler(400, SucheFehler);
        var alle = Patienten();
        var items = q.Length > 0 ? Z1Stamm.Suchen(alle, q, limit) : Z1Stamm.Namen(alle, vor, nach, limit);
        return (200, new Zeile { ["items"] = items, ["total"] = items.Count, ["limit"] = limit, ["offset"] = 0 });
    }
}
