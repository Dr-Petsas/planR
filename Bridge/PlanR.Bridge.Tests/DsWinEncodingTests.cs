using System.Text;
using PlanR.Bridge.Dampsoft;
using Xunit;

namespace PlanR.Bridge.Tests;

/// <summary>
/// Brauckmann 24.11.2026: GOÄ „ä3“ kam in DS-Win als Ž3 / „chinesische Zeichen mit 3“ an,
/// weil GuessEncoding ohne Namens-Umlaute auf cp850 fiel und Ä als Byte 0x8E schrieb.
/// </summary>
public class DsWinEncodingTests
{
    public DsWinEncodingTests() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    [Fact]
    public void GoaeGebNr_ist_klein_ae_plus_Ziffern()
    {
        Assert.Equal("ä3", DsWinSchreiben.GoaeGebNr("3"));
        Assert.Equal("ä34", DsWinSchreiben.GoaeGebNr("Ä34"));
        Assert.Equal("ä6", DsWinSchreiben.GoaeGebNr("ä6"));
        Assert.Equal("ä1", DsWinSchreiben.GoaeGebNr("A1"));
    }

    [Fact]
    public void Goae_in_cp1252_ist_ein_Byte_E4_nicht_UTF8()
    {
        var raw = DsWinPfad.EncodingByName("cp1252").GetBytes(DsWinSchreiben.GoaeGebNr("3"));
        Assert.Equal([0xE4, (byte)'3'], raw);
        Assert.NotEqual(Encoding.UTF8.GetBytes("ä3"), raw);
    }

    [Fact]
    public void Goae_in_cp850_waere_Byte_84_nicht_8E_von_gross_Ae()
    {
        var ae = DsWinPfad.EncodingByName("cp850").GetBytes("ä3");
        var Ae = DsWinPfad.EncodingByName("cp850").GetBytes("Ä3");
        Assert.Equal([0x84, (byte)'3'], ae);
        Assert.Equal([0x8E, (byte)'3'], Ae);
        // 0x8E in cp1252 = Ž – genau der Wirrzeichen-Befund
        Assert.Equal("Ž3", DsWinPfad.EncodingByName("cp1252", strict: false).GetString(Ae));
    }

    [Fact]
    public void GuessEncoding_TDAMP_mit_GOZ08_ist_cp1252()
    {
        var patient = @"F:\TDAMP\DS\daten\patient.dbf";
        var goz = @"F:\TDAMP\DS\daten\GOZ08.DBF";
        if (!File.Exists(patient) || !File.Exists(goz)) return;
        Assert.Equal("cp1252", DsWinPfad.GuessEncoding(patient));
    }
}
