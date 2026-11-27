using System.Globalization;
using System.Text;

namespace PlanR.Bridge.Dampsoft;

/// <summary>
/// Abgerechnete Leistungen eines Patienten aus der Karteikarte (PATINFO.DBF), nur lesend.
/// Leistungszeilen sind ITYPE "LK" (BEMA) und "LG" (GOZ). INFO ist spaltenfest:
/// 0-1 Zahn, 2-7 Gebührennummer, 19-23 Anzahl (rechtsbündig).
/// Ausgegeben wird eine Zeile nur, wenn ihre Gebührennummer genau so im Leistungsverzeichnis
/// der Praxis steht (BUGO.DBF bzw. GOZ08.DBF, Groß-/Kleinschreibung egal). Alles andere fällt weg –
/// lieber eine Leistung zu wenig als eine geratene.
/// </summary>
public static class DsWinLeistungen
{
    public const int Hoechstens = 60;
    const int NrAb = 2, NrLaenge = 6, AnzahlAb = 19, AnzahlLaenge = 5;

    sealed class Index
    {
        public long Kopf, Breite, Zeilen;
        public Dictionary<string, DbfField> Felder = new(StringComparer.Ordinal);
        public Dictionary<string, List<int>> NachPatient = new(StringComparer.Ordinal);
    }

    static readonly object Sperre = new();
    static readonly Dictionary<string, Index> Indizes = new(StringComparer.OrdinalIgnoreCase);

    public static void CacheLeeren()
    {
        lock (Sperre) Indizes.Clear();
    }

    public static Dictionary<string, object?> Lesen(string daten, string patNr, int praxis, string encoding)
    {
        var pfad = Path.Combine(daten, "PATINFO.DBF");
        var eintraege = new List<Dictionary<string, object?>>();
        if (File.Exists(pfad))
        {
            var bema = Katalog(Path.Combine(daten, "BUGO.DBF"), encoding);
            var goz = Katalog(Path.Combine(daten, "GOZ08.DBF"), encoding);
            var enc = DsWinPfad.EncodingByName(encoding, strict: false);
            lock (Sperre)
            {
                using var fs = new FileStream(pfad, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                var ix = IndexFuer(pfad, fs);
                if (ix.NachPatient.TryGetValue(patNr.Trim(), out var nummern))
                {
                    var zeile = new byte[ix.Breite];
                    foreach (var n in nummern)
                    {
                        fs.Position = ix.Kopf + n * ix.Breite;
                        if (!Voll(fs, zeile)) continue;
                        var e = Eintrag(zeile, ix.Felder, patNr.Trim(), praxis, encoding, enc, bema, goz);
                        if (e is not null) eintraege.Add(e);
                    }
                }
            }
        }
        var neueste = eintraege
            .OrderByDescending(e => (string)e["date"]!, StringComparer.Ordinal)
            .Take(Hoechstens)
            .ToList();
        return new Dictionary<string, object?>(StringComparer.Ordinal) { ["entries"] = neueste };
    }

    static Dictionary<string, object?>? Eintrag(
        byte[] zeile, Dictionary<string, DbfField> f, string patNr, int praxis, string encoding, Encoding enc,
        Dictionary<string, (string Nr, string Text)> bema, Dictionary<string, (string Nr, string Text)> goz)
    {
        if (!DbfTabelle.Active(zeile, f, encoding)) return null;
        // Die Zeile kann sich seit dem Indexieren geändert haben: Patient und Art noch einmal am Satz prüfen.
        if (Roh(zeile, f, "PATNR", enc).Trim() != patNr) return null;
        var art = Roh(zeile, f, "ITYPE", enc).Trim();
        if (art != "LK" && art != "LG") return null;
        if (f.ContainsKey("PRAXIS"))
        {
            var p = DsWinPfad.PraxisNummer(Roh(zeile, f, "PRAXIS", enc).Trim());
            if (p != praxis) return null;
        }
        var datum = DbfTabelle.Value(zeile, f, "DATUM", encoding) as string;
        if (datum is null) return null;
        var info = Roh(zeile, f, "INFO", enc);
        if (info.Length < AnzahlAb + AnzahlLaenge) return null;
        var nr = info.Substring(NrAb, NrLaenge).Trim();
        if (nr.Length == 0) return null;
        if (!(art == "LK" ? bema : goz).TryGetValue(nr.ToUpperInvariant(), out var kat)) return null;
        if (!int.TryParse(info.Substring(AnzahlAb, AnzahlLaenge).Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var anzahl) || anzahl < 1)
            return null;
        var zahn = info[..NrAb];
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["date"] = datum,
            ["kind"] = art == "LK" ? "bema" : "goz",
            ["nr"] = kat.Nr,
            ["text"] = kat.Text,
            ["zahn"] = zahn.Length == 2 && char.IsAsciiDigit(zahn[0]) && char.IsAsciiDigit(zahn[1]) ? zahn : "",
            ["anzahl"] = anzahl,
        };
    }

    static string Roh(byte[] zeile, Dictionary<string, DbfField> f, string name, Encoding enc) =>
        f.TryGetValue(name, out var feld) ? enc.GetString(zeile, feld.Offset, feld.Length) : "";

    /// <summary>Gebührennummer (groß) → Nummer und Text, wie sie im Verzeichnis stehen. Nur Zeilen mit Text.</summary>
    static Dictionary<string, (string Nr, string Text)> Katalog(string pfad, string encoding)
    {
        var aus = new Dictionary<string, (string Nr, string Text)>(StringComparer.Ordinal);
        if (!File.Exists(pfad)) return aus;
        var (felder, zeilen, _) = DbfTabelle.TableGecacht(pfad);
        if (!felder.ContainsKey("GEBNR") || !felder.ContainsKey("BEZ")) return aus;
        foreach (var z in zeilen)
        {
            if (!DbfTabelle.Active(z, felder, encoding)) continue;
            var nr = (Convert.ToString(DbfTabelle.Value(z, felder, "GEBNR", encoding)) ?? "").Trim();
            var text = (Convert.ToString(DbfTabelle.Value(z, felder, "BEZ", encoding)) ?? "").Trim();
            if (nr.Length == 0 || text.Length == 0) continue;
            aus.TryAdd(nr.ToUpperInvariant(), (nr, text));
        }
        return aus;
    }

    /// <summary>
    /// Merkt je Patient die Satznummern seiner Leistungszeilen. Die Karteikarte wächst nur hinten:
    /// beim nächsten Aufruf werden nur die neuen Sätze gelesen, nie die ganze Datei im Speicher gehalten.
    /// </summary>
    static Index IndexFuer(string pfad, FileStream fs)
    {
        var kopf = new byte[32];
        fs.Position = 0;
        if (!Voll(fs, kopf)) throw new DbfError("Unvollständige Tabelle.");
        long zeilen = BitConverter.ToUInt32(kopf, 4), kopfLaenge = BitConverter.ToUInt16(kopf, 8), breite = BitConverter.ToUInt16(kopf, 10);
        if (kopfLaenge < 33 || breite < 2) throw new DbfError("Unvollständige Tabelle.");
        // Der Zähler im Kopf kann dem Schreiben vorauslaufen: nur lesen, was wirklich in der Datei steht.
        zeilen = Math.Min(zeilen, Math.Max(0, (fs.Length - kopfLaenge) / breite));
        if (!Indizes.TryGetValue(pfad, out var ix) || ix.Kopf != kopfLaenge || ix.Breite != breite || ix.Zeilen > zeilen)
        {
            ix = new Index { Kopf = kopfLaenge, Breite = breite, Felder = Felder(fs, kopfLaenge, breite) };
            Indizes[pfad] = ix;
        }
        if (ix.Zeilen == zeilen) return ix;
        if (!ix.Felder.TryGetValue("PATNR", out var fNr) || !ix.Felder.TryGetValue("ITYPE", out var fArt) || !ix.Felder.ContainsKey("INFO")
            || !ix.Felder.ContainsKey("DATUM"))
            throw new DbfError("Unbekannte Satzstruktur.");
        var proLauf = Math.Max(1, (int)(4_000_000 / breite));
        var puffer = new byte[proLauf * breite];
        fs.Position = kopfLaenge + ix.Zeilen * breite;
        while (ix.Zeilen < zeilen)
        {
            var jetzt = (int)Math.Min(proLauf, zeilen - ix.Zeilen);
            var bytes = (int)(jetzt * breite);
            var gelesen = 0;
            while (gelesen < bytes)
            {
                var r = fs.Read(puffer, gelesen, bytes - gelesen);
                if (r == 0) break;
                gelesen += r;
            }
            var ganze = (int)(gelesen / breite);
            for (var i = 0; i < ganze; i++)
            {
                var ab = (int)(i * breite);
                if (!Leistung(puffer, ab + fArt.Offset, fArt.Length)) continue;
                var nr = Encoding.ASCII.GetString(puffer, ab + fNr.Offset, fNr.Length).Trim(' ', '\0');
                if (nr.Length == 0) continue;
                if (!ix.NachPatient.TryGetValue(nr, out var liste)) ix.NachPatient[nr] = liste = [];
                liste.Add((int)(ix.Zeilen + i));
            }
            ix.Zeilen += ganze;
            if (ganze < jetzt) break;
        }
        return ix;
    }

    static bool Leistung(byte[] b, int ab, int laenge)
    {
        var i = ab;
        var ende = ab + laenge;
        while (i < ende && b[i] == (byte)' ') i++;
        if (i + 1 >= ende || b[i] != (byte)'L' || (b[i + 1] != (byte)'K' && b[i + 1] != (byte)'G')) return false;
        for (var j = i + 2; j < ende; j++)
            if (b[j] != (byte)' ' && b[j] != 0) return false;
        return true;
    }

    static Dictionary<string, DbfField> Felder(FileStream fs, long kopfLaenge, long breite)
    {
        var b = new byte[kopfLaenge];
        fs.Position = 0;
        if (!Voll(fs, b)) throw new DbfError("Unvollständige Tabelle.");
        foreach (var weit in new[] { false, true })
        {
            var felder = new Dictionary<string, DbfField>(StringComparer.Ordinal);
            var offset = 1;
            var ok = true;
            for (var i = 32; i + 32 <= b.Length && b[i] != 13; i += 32)
            {
                var nul = Array.IndexOf(b, (byte)0, i, 11);
                var name = Encoding.ASCII.GetString(b, i, nul < 0 ? 11 : nul - i);
                var art = (char)b[i + 11];
                int laenge = b[i + 16], dezimal = b[i + 17];
                if (weit && art == 'C') { laenge += 256 * dezimal; dezimal = 0; }
                if (laenge == 0 || !felder.TryAdd(name, new DbfField(art, offset, laenge, dezimal))) { ok = false; break; }
                offset += laenge;
            }
            if (ok && offset == breite) return felder;
        }
        throw new DbfError("Unbekannte Satzstruktur.");
    }

    static bool Voll(FileStream fs, byte[] ziel)
    {
        var gelesen = 0;
        while (gelesen < ziel.Length)
        {
            var r = fs.Read(ziel, gelesen, ziel.Length - gelesen);
            if (r == 0) return false;
            gelesen += r;
        }
        return true;
    }
}
