// Baut planr.ico (16 bis 256 px) aus Logo.cs für PlanR-Bridge-Setup.exe; nur beim Paketbau (paket-bauen.ps1).
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

static class IconBauen
{
    static readonly int[] Groessen = { 16, 20, 24, 32, 40, 48, 64, 256 };

    static int Main(string[] args)
    {
        var bilder = new List<byte[]>();
        foreach (var s in Groessen)
        {
            using (var bild = new Bitmap(s, s, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bild))
                {
                    g.Clear(Color.Transparent);
                    Logo.Zeichnen(g, 0, 0, s);
                }
                bilder.Add(s >= 256 ? Png(bild) : Dib(bild));
            }
        }
        using (var aus = new BinaryWriter(File.Create(args[0])))
        {
            aus.Write((short)0);
            aus.Write((short)1);
            aus.Write((short)Groessen.Length);
            var versatz = 6 + 16 * Groessen.Length;
            for (var i = 0; i < Groessen.Length; i++)
            {
                var s = Groessen[i] >= 256 ? 0 : Groessen[i];
                aus.Write((byte)s);
                aus.Write((byte)s);
                aus.Write((byte)0);
                aus.Write((byte)0);
                aus.Write((short)1);
                aus.Write((short)32);
                aus.Write(bilder[i].Length);
                aus.Write(versatz);
                versatz += bilder[i].Length;
            }
            foreach (var b in bilder) aus.Write(b);
        }
        return 0;
    }

    static byte[] Png(Bitmap bild)
    {
        using (var m = new MemoryStream())
        {
            bild.Save(m, ImageFormat.Png);
            return m.ToArray();
        }
    }

    static byte[] Dib(Bitmap bild)
    {
        var s = bild.Width;
        var maske = ((s + 31) / 32) * 4 * s;
        using (var m = new MemoryStream())
        using (var w = new BinaryWriter(m))
        {
            w.Write(40);
            w.Write(s);
            w.Write(2 * s);
            w.Write((short)1);
            w.Write((short)32);
            w.Write(0);
            w.Write(s * s * 4 + maske);
            w.Write(0);
            w.Write(0);
            w.Write(0);
            w.Write(0);
            for (var y = s - 1; y >= 0; y--)
            {
                for (var x = 0; x < s; x++)
                {
                    var c = bild.GetPixel(x, y);
                    w.Write(c.B);
                    w.Write(c.G);
                    w.Write(c.R);
                    w.Write(c.A);
                }
            }
            w.Write(new byte[maske]);
            return m.ToArray();
        }
    }
}
