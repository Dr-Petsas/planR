// Windows-Dienst „PlanR-Bridge“: startet programm\PlanR.Bridge.Dienst.exe und spielt vor jedem Start
// bereitliegende signierte Updates (update\bereit.txt) atomar ein (mit Sicherung programm.alt und Rollback).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

public class PlanRBridgeDienst : ServiceBase
{
    const int ExitCodeUpdate = 42;
    readonly ManualResetEvent halt = new ManualResetEvent(false);
    Process prozess;
    Thread waechter;
    Dictionary<string, string> ini;

    public PlanRBridgeDienst()
    {
        ServiceName = "PlanRBridge";
        CanStop = true;
        CanShutdown = true;
    }

    public static void Main()
    {
        Run(new PlanRBridgeDienst());
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

            // Wiederherstellung, falls ein früherer Wechsel abgebrochen wurde
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
