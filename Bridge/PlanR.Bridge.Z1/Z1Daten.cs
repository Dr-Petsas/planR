using System.Data.OleDb;
using System.Text.RegularExpressions;

namespace PlanR.Bridge.Z1;

using Zeile = Dictionary<string, object?>;

/// <summary>Z1 ist gerade nicht lesbar: wird zu 503 wie im Python-Connector.</summary>
public sealed class Z1Fehler(string text) : Exception(text);

/// <summary>Liest die Z1-Datenbank (Jet, 32 Bit). Dieselben Abfragen wie Z1Stamm.cs und Z1Katalog.cs.</summary>
public sealed class Z1Daten(string mdb)
{
    public string Mdb => mdb;

    public static string Pfad() =>
        Environment.GetEnvironmentVariable("Z1_MDB") is { Length: > 0 } p ? p : @"C:\CGM\Z1\data\z1.mdb";

    public static string OhneGeheimnis(string? text) =>
        Regex.Replace(text ?? "", @"(?i)(password\s*=\s*)[^;""\s]+", "$1***");

    T Lesen<T>(Func<OleDbConnection, T> fn)
    {
        if (!File.Exists(mdb)) throw new Z1Fehler($"Z1-Datenbank fehlt: {mdb}");
        var pass = Environment.GetEnvironmentVariable("Z1_DB_PASSWORD");
        if (string.IsNullOrEmpty(pass)) pass = "ora";
        try
        {
            using var conn = new OleDbConnection(
                "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" + mdb + ";Mode=Read;Jet OLEDB:Database Password=" + pass + ";");
            conn.Open();
            return fn(conn);
        }
        catch (Exception exc) when (exc is OleDbException or IOException or InvalidOperationException or UnauthorizedAccessException)
        {
            var text = OhneGeheimnis(exc.Message).Trim();
            throw new Z1Fehler(text.Length > 0 ? text : "Z1 ist gerade nicht lesbar.");
        }
    }

    static string Zelle(OleDbDataReader r, int i) => r.IsDBNull(i) ? "" : (Convert.ToString(r.GetValue(i)) ?? "").Trim();

    static string Datum(string roh)
    {
        if (roh.Length != 8) return "";
        foreach (var c in roh) if (c < '0' || c > '9') return "";
        return roh[..4] + "-" + roh.Substring(4, 2) + "-" + roh.Substring(6, 2);
    }

    static List<Zeile> Zeilen(OleDbConnection conn, string sql, string[] namen, params string[] werte)
    {
        var rows = new List<Zeile>();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        foreach (var w in werte) cmd.Parameters.AddWithValue("@p", w);
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var row = new Zeile();
            // Zahnschema und Befund sind stellengenau: nicht kürzen.
            for (var i = 0; i < namen.Length; i++)
                row[namen[i]] = r.IsDBNull(i) ? "" : namen[i].StartsWith('_') ? Convert.ToString(r.GetValue(i)) ?? "" : Zelle(r, i);
            rows.Add(row);
        }
        return rows;
    }

    /// <summary>Gebührenliste (Tabelle GO).</summary>
    public List<Zeile> Katalog() => Lesen(conn =>
        Zeilen(conn, "SELECT LSTNR, ANALOGNR, GOART, KURZTEXT, GEBPKT, LAB1PREIS FROM [GO]", ["nr", "analog", "art", "text", "punkte", "lab"]));

    /// <summary>Patienten mit Ort und den vier Telefonfeldern ("phones").</summary>
    public List<Zeile> Patienten() => Lesen(conn =>
    {
        var orte = new Dictionary<string, string>();
        var telefone = new Dictionary<string, List<string>>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT ADRID, ORT, TELEFON1, TELEFON2, TELEFON3, TELEFON4 FROM [ADR]";
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                var id = Zelle(r, 0);
                if (id == "" || orte.ContainsKey(id)) continue;
                orte[id] = Zelle(r, 1);
                var nummern = new List<string>();
                for (var i = 2; i < 6; i++) { var n = Zelle(r, i); if (n != "") nummern.Add(n); }
                telefone[id] = nummern;
            }
        }
        var rows = new List<Zeile>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT PATNR, PATNAME, PATVORNAME, GEBDATUM, ADRIDP FROM [PAT]";
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                if (!long.TryParse(Zelle(r, 0), out var nummer)) continue;
                var adr = Zelle(r, 4);
                rows.Add(new Zeile
                {
                    ["id"] = nummer.ToString(), ["patientNumber"] = nummer.ToString(),
                    ["lastName"] = Zelle(r, 1), ["firstName"] = Zelle(r, 2),
                    ["birthDate"] = Datum(Zelle(r, 3)), ["city"] = orte.GetValueOrDefault(adr, ""),
                    ["phones"] = telefone.GetValueOrDefault(adr) ?? [],
                });
            }
        }
        return rows;
    });

    public List<Zeile> Plaene(string patnr) => Lesen(conn =>
    {
        var rows = new List<Zeile>();
        if (!long.TryParse((patnr ?? "").Trim(), out var gesucht)) return rows;
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT PATNR, LFDPLAN, PLANUNGSDATUM, BEMERKUNG1 FROM [ZPLAN]";
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            if (!long.TryParse(Zelle(r, 0), out var pat) || pat != gesucht) continue;
            if (!int.TryParse(Zelle(r, 1), out var nr)) continue;
            var titel = Zelle(r, 3);
            rows.Add(new Zeile { ["number"] = nr, ["date"] = Datum(Zelle(r, 2)), ["description"] = titel, ["title"] = titel, ["status"] = "" });
        }
        return rows;
    });

    /// <summary>Planungskürzel der Praxis mit ihren Leistungen.</summary>
    public Zeile Makros() => Lesen(conn => new Zeile
    {
        ["makros"] = Zeilen(conn, "SELECT MACID, MACGO, MACART, MACROTEXT, INNERBILD FROM [MAC]", ["id", "go", "art", "text", "bild"]),
        ["zeilen"] = Zeilen(conn, "SELECT MACID, MACGO, LFDMACENTRY, GOART, LSTNR, FAKULTATIV, ANZAHL, PRULE FROM [MACENTRY]",
            ["id", "go", "lfd", "goart", "nr", "fakultativ", "anzahl", "regel"]),
    });

    /// <summary>Ein Plan mit Zahnschema, Planungsblock und dem Befundstand, auf den er verweist.</summary>
    public Zeile? Plan(string patnr, string nr) => Lesen(conn =>
    {
        if (!long.TryParse((patnr ?? "").Trim(), out var p) || !int.TryParse((nr ?? "").Trim(), out var n)) return null;
        string pat = p.ToString().PadLeft(10), lfd = n.ToString().PadLeft(3);
        var kopf = Zeilen(conn,
            "SELECT PLANUNGSDATUM, KASSENPLAN, MUSTER, PLANSTATUS, LFDBEFUND, BEMERKUNG1, BEMERKUNG2, MACID1O, MACID1U, KASSENANTEIL FROM [ZPLAN] WHERE PATNR=? AND LFDPLAN=?",
            ["datum", "kassenplan", "muster", "status", "lfdbefund", "bemerkung1", "bemerkung2", "_oben", "_unten", "kassenanteil"], pat, lfd);
        if (kopf.Count == 0) return null;
        var plan = kopf[0];
        plan["datum"] = Datum(Convert.ToString(plan["datum"]) ?? "");
        plan["number"] = n;
        var block = "";
        foreach (var b in Zeilen(conn, "SELECT LFDLBLOCK, LBLOCKART FROM [LBLOCK] WHERE PATNR=? AND LFDPLAN=?", ["lfd", "art"], pat, lfd))
            if (Convert.ToString(b["art"]) == "1") { block = (Convert.ToString(b["lfd"]) ?? "").PadLeft(3); break; }
        plan["zeilen"] = block == "" ? new List<Zeile>() : Zeilen(conn,
            "SELECT LFDLBLOCKENTRY, ART, LABOR, GOART, LSTNR, ANZAHL, EINZELBETRAG, FAKTOR, ZAEHNE, BEMERKUNG FROM [LBLOCKENTRY] WHERE PATNR=? AND LFDPLAN=? AND LFDLBLOCK=?",
            ["lfd", "art", "labor", "goart", "nr", "anzahl", "einzel", "faktor", "zaehne", "text"], pat, lfd, block);
        var lb = Convert.ToString(plan["lfdbefund"]) ?? "";
        var befund = lb == "" ? [] : Zeilen(conn, "SELECT BEFUND FROM [ABEFUND] WHERE PATNR=? AND LFDABEFUND=?", ["_befund"], pat, lb.PadLeft(3));
        plan["_befund"] = befund.Count > 0 ? befund[0]["_befund"] : "";
        return plan;
    });

    /// <summary>Aktueller Zahnstatus: ABEFUND-Satz 0 des Patienten. null, wenn es den Patienten nicht gibt.</summary>
    public Zeile? Befund(string patnr) => Lesen(conn =>
    {
        if (!long.TryParse((patnr ?? "").Trim(), out var gesucht)) return null;
        string? datum = null;
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT PATNR, LAST01DATUM FROM [PAT]";
            using var r = cmd.ExecuteReader();
            while (r.Read())
                if (long.TryParse(Zelle(r, 0), out var pat) && pat == gesucht) { datum = Datum(Zelle(r, 1)); break; }
        }
        if (datum is null) return null;
        var befund = "";
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT PATNR, LFDABEFUND, BEFUND FROM [ABEFUND]";
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                if (!long.TryParse(Zelle(r, 0), out var pat) || pat != gesucht) continue;
                if (!int.TryParse(Zelle(r, 1), out var lfd) || lfd != 0) continue;
                befund = r.IsDBNull(2) ? "" : Convert.ToString(r.GetValue(2)) ?? "";
                break;
            }
        }
        return new Zeile { ["date"] = datum, ["befund"] = befund };
    });

    /// <summary>Genehmigte ZE-Pläne ohne KZV-Abrechnung (Planstatus 4 = abgerechnet).</summary>
    public List<Zeile> Offen() => Lesen(conn =>
    {
        var namen = new Dictionary<long, string[]>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT PATNR, PATNAME, PATVORNAME FROM [PAT]";
            using var r = cmd.ExecuteReader();
            while (r.Read())
                if (long.TryParse(Zelle(r, 0), out var pat)) namen[pat] = [Zelle(r, 1), Zelle(r, 2)];
        }
        var rows = new List<Zeile>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT PATNR, LFDPLAN, PLANART, PLANSTATUS, PLANUNGSDATUM, GENEHMIGUNGSDATUM, ENDDATUM, KZVABRDATUM, BEMERKUNG1, BEMERKUNG2, KASSENPLAN FROM [ZPLAN]";
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                if (!long.TryParse(Zelle(r, 0), out var pat) || !int.TryParse(Zelle(r, 1), out var nr)) continue;
                var genehmigt = Datum(Zelle(r, 5));
                if (Zelle(r, 2) != "3" || Zelle(r, 10) != "7" || genehmigt == "" || Zelle(r, 3) == "4" || Datum(Zelle(r, 7)) != "") continue;
                var titel = Zelle(r, 8);
                if (titel == "") titel = Zelle(r, 9);
                rows.Add(new Zeile
                {
                    ["patient"] = pat.ToString(), ["number"] = nr, ["title"] = titel,
                    ["name"] = namen.TryGetValue(pat, out var n1) ? n1[0] : "", ["vorname"] = namen.TryGetValue(pat, out var n2) ? n2[1] : "",
                    ["date"] = Datum(Zelle(r, 4)), ["genehmigt"] = genehmigt, ["eingliederung"] = Datum(Zelle(r, 6)),
                });
            }
        }
        return rows;
    });
}
