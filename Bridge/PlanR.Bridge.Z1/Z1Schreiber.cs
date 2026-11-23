using System.Data.OleDb;
using System.Globalization;

namespace PlanR.Bridge.Z1;

using Zeile = Dictionary<string, object?>;

/// <summary>In Z1 steht inzwischen ein anderer Befund als der gelesene: wird zu 409.</summary>
public sealed class Z1Konflikt() : Exception("Der Befund wurde in Z1 inzwischen geändert.");

/// <summary>Z1 hat nichts übernommen: wird zu 503 wie RuntimeError/OSError im Python-Connector.</summary>
public sealed class Z1SchreibFehler(string text) : Exception(text);

/// <summary>
/// Schreibt Plan, Karteieintrag und 01-Befund in die Z1-Datenbank.
/// Dieselben Anweisungen in derselben Reihenfolge wie Z1Schreiben.cs des Python-Connectors, je Auftrag eine Transaktion.
/// </summary>
public sealed class Z1Schreiber(string mdb)
{
    T Schreiben<T>(Func<OleDbConnection, OleDbTransaction, T> fn)
    {
        if (!File.Exists(mdb)) throw new Z1SchreibFehler($"Z1-Datenbank fehlt: {mdb}");
        var pass = Environment.GetEnvironmentVariable("Z1_DB_PASSWORD");
        if (string.IsNullOrEmpty(pass)) pass = "ora";
        try
        {
            using var conn = new OleDbConnection(
                "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" + mdb + ";Jet OLEDB:Database Password=" + pass + ";");
            conn.Open();
            using var tx = conn.BeginTransaction();
            // Ohne Commit rollt Dispose alles zurück: ein halber Plan bleibt nie stehen.
            return fn(conn, tx);
        }
        catch (Exception exc) when (exc is OleDbException or IOException or InvalidOperationException or UnauthorizedAccessException)
        {
            throw new Z1SchreibFehler(Z1Daten.OhneGeheimnis(exc.Message).Trim());
        }
    }

    /// <summary>Zahnstatus ersetzen; Z1Konflikt, wenn in Z1 inzwischen etwas anderes steht als <paramref name="alt"/>.</summary>
    public Zeile Befund(string patnr, string alt, string neu, string datum) => Schreiben((conn, tx) =>
    {
        var pat = Pad(patnr.Trim(), 10);
        var da = Erstes(conn, tx, "SELECT BEFUND FROM ABEFUND WHERE PATNR=? AND LFDABEFUND='  0'", pat);
        var gibt = Erstes(conn, tx, "SELECT PATNR FROM ABEFUND WHERE PATNR=? AND LFDABEFUND='  0'", pat).Length > 0;
        if (da.TrimEnd() != alt.TrimEnd()) throw new Z1Konflikt();
        if (gibt) Exec(conn, tx, "UPDATE ABEFUND SET BEFUND=? WHERE PATNR=? AND LFDABEFUND='  0'", neu, pat);
        else Exec(conn, tx, "INSERT INTO ABEFUND (PATNR, LFDABEFUND, BEFUND) VALUES (?,?,?)", pat, "  0", neu);
        Exec(conn, tx, "UPDATE PAT SET LAST01DATUM=? WHERE PATNR=?", datum, pat);
        tx.Commit();
        return new Zeile { ["patnr"] = pat.Trim(), ["befund"] = neu };
    });

    /// <summary>Nur die Karteikarte, ohne Heil- und Kostenplan.</summary>
    public Zeile Dokumentieren(string patnr, string text, string datum) =>
        Plan(new Zeile { ["patnr"] = patnr, ["datum"] = datum, ["text"] = text, ["positionen"] = new List<object?>() });

    /// <summary>plan wie für Z1Plan.PlanZeilen. Antwort: patnr, lfdplan, zeilen, dokumente.</summary>
    public Zeile Plan(Zeile plan)
    {
        var zeilen = Z1Plan.PlanZeilen(plan);
        if (!File.Exists(mdb)) throw new Z1SchreibFehler($"Z1-Datenbank fehlt: {mdb}");
        var patnr = Pj.StrOr(Pj.Get(plan, "patnr")).Trim();
        if (patnr.Length == 0) throw new Z1WertFehler("Patientennummer fehlt.");
        return Schreiben((conn, tx) =>
        {
            var pat = Pad(patnr, 10);
            var nurDokument = zeilen["nurDokument"] is true;
            var lfd = nurDokument ? 0 : Naechste(conn, tx, "SELECT LFDPLAN FROM ZPLAN WHERE PATNR=?", pat);
            var session = Naechste(conn, tx, "SELECT LFDSESSIONENTRY FROM BEH WHERE PATNR=?", pat);
            var leb = Erstes(conn, tx, "SELECT LEBID FROM ZPLAN WHERE PATNR=?", pat);
            if (leb.Length == 0) leb = Pad("1", 3);
            var datum = Text(zeilen, "datum");
            var n = 0;
            if (!nurDokument)
            {
                var plfd = Pad(lfd, 3);
                var befund = Planbefund(conn, tx, pat);
                Exec(conn, tx, "INSERT INTO ZPLAN (PATNR, LFDPLAN, LEBID, BEFUNDART, LFDBEFUND, PLANART, KASSENPLAN, MUSTER, PLANUNGSDATUM, PLANSTATUS, PLANUNGSPID, BEMERKUNG1, BEMERKUNG4, MACID1O, MACID1U) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    pat, plfd, leb, "z", befund > 0 ? Pad(befund, 3) : DBNull.Value, "3", Text(zeilen, "kassenplan"), Leer(Text(zeilen, "muster")),
                    datum, Text(zeilen, "status"), Pad("1", 3), Text(zeilen, "bemerkung"), Leer(Text(zeilen, "summen")),
                    Leer(Text(zeilen, "oben")), Leer(Text(zeilen, "unten")));
                Exec(conn, tx, "INSERT INTO LBLOCK (PATNR, LFDPLAN, LFDLBLOCK, LBLOCKART, LABOR, FIKTIV, LEBID, DATUM, BETRAEGE) VALUES (?,?,?,?,?,?,?,?,?)",
                    pat, plfd, Pad("1", 3), "1", "0", "0", leb, datum, Leer(Text(zeilen, "betraege")));
                foreach (var z in (List<Zeile>)zeilen["zeilen"]!)
                {
                    n++;
                    Exec(conn, tx, "INSERT INTO LBLOCKENTRY (PATNR, LFDPLAN, LFDLBLOCK, ART, LABOR, LFDLBLOCKENTRY, GOART, LSTNR, KYLSTNR, ANZAHL, EINZELBETRAG, FAKTOR, BEGRTB, USTKEY, LBEABRMERKMAL, ZAEHNE, DATUM, LEBID, BEMERKUNG) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        pat, plfd, Pad("1", 3), Leer(Text(z, "art")), Leer(Text(z, "labor")), Text(z, "lfd"), Text(z, "goart"),
                        Text(z, "nr"), Text(z, "schluessel"), Text(z, "anzahl"), Leer(Text(z, "einzel")), Leer(Text(z, "faktor")),
                        z.ContainsKey("begrtb") ? Leer(Text(z, "begrtb")) : "x", Leer(Text(z, "ust")), "j", Text(z, "zaehne"), datum, leb, Leer(Text(z, "text")));
                }
            }
            var d = 0;
            foreach (var text in (List<object?>)zeilen["dokumente"]!)
            {
                d++;
                if (nurDokument)
                    Exec(conn, tx, "INSERT INTO BEH (PATNR, LEBID, PID, DATUM, BEHSESSION, LFDSESSIONENTRY, ANZAHL, BEHTEXTART, BEHTEXT, PRIVAT) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        pat, leb, Pad("1", 3), datum, "1", Pad(session + d - 1, 4), Pad(100, 6), "k", Convert.ToString(text) ?? "", "0");
                else
                    Exec(conn, tx, "INSERT INTO BEH (PATNR, LEBID, PID, DATUM, BEHSESSION, LFDSESSIONENTRY, ANZAHL, BEHTEXTART, BEHTEXT, PRIVAT, LFDPLAN) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        pat, leb, Pad("1", 3), datum, "1", Pad(session + d - 1, 4), Pad(100, 6), "k", Convert.ToString(text) ?? "", "0", Pad(lfd, 3));
            }
            tx.Commit();
            return new Zeile { ["patnr"] = pat.Trim(), ["lfdplan"] = lfd, ["zeilen"] = n, ["dokumente"] = d };
        });
    }

    static string Text(Zeile d, string k) => d.TryGetValue(k, out var w) && w is not null ? Convert.ToString(w, CultureInfo.InvariantCulture) ?? "" : "";
    static object Leer(string s) => s.Length == 0 ? DBNull.Value : s;

    /// <summary>Jeder Z1-Plan verweist auf einen eigenen Befundstand: Kopie des aktuellen 01-Befunds unter der nächsten Nummer.</summary>
    static int Planbefund(OleDbConnection conn, OleDbTransaction tx, string pat)
    {
        var spalten = new List<string>();
        var werte = new List<object>();
        using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText = "SELECT * FROM ABEFUND WHERE PATNR=? AND LFDABEFUND='  0'";
            cmd.Parameters.AddWithValue("@p", pat);
            using var r = cmd.ExecuteReader();
            if (!r.Read()) return 0;
            for (var i = 0; i < r.FieldCount; i++)
            {
                var name = r.GetName(i);
                if (r.IsDBNull(i) || name is "RINFO" or "CINFO" or "LFDABEFUND") continue;
                spalten.Add(name);
                werte.Add(r.GetValue(i));
            }
        }
        var nr = Naechste(conn, tx, "SELECT LFDABEFUND FROM ABEFUND WHERE PATNR=?", pat);
        spalten.Add("LFDABEFUND");
        werte.Add(Pad(nr, 3));
        Exec(conn, tx, "INSERT INTO ABEFUND ([" + string.Join("],[", spalten) + "]) VALUES (" + string.Join(",", Enumerable.Repeat("?", spalten.Count)) + ")", [.. werte]);
        return nr;
    }

    static int Naechste(OleDbConnection conn, OleDbTransaction tx, string sql, string pat)
    {
        var max = 0;
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@p", pat);
        using var r = cmd.ExecuteReader();
        while (r.Read())
            if (int.TryParse((Convert.ToString(r.GetValue(0)) ?? "").Trim(), out var v) && v > max) max = v;
        return max + 1;
    }

    static string Erstes(OleDbConnection conn, OleDbTransaction tx, string sql, string pat)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@p", pat);
        using var r = cmd.ExecuteReader();
        return r.Read() && !r.IsDBNull(0) ? Convert.ToString(r.GetValue(0)) ?? "" : "";
    }

    static void Exec(OleDbConnection conn, OleDbTransaction tx, string sql, params object[] werte)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        foreach (var w in werte) cmd.Parameters.AddWithValue("@p", w ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    static string Pad(object wert, int breite)
    {
        var text = (Convert.ToString(wert, CultureInfo.InvariantCulture) ?? "").Trim();
        if (text.Length > breite) text = text[..breite];
        return text.PadLeft(breite);
    }
}
