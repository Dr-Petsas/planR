/****************************************************************************************************************************
 *                                                                                                                          *
 *  Quelldatei:              pz_aufnr.c                                                                                     *
 *                                                                                                                          *
 *  Inhalt:                  "C"-Quelltext zur Berechnung der Pruefziffer fuer die Auftragsnummer                           *
 *                                                                                                                          *
 *                                                                                                                          *
 *  Beispiel:                                                                                                               *
 *                                                                                                                          *
 *      Auftragsnummer ohne Pruefziffer:        4  7  1  1  9  9  -  8  1  2  2  -   Z   E  -  1  2  -  1  -                *
 *      Dezimalwerte der ...                                                                                                *
 *      ... nichtnumerischen Zeichen:                             0              0 122 101  0        0     0                *
 *                                                                                                                          *
 *      Numerische Ergebnis (Modulo 10):        4  7  1  1  9  9  0  8  1  2  2  0   2   1  0  1  2  0  1  0                *
 *                                                                                                                          *
 *      Gewichtung:                             2  1  2  1  2  1  2  1  2  1  2  1   2   1  2  1  2  1  2  1                *
 *                                                                                                                          *
 *      Numerisches Ergebnis x Gewichtung:      8  7  2  1 18  9  0  8  2  2  4  0   4   1  0  1  4  0  2  0                *
 *                                                                                                                          *
 *      Quersummen der Produkte:                8  7  2  1  9  9  0  8  2  2  4  0   4   1  0  1  4  0  2  0                *
 *                                                                                                                          *
 *                                             -------------------------------------------------------------                *
 *                                                                                                                          *
 *      Summe der Quersummen:               64 (auch Quersumme aller Ziffern der Zeile "Numerisches Ergebnis x Gewichtung") *
 *                                                                                                                          *
 *      Pruefziffer (Modulo 10):             4                                                                              *
 *                                                                                                                          *
 *                                                                                                                          *
 *  Rueckfragen an:                    Kassenzahnaerztliche Bundesvereinigung - Abteilung Vertragsinformatik                *
 *                                                                                                                          *
 *                                                                            - Telefon (0221) 4001-122 (Herr Kieselnitzki) *
 *                                                                                                 -126 (Herr Winzer)       *
 *  Koeln, den 20.07.2011                                                                                                   *
 *                                                                                                                          *
 ****************************************************************************************************************************/

static char pz_make                                         /* Pruefzifferberechnung fuer die Auftragsnummer */
            ( char *aufnum,                                    /* Zeiger auf die Zeichenreihe */
              int cnt )                                        /* Anzahl der zu pruefenden Zeichen */
{
register int byte,
             weigth2,                                               /* Flag, ob mit Gewichtung 2 zu multiplizieren ist */
             sum = 0;                                               /* Addierte Quersummen */

  for (weigth2 = 1; cnt > 0; cnt--, weigth2 ^= 1)                      /* Fuer jedes zu pruefende Zeichen ... */
  {
    switch (byte = *aufnum++)                                             /* Zeichen auswerten */
    {
      default:                                        return  '?';           /* Fehler bei unerwarteten Zeichen */

      case '0': case '*': case '-':                                          /* Fuer Ziffer "0", Stern- / Minuszeichen ... */
                                   continue;                                    /* ... ist das Produkt ist immer 0 */
      case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
                                                      byte -= '0';              /* Ziffern als Dezimalwerte (0 - 9) */
                                                      break;
      case 'A': case 'B': case 'C': case 'D': case 'E':
      case 'F': case 'G': case 'H': case 'I': case 'J':
      case 'K': case 'L': case 'M': case 'N': case 'O':
      case 'P': case 'Q': case 'R': case 'S': case 'T':
      case 'U': case 'V': case 'W': case 'X': case 'Y':
      case 'Z':                                       byte |= ' ';              /* Groﬂ- in Kleinschreibung umwandeln */
      case 'a': case 'b': case 'c': case 'd': case 'e':
      case 'f': case 'g': case 'h': case 'i': case 'j':
      case 'k': case 'l': case 'm': case 'n': case 'o':
      case 'p': case 'q': case 'r': case 's': case 't':
      case 'u': case 'v': case 'w': case 'x': case 'y':
      case 'z':                                       byte %= 10;               /* Buchstaben als Dezimalwerte (0 - 9) */
    }
    if (weigth2 && (byte <<= 1) > 9)                  byte -=  9;         /* Quersumme nach Multiplikation mit Gewichtung */
    sum += byte;                                                          /* Ergebnis aufsummieren */
  }
  return (char)('0'+sum%10);                                           /* Berechnete Pruefziffer als Character zurueckgeben */
}

/****************************************************************************************************************************/
