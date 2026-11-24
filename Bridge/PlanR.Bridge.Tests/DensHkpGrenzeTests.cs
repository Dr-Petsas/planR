using PlanR.Bridge.Dens;
using Xunit;

namespace PlanR.Bridge.Tests;

public class DensHkpGrenzeTests
{
    [Fact]
    public void Leerer_plan_bleibt_abgewiesen()
    {
        var ex = Assert.Throws<HkpImportError>(() => DensHkp.ParsePlanrHkp(Plan(0)));
        Assert.Equal("HKP-JSON enthält keine unterstützten Planpositionen.", ex.Message);
    }

    [Fact]
    public void Digitaler_eigenlabor_plan_ueber_100_zeilen_wird_nicht_als_leer_abgewiesen()
    {
        var ex = Assert.Throws<HkpImportError>(() => DensHkp.ParsePlanrHkp(Plan(161)));
        Assert.Equal("Mindestens eine BEMA- oder GOZ-Position ist erforderlich.", ex.Message);
    }

    [Fact]
    public void Mehr_als_500_zeilen_nennt_die_grenze()
    {
        var ex = Assert.Throws<HkpImportError>(() => DensHkp.ParsePlanrHkp(Plan(501)));
        Assert.Contains("501 Planpositionen", ex.Message);
        Assert.Contains("höchstens 500", ex.Message);
    }

    static string Plan(int zeilen)
    {
        var positionen = string.Join(",", Enumerable.Range(0, zeilen).Select(i =>
            "{\"ebene\":\"BEB\",\"nr\":\"2951\",\"anzahl\":1,\"bezeichnung\":\"Labor\",\"betrag\":0}"));
        return "{\"verwaltung\":{\"ausstellungsdatum\":\"2026-11-23\"},"
            + "\"zuschuss\":{\"bonus\":\"60\",\"haertefall\":false},"
            + "\"ergebnis\":{\"versorgungsart\":\"gleichartig\",\"summen\":{"
            + "\"bemaHonorar\":0,\"gozHonorar\":0,\"materialUndLabor\":0,"
            + "\"gesamt\":100,\"festzuschuss\":60,\"festzuschuss100\":100,\"eigenanteil\":40},"
            + "\"positionen\":[]},\"positionen\":[" + positionen + "]}";
    }
}
