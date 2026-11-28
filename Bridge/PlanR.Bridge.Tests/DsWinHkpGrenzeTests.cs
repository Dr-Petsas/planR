using PlanR.Bridge.Dampsoft;
using Xunit;

namespace PlanR.Bridge.Tests;

public class DsWinHkpGrenzeTests
{
    [Fact]
    public void Leerer_plan_bleibt_abgewiesen()
    {
        var ex = Assert.Throws<EditError>(() => DsWinFormate.ParseHkpJson(Plan(0), "cp850"));
        Assert.Equal("HKP-JSON enthält keine unterstützten Planpositionen.", ex.Message);
    }

    [Fact]
    public void Plan_ueber_100_zeilen_wird_nicht_als_leer_abgewiesen()
    {
        var ex = Assert.Throws<EditError>(() => DsWinFormate.ParseHkpJson(Plan(140), "cp850"));
        Assert.Equal("Betrag Position 1 ist ungültig.", ex.Message);
    }

    [Fact]
    public void Mehr_als_500_zeilen_nennt_die_grenze()
    {
        var ex = Assert.Throws<EditError>(() => DsWinFormate.ParseHkpJson(Plan(501), "cp850"));
        Assert.Contains("501 Planpositionen", ex.Message);
        Assert.Contains("höchstens 500", ex.Message);
    }

    [Fact]
    public void Implantat_mit_leerstelle_wird_zu_j2()
    {
        var codes = DsWinBefund.FindingCodes();
        Assert.Contains("j", codes);
        Assert.Contains("j1", codes);
        Assert.Contains("j2", codes);
        Assert.Equal("j2", DsWinBefund.ImplantatNachDsWin("i 2"));
        Assert.Equal("j2", DsWinBefund.ImplantatNachDsWin("I 2"));
        Assert.Equal("j1", DsWinBefund.ImplantatNachDsWin("j 1"));
        Assert.Equal("j", DsWinBefund.ImplantatNachDsWin("j"));
        Assert.Equal("kw", DsWinBefund.ImplantatNachDsWin("kw"));
        Assert.Equal("i", DsWinBefund.ImplantatNachDsWin("i"));
    }

    static string Plan(int zeilen)
    {
        var positionen = string.Join(",", Enumerable.Range(0, zeilen).Select(_ =>
            "{\"ebene\":\"BEB\",\"nr\":\"2951\",\"anzahl\":1,\"bezeichnung\":\"Labor\",\"betrag\":0}"));
        return "{\"verwaltung\":{\"ausstellungsdatum\":\"2026-11-23\"},"
            + "\"zuschuss\":{\"bonus\":\"60\",\"haertefall\":false},"
            + "\"ergebnis\":{\"versorgungsart\":\"gleichartig\",\"summen\":{"
            + "\"bemaHonorar\":0,\"gozHonorar\":0,\"materialUndLabor\":0,"
            + "\"gesamt\":100,\"festzuschuss\":60,\"festzuschuss100\":100,\"eigenanteil\":40},"
            + "\"positionen\":[]},\"positionen\":[" + positionen + "]}";
    }
}
