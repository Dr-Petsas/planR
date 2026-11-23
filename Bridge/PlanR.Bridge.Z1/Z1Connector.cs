using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Z1;

using Zeile = Dictionary<string, object?>;

/// <summary>
/// Z1.PRO ohne lokalen Port: dieselben Routen und Antworten wie z1_connector_service.py.
/// Geschrieben wird nur, wenn die Bridge dafür eingerichtet ist; je Auftrag eine Transaktion.
/// </summary>
public sealed class Z1Connector(string mdb, bool schreiben) : IConnector
{
    const string SucheFehler = "Use q (1-200 characters) or firstName/lastName, limit (1-100)";
    readonly Z1Daten daten = new(mdb);

    public (int Status, Zeile Daten) Rufen(string methode, string pfad, JsonElement? body, IReadOnlyDictionary<string, string> kopf, int ms)
    {
        if (methode == "GET") return Get(pfad);
        if (methode == "POST") return Post(pfad, body);
        return Fehler(501, $"Unsupported method ('{methode}')");
    }

    /// <summary>Wie SCHREIBEN im Python-Connector: Z1 bekommt immer nur einen Schreibauftrag zugleich.</summary>
    static readonly SemaphoreSlim Sperre = new(1, 1);
    readonly Z1Schreiber schreiber = new(mdb);

    static Zeile Body(JsonElement? body)
    {
        if (body is not { } b || System.Text.Encoding.UTF8.GetByteCount(b.GetRawText()) > 65536)
            throw new Z1Eingabe("JSON erforderlich.");
        return Pj.Baum(b) as Zeile ?? throw new Z1Eingabe("");
    }

    (int, Zeile) Post(string pfad, JsonElement? body)
    {
        var befundWeg = Regex.Match(pfad, @"\A/patients/(\d{1,9})/befunde/01\z");
        var privat = Regex.Match(pfad, @"\A/patients/(\d{1,9})/plaene/import\z");
        var doku = Regex.Match(pfad, @"\A/patients/(\d{1,9})/dokumentation\z");
        var hkp = Regex.Match(pfad, @"\A/patients/(\d{1,9})/hkps\z");
        var match = befundWeg.Success ? befundWeg : privat.Success ? privat : doku.Success ? doku : hkp;
        if (!match.Success) return Fehler(404, "Route nicht gefunden.");
        if (!schreiben) return Fehler(403, "Die PlanR-Bridge ist nur zum Lesen eingerichtet.");
        var patnr = match.Groups[1].Value;
        if (doku.Success) return Dokumentation(patnr, body);
        Zeile plan;
        try
        {
            Zeile b;
            try { b = Body(body); }
            catch (Z1Eingabe exc) when (exc.Message.Length == 0)
            {
                throw new Z1Eingabe(befundWeg.Success ? "Body muss {\"version\":\"…\",\"teeth\":{…}} sein." : "Body muss {\"json\":\"<PlanR-Plan>\"} sein.");
            }
            if (befundWeg.Success)
            {
                if (Pj.Get(b, "version") is not string version || Pj.Get(b, "teeth") is not Zeile teeth)
                    throw new Z1Eingabe("Body muss {\"version\":\"…\",\"teeth\":{…}} sein.");
                return Befund(patnr, version, teeth);
            }
            if (b.Count != 1 || Pj.Get(b, "json") is not string json)
                throw new Z1Eingabe("Body muss {\"json\":\"<PlanR-Plan>\"} sein.");
            if (privat.Success)
                plan = Z1Hkp.PlanAusPlanr(json, patnr, daten.Katalog());
            else
            {
                var kuerzel = ((List<Zeile>)daten.Makros()["makros"]!)
                    .Where(m => Py.S(m, "go").Trim() is "4" or "5").Select(m => Py.S(m, "id").Trim()).ToHashSet();
                plan = Z1Hkp.PlanAusJson(json, patnr, daten.Katalog(), kuerzel);
            }
            if (Z1Stamm.Einer(Patienten(), patnr) is null) return Fehler(404, "Patient nicht gefunden.");
        }
        catch (Exception exc) when (exc is HkpFehler or BefundFehler) { return Fehler(400, exc.Message); }
        catch (Z1Eingabe exc) { return Fehler(400, exc.Message.Length > 0 ? exc.Message : "Ungültige JSON-Datei."); }
        catch (Z1Fehler exc) { return Fehler(503, exc.Message); }
        if (!Sperre.Wait(0)) return Fehler(409, "Ein Plan wird bereits angelegt.");
        Zeile resultat;
        try { resultat = schreiber.Plan(plan); }
        catch (Exception exc) when (exc is Z1SchreibFehler or Z1WertFehler)
        {
            return Fehler(503, exc.Message.Length > 0 ? exc.Message : "Z1 hat den Plan nicht übernommen.");
        }
        finally { Sperre.Release(); }
        var nummer = resultat["lfdplan"] is int n ? n : 0;
        if (nummer < 1) return Fehler(503, "Z1 hat keinen Plan angelegt.");
        var antwort = new Zeile { ["number"] = nummer, ["zeilen"] = resultat["zeilen"], ["hinweise"] = plan["hinweise"] };
        if (privat.Success) antwort["label"] = plan["label"];
        return (201, antwort);
    }

    /// <summary>Freitext in die Karteikarte. Nichts wird gekürzt: passt der Text nicht, wird nichts geschrieben.</summary>
    (int, Zeile) Dokumentation(string patnr, JsonElement? body)
    {
        string text;
        DateOnly tag;
        try
        {
            Zeile b;
            try { b = Body(body); }
            catch (Z1Eingabe exc) when (exc.Message.Length == 0) { throw new Z1Eingabe("Body muss {\"text\":\"...\"} sein."); }
            if (b.Keys.Any(k => k is not ("text" or "date")) || Pj.Get(b, "text") is not string roh)
                throw new Z1Eingabe("Body muss {\"text\":\"...\"} sein.");
            text = string.Join(' ', Py.Worte(roh));
            if (text.Length == 0) throw new Z1Eingabe("Der Dokumentationstext fehlt.");
            if (string.Join(' ', Z1Plan.Dokumentation(text)) != text)
                throw new Z1Eingabe("Der Text ist für die Z1-Kartei zu lang (höchstens 8 Zeilen mit 60 Zeichen).");
            if (!Cp1252(text)) return Fehler(400, "Der Text enthält Zeichen, die Z1 nicht speichert.");
            var datum = Pj.Get(b, "date");
            if (!Pj.Wahr(datum)) tag = DateOnly.FromDateTime(DateTime.Today);
            else if (datum is not string iso) throw new Z1Eingabe("fromisoformat: argument must be str");
            else if (!DateOnly.TryParseExact(iso, ["yyyy-MM-dd", "yyyyMMdd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out tag))
                throw new Z1Eingabe($"Invalid isoformat string: '{iso}'");
            if (Z1Stamm.Einer(Patienten(), patnr) is null) return Fehler(404, "Patient nicht gefunden.");
        }
        catch (Z1Eingabe exc) { return Fehler(400, exc.Message.Length > 0 ? exc.Message : "Ungültige Anfrage."); }
        catch (Z1Fehler exc) { return Fehler(503, exc.Message); }
        Zeile resultat;
        Sperre.Wait();
        try { resultat = schreiber.Dokumentieren(patnr, text, tag.ToString("yyyyMMdd", CultureInfo.InvariantCulture)); }
        catch (Exception exc) when (exc is Z1SchreibFehler or Z1WertFehler)
        {
            return Fehler(503, exc.Message.Length > 0 ? exc.Message : "Z1 hat den Eintrag nicht übernommen.");
        }
        finally { Sperre.Release(); }
        if (resultat["dokumente"] is not int zeilen || zeilen < 1) return Fehler(503, "Z1 hat keinen Karteieintrag angelegt.");
        return (201, new Zeile { ["id"] = patnr, ["date"] = tag.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), ["zeilen"] = zeilen, ["text"] = text });
    }

    /// <summary>Entspricht text.encode('cp1252') in Python: fünf Plätze der Codepage sind dort unbelegt.</summary>
    static bool Cp1252(string text)
    {
        if (text.Any(c => c is '\u0081' or '\u008d' or '\u008f' or '\u0090' or '\u009d')) return false;
        try
        {
            System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
            System.Text.Encoding.GetEncoding(1252, System.Text.EncoderFallback.ExceptionFallback, System.Text.DecoderFallback.ExceptionFallback).GetBytes(text);
            return true;
        }
        catch (System.Text.EncoderFallbackException) { return false; }
    }

    (int, Zeile) Befund(string patnr, string version, Zeile teeth)
    {
        var roh = daten.Befund(patnr);
        if (roh is null) return Fehler(404, "Patient nicht gefunden.");
        if (version != Z1Befund.Version(Pj.Get(roh, "befund") as string))
            return Fehler(409, "Der Befund wurde in Z1 inzwischen geändert. Bitte neu laden.");
        var (neu, geaendert, ungefaehr) = Z1Befund.Auftrag(roh, teeth);
        if (geaendert.Count > 0)
        {
            Sperre.Wait();
            try { schreiber.Befund(patnr, Pj.StrOr(Pj.Get(roh, "befund")), neu, DateTime.Today.ToString("yyyyMMdd", CultureInfo.InvariantCulture)); }
            catch (Z1Konflikt exc) { return Fehler(409, exc.Message); }
            catch (Z1SchreibFehler exc) { return Fehler(503, exc.Message.Length > 0 ? exc.Message : "Z1 hat den Befund nicht übernommen."); }
            finally { Sperre.Release(); }
        }
        var stand = Z1Befund.Lesen(daten.Befund(patnr));
        return (201, new Zeile
        {
            ["selectedTeeth"] = geaendert, ["message"] = Z1Befund.Meldung(geaendert, ungefaehr),
            ["version"] = stand["version"], ["current"] = stand["current"],
        });
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
