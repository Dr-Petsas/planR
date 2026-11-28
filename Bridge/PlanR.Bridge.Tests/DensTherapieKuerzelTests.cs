using PlanR.Bridge.Dens;
using Xunit;

namespace PlanR.Bridge.Tests;

public class DensTherapieKuerzelTests
{
    [Fact]
    public void Amtliche_Kuerzel_bleiben()
    {
        Assert.Equal("km", DensKuerzel.TpSymbol("KM", "gleichartig"));
        Assert.Equal("SKM", DensKuerzel.TpSymbol("SKM", "andersartig"));
        Assert.Equal("SBM", DensKuerzel.TpSymbol("SBM", "andersartig"));
        Assert.Equal("bm", DensKuerzel.TpSymbol("BM", "gleichartig"));
        Assert.Equal("TM", DensKuerzel.TpSymbol("TM", "andersartig"));
        Assert.Equal("STM", DensKuerzel.TpSymbol("STM", "andersartig"));
    }

    [Fact]
    public void Interne_Kuerzel_werden_amtlich()
    {
        Assert.Equal("KM", DensKuerzel.TpSymbol("ZA", "andersartig"));
        Assert.Equal("km-", DensKuerzel.TpSymbol("ZA", "gleichartig", anker: true));
        Assert.Equal("SKM", DensKuerzel.TpSymbol("ZAS", "andersartig"));
        Assert.Equal("BM", DensKuerzel.TpSymbol("ZAB", "andersartig"));
        Assert.Equal("TM", DensKuerzel.TpSymbol("TZ", "andersartig"));
        Assert.Equal("TM", DensKuerzel.TpSymbol("TZV", "andersartig"));
        Assert.Equal("STM", DensKuerzel.TpSymbol("STZ", "andersartig"));
        Assert.Equal("STM", DensKuerzel.TpSymbol("STZV", "andersartig"));
    }

    [Fact]
    public void ZAB_am_Implantat_wird_SBM_zwischen_eigenen_Zaehnen_BM()
    {
        var implantat = new Dictionary<int, string> { [26] = "ZAS", [27] = "ZAB", [28] = "ZAS" };
        Assert.True(DensKuerzel.ImplantatGlied(27, "f", implantat));
        Assert.Equal("sbm", DensKuerzel.PlanungNachAmtlich("ZAB", true));
        var zahn = new Dictionary<int, string> { [14] = "ZA", [15] = "ZAB", [16] = "ZA" };
        Assert.False(DensKuerzel.ImplantatGlied(15, "f", zahn));
        Assert.Equal("bm", DensKuerzel.PlanungNachAmtlich("ZAB", false));
    }

    [Fact]
    public void Gelesene_DENS_Therapie_wird_amtlich()
    {
        Assert.Equal("km", DensKuerzel.AmtlichTp("ZA"));
        Assert.Equal("skm", DensKuerzel.AmtlichTp("ZAS"));
        Assert.Equal("tm", DensKuerzel.AmtlichTp("TZ"));
        Assert.Equal("stm", DensKuerzel.AmtlichTp(DensKuerzel.PlanungNachAmtlich("STZ", false)));
        Assert.Equal("sbm", DensKuerzel.AmtlichTp(DensKuerzel.PlanungNachAmtlich("ZAB", true)));
    }
}
