namespace PlanR.Bridge;

/// <summary>
/// Zählt laufende Aufträge, damit PVS-Wechsel und Updates nie mitten in einen Schreibvorgang schneiden.
/// </summary>
public sealed class Laufend
{
    readonly object sperre = new();
    int anzahl;

    public int Anzahl
    {
        get { lock (sperre) return anzahl; }
    }

    public IDisposable Beginnen()
    {
        lock (sperre) anzahl++;
        return new Halter(this);
    }

    public bool Abwarten(TimeSpan frist)
    {
        var ende = DateTime.UtcNow + frist;
        lock (sperre)
        {
            while (anzahl > 0)
            {
                var rest = ende - DateTime.UtcNow;
                if (rest <= TimeSpan.Zero) return false;
                Monitor.Wait(sperre, rest);
            }
            return true;
        }
    }

    void Beenden()
    {
        lock (sperre)
        {
            anzahl = Math.Max(0, anzahl - 1);
            if (anzahl == 0) Monitor.PulseAll(sperre);
        }
    }

    sealed class Halter(Laufend eltern) : IDisposable
    {
        int erledigt;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref erledigt, 1) == 0) eltern.Beenden();
        }
    }
}
