using System.Text;

namespace PlanR.Bridge;

/// <summary>Rotierendes Protokoll in agent.log (1 MB, 3 Sicherungen) plus Konsole.</summary>
public sealed class Protokoll
{
    readonly string datei;
    readonly long maxBytes;
    readonly int sicherungen;
    readonly object sperre = new();

    public Protokoll(string ordner, string dateiname = "agent.log", long maxBytes = 1_000_000, int sicherungen = 3)
    {
        Directory.CreateDirectory(ordner);
        datei = Path.Combine(ordner, dateiname);
        this.maxBytes = maxBytes;
        this.sicherungen = sicherungen;
    }

    public string Datei => datei;

    public void Info(string text) => Schreiben("INFO", text);
    public void Warn(string text) => Schreiben("WARN", text);
    public void Fehler(string text) => Schreiben("ERROR", text);

    void Schreiben(string stufe, string text)
    {
        var zeile = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {stufe} {text}";
        lock (sperre)
        {
            try { Console.WriteLine(zeile); } catch { }
            try
            {
                Rotieren();
                File.AppendAllText(datei, zeile + Environment.NewLine, new UTF8Encoding(false));
            }
            catch { }
        }
    }

    void Rotieren()
    {
        if (!File.Exists(datei)) return;
        var info = new FileInfo(datei);
        if (info.Length < maxBytes) return;
        for (var i = sicherungen; i >= 1; i--)
        {
            var alt = i == 1 ? datei : $"{datei}.{i - 1}";
            var neu = $"{datei}.{i}";
            if (!File.Exists(alt)) continue;
            try
            {
                if (File.Exists(neu)) File.Delete(neu);
                File.Move(alt, neu);
            }
            catch { }
        }
    }
}
