using System.Collections;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace PlanR.Bridge.Dens;

/// <summary>
/// 32-Bit-RDM-Zugriff (rdme8.dll) auf DENSoffice: direkter Port von F:\pvsConnectoR\connectors\dens\DensNative.cs
/// samt Lese-Cache (bank_stand) aus dens_native.py, direkt im Prozess ohne Subprozess-Start.
/// </summary>
public sealed class DensNative
{
    const string R = "rdme8.dll";
    const string P = "rdmepsp8.dll";
    const int KARTEI = 20003;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool SetDllDirectory(string path);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetDriveType(string root);
    [DllImport(R)] static extern int d_opentaskA(out IntPtr t);
    [DllImport(R)] static extern int d_closetaskA(IntPtr t);
    [DllImport(R)] static extern int d_dbuseridA(string s, IntPtr t);
    [DllImport(R)] static extern int d_dbdpathA(string s, IntPtr t);
    [DllImport(R)] static extern int d_dbfpathA(string s, IntPtr t);
    [DllImport(R)] static extern int d_dbtafA(string s, IntPtr t);
    [DllImport(R)] static extern int d_dbtmpA(string s, IntPtr t);
    [DllImport(R)] static extern int d_on_optA(uint o, IntPtr t);
    [DllImport(P)] static extern IntPtr psp_lmcFindA(string s);
    [DllImport(R)] static extern int d_lockcommA(IntPtr p, IntPtr t);
    [DllImport(R)] static extern int d_lockmgrA(string s, IntPtr t);
    [DllImport(R)] static extern int d_findnmA(int s, IntPtr t, int db);
    [DllImport(R)] static extern int d_openA(string s, string mode, IntPtr t);
    [DllImport(R)] static extern int d_closeA(IntPtr t);
    [DllImport(R)] static extern int d_recfrstA(int r, IntPtr t, int db);
    [DllImport(R)] static extern int d_recnextA(IntPtr t, int db);
    [DllImport(R)] static extern int d_recreadA(byte[] b, IntPtr t, int db);
    [DllImport(R)] static extern int d_recwriteA(byte[] b, IntPtr t, int db);
    [DllImport(R)] static extern int d_crgetA(out uint a, IntPtr t, int db);
    [DllImport(R)] static extern int d_crsetA(ref uint a, IntPtr t, int db);
    [DllImport(R)] static extern int d_findfmA(int s, IntPtr t, int db);
    [DllImport(R)] static extern int d_findlmA(int s, IntPtr t, int db);
    [DllImport(R)] static extern int d_setorA(int s, IntPtr t, int db);
    [DllImport(R)] static extern int d_connectA(int s, IntPtr t, int db);
    [DllImport(R)] static extern int d_fillnewA(int r, byte[] b, IntPtr t, int db);
    [DllImport(R)] static extern int d_keyfindA(int f, byte[] b, IntPtr t, int db);
    [DllImport(R)] static extern int d_reclockA(int r, string mode, IntPtr t, int db);
    [DllImport(R)] static extern int d_freeallA(IntPtr t);
    [DllImport(R)] static extern int d_trbeginA(string s, IntPtr t);
    [DllImport(R)] static extern int d_trendA(IntPtr t);
    [DllImport(R)] static extern int d_trabortA(IntPtr t);

    static readonly object Sperre = new();
    static readonly HashSet<string> LeseOperationen = new(StringComparer.Ordinal)
        { "list", "patient", "clinical-list", "service-catalog", "lab-catalog" };
    static readonly Dictionary<string, object?> LeseMerk = new(StringComparer.Ordinal);
    static string? LeseStand;
    static long LeseStandTicks;

    static DensNative() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    IntPtr task;
    readonly List<string> writtenPlanTeeth = new();

    static string? BankStand(string bank)
    {
        try
        {
            var sb = new StringBuilder();
            foreach (var datei in Directory.EnumerateFiles(bank).OrderBy(f => Path.GetFileName(f), StringComparer.Ordinal))
            {
                var name = Path.GetFileName(datei);
                if (!name.EndsWith(".dat", StringComparison.OrdinalIgnoreCase)) continue;
                var fi = new FileInfo(datei);
                sb.Append(name).Append(':').Append(fi.LastWriteTimeUtc.Ticks).Append(':').Append(fi.Length).Append('|');
            }
            return sb.ToString();
        }
        catch { return null; }
    }

    static object? Klonen(object? wert) => wert switch
    {
        null => null,
        Dictionary<string, object?> d => d.ToDictionary(kv => kv.Key, kv => Klonen(kv.Value), StringComparer.Ordinal),
        List<object?> l => l.Select(Klonen).ToList(),
        List<string> ls => new List<string>(ls),
        List<short> lsh => new List<short>(lsh),
        _ => wert,
    };

    public static void CacheLeeren()
    {
        lock (Sperre)
        {
            LeseMerk.Clear();
            LeseStand = null;
            LeseStandTicks = 0;
        }
    }

    public static object? Invoke(string bank, string operation, Dictionary<string, object?>? data = null, string? konfigDensIni = null)
    {
        lock (Sperre)
        {
            if (!LeseOperationen.Contains(operation))
            {
                LeseMerk.Clear();
                try { return InvokeDirekt(bank, operation, data, konfigDensIni); }
                finally { LeseMerk.Clear(); }
            }
            var jetzt = Environment.TickCount64;
            if (jetzt - LeseStandTicks > 250)
            {
                var stand = BankStand(bank);
                if (stand is null || stand != LeseStand) LeseMerk.Clear();
                LeseStand = stand;
                LeseStandTicks = jetzt;
            }
            var key = bank + "|" + operation + "|" + (data is null ? "{}" : JsonSerializer.Serialize(new SortedDictionary<string, object?>(data, StringComparer.Ordinal)));
            if (!LeseMerk.TryGetValue(key, out var treffer))
            {
                if (LeseMerk.Count > 400) LeseMerk.Clear();
                var vorher = LeseStand;
                var ergebnis = InvokeDirekt(bank, operation, data, konfigDensIni);
                if (vorher is null || BankStand(bank) != vorher)
                {
                    LeseStandTicks = 0;
                    return ergebnis;
                }
                LeseMerk[key] = ergebnis;
                treffer = ergebnis;
            }
            return Klonen(treffer);
        }
    }

    static object? InvokeDirekt(string bank, string operation, Dictionary<string, object?>? data, string? konfigDensIni)
    {
        var config = DensPfad.InstallationConfig(konfigDensIni);
        if (!string.Equals(Path.GetFullPath(bank).TrimEnd('\\'), Path.GetFullPath(config.Bank).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            throw new DensReadError("Datenbankpfad stimmt nicht mit dem gewählten DENS-Mandanten überein.");
        var lmCfg = DensPfad.LockManagerConfig(konfigDensIni);
        var payload = data is null ? new Dictionary<string, object?>(StringComparer.Ordinal) : new Dictionary<string, object?>(data, StringComparer.Ordinal);
        payload["lockManagerType"] = lmCfg.LockManagerType;
        payload["lockManagerAddress"] = lmCfg.LockManagerAddress;
        payload["tasksUser"] = Environment.GetEnvironmentVariable("DENS_USER") ?? "dens";
        var temp = Path.Combine(Path.GetTempPath(), "dens-connector-" + Guid.NewGuid().ToString("N")[..12]);
        Directory.CreateDirectory(temp);
        payload["tempPath"] = temp;
        try
        {
            var inst = new DensNative();
            return inst.Run(config.Module, bank, operation, payload);
        }
        catch (DensReadError) { throw; }
        catch (Exception exc) { throw new DensReadError(exc.Message); }
        finally
        {
            try { Directory.Delete(temp, true); } catch { }
        }
    }

    object? Run(string module, string bank, string op, Dictionary<string, object?> data)
    {
        var opened = false;
        try
        {
            if (!SetDllDirectory(module)) throw new Exception("DLL-Pfad nicht verfügbar.");
            var folder = Path.GetFullPath(bank).TrimEnd('\\') + "\\";
            Check(d_opentaskA(out task), "Task");
            Check(d_dbuseridA("cx" + Guid.NewGuid().ToString("N")[..12], task), "Benutzer");
            Check(d_dbdpathA(folder, task), "Schema-Pfad");
            Check(d_dbfpathA(folder, task), "Daten-Pfad");
            Check(d_dbtafA(folder, task), "TAF-Pfad");
            var tempPath = data.TryGetValue("tempPath", out var tp) && tp is string tps ? tps.TrimEnd('\\') + "\\" : folder;
            Check(d_dbtmpA(tempPath, task), "Temp-Pfad");
            Check(d_on_optA(256, task), "Option");
            var mode = Environment.GetEnvironmentVariable("DENS_OPEN_MODE") ?? "s";
            if (mode != "s" && !folder.Contains("dens-stage", StringComparison.OrdinalIgnoreCase))
                throw new Exception("Ungeteilter Zugriff ist nur für die Probe erlaubt.");
            if (mode == "s")
            {
                var lm = Convert.ToInt32(data["lockManagerType"]);
                var address = Convert.ToString(data["lockManagerAddress"]) ?? "";
                if (lm is not (3 or 6)) throw new Exception("Nicht unterstützter DENS-Lockmanager: " + lm);
                var root = Path.GetPathRoot(folder) ?? @"C:\";
                if (lm == 3 && GetDriveType(root) == 4) throw new Exception("Netzwerkdatenbank verlangt den DENS-TCP-Lockmanager (Typ 6).");
                if (lm == 6 && string.IsNullOrWhiteSpace(address)) throw new Exception("TCP-Lockmanageradresse fehlt.");
                var comm = psp_lmcFindA(lm == 3 ? "Internal" : "TCP");
                if (comm == IntPtr.Zero) throw new Exception("Lockmanager-Treiber fehlt.");
                Check(d_lockcommA(comm, task), "Lock-Manager");
                if (lm == 6) Check(d_lockmgrA(address, task), "TCP-Lockmanageradresse");
            }
            Check(d_openA("DENSOF", mode, task), "Datenbank öffnen");
            opened = true;
            return op switch
            {
                "list" => ListLocked(),
                "patient" => GetPatient(data),
                "hkp" or "befund" or "waitroom" => Clinical(data, op),
                "dashboard" => Dashboard(data),
                "clinical-list" => ClinicalList(data),
                "open-plans" => OpenPlans(),
                "kva" => Kva(data),
                "kva-list" => KvaList(data),
                "service-catalog" => ServiceCatalog(data),
                "service-catalog-add" => ServiceCatalogAdd(data),
                "privat-hkp" => PrivatHkp(data),
                "documentation" => Dokumentation(data),
                "leistung" => Leistung(data),
                "lab-catalog" => LabCatalog(),
                "lab-catalog-add" => LabCatalogAdd(data),
                "create" or "update" => Write(data, op == "create"),
                "records" => Records(data),
                _ => throw new Exception("Unbekannter Vorgang."),
            };
        }
        finally
        {
            if (opened) d_closeA(task);
            if (task != IntPtr.Zero) d_closetaskA(task);
        }
    }

    static void Check(int r, string op) { if (r != 0) throw new Exception(op + ": RDM-Code " + r); }
    static string Text(byte[] b, int o, int n) => DensPfad.Cp1252.GetString(b, o, n).Split('\0')[0].Trim();
    static string Feld(byte[] b, int o, int n) => DensPfad.Cp1252.GetString(b, o, n).Split('\0')[0].TrimEnd(' ');

    static void Put(byte[] b, int o, int n, string v)
    {
        var x = DensPfad.Cp1252Strict.GetBytes(v);
        if (x.Length >= n) throw new Exception("Feld zu lang: " + v);
        Array.Clear(b, o, n);
        x.CopyTo(b, o);
    }

    byte[] Read(int size)
    {
        var b = new byte[size];
        Check(d_recreadA(b, task, 0), "Lesen");
        return b;
    }

    int RecordSize(int rec)
    {
        var table = Marshal.ReadIntPtr(task, 0xe0c);
        return Marshal.ReadInt16(table, rec * 14 + 2) - Marshal.ReadInt16(table, rec * 14 + 4);
    }

    List<byte[]> RawRows(int rec)
    {
        var rows = new List<byte[]>();
        var rc = d_recfrstA(10000 + rec, task, 0);
        while (rc == 0)
        {
            rows.Add(Read(RecordSize(rec)));
            rc = d_recnextA(task, 0);
        }
        if (rc != 2) Check(rc, "Datensatzliste");
        return rows;
    }

    static void DateBytes(byte[] b, int offset, DateTime date)
    {
        b[offset] = (byte)date.Day;
        b[offset + 1] = (byte)date.Month;
        BitConverter.GetBytes((ushort)date.Year).CopyTo(b, offset + 2);
    }

    static string TaskDate(byte[] b, int o)
    {
        try { return new DateTime(BitConverter.ToUInt16(b, o + 2), b[o + 1], b[o]).ToString("yyyy-MM-dd"); }
        catch (ArgumentOutOfRangeException) { return ""; }
    }

    static Dictionary<string, object?> Patient(byte[] b)
    {
        var year = BitConverter.ToUInt16(b, 182);
        var birth = "";
        try { birth = new DateTime(year, b[181], b[180]).ToString("yyyy-MM-dd"); }
        catch (ArgumentOutOfRangeException) { }
        var idStr = BitConverter.ToUInt32(b, 0).ToString();
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["id"] = idStr, ["patientNumber"] = idStr,
            ["title"] = Text(b, 4, 16), ["lastName"] = Text(b, 42, 46), ["firstName"] = Text(b, 88, 46),
            ["birthDate"] = birth, ["postalCode"] = Text(b, 188, 12),
            ["phone"] = Text(b, 420, 32), ["phone2"] = Text(b, 452, 32),
            ["street"] = Text(b, 484, 48), ["city"] = Text(b, 532, 80), ["insurance"] = "",
        };
    }

    List<object?> ListLocked()
    {
        try
        {
            Check(d_reclockA(10004, "r", task, 0), "Patienten lesen sperren");
            Check(d_reclockA(10005, "r", task, 0), "Kassen lesen sperren");
            Check(d_reclockA(10006, "r", task, 0), "Status lesen sperren");
            return List().Cast<object?>().ToList();
        }
        finally { d_freeallA(task); }
    }

    List<Dictionary<string, object?>> List()
    {
        var items = new List<Dictionary<string, object?>>();
        var rc = d_recfrstA(10004, task, 0);
        while (rc == 0)
        {
            var b = Read(680);
            Check(d_crgetA(out var address, task, 0), "Adresse");
            var p = Patient(b);
            p["insuranceStatusQuarter"] = "";
            Check(d_setorA(20008, task, 0), "Kasseneigentümer");
            var child = d_findfmA(20008, task, 0);
            if (child == 0)
            {
                var ins = Read(264);
                p["insurance"] = Text(ins, 0, 46);
                p["insuranceType"] = Text(ins, 106, 2);
                p["insuranceNumber"] = Text(ins, 144, 14);
                p["insuranceIk"] = Text(ins, 160, 10);
                Check(d_setorA(20010, task, 0), "Status-Eigentümer");
                var sr = d_findlmA(20010, task, 0);
                if (sr == 0) p["insuranceStatusQuarter"] = Text(Read(24), 0, 10);
                else if (sr is not (1 or 2)) Check(sr, "Quartalsstatus lesen");
            }
            else if (child is not (1 or 2)) Check(child, "Kasse lesen");
            Check(d_crsetA(ref address, task, 0), "Patient wiederherstellen");
            items.Add(p);
            rc = d_recnextA(task, 0);
        }
        if (rc != 2) Check(rc, "Patientenliste");
        return items;
    }

    object? GetPatient(Dictionary<string, object?> data)
    {
        try
        {
            Check(d_reclockA(10004, "r", task, 0), "Patient lesen");
            Check(d_reclockA(10005, "r", task, 0), "Kasse lesen");
            Check(d_reclockA(10006, "r", task, 0), "Status lesen");
            var id = uint.Parse(Convert.ToString(data["id"])!);
            var rc = d_keyfindA(4000, BitConverter.GetBytes(id), task, 0);
            if (rc == 2) return null;
            Check(rc, "Patient finden");
            var b = Read(680);
            var p = Patient(b);
            p["insuranceStatusQuarter"] = "";
            Check(d_setorA(20008, task, 0), "Kasseneigentümer");
            var child = d_findfmA(20008, task, 0);
            if (child == 0)
            {
                var ins = Read(264);
                p["insurance"] = Text(ins, 0, 46);
                p["insuranceType"] = Text(ins, 106, 2);
                p["insuranceNumber"] = Text(ins, 144, 14);
                p["insuranceIk"] = Text(ins, 160, 10);
                Check(d_setorA(20010, task, 0), "Status-Eigentümer");
                var sr = d_findlmA(20010, task, 0);
                if (sr == 0) p["insuranceStatusQuarter"] = Text(Read(24), 0, 10);
                else if (sr is not (1 or 2)) Check(sr, "Quartalsstatus lesen");
            }
            else if (child is not (1 or 2)) Check(child, "Kasse lesen");
            return p;
        }
        finally { d_freeallA(task); }
    }

    static void Fields(byte[] b, Dictionary<string, object?> data)
    {
        string[] names = ["title", "lastName", "firstName", "postalCode", "phone", "phone2", "street", "city"];
        int[] offsets = [4, 42, 88, 188, 420, 452, 484, 532];
        int[] widths = [16, 46, 46, 12, 32, 32, 48, 80];
        for (var i = 0; i < names.Length; i++)
            if (data.TryGetValue(names[i], out var v)) Put(b, offsets[i], widths[i], Convert.ToString(v) ?? "");
        if (data.TryGetValue("birthDate", out var bd))
        {
            var s = Convert.ToString(bd) ?? "";
            if (s.Length == 0) { Array.Clear(b, 180, 4); return; }
            var date = DateTime.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            b[180] = (byte)date.Day;
            b[181] = (byte)date.Month;
            BitConverter.GetBytes((ushort)date.Year).CopyTo(b, 182);
        }
    }

    static byte[] Insurance(uint id)
    {
        var ins = new byte[264];
        Put(ins, 0, 46, "AOK Nordost >Berlin");
        Put(ins, 46, 8, "9719018");
        Put(ins, 54, 52, "DUMMY" + id.ToString("D6"));
        Put(ins, 106, 2, "K");
        Put(ins, 108, 6, "1000");
        Put(ins, 114, 4, "1");
        var date = DateTime.Today;
        ins[124] = 1;
        ins[125] = (byte)(((date.Month - 1) / 3) * 3 + 1);
        BitConverter.GetBytes((ushort)date.Year).CopyTo(ins, 126);
        Put(ins, 134, 6, "36251");
        Put(ins, 140, 4, "D");
        Put(ins, 144, 14, "156971901830");
        Put(ins, 160, 10, "123456789");
        return ins;
    }

    void AddQuarterStatus()
    {
        Check(d_setorA(20010, task, 0), "Status-Eigentümer");
        var status = new byte[24];
        var date = DateTime.Today;
        Put(status, 0, 10, date.ToString("yy") + (((date.Month - 1) / 3) + 1));
        Check(d_fillnewA(10006, status, task, 0), "Quartalsstatus anlegen");
        Check(d_connectA(20010, task, 0), "Quartalsstatus verknüpfen");
    }

    object Write(Dictionary<string, object?> data, bool create)
    {
        var transaction = false;
        try
        {
            Check(d_trbeginA("connector", task), "Transaktion");
            transaction = true;
            Check(d_reclockA(10004, "w", task, 0), "Patientensperre");
            Check(d_reclockA(10005, "w", task, 0), "Kassensperre");
            byte[] b;
            uint id;
            if (create)
            {
                Check(d_reclockA(10006, "w", task, 0), "Status-Sperre");
                uint max = 0;
                foreach (var p in List()) max = Math.Max(max, uint.Parse((string)p["id"]!));
                id = checked(max + 1);
                b = new byte[680];
                BitConverter.GetBytes(id).CopyTo(b, 0);
                Fields(b, data);
                Put(b, 184, 4, Convert.ToString(data["title"]) == "Frau" ? "W" : "M");
                Check(d_fillnewA(10004, b, task, 0), "Patient anlegen");
                Check(d_setorA(20008, task, 0), "Kasseneigentümer");
                Check(d_fillnewA(10005, Insurance(id), task, 0), "Kasse anlegen");
                Check(d_connectA(20008, task, 0), "Kasse verknüpfen");
                AddQuarterStatus();
            }
            else
            {
                id = uint.Parse(Convert.ToString(data["id"])!);
                Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Patient finden");
                b = Read(680);
                if (data.TryGetValue("expected", out var expObj) && expObj is Dictionary<string, object?> expected)
                {
                    var current = Patient(b);
                    foreach (var field in expected)
                        if (Convert.ToString(current[field.Key]) != Convert.ToString(field.Value))
                            throw new Exception("Patient wurde zwischenzeitlich geändert. Bitte neu öffnen.");
                }
                if (data.TryGetValue("birthDate", out var bdObj) && Convert.ToString(bdObj) is { Length: > 0 } bds
                    && DateTime.ParseExact(bds, "yyyy-MM-dd", CultureInfo.InvariantCulture) > DateTime.Today)
                    throw new Exception("Geburtsdatum darf nicht in der Zukunft liegen.");
                Check(d_crgetA(out var patientAddr, task, 0), "Patientenadresse");
                Check(d_setorA(20008, task, 0), "Kasse prüfen");
                var insuranceRc = d_findfmA(20008, task, 0);
                if (insuranceRc == 0)
                {
                    var ins = Read(264);
                    if (Text(ins, 106, 2) == "K" && (Text(ins, 0, 46) == "" || Text(ins, 144, 14) == ""))
                        throw new Exception("Kassenpatient benötigt eine gültige Krankenkasse. Bitte in DENSoffice ergänzen.");
                }
                else if (insuranceRc is not (1 or 2)) Check(insuranceRc, "Kasse prüfen");
                Check(d_crsetA(ref patientAddr, task, 0), "Patient wählen");
                Fields(b, data);
                Check(d_recwriteA(b, task, 0), "Patient ändern");
            }
            Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Nummernindex prüfen");
            var key = new byte[96];
            Array.Copy(b, 42, key, 0, 46);
            Array.Copy(b, 88, key, 46, 46);
            Array.Copy(b, 180, key, 92, 4);
            Check(d_keyfindA(4041, key, task, 0), "Namensindex prüfen");
            Check(d_trendA(task), "Commit");
            transaction = false;
            return new Dictionary<string, object?> { ["id"] = id.ToString(), ["created"] = create };
        }
        finally
        {
            if (transaction) d_trabortA(task);
            d_freeallA(task);
        }
    }

    object Records(Dictionary<string, object?> data)
    {
        var rec = Convert.ToInt32(data["record"]);
        if (rec < 0 || rec >= 144) throw new Exception("Record außerhalb Schema.");
        var size = RecordSize(rec);
        var grenze = data.TryGetValue("max", out var m) && m is not null ? Convert.ToInt32(m) : 100;
        Check(d_reclockA(10000 + rec, "r", task, 0), "Record lesen sperren");
        var rows = new List<object?>();
        try
        {
            var rc = d_recfrstA(10000 + rec, task, 0);
            while (rc == 0 && rows.Count < grenze)
            {
                Check(d_crgetA(out var address, task, 0), "Recordadresse");
                rows.Add(new Dictionary<string, object?> { ["address"] = address, ["data"] = Convert.ToBase64String(Read(size)) });
                rc = d_recnextA(task, 0);
            }
            if (rc is not (0 or 2)) Check(rc, "Recordliste");
            return rows;
        }
        finally { d_freeallA(task); }
    }

    int OffenerPreis(uint eintrag)
    {
        var a = eintrag;
        Check(d_crsetA(ref a, task, 0), "Katalogeintrag wählen");
        Check(d_setorA(20063, task, 0), "Preis-Eigentümer");
        var cents = 0;
        var rc = d_findfmA(20063, task, 0);
        while (rc == 0)
        {
            var p = Read(RecordSize(97));
            if (BitConverter.ToInt32(p, 4) == -1) cents = BitConverter.ToInt32(p, 12);
            rc = d_findnmA(20063, task, 0);
        }
        if (rc is not (1 or 2)) Check(rc, "Katalogpreise lesen");
        return cents;
    }

    object LabCatalog()
    {
        try
        {
            Check(d_reclockA(10096, "r", task, 0), "Laborkatalog lesen sperren");
            Check(d_reclockA(10097, "r", task, 0), "Katalogpreise lesen sperren");
            var rows = new List<object?>();
            var rc = d_recfrstA(10096, task, 0);
            while (rc == 0)
            {
                Check(d_crgetA(out var address, task, 0), "Katalogadresse");
                var b = Read(RecordSize(96));
                rows.Add(new Dictionary<string, object?>
                {
                    ["code"] = Text(b, 0, 8), ["text"] = Text(b, 16, 120),
                    ["address"] = address, ["data"] = Convert.ToBase64String(b),
                });
                rc = d_recnextA(task, 0);
            }
            if (rc != 2) Check(rc, "Laborkatalog lesen");
            foreach (var d in rows.OfType<Dictionary<string, object?>>())
                d["cents"] = OffenerPreis(Convert.ToUInt32(d["address"]));
            return rows;
        }
        finally { d_freeallA(task); }
    }

    bool PreisSichern(uint eintrag, int cents)
    {
        var e = eintrag;
        Check(d_crsetA(ref e, task, 0), "Katalogeintrag wählen");
        Check(d_setorA(20063, task, 0), "Preis-Eigentümer");
        var preise = new List<uint>();
        var rc = d_findfmA(20063, task, 0);
        while (rc == 0)
        {
            Check(d_crgetA(out var a, task, 0), "Preisadresse");
            preise.Add(a);
            rc = d_findnmA(20063, task, 0);
        }
        if (rc is not (1 or 2)) Check(rc, "Katalogpreise lesen");
        if (preise.Count == 0)
        {
            var p = new byte[RecordSize(97)];
            BitConverter.GetBytes(-1).CopyTo(p, 4);
            BitConverter.GetBytes((short)1).CopyTo(p, 8);
            BitConverter.GetBytes(cents).CopyTo(p, 12);
            e = eintrag;
            Check(d_crsetA(ref e, task, 0), "Katalogeintrag wählen");
            Check(d_setorA(20063, task, 0), "Preis-Eigentümer");
            Check(d_fillnewA(10097, p, task, 0), "Katalogpreis anlegen");
            Check(d_connectA(20063, task, 0), "Katalogpreis verknüpfen");
            return true;
        }
        var geaendert = false;
        foreach (var a0 in preise)
        {
            var a = a0;
            Check(d_crsetA(ref a, task, 0), "Preis wählen");
            var p = Read(RecordSize(97));
            if (BitConverter.ToInt32(p, 4) == -1 && BitConverter.ToInt32(p, 0) != 0)
            {
                BitConverter.GetBytes(0).CopyTo(p, 0);
                Check(d_recwriteA(p, task, 0), "Katalogpreis öffnen");
                geaendert = true;
            }
        }
        return geaendert;
    }

    object LabCatalogAdd(Dictionary<string, object?> data)
    {
        var tx = false;
        var added = new List<string>();
        try
        {
            Check(d_trbeginA("labkat", task), "Laborkatalog-Transaktion");
            tx = true;
            Check(d_reclockA(10096, "w", task, 0), "Laborkatalog sperren");
            Check(d_reclockA(10097, "w", task, 0), "Katalogpreise sperren");
            var vorhanden = new Dictionary<string, uint>(StringComparer.Ordinal);
            var rc = d_recfrstA(10096, task, 0);
            while (rc == 0)
            {
                Check(d_crgetA(out var adr, task, 0), "Katalogadresse");
                var k = Text(Read(RecordSize(96)), 0, 8);
                vorhanden.TryAdd(k, adr);
                rc = d_recnextA(task, 0);
            }
            if (rc != 2) Check(rc, "Laborkatalog lesen");
            foreach (var value in (IEnumerable)data["entries"]!)
            {
                var e = (Dictionary<string, object?>)value!;
                var code = (Convert.ToString(e["code"]) ?? "").Trim();
                var art = Convert.ToInt16(e["art"]);
                var typ = e.TryGetValue("typ", out var tv) && tv is not null ? Convert.ToInt16(tv) : (short)31;
                if (code.Length == 0 || !((typ == 31 && (art == 1 || art == 2)) || ((typ == 32 || typ == 33) && art == 0)))
                    throw new Exception("Ungültiger Katalogeintrag: " + code);
                var cents = e.TryGetValue("cents", out var cv) && cv is not null ? Convert.ToInt32(cv) : 0;
                if (vorhanden.TryGetValue(code, out var adrAlt))
                {
                    if (PreisSichern(adrAlt, cents)) added.Add(code);
                    continue;
                }
                var b = new byte[RecordSize(96)];
                Put(b, 0, 8, code);
                BitConverter.GetBytes(0).CopyTo(b, 8);
                BitConverter.GetBytes(-1).CopyTo(b, 12);
                Put(b, 16, 128, Convert.ToString(e["text"]) ?? "");
                BitConverter.GetBytes(typ).CopyTo(b, 644);
                BitConverter.GetBytes(art).CopyTo(b, 646);
                Check(d_fillnewA(10096, b, task, 0), "Katalogeintrag " + code + " anlegen");
                Check(d_crgetA(out var neu, task, 0), "Katalogadresse " + code);
                PreisSichern(neu, cents);
                vorhanden[code] = neu;
                added.Add(code);
            }
            Check(d_trendA(task), "Laborkatalog speichern");
            tx = false;
            return added;
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }

    void ModulSperre(uint id)
    {
        Check(d_reclockA(10078, "r", task, 0), "Modulsperren lesen");
        foreach (var b in RawRows(78))
            if (BitConverter.ToUInt32(b, 4) == id && BitConverter.ToInt16(b, 0) != 104)
                throw new Exception($"Patient ist in DENSoffice in Bearbeitung (Modul {BitConverter.ToInt16(b, 0)}, Arbeitsplatz {Text(b, 8, 6)}). Bitte dort schließen und erneut senden.");
    }

    SortedDictionary<int, byte[]> AktuelleZaehne(List<byte[]> heads, uint id)
    {
        var eigene = heads.Where(row => BitConverter.ToUInt32(row, 0) == id).ToList();
        string Stempel(byte[] row) => TaskDate(row, 12) + row[18].ToString("D2") + row[17].ToString("D2") + row[16].ToString("D2") + ((ushort)BitConverter.ToInt16(row, 4)).ToString("D5");
        eigene.Sort((a, b) => string.CompareOrdinal(Stempel(b), Stempel(a)));
        foreach (var row in eigene)
        {
            var key = new byte[6];
            Array.Copy(row, key, 6);
            Check(d_keyfindA(35016, key, task, 0), "Befund auswählen");
            Check(d_setorA(20025, task, 0), "Befundeigentümer setzen");
            var teeth = new List<byte[]>();
            var rc = d_findfmA(20025, task, 0);
            while (rc == 0)
            {
                teeth.Add(Read(92));
                rc = d_findnmA(20025, task, 0);
            }
            if (rc is not (1 or 2)) Check(rc, "Befund lesen");
            var art = BitConverter.ToInt16(row, 20);
            var nurFehlend = teeth.Count < 32 && teeth.All(t => (BitConverter.ToUInt16(t, 4) & 0x000f) == 4);
            if ((art == 2 || art == 3) && nurFehlend) continue;
            var result = new SortedDictionary<int, byte[]>();
            foreach (var t in teeth)
            {
                var tooth = BitConverter.ToInt16(t, 0);
                if (tooth / 10 < 1 || tooth / 10 > 4 || tooth % 10 < 1 || tooth % 10 > 8 || result.ContainsKey(tooth))
                    return new SortedDictionary<int, byte[]>();
                result[tooth] = t;
            }
            return result;
        }
        return new SortedDictionary<int, byte[]>();
    }

    short AddPlanFinding(Dictionary<string, object?> data, uint id, short plan, string provider, DateTime now, short kind)
    {
        var heads = RawRows(35);
        short number = 0;
        foreach (var b in heads)
            if (BitConverter.ToUInt32(b, 0) == id) number = Math.Max(number, BitConverter.ToInt16(b, 4));
        number = checked((short)(number + 1));
        var gebiss = data.TryGetValue("planFindingFull", out var pff) && Convert.ToBoolean(pff) ? AktuelleZaehne(heads, id) : new SortedDictionary<int, byte[]>();
        var head = Convert.FromBase64String(Convert.ToString(data["planFinding"])!);
        if (head.Length != 46 || BitConverter.ToInt16(head, 20) != kind) throw new Exception("Ungültige Prothetikbefund-Vorlage.");
        BitConverter.GetBytes(id).CopyTo(head, 0);
        BitConverter.GetBytes(number).CopyTo(head, 4);
        Put(head, 6, 6, provider);
        DateBytes(head, 12, now);
        head[16] = (byte)now.Second;
        head[17] = (byte)now.Minute;
        head[18] = (byte)now.Hour;
        BitConverter.GetBytes(plan).CopyTo(head, 22);
        Check(d_fillnewA(10035, head, task, 0), "Prothetikbefund anlegen");
        Check(d_setorA(20025, task, 0), "Prothetikbefundeigentümer");
        var voll = gebiss.Count > 0;
        var zaehne = new List<byte[]>();
        foreach (var value in (IEnumerable)data["planTeeth"]!)
        {
            var tooth = Convert.FromBase64String(Convert.ToString(value)!);
            if (tooth.Length != 92) throw new Exception("Ungültiger Planzahnbefund.");
            gebiss[BitConverter.ToInt16(tooth, 0)] = tooth;
            zaehne.Add(tooth);
        }
        if (zaehne.Count == 0) throw new Exception("Prothetikbefund benötigt Zahneinträge.");
        if (voll) zaehne = new List<byte[]>(gebiss.Values);
        writtenPlanTeeth.Clear();
        foreach (var tooth in zaehne)
        {
            Check(d_fillnewA(10036, tooth, task, 0), "Planzahn anlegen");
            Check(d_connectA(20025, task, 0), "Planzahn verknüpfen");
            writtenPlanTeeth.Add(Convert.ToBase64String(tooth));
        }
        var key = new byte[6];
        Array.Copy(head, key, 6);
        Check(d_keyfindA(35016, key, task, 0), "Prothetikbefund-Index prüfen");
        return number;
    }

    static readonly int[] Order = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48];

    static void ValidateHkpTemplate(Dictionary<string, object?> data)
    {
        var plan = Convert.FromBase64String(Convert.ToString(data["plan"])!);
        var missing = new HashSet<int>();
        for (var i = 0; i < 32; i++) if (Text(plan, 418 + i * 4, 4) == "f") missing.Add(Order[i]);
        var teeth = new HashSet<int>();
        foreach (var value in (IEnumerable)data["planTeeth"]!)
        {
            var b = Convert.FromBase64String(Convert.ToString(value)!);
            if (b.Length != 92 || BitConverter.ToUInt16(b, 4) != 4 || !teeth.Add(BitConverter.ToInt16(b, 0)))
                throw new Exception("Ungültiger Dummy-Planzahnbefund.");
        }
        if (!missing.SetEquals(teeth)) throw new Exception("Planschema und Prothetikbefund stimmen nicht überein.");
        ValidateHkpLaboratory(data, plan);
    }

    static void ValidateHkpImport(Dictionary<string, object?> data)
    {
        var plan = Convert.FromBase64String(Convert.ToString(data["plan"])!);
        var missing = new HashSet<int>();
        for (var i = 0; i < 32; i++) if (Text(plan, 418 + i * 4, 4) == "f") missing.Add(Order[i]);
        var teeth = new HashSet<int>();
        if (data.TryGetValue("planTeeth", out var pt) && pt is IEnumerable ptEnum)
            foreach (var value in ptEnum)
            {
                var b = Convert.FromBase64String(Convert.ToString(value)!);
                if (b.Length != 92 || BitConverter.ToUInt16(b, 4) != 4 || !teeth.Add(BitConverter.ToInt16(b, 0)))
                    throw new Exception("Ungültiger Planzahnbefund.");
            }
        if (!missing.SetEquals(teeth)) throw new Exception("Planschema und Prothetikbefund stimmen nicht überein.");
        if (missing.Count > 0 && (!data.TryGetValue("planFinding", out var pf) || Convert.FromBase64String(Convert.ToString(pf)!).Length != 46 || BitConverter.ToInt16(Convert.FromBase64String(Convert.ToString(pf)!), 20) != 3))
            throw new Exception("Prothetikbefund für fehlende Zähne fehlt.");
        if (missing.Count == 0 && data.ContainsKey("planFinding"))
            throw new Exception("Prothetikbefund ohne fehlende Zähne unzulässig.");
        ValidateHkpLaboratory(data, plan);
    }

    static void ValidateHkpLaboratory(Dictionary<string, object?> data, byte[] plan)
    {
        var lab = Convert.FromBase64String(Convert.ToString(data["labPlan"])!);
        if (lab.Length != 62 || BitConverter.ToInt16(lab, 6) != 1 || BitConverter.ToInt16(lab, 60) != 2
            || BitConverter.ToUInt32(lab, 0) != 0 || BitConverter.ToInt16(lab, 4) != 0 || BitConverter.ToUInt32(lab, 12) != 0)
            throw new Exception("Ungültige Euro-Laborplanvorlage.");
        decimal net = 0;
        var count = 0;
        foreach (var value in (IEnumerable)data["labServices"]!)
        {
            var b = Convert.FromBase64String(Convert.ToString(value)!);
            if (b.Length != 72 || BitConverter.ToInt32(b, 52) <= 0 || BitConverter.ToInt32(b, 60) < 0 || BitConverter.ToInt16(b, 64) != 700)
                throw new Exception("Ungültige Laborposition.");
            net += BitConverter.ToInt32(b, 52) * (decimal)BitConverter.ToInt32(b, 60) / 100;
            count++;
        }
        if (count == 0) throw new Exception("Laborplanung benötigt Positionen.");
        var tax = Math.Round(net * 0.07m, 0, MidpointRounding.AwayFromZero);
        var estimate = checked((int)Math.Round((net + tax) * (100 + BitConverter.ToInt16(lab, 18)) / 100, 0, MidpointRounding.AwayFromZero));
        if (estimate != BitConverter.ToInt32(plan, 84)) throw new Exception("Laborpositionen und HKP-Kostenschätzung stimmen nicht überein.");
    }

    short AddLabPlan(Dictionary<string, object?> data, uint id, short plan, string provider, DateTime now)
    {
        short number = 0;
        foreach (var rec in new[] { 57, 59, 60 })
            foreach (var row in RawRows(rec))
                if (BitConverter.ToUInt32(row, 0) == id) number = Math.Max(number, BitConverter.ToInt16(row, 4));
        number = checked((short)(number + 1));
        var head = Convert.FromBase64String(Convert.ToString(data["labPlan"])!);
        BitConverter.GetBytes(id).CopyTo(head, 0);
        BitConverter.GetBytes(number).CopyTo(head, 4);
        BitConverter.GetBytes(plan).CopyTo(head, 8);
        DateBytes(head, 12, now);
        Put(head, 20, 40, "Laborplanung zum Prothetikplan " + plan);
        Check(d_fillnewA(10057, head, task, 0), "Laborplan anlegen");
        Check(d_setorA(20040, task, 0), "Laborplan-Eigentümer");
        foreach (var value in (IEnumerable)data["labServices"]!)
        {
            var b = Convert.FromBase64String(Convert.ToString(value)!);
            Put(b, 0, 6, provider);
            DateBytes(b, 8, now);
            Check(d_fillnewA(10055, b, task, 0), "Laborposition anlegen");
            Check(d_connectA(20040, task, 0), "Laborposition verknüpfen");
        }
        return number;
    }

    object Clinical(Dictionary<string, object?> data, string kind)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        var rec = kind == "hkp" ? 61 : kind == "befund" ? 35 : 54;
        var tx = false;
        var writtenTeeth = new List<object?>();
        var writtenServices = new List<object?>();
        var writtenPlan = "";
        short planFindingNumber = 0;
        short baseNumber = 0;
        try
        {
            Check(d_trbeginA("clinical", task), "Transaktion");
            tx = true;
            Check(d_reclockA(10004, "r", task, 0), "Patient lesen sperren");
            var locks = rec == 61 ? new[] { 35, 36, 55, 57, 59, 60, 61, 64, 65 } : rec == 35 ? new[] { 35, 36 } : new[] { 54 };
            foreach (var locked in locks) Check(d_reclockA(10000 + locked, "w", task, 0), "Klinische Anlage sperren");
            Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Patient finden");
            var patient = Read(680);
            var provider = Text(patient, 212, 6);
            if (provider.Length == 0) provider = "Dens";
            if (kind is "befund" or "hkp") ModulSperre(id);
            var rows = RawRows(rec);
            short number = 0;
            foreach (var row in rows)
                if (BitConverter.ToUInt32(row, 0) == id)
                {
                    if (rec == 54)
                    {
                        Check(d_trendA(task), "Wartezimmer unverändert");
                        tx = false;
                        return new Dictionary<string, object?> { ["id"] = id.ToString(), ["kind"] = kind, ["alreadyPresent"] = true };
                    }
                    number = Math.Max(number, BitConverter.ToInt16(row, 4));
                }
            var previousTeeth = new List<byte[]>();
            if (rec == 35 && rows.Count > 0)
            {
                byte[]? latest = null;
                var latestStamp = "";
                foreach (var row in rows)
                    if (BitConverter.ToUInt32(row, 0) == id && BitConverter.ToInt16(row, 20) == 1)
                    {
                        var stamp = TaskDate(row, 12) + row[18].ToString("D2") + row[17].ToString("D2") + row[16].ToString("D2");
                        if (latest is null || string.CompareOrdinal(stamp, latestStamp) > 0 || (stamp == latestStamp && BitConverter.ToInt16(row, 4) > BitConverter.ToInt16(latest, 4)))
                        {
                            latest = row;
                            latestStamp = stamp;
                        }
                    }
                if (latest is not null)
                {
                    baseNumber = BitConverter.ToInt16(latest, 4);
                    var key = new byte[6];
                    Array.Copy(latest, key, 6);
                    Check(d_keyfindA(35016, key, task, 0), "Aktuellen Befund auswählen");
                    Check(d_setorA(20025, task, 0), "Aktuellen Befundeigentümer setzen");
                    var rc = d_findfmA(20025, task, 0);
                    while (rc == 0) { previousTeeth.Add(Read(92)); rc = d_findnmA(20025, task, 0); }
                    if (rc is not (1 or 2)) Check(rc, "Aktuellen Befund lesen");
                }
            }
            var now = DateTime.Now;
            byte[] b;
            if (rec == 54)
            {
                b = new byte[226];
                BitConverter.GetBytes(id).CopyTo(b, 0);
                b[8] = (byte)now.Second; b[9] = (byte)now.Minute; b[10] = (byte)now.Hour;
                DateBytes(b, 216, now);
                Put(b, 12, 200, "DUMMY Connector");
                Put(b, 220, 6, provider);
                Check(d_fillnewA(10054, b, task, 0), "Wartezimmer anlegen");
            }
            else
            {
                number = checked((short)(number + 1));
                if (rec == 35)
                {
                    b = new byte[46];
                    Put(b, 6, 6, provider);
                    DateBytes(b, 12, now);
                    b[16] = (byte)now.Second; b[17] = (byte)now.Minute; b[18] = (byte)now.Hour;
                    BitConverter.GetBytes((short)1).CopyTo(b, 20);
                }
                else
                {
                    b = Convert.FromBase64String(Convert.ToString(data["plan"])!);
                    if (b.Length != 674 || BitConverter.ToInt16(b, 62) != 2 || BitConverter.ToInt16(b, 130) != 2 || BitConverter.ToUInt32(b, 116) != 0)
                        throw new Exception("HKP benötigt eine nicht abgerechnete Euro-Kassenplanvorlage.");
                    for (var i = 120; i < 126; i++) if (b[i] != 0) throw new Exception("HKP-Vorlage enthält eine nicht übernommene Laborreferenz.");
                    for (var i = 48; i < 60; i++) if (b[i] != 0) throw new Exception("HKP-Vorlage enthält bereits ein Planstatusdatum.");
                    var planr = data.TryGetValue("source", out var src) && Convert.ToString(src) == "planr";
                    if (planr) ValidateHkpImport(data); else ValidateHkpTemplate(data);
                    var title = planr ? (data.TryGetValue("description", out var desc) ? Convert.ToString(desc) ?? "" : "PlanR " + number) : ("DUMMY Connector " + number);
                    if (title.Length > 39) title = title[..39];
                    Put(b, 6, 40, title);
                    DateBytes(b, 52, now);
                    Put(b, 64, 6, provider);
                    BitConverter.GetBytes(AddLabPlan(data, id, number, provider, now)).CopyTo(b, 120);
                }
                BitConverter.GetBytes(id).CopyTo(b, 0);
                BitConverter.GetBytes(number).CopyTo(b, 4);
                Check(d_fillnewA(10000 + rec, b, task, 0), "Kopfsatz anlegen");
                var set = rec == 35 ? 20025 : 20043;
                Check(d_setorA(set, task, 0), "Eigentümer setzen");
                if (rec == 35)
                {
                    var children = new List<byte[]>();
                    if (data.TryGetValue("toothRecords", out var trObj) && trObj is IEnumerable trEnum)
                        foreach (var value in trEnum) children.Add(Convert.FromBase64String(Convert.ToString(value)!));
                    else
                    {
                        var pattern = Convert.FromBase64String(Convert.ToString(data["tooth"])!);
                        if (pattern.Length != 92) throw new Exception("Ungültige Zahnvorlage.");
                        foreach (var value in (IEnumerable)data["teeth"]!)
                        {
                            var child = (byte[])pattern.Clone();
                            BitConverter.GetBytes(checked((short)Convert.ToInt32(value))).CopyTo(child, 0);
                            children.Add(child);
                        }
                    }
                    if (children.Count < 1 || children.Count > 32) throw new Exception("Befund erwartet ein bis 32 Zähne.");
                    var seen = new HashSet<int>();
                    foreach (var child in children)
                    {
                        if (child.Length != 92) throw new Exception("Ungültige Zahnvorlage.");
                        var tooth = BitConverter.ToInt16(child, 0);
                        if (tooth / 10 < 1 || tooth / 10 > 4 || tooth % 10 < 1 || tooth % 10 > 8 || !seen.Add(tooth))
                            throw new Exception("Ungültige oder doppelte Zahnnummer.");
                    }
                    var replace = data.TryGetValue("replaceTeeth", out var rep) && Convert.ToBoolean(rep);
                    var merged = new SortedDictionary<int, byte[]>();
                    foreach (var old in previousTeeth)
                    {
                        var tooth = BitConverter.ToInt16(old, 0);
                        if (merged.ContainsKey(tooth)) throw new Exception("Aktueller Befund enthält doppelte Zahnnummern.");
                        merged[tooth] = (byte[])old.Clone();
                    }
                    foreach (var patch in children)
                    {
                        var tooth = BitConverter.ToInt16(patch, 0);
                        if (!replace && merged.TryGetValue(tooth, out var old))
                        {
                            var flags = BitConverter.ToUInt16(old, 4);
                            var update = BitConverter.ToUInt16(patch, 4);
                            BitConverter.GetBytes((ushort)((flags & ~0x000f) | (update & 0x000f))).CopyTo(old, 4);
                        }
                        else merged[tooth] = patch;
                    }
                    foreach (var child in merged.Values)
                    {
                        Check(d_fillnewA(10036, child, task, 0), "Zahn anlegen");
                        Check(d_connectA(set, task, 0), "Zahn verknüpfen");
                        writtenTeeth.Add(Convert.ToBase64String(child));
                    }
                }
                else
                {
                    var count = 0;
                    foreach (var value in (IEnumerable)data["services"]!)
                    {
                        var child = Convert.FromBase64String(Convert.ToString(value)!);
                        if (child.Length != 106) throw new Exception("Ungültige Leistungsvorlage.");
                        Put(child, 0, 6, provider);
                        Check(d_fillnewA(10064, child, task, 0), "Planleistung anlegen");
                        Check(d_connectA(set, task, 0), "Planleistung verknüpfen");
                        if (BitConverter.ToInt16(child, 88) == 0)
                        {
                            Check(d_setorA(20044, task, 0), "GOZ-Leistungstext-Eigentümer");
                            Check(d_fillnewA(10065, new byte[RecordSize(65)], task, 0), "GOZ-Leistungstext anlegen");
                            Check(d_connectA(20044, task, 0), "GOZ-Leistungstext verknüpfen");
                        }
                        writtenServices.Add(Convert.ToBase64String(child));
                        count++;
                    }
                    if (count == 0) throw new Exception("HKP erwartet Planleistungen.");
                    writtenPlan = Convert.ToBase64String(b);
                    if (data.ContainsKey("planFinding")) planFindingNumber = AddPlanFinding(data, id, number, provider, now, 3);
                }
            }
            var indexKey = new byte[rec == 35 ? 6 : 8];
            int indexField;
            if (rec == 54) { Array.Copy(b, 4, indexKey, 0, 2); Array.Copy(b, 8, indexKey, 4, 4); indexField = 54007; }
            else { Array.Copy(b, 0, indexKey, 0, 6); if (rec == 61) Array.Copy(b, 230, indexKey, 6, 2); indexField = rec == 35 ? 35016 : 61146; }
            Check(d_keyfindA(indexField, indexKey, task, 0), "Nativen Index prüfen");
            Check(d_trendA(task), "Speichern");
            tx = false;
            return new Dictionary<string, object?>
            {
                ["id"] = id.ToString(), ["kind"] = kind, ["number"] = (int)number, ["alreadyPresent"] = false,
                ["baseNumber"] = (int)baseNumber, ["writtenToothRecords"] = writtenTeeth,
                ["writtenPlan"] = writtenPlan, ["writtenServices"] = writtenServices,
                ["planFindingNumber"] = (int)planFindingNumber,
                ["writtenPlanTeeth"] = planFindingNumber != 0 ? writtenPlanTeeth.Cast<object?>().ToList() : new List<object?>(),
            };
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }

    static List<byte[]> ErklaerungPruefen(object? value)
    {
        var saetze = new List<byte[]>();
        foreach (var s in (IEnumerable)value!) saetze.Add(Convert.FromBase64String(Convert.ToString(s)!));
        if (saetze.Count == 0) return saetze;
        var head = saetze[0];
        if (head.Length != 97 || BitConverter.ToInt16(head, 0) != 512 || BitConverter.ToInt32(head, 4) != 0 || head[96] != 0 || saetze.Count > 3)
            throw new Exception("Ungültige Begründung.");
        var laenge = Array.IndexOf(head, (byte)0, 10) - 10;
        if (laenge == 0 || (saetze.Count > 1 && laenge != 86)) throw new Exception("Ungültige Begründung.");
        for (var i = 1; i < saetze.Count; i++)
        {
            var f = saetze[i];
            if (f.Length != 95 || f[94] != 0) throw new Exception("Ungültige Begründungsfortsetzung.");
            var n = Array.IndexOf(f, (byte)0);
            if (n == 0 || (i < saetze.Count - 1 && n != 94)) throw new Exception("Ungültige Begründungsfortsetzung.");
            laenge += n;
        }
        if (BitConverter.ToInt16(head, 8) != laenge + 1) throw new Exception("Begründungslänge stimmt nicht.");
        return saetze;
    }

    void ErklaerungAnlegen(List<byte[]> saetze, int nummer)
    {
        BitConverter.GetBytes(nummer).CopyTo(saetze[0], 4);
        Check(d_fillnewA(10042, saetze[0], task, 0), "Begründung anlegen");
        Check(d_setorA(20029, task, 0), "Begründung-Eigentümer");
        for (var i = 1; i < saetze.Count; i++)
        {
            Check(d_fillnewA(10043, saetze[i], task, 0), "Begründung fortsetzen");
            Check(d_connectA(20029, task, 0), "Begründung verknüpfen");
        }
    }

    List<object?> ReadErklaerung(int nummer, bool pflicht = true)
    {
        var rc = d_recfrstA(10042, task, 0);
        while (rc == 0)
        {
            var b = Read(97);
            if (BitConverter.ToInt16(b, 0) == 512 && BitConverter.ToInt32(b, 4) == nummer)
            {
                var r = new List<object?> { Convert.ToBase64String(b) };
                Check(d_setorA(20029, task, 0), "Begründung-Eigentümer");
                var fr = d_findfmA(20029, task, 0);
                while (fr == 0) { r.Add(Convert.ToBase64String(Read(95))); fr = d_findnmA(20029, task, 0); }
                if (fr is not (1 or 2)) Check(fr, "Begründung lesen");
                return r;
            }
            rc = d_recnextA(task, 0);
        }
        if (rc != 2) Check(rc, "Begründungen lesen");
        if (!pflicht) return new List<object?>();
        throw new Exception("Begründung " + nummer + " fehlt.");
    }

    Dictionary<string, object?> KvaLabor(Dictionary<string, object?> data, uint id, short kva, byte[] kvaHead, string provider)
    {
        var head = Convert.FromBase64String(Convert.ToString(data["labPlan"])!);
        if (head.Length != 62 || BitConverter.ToInt16(head, 6) != 3 || BitConverter.ToInt16(head, 60) != 2)
            throw new Exception("Ungültige Laborplanvorlage.");
        for (var i = 0; i < 60; i++) if (i != 6 && i != 7 && head[i] != 0) throw new Exception("Ungültige Laborplanvorlage.");
        var rows = new List<byte[]>();
        foreach (var value in (IEnumerable)data["labServices"]!)
        {
            var b = Convert.FromBase64String(Convert.ToString(value)!);
            var lab = BitConverter.ToInt16(b, 56);
            var mwst = BitConverter.ToInt16(b, 64);
            if (b.Length != 72 || Text(b, 44, 8) == "" || BitConverter.ToInt32(b, 52) <= 0 || BitConverter.ToInt32(b, 60) < 0 || lab < 0 || lab > 3 || mwst < 0 || mwst > 2500)
                throw new Exception("Ungültige Laborposition.");
            rows.Add(b);
        }
        if (rows.Count == 0) throw new Exception("Laborplan ohne Positionen.");
        short number = 0;
        foreach (var rec in new[] { 57, 59, 60 })
            foreach (var row in RawRows(rec))
                if (BitConverter.ToUInt32(row, 0) == id) number = Math.Max(number, BitConverter.ToInt16(row, 4));
        number = checked((short)(number + 1));
        BitConverter.GetBytes(id).CopyTo(head, 0);
        BitConverter.GetBytes(number).CopyTo(head, 4);
        BitConverter.GetBytes(kva).CopyTo(head, 8);
        Array.Copy(kvaHead, 48, head, 12, 4);
        Put(head, 20, 40, "Beleg zum KVA " + kva);
        Check(d_fillnewA(10057, head, task, 0), "Laborplan anlegen");
        Check(d_setorA(20040, task, 0), "Laborplan-Eigentümer");
        var written = new List<object?>();
        foreach (var b in rows)
        {
            Put(b, 0, 6, provider);
            Array.Copy(kvaHead, 48, b, 8, 4);
            Check(d_fillnewA(10055, b, task, 0), "Laborposition anlegen");
            Check(d_connectA(20040, task, 0), "Laborposition verknüpfen");
            written.Add(Convert.ToBase64String(b));
        }
        return new Dictionary<string, object?> { ["number"] = (int)number, ["data"] = Convert.ToBase64String(head), ["positions"] = written };
    }

    object Kva(Dictionary<string, object?> data)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        var tx = false;
        var writtenServices = new List<object?>();
        var writtenNotes = new List<object?>();
        var writtenReasons = new List<object?>();
        object? writtenLab = null;
        try
        {
            Check(d_trbeginA("kva", task), "Transaktion");
            tx = true;
            Check(d_reclockA(10004, "r", task, 0), "Patient lesen sperren");
            foreach (var rec in new[] { 42, 43, 51, 52, 53, 55, 57 }) Check(d_reclockA(10000 + rec, "w", task, 0), "Kostenvoranschlag sperren");
            foreach (var rec in new[] { 59, 60 }) Check(d_reclockA(10000 + rec, "r", task, 0), "Belege lesen sperren");
            ModulSperre(id);
            Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Patient finden");
            var patient = Read(680);
            var provider = Text(patient, 212, 6);
            if (provider.Length == 0) provider = "Dens";
            var head = Convert.FromBase64String(Convert.ToString(data["kva"])!);
            if (head.Length != 88 || BitConverter.ToUInt32(head, 0) != 0 || BitConverter.ToInt16(head, 4) != 0 || TaskDate(head, 48) == ""
                || BitConverter.ToInt16(head, 52) != 0 || BitConverter.ToInt16(head, 60) != 0 || BitConverter.ToInt16(head, 62) != 0
                || BitConverter.ToInt16(head, 70) != 2 || BitConverter.ToInt32(head, 72) != 0 || BitConverter.ToInt32(head, 76) != 0
                || BitConverter.ToInt32(head, 80) != 562421 || BitConverter.ToInt16(head, 84) != 0 || BitConverter.ToInt16(head, 86) != 0)
                throw new Exception("Ungültige KVA-Vorlage.");
            var rows = new List<byte[]>();
            var notes = new List<byte[]?>();
            var reasons = new List<List<byte[]>>();
            foreach (var value in (IEnumerable)data["services"]!)
            {
                var b = Convert.FromBase64String(Convert.ToString(value)!);
                var merk = BitConverter.ToInt16(b, 68);
                var katalog = BitConverter.ToInt16(b, 116);
                if (b.Length != 118 || BitConverter.ToInt16(b, 6) != 0 || Text(b, 40, 8) == "" || BitConverter.ToInt16(b, 58) < 1
                    || BitConverter.ToInt32(b, 60) <= 0 || BitConverter.ToInt32(b, 64) != 0 || (merk is not (0 or 1))
                    || BitConverter.ToInt32(b, 84) < 0 || (katalog is not (0 or 1)))
                    throw new Exception("Ungültige KVA-Leistung.");
                rows.Add(b);
            }
            foreach (var value in (IEnumerable)data["notes"]!)
            {
                var s = Convert.ToString(value) ?? "";
                if (s == "") { notes.Add(null); continue; }
                var b = Convert.FromBase64String(s);
                if (b.Length != 200 || b[199] != 0) throw new Exception("Ungültige KVA-Anmerkung.");
                notes.Add(b);
            }
            if (data.TryGetValue("reasons", out var rObj) && rObj is IEnumerable rEnum)
                foreach (var value in rEnum) reasons.Add(ErklaerungPruefen(value));
            else
                foreach (var _ in rows) reasons.Add(new List<byte[]>());
            if (rows.Count == 0 || rows.Count != notes.Count || rows.Count != reasons.Count)
                throw new Exception("KVA erwartet je Leistung eine Anmerkungs- und Begründungsangabe.");
            for (var i = 0; i < rows.Count; i++)
                if ((notes[i] is not null) != (BitConverter.ToInt16(rows[i], 68) == 1))
                    throw new Exception("Anmerkungskennzeichen der KVA-Leistung stimmt nicht.");
            short number = 0;
            foreach (var row in RawRows(51))
                if (BitConverter.ToUInt32(row, 0) == id) number = Math.Max(number, BitConverter.ToInt16(row, 4));
            number = checked((short)(number + 1));
            var erklaerung = 0;
            foreach (var row in RawRows(42))
                if (BitConverter.ToInt16(row, 0) == 512) erklaerung = Math.Max(erklaerung, BitConverter.ToInt32(row, 4));
            for (var i = 0; i < rows.Count; i++)
            {
                var saetze = reasons[i];
                var texte = new List<object?>();
                if (saetze.Count > 0)
                {
                    erklaerung = checked(erklaerung + 1);
                    ErklaerungAnlegen(saetze, erklaerung);
                    BitConverter.GetBytes(erklaerung).CopyTo(rows[i], 64);
                    foreach (var s in saetze) texte.Add(Convert.ToBase64String(s));
                }
                writtenReasons.Add(texte);
            }
            if (data.ContainsKey("labServices"))
            {
                var lab = KvaLabor(data, id, number, head, provider);
                writtenLab = lab;
                BitConverter.GetBytes((short)Convert.ToInt32(lab["number"])).CopyTo(head, 84);
            }
            BitConverter.GetBytes(id).CopyTo(head, 0);
            BitConverter.GetBytes(number).CopyTo(head, 4);
            Check(d_fillnewA(10051, head, task, 0), "Kostenvoranschlag anlegen");
            Check(d_setorA(20036, task, 0), "KVA-Leistungen-Eigentümer");
            for (var i = 0; i < rows.Count; i++)
            {
                Put(rows[i], 0, 6, provider);
                Check(d_fillnewA(10052, rows[i], task, 0), "KVA-Leistung anlegen");
                Check(d_connectA(20036, task, 0), "KVA-Leistung verknüpfen");
                if (notes[i] is not null)
                {
                    Check(d_setorA(20037, task, 0), "KVA-Anmerkung-Eigentümer");
                    Check(d_fillnewA(10053, notes[i]!, task, 0), "KVA-Anmerkung anlegen");
                    Check(d_connectA(20037, task, 0), "KVA-Anmerkung verknüpfen");
                }
                writtenServices.Add(Convert.ToBase64String(rows[i]));
                writtenNotes.Add(notes[i] is null ? "" : Convert.ToBase64String(notes[i]!));
            }
            var key = new byte[6];
            Array.Copy(head, key, 6);
            Check(d_keyfindA(51017, key, task, 0), "KVA-Index prüfen");
            Check(d_trendA(task), "Speichern");
            tx = false;
            return new Dictionary<string, object?>
            {
                ["id"] = id.ToString(), ["number"] = (int)number, ["writtenKva"] = Convert.ToBase64String(head),
                ["writtenServices"] = writtenServices, ["writtenNotes"] = writtenNotes,
                ["writtenReasons"] = writtenReasons, ["writtenLab"] = writtenLab,
            };
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }

    object PrivatHkp(Dictionary<string, object?> data)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        var tx = false;
        var writtenServices = new List<object?>();
        var writtenReasons = new List<object?>();
        try
        {
            Check(d_trbeginA("privathkp", task), "Transaktion");
            tx = true;
            Check(d_reclockA(10004, "r", task, 0), "Patient lesen sperren");
            foreach (var rec in new[] { 35, 36, 42, 43, 55, 57, 61, 64, 65 }) Check(d_reclockA(10000 + rec, "w", task, 0), "Privatplan sperren");
            foreach (var rec in new[] { 59, 60 }) Check(d_reclockA(10000 + rec, "r", task, 0), "Belege lesen sperren");
            ModulSperre(id);
            Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Patient finden");
            var patient = Read(680);
            var provider = Text(patient, 212, 6);
            if (provider.Length == 0) provider = "Dens";
            var b = Convert.FromBase64String(Convert.ToString(data["plan"])!);
            if (b.Length != 674 || BitConverter.ToUInt32(b, 0) != 0 || BitConverter.ToInt16(b, 4) != 0 || Text(b, 6, 40) == ""
                || BitConverter.ToInt16(b, 62) != 0 || BitConverter.ToInt16(b, 128) != 6 || BitConverter.ToInt16(b, 130) != 2
                || BitConverter.ToInt16(b, 148) != 1 || BitConverter.ToInt32(b, 236) != 562421 || BitConverter.ToInt16(b, 88) != 0
                || BitConverter.ToInt32(b, 136) != 0 || BitConverter.ToInt32(b, 140) != 0 || BitConverter.ToUInt32(b, 116) != 0
                || BitConverter.ToInt32(b, 84) <= 0)
                throw new Exception("Ungültige Privatplan-Vorlage.");
            for (var i = 48; i < 60; i++) if (b[i] != 0) throw new Exception("Privatplan-Vorlage enthält bereits ein Planstatusdatum.");
            for (var i = 120; i < 126; i++) if (b[i] != 0) throw new Exception("Privatplan-Vorlage enthält eine Laborreferenz.");
            for (var i = 248; i < 408; i++) if (b[i] != 0) throw new Exception("Privatplan-Vorlage enthält Plansymbole.");
            for (var i = 546; i < 674; i++) if (b[i] != 0) throw new Exception("Privatplan-Vorlage enthält eine Kassen-Therapieplanung.");
            var rows = new List<byte[]>();
            var reasons = new List<List<byte[]>>();
            long honorar = 0;
            foreach (var value in (IEnumerable)data["services"]!)
            {
                var s = Convert.FromBase64String(Convert.ToString(value)!);
                if (s.Length != 106 || BitConverter.ToInt16(s, 88) != 0 || Text(s, 38, 8) == "" || BitConverter.ToInt16(s, 46) < 1
                    || BitConverter.ToInt32(s, 48) <= 0 || BitConverter.ToInt32(s, 52) != 0 || BitConverter.ToInt32(s, 56) < 0
                    || BitConverter.ToInt32(s, 60) != 0 || BitConverter.ToInt32(s, 64) != 0 || BitConverter.ToInt16(s, 68) != -1)
                    throw new Exception("Ungültige Privatplan-Leistung.");
                honorar += (long)BitConverter.ToInt16(s, 46) * BitConverter.ToInt32(s, 56);
                rows.Add(s);
            }
            foreach (var value in (IEnumerable)data["reasons"]!) reasons.Add(ErklaerungPruefen(value));
            if (rows.Count == 0 || rows.Count != reasons.Count) throw new Exception("Privatplan erwartet je Leistung eine Begründungsangabe.");
            if (honorar != BitConverter.ToInt32(b, 80)) throw new Exception("Honorarsumme und Leistungen stimmen nicht überein.");
            var missing = new HashSet<int>();
            for (var i = 0; i < 32; i++) if (Text(b, 418 + i * 4, 4) == "f") missing.Add(Order[i]);
            var teeth = new HashSet<int>();
            foreach (var value in (IEnumerable)data["planTeeth"]!)
            {
                var t = Convert.FromBase64String(Convert.ToString(value)!);
                if (t.Length != 92 || BitConverter.ToUInt16(t, 4) != 4 || !teeth.Add(BitConverter.ToInt16(t, 0)))
                    throw new Exception("Ungültiger Planzahnbefund.");
            }
            if (!missing.SetEquals(teeth)) throw new Exception("Befund und Planzahnbefund stimmen nicht überein.");
            if ((missing.Count > 0) != data.ContainsKey("planFinding")) throw new Exception("Planbefund passt nicht zu den fehlenden Zähnen.");
            var labHead = Convert.FromBase64String(Convert.ToString(data["labPlan"])!);
            if (labHead.Length != 62 || BitConverter.ToInt16(labHead, 6) != 1 || BitConverter.ToInt16(labHead, 60) != 2)
                throw new Exception("Ungültige Laborplanvorlage.");
            for (var i = 0; i < 60; i++) if (i != 6 && i != 7 && labHead[i] != 0) throw new Exception("Ungültige Laborplanvorlage.");
            var labRows = new List<byte[]>();
            decimal brutto = 0;
            foreach (var value in (IEnumerable)data["labServices"]!)
            {
                var l = Convert.FromBase64String(Convert.ToString(value)!);
                var lab = BitConverter.ToInt16(l, 56);
                var mwst = BitConverter.ToInt16(l, 64);
                if (l.Length != 72 || Text(l, 44, 8) == "" || BitConverter.ToInt32(l, 52) <= 0 || BitConverter.ToInt32(l, 60) < 0 || lab < 0 || lab > 3 || mwst < 0 || mwst > 2500)
                    throw new Exception("Ungültige Laborposition.");
                var net = Math.Round((decimal)BitConverter.ToInt32(l, 52) * BitConverter.ToInt32(l, 60) / 100, 0, MidpointRounding.AwayFromZero);
                brutto += net * (1 + mwst / 10000m);
                labRows.Add(l);
            }
            if (labRows.Count == 0) throw new Exception("DENS verlangt zum Privatplan eine Laborplanung.");
            if (Math.Round(brutto, 0, MidpointRounding.AwayFromZero) != BitConverter.ToInt32(b, 84))
                throw new Exception("Laborpositionen und Laborkosten des Plans stimmen nicht überein.");
            short number = 0;
            foreach (var row in RawRows(61)) if (BitConverter.ToUInt32(row, 0) == id) number = Math.Max(number, BitConverter.ToInt16(row, 4));
            number = checked((short)(number + 1));
            var now = DateTime.Now;
            var erklaerung = 0;
            foreach (var row in RawRows(42)) if (BitConverter.ToInt16(row, 0) == 512) erklaerung = Math.Max(erklaerung, BitConverter.ToInt32(row, 4));
            for (var i = 0; i < rows.Count; i++)
            {
                var texte = new List<object?>();
                if (reasons[i].Count > 0)
                {
                    erklaerung = checked(erklaerung + 1);
                    ErklaerungAnlegen(reasons[i], erklaerung);
                    BitConverter.GetBytes(erklaerung).CopyTo(rows[i], 52);
                    foreach (var s in reasons[i]) texte.Add(Convert.ToBase64String(s));
                }
                writtenReasons.Add(texte);
            }
            short labNumber = 0;
            foreach (var rec in new[] { 57, 59, 60 })
                foreach (var row in RawRows(rec))
                    if (BitConverter.ToUInt32(row, 0) == id) labNumber = Math.Max(labNumber, BitConverter.ToInt16(row, 4));
            labNumber = checked((short)(labNumber + 1));
            BitConverter.GetBytes(id).CopyTo(labHead, 0);
            BitConverter.GetBytes(labNumber).CopyTo(labHead, 4);
            BitConverter.GetBytes(number).CopyTo(labHead, 8);
            DateBytes(labHead, 12, now);
            Put(labHead, 20, 40, "Laborplanung zum Prothetikplan " + number);
            Check(d_fillnewA(10057, labHead, task, 0), "Laborplan anlegen");
            Check(d_setorA(20040, task, 0), "Laborplan-Eigentümer");
            var writtenLab = new List<object?>();
            foreach (var l in labRows)
            {
                Put(l, 0, 6, provider);
                DateBytes(l, 8, now);
                Check(d_fillnewA(10055, l, task, 0), "Laborposition anlegen");
                Check(d_connectA(20040, task, 0), "Laborposition verknüpfen");
                writtenLab.Add(Convert.ToBase64String(l));
            }
            BitConverter.GetBytes(id).CopyTo(b, 0);
            BitConverter.GetBytes(number).CopyTo(b, 4);
            DateBytes(b, 48, now); DateBytes(b, 52, now); DateBytes(b, 56, now);
            Put(b, 64, 6, provider);
            BitConverter.GetBytes(labNumber).CopyTo(b, 120);
            Check(d_fillnewA(10061, b, task, 0), "Privatplan anlegen");
            Check(d_setorA(20043, task, 0), "Planleistungen-Eigentümer");
            foreach (var s in rows)
            {
                Put(s, 0, 6, provider);
                Check(d_fillnewA(10064, s, task, 0), "Planleistung anlegen");
                Check(d_connectA(20043, task, 0), "Planleistung verknüpfen");
                Check(d_setorA(20044, task, 0), "GOZ-Leistungstext-Eigentümer");
                Check(d_fillnewA(10065, new byte[RecordSize(65)], task, 0), "GOZ-Leistungstext anlegen");
                Check(d_connectA(20044, task, 0), "GOZ-Leistungstext verknüpfen");
                writtenServices.Add(Convert.ToBase64String(s));
            }
            var planFindingNumber = missing.Count > 0 ? AddPlanFinding(data, id, number, provider, now, 2) : (short)0;
            var key = new byte[8];
            Array.Copy(b, key, 6);
            Array.Copy(b, 230, key, 6, 2);
            Check(d_keyfindA(61146, key, task, 0), "Privatplan-Index prüfen");
            Check(d_trendA(task), "Speichern");
            tx = false;
            return new Dictionary<string, object?>
            {
                ["id"] = id.ToString(), ["number"] = (int)number, ["writtenPlan"] = Convert.ToBase64String(b),
                ["writtenServices"] = writtenServices, ["writtenReasons"] = writtenReasons,
                ["writtenLab"] = new Dictionary<string, object?> { ["number"] = (int)labNumber, ["data"] = Convert.ToBase64String(labHead), ["positions"] = writtenLab },
                ["planFindingNumber"] = (int)planFindingNumber,
                ["writtenPlanTeeth"] = planFindingNumber != 0 ? writtenPlanTeeth.Cast<object?>().ToList() : new List<object?>(),
            };
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }

    static bool IstGoz(string n)
    {
        if (n.Length == 5 && (n[4] == 'a' || n[4] == 'A')) n = n[..4];
        return n.Length == 4 && n.All(c => c is >= '0' and <= '9');
    }

    static bool IstPrivat(string art) => art.Length > 0 && (art[0] is 'Ä' or 'ä' || IstGoz(art));
    static bool IstPosition(string art) => art.Length > 0 && (char.IsDigit(art[0]) || art[0] is 'Ä' or 'ä');

    Dictionary<string, string> KatalogOffen()
    {
        var namen = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var b in RawRows(14))
        {
            var number = Text(b, 0, 8);
            if (number == "") continue;
            if (TaskDate(b, 688) == "") namen[number] = Text(b, 18, 128);
            else namen.TryAdd(number, Text(b, 18, 128));
        }
        return namen;
    }

    object ServiceCatalog(Dictionary<string, object?> data)
    {
        var numbers = new HashSet<string>(StringComparer.Ordinal);
        foreach (var n in (IEnumerable)data["numbers"]!) numbers.Add(Convert.ToString(n) ?? "");
        var alle = numbers.Contains("*");
        var jede = numbers.Contains("**");
        try
        {
            Check(d_reclockA(10014, "r", task, 0), "Leistungskatalog lesen sperren");
            var items = new List<object?>();
            foreach (var b in RawRows(14))
            {
                var number = Text(b, 0, 8);
                if (jede ? number == "" : alle ? !IstGoz(number) : !numbers.Contains(number)) continue;
                var row = new Dictionary<string, object?>
                {
                    ["number"] = number, ["code"] = Text(b, 8, 10), ["text"] = Text(b, 18, 128),
                    ["points"] = BitConverter.ToInt32(b, 656), ["from"] = TaskDate(b, 672), ["to"] = TaskDate(b, 688),
                };
                if (data.ContainsKey("raw")) row["data"] = Convert.ToBase64String(b);
                items.Add(row);
            }
            if (jede)
            {
                Check(d_reclockA(10013, "r", task, 0), "Kassenkatalog lesen sperren");
                foreach (var b in RawRows(13))
                {
                    var number = Text(b, 0, 8);
                    if (number == "") continue;
                    items.Add(new Dictionary<string, object?>
                    {
                        ["kasse"] = true, ["number"] = number, ["code"] = Text(b, 8, 10),
                        ["text"] = Text(b, 18, 128), ["points"] = (int)BitConverter.ToInt16(b, 656),
                        ["from"] = "", ["to"] = BitConverter.ToInt16(b, 678) != 0 ? "" : "alt",
                    });
                }
            }
            return items;
        }
        finally { d_freeallA(task); }
    }

    object ServiceCatalogAdd(Dictionary<string, object?> data)
    {
        var tx = false;
        var added = new List<string>();
        try
        {
            Check(d_trbeginA("gozkat", task), "Leistungskatalog-Transaktion");
            tx = true;
            Check(d_reclockA(10014, "w", task, 0), "Leistungskatalog sperren");
            var rows = RawRows(14);
            var nummern = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var kuerzel = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var r in rows) { nummern.Add(Text(r, 0, 8)); kuerzel.Add(Text(r, 8, 10)); }
            foreach (var value in (IEnumerable)data["entries"]!)
            {
                var e = (Dictionary<string, object?>)value!;
                var number = (Convert.ToString(e["number"]) ?? "").Trim();
                var bezug = (Convert.ToString(e["base"]) ?? "").Trim();
                var code = (Convert.ToString(e["code"]) ?? "").Trim();
                var text = (Convert.ToString(e["text"]) ?? "").Trim();
                var lang = e.TryGetValue("longText", out var lv) && lv is not null ? (Convert.ToString(lv) ?? "").Trim() : text;
                if (number.Length != 5 || !char.IsLetter(number[4]) || !IstGoz(bezug) || bezug.Length != 4 || number[..4] != bezug || code.Length == 0 || text.Length == 0)
                    throw new Exception("Ungültige Analogziffer: " + number);
                if (nummern.Contains(number)) continue;
                if (kuerzel.Contains(code)) throw new Exception("Kürzel " + code + " ist im Leistungskatalog schon vergeben.");
                byte[]? vorlage = null;
                foreach (var r in rows)
                    if (Text(r, 0, 8) == bezug && (vorlage is null || string.CompareOrdinal(TaskDate(r, 672), TaskDate(vorlage, 672)) > 0))
                        vorlage = r;
                if (vorlage is null) throw new Exception("Bezugsziffer " + bezug + " fehlt im Leistungskatalog.");
                var b = (byte[])vorlage.Clone();
                Put(b, 0, 8, number); Put(b, 8, 10, code); Put(b, 18, 128, text); Put(b, 146, 500, lang);
                Array.Clear(b, 836, b.Length - 836);
                Check(d_fillnewA(10014, b, task, 0), "Analogziffer " + number + " anlegen");
                nummern.Add(number);
                kuerzel.Add(code);
                added.Add(number);
            }
            Check(d_trendA(task), "Leistungskatalog speichern");
            tx = false;
            return added;
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }

    object KvaList(Dictionary<string, object?> data)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        try
        {
            foreach (var rec in new[] { 42, 43, 51, 52, 53, 55, 57 }) Check(d_reclockA(10000 + rec, "r", task, 0), "Kostenvoranschläge lesen sperren");
            var items = new List<object?>();
            foreach (var b in RawRows(51))
                if (BitConverter.ToUInt32(b, 0) == id)
                {
                    var key = new byte[6];
                    Array.Copy(b, key, 6);
                    Check(d_keyfindA(51017, key, task, 0), "Kostenvoranschlag auswählen");
                    Check(d_setorA(20036, task, 0), "KVA-Leistungen-Eigentümer");
                    var services = new List<object?>();
                    var notes = new List<object?>();
                    var reasons = new List<object?>();
                    var rc = d_findfmA(20036, task, 0);
                    while (rc == 0)
                    {
                        var service = Read(118);
                        services.Add(Convert.ToBase64String(service));
                        Check(d_setorA(20037, task, 0), "KVA-Anmerkung-Eigentümer");
                        var texts = new List<object?>();
                        var nr = d_findfmA(20037, task, 0);
                        while (nr == 0) { texts.Add(Convert.ToBase64String(Read(200))); nr = d_findnmA(20037, task, 0); }
                        if (nr is not (1 or 2)) Check(nr, "KVA-Anmerkungen lesen");
                        notes.Add(texts);
                        var erklaerung = BitConverter.ToInt32(service, 64);
                        reasons.Add(erklaerung != 0 ? ReadErklaerung(erklaerung) : new List<object?>());
                        rc = d_findnmA(20036, task, 0);
                    }
                    if (rc is not (1 or 2)) Check(rc, "KVA-Leistungen lesen");
                    var item = new Dictionary<string, object?>
                    {
                        ["number"] = (int)BitConverter.ToInt16(b, 4), ["description"] = Text(b, 6, 40),
                        ["date"] = TaskDate(b, 48), ["data"] = Convert.ToBase64String(b),
                        ["services"] = services, ["notes"] = notes, ["reasons"] = reasons,
                    };
                    var lab = BitConverter.ToInt16(b, 84);
                    if (lab != 0) item["laboratory"] = ReadLab(id, lab, 3);
                    items.Add(item);
                }
            return items;
        }
        finally { d_freeallA(task); }
    }

    Dictionary<string, object?> ReadLab(uint id, short number, short art)
    {
        foreach (var b in RawRows(57))
            if (BitConverter.ToUInt32(b, 0) == id && BitConverter.ToInt16(b, 4) == number && BitConverter.ToInt16(b, 6) == art)
            {
                var rc = d_recfrstA(10057, task, 0);
                var ziel = Convert.ToBase64String(b);
                while (rc == 0)
                {
                    var current = Read(62);
                    if (Convert.ToBase64String(current) == ziel) break;
                    rc = d_recnextA(task, 0);
                }
                Check(rc, "Laborplan auswählen");
                Check(d_setorA(20040, task, 0), "Laborpositionen auswählen");
                var rows = new List<object?>();
                rc = d_findfmA(20040, task, 0);
                while (rc == 0) { rows.Add(Convert.ToBase64String(Read(72))); rc = d_findnmA(20040, task, 0); }
                if (rc is not (1 or 2)) Check(rc, "Laborpositionen lesen");
                return new Dictionary<string, object?> { ["number"] = (int)number, ["data"] = ziel, ["positions"] = rows };
            }
        throw new Exception("Verknüpfter Laborplan fehlt.");
    }

    string Anmerkung(uint address)
    {
        var a = address;
        Check(d_crsetA(ref a, task, 0), "Behandlung wählen");
        Check(d_setorA(20006, task, 0), "Anmerkung-Eigentümer");
        var text = new StringBuilder();
        var rc = d_findfmA(20006, task, 0);
        while (rc == 0)
        {
            text.Append(DensPfad.Cp1252.GetString(Read(200)).Split('\0')[0]);
            rc = d_findnmA(20006, task, 0);
        }
        if (rc is not (1 or 2)) Check(rc, "Anmerkung lesen");
        return text.ToString();
    }

    object ClinicalList(Dictionary<string, object?> data)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        var result = new Dictionary<string, object?>();
        try
        {
            foreach (var rec in new[] { 8, 9, 14, 35, 36, 42, 43, 54, 55, 57, 61, 64 })
                Check(d_reclockA(10000 + rec, "r", task, 0), "Klinische Übersicht sperren");
            foreach (var rec in new[] { 35, 54, 61 })
            {
                var items = new List<object?>();
                foreach (var b in RawRows(rec))
                    if (BitConverter.ToUInt32(b, 0) == id)
                    {
                        var item = new Dictionary<string, object?>
                        {
                            ["number"] = rec == 54 ? 0 : (int)BitConverter.ToInt16(b, 4),
                            ["description"] = rec == 61 ? Text(b, 6, 40) : rec == 54 ? Text(b, 12, 200) : "Zahnbefund",
                        };
                        if (rec == 35)
                        {
                            item["date"] = TaskDate(b, 12);
                            item["time"] = b[18].ToString("D2") + ":" + b[17].ToString("D2");
                            item["provider"] = Text(b, 6, 6);
                            item["kind"] = (int)BitConverter.ToInt16(b, 20);
                            item["planNumber"] = (int)BitConverter.ToInt16(b, 22);
                            var key = new byte[6];
                            Array.Copy(b, key, 6);
                            Check(d_keyfindA(35016, key, task, 0), "Befund auswählen");
                            Check(d_setorA(20025, task, 0), "Befundeigentümer");
                            var teeth = new List<object?>();
                            var rc = d_findfmA(20025, task, 0);
                            while (rc == 0)
                            {
                                var tooth = Read(92);
                                teeth.Add(new Dictionary<string, object?> { ["number"] = (int)BitConverter.ToInt16(tooth, 0), ["data"] = Convert.ToBase64String(tooth) });
                                rc = d_findnmA(20025, task, 0);
                            }
                            if (rc is not (1 or 2)) Check(rc, "Zahndetails lesen");
                            item["teeth"] = teeth;
                        }
                        if (rec == 61)
                        {
                            item["date"] = TaskDate(b, 52);
                            item["data"] = Convert.ToBase64String(b);
                            var key = new byte[8];
                            Array.Copy(b, key, 6);
                            Array.Copy(b, 230, key, 6, 2);
                            Check(d_keyfindA(61146, key, task, 0), "Plan auswählen");
                            Check(d_setorA(20043, task, 0), "Planpositionen-Eigentümer");
                            var positions = new List<object?>();
                            var reasons = new List<object?>();
                            var rc = d_findfmA(20043, task, 0);
                            while (rc == 0)
                            {
                                var position = Read(106);
                                positions.Add(Convert.ToBase64String(position));
                                var erklaerung = BitConverter.ToInt16(position, 88) == 0 ? BitConverter.ToInt32(position, 52) : 0;
                                reasons.Add(erklaerung != 0 ? ReadErklaerung(erklaerung, false) : new List<object?>());
                                rc = d_findnmA(20043, task, 0);
                            }
                            if (rc is not (1 or 2)) Check(rc, "Planpositionen lesen");
                            item["positions"] = positions;
                            item["reasons"] = reasons;
                            var lab = BitConverter.ToInt16(b, 120);
                            if (lab != 0) item["laboratory"] = ReadLab(id, lab, 1);
                        }
                        items.Add(item);
                    }
                result[rec == 35 ? "befunde" : rec == 61 ? "hkps" : "waitroom"] = items;
            }
            var namen = KatalogOffen();
            var eintraege = new List<object?>();
            var lr = d_recfrstA(10008, task, 0);
            while (lr == 0)
            {
                Check(d_crgetA(out var adresse, task, 0), "Behandlungsadresse");
                var zeile = Read(RecordSize(8));
                if (BitConverter.ToUInt32(zeile, 0) == id)
                {
                    var art = Feld(zeile, 54, 8);
                    var position = IstPosition(art);
                    var zeichen = Feld(zeile, 70, 122);
                    var anmerkung = Anmerkung(adresse);
                    var wort = zeichen;
                    if (anmerkung.Length > 0 && (zeichen.Length == 0 || anmerkung.StartsWith(zeichen, StringComparison.Ordinal)))
                        wort = anmerkung;
                    if (position && wort == "" && namen.TryGetValue(art, out var katName)) wort = katName;
                    var zahn = position ? Feld(zeile, 12, 42) : "";
                    var anzahl = position ? BitConverter.ToInt16(zeile, 204) : (short)0;
                    if (anzahl < 0) anzahl = 0;
                    eintraege.Add(new Dictionary<string, object?>
                    {
                        ["date"] = TaskDate(zeile, 4),
                        ["time"] = position ? "" : zeile[10].ToString("D2") + ":" + zeile[9].ToString("D2"),
                        ["kind"] = art, ["text"] = wort, ["zahn"] = zahn, ["anzahl"] = (int)anzahl,
                        ["seite"] = position && IstPrivat(art) ? "privat" : "kasse",
                    });
                    var zurueck = adresse;
                    Check(d_crsetA(ref zurueck, task, 0), "Behandlung wiederherstellen");
                }
                lr = d_recnextA(task, 0);
            }
            if (lr != 2) Check(lr, "Behandlungsliste");
            result["entries"] = eintraege;
            return result;
        }
        finally { d_freeallA(task); }
    }

    object OpenPlans()
    {
        try
        {
            Check(d_reclockA(10004, "r", task, 0), "Patienten lesen sperren");
            Check(d_reclockA(10061, "r", task, 0), "Pläne lesen sperren");
            var patients = new Dictionary<uint, byte[]>();
            foreach (var p in RawRows(4)) patients[BitConverter.ToUInt32(p, 0)] = p;
            var items = new List<object?>();
            foreach (var b in RawRows(61))
            {
                var approved = TaskDate(b, 156);
                if (approved == "" || BitConverter.ToInt32(b, 116) != 0 || BitConverter.ToInt16(b, 168) != 0 || TaskDate(b, 172) != "")
                    continue;
                var id = BitConverter.ToUInt32(b, 0);
                patients.TryGetValue(id, out var p);
                items.Add(new Dictionary<string, object?>
                {
                    ["patient"] = id.ToString(), ["number"] = (int)BitConverter.ToInt16(b, 4),
                    ["title"] = Text(b, 6, 40),
                    ["name"] = p is null ? "" : Text(p, 42, 46), ["vorname"] = p is null ? "" : Text(p, 88, 46),
                    ["date"] = TaskDate(b, 52), ["genehmigt"] = approved, ["kind"] = (int)BitConverter.ToInt16(b, 62),
                });
            }
            return items;
        }
        finally { d_freeallA(task); }
    }

    string TaskText(uint address, int set)
    {
        var a = address;
        Check(d_crsetA(ref a, task, 0), "Aufgabe wählen");
        Check(d_setorA(set, task, 0), "Aufgabentext Eigentümer");
        var text = new StringBuilder();
        var rc = d_findfmA(set, task, 0);
        while (rc == 0) { text.Append(DensPfad.Cp1252.GetString(Read(162)).Split('\0')[0]); rc = d_findnmA(set, task, 0); }
        if (rc is not (1 or 2)) Check(rc, "Aufgabentext lesen");
        return text.ToString();
    }

    object Tasks(string user)
    {
        Check(d_reclockA(10106, "r", task, 0), "Aufgaben lesen");
        Check(d_reclockA(10107, "r", task, 0), "Aufgabentexte lesen");
        var result = new List<object?>();
        var rc = d_recfrstA(10106, task, 0);
        string[] statuses = ["Nicht gelesen", "Gelesen", "Geantwortet", "Erledigt"];
        while (rc == 0)
        {
            var b = Read(104);
            Check(d_crgetA(out var address, task, 0), "Aufgabenadresse");
            var sender = Text(b, 4, 6);
            var recipient = Text(b, 10, 6);
            var status = (int)BitConverter.ToInt16(b, 100);
            if (string.Equals(sender, user, StringComparison.OrdinalIgnoreCase) || string.Equals(recipient, user, StringComparison.OrdinalIgnoreCase))
            {
                result.Add(new Dictionary<string, object?>
                {
                    ["id"] = address.ToString(), ["createdDate"] = TaskDate(b, 0), ["dueDate"] = TaskDate(b, 16),
                    ["sender"] = sender, ["recipient"] = recipient, ["subject"] = Text(b, 20, 80),
                    ["status"] = status, ["statusLabel"] = status is >= 0 and < 4 ? statuses[status] : "Status " + status,
                    ["completed"] = status == 3, ["content"] = TaskText(address, 20066), ["note"] = TaskText(address, 20067),
                });
            }
            Check(d_crsetA(ref address, task, 0), "Aufgabe wiederherstellen");
            rc = d_recnextA(task, 0);
        }
        if (rc != 2) Check(rc, "Aufgabenliste");
        return result;
    }

    object Recalls(Dictionary<uint, Dictionary<string, object?>> patients)
    {
        Check(d_reclockA(10091, "r", task, 0), "Recallarten lesen");
        Check(d_reclockA(10094, "r", task, 0), "Recalls lesen");
        var types = new Dictionary<int, string>();
        foreach (var b in RawRows(91)) types[BitConverter.ToInt16(b, 0) - 1] = Text(b, 2, 24);
        var result = new List<object?>();
        foreach (var b in RawRows(94))
        {
            var id = BitConverter.ToUInt32(b, 0);
            var kind = (int)BitConverter.ToInt16(b, 4);
            var interval = BitConverter.ToInt32(b, 16);
            var status = (int)BitConverter.ToInt16(b, 22);
            var start = TaskDate(b, 8);
            var notified = TaskDate(b, 12);
            var due = "";
            try { if (start != "" && interval >= 0 && interval % 100 == 0) due = DateTime.ParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddMonths(interval / 100).ToString("yyyy-MM-dd"); }
            catch (ArgumentOutOfRangeException) { }
            patients.TryGetValue(id, out var p);
            result.Add(new Dictionary<string, object?>
            {
                ["patientId"] = id.ToString(), ["firstName"] = p is null ? "" : p["firstName"], ["lastName"] = p is null ? "" : p["lastName"],
                ["kind"] = types.TryGetValue(kind, out var tk) ? tk : "Recallart " + kind,
                ["startDate"] = start, ["dueDate"] = due, ["intervalMonths"] = interval / 100.0,
                ["notifiedDate"] = notified, ["deliveryType"] = (int)BitConverter.ToInt16(b, 20),
                ["status"] = status, ["pendingNotification"] = status == 1 && notified == "",
            });
        }
        return result;
    }

    object History(Dictionary<uint, Dictionary<string, object?>> patients)
    {
        Check(d_reclockA(10008, "r", task, 0), "Behandlungshistorie lesen");
        var result = new List<Dictionary<string, object?>>();
        foreach (var b in RawRows(8))
        {
            var id = BitConverter.ToUInt32(b, 0);
            var date = TaskDate(b, 4);
            if (date == "" || !patients.TryGetValue(id, out var p)) continue;
            result.Add(new Dictionary<string, object?>
            {
                ["patientId"] = id.ToString(), ["firstName"] = p["firstName"], ["lastName"] = p["lastName"],
                ["date"] = date, ["time"] = b[10].ToString("D2") + ":" + b[9].ToString("D2"),
                ["kind"] = Text(b, 54, 8), ["provider"] = Text(b, 192, 6), ["source"] = "DENSoffice",
            });
        }
        result.Sort((a, b) => string.CompareOrdinal(Convert.ToString(b["date"]) + Convert.ToString(b["time"]), Convert.ToString(a["date"]) + Convert.ToString(a["time"])));
        if (result.Count > 200) result.RemoveRange(200, result.Count - 200);
        return result.Cast<object?>().ToList();
    }

    object Dashboard(Dictionary<string, object?> data)
    {
        try
        {
            Check(d_reclockA(10004, "r", task, 0), "Patienten lesen");
            Check(d_reclockA(10054, "r", task, 0), "Wartezimmer lesen");
            var patients = new Dictionary<uint, Dictionary<string, object?>>();
            foreach (var b in RawRows(4)) patients[BitConverter.ToUInt32(b, 0)] = Patient(b);
            var waiting = new List<object?>();
            foreach (var b in RawRows(54))
            {
                var id = BitConverter.ToUInt32(b, 0);
                if (patients.TryGetValue(id, out var p))
                    waiting.Add(new Dictionary<string, object?>
                    {
                        ["id"] = id.ToString(), ["firstName"] = p["firstName"], ["lastName"] = p["lastName"],
                        ["time"] = b[10].ToString("D2") + ":" + b[9].ToString("D2"),
                        ["note"] = Text(b, 12, 200), ["priority"] = BitConverter.ToInt32(b, 4), ["room"] = BitConverter.ToInt32(b, 212),
                    });
            }
            var user = data.TryGetValue("tasksUser", out var u) ? Convert.ToString(u) ?? "dens" : "dens";
            return new Dictionary<string, object?>
            {
                ["patientCount"] = patients.Count, ["waiting"] = waiting, ["tasksUser"] = user,
                ["tasks"] = Tasks(user), ["recalls"] = Recalls(patients), ["history"] = History(patients),
                ["appointmentSource"] = "DENSoffice documentation", ["plannedAppointmentsAvailable"] = false,
            };
        }
        finally { d_freeallA(task); }
    }

    object Leistung(Dictionary<string, object?> data)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        var code = (Convert.ToString(data["code"]) ?? "").Trim();
        var zahn = data.TryGetValue("zahn", out var zv) ? (Convert.ToString(zv) ?? "").Trim() : "";
        var anzahl = data.TryGetValue("anzahl", out var av) && av is not null ? Convert.ToInt32(av) : 1;
        if (code.Length == 0 || code.Length > 7) throw new Exception("Ziffer fehlt.");
        if (anzahl is < 1 or > 99) throw new Exception("Anzahl muss zwischen 1 und 99 liegen.");
        if (zahn.Length > 41) throw new Exception("Zahn ist zu lang.");
        var katalogPunkte = -1;
        foreach (var zeile in ((List<object?>)ServiceCatalog(new Dictionary<string, object?> { ["numbers"] = new[] { code } })).OfType<Dictionary<string, object?>>())
        {
            if (Convert.ToString(zeile["to"]) == "") katalogPunkte = Convert.ToInt32(zeile["points"]);
            else if (katalogPunkte < 0) katalogPunkte = Convert.ToInt32(zeile["points"]);
        }
        var tag = DateTime.Today;
        var tx = false;
        try
        {
            Check(d_trbeginA("leistung", task), "Transaktion");
            tx = true;
            Check(d_reclockA(10004, "w", task, 0), "Patient sperren");
            Check(d_reclockA(10008, "w", task, 0), "Behandlung schreiben");
            Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Patient finden");
            Check(d_setorA(KARTEI, task, 0), "Kartei-Eigentümer");
            byte[]? vorlage = null;
            byte[]? familie = null;
            foreach (var vorhanden in RawRows(8))
            {
                var art = Text(vorhanden, 54, 8);
                if (art == code) vorlage = (byte[])vorhanden.Clone();
                else if (familie is null && IstPosition(art) && vorhanden[68] == 1 && IstPrivat(art) == IstPrivat(code))
                    familie = (byte[])vorhanden.Clone();
            }
            var gleiche = vorlage is not null;
            if (!gleiche) vorlage = familie;
            if (vorlage is null || vorlage.Length != RecordSize(8))
                throw new Exception(katalogPunkte < 0 ? "Diese Ziffer gibt es im DENS-Katalog nicht." : "Für diese Ziffer fehlt eine Vorlage in der Karteikarte.");
            if (!gleiche)
            {
                if (katalogPunkte < 0 || katalogPunkte > 32767) throw new Exception("Diese Ziffer gibt es im DENS-Katalog nicht.");
                var altPunkte = BitConverter.ToInt16(vorlage, 160);
                var altBetrag = BitConverter.ToInt16(vorlage, 176);
                var betrag = altPunkte == 0 ? 0 : (int)Math.Round(katalogPunkte * (double)altBetrag / altPunkte);
                if (betrag > 32767 || betrag < -32768) throw new Exception("Der Betrag passt nicht in die DENS-Position.");
                BitConverter.GetBytes((short)katalogPunkte).CopyTo(vorlage, 160);
                BitConverter.GetBytes((short)betrag).CopyTo(vorlage, 176);
            }
            BitConverter.GetBytes((short)0).CopyTo(vorlage, 216);
            BitConverter.GetBytes(id).CopyTo(vorlage, 0);
            DateBytes(vorlage, 4, tag); DateBytes(vorlage, 144, tag);
            var jetzt = DateTime.Now;
            vorlage[8] = (byte)jetzt.Second; vorlage[9] = (byte)jetzt.Minute; vorlage[10] = (byte)jetzt.Hour; vorlage[11] = 0;
            Array.Copy(vorlage, 8, vorlage, 148, 4);
            Put(vorlage, 12, 42, zahn);
            Put(vorlage, 54, 8, code);
            BitConverter.GetBytes((short)(vorlage[68] == 1 ? 1 : 0)).CopyTo(vorlage, 62);
            BitConverter.GetBytes((short)anzahl).CopyTo(vorlage, 204);
            Check(d_fillnewA(10008, vorlage, task, 0), "Abrechnungsposition anlegen");
            Check(d_connectA(KARTEI, task, 0), "Position in die Karteikarte hängen");
            Check(d_crgetA(out var adresse, task, 0), "Positionsadresse");
            var gespeichert = Read(RecordSize(8));
            if (BitConverter.ToUInt32(gespeichert, 0) != id || Text(gespeichert, 54, 8) != code || Feld(gespeichert, 12, 42) != zahn || BitConverter.ToInt16(gespeichert, 204) != (short)anzahl)
                throw new Exception("Abrechnungsposition wurde abweichend gespeichert.");
            Check(d_trendA(task), "Speichern");
            tx = false;
            return new Dictionary<string, object?>
            {
                ["id"] = id.ToString(), ["date"] = tag.ToString("yyyy-MM-dd"), ["kind"] = code,
                ["zahn"] = zahn, ["anzahl"] = anzahl, ["seite"] = IstPrivat(code) ? "privat" : "kasse", ["address"] = adresse,
            };
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }

    object Dokumentation(Dictionary<string, object?> data)
    {
        var id = uint.Parse(Convert.ToString(data["id"])!);
        var text = Convert.ToString(data["text"]) ?? "";
        if (string.IsNullOrWhiteSpace(text)) throw new Exception("Dokumentation ohne Text.");
        var enc = DensPfad.Cp1252Strict;
        byte[] erwartet;
        try { erwartet = enc.GetBytes(text); }
        catch (EncoderFallbackException) { throw new Exception("Dokumentation enthält Zeichen, die DENS nicht speichert."); }
        var pages = new List<byte[]>();
        var zusammen = new StringBuilder();
        if (data.TryGetValue("pages", out var pObj) && pObj is IEnumerable pEnum)
        {
            foreach (var item in pEnum)
            {
                var page = Convert.FromBase64String(Convert.ToString(item)!);
                if (page.Length != 200) throw new Exception("Ungültige Dokumentationsseite.");
                var n = Array.IndexOf(page, (byte)0);
                if (n <= 0) throw new Exception("Ungültige Dokumentationsseite.");
                for (var i = n; i < page.Length; i++) if (page[i] != 0) throw new Exception("Ungültige Dokumentationsseite.");
                zusammen.Append(enc.GetString(page, 0, n));
                pages.Add(page);
            }
        }
        if (pages.Count == 0 || pages.Count > 20) throw new Exception("Dokumentation ohne Text.");
        if (zusammen.ToString() != text || enc.GetBytes(text).Length != erwartet.Length)
            throw new Exception("Dokumentationstext und Seiten stimmen nicht überein.");
        var datum = Convert.ToString(data["date"]) ?? "";
        var teile = datum.Split('-');
        if (teile.Length != 3) throw new Exception("Ungültiges Datum.");
        var tag = new DateTime(int.Parse(teile[0]), int.Parse(teile[1]), int.Parse(teile[2]));
        var jetzt = DateTime.Now;
        var tx = false;
        try
        {
            Check(d_trbeginA("doku", task), "Transaktion");
            tx = true;
            Check(d_reclockA(10004, "w", task, 0), "Patient sperren");
            Check(d_reclockA(10008, "w", task, 0), "Behandlung schreiben");
            Check(d_reclockA(10009, "w", task, 0), "Anmerkung schreiben");
            Check(d_keyfindA(4000, BitConverter.GetBytes(id), task, 0), "Patient finden");
            Check(d_setorA(KARTEI, task, 0), "Kartei-Eigentümer");
            byte[]? vorlage = null;
            foreach (var vorhanden in RawRows(8))
                if (Text(vorhanden, 54, 8) == "Notiz") { vorlage = (byte[])vorhanden.Clone(); break; }
            if (vorlage is null || vorlage.Length != RecordSize(8) || RecordSize(9) != 200)
                throw new Exception("DENS-Notizvorlage fehlt.");
            BitConverter.GetBytes(id).CopyTo(vorlage, 0);
            DateBytes(vorlage, 4, tag);
            vorlage[8] = 0; vorlage[9] = (byte)jetzt.Minute; vorlage[10] = (byte)jetzt.Hour; vorlage[11] = 0;
            Put(vorlage, 54, 8, "Notiz");
            var kopf = text;
            var kopfBytes = enc.GetBytes(kopf);
            if (kopfBytes.Length > 65) kopf = enc.GetString(kopfBytes, 0, 65);
            Put(vorlage, 70, 66, kopf);
            Array.Clear(vorlage, 136, 56);
            Check(d_fillnewA(10008, vorlage, task, 0), "Dokumentation anlegen");
            Check(d_connectA(KARTEI, task, 0), "Dokumentation in die Karteikarte hängen");
            Check(d_crgetA(out var adresse, task, 0), "Dokumentationsadresse");
            Check(d_setorA(20006, task, 0), "Anmerkung-Eigentümer");
            foreach (var page in pages)
            {
                Check(d_fillnewA(10009, page, task, 0), "Dokumentationstext anlegen");
                Check(d_connectA(20006, task, 0), "Dokumentationstext verknüpfen");
            }
            var zurueck = adresse;
            Check(d_crsetA(ref zurueck, task, 0), "Dokumentation wiederherstellen");
            var gespeichert = Read(RecordSize(8));
            if (BitConverter.ToUInt32(gespeichert, 0) != id || Text(gespeichert, 54, 8) != "Notiz")
                throw new Exception("Dokumentation wurde nicht als Notiz gespeichert.");
            Check(d_setorA(20006, task, 0), "Anmerkung prüfen");
            var gelesen = new StringBuilder();
            var rc = d_findfmA(20006, task, 0);
            while (rc == 0) { gelesen.Append(enc.GetString(Read(200)).Split('\0')[0]); rc = d_findnmA(20006, task, 0); }
            if (rc is not (1 or 2)) Check(rc, "Dokumentationstext lesen");
            if (gelesen.ToString() != text) throw new Exception("Dokumentation wurde abweichend gespeichert.");
            Check(d_trendA(task), "Speichern");
            tx = false;
            return new Dictionary<string, object?>
            {
                ["id"] = id.ToString(), ["date"] = tag.ToString("yyyy-MM-dd"), ["time"] = jetzt.ToString("HH:mm"),
                ["address"] = adresse, ["pages"] = pages.Count, ["kind"] = "Notiz", ["text"] = gelesen.ToString(),
            };
        }
        finally
        {
            if (tx) d_trabortA(task);
            d_freeallA(task);
        }
    }
}
