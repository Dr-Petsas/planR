using System.Globalization;
using System.Text;
using PlanR.Bridge.Dens;
using Xunit;

namespace PlanR.Bridge.Tests;

/// <summary>
/// DENS zeigt in der Ansicht "Befunde für Zuschüsse / Festsetzung" je Befund "Betrag Euro" und darunter die
/// "Vorläufige Summe". Beides rechnet DENS aus den Festzuschusszeilen (100-%-Betrag) und dem Prozentfeld
/// PROTH_HKP_BONUS_PROZ im Plansatz. Ein in DENS angelegter Plan trägt dort denselben Wert wie in
/// PROTH_BONUS_PROZ; fehlt er, stehen in der Ansicht nur 0,00.
/// </summary>
public class DensHkpZuschussSummenTests
{
    static readonly (string Nr, string Zahn, int Anzahl, decimal Betrag100)[] Befunde =
    [
        ("2.1", "16-14", 1, 921.60m), ("2.1", "11-22", 1, 921.60m),
        ("1.1", "17", 1, 398.39m), ("1.1", "13", 1, 398.39m), ("1.3", "13", 1, 134.44m),
        ("1.1", "12", 1, 398.39m), ("1.3", "12", 1, 134.44m),
        ("2.7", "14,11,22,15,21", 5, 132.44m),
    ];

    [Theory]
    [InlineData(60)]
    [InlineData(70)]
    [InlineData(75)]
    public void Plansatz_traegt_den_Bonus_in_beiden_Prozentfeldern(int bonus)
    {
        var plan = Plansatz(bonus);
        Assert.Equal(674, plan.Length);
        Assert.Equal(bonus * 100, BitConverter.ToInt16(plan, DensHkp.PlanBonusProz));
        Assert.Equal(bonus * 100, BitConverter.ToInt16(plan, DensHkp.PlanHkpBonusProz));
    }

    [Fact]
    public void Prozentfelder_liegen_an_den_Stellen_des_DENS_Schemas()
    {
        Assert.Equal(88, DensHkp.PlanBonusProz);
        Assert.Equal(190, DensHkp.PlanHkpBonusProz);
    }

    [Theory]
    [InlineData(60, 238163)]
    [InlineData(70, 277862)]
    [InlineData(75, 297708)]
    public void Summe_wie_DENS_sie_rechnet_ergibt_den_Festzuschuss_des_Plans(int bonus, int erwartetCent)
    {
        var bundle = Buendel(bonus);
        var plan = Convert.FromBase64String((string)bundle["plan"]!);
        var prozent = BitConverter.ToInt16(plan, DensHkp.PlanHkpBonusProz);
        long summe = 0;
        var zeilen = 0;
        foreach (var roh in (List<string>)bundle["services"]!)
        {
            var z = Convert.FromBase64String(roh);
            if (BitConverter.ToInt16(z, 88) != 3) continue;
            zeilen++;
            var einzel = (long)Math.Round(BitConverter.ToInt32(z, 56) * (decimal)prozent / 10000m, MidpointRounding.AwayFromZero);
            summe += einzel * BitConverter.ToInt16(z, 46);
        }
        Assert.Equal(Befunde.Length, zeilen);
        Assert.Equal(erwartetCent, summe);
        Assert.Equal(erwartetCent, (long)Math.Round(Zuschuss(bonus) * 100m));
    }

    static byte[] Plansatz(int bonus) => Convert.FromBase64String((string)Buendel(bonus)["plan"]!);

    static Dictionary<string, object?> Buendel(int bonus) => DensHkp.EncodeHkpBundle(DensHkp.ParsePlanrHkp(Plan(bonus)));

    static decimal Einzel(decimal betrag100, int bonus) => Math.Round(betrag100 * bonus / 100m, 2, MidpointRounding.AwayFromZero);

    static decimal Zuschuss(int bonus) => Befunde.Sum(b => Einzel(b.Betrag100, bonus) * b.Anzahl);

    static string Z(decimal wert) => wert.ToString("0.00", CultureInfo.InvariantCulture);

    /// <summary>Erfundener Kassen-HKP mit den Befunden 1.1, 1.3, 2.1 und 2.7 (bei 60 % Zuschuss 2381,63 EUR).</summary>
    static string Plan(int bonus)
    {
        const decimal punktwert = 1.1844m;
        (string Id, string Nr, string Zahn, int Anzahl, int Punkte)[] bema =
        [
            ("b1", "19", "17-22", 9, 19), ("b2", "7b", "", 1, 19), ("b3", "89", "", 1, 16), ("b4", "20a", "17", 1, 148),
            ("b5", "20b", "13,12", 2, 158), ("b6", "91a", "16", 1, 118), ("b7", "91b", "14,11,22", 3, 126), ("b8", "92", "15,21", 2, 62),
        ];
        var positionen = new StringBuilder();
        var ergebnis = new StringBuilder();
        decimal honorar = 0;
        foreach (var p in bema)
        {
            var betrag = Math.Round(p.Punkte * p.Anzahl * punktwert, 2, MidpointRounding.AwayFromZero);
            honorar += betrag;
            positionen.Append($"{{\"id\":\"{p.Id}\",\"ebene\":\"BEMA\",\"nr\":\"{p.Nr}\",\"zahn\":\"{p.Zahn}\",\"anzahl\":{p.Anzahl}}},");
            ergebnis.Append($"{{\"id\":\"{p.Id}\",\"punkte\":{p.Punkte},\"punktwert\":1.1844,\"betrag\":{Z(betrag)}}},");
        }
        const decimal labor = 2433.18m;
        var gesamt = honorar + labor;
        var zuschuss = Zuschuss(bonus);
        var befunde = string.Join(",", Befunde.Select(b =>
            $"{{\"nr\":\"{b.Nr}\",\"zahnGebiet\":\"{b.Zahn}\",\"anzahl\":{b.Anzahl},\"einzelbetrag\":{Z(Einzel(b.Betrag100, bonus))},"
            + $"\"betrag\":{Z(Einzel(b.Betrag100, bonus) * b.Anzahl)},\"betrag100\":{Z(b.Betrag100 * b.Anzahl)}}}"));
        return "{\"verwaltung\":{\"ausstellungsdatum\":\"2026-11-27\"},"
            + $"\"zuschuss\":{{\"bonus\":\"{bonus}\",\"haertefall\":false}},"
            + "\"zaehne\":{\"18\":{\"B\":\"f\",\"R\":\"\",\"TP\":\"\"},\"17\":{\"B\":\"ww\",\"R\":\"K\",\"TP\":\"K\"},"
            + "\"16\":{\"B\":\"ww\",\"R\":\"K\",\"TP\":\"K\"},\"15\":{\"B\":\"f\",\"R\":\"BV\",\"TP\":\"BV\"},"
            + "\"14\":{\"B\":\"ww\",\"R\":\"KV\",\"TP\":\"KV\"},\"13\":{\"B\":\"ww\",\"R\":\"KV\",\"TP\":\"KV\"},"
            + "\"12\":{\"B\":\"ww\",\"R\":\"KV\",\"TP\":\"KV\"},\"11\":{\"B\":\"ww\",\"R\":\"KV\",\"TP\":\"KV\"},"
            + "\"21\":{\"B\":\"f\",\"R\":\"BV\",\"TP\":\"BV\"},\"22\":{\"B\":\"ww\",\"R\":\"KV\",\"TP\":\"KV\"}},"
            + "\"positionen\":[" + positionen.ToString().TrimEnd(',') + "],"
            + "\"ergebnis\":{\"versorgungsart\":\"regel\",\"summen\":{"
            + $"\"bemaHonorar\":{Z(honorar)},\"gozHonorar\":0,\"materialUndLabor\":{Z(labor)},\"gesamt\":{Z(gesamt)},"
            + $"\"festzuschuss\":{Z(zuschuss)},\"festzuschuss100\":{Z(Befunde.Sum(b => b.Betrag100 * b.Anzahl))},\"eigenanteil\":{Z(gesamt - zuschuss)}}},"
            + "\"positionen\":[" + ergebnis.ToString().TrimEnd(',') + "],\"befunde\":[" + befunde + "]}}";
    }
}
