// PlanR-Bridge 2.0 für Windows in einer Datei: Setup, Windows-Dienst und Entfernen (gebaut von Bridge\paket-bauen.ps1).
//   PlanR-Bridge-Setup-<CODE>.exe   richtet die Bridge ein; der Code im Dateinamen holt Praxis und Schlüssel bei PlanR
//   PlanRBridge.exe /dienst         Windows-Dienst „PlanRBridge“: startet programm\PlanR.Bridge.Dienst.exe und spielt signierte Updates atomar ein
//   PlanRBridge.exe /entfernen      entfernt Dienst und Programm (Eintrag unter Windows „Apps“)
// Die eigenständige C#-Bridge steckt als payload.zip in der Datei (kein Python). Mit /define:PROBE gebaut: ohne Adminrechte
// und ohne Dienst (die Bridge läuft als Kindprozess), Zielordner im Temp-Verzeichnis – zum Testen von Fenster, Code und PVS-Suche.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("PlanR-Bridge")]
[assembly: AssemblyDescription("PlanR-Bridge: verbindet DS-Win, DENSoffice bzw. CGM Z1.PRO mit PlanR")]
[assembly: AssemblyCompany("Pickadoc GmbH")]
[assembly: AssemblyProduct("PlanR-Bridge")]
[assembly: AssemblyCopyright("Pickadoc GmbH")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

static class Bridge
{
    public const string Version = "2.0";
    public const string Dienst = "PlanRBridge";
    public const string Hilfe = "0211 3029 3035";
    public const string PlanRStandard = "https://planr.pickadoc.de";
    public const string Uninstall = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PlanRBridge";
#if PROBE
    public static readonly string Ziel = Path.Combine(Path.GetTempPath(), "PlanR-Bridge-Probe");
#else
    public static readonly string Ziel = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PlanR-Bridge");
#endif
    public static string Exe { get { return Path.Combine(Ziel, "PlanRBridge.exe"); } }
    public static string DienstExe { get { return Path.Combine(Ziel, "programm", "PlanR.Bridge.Dienst.exe"); } }
    public static string AgentJson { get { return Path.Combine(Ziel, "agent.json"); } }

    [STAThread]
    static int Main(string[] args)
    {
        var modus = args.Length > 0 ? args[0].ToLowerInvariant() : "";
        if (modus == "/dienst")
        {
            ServiceBase.Run(new Dienst());
            return 0;
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        if (modus == "/entfernen") return Entfernen.Starten();
        // /planr <Adresse>: andere PlanR-Instanz (Test, eigener Server)
        var planr = "";
        for (var i = 0; i + 1 < args.Length; i++)
            if (args[i].ToLowerInvariant() == "/planr") planr = args[i + 1].TrimEnd('/');
        bool allein;
        using (new Mutex(true, "PlanRBridgeSetup", out allein))
        {
            if (!allein)
            {
                MessageBox.Show("Das Setup der PlanR-Bridge läuft bereits.", "PlanR-Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 1;
            }
            Application.Run(new SetupFenster(CodeAusDateiname(), planr));
        }
        return 0;
    }

    /// PlanR liefert die Datei als PlanR-Bridge-Setup-K7M2P9QX.exe; Browser hängen bei Doppeln „ (1)“ an.
    static string CodeAusDateiname()
    {
        var name = Path.GetFileNameWithoutExtension(Application.ExecutablePath);
        var m = Regex.Match(name, @"Setup[-_ ]+([A-Za-z0-9]{8})(?![A-Za-z0-9])", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.ToUpperInvariant() : "";
    }
}

class SetupFehler : Exception
{
    public readonly string Details;
    public SetupFehler(string meldung, string details = "") : base(meldung) { Details = details ?? ""; }
}

static class Protokoll
{
    static readonly object Sperre = new object();

    public static string Datei
    {
        get { return Directory.Exists(Bridge.Ziel) ? Path.Combine(Bridge.Ziel, "setup.log") : Path.Combine(Path.GetTempPath(), "PlanR-Bridge-setup.log"); }
    }

    public static void Schreiben(string text)
    {
        lock (Sperre)
        {
            try { File.AppendAllText(Datei, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + text + Environment.NewLine, Encoding.UTF8); }
            catch (Exception) { }
        }
    }

    /// Letzte Zeilen einer Protokolldatei (für Fehlermeldungen an PlanR).
    public static string Ende(string datei, int zeilen)
    {
        try
        {
            if (!File.Exists(datei)) return "";
            using (var s = new FileStream(datei, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var r = new StreamReader(s, Encoding.UTF8))
            {
                var alle = r.ReadToEnd().Split('\n');
                var ab = Math.Max(0, alle.Length - zeilen - 1);
                return Path.GetFileName(datei) + ":\n" + string.Join("\n", alle, ab, alle.Length - ab).Trim();
            }
        }
        catch (Exception) { return ""; }
    }
}

static class Werkzeug
{
    /// Ein Argument für die Befehlszeile (Pfade ohne abschließenden Backslash, der sonst das Anführungszeichen schützt).
    public static string Q(string s)
    {
        return "\"" + s.TrimEnd('\\').Replace("\"", "\\\"") + "\"";
    }

    public static Encoding Oem
    {
        get { return Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.OEMCodePage); }
    }

    public static int Lauf(string datei, string argumente, int ms, string eingabe, Action<string> zeile, Encoding kodierung = null)
    {
        var info = new ProcessStartInfo(datei, argumente)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            StandardOutputEncoding = kodierung ?? Encoding.UTF8,
            StandardErrorEncoding = kodierung ?? Encoding.UTF8,
            WorkingDirectory = Directory.Exists(Bridge.Ziel) ? Bridge.Ziel : Environment.SystemDirectory,
        };
        using (var p = new Process())
        {
            p.StartInfo = info;
            p.OutputDataReceived += (s, e) => { if (e.Data != null && zeile != null) zeile(e.Data); };
            p.ErrorDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) Protokoll.Schreiben("  " + e.Data); };
            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            var daten = new UTF8Encoding(false).GetBytes(eingabe ?? "");
            try
            {
                p.StandardInput.BaseStream.Write(daten, 0, daten.Length);
                p.StandardInput.Close();
            }
            catch (IOException) { }
            if (!p.WaitForExit(ms))
            {
                try { p.Kill(); } catch (Exception) { }
                try { p.WaitForExit(5000); } catch (Exception) { }
                Protokoll.Schreiben(Path.GetFileName(datei) + ": nach " + ms / 1000 + " s abgebrochen");
                return -1;
            }
            try { p.WaitForExit(5000); } catch (Exception) { }
            return p.ExitCode;
        }
    }

    /// Prozess unter einem anderen Windows-Konto; Win32Exception 1326 = Kennwort falsch.
    public static int AlsKonto(string konto, string kennwort, string datei, string argumente)
    {
        var teile = konto.Split('\\');
        var sicher = new SecureString();
        foreach (var c in kennwort) sicher.AppendChar(c);
        var info = new ProcessStartInfo(datei, argumente)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            LoadUserProfile = false,
            UserName = teile[teile.Length - 1],
            Domain = teile.Length > 1 ? teile[0] : ".",
            Password = sicher,
            WorkingDirectory = Path.GetDirectoryName(datei),
        };
        using (var p = Process.Start(info))
        {
            if (!p.WaitForExit(60000))
            {
                try { p.Kill(); } catch (Exception) { }
                return -1;
            }
            return p.ExitCode;
        }
    }

    public static bool GleicherPfad(string a, string b)
    {
        return string.Equals(Path.GetFullPath(a).TrimEnd('\\'), Path.GetFullPath(b).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
    }

    public static void OrdnerLoeschen(string pfad, bool pflicht)
    {
        for (var i = 0; i < 5 && Directory.Exists(pfad); i++)
        {
            try { Directory.Delete(pfad, true); }
            catch (Exception e)
            {
                Protokoll.Schreiben("Löschen " + pfad + ": " + e.Message);
                Thread.Sleep(1000);
            }
        }
        if (pflicht && Directory.Exists(pfad))
            throw new SetupFehler("Der Ordner " + pfad + " lässt sich nicht ersetzen, eine Datei darin ist noch in Benutzung. Bitte den Rechner neu starten und das Setup noch einmal öffnen.");
    }
}

static class Json
{
    static readonly JavaScriptSerializer Serialisierer = new JavaScriptSerializer();

    public static Dictionary<string, object> Lesen(string text)
    {
        try { return Serialisierer.Deserialize<Dictionary<string, object>>(text) ?? new Dictionary<string, object>(); }
        catch (Exception) { return null; }
    }

    public static string Schreiben(object wert) { return Serialisierer.Serialize(wert); }

    public static string Text(Dictionary<string, object> d, string schluessel)
    {
        object v;
        return d != null && d.TryGetValue(schluessel, out v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) : "";
    }

    public static bool Wahr(Dictionary<string, object> d, string schluessel)
    {
        object v;
        return d != null && d.TryGetValue(schluessel, out v) && v is bool && (bool)v;
    }

    public static List<Dictionary<string, object>> Liste(Dictionary<string, object> d, string schluessel)
    {
        var liste = new List<Dictionary<string, object>>();
        object v;
        var werte = d != null && d.TryGetValue(schluessel, out v) && !(v is string) ? v as System.Collections.IEnumerable : null;
        if (werte != null)
            foreach (var w in werte)
                if (w is Dictionary<string, object>) liste.Add((Dictionary<string, object>)w);
        return liste;
    }
}

/// agent.json der Bridge; unbekannte Einträge bleiben erhalten.
class Konfig
{
    public Dictionary<string, object> Werte = new Dictionary<string, object>();

    public string this[string schluessel]
    {
        get { return Json.Text(Werte, schluessel); }
        set { Werte[schluessel] = value; }
    }

    public bool Vollstaendig
    {
        get { return Regex.IsMatch(this["mandant"], "^[a-z0-9-]{1,40}$") && this["schluessel"].Length >= 32; }
    }

    public static Konfig Lesen()
    {
        try
        {
            if (!File.Exists(Bridge.AgentJson)) return null;
            var d = Json.Lesen(File.ReadAllText(Bridge.AgentJson, Encoding.UTF8).TrimStart('\uFEFF'));
            return d == null ? null : new Konfig { Werte = d };
        }
        catch (Exception) { return null; }
    }

    public void Schreiben()
    {
        File.WriteAllText(Bridge.AgentJson, Json.Schreiben(Werte), new UTF8Encoding(false));
    }
}

/// PlanR.Bridge.Dienst.exe --einrichten <befehl>: JSON-Objekt auf stdin, je Ausgabezeile ein JSON-Objekt.
static class Helfer
{
    public static Dictionary<string, object> Rufen(string befehl, Dictionary<string, object> eingabe, int ms, Action<Dictionary<string, object>> zeile = null)
    {
        Dictionary<string, object> letztes = null;
        var rc = Werkzeug.Lauf(Bridge.DienstExe, "--einrichten " + befehl, ms, Json.Schreiben(eingabe ?? new Dictionary<string, object>()), z =>
        {
            var d = Json.Lesen(z);
            if (d == null)
            {
                Protokoll.Schreiben("  " + z);
                return;
            }
            letztes = d;
            if (zeile != null) zeile(d);
        });
        if (rc != 0) Protokoll.Schreiben("PlanR.Bridge.Dienst --einrichten " + befehl + " -> " + rc);
        return letztes;
    }
}

static class Dienste
{
    public static string LetzteAusgabe = "";

    public static bool Vorhanden(string name)
    {
        using (var sc = new ServiceController(name))
        {
            try
            {
                var s = sc.Status;
                return true;
            }
            catch (InvalidOperationException) { return false; }
        }
    }

    public static int Sc(string argumente)
    {
        var aus = new StringBuilder();
        var rc = Werkzeug.Lauf(Path.Combine(Environment.SystemDirectory, "sc.exe"), argumente, 60000, "", z => aus.AppendLine(z), Werkzeug.Oem);
        LetzteAusgabe = aus.ToString().Trim();
        Protokoll.Schreiben("sc " + argumente + " -> " + rc + (rc != 0 ? " " + LetzteAusgabe : ""));
        return rc;
    }

    public static void Anhalten(string name)
    {
        using (var sc = new ServiceController(name))
        {
            try
            {
                if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending) sc.Stop();
                sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
            }
            catch (Exception e) { Protokoll.Schreiben("Anhalten " + name + ": " + e.Message); }
        }
    }

    /// Dienst anhalten und löschen; wartet, bis Windows ihn wirklich entfernt hat (sonst scheitert das Neuanlegen).
    public static void Entfernen(string name)
    {
        if (!Vorhanden(name)) return;
        Anhalten(name);
        Prozesse.BeendenUnter(Bridge.Ziel);
        Sc("delete " + name);
        for (var i = 0; i < 30 && Vorhanden(name); i++) Thread.Sleep(1000);
        if (Vorhanden(name))
            throw new SetupFehler("Der bisherige Dienst „" + name + "“ lässt sich nicht entfernen. Bitte das Fenster „Dienste“ schließen (falls offen) oder den Rechner neu starten und das Setup noch einmal öffnen.", LetzteAusgabe);
    }

    public static void Starten(string name, string konto)
    {
        using (var sc = new ServiceController(name))
        {
            try
            {
                sc.Start();
                sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
            }
            catch (InvalidOperationException e)
            {
                var w = e.InnerException as Win32Exception;
                if (w != null && w.NativeErrorCode == 1069)
                    throw new SetupFehler("Windows lässt den Dienst nicht mit dem Konto " + konto + " starten – stimmt das Windows-Kennwort?");
                throw new SetupFehler("Der Dienst „PlanR-Bridge“ startet nicht: " + (w != null ? w.Message : e.Message), Ereignisse());
            }
            catch (System.ServiceProcess.TimeoutException)
            {
                throw new SetupFehler("Der Dienst „PlanR-Bridge“ startet nicht (keine Rückmeldung nach 30 Sekunden).", Ereignisse());
            }
            Thread.Sleep(3000);
            sc.Refresh();
            if (sc.Status != ServiceControllerStatus.Running)
                throw new SetupFehler("Der Dienst „PlanR-Bridge“ hat sich gleich wieder beendet.", Ereignisse());
        }
    }

    /// Letzte Einträge des Dienstes in der Ereignisanzeige.
    public static string Ereignisse()
    {
        try
        {
            using (var log = new EventLog("Application"))
            {
                var aus = new List<string>();
                for (var i = log.Entries.Count - 1; i >= 0 && i >= log.Entries.Count - 300 && aus.Count < 5; i--)
                {
                    var e = log.Entries[i];
                    if (e.Source == Bridge.Dienst || e.Source == "Service Control Manager" && e.Message.Contains("PlanR"))
                        aus.Add(e.TimeGenerated.ToString("HH:mm:ss ") + e.Message);
                }
                return aus.Count > 0 ? "Ereignisanzeige:\n" + string.Join("\n", aus) : "";
            }
        }
        catch (Exception) { return ""; }
    }

    const uint KeineAenderung = 0xffffffff;

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr OpenSCManager(string rechner, string datenbank, uint zugriff);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr OpenService(IntPtr scm, string name, uint zugriff);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool ChangeServiceConfig(IntPtr dienst, uint typ, uint start, uint fehler, string programm, string gruppe,
        IntPtr tag, string abhaengig, string konto, string kennwort, string anzeige);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool CloseServiceHandle(IntPtr h);

    /// Konto des Dienstes setzen – über die API, damit das Kennwort nicht in einer Befehlszeile steht.
    public static void KontoSetzen(string name, string konto, string kennwort)
    {
        var scm = OpenSCManager(null, null, 0x1);
        if (scm == IntPtr.Zero) throw new SetupFehler("Die Dienstverwaltung von Windows ist nicht erreichbar (Fehler " + Marshal.GetLastWin32Error() + ").");
        try
        {
            var dienst = OpenService(scm, name, 0x2);
            if (dienst == IntPtr.Zero) throw new SetupFehler("Der Dienst „PlanR-Bridge“ ist nicht da (Fehler " + Marshal.GetLastWin32Error() + ").");
            try
            {
                if (!ChangeServiceConfig(dienst, KeineAenderung, KeineAenderung, KeineAenderung, null, null, IntPtr.Zero, null, konto, kennwort, null))
                    throw new SetupFehler("Das Windows-Konto " + konto + " ließ sich für den Dienst nicht setzen (Fehler " + Marshal.GetLastWin32Error() + ").");
            }
            finally { CloseServiceHandle(dienst); }
        }
        finally { CloseServiceHandle(scm); }
    }
}

static class Prozesse
{
    /// Beendet Prozesse aus dem Bridge-Ordner (Bridge-Dienst, alter Python-Agent/Connector), außer diesem Setup.
    public static void BeendenUnter(string ordner)
    {
        var beendet = new List<Process>();
        try
        {
            using (var suche = new ManagementObjectSearcher("SELECT ProcessId, ExecutablePath FROM Win32_Process"))
            using (var liste = suche.Get())
            {
                foreach (ManagementObject p in liste)
                {
                    using (p)
                    {
                        var pfad = p["ExecutablePath"] as string;
                        if (pfad == null || !pfad.StartsWith(ordner.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) continue;
                        var id = Convert.ToInt32(p["ProcessId"]);
                        if (id == Process.GetCurrentProcess().Id) continue;
                        try
                        {
                            var prozess = Process.GetProcessById(id);
                            prozess.Kill();
                            beendet.Add(prozess);
                            Protokoll.Schreiben("Beendet: " + pfad + " (" + id + ")");
                        }
                        catch (Exception e) { Protokoll.Schreiben("Beenden " + pfad + ": " + e.Message); }
                    }
                }
            }
        }
        catch (Exception e) { Protokoll.Schreiben("Prozessliste: " + e.Message); }
        foreach (var p in beendet)
        {
            try { p.WaitForExit(10000); } catch (Exception) { }
            p.Dispose();
        }
    }
}

static class Rechte
{
    /// Bridge-Ordner nur für SYSTEM und Administratoren (dort liegt der Schlüssel), optional plus Dienstkonto.
    public static void OrdnerSchuetzen(string sidKonto)
    {
        var acl = new DirectorySecurity();
        acl.SetAccessRuleProtection(true, false);
        var erben = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, erben, PropagationFlags.None, AccessControlType.Allow));
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), FileSystemRights.FullControl, erben, PropagationFlags.None, AccessControlType.Allow));
        if (sidKonto != null)
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sidKonto), FileSystemRights.Modify, erben, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(Bridge.Ziel).SetAccessControl(acl);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct LsaText
    {
        public ushort Laenge;
        public ushort Groesse;
        [MarshalAs(UnmanagedType.LPWStr)] public string Puffer;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct LsaAttribute
    {
        public int Laenge;
        public IntPtr Wurzel;
        public IntPtr Name;
        public uint Attribute;
        public IntPtr Sicherheit;
        public IntPtr Qualitaet;
    }

    [DllImport("advapi32.dll")]
    static extern uint LsaOpenPolicy(IntPtr rechner, ref LsaAttribute attribute, uint zugriff, out IntPtr richtlinie);

    [DllImport("advapi32.dll")]
    static extern uint LsaAddAccountRights(IntPtr richtlinie, byte[] sid, LsaText[] rechte, uint anzahl);

    [DllImport("advapi32.dll")]
    static extern uint LsaClose(IntPtr h);

    [DllImport("advapi32.dll")]
    static extern uint LsaNtStatusToWinError(uint status);

    /// „Als Dienst anmelden“ für das Dienstkonto (sc.exe vergibt das Recht nicht selbst).
    public static void DienstAnmeldungErlauben(string sidText)
    {
        var sid = new SecurityIdentifier(sidText);
        var bytes = new byte[sid.BinaryLength];
        sid.GetBinaryForm(bytes, 0);
        var attribute = new LsaAttribute { Laenge = Marshal.SizeOf(typeof(LsaAttribute)) };
        IntPtr richtlinie;
        var status = LsaOpenPolicy(IntPtr.Zero, ref attribute, 0x10 | 0x800, out richtlinie);
        if (status != 0) throw new SetupFehler("Windows erlaubt die Anmeldung als Dienst nicht (Fehler " + LsaNtStatusToWinError(status) + ").");
        try
        {
            const string Recht = "SeServiceLogonRight";
            var rechte = new[] { new LsaText { Puffer = Recht, Laenge = (ushort)(Recht.Length * 2), Groesse = (ushort)(Recht.Length * 2 + 2) } };
            status = LsaAddAccountRights(richtlinie, bytes, rechte, 1);
            if (status != 0) throw new SetupFehler("Windows erlaubt die Anmeldung als Dienst nicht (Fehler " + LsaNtStatusToWinError(status) + ").");
        }
        finally { LsaClose(richtlinie); }
    }
}

/// Netzlaufwerke und Freigaben: Ein Dienst sieht keine Laufwerksbuchstaben, nur lokale Pfade und UNC-Pfade.
static class Freigabe
{
    public static bool Gueltig(string ds)
    {
        try { return !string.IsNullOrEmpty(ds) && File.Exists(Path.Combine(ds, "daten", "patient.dbf")); }
        catch (Exception) { return false; }
    }

    public static string Host(string pfad)
    {
        var m = Regex.Match(pfad ?? "", @"^\\\\([^\\]+)\\");
        return m.Success ? m.Groups[1].Value : null;
    }

    public static bool IstLokal(string host)
    {
        var kurz = host.Split('.')[0];
        return host == "." || kurz.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase)
            || kurz.Equals("localhost", StringComparison.OrdinalIgnoreCase) || kurz == "127";
    }

    static string Wmi(string abfrage, string feld)
    {
        try
        {
            using (var suche = new ManagementObjectSearcher(abfrage))
            using (var liste = suche.Get())
                foreach (ManagementObject o in liste)
                    using (o) { var v = o[feld] as string; if (!string.IsNullOrEmpty(v)) return v; }
        }
        catch (Exception e) { Protokoll.Schreiben("WMI " + abfrage + ": " + e.Message); }
        return null;
    }

    /// Laufwerksbuchstabe → UNC-Pfad; eigene Freigabe dieses Rechners → lokaler Ordner dahinter (der Dienst läuft als SYSTEM).
    public static string Umsetzen(string p)
    {
        var m = Regex.Match(p, @"^([A-Za-z]):(\\.*)?$");
        if (m.Success)
        {
            var buchstabe = m.Groups[1].Value.ToUpperInvariant();
            var rest = m.Groups[2].Value;
            string ziel = null;
            using (var k = Registry.CurrentUser.OpenSubKey(@"Network\" + buchstabe))
                if (k != null) ziel = k.GetValue("RemotePath") as string;
            if (string.IsNullOrEmpty(ziel)) ziel = Wmi("SELECT ProviderName FROM Win32_LogicalDisk WHERE DeviceID='" + buchstabe + ":' AND DriveType=4", "ProviderName");
            if (!string.IsNullOrEmpty(ziel)) p = ziel.TrimEnd('\\') + rest;
        }
        var u = Regex.Match(p, @"^\\\\([^\\]+)\\([^\\]+)(\\.*)?$");
        if (u.Success && IstLokal(u.Groups[1].Value))
        {
            var lokal = Wmi("SELECT Path FROM Win32_Share WHERE Name='" + u.Groups[2].Value.Replace("'", "''") + "'", "Path");
            if (lokal != null && Gueltig(lokal.TrimEnd('\\') + u.Groups[3].Value)) return lokal.TrimEnd('\\') + u.Groups[3].Value;
        }
        return p;
    }

    /// DS-Win auf den Netzlaufwerken des angemeldeten Benutzers suchen (das Setup läuft erhöht und sieht sie sonst nicht).
    public static string AusNetzlaufwerken()
    {
        using (var netz = Registry.CurrentUser.OpenSubKey("Network"))
        {
            if (netz == null) return null;
            foreach (var name in netz.GetSubKeyNames())
            {
                string ziel;
                using (var k = netz.OpenSubKey(name)) ziel = k == null ? null : k.GetValue("RemotePath") as string;
                if (string.IsNullOrEmpty(ziel)) continue;
                ziel = ziel.TrimEnd('\\');
                var kandidaten = new List<string> { ziel + @"\TDAMP\DS", ziel + @"\DS", ziel };
                try { foreach (var d in Directory.GetDirectories(ziel)) kandidaten.Add(Path.Combine(d, "TDAMP", "DS")); }
                catch (Exception) { }
                foreach (var k in kandidaten)
                    if (Gueltig(k)) return k;
            }
        }
        return null;
    }
}

interface IAnzeige
{
    void Schritt(int nummer, string text);
    void Fortschritt(int promille);
    void Info(string text);
    void Untertitel(string text);
    string Fragen(string titel, string text, string vorschlag, bool kennwort, bool ordner, string dateiFilter = null);
}

/// Die eigentliche Einrichtung; läuft im Hintergrund, das Fenster zeigt nur an.
class Einrichtung
{
    public static readonly string[] Schritte =
    {
        "Programm einrichten",
        "Zugang Ihrer Praxis von PlanR holen",
        "Praxisprogramm suchen",
        "Windows-Dienst „PlanR-Bridge“ starten",
        "Verbindung zu PlanR prüfen",
    };

    readonly IAnzeige anzeige;
    readonly string code;
    readonly string planr;
    Konfig konfig;
    string konto, kennwort, sid;
    int schritt;
    public string PvsName = "Ihr Praxisprogramm";
    /// Grund, warum der Connector nicht nach DS-Win zurückschreibt ("" = er schreibt)
    public string NurLesen = "";
    /// PlanR hat den neuen Dienst in diesem Setup-Lauf als bereit gesehen
    public bool BeiPlanR;
    /// Dienst läuft, die Rückmeldung von PlanR kam in diesem Lauf noch nicht
    public string Offen = "";
    /// Mehrere DS-Win-Ordner gefunden: welcher genommen wurde und welche nicht
    public string DsWinHinweis = "";
    /// Für den Abschluss im Fenster und in PlanR
    public string Hinweis
    {
        get
        {
            var teile = new List<string>();
            if (NurLesen != "") teile.Add("Nur Lesen: " + NurLesen);
            if (DsWinHinweis != "") teile.Add(DsWinHinweis);
            if (Offen != "") teile.Add(Offen);
            return string.Join("\n", teile);
        }
    }
    public string PlanRAdresse { get { return konfig != null && konfig["planr"] != "" ? konfig["planr"] : Bridge.PlanRStandard; } }
#if PROBE
    public static Process ProbeAgent;
#endif

    public Einrichtung(IAnzeige anzeige, string code, string planr)
    {
        this.anzeige = anzeige;
        this.code = code;
        this.planr = planr;
    }

    public void Ausfuehren()
    {
        Protokoll.Schreiben("==== PlanR-Bridge-Setup " + Bridge.Version + " " + Application.ExecutablePath);
        Schritt(0, "Das Programm wird eingerichtet …");
        ProgrammEinrichten();
        Schritt(1, "Der Zugang Ihrer Praxis wird bei PlanR geholt …");
        ZugangHolen();
        Melden("Setup gestartet", false, "");
        Schritt(2, "Ihr Praxisprogramm wird gesucht …");
        PraxisprogrammSuchen();
        Schritt(3, "Der Windows-Dienst „PlanR-Bridge“ wird eingerichtet …");
        DienstEinrichten();
        Schritt(4, "Die Verbindung zu PlanR wird geprüft …");
        VerbindungPruefen();
        schritt = 5;
        Melden("Fertig", false, "", Hinweis);
        Protokoll.Schreiben("Fertig." + (Hinweis != "" ? "\n" + Hinweis : ""));
    }

    void Schritt(int nummer, string text)
    {
        schritt = nummer;
        Protokoll.Schreiben("Schritt " + (nummer + 1) + ": " + Schritte[nummer]);
        anzeige.Schritt(nummer, text);
        if (nummer >= 2) Melden(Schritte[nummer], false, "");
    }

    /// Fortschritt an PlanR (Anzeige im Browser); scheitert still, die Einrichtung geht dann trotzdem weiter.
    void Melden(string text, bool fehler, string details, string hinweis = "")
    {
        if (konfig == null || !konfig.Vollstaendig) return;
        Helfer.Rufen("melden", new Dictionary<string, object>
        {
            { "config", Bridge.AgentJson }, { "schritt", Math.Min(schritt + 1, Schritte.Length) }, { "gesamt", Schritte.Length },
            { "text", text }, { "fehler", fehler }, { "fertig", schritt >= Schritte.Length }, { "details", details }, { "hinweis", hinweis },
            { "version", Bridge.Version },
        }, 20000);
    }

    public void FehlerMelden(string text, string details)
    {
        try { Melden(text, true, (details ?? "") + "\n" + Protokoll.Ende(Protokoll.Datei, 15)); }
        catch (Exception) { }
    }

    void ProgrammEinrichten()
    {
#if !PROBE
        foreach (var alt in new[] { Bridge.Dienst, "PlanRAgent" }) Dienste.Entfernen(alt);
#endif
        Prozesse.BeendenUnter(Bridge.Ziel);
        Directory.CreateDirectory(Bridge.Ziel);
#if !PROBE
        Rechte.OrdnerSchuetzen(null);
        Werkzeug.OrdnerLoeschen(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PlanR-Agent"), false);
#endif
        Werkzeug.OrdnerLoeschen(Path.Combine(Bridge.Ziel, "programm"), true);
        // Altlasten einer früheren Python-Bridge (1.x) oder offener Updates aufräumen
        foreach (var rest in new[] { "python", "programm.alt", "update" })
            Werkzeug.OrdnerLoeschen(Path.Combine(Bridge.Ziel, rest), false);
        Auspacken();
        if (!Werkzeug.GleicherPfad(Application.ExecutablePath, Bridge.Exe)) File.Copy(Application.ExecutablePath, Bridge.Exe, true);
        try { File.Delete(Path.Combine(Bridge.Ziel, "PlanRBridgeDienst.exe")); } catch (Exception) { }
        if (!File.Exists(Bridge.DienstExe) || Werkzeug.Lauf(Bridge.DienstExe, "--version", 60000, "", null) != 0)
            throw new SetupFehler("Die PlanR-Bridge startet nicht. Ein Virenschutz blockiert womöglich den Ordner " + Bridge.Ziel + " – bitte dort eine Ausnahme einrichten und das Setup noch einmal öffnen.", Protokoll.Ende(Protokoll.Datei, 10));
    }

    void Auspacken()
    {
        using (var strom = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        {
            if (strom == null) throw new SetupFehler("Dem Setup fehlen die Programmdateien. Bitte die Bridge in PlanR neu herunterladen.");
            using (var zip = new ZipArchive(strom, ZipArchiveMode.Read))
            {
                var wurzel = Path.GetFullPath(Bridge.Ziel).TrimEnd('\\') + "\\";
                var gesamt = Math.Max(1, zip.Entries.Count);
                var n = 0;
                foreach (var eintrag in zip.Entries)
                {
                    n++;
                    var name = eintrag.FullName.Replace('/', '\\');
                    var ziel = Path.GetFullPath(Path.Combine(Bridge.Ziel, name));
                    if (!ziel.StartsWith(wurzel, StringComparison.OrdinalIgnoreCase)) continue;
                    if (name.EndsWith("\\"))
                    {
                        Directory.CreateDirectory(ziel);
                        continue;
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(ziel));
                    using (var von = eintrag.Open())
                    using (var nach = File.Create(ziel))
                        von.CopyTo(nach);
                    if (n % 20 == 0) anzeige.Fortschritt(n * 1000 / gesamt);
                }
                Protokoll.Schreiben("Ausgepackt: " + n + " Dateien");
            }
        }
    }

    void ZugangHolen()
    {
        var alt = Konfig.Lesen();
        var c = code;
        if (c == "" && (alt == null || !alt.Vollstaendig))
        {
            c = anzeige.Fragen("Einrichtungscode", "Bitte den Einrichtungscode aus PlanR eingeben (8 Zeichen).\n\nEinfacher: In PlanR unter Einrichtung die Bridge neu herunterladen und die Datei öffnen – dann steht der Code schon im Dateinamen.", "", false, false);
            if (string.IsNullOrEmpty(c))
                throw new SetupFehler("Ohne Einrichtungscode weiß das Setup nicht, zu welcher Praxis die Bridge gehört. Bitte die Bridge in PlanR herunterladen und die heruntergeladene Datei öffnen.");
            c = Regex.Replace(c.ToUpperInvariant(), "[^A-Z0-9]", "");
        }
        if (c == "")
        {
            konfig = alt;
            anzeige.Info("Bisherige Einrichtung wird übernommen.");
        }
        else
        {
            var adresse = planr != "" ? planr : alt != null && alt["planr"] != "" ? alt["planr"] : Bridge.PlanRStandard;
            var antwort = Helfer.Rufen("einloesen", new Dictionary<string, object> { { "planr", adresse }, { "code", c } }, 90000);
            if (antwort == null)
                throw new SetupFehler("Das Setup konnte PlanR nicht fragen. Ein Virenschutz blockiert womöglich den Ordner " + Bridge.Ziel + ".", Protokoll.Ende(Protokoll.Datei, 10));
            if (Json.Text(antwort, "fehler") != "") throw new SetupFehler(Json.Text(antwort, "fehler"));
            konfig = alt ?? new Konfig();
            foreach (var k in new[] { "planr", "mandant", "schluessel", "praxis" }) konfig[k] = Json.Text(antwort, k);
            var pvs = Json.Text(antwort, "pvs");
            konfig["pvs"] = pvs == "dampsoft" || pvs == "dens" || pvs == "cgm-z1pro" ? pvs : "auto";
            if (!konfig.Werte.ContainsKey("cfClientId")) konfig["cfClientId"] = "";
            if (!konfig.Werte.ContainsKey("cfClientSecret")) konfig["cfClientSecret"] = "";
            if (!konfig.Werte.ContainsKey("schreiben")) konfig.Werte["schreiben"] = true;
            if (!konfig.Werte.ContainsKey("dswin")) konfig["dswin"] = "";
            if (!konfig.Werte.ContainsKey("z1mdb")) konfig["z1mdb"] = "";
            if (!konfig.Werte.ContainsKey("densini")) konfig["densini"] = "";
        }
        if (konfig == null || !konfig.Vollstaendig)
            throw new SetupFehler("PlanR hat keinen gültigen Zugang geliefert. Bitte die Bridge in PlanR neu herunterladen.");
        konfig.Schreiben();
        if (konfig["praxis"] != "") anzeige.Untertitel("für " + konfig["praxis"]);
        Protokoll.Schreiben("Praxis: " + konfig["mandant"] + " " + konfig["praxis"]);
    }

    void PraxisprogrammSuchen()
    {
        var densIni = Environment.GetEnvironmentVariable("DENS_OFFICE_INI") ?? @"C:\Dens\DensOffice\Module\Ini\DENSoffice.ini";
        var z1mdb = Environment.GetEnvironmentVariable("Z1_MDB") ?? @"C:\CGM\Z1\data\z1.mdb";
        var pvs = konfig["pvs"];
        if (pvs != "cgm-z1pro" && !File.Exists(densIni) && (pvs == "dens" || pvs == "auto"))
        {
            // DENSoffice liegt nicht immer unter C:\Dens – andere Laufwerke und die Benutzerprofile absuchen.
            if (konfig.Werte.ContainsKey("densini") && File.Exists(konfig["densini"])) densIni = konfig["densini"];
            else
            {
                try
                {
                    var iniPfad = Json.Text(Helfer.Rufen("dens", null, 60000), "ini");
                    if (!string.IsNullOrEmpty(iniPfad) && File.Exists(iniPfad)) densIni = iniPfad;
                }
                catch (Exception e) { Protokoll.Schreiben("DENS-Suche: " + e.Message); }
            }
            if (pvs == "dens" && !File.Exists(densIni))
            {
                var wahl = anzeige.Fragen("DENSoffice.ini wählen", "DENSoffice wurde nicht von selbst gefunden. Bitte die Datei DENSoffice.ini wählen – sie liegt im DENSoffice-Ordner unter Module\\Ini.", densIni, false, false, "DENSoffice.ini|DENSoffice.ini|INI-Dateien (*.ini)|*.ini|Alle Dateien (*.*)|*.*");
                if (!string.IsNullOrEmpty(wahl))
                {
                    wahl = wahl.Trim().Trim('"');
                    if (Directory.Exists(wahl)) wahl = Path.Combine(wahl, "DENSoffice.ini");
                    if (File.Exists(wahl)) densIni = wahl;
                }
            }
            if (File.Exists(densIni)) { konfig["densini"] = densIni; konfig.Schreiben(); }
        }
        if (pvs == "cgm-z1pro")
        {
            if (konfig.Werte.ContainsKey("z1mdb") && File.Exists(konfig["z1mdb"])) z1mdb = konfig["z1mdb"];
            if (!File.Exists(z1mdb))
            {
                var wahl = anzeige.Fragen("Z1-Datenbank wählen", "Bitte die Z1-Datenbank wählen (z1.mdb), meist C:\\CGM\\Z1\\data\\z1.mdb.", z1mdb, false, false, "Z1-Datenbank (z1.mdb)|z1.mdb;*.mdb|Alle Dateien (*.*)|*.*");
                if (string.IsNullOrEmpty(wahl) || !File.Exists(wahl.Trim().Trim('"')))
                    throw new SetupFehler("Ohne die Z1-Datenbank kann die Bridge nicht arbeiten. Bitte das Setup auf dem Rechner öffnen, auf dem die Z1-Daten liegen.");
                z1mdb = wahl.Trim().Trim('"');
            }
            konfig["pvs"] = "cgm-z1pro";
            konfig["z1mdb"] = z1mdb;
            konfig["dswin"] = "";
            konfig.Schreiben();
            PvsName = "Z1.PRO";
            anzeige.Info("Z1.PRO: " + z1mdb);
            return;
        }
        if (pvs == "dens" || pvs == "auto" && File.Exists(densIni))
        {
            if (!File.Exists(densIni))
                throw new SetupFehler("DENSoffice ist auf diesem Rechner nicht zu finden. Bitte das Setup auf dem Rechner öffnen, auf dem die DENSoffice-Datenbank liegt (meist der Praxisserver).");
            PvsName = "DENSoffice";
            konfig["pvs"] = "dens";
            konfig["densini"] = densIni;
            konfig["dswin"] = "";
            konfig.Schreiben();
            anzeige.Info("DENSoffice gefunden.");
            return;
        }
        PvsName = "Dampsoft DS-Win";
        var ds = konfig["dswin"];
        var kandidaten = new List<Dictionary<string, object>>();
        if (!Freigabe.Gueltig(ds))
        {
            anzeige.Info("Suche den DS-Win-Ordner …");
            var suche = Helfer.Rufen("dswin", null, 180000);
            ds = Json.Text(suche, "dswin");
            kandidaten = Json.Liste(suche, "kandidaten");
            foreach (var k in kandidaten) Protokoll.Schreiben("DS-Win gefunden: " + Json.Text(k, "pfad") + " (" + Json.Text(k, "wie") + ", Stand " + Json.Text(k, "stand") + ")");
        }
        if (!string.IsNullOrEmpty(ds)) ds = Freigabe.Umsetzen(ds.TrimEnd('\\'));
        var gefunden = ds;
        if (!Freigabe.Gueltig(ds)) ds = Freigabe.AusNetzlaufwerken() ?? ds;
        if (pvs == "auto" && !Freigabe.Gueltig(ds) && File.Exists(z1mdb))
        {
            konfig["pvs"] = "cgm-z1pro";
            konfig["z1mdb"] = z1mdb;
            konfig["dswin"] = "";
            konfig.Schreiben();
            PvsName = "Z1.PRO";
            anzeige.Info("Z1.PRO: " + z1mdb);
            return;
        }
        var hinweis = "Das Setup hat DS-Win nicht selbst gefunden. Bitte den DS-Win-Ordner wählen – er enthält den Ordner „daten“ mit patient.dbf, z. B. D:\\TDAMP\\DS oder \\\\SERVER\\TDAMP\\DS.";
        while (!Freigabe.Gueltig(ds))
        {
            var wahl = anzeige.Fragen("DS-Win-Ordner wählen", hinweis, ds, false, true);
            if (string.IsNullOrEmpty(wahl))
                throw new SetupFehler("Ohne den DS-Win-Ordner kann die Bridge nicht arbeiten. Bitte das Setup noch einmal öffnen und den Ordner wählen (er enthält daten\\patient.dbf).");
            ds = Freigabe.Umsetzen(wahl.Trim().Trim('"').TrimEnd('\\'));
            hinweis = "In " + ds + " fehlt daten\\patient.dbf. Bitte den DS-Win-Ordner wählen (meist ...\\TDAMP\\DS).";
        }
        konfig["pvs"] = "dampsoft";
        konfig["dswin"] = ds;
        konfig.Schreiben();
        anzeige.Info("DS-Win: " + ds);
        Protokoll.Schreiben("DS-Win: " + ds);
        if (ds == gefunden && kandidaten.Count > 1)
        {
            var andere = new List<string>();
            for (var i = 1; i < kandidaten.Count && i <= 3; i++) andere.Add(Json.Text(kandidaten[i], "pfad") + " (Stand " + Json.Text(kandidaten[i], "stand") + ")");
            DsWinHinweis = "Mehrere DS-Win-Ordner gefunden – verbunden mit dem aktuellsten: " + ds + " (Stand " + Json.Text(kandidaten[0], "stand") + "). Nicht verwendet: "
                + string.Join("; ", andere) + (kandidaten.Count > 4 ? " und " + (kandidaten.Count - 4) + " weitere" : "") + ".";
        }
        var host = Freigabe.Host(ds);
        if (host != null && !Freigabe.IstLokal(host)) KontoEinrichten(ds, host);
    }

    /// DS-Win liegt auf einem anderen Rechner: Der Dienst läuft mit dem Windows-Konto, das die Freigabe schon öffnet.
    void KontoEinrichten(string ds, string host)
    {
        var ich = WindowsIdentity.GetCurrent();
        konto = ich.Name;
        sid = ich.User.Value;
#if !PROBE
        Rechte.OrdnerSchuetzen(sid);
#endif
        var text = "DS-Win liegt auf dem Rechner " + host + ". Damit die Bridge dort lesen darf, läuft sie mit Ihrem Windows-Konto " + konto
            + ".\n\nBitte das Windows-Kennwort dieses Kontos eingeben (das Anmelde-Kennwort, nicht die PIN):";
        for (var versuch = 1; ; versuch++)
        {
            var eingabe = anzeige.Fragen("Windows-Kennwort", text, "", true, false);
            if (eingabe == null)
                throw new SetupFehler("Ohne Windows-Kennwort kann der Dienst nicht auf DS-Win (" + host + ") zugreifen.");
            if (eingabe.Length == 0)
            {
                if (versuch >= 3)
                    throw new SetupFehler("Windows startet einen Dienst nur mit einem Konto, das ein Kennwort hat. Bitte dem Windows-Konto " + konto + " ein Kennwort geben und das Setup noch einmal öffnen.");
                text = "Bitte das Kennwort eingeben – ohne Kennwort startet Windows den Dienst unter diesem Konto nicht.\n\nKonto: " + konto;
                continue;
            }
            int rc;
            try
            {
                rc = Werkzeug.AlsKonto(konto, eingabe, Bridge.DienstExe,
                    "--datei-pruefen " + Werkzeug.Q(Path.Combine(ds, "daten", "patient.dbf")));
            }
            catch (Win32Exception e)
            {
                if (versuch >= 3) throw new SetupFehler("Die Anmeldung als " + konto + " klappt nicht: " + e.Message);
                text = "Das Kennwort stimmt nicht – bitte noch einmal.\n\nKonto: " + konto;
                continue;
            }
            if (rc != 0) throw new SetupFehler("Das Konto " + konto + " kann " + ds + " nicht lesen. Bitte die Freigabe-Rechte prüfen.");
            kennwort = eingabe;
            break;
        }
#if !PROBE
        Rechte.DienstAnmeldungErlauben(sid);
#endif
        anzeige.Info(konto + " erreicht DS-Win.");
    }

    void DienstEinrichten()
    {
        konfig.Schreiben();
        File.WriteAllLines(Path.Combine(Bridge.Ziel, "dienst.ini"), new[] { "exe=" + Bridge.DienstExe, "config=" + Bridge.AgentJson });
#if PROBE
        ProbeAgent = Process.Start(new ProcessStartInfo(Bridge.DienstExe, "--config " + Werkzeug.Q(Bridge.AgentJson))
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(Bridge.DienstExe),
        });
        anzeige.Info("Probe: Bridge läuft als Kindprozess (" + ProbeAgent.Id + ").");
#else
        var anlegen = "create " + Bridge.Dienst + " binPath= \"\\\"" + Bridge.Exe + "\\\" /dienst\" start= delayed-auto DisplayName= \"PlanR-Bridge\"";
        var rc = Dienste.Sc(anlegen);
        for (var i = 0; rc == 1072 && i < 30; i++)
        {
            Thread.Sleep(1000);
            rc = Dienste.Sc(anlegen);
        }
        if (rc != 0)
            throw new SetupFehler("Windows hat den Dienst „PlanR-Bridge“ nicht angelegt (Fehler " + rc + ")."
                + (rc == 1072 ? " Bitte das Fenster „Dienste“ schließen oder den Rechner neu starten und das Setup noch einmal öffnen." : ""), Dienste.LetzteAusgabe);
        Dienste.Sc("description " + Bridge.Dienst + " \"Verbindet DS-Win, DENSoffice bzw. CGM Z1.PRO dieses Rechners mit PlanR (nur ausgehend, kein offener Port).\"");
        Dienste.Sc("failure " + Bridge.Dienst + " reset= 86400 actions= restart/60000/restart/60000/restart/300000");
        if (konto != null) Dienste.KontoSetzen(Bridge.Dienst, konto, kennwort);
        try
        {
            if (!EventLog.SourceExists(Bridge.Dienst)) EventLog.CreateEventSource(Bridge.Dienst, "Application");
        }
        catch (Exception e) { Protokoll.Schreiben("Ereignisquelle: " + e.Message); }
        Eintragen();
        Dienste.Starten(Bridge.Dienst, konto);
        anzeige.Info("Der Dienst läuft.");
#endif
    }

    /// Eintrag unter Windows „Apps“ bzw. „Programme und Features“ zum Entfernen.
    static void Eintragen()
    {
        long groesse = 0;
        try { foreach (var f in new DirectoryInfo(Bridge.Ziel).GetFiles("*", SearchOption.AllDirectories)) groesse += f.Length; }
        catch (Exception) { }
        using (var k = Registry.LocalMachine.CreateSubKey(Bridge.Uninstall))
        {
            k.SetValue("DisplayName", "PlanR-Bridge");
            k.SetValue("DisplayVersion", Bridge.Version);
            k.SetValue("Publisher", "Pickadoc GmbH");
            k.SetValue("DisplayIcon", Bridge.Exe);
            k.SetValue("InstallLocation", Bridge.Ziel);
            k.SetValue("UninstallString", "\"" + Bridge.Exe + "\" /entfernen");
            k.SetValue("URLInfoAbout", Bridge.PlanRStandard);
            k.SetValue("HelpTelephone", Bridge.Hilfe);
            k.SetValue("NoModify", 1, RegistryValueKind.DWord);
            k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            k.SetValue("EstimatedSize", (int)(groesse / 1024), RegistryValueKind.DWord);
        }
    }

    void VerbindungPruefen()
    {
        var verbunden = false;
        var status = "";
        var fertig = false;
        Helfer.Rufen("warten", new Dictionary<string, object> { { "config", Bridge.AgentJson }, { "sekunden", 20 } }, 35000, d =>
        {
            if (d.ContainsKey("fertig"))
            {
                fertig = Json.Wahr(d, "fertig");
                NurLesen = Json.Text(d, "nurLesen");
                return;
            }
            verbunden = Json.Wahr(d, "verbunden");
            status = Json.Text(d, "status");
            anzeige.Info(!verbunden ? "Der Dienst startet, PlanR wird geprüft …" : status == "bereit" ? "Die Bridge ist bereit." : "Die Bridge meldet: " + status);
        });
        if (fertig)
        {
            BeiPlanR = true;
            return;
        }
        var laeuft = DienstLaeuft();
        if (laeuft)
        {
            Offen = verbunden && status != "" && status != "bereit"
                ? "Der Dienst „PlanR-Bridge“ läuft. PlanR meldet gerade: " + status + ". Die Verbindung kommt von selbst."
                : "Der Dienst „PlanR-Bridge“ läuft. Er meldet sich bei PlanR von selbst.";
            Protokoll.Schreiben(Offen);
            return;
        }
        var details = Protokoll.Ende(Path.Combine(Bridge.Ziel, "agent.log"), 25);
#if !PROBE
        details += "\n" + Dienste.Ereignisse();
#endif
        if (!verbunden)
            throw new SetupFehler("Der Dienst „PlanR-Bridge“ läuft nicht und hat sich nicht bei PlanR gemeldet.", details);
        throw new SetupFehler("Die Bridge meldet: " + status, details);
    }

    static bool DienstLaeuft()
    {
#if PROBE
        var p = ProbeAgent;
        return p != null && !p.HasExited;
#else
        try
        {
            using (var sc = new ServiceController(Bridge.Dienst))
                return sc.Status == ServiceControllerStatus.Running || sc.Status == ServiceControllerStatus.StartPending;
        }
        catch (Exception)
        {
            return false;
        }
#endif
    }
}

class SetupFenster : Form, IAnzeige
{
    static readonly Color Dunkel = Color.FromArgb(7, 30, 32);
    static readonly Color Gruen = Color.FromArgb(16, 150, 118);
    static readonly Color Pink = Color.FromArgb(224, 64, 123);
    static readonly Color Rot = Color.FromArgb(196, 36, 48);
    static readonly Color Grau = Color.FromArgb(122, 134, 136);
    static readonly Color Schrift = Color.FromArgb(18, 34, 36);

    readonly string code;
    readonly string planr;
    readonly Label untertitel;
    readonly Label meldung;
    readonly Label detail;
    readonly Label[] zeichen = new Label[5];
    readonly Label[] namen = new Label[5];
    readonly ProgressBar balken;
    readonly Button links;
    readonly Button rechts;
    Einrichtung einrichtung;
    volatile bool laeuft;
    bool fertig;
    int aktiv;

    public SetupFenster(string code, string planr)
    {
        this.code = code;
        this.planr = planr;
        SuspendLayout();
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        Text = "PlanR-Bridge einrichten";
        Font = new Font("Segoe UI", 9.75F);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(560, 444);
        BackColor = Color.White;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
        catch (Exception) { }

        var kopf = new Panel { Dock = DockStyle.Top, Height = 92, BackColor = Dunkel };
        kopf.Paint += (s, e) =>
        {
            var h = kopf.ClientSize.Height;
            Logo.Zeichnen(e.Graphics, h * 0.24f, h * 0.19f, h * 0.62f);
        };
        var titel = new Label { Text = "PlanR-Bridge einrichten", ForeColor = Color.White, BackColor = Dunkel, Font = new Font("Segoe UI Semibold", 15F), AutoSize = true, Location = new Point(92, 17) };
        untertitel = new Label { Text = "Verbindet Ihr Praxisprogramm sicher mit PlanR", ForeColor = Color.FromArgb(170, 222, 210), BackColor = Dunkel, AutoSize = true, Location = new Point(94, 52) };
        kopf.Controls.Add(titel);
        kopf.Controls.Add(untertitel);

        for (var i = 0; i < 5; i++)
        {
            zeichen[i] = new Label { Text = "○", ForeColor = Grau, Font = new Font("Segoe UI Symbol", 12F), Location = new Point(24, 108 + i * 32), Size = new Size(30, 28), TextAlign = ContentAlignment.MiddleCenter };
            namen[i] = new Label { Text = Einrichtung.Schritte[i], ForeColor = Grau, Location = new Point(58, 112 + i * 32), Size = new Size(476, 22) };
            Controls.Add(zeichen[i]);
            Controls.Add(namen[i]);
        }
        balken = new ProgressBar { Location = new Point(28, 278), Size = new Size(504, 8), Maximum = 1000, Style = ProgressBarStyle.Continuous };
        meldung = new Label { Location = new Point(26, 296), Size = new Size(508, 62), ForeColor = Schrift };
        detail = new Label { Location = new Point(26, 360), Size = new Size(508, 22), ForeColor = Grau, Font = new Font("Segoe UI", 8.5F), AutoEllipsis = true };
        links = new Button { Location = new Point(26, 396), Size = new Size(190, 34), Visible = false, FlatStyle = FlatStyle.System };
        rechts = new Button { Location = new Point(390, 396), Size = new Size(144, 34), Text = "Abbrechen", FlatStyle = FlatStyle.System };
        links.Click += (s, e) =>
        {
            if (!fertig)
            {
                Starten();
                return;
            }
            try { Process.Start(einrichtung.PlanRAdresse + "/#einrichtung"); }
            catch (Exception) { }
        };
        rechts.Click += (s, e) => Close();
        Controls.Add(balken);
        Controls.Add(meldung);
        Controls.Add(detail);
        Controls.Add(links);
        Controls.Add(rechts);
        Controls.Add(kopf);
        ResumeLayout(false);
        Shown += (s, e) => Starten();
        FormClosing += (s, e) =>
        {
            if (laeuft && MessageBox.Show(this, "Die Einrichtung läuft noch. Wirklich abbrechen?\n\nDie Bridge ist dann nicht fertig eingerichtet; Sie können das Setup jederzeit erneut öffnen.",
                    "PlanR-Bridge", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            {
                e.Cancel = true;
                return;
            }
#if PROBE
            if (Einrichtung.ProbeAgent != null) try { Werkzeug.Lauf("taskkill.exe", "/T /F /PID " + Einrichtung.ProbeAgent.Id, 15000, "", null); } catch (Exception) { }
#endif
            if (laeuft) Environment.Exit(1);
        };
    }

    void Starten()
    {
        laeuft = true;
        fertig = false;
        links.Visible = false;
        rechts.Text = "Abbrechen";
        meldung.ForeColor = Schrift;
        detail.ForeColor = Grau;
        for (var i = 0; i < 5; i++) Zeigen(i, 0);
        einrichtung = new Einrichtung(this, code, planr);
        var arbeit = new Thread(() =>
        {
            try
            {
                einrichtung.Ausfuehren();
                Im(Fertig);
            }
            catch (SetupFehler f)
            {
                Protokoll.Schreiben("FEHLER: " + f.Message + (f.Details != "" ? "\n" + f.Details : ""));
                einrichtung.FehlerMelden(f.Message, f.Details);
                Im(() => Fehler(f.Message));
            }
            catch (Exception e)
            {
                Protokoll.Schreiben("FEHLER: " + e);
                einrichtung.FehlerMelden("Unerwarteter Fehler: " + e.Message, e.ToString());
                Im(() => Fehler("Unerwarteter Fehler: " + e.Message));
            }
            finally { laeuft = false; }
        });
        arbeit.IsBackground = true;
        arbeit.SetApartmentState(ApartmentState.STA);
        arbeit.Start();
    }

    void Im(Action a)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try { BeginInvoke(a); }
        catch (InvalidOperationException) { }
    }

    /// zustand: 0 offen, 1 läuft, 2 erledigt, 3 Fehler
    void Zeigen(int i, int zustand)
    {
        zeichen[i].Text = zustand == 2 ? "✓" : zustand == 3 ? "✕" : zustand == 1 ? "●" : "○";
        zeichen[i].ForeColor = zustand == 2 ? Gruen : zustand == 3 ? Rot : zustand == 1 ? Pink : Grau;
        namen[i].ForeColor = zustand == 0 ? Grau : zustand == 3 ? Rot : Schrift;
        namen[i].Font = new Font(Font, zustand == 1 ? FontStyle.Bold : FontStyle.Regular);
    }

    public void Schritt(int nummer, string text)
    {
        Im(() =>
        {
            aktiv = nummer;
            for (var k = 0; k < 5; k++) Zeigen(k, k < nummer ? 2 : k == nummer ? 1 : 0);
            meldung.Text = text;
            detail.Text = "";
            balken.Value = nummer * 200;
        });
    }

    public void Fortschritt(int promille)
    {
        Im(() => balken.Value = Math.Min(1000, aktiv * 200 + Math.Max(0, promille) / 5));
    }

    public void Info(string text)
    {
        Im(() => detail.Text = text);
    }

    public void Untertitel(string text)
    {
        Im(() => untertitel.Text = text);
    }

    public string Fragen(string titel, string text, string vorschlag, bool kennwort, bool ordner, string dateiFilter = null)
    {
        return (string)Invoke((Func<string>)(() => EingabeDialog.Zeigen(this, titel, text, vorschlag, kennwort, ordner, dateiFilter)));
    }

    void Fertig()
    {
        fertig = true;
        for (var k = 0; k < 5; k++) Zeigen(k, 2);
        balken.Value = 1000;
        meldung.Text = !einrichtung.BeiPlanR
            ? "Fertig! Der Dienst „PlanR-Bridge“ ist eingerichtet.\nEr verbindet sich mit PlanR von selbst – dieses Fenster können Sie schließen."
            : einrichtung.NurLesen == ""
            ? "Fertig! PlanR ist mit " + einrichtung.PvsName + " verbunden.\nIm Browser geht es von selbst weiter – dieses Fenster können Sie schließen."
            : "Fertig! PlanR liest jetzt aus " + einrichtung.PvsName + ". Pläne zurück nach DS-Win schreiben geht hier aber nicht (siehe unten).\nIm Browser geht es von selbst weiter – dieses Fenster können Sie schließen.";
        detail.Text = "Die Bridge startet ab jetzt automatisch mit Windows.";
        if (einrichtung.Hinweis != "")
        {
            var mehr = detail.Height * (einrichtung.NurLesen != "" && einrichtung.DsWinHinweis != "" ? 4 : 2);
            detail.Height += mehr;
            links.Top += mehr;
            rechts.Top += mehr;
            ClientSize = new Size(ClientSize.Width, ClientSize.Height + mehr);
            detail.ForeColor = Schrift;
            detail.Text = einrichtung.Hinweis + "\nDie Bridge startet ab jetzt automatisch mit Windows.";
        }
        links.Text = "PlanR öffnen";
        links.Visible = true;
        rechts.Text = "Schließen";
        AcceptButton = rechts;
        Activate();
    }

    void Fehler(string text)
    {
        Zeigen(aktiv, 3);
        meldung.ForeColor = Rot;
        meldung.Text = text;
        detail.Text = "Hilfe: " + Bridge.Hilfe + "  ·  Protokoll: " + Protokoll.Datei;
        links.Text = "Erneut versuchen";
        links.Visible = true;
        rechts.Text = "Schließen";
        Activate();
    }
}

static class EingabeDialog
{
    public static string Zeigen(IWin32Window besitzer, string titel, string text, string vorschlag, bool kennwort, bool ordner, string dateiFilter = null)
    {
        var mitSuchen = ordner || !string.IsNullOrEmpty(dateiFilter);
        using (var f = new Form())
        {
            f.SuspendLayout();
            f.AutoScaleDimensions = new SizeF(96F, 96F);
            f.AutoScaleMode = AutoScaleMode.Dpi;
            f.Text = titel;
            f.Font = new Font("Segoe UI", 9.75F);
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MinimizeBox = false;
            f.MaximizeBox = false;
            f.ShowInTaskbar = false;
            f.StartPosition = FormStartPosition.CenterParent;
            f.ClientSize = new Size(500, 214);
            var hinweis = new Label { Text = text, Location = new Point(16, 14), Size = new Size(468, 110) };
            var feld = new TextBox { Location = new Point(18, 128), Size = new Size(mitSuchen ? 350 : 464, 26), Text = vorschlag ?? "", UseSystemPasswordChar = kennwort };
            var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Location = new Point(290, 168), Size = new Size(94, 32), FlatStyle = FlatStyle.System };
            var abbrechen = new Button { Text = "Abbrechen", DialogResult = DialogResult.Cancel, Location = new Point(390, 168), Size = new Size(94, 32), FlatStyle = FlatStyle.System };
            f.Controls.Add(hinweis);
            f.Controls.Add(feld);
            f.Controls.Add(ok);
            f.Controls.Add(abbrechen);
            if (mitSuchen)
            {
                var suchen = new Button { Text = "Durchsuchen …", Location = new Point(376, 127), Size = new Size(108, 28), FlatStyle = FlatStyle.System };
                suchen.Click += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(dateiFilter))
                    {
                        using (var w = new OpenFileDialog { Title = titel, Filter = dateiFilter, CheckFileExists = true })
                        {
                            var dir = Path.GetDirectoryName(feld.Text);
                            if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) w.InitialDirectory = dir;
                            if (w.ShowDialog(f) == DialogResult.OK) feld.Text = w.FileName;
                        }
                    }
                    else
                    {
                        using (var w = new FolderBrowserDialog { Description = "DS-Win-Ordner (enthält „daten“ mit patient.dbf)", ShowNewFolderButton = false })
                        {
                            if (Directory.Exists(feld.Text)) w.SelectedPath = feld.Text;
                            if (w.ShowDialog(f) == DialogResult.OK) feld.Text = w.SelectedPath;
                        }
                    }
                };
                f.Controls.Add(suchen);
            }
            f.AcceptButton = ok;
            f.CancelButton = abbrechen;
            f.ResumeLayout(false);
            f.Shown += (s, e) => feld.Focus();
            return f.ShowDialog(besitzer) == DialogResult.OK ? feld.Text.Trim() : null;
        }
    }
}

/// Windows-Dienst „PlanRBridge“: startet programm\PlanR.Bridge.Dienst.exe und spielt vor jedem Start
/// bereitliegende signierte Updates (update\bereit.txt) atomar ein (mit Sicherung programm.alt und Rollback).
class Dienst : ServiceBase
{
    const int ExitCodeUpdate = 42;
    readonly ManualResetEvent halt = new ManualResetEvent(false);
    Process prozess;
    Thread waechter;
    Dictionary<string, string> ini;

    public Dienst()
    {
        ServiceName = Bridge.Dienst;
        CanStop = true;
        CanShutdown = true;
    }

    void Loggen(string text, EventLogEntryType typ)
    {
        try { EventLog.WriteEntry(text, typ); }
        catch (Exception) { }
    }

    protected override void OnStart(string[] args)
    {
        ini = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var zeile in File.ReadAllLines(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dienst.ini")))
        {
            var i = zeile.IndexOf('=');
            if (i > 0) ini[zeile.Substring(0, i).Trim()] = zeile.Substring(i + 1).Trim();
        }
        if (!ini.ContainsKey("exe") || string.IsNullOrEmpty(ini["exe"]))
            throw new InvalidOperationException("dienst.ini: exe fehlt");
        if (!ini.ContainsKey("config") || !File.Exists(ini["config"]))
            throw new InvalidOperationException("dienst.ini: config fehlt oder existiert nicht");
        UpdateAnwenden();
        if (!File.Exists(ini["exe"]))
            throw new InvalidOperationException("dienst.ini: exe existiert nicht (" + ini["exe"] + ")");
        halt.Reset();
        waechter = new Thread(Laufen) { IsBackground = true };
        waechter.Start();
    }

    static void MitVersuch(Action aktion)
    {
        for (var i = 0; ; i++)
        {
            try { aktion(); return; }
            catch (Exception)
            {
                if (i >= 4) throw;
                Thread.Sleep(500);
            }
        }
    }

    void UpdateAnwenden()
    {
        try
        {
            var basis = Path.GetDirectoryName(ini["config"]);
            var updateDir = Path.Combine(basis, "update");
            var bereit = Path.Combine(updateDir, "bereit.txt");
            var neu = Path.Combine(updateDir, "programm");
            var ziel = Path.Combine(basis, "programm");
            var alt = Path.Combine(basis, "programm.alt");

            if (!Directory.Exists(ziel) && Directory.Exists(alt))
            {
                Directory.Move(alt, ziel);
                Loggen("PlanR-Bridge aus programm.alt wiederhergestellt.", EventLogEntryType.Warning);
            }

            if (!File.Exists(bereit) || !File.Exists(Path.Combine(neu, "PlanR.Bridge.Dienst.exe"))) return;

            if (Directory.Exists(alt)) MitVersuch(() => Directory.Delete(alt, true));
            if (Directory.Exists(ziel)) MitVersuch(() => Directory.Move(ziel, alt));
            try
            {
                MitVersuch(() => Directory.Move(neu, ziel));
                try { File.Delete(bereit); } catch (Exception) { }
                Loggen("PlanR-Bridge Update eingespielt.", EventLogEntryType.Information);
            }
            catch (Exception ex)
            {
                if (!Directory.Exists(ziel) && Directory.Exists(alt))
                {
                    try { Directory.Move(alt, ziel); } catch (Exception) { }
                }
                Loggen("PlanR-Bridge Update-Wechsel fehlgeschlagen (Rollback durchgeführt): " + ex.Message, EventLogEntryType.Error);
            }
        }
        catch (Exception ex)
        {
            Loggen("PlanR-Bridge Update-Prüfung: " + ex.Message, EventLogEntryType.Warning);
        }
    }

    void Laufen()
    {
        var pause = 5;
        while (!halt.WaitOne(0))
        {
            UpdateAnwenden();
            var start = DateTime.UtcNow;
            var exitCode = -1;
            try
            {
                var info = new ProcessStartInfo(ini["exe"], "--config \"" + ini["config"] + "\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(ini["exe"]),
                };
                prozess = Process.Start(info);
                prozess.WaitForExit();
                exitCode = prozess.ExitCode;
                if (halt.WaitOne(0)) break;
                if (exitCode == ExitCodeUpdate)
                {
                    pause = 5;
                    continue;
                }
                Loggen("PlanR-Bridge beendet (Code " + exitCode + "), Neustart in " + pause + " s.", EventLogEntryType.Warning);
            }
            catch (Exception ex)
            {
                Loggen("PlanR-Bridge startet nicht: " + ex.Message, EventLogEntryType.Error);
            }
            if ((DateTime.UtcNow - start).TotalMinutes > 10) pause = 5;
            if (halt.WaitOne(pause * 1000)) break;
            pause = Math.Min(pause * 2, 60);
        }
    }

    protected override void OnStop()
    {
        halt.Set();
        var p = prozess;
        if (p != null && !p.HasExited)
        {
            using (var kill = Process.Start(new ProcessStartInfo("taskkill.exe", "/T /F /PID " + p.Id) { UseShellExecute = false, CreateNoWindow = true }))
                kill.WaitForExit(15000);
        }
        if (waechter != null) waechter.Join(5000);
    }

    protected override void OnShutdown()
    {
        OnStop();
    }
}

static class Entfernen
{
    public static int Starten()
    {
        if (MessageBox.Show("Die PlanR-Bridge von diesem Rechner entfernen?\n\nPlanR kann danach keine Patienten und Pläne mehr mit Ihrem Praxisprogramm austauschen.",
                "PlanR-Bridge entfernen", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return 1;
        try
        {
            Cursor.Current = Cursors.WaitCursor;
            foreach (var d in new[] { Bridge.Dienst, "PlanRAgent" }) Dienste.Entfernen(d);
            Prozesse.BeendenUnter(Bridge.Ziel);
            Registry.LocalMachine.DeleteSubKeyTree(Bridge.Uninstall, false);
            if (Directory.Exists(Bridge.Ziel))
            {
                foreach (var e in Directory.GetFileSystemEntries(Bridge.Ziel))
                {
                    if (Werkzeug.GleicherPfad(e, Application.ExecutablePath)) continue;
                    try
                    {
                        if (Directory.Exists(e)) Directory.Delete(e, true);
                        else File.Delete(e);
                    }
                    catch (Exception) { }
                }
                // Die laufende Datei selbst löscht ein kurzer Nachzügler, sobald sie beendet ist.
                Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 4 >nul & rmdir /s /q " + Werkzeug.Q(Bridge.Ziel))
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetTempPath(),
                });
            }
            MessageBox.Show("Die PlanR-Bridge ist entfernt.", "PlanR-Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show("Das Entfernen hat nicht geklappt: " + e.Message + "\n\nHilfe: " + Bridge.Hilfe, "PlanR-Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
