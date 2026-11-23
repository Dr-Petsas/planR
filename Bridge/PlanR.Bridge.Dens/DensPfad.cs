using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace PlanR.Bridge.Dens;

public sealed class DensReadError : Exception
{
    public DensReadError(string message) : base(message) { }
}

public sealed record DensInstallConfig(string Bank, string Module, string Sysdat, string Profile, string Tenant);
public sealed record DensLockManagerConfig(int LockManagerType, string LockManagerAddress);

/// <summary>
/// Port von dens_pfad.py sowie installation_config() / lock_manager_config() aus dens_native.py.
/// </summary>
public static class DensPfad
{
    static readonly string ProfilRel = Path.Combine("DENS GmbH", "DENSoffice", "DENSoffice.ini");
    static readonly string StandardRel = Path.Combine("Dens", "DensOffice", "Module", "Ini", "DENSoffice.ini");

    [DllImport("kernel32.dll")] static extern uint GetLogicalDrives();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetDriveTypeW(string root);

    static DensPfad() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public static Encoding Cp1252 => Encoding.GetEncoding(1252);
    public static Encoding Cp1252Strict => Encoding.GetEncoding(1252, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);

    static string AgentJsonPfad() =>
        Path.Combine(Environment.GetEnvironmentVariable("ProgramData") ?? @"C:\ProgramData", "PlanR-Bridge", "agent.json");

    static string Gemerkt()
    {
        try
        {
            var pfad = AgentJsonPfad();
            if (!File.Exists(pfad)) return "";
            using var doc = JsonDocument.Parse(File.ReadAllText(pfad, Encoding.UTF8));
            return doc.RootElement.TryGetProperty("densini", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        }
        catch { return ""; }
    }

    public static List<string> Laufwerke()
    {
        try
        {
            var maske = GetLogicalDrives();
            var aus = new List<string>();
            for (var i = 0; i < 26; i++)
            {
                if (((maske >> i) & 1) == 0) continue;
                var root = $"{(char)('A' + i)}:\\";
                if (GetDriveTypeW(root) == 3) aus.Add(root);
            }
            return aus.Count > 0 ? aus : [@"C:\"];
        }
        catch { return [@"C:\"]; }
    }

    public static List<string> Kandidaten(string? konfigDensIni = null)
    {
        var outList = new List<string>();
        foreach (var fest in new[] { Environment.GetEnvironmentVariable("DENS_OFFICE_INI"), konfigDensIni, Gemerkt() })
            if (!string.IsNullOrWhiteSpace(fest)) outList.Add(fest);
        var up = Environment.GetEnvironmentVariable("USERPROFILE");
        if (!string.IsNullOrWhiteSpace(up)) outList.Add(Path.Combine(up, ProfilRel));
        var benutzer = Path.Combine((Environment.GetEnvironmentVariable("SystemDrive") ?? "C:") + "\\", "Users");
        try
        {
            var profile = Directory.EnumerateDirectories(benutzer)
                .Select(p => Path.Combine(p, ProfilRel))
                .Where(File.Exists)
                .OrderByDescending(p => File.GetLastWriteTimeUtc(p));
            outList.AddRange(profile);
        }
        catch { }
        foreach (var lw in Laufwerke())
            outList.Add(Path.Combine(lw, StandardRel));
        return outList;
    }

    public static bool PaarSichtbar(string bank, string module)
    {
        try
        {
            return File.Exists(Path.Combine(bank, "DENSOF.DBD")) && File.Exists(Path.Combine(module, "rdme8.dll"));
        }
        catch { return false; }
    }

    static string OhneLaufwerk(string pfad)
    {
        if (pfad.StartsWith(@"\\", StringComparison.Ordinal))
        {
            var teile = pfad.Split('\\', StringSplitOptions.RemoveEmptyEntries);
            return teile.Length > 2 ? string.Join('\\', teile.Skip(2)) : "";
        }
        if (pfad.Length >= 2 && pfad[1] == ':')
            return pfad[2..].TrimStart('\\');
        return pfad.TrimStart('\\');
    }

    public static (string Bank, string Module)? AufFesterPlatte(string bank, string module, IEnumerable<string> laufwerke)
    {
        if (PaarSichtbar(bank, module)) return (bank, module);
        var restBank = OhneLaufwerk(bank);
        var restModul = OhneLaufwerk(module);
        if (restBank.Length == 0 || restModul.Length == 0) return null;
        foreach (var lw in laufwerke)
        {
            var fb = Path.Combine(lw, restBank);
            var fm = Path.Combine(lw, restModul);
            if (PaarSichtbar(fb, fm)) return (fb, fm);
        }
        return null;
    }

    public static string? Ini(string? konfigDensIni = null)
    {
        var fest = Environment.GetEnvironmentVariable("DENS_OFFICE_INI");
        if (!string.IsNullOrEmpty(fest)) return fest;
        foreach (var p in Kandidaten(konfigDensIni))
        {
            try { if (File.Exists(p)) return p; }
            catch { }
        }
        return null;
    }

    public static Dictionary<string, Dictionary<string, string>> IniLesen(string pfad)
    {
        var sektionen = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        Dictionary<string, string>? aktuell = null;
        foreach (var rohZeile in File.ReadAllLines(pfad, Cp1252))
        {
            var z = rohZeile.Trim();
            if (z.Length == 0 || z[0] == ';' || z[0] == '#') continue;
            if (z[0] == '[' && z[^1] == ']')
            {
                var name = z[1..^1];
                if (!sektionen.TryGetValue(name, out aktuell))
                {
                    aktuell = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    sektionen[name] = aktuell;
                }
                continue;
            }
            if (aktuell is null) continue;
            var eq = z.IndexOf('=');
            var col = z.IndexOf(':');
            var pos = eq >= 0 && (col < 0 || eq < col) ? eq : col;
            if (pos > 0)
                aktuell[z[..pos].Trim()] = z[(pos + 1)..].Trim();
        }
        return sektionen;
    }

    public static DensInstallConfig InstallationConfig(string? konfigDensIni = null)
    {
        var iniPfad = Ini(konfigDensIni) ?? @"C:\Dens\DensOffice\Module\Ini\DENSoffice.ini";
        try
        {
            var cfg = IniLesen(iniPfad);
            var basis = cfg["DENS-OFFICE"];
            var mandanten = cfg["MANDANTEN"];
            var tenantRoh = Environment.GetEnvironmentVariable("DENS_TENANT") ?? mandanten["AKTUELL"];
            var tenant = int.Parse(tenantRoh).ToString();
            var bank = mandanten["DBPATH" + tenant];
            var module = Environment.GetEnvironmentVariable("DENS_MODULE_DIR") ?? basis["MODULPATH"];
            var central = Environment.GetEnvironmentVariable("DENS_SYSDAT_INI") ?? Path.Combine(basis["ZENTRALPATH"], "DB", "sysdat.ini");
            var sichtbar = AufFesterPlatte(bank, module, Laufwerke());
            if (sichtbar is null)
                throw new InvalidOperationException("Mandantendatenbank oder lokale DENS-Module fehlen");
            if (sichtbar.Value.Bank.StartsWith(@"\\", StringComparison.Ordinal))
                throw new InvalidOperationException("DENS verlangt einen identisch zugeordneten Laufwerkspfad statt UNC");
            return new DensInstallConfig(sichtbar.Value.Bank, sichtbar.Value.Module, central, iniPfad, tenant);
        }
        catch (Exception exc)
        {
            throw new DensReadError("DENS-Installationskonfiguration ungültig: " + exc.Message);
        }
    }

    public static DensLockManagerConfig LockManagerConfig(string? konfigDensIni = null)
    {
        var configPath = InstallationConfig(konfigDensIni).Sysdat;
        try
        {
            var cfg = IniLesen(configPath);
            var sec = cfg["DENS-OFFICE"];
            var kind = int.Parse(sec["LockmanagerTyp"]);
            var address = sec.TryGetValue("LockmanagerAdresse", out var a) ? a.Trim() : "";
            if (kind is not (3 or 6) || (kind == 6 && address.Length == 0))
                throw new InvalidOperationException("Lockmanagertyp oder TCP-Adresse ungültig");
            return new DensLockManagerConfig(kind, address);
        }
        catch (Exception exc)
        {
            throw new DensReadError("DENS-Lockmanagerkonfiguration nicht lesbar: " + exc.Message);
        }
    }
}
