// PlanR-Zeichen wie src/logo.ts in PlanR: Claras Orb mit Sprachwellen auf Dunkelgrün, pinker Bogen als Akzent.
// Zeichnet im 48er-Raster des SVG; genutzt vom Setup-Fenster und von IconBauen (Programmsymbol).
using System.Drawing;
using System.Drawing.Drawing2D;

static class Logo
{
    public static void Zeichnen(Graphics g, float x, float y, float groesse)
    {
        var zustand = g.Save();
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.TranslateTransform(x, y);
        g.ScaleTransform(groesse / 48f, groesse / 48f);

        using (var flaeche = Abgerundet(0, 0, 48, 48, 13))
        using (var grund = new LinearGradientBrush(new PointF(0, 0), new PointF(48, 48), Farbe(0x0f4a42), Farbe(0x051a1b)))
            g.FillPath(grund, flaeche);
        using (var rand = Abgerundet(0.6f, 0.6f, 46.8f, 46.8f, 12.4f))
        using (var stift = new Pen(Farbe(0x5ff0c8, 71), 1.2f))
            g.DrawPath(stift, rand);

        using (var schein = new GraphicsPath())
        {
            schein.AddEllipse(4, 4, 40, 40);
            using (var pinsel = new PathGradientBrush(schein))
            {
                pinsel.CenterColor = Farbe(0x3fd8b5, 115);
                pinsel.SurroundColors = new[] { Farbe(0x3fd8b5, 0) };
                g.FillPath(pinsel, schein);
            }
        }
        using (var bahn = new Pen(Farbe(0x5ff0c8, 89), 1.1f))
        {
            bahn.DashPattern = new[] { 1.6f / 1.1f, 2.6f / 1.1f };
            g.DrawEllipse(bahn, 7, 7, 34, 34);
        }
        using (var verlauf = new LinearGradientBrush(new PointF(24, 7), new PointF(41, 27), Farbe(0xff9cc2), Farbe(0xe0407b)))
        using (var bogen = new Pen(verlauf, 2.6f))
        {
            bogen.StartCap = LineCap.Round;
            bogen.EndCap = LineCap.Round;
            g.DrawArc(bogen, 7, 7, 34, 34, -80, 90);
        }
        Punkt(g, 40.74f, 26.95f, 2.3f, Farbe(0xff7aa8));
        Punkt(g, 8.02f, 18.19f, 1.3f, Farbe(0x5ff0c8));
        using (var ring = new Pen(Farbe(0x5ff0c8, 153), 1f))
            g.DrawEllipse(ring, 11.4f, 11.4f, 25.2f, 25.2f);

        using (var orb = new GraphicsPath())
        {
            orb.AddEllipse(14.8f, 14.8f, 18.4f, 18.4f);
            using (var pinsel = new PathGradientBrush(orb))
            {
                pinsel.CenterPoint = new PointF(14.8f + 18.4f * 0.36f, 14.8f + 18.4f * 0.32f);
                var blende = new ColorBlend(3);
                blende.Colors = new[] { Farbe(0x0c7a6c), Farbe(0x3fe0bb), Farbe(0xc8fff0) };
                blende.Positions = new[] { 0f, 0.55f, 1f };
                pinsel.InterpolationColors = blende;
                g.FillPath(pinsel, orb);
            }
        }
        using (var weiss = new SolidBrush(Color.White))
        {
            Balken(g, weiss, 19.3f, 21.6f, 2.1f, 4.8f);
            Balken(g, weiss, 22.95f, 18.9f, 2.1f, 10.2f);
            Balken(g, weiss, 26.6f, 21.6f, 2.1f, 4.8f);
        }
        g.Restore(zustand);
    }

    static Color Farbe(int rgb, int alpha = 255)
    {
        return Color.FromArgb(alpha, (rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
    }

    static void Punkt(Graphics g, float x, float y, float r, Color farbe)
    {
        using (var pinsel = new SolidBrush(farbe))
            g.FillEllipse(pinsel, x - r, y - r, 2 * r, 2 * r);
    }

    static void Balken(Graphics g, Brush pinsel, float x, float y, float b, float h)
    {
        using (var pfad = Abgerundet(x, y, b, h, b / 2))
            g.FillPath(pinsel, pfad);
    }

    static GraphicsPath Abgerundet(float x, float y, float b, float h, float r)
    {
        var p = new GraphicsPath();
        var d = 2 * r;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + b - d, y, d, d, 270, 90);
        p.AddArc(x + b - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}
