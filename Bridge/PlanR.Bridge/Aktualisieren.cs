using System.Diagnostics;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PlanR.Bridge;

public sealed class UpdateFehler : Exception
{
    public UpdateFehler(string meldung) : base(meldung) { }
}

public sealed record UpdateInfo(bool Verfuegbar, string Version, string Sha256, string Signatur);

/// <summary>
/// Selbstaktualisierung der PlanR-Bridge: prüft RSA-3072-Signatur (PKCS#1 v1.5, SHA-256)
/// desselben Entwickler-Schlüssels wie agent/update_signieren.py, packt nach update\programm aus,
/// prüft die neue EXE per --version und markiert update\bereit.txt für den Dienst-Neustart.
/// </summary>
public static class Aktualisieren
{
    public const int ExitCodeNeustart = 42;
    public const int HoechstensBytes = 120_000_000;

    // Exakter öffentlicher RSA-3072-Schlüssel aus pvsConnectoR/agent/aktualisieren.py
    public const string SchluesselNHex =
        "d9bc54f13d286cd59cba7e54b8a792f3fc2129c7ad6b68ff726bc4d59b465b5d773ac68180d85458e62da47fa9f9acf4a2a47be81d52a433f5d7d78d" +
        "43b516f5e343df29e80b75a7de973ddc39fe8c58afd92ccbf7c729f741130582dcd74068e74dbe427634351dca16c36fc3a8d96b31a0bb6617d6ee3fa9" +
        "acf7a6e010ff175b7e953a540b4a1ab8425a067b8a11027f86d89bbaf0b379a4a402fa6523074266968a54d9ebae18d27c172d07e5ac4e78210e74898f" +
        "62c48aec23676fbfeb20db6affd3229df18506677867aacd118d0baed897f842d3c9c14000fa73d73a1a861186484c975cdd90a83199dd5603a1e87d0b" +
        "d92d24a35232d8b0c7c6d87a83d0cecd21b9e427d6c0e605451d9bd98edb19a41d54451420a74efb8d4c7785f4b5e9f74f1ccd09ce92b32c48d669cbae" +
        "b1916c216394f464beb6da38ad34a4d38941bb8b55706e7e96830f5b95bec855168115fe3bb8de4dbe8405c29448876230fe56ea4c9d50fa4f0ab0209b" +
        "21ae6188f0c2f45d86701a7ae7a141f94f8c0f";

    public static RSAParameters StandardSchluessel() => new()
    {
        Modulus = Convert.FromHexString(SchluesselNHex),
        Exponent = [0x01, 0x00, 0x01], // 65537
    };

    public static bool SignaturGueltig(byte[] daten, byte[] signatur, RSAParameters? schluessel = null)
    {
        try
        {
            var param = schluessel ?? StandardSchluessel();
            if (param.Modulus is null || signatur.Length != param.Modulus.Length) return false;
            using var rsa = RSA.Create();
            rsa.ImportParameters(param);
            return rsa.VerifyData(daten, signatur, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        catch
        {
            return false;
        }
    }

    public static int[]? VersionTeile(string? version)
    {
        if (string.IsNullOrWhiteSpace(version)) return null;
        var teile = version.Trim().Split('.');
        var aus = new int[teile.Length];
        for (var i = 0; i < teile.Length; i++)
        {
            if (!int.TryParse(teile[i], out var n) || n < 0) return null;
            aus[i] = n;
        }
        return aus;
    }

    public static bool IstNeuer(string? neu, string? aktuell)
    {
        var a = VersionTeile(neu);
        var b = VersionTeile(aktuell);
        if (a is null || b is null) return false;
        var len = Math.Max(a.Length, b.Length);
        for (var i = 0; i < len; i++)
        {
            var av = i < a.Length ? a[i] : 0;
            var bv = i < b.Length ? b[i] : 0;
            if (av != bv) return av > bv;
        }
        return false;
    }

    public static int Auspacken(byte[] zipDaten, string zielOrdner)
    {
        if (Directory.Exists(zielOrdner)) Directory.Delete(zielOrdner, true);
        Directory.CreateDirectory(zielOrdner);
        var wurzel = Path.GetFullPath(zielOrdner).TrimEnd('\\') + "\\";
        var anzahl = 0;
        using var strom = new MemoryStream(zipDaten, writable: false);
        using var zip = new ZipArchive(strom, ZipArchiveMode.Read);
        foreach (var eintrag in zip.Entries)
        {
            var rel = eintrag.FullName.Replace('\\', '/');
            if (rel.EndsWith('/')) continue;
            var teile = rel.Split('/');
            if (teile.Length < 2 || teile[0] != "programm") continue;
            if (teile.Skip(1).Any(t => t.Length == 0 || t is "." or ".." || t.Contains(':'))) continue;
            var ziel = Path.GetFullPath(Path.Combine([zielOrdner, .. teile.Skip(1)]));
            if (!ziel.StartsWith(wurzel, StringComparison.OrdinalIgnoreCase)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(ziel)!);
            using var von = eintrag.Open();
            using var nach = File.Create(ziel);
            von.CopyTo(nach);
            anzahl++;
        }
        if (anzahl == 0)
            throw new UpdateFehler("Das Update-Paket enthält keine Programmdateien.");
        return anzahl;
    }

    public static string Selbsttest(string neuOrdner)
    {
        var exe = Path.Combine(neuOrdner, "PlanR.Bridge.Dienst.exe");
        if (!File.Exists(exe))
            throw new UpdateFehler("Update-Paket enthält keine PlanR.Bridge.Dienst.exe.");
        var info = new ProcessStartInfo(exe, "--version")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = neuOrdner,
        };
        using var p = Process.Start(info) ?? throw new UpdateFehler("Neue Fassung startet nicht.");
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        if (!p.WaitForExit(60_000))
        {
            try { p.Kill(entireProcessTree: true); } catch { }
            throw new UpdateFehler("Selbsttest der neuen Fassung überschreitet 60 Sekunden.");
        }
        if (p.ExitCode != 0)
            throw new UpdateFehler($"Neue Fassung startet nicht (Code {p.ExitCode}): {(stdout + " " + stderr).Trim()}");
        return stdout.Trim();
    }

    public static (string NeuOrdner, string Version) Vorbereiten(
        UpdateInfo info,
        byte[] daten,
        string basisOrdner,
        string aktuell,
        RSAParameters? schluessel = null,
        Func<string, string>? selbsttest = null)
    {
        if (daten.Length > HoechstensBytes)
            throw new UpdateFehler("Update-Paket zu groß.");
        if (!string.IsNullOrWhiteSpace(info.Sha256))
        {
            var istSha = Convert.ToHexString(SHA256.HashData(daten)).ToLowerInvariant();
            if (!string.Equals(istSha, info.Sha256.Trim(), StringComparison.OrdinalIgnoreCase))
                throw new UpdateFehler("Update-Paket unvollständig geladen (Prüfsumme).");
        }
        byte[] signatur;
        try { signatur = Convert.FromHexString(info.Signatur.Trim()); }
        catch { signatur = []; }
        if (!SignaturGueltig(daten, signatur, schluessel))
            throw new UpdateFehler("Signatur des Update-Pakets ist ungültig – nicht eingespielt.");

        var updateOrdner = Path.Combine(basisOrdner, "update");
        var neu = Path.Combine(updateOrdner, "programm");
        var bereitFlag = Path.Combine(updateOrdner, "bereit.txt");
        if (File.Exists(bereitFlag)) File.Delete(bereitFlag);

        Auspacken(daten, neu);
        var gemeldet = (selbsttest ?? Selbsttest)(neu);
        if (!IstNeuer(gemeldet, aktuell))
            throw new UpdateFehler($"Update-Paket enthält Bridge {gemeldet}, läuft schon {aktuell}.");
        if (!string.IsNullOrWhiteSpace(info.Version) && !string.Equals(gemeldet, info.Version.Trim(), StringComparison.Ordinal))
            throw new UpdateFehler($"Neue Fassung meldet Version {gemeldet} statt {info.Version}.");

        File.WriteAllText(bereitFlag, gemeldet + Environment.NewLine, new UTF8Encoding(false));
        return (neu, gemeldet);
    }

    public static UpdateInfo InfoLesen(string json)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        var r = doc.RootElement;
        var verfuegbar = r.TryGetProperty("verfuegbar", out var v) && v.ValueKind == JsonValueKind.True;
        var version = r.TryGetProperty("version", out var ver) && ver.ValueKind == JsonValueKind.String ? ver.GetString() ?? "" : "";
        var sha = r.TryGetProperty("sha256", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() ?? "" : "";
        var sig = r.TryGetProperty("signatur", out var sg) && sg.ValueKind == JsonValueKind.String ? sg.GetString() ?? "" : "";
        return new UpdateInfo(verfuegbar, version, sha, sig);
    }

    /// <summary>Hintergrund-Schleife: prüft nach 2 min und danach stündlich auf signierte Updates.</summary>
    public static async Task Schleife(
        PlanRKunde kunde,
        Konfig cfg,
        Laufend laufend,
        Protokoll log,
        Action neustartAusloesen,
        CancellationToken halt,
        TimeSpan? startWarte = null,
        TimeSpan? intervall = null)
    {
        if (!cfg.Aktualisieren) return;
        var warten = startWarte ?? TimeSpan.FromSeconds(120);
        var takt = intervall ?? TimeSpan.FromSeconds(3600);
        while (!halt.IsCancellationRequested)
        {
            try { await Task.Delay(warten, halt); }
            catch (OperationCanceledException) { break; }
            warten = takt;

            if (File.Exists(Path.Combine(cfg.Ordner, "STOP"))) continue;
            try
            {
                var infoJson = await kunde.HoleText($"/api/pvs-agent/update?version={Uri.EscapeDataString(Umfrage.Version)}", halt);
                var info = InfoLesen(infoJson);
                if (!info.Verfuegbar || !IstNeuer(info.Version, Umfrage.Version)) continue;

                log.Info($"Update auf Bridge {info.Version} verfügbar – lade Paket …");
                var paket = await kunde.HoleBytes("/api/pvs-agent/update/paket", HoechstensBytes, halt);
                var (_, neuVersion) = Vorbereiten(info, paket, cfg.Ordner, Umfrage.Version);
                log.Info($"Update {neuVersion} geprüft und bereitgestellt – warte auf laufende Aufträge …");
                laufend.Abwarten(TimeSpan.FromSeconds(60));
                log.Info($"Beende Bridge für Update-Wechsel auf {neuVersion}.");
                neustartAusloesen();
                return;
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (UpdateFehler exc)
            {
                log.Warn($"Update abgebrochen: {exc.Message}");
            }
            catch (Exception exc)
            {
                log.Warn($"Update-Prüfung fehlgeschlagen: {exc.Message}");
            }
        }
    }
}
