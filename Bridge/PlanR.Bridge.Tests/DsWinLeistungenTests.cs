using System.Text;
using PlanR.Bridge.Dampsoft;
using Xunit;

namespace PlanR.Bridge.Tests;

/// <summary>
/// Abgerechnete Leistungen aus der DS-Win-Karteikarte: nur Leistungszeilen (LK/LG) des Patienten,
/// und nur mit einer Gebührennummer, die genau so im Leistungsverzeichnis steht. Erfundene Daten.
/// </summary>
public sealed class DsWinLeistungenTests : IDisposable
{
    const string Enc = "cp1252";
    readonly string _daten;

    public DsWinLeistungenTests()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        _daten = Path.Combine(Path.GetTempPath(), "planr-leistungen-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_daten);
        DbfTabelle.CacheLeeren();
        DsWinLeistungen.CacheLeeren();
        Schreiben("BUGO.DBF", [("GEBNR", 'C', 6), ("BEZ", 'C', 90)],
            [["01", "Untersuchung"], ["40", "Infiltrationsanästhesie"], ["13c", "Füllung mehrflächig"], ["Ä925a", "Röntgen"]]);
        Schreiben("GOZ08.DBF", [("GEBNR", 'C', 6), ("BEZ", 'C', 63)],
            [["1040", "Professionelle Zahnreinigung"], ["9010", "Implantatinsertion"], ["40", "GOZ-Vierzig"]]);
    }

    public void Dispose()
    {
        DbfTabelle.CacheLeeren();
        DsWinLeistungen.CacheLeeren();
        try { Directory.Delete(_daten, true); } catch { /* Temp räumt Windows */ }
    }

    static readonly (string, char, int)[] Kartei =
        [("PATNR", 'C', 5), ("DATUM", 'D', 8), ("ITYPE", 'C', 2), ("INFO", 'C', 99), ("PRAXIS", 'N', 1), ("DEL", 'C', 1)];

    /// <summary>INFO spaltenfest wie in DS-Win: Zahn, Nummer, Fläche, Kennbuchstabe, Anzahl.</summary>
    static string Info(string zahn, string nr, int anzahl = 1, string flaeche = "") =>
        zahn.PadRight(2) + nr.PadRight(6) + flaeche.PadRight(10) + " " + anzahl.ToString().PadLeft(5) + "KON 1";

    static string[] Zeile(string pat, string datum, string art, string info, string praxis = "1", string del = "") =>
        [pat.PadLeft(5), datum, art, info, praxis, del];

    void Schreiben(string name, (string Name, char Art, int Laenge)[] felder, string[][] zeilen, bool anhaengen = false)
    {
        var enc = Encoding.GetEncoding(1252);
        var breite = 1 + felder.Sum(f => f.Laenge);
        var kopf = 32 + 32 * felder.Length + 1;
        var pfad = Path.Combine(_daten, name);
        var alt = anhaengen ? File.ReadAllBytes(pfad) : [];
        var bisher = anhaengen ? BitConverter.ToInt32(alt, 4) : 0;
        using var ms = new MemoryStream();
        var h = new byte[32];
        h[0] = 0x03;
        BitConverter.GetBytes(bisher + zeilen.Length).CopyTo(h, 4);
        BitConverter.GetBytes((ushort)kopf).CopyTo(h, 8);
        BitConverter.GetBytes((ushort)breite).CopyTo(h, 10);
        ms.Write(h);
        foreach (var (n, art, laenge) in felder)
        {
            var d = new byte[32];
            Encoding.ASCII.GetBytes(n).CopyTo(d, 0);
            d[11] = (byte)art;
            d[16] = (byte)laenge;
            ms.Write(d);
        }
        ms.WriteByte(13);
        if (anhaengen) ms.Write(alt, kopf, bisher * breite);
        foreach (var z in zeilen)
        {
            ms.WriteByte(0x20);
            for (var i = 0; i < felder.Length; i++)
                ms.Write(enc.GetBytes((i < z.Length ? z[i] : "").PadRight(felder[i].Laenge)[..felder[i].Laenge]));
        }
        File.WriteAllBytes(pfad, ms.ToArray());
    }

    List<Dictionary<string, object?>> Lesen(string pat = "12", int praxis = 1) =>
        (List<Dictionary<string, object?>>)DsWinLeistungen.Lesen(_daten, pat, praxis, Enc)["entries"]!;

    [Fact]
    public void Kasse_und_GOZ_mit_Text_aus_dem_Verzeichnis_neueste_zuerst()
    {
        Schreiben("PATINFO.DBF", Kartei,
        [
            Zeile("12", "20260310", "LK", Info("", "01")),
            Zeile("12", "20260914", "LG", Info("", "1040")),
            Zeile("12", "20260914", "LK", Info("46", "13C", 2, "mob")),
            Zeile("12", "20260310", "LK", Info("46", "Ä925A")),
        ]);
        var e = Lesen();
        Assert.Equal(4, e.Count);
        Assert.Equal("2026-09-14", e[0]["date"]);
        Assert.Equal("2026-09-14", e[1]["date"]);
        var pzr = e.Single(x => (string)x["nr"]! == "1040");
        Assert.Equal("goz", pzr["kind"]);
        Assert.Equal("Professionelle Zahnreinigung", pzr["text"]);
        Assert.Equal("", pzr["zahn"]);
        var fuellung = e.Single(x => (string)x["nr"]! == "13c");
        Assert.Equal("bema", fuellung["kind"]);
        Assert.Equal("Füllung mehrflächig", fuellung["text"]);
        Assert.Equal("46", fuellung["zahn"]);
        Assert.Equal(2, fuellung["anzahl"]);
        Assert.Equal("Röntgen", e.Single(x => (string)x["nr"]! == "Ä925a")["text"]);
    }

    [Fact]
    public void Nummer_die_nicht_genau_im_Verzeichnis_steht_faellt_weg()
    {
        Schreiben("PATINFO.DBF", Kartei,
        [
            Zeile("12", "20260914", "LK", Info("33", "13B0")),
            Zeile("12", "20260914", "LG", Info("33", "2080MK")),
            Zeile("12", "20260914", "LK", Info("", "ZANR")),
            Zeile("12", "20260914", "LK", Info("", "1040")),
            Zeile("12", "20260914", "LG", Info("", "01")),
            Zeile("12", "20260914", "LK", Info("", "")),
        ]);
        Assert.Empty(Lesen());
    }

    [Fact]
    public void Gleiche_Nummer_nimmt_den_Text_ihres_eigenen_Verzeichnisses()
    {
        Schreiben("PATINFO.DBF", Kartei,
        [
            Zeile("12", "20260914", "LK", Info("", "40")),
            Zeile("12", "20260913", "LG", Info("", "40")),
        ]);
        var e = Lesen();
        Assert.Equal("Infiltrationsanästhesie", e[0]["text"]);
        Assert.Equal("GOZ-Vierzig", e[1]["text"]);
    }

    [Fact]
    public void Nur_Leistungszeilen_des_Patienten_in_seiner_Praxis_nicht_geloescht_mit_Datum_und_Anzahl()
    {
        Schreiben("PATINFO.DBF", Kartei,
        [
            Zeile("12", "20260914", "AT", "Freitext 01 in der Kartei"),
            Zeile("12", "20260914", "RB", Info("", "01")),
            Zeile("120", "20260914", "LK", Info("", "01")),
            Zeile("7", "20260914", "LK", Info("", "01")),
            Zeile("12", "20260914", "LK", Info("", "01"), praxis: "2"),
            Zeile("12", "20260914", "LK", Info("", "01"), del: "J"),
            Zeile("12", "", "LK", Info("", "01")),
            Zeile("12", "20260914", "LK", Info("", "01", 0)),
            Zeile("12", "20260915", "LK", Info("", "40")),
        ]);
        var e = Lesen();
        Assert.Single(e);
        Assert.Equal("40", e[0]["nr"]);
        Assert.Single(Lesen("12", 2));
        Assert.Single(Lesen("7"));
        Assert.Empty(Lesen("99"));
    }

    [Fact]
    public void Mit_Sternchen_geloeschter_Satz_faellt_weg()
    {
        Schreiben("PATINFO.DBF", Kartei, [Zeile("12", "20260914", "LK", Info("", "01"))]);
        var pfad = Path.Combine(_daten, "PATINFO.DBF");
        var b = File.ReadAllBytes(pfad);
        b[BitConverter.ToUInt16(b, 8)] = (byte)'*';
        File.WriteAllBytes(pfad, b);
        Assert.Empty(Lesen());
    }

    [Fact]
    public void Neue_Zeilen_am_Ende_kommen_beim_naechsten_Lesen_dazu()
    {
        Schreiben("PATINFO.DBF", Kartei, [Zeile("12", "20260310", "LK", Info("", "01"))]);
        Assert.Single(Lesen());
        Schreiben("PATINFO.DBF", Kartei, [Zeile("12", "20260914", "LG", Info("", "1040")), Zeile("7", "20260914", "LK", Info("", "40"))], anhaengen: true);
        var e = Lesen();
        Assert.Equal(2, e.Count);
        Assert.Equal("1040", e[0]["nr"]);
    }

    [Fact]
    public void Kleinere_Datei_wird_neu_gelesen()
    {
        Schreiben("PATINFO.DBF", Kartei,
            [Zeile("7", "20260310", "LK", Info("", "01")), Zeile("12", "20260310", "LK", Info("", "01")), Zeile("12", "20260311", "LK", Info("", "40"))]);
        Assert.Equal(2, Lesen().Count);
        Schreiben("PATINFO.DBF", Kartei, [Zeile("12", "20260914", "LG", Info("", "9010"))]);
        var e = Lesen();
        Assert.Single(e);
        Assert.Equal("9010", e[0]["nr"]);
    }

    [Fact]
    public void Hoechstens_die_neuesten_Zeilen()
    {
        var viele = Enumerable.Range(0, DsWinLeistungen.Hoechstens + 15)
            .Select(i => Zeile("12", new DateOnly(2025, 1, 1).AddDays(i).ToString("yyyyMMdd"), "LK", Info("", "01"))).ToArray();
        Schreiben("PATINFO.DBF", Kartei, viele);
        var e = Lesen();
        Assert.Equal(DsWinLeistungen.Hoechstens, e.Count);
        Assert.Equal(new DateOnly(2025, 1, 1).AddDays(DsWinLeistungen.Hoechstens + 14).ToString("yyyy-MM-dd"), e[0]["date"]);
    }

    [Fact]
    public void Ohne_Karteikarte_leere_Liste()
    {
        Assert.Empty(Lesen());
    }

    [Fact]
    public void Demo_Bestand_liefert_nur_Zeilen_aus_dem_Verzeichnis()
    {
        const string demo = @"F:\TDAMP\DS\daten";
        if (!File.Exists(Path.Combine(demo, "PATINFO.DBF"))) return;
        var e = (List<Dictionary<string, object?>>)DsWinLeistungen.Lesen(demo, "0", 1, DsWinPfad.GuessEncoding(Path.Combine(demo, "patient.dbf")))["entries"]!;
        var nummern = e.Select(x => ((string)x["nr"]!).ToUpperInvariant()).ToHashSet();
        Assert.Contains("01", nummern);
        Assert.Contains("40", nummern);
        Assert.Contains("13C", nummern);
        Assert.DoesNotContain("ZANR", nummern);
        Assert.All(e, x => Assert.False(string.IsNullOrWhiteSpace((string)x["text"]!)));
    }
}
