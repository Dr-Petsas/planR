unit CheckSum;

//==============================================================================
// Funktion en zur Ermittlung der Prüfziffer gemäß KZBV-Angaben
// erstellt: 25.06.2011 Dr. Frank Schaefer (http://PraxisSoft.org  / http://ctv.PraxisSoft.org
// Dieser Code darf unter Nennung der Quelle frei (auch komerziell) verwended werden
//==============================================================================

interface

uses SysUtils;

Function getCheckChar(s: AnsiString): AnsiChar;
Function CheckReNr(const ReNr: String): boolean;

implementation

(*----------------------------------------------------------------------------*)
Function getCheckChar(s: AnsiString): AnsiChar;
(*----------------------------------------------------------------------------*)
var i  : integer;
    b  : byte;
    c  : AnsiChar;
    sum: word;

begin
   s  := AnsiString(trim(AnsiLowerCase(String(s))));         // umwandeln in Kleinbuchstaben und alle Steuerzeichen und Space am Anfang und Ende entfernen
   sum:= 0;                                                  // Anfangswert Summe setzen --> 0
   for i:= 1 to length(s) do begin                           // Für jedes Zeichen im String folgendes tun:
      c:= s[i];
      if c in ['*', '-', '0'] then continue;                 // "*", "-" und "0" haben keine Auswirkung auf Prüfziffer --> gleich mit nächstem Zeichen weiter
      if c in ['a'..'z'] then begin                          // wenn Zeichen ein Buchstabe im Bereich "a".."z" --> Numerisches Äquivalent ermitteln
         b:= ord(c) mod 10;
         if b = 0 then continue;                             // wenn numerisches Äquivalent = 0 --> gleich nächstes Zeichen, da keine Auswirkung auf Prüfziffer
         c:= AnsiChar(b + ord('0'));                         // sonst Rüchführen des numerischen Äquivalents aus ASCII-Zeichen
      end;
      if c in ['1'..'9'] then begin                          // wenn Zeichen im Bereich "1".."9" --> Quersumme mit Wichtung ermitteln
         b:= ord(c) - ord('0');                              // --> ASCII-Ziffer zu Numärischem Äquivalent rückführen
         if odd(i) then begin                                // --> alle Zeichen an ungeraden Positionen im String (Zeichenzähler)
            b:= b shl 1;                                     //     -->  mit 2 multiplizieren
            if b > 9 then b:= b - 9;                         //     --> bei dezimalem Überlauf 9 subtrahieren
         end;
         sum:= sum + b;                                      // --> Summe bilden
      end
      else begin                                             // Zeichen außerhalb der Bildungsvorschrift
         Result:= '?';                                       // --> Prüfziffer wird nicht berechnet, "?" als Fehlercode ausgeben
         exit;                                               // --> Funktion abbrechen
      end;
   end;
   b     := sum mod 10;                                      // Quersumme wurde erfolgreich berechet --> Rüchführung auf numerisches Äquivalent
   Result:= AnsiChar(b + ord('0'));                          // numerisches Äquivalent als ASCII-Zeichen ausgeben
end;
(*----------------------------------------------------------------------------*)

(*----------------------------------------------------------------------------*)
Function CheckReNr(const ReNr: String): boolean;
(*----------------------------------------------------------------------------*)
var s: AnsiString;
    c: AnsiChar;

begin
   s:= AnsiString(copy(ReNr, 1, length(ReNr) - 1));
   c:= AnsiChar(ReNr[length(ReNr)]);
   Result:= getCheckChar(s) = c;
end;
(*----------------------------------------------------------------------------*)

end.
