using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace PlanR.Bridge.Dampsoft;

/// <summary>
/// 32-Bit-Bindung an DS-Wins CodeBase (cbstand.dll), plus DS-Win-Dateisperren (.lck),
/// TIM-Benachrichtigung (.tim), Cache-Invalidierung (.cch) und dsprg-Timer (dswin_refresh.py).
/// </summary>
public sealed class DsWinEngine
{
    static readonly object DllLock = new();
    static readonly Dictionary<string, IntPtr> LoadedDlls = new(StringComparer.OrdinalIgnoreCase);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr FnCode4InitP();
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnCode4Short(IntPtr c4, short v);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate short FnCode4GetErr(IntPtr c4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnCode4Undo(IntPtr c4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr FnD4Open(IntPtr c4, [In] byte[] name);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnD4Int(IntPtr d4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnD4GoLow(IntPtr d4, int rec, short goForWrite);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr FnD4Field(IntPtr d4, [In] byte[] name);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void FnF4AssignN(IntPtr f4, [In] byte[] data, uint len);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnD4WriteLow(IntPtr d4, int rec, int unlock, int doLock);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr FnD4Tag(IntPtr d4, [In] byte[] name);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void FnD4TagSelect(IntPtr d4, IntPtr tag);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnD4Seek(IntPtr d4, [In] byte[] key);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr FnD4Ptr(IntPtr d4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint FnD4Uint(IntPtr d4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnD4Changed(IntPtr d4, int flag);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate short FnD4AppendStart(IntPtr d4, short useMemo);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void FnF4MemoCopy(IntPtr dst, IntPtr src);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnF4MemoAssignN(IntPtr f4, [In] byte[] data, uint len);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint FnF4MemoLen(IntPtr f4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr FnF4MemoPtr(IntPtr f4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate double FnD4AutoGet(IntPtr d4);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnD4AutoSet(IntPtr d4, double v);

    readonly FnCode4InitP _init;
    readonly FnCode4Short _errOff;
    readonly FnCode4GetErr _error;
    readonly FnCode4Short _autoOpen;
    readonly FnCode4Short _lockAttempts;
    readonly FnCode4Undo _undo;
    readonly FnCode4Short _readOnly;
    readonly FnD4Open _open;
    readonly FnD4Int _close;
    readonly FnD4GoLow _go;
    readonly FnD4Field _field;
    readonly FnF4AssignN _assign;
    readonly FnD4WriteLow _write;
    readonly FnD4Int _flush;
    readonly FnD4Int _check;
    readonly FnD4Int _numTags;
    readonly FnD4Tag _tag;
    readonly FnD4TagSelect _selectTag;
    readonly FnD4Seek _seek;
    readonly FnD4Int _recno;
    readonly FnD4Int _lockAll;
    readonly FnD4Ptr _record;
    readonly FnD4Uint _recordWidth;
    readonly FnD4Int _unlock;
    readonly FnD4Changed _changed;
    readonly FnD4AppendStart _appendStart;
    readonly FnD4Int _append;
    readonly FnF4MemoCopy _memoCopy;
    readonly FnF4MemoAssignN _memoSet;
    readonly FnF4MemoLen _memoLen;
    readonly FnF4MemoPtr _memoPtr;
    readonly FnD4AutoGet _counterGet;
    readonly FnD4AutoSet _counterSet;

    static byte[] AsciiZ(string s)
    {
        var b = new byte[s.Length + 1];
        Encoding.ASCII.GetBytes(s, 0, s.Length, b, 0);
        return b;
    }

    static byte[] AnsiZ(string s)
    {
        var enc = DsWinPfad.EncodingByName("cp1252", strict: false);
        var raw = enc.GetBytes(s);
        var b = new byte[raw.Length + 1];
        Buffer.BlockCopy(raw, 0, b, 0, raw.Length);
        return b;
    }

    public static string LokalDll(string dllPath)
    {
        if (!dllPath.StartsWith(@"\\", StringComparison.Ordinal)) return dllPath;
        var baseDir = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? Path.GetTempPath();
        var ziel = Path.Combine(baseDir, "PlanR-DSWin", Path.GetFileName(dllPath));
        var stand = new FileInfo(dllPath);
        var zfi = new FileInfo(ziel);
        if (!zfi.Exists || zfi.Length != stand.Length || zfi.LastWriteTimeUtc.Ticks / TimeSpan.TicksPerSecond != stand.LastWriteTimeUtc.Ticks / TimeSpan.TicksPerSecond)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ziel)!);
            var tmp = Path.ChangeExtension(ziel, $".{Environment.ProcessId}.tmp");
            File.Copy(dllPath, tmp, true);
            File.SetLastWriteTimeUtc(tmp, stand.LastWriteTimeUtc);
            try { File.Move(tmp, ziel, true); }
            catch
            {
                try { File.Delete(tmp); } catch { }
                if (!File.Exists(ziel)) throw;
            }
        }
        return ziel;
    }

    public static string ResolveDll(string root)
    {
        // In 32-Bit-Prozess (win-x86) laden wir cbstand.dll (exakt dieselben 851 Exporte wie cbstandx64.dll).
        var dll = Path.Combine(root, IntPtr.Size == 4 ? "cbstand.dll" : "cbstandx64.dll");
        if (!File.Exists(dll))
            throw new NativeError($"DS-Win CodeBase-Bibliothek fehlt: {dll}");
        return dll;
    }

    public DsWinEngine(string dllPath)
    {
        if (!OperatingSystem.IsWindows()) throw new NativeError("Windows erforderlich.");
        var lokal = LokalDll(dllPath);
        IntPtr lib;
        lock (DllLock)
        {
            if (!LoadedDlls.TryGetValue(lokal, out lib))
            {
                lib = NativeLibrary.Load(lokal);
                LoadedDlls[lokal] = lib;
            }
        }
        T Bind<T>(string name) where T : Delegate =>
            Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(lib, name));

        _init = Bind<FnCode4InitP>("code4initP");
        _errOff = Bind<FnCode4Short>("code4errOff");
        _error = Bind<FnCode4GetErr>("code4getErrorCode");
        _autoOpen = Bind<FnCode4Short>("code4autoOpen");
        _lockAttempts = Bind<FnCode4Short>("code4lockAttempts");
        _undo = Bind<FnCode4Undo>("code4initUndo");
        _readOnly = Bind<FnCode4Short>("code4readOnly");
        _open = Bind<FnD4Open>("d4open");
        _close = Bind<FnD4Int>("d4close");
        _go = Bind<FnD4GoLow>("d4goLow");
        _field = Bind<FnD4Field>("d4field");
        _assign = Bind<FnF4AssignN>("f4assignN");
        _write = Bind<FnD4WriteLow>("d4writeLow");
        _flush = Bind<FnD4Int>("d4flush");
        _check = Bind<FnD4Int>("d4check");
        _numTags = Bind<FnD4Int>("d4numTags");
        _tag = Bind<FnD4Tag>("d4tag");
        _selectTag = Bind<FnD4TagSelect>("d4tagSelect");
        _seek = Bind<FnD4Seek>("d4seek");
        _recno = Bind<FnD4Int>("d4recNoLow");
        _lockAll = Bind<FnD4Int>("d4lockAll");
        _record = Bind<FnD4Ptr>("d4recordLow");
        _recordWidth = Bind<FnD4Uint>("d4recWidthLow");
        _unlock = Bind<FnD4Int>("d4unlock");
        _changed = Bind<FnD4Changed>("d4changed");
        _appendStart = Bind<FnD4AppendStart>("d4appendStart");
        _append = Bind<FnD4Int>("d4append");
        _memoCopy = Bind<FnF4MemoCopy>("f4memoAssignField");
        _memoSet = Bind<FnF4MemoAssignN>("f4memoAssignN");
        _memoLen = Bind<FnF4MemoLen>("f4memoLen");
        _memoPtr = Bind<FnF4MemoPtr>("f4memoPtr");
        _counterGet = Bind<FnD4AutoGet>("d4getAutoIncrementValue");
        _counterSet = Bind<FnD4AutoSet>("d4setAutoIncrementValue");
    }

    public IntPtr Init() => _init();
    public int ErrOff(IntPtr c4, short v) => _errOff(c4, v);
    public short Error(IntPtr c4) => _error(c4);
    public int AutoOpen(IntPtr c4, short v) => _autoOpen(c4, v);
    public int LockAttempts(IntPtr c4, short v) => _lockAttempts(c4, v);
    public int Undo(IntPtr c4) => _undo(c4);
    public int ReadOnly(IntPtr c4, short v) => _readOnly(c4, v);
    public IntPtr Open(IntPtr c4, string path) => _open(c4, AnsiZ(path));
    public int Close(IntPtr d4) => _close(d4);
    public int Go(IntPtr d4, int recno, short goForWrite = 1) => _go(d4, recno, goForWrite);
    public IntPtr Field(IntPtr d4, string name) => _field(d4, AsciiZ(name));
    public void Assign(IntPtr f4, byte[] data) => _assign(f4, data, (uint)data.Length);
    public int Write(IntPtr d4, int rec = -1, int unlock = 0, int doLock = 1) => _write(d4, rec, unlock, doLock);
    public int Flush(IntPtr d4) => _flush(d4);
    public int Check(IntPtr d4) => _check(d4);
    public int NumTags(IntPtr d4) => _numTags(d4);
    public IntPtr Tag(IntPtr d4, string name) => _tag(d4, AsciiZ(name));
    public void SelectTag(IntPtr d4, IntPtr tag) => _selectTag(d4, tag);
    public int Seek(IntPtr d4, byte[] key) => _seek(d4, key);
    public int RecNo(IntPtr d4) => _recno(d4);
    public int LockAll(IntPtr d4) => _lockAll(d4);
    public byte[] ReadRecordBytes(IntPtr d4, int width)
    {
        var ptr = _record(d4);
        var buf = new byte[width];
        Marshal.Copy(ptr, buf, 0, width);
        return buf;
    }
    public uint RecordWidth(IntPtr d4) => _recordWidth(d4);
    public int Unlock(IntPtr d4) => _unlock(d4);
    public int Changed(IntPtr d4, int flag) => _changed(d4, flag);
    public short AppendStart(IntPtr d4, short useMemo = 0) => _appendStart(d4, useMemo);
    public int Append(IntPtr d4) => _append(d4);
    public void MemoCopy(IntPtr dst, IntPtr src) => _memoCopy(dst, src);
    public int MemoSet(IntPtr f4, byte[] data) => _memoSet(f4, data, (uint)data.Length);
    public uint MemoLen(IntPtr f4) => _memoLen(f4);
    public byte[] MemoBytes(IntPtr f4)
    {
        var len = (int)_memoLen(f4);
        if (len <= 0) return [];
        var ptr = _memoPtr(f4);
        var buf = new byte[len];
        Marshal.Copy(ptr, buf, 0, len);
        return buf;
    }
    public double CounterGet(IntPtr d4) => _counterGet(d4);
    public int CounterSet(IntPtr d4, double v) => _counterSet(d4, v);
}

public sealed class DsWinAppender : IDisposable
{
    public DsWinEngine E { get; }
    public IntPtr Ctx { get; private set; }
    public List<IntPtr> Handles { get; } = [];
    readonly Encoding _enc;

    public DsWinAppender(string dllPath, string encoding)
    {
        E = new DsWinEngine(dllPath);
        _enc = DsWinPfad.EncodingByName(encoding, strict: true);
        Ctx = E.Init();
        if (Ctx == IntPtr.Zero) throw new HkpError("Datenbankbibliothek konnte nicht gestartet werden.");
        E.ErrOff(Ctx, 1);
        E.AutoOpen(Ctx, 1);
        E.LockAttempts(Ctx, 1);
    }

    public IntPtr Open(string path)
    {
        var h = E.Open(Ctx, path);
        if (h == IntPtr.Zero) throw new HkpError("Tabelle kann nicht geöffnet werden.");
        Handles.Add(h);
        if (File.Exists(Path.ChangeExtension(path, ".cdx")) && E.NumTags(h) == 0)
            throw new HkpError("Index konnte nicht geöffnet werden.");
        return h;
    }

    public void Put(IntPtr dst, Dictionary<string, DbfField> fields, byte[] record,
        Dictionary<string, object?> changes, IntPtr source = default, int? sourceRecord = null)
    {
        if (source != IntPtr.Zero && sourceRecord is int sr && E.Go(source, sr, 1) != 0)
            throw new HkpError("Musterplan nicht lesbar.");
        if (E.AppendStart(dst, 0) != 0)
            throw new HkpError("Datensatz kann nicht angelegt werden.");
        foreach (var (name, f) in fields)
        {
            var target = E.Field(dst, name);
            if (target == IntPtr.Zero) throw new HkpError("Tabellenstruktur weicht ab.");
            if (f.Kind == 'M')
            {
                if (changes.TryGetValue(name, out var mv) && mv is byte[] mb)
                {
                    if (E.MemoSet(target, mb) != 0 || E.Error(Ctx) != 0)
                        throw new HkpError("Memo-Text kann nicht gesetzt werden.");
                }
                else if (source != IntPtr.Zero)
                {
                    E.MemoCopy(target, E.Field(source, name));
                }
                continue;
            }
            byte[] raw;
            if (changes.TryGetValue(name, out var v))
            {
                if (v is byte[] vb) raw = vb;
                else if (f.Kind == 'B') raw = BitConverter.GetBytes(Convert.ToDouble(v));
                else if (f.Kind is 'N' or 'F' && v is int or long or double or decimal or float)
                {
                    var d = Convert.ToDouble(v);
                    var fmt = d.ToString("F" + f.Decimals, System.Globalization.CultureInfo.InvariantCulture);
                    raw = Encoding.ASCII.GetBytes(fmt);
                }
                else raw = _enc.GetBytes(Convert.ToString(v) ?? "");
                if (raw.Length > f.Length) throw new HkpError("Feldwert " + name + " ist zu lang.");
                var padded = new byte[f.Length];
                Array.Fill(padded, (byte)' ');
                if (f.Kind is 'N' or 'F' || name == "PATNR")
                    Buffer.BlockCopy(raw, 0, padded, f.Length - raw.Length, raw.Length);
                else
                    Buffer.BlockCopy(raw, 0, padded, 0, raw.Length);
                raw = padded;
            }
            else
            {
                raw = new byte[f.Length];
                Buffer.BlockCopy(record, f.Offset, raw, 0, f.Length);
            }
            E.Assign(target, raw);
            if (E.Error(Ctx) != 0) throw new HkpError("Testwert kann nicht gesetzt werden.");
        }
        if (E.Append(dst) != 0) throw new HkpError("Datensatz/Index konnte nicht gespeichert werden.");
    }

    public void Verify(IntPtr h)
    {
        if (E.Flush(h) != 0 || E.Check(h) != 0)
            throw new HkpError("Index ist nicht konsistent.");
    }

    public void Close()
    {
        for (var i = Handles.Count - 1; i >= 0; i--)
        {
            E.Changed(Handles[i], 0);
            E.Close(Handles[i]);
        }
        Handles.Clear();
        if (Ctx != IntPtr.Zero)
        {
            E.Undo(Ctx);
            Ctx = IntPtr.Zero;
        }
    }

    public void Dispose() => Close();
}

/// <summary>Windows-Dateisperren (.lck), TIM-Benachrichtigung (.tim), Cache (.cch) und dsprg-Refresh.</summary>
public static class DsWinLocks
{
    static readonly IntPtr InvalidHandle = new(-1);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateFileW(string fileName, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool LockFile(IntPtr h, uint offLow, uint offHigh, uint lenLow, uint lenHigh);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UnlockFile(IntPtr h, uint offLow, uint offHigh, uint lenLow, uint lenHigh);
    [DllImport("kernel32.dll")] static extern void GetSystemTimeAsFileTime(out long ft);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetFileTime(IntPtr h, IntPtr creation, ref long access, ref long write);

    static Exception FileAccessError(string label)
    {
        var code = Marshal.GetLastWin32Error();
        if (code == 5)
            return new EditUnavailable($"{label}: Windows verweigert den Schreib-/Dateizugriff (Fehler 5). Der API-Prozess benötigt wirksame Zugriffsrechte; DS-Win muss dafür nicht geschlossen werden.");
        if (code is 32 or 33)
            return new EditConflict($"{label} ist durch einen anderen Zugriff gesperrt. Bitte erneut versuchen.");
        return new EditUnavailable($"{label} konnte nicht geöffnet werden (Windows-Fehler {code}).");
    }

    public sealed class AppLock : IDisposable
    {
        readonly IntPtr _handle;
        readonly List<uint> _held = [];

        public AppLock(string dbfPath, int recordNumber)
        {
            var lck = Path.ChangeExtension(dbfPath, ".lck");
            _handle = CreateFileW(lck, 0x80000000, 3, IntPtr.Zero, 3, 0x80, IntPtr.Zero);
            if (_handle == InvalidHandle) throw FileAccessError("DS-Win-Sperrdatei");
            try
            {
                foreach (var offset in new uint[] { 0, (uint)(recordNumber * 50) })
                {
                    if (!LockFile(_handle, offset, 0, 50, 0))
                        throw new EditConflict("Der Patient oder die Tabelle wird gerade in DS-Win bearbeitet. Änderung dort abschließen und erneut laden.");
                    _held.Add(offset);
                }
            }
            catch
            {
                Dispose();
                throw;
            }
        }

        public void Dispose()
        {
            for (var i = _held.Count - 1; i >= 0; i--) UnlockFile(_handle, _held[i], 0, 50, 0);
            _held.Clear();
            if (_handle != InvalidHandle && _handle != IntPtr.Zero) CloseHandle(_handle);
        }
    }

    public sealed class TimNotify : IDisposable
    {
        readonly IntPtr _handle;

        public TimNotify(string dbfPath)
        {
            var tim = Path.ChangeExtension(dbfPath, ".tim");
            _handle = CreateFileW(tim, 0x40000000, 2, IntPtr.Zero, 4, 0x80, IntPtr.Zero);
            if (_handle == InvalidHandle) throw FileAccessError("DS-Win-Aktualisierungsdatei");
        }

        public void Notify()
        {
            GetSystemTimeAsFileTime(out var now);
            if (!SetFileTime(_handle, IntPtr.Zero, ref now, ref now))
                throw new IOException($"Cannot notify DS-Win ({Marshal.GetLastWin32Error()})");
        }

        public void Dispose()
        {
            if (_handle != InvalidHandle && _handle != IntPtr.Zero) CloseHandle(_handle);
        }
    }

    public static Dictionary<string, object?> InvalidatePatientCache(string path, double timeoutSec = 1.0)
    {
        var cache = Path.ChangeExtension(path, ".cch");
        var deadline = Environment.TickCount64 + (long)(timeoutSec * 1000);
        while (true)
        {
            try
            {
                if (File.Exists(cache)) File.Delete(cache);
                return new Dictionary<string, object?> { ["status"] = "requested", ["mechanism"] = "patient-cache-invalidation" };
            }
            catch (IOException ex)
            {
                var winErr = ex.HResult & 0xFFFF;
                if ((winErr != 32 && winErr != 33) || Environment.TickCount64 >= deadline)
                    return new Dictionary<string, object?>
                    {
                        ["status"] = "pending", ["windowsError"] = winErr,
                        ["message"] = "Gespeichert; die DS-Win-Liste konnte noch nicht aktualisiert werden. Die Auswahl bei Gelegenheit erneut öffnen.",
                    };
                Thread.Sleep(25);
            }
        }
    }

    // --- dswin_refresh.py ---
    const string VerifiedDsprgSha256 = "577b463f70beee9b2f99e55ce03fa6441149b84f9f176d6da3b646bae1353c1d";

    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint acc, bool inh, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool QueryFullProcessImageNameW(IntPtr h, uint flags, StringBuilder sb, ref uint len);

    public static Dictionary<string, object?> WakePatientList(string root, string patientDbfPath, double timeoutSec = 1.5)
    {
        var program = Path.Combine(root, "dsprg.exe");
        if (!string.Equals(Path.GetFullPath(patientDbfPath), Path.GetFullPath(Path.Combine(root, "daten", "patient.dbf")), StringComparison.OrdinalIgnoreCase))
            return new Dictionary<string, object?> { ["status"] = "not-applicable" };
        try
        {
            if (!File.Exists(program)) return new Dictionary<string, object?> { ["status"] = "scheduled" };
            var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(program))).ToLowerInvariant();
            if (hash != VerifiedDsprgSha256) return new Dictionary<string, object?> { ["status"] = "scheduled" };
            var candidates = new List<IntPtr>();
            var progFull = Path.GetFullPath(program);
            EnumWindows((hwnd, _) =>
            {
                if (GetWindow(hwnd, 4) != IntPtr.Zero) return true;
                var title = new StringBuilder(512);
                GetWindowTextW(hwnd, title, title.Capacity);
                if (!title.ToString().StartsWith("DS-Win-Plus", StringComparison.Ordinal)) return true;
                GetWindowThreadProcessId(hwnd, out var pid);
                var h = OpenProcess(0x1000, false, pid);
                if (h != IntPtr.Zero)
                {
                    try
                    {
                        var img = new StringBuilder(4096);
                        var len = (uint)img.Capacity;
                        if (QueryFullProcessImageNameW(h, 0, img, ref len)
                            && string.Equals(Path.GetFullPath(img.ToString()), progFull, StringComparison.OrdinalIgnoreCase))
                            candidates.Add(hwnd);
                    }
                    finally { CloseHandle(h); }
                }
                return true;
            }, IntPtr.Zero);
            if (candidates.Count != 1 || !PostMessageW(candidates[0], 0x113, (IntPtr)1, IntPtr.Zero))
                return new Dictionary<string, object?> { ["status"] = "scheduled" };
            var deadline = Environment.TickCount64 + (long)(timeoutSec * 1000);
            var cache = Path.ChangeExtension(patientDbfPath, ".cch");
            while (Environment.TickCount64 < deadline)
            {
                if (File.Exists(cache) && new FileInfo(cache).Length > 8)
                {
                    PostMessageW(candidates[0], 0x113, (IntPtr)1, IntPtr.Zero);
                    return new Dictionary<string, object?> { ["status"] = "triggered" };
                }
                Thread.Sleep(25);
            }
            return new Dictionary<string, object?> { ["status"] = "triggered", ["cachePending"] = true };
        }
        catch { return new Dictionary<string, object?> { ["status"] = "scheduled" }; }
    }
}
