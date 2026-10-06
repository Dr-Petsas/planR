VERSION 5.00
Begin VB.Form frmPruefziffer 
   BackColor       =   &H00E0E0E0&
   BorderStyle     =   1  'Fest Einfach
   Caption         =   "Prüfziffermodul"
   ClientHeight    =   1485
   ClientLeft      =   45
   ClientTop       =   330
   ClientWidth     =   5175
   LinkTopic       =   "Form1"
   MaxButton       =   0   'False
   MinButton       =   0   'False
   ScaleHeight     =   1485
   ScaleWidth      =   5175
   StartUpPosition =   3  'Windows-Standard
   Begin VB.CommandButton Command1 
      BackColor       =   &H00E0E0E0&
      Caption         =   "Prüfziffer erstellen"
      Default         =   -1  'True
      Height          =   765
      Left            =   3525
      Style           =   1  'Grafisch
      TabIndex        =   2
      Top             =   375
      Width           =   1590
   End
   Begin VB.TextBox Text1 
      Height          =   315
      Left            =   1425
      TabIndex        =   0
      Top             =   375
      Width           =   1590
   End
   Begin VB.Label Label3 
      Alignment       =   1  'Rechts
      BackStyle       =   0  'Transparent
      Caption         =   "Prüfziffer :"
      Height          =   240
      Left            =   0
      TabIndex        =   4
      Top             =   825
      Width           =   1290
   End
   Begin VB.Label Label2 
      Alignment       =   1  'Rechts
      BackStyle       =   0  'Transparent
      Caption         =   "Auftragsnummer :"
      Height          =   315
      Left            =   75
      TabIndex        =   3
      Top             =   375
      Width           =   1290
   End
   Begin VB.Label Label1 
      BackColor       =   &H00E0E0E0&
      Height          =   315
      Left            =   1425
      TabIndex        =   1
      Top             =   750
      Width           =   990
   End
End
Attribute VB_Name = "frmPruefziffer"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False

Private Sub Command1_Click()
    Dim shift As Byte, BByte As Byte
    Dim x As Integer, cross As Integer, sum As Integer, zwischenSum As Integer
    Dim BZeichen As String
    Dim Fehler As Boolean
    Dim Auftragsnummer As String, PruefZiffer As String
    Auftragsnummer = "06-12345-1-8122-ZE-12-1-"
    Auftragsnummer = Text1.Text
    Auftragsnummer = Trim(Auftragsnummer)
    Label1.Caption = ""
    Fehler = False
    For x = 1 To Len(Auftragsnummer)
        shift = shift Xor 1
        BZeichen = Mid(Auftragsnummer, x, 1)
        If BZeichen >= "A" And BZeichen <= "Z" Then BZeichen = Chr(Asc(BZeichen) + 32)
        Select Case BZeichen
            Case "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
                BByte = Asc(BZeichen) - 48
            Case "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
                BByte = Asc(BZeichen) Mod 10
            Case "*", "-"
                BByte = 0
            Case Else
                Fehler = True
                Exit For
        End Select
        cross = BByte
        If shift = 1 Then
            cross = BByte * 2
        End If
        If cross > 9 Then cross = cross - 9
        sum = sum + cross
    Next
    If Fehler = False Then
        zwischenSum = sum Mod 10
        PruefZiffer = Chr(48 + zwischenSum)
        Label1.Caption = PruefZiffer
    Else
        Label1.Caption = "?"
        MsgBox "Fehlerhaftes Zeichen!"
    End If
    
End Sub

