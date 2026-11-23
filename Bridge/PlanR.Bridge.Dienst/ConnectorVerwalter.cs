using System.Text;
using System.Text.Json;
using PlanR.Bridge;
using PlanR.Bridge.Dampsoft;
using PlanR.Bridge.Dens;
using PlanR.Bridge.Z1;

namespace PlanR.Bridge.Dienst;

/// <summary>
/// Hält den aktiven In-Prozess-PVS-Connector (DS-Win, DENSoffice oder CGM Z1.PRO),
/// prüft Erreichbarkeit und erlaubt das Umschalten durch PlanR ohne lokalen Subprozess-Port.
/// </summary>
public sealed class ConnectorVerwalter : IConnector, IUmschaltbar, IDisposable
{
    readonly Konfig cfg;
    readonly Protokoll log;
    readonly object sperre = new();
    string aktivPvs;
    IConnector? connector;
    string fehler = "";
    string nurLesenGrund = "";

    public ConnectorVerwalter(Konfig cfg, Protokoll log, string pvs)
    {
        this.cfg = cfg;
        this.log = log;
        aktivPvs = pvs;
        StartenIntern(pvs);
    }

    public string Pvs
    {
        get { lock (sperre) return aktivPvs; }
    }

    public string NurLesenGrund
    {
        get { lock (sperre) return nurLesenGrund; }
    }

    public static string Erkennen(Konfig cfg)
    {
        if (cfg.Pvs != "auto") return cfg.Pvs;
        if (!string.IsNullOrEmpty(cfg.Dswin) && DsWinPfad.Valid(cfg.Dswin)) return "dampsoft";
        if (!string.IsNullOrEmpty(cfg.DensIni) && File.Exists(cfg.DensIni)) return "dens";
        if (!string.IsNullOrEmpty(cfg.Z1Mdb) && File.Exists(cfg.Z1Mdb)) return "cgm-z1pro";
        var (ds, _) = DsWinPfad.FindRoot();
        if (!string.IsNullOrEmpty(ds) && DsWinPfad.Valid(ds)) return "dampsoft";
        var ini = DensPfad.Ini();
        if (!string.IsNullOrEmpty(ini) && File.Exists(ini)) return "dens";
        var z1 = @"C:\CGM\Z1\data\z1.mdb";
        if (File.Exists(z1)) return "cgm-z1pro";
        return "dampsoft";
    }

    public string Zustand()
    {
        lock (sperre)
        {
            if (aktivPvs == "dampsoft")
            {
                var pfad = (connector as DsWinConnector)?.Root ?? cfg.Dswin;
                if (!string.IsNullOrEmpty(pfad))
                {
                    var f = Praxis.DswinFehler(pfad, AktuellesKonto());
                    if (f.Length > 0) return f;
                }
            }
            return fehler.Length > 0 ? fehler : (connector is not null ? "bereit" : $"Connector ({aktivPvs}) nicht gestartet.");
        }
    }

    /// <summary>Prüft alle 30 s, ob ein zuvor unerreichbares PVS jetzt wieder erreichbar ist.</summary>
    public void Nachsehen()
    {
        lock (sperre)
        {
            if (connector is not null && fehler.Length == 0)
            {
                if (aktivPvs == "dampsoft")
                {
                    var pfad = (connector as DsWinConnector)?.Root ?? cfg.Dswin;
                    if (!string.IsNullOrEmpty(pfad) && Praxis.DswinFehler(pfad, AktuellesKonto()).Length > 0)
                        log.Warn($"DS-Win aktuell nicht erreichbar: {pfad}");
                }
                return;
            }
            StartenIntern(aktivPvs);
        }
    }

    public void Stoppen()
    {
        lock (sperre)
        {
            if (connector is IDisposable d)
            {
                try { d.Dispose(); } catch { }
            }
            connector = null;
        }
    }

    public void Umstellen(string pvs)
    {
        lock (sperre)
        {
            aktivPvs = pvs;
            StartenIntern(pvs);
        }
    }

    public (int Status, Dictionary<string, object?> Daten) Rufen(
        string methode,
        string pfad,
        JsonElement? body,
        IReadOnlyDictionary<string, string> kopf,
        int ms)
    {
        IConnector? aktiv;
        string zustandFehler;
        lock (sperre)
        {
            aktiv = connector;
            zustandFehler = fehler;
        }
        if (aktiv is null)
            return Ausfuehren.Fehler(503, zustandFehler.Length > 0 ? zustandFehler : "Der PVS-Connector ist nicht bereit.");
        try
        {
            return aktiv.Rufen(methode, pfad, body, kopf, ms);
        }
        catch (Exception exc)
        {
            log.Fehler($"Connector-Fehler ({methode} {pfad}): {exc.Message}");
            return Ausfuehren.Fehler(500, exc.Message);
        }
    }

    void StartenIntern(string pvs)
    {
        if (connector is IDisposable d)
        {
            try { d.Dispose(); } catch { }
        }
        connector = null;
        fehler = "";
        nurLesenGrund = "";
        try
        {
            switch (pvs)
            {
                case "dampsoft":
                {
                    var root = string.IsNullOrWhiteSpace(cfg.Dswin) ? null : cfg.Dswin;
                    if (root is not null)
                    {
                        var f = Praxis.DswinFehler(root, AktuellesKonto());
                        if (f.Length > 0)
                        {
                            fehler = f;
                            log.Warn(f);
                            StatusSchreiben();
                            return;
                        }
                    }
                    var backup = Path.Combine(cfg.Ordner, "backups", "dswin");
                    var ds = new DsWinConnector(root, enableWrite: cfg.Schreiben, backupBase: backup);
                    connector = ds;
                    nurLesenGrund = ds.ReadOnlyGrund ?? "";
                    log.Info($"DS-Win bereit: {ds.Root} (Schreiben: {(ds.SchreibenAktiv ? "an" : "aus" + (nurLesenGrund.Length > 0 ? " – " + nurLesenGrund : ""))})");
                    break;
                }
                case "dens":
                {
                    var ini = string.IsNullOrWhiteSpace(cfg.DensIni) ? null : cfg.DensIni;
                    var dens = new DensConnector(konfigDensIni: ini);
                    connector = dens;
                    log.Info($"DENSoffice bereit: {dens.BankPfad}");
                    break;
                }
                case "cgm-z1pro":
                {
                    var pfad = string.IsNullOrWhiteSpace(cfg.Z1Mdb) ? Z1Daten.Pfad() : cfg.Z1Mdb;
                    if (!File.Exists(pfad))
                    {
                        fehler = $"Z1-Datenbank {pfad} nicht gefunden.";
                        log.Warn(fehler);
                        StatusSchreiben();
                        return;
                    }
                    var z1 = new Z1Connector(pfad, schreiben: cfg.Schreiben);
                    connector = z1;
                    log.Info($"CGM Z1.PRO bereit: {pfad}");
                    break;
                }
                default:
                    fehler = $"Unbekanntes Praxisprogramm: {pvs}";
                    log.Warn(fehler);
                    break;
            }
        }
        catch (Exception exc)
        {
            fehler = exc.Message;
            log.Warn($"Connector {pvs} startet nicht: {exc.Message}");
        }
        StatusSchreiben();
    }

    void StatusSchreiben()
    {
        try
        {
            var pfad = Path.Combine(cfg.Ordner, "status.json");
            var tmp = pfad + ".tmp";
            var inhalt = JsonSerializer.Serialize(new
            {
                pvs = aktivPvs,
                version = Umfrage.Version,
                nurLesen = nurLesenGrund,
                fehler,
                zeit = DateTime.UtcNow.ToString("O"),
            });
            File.WriteAllText(tmp, inhalt + "\n", new UTF8Encoding(false));
            File.Move(tmp, pfad, true);
        }
        catch { }
    }

    static string AktuellesKonto()
    {
        var dom = Environment.UserDomainName;
        var usr = Environment.UserName;
        return string.IsNullOrEmpty(dom) ? usr : $"{dom}\\{usr}";
    }

    public void Dispose() => Stoppen();
}
