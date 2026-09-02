# Changelog — 2026-09-02

## Bugfixes (durch eine Kontrollfahrt aufgedeckt)

Eine zweite Aufzeichnung wurde einmal von Hand in Python und einmal mit dem Werkzeug
ausgewertet und die Ergebnisse gegenübergestellt. Der Datensatz ist ein Härtefall: zwei
Aufzeichnungsfenster mit einer 23-Minuten-Lücke dazwischen, Motordaten über nur 21 s,
Kühlmitteltemperatur über 7 s. Alle Kennzahlen stimmten überein — bis auf zwei Fehler:

- **Strecke 23,7 km statt 10,4 km.** Die Streckenwahl nahm blind den GPS-Track, sobald
  er über 200 m lag. Der überbrückt Datenlücken aber mit einer Luftlinie, und hier lagen
  22,5 km davon in einer einzigen Lücke, in der gar nicht aufgezeichnet wurde. Der
  OBD-Streckenzähler (10,401 km) und die Geschwindigkeits-Integration (10,536 km) lagen
  beide richtig und wurden ignoriert. Jetzt entscheidet die Übereinstimmung: stimmen zwei
  der drei Quellen auf 15 % überein, gilt deren Wert; weichen alle voneinander ab, wird
  das als Widerspruch ausgewiesen statt still gewählt. Die überbrückte Luftlinie wird
  getrennt geführt, weil sie keine gemessene Strecke ist.
- **Falscher Thermostat-Alarm.** Aus 7 Sekunden Kühlmitteldaten bei kaltem Motor am
  Aufzeichnungsstart schloss die Warmlaufregel „nie 85 °C erreicht, Thermostat prüfen"
  und meldete das als kritisch. Der Motor lief in der ganzen Aufzeichnung nur 24 Sekunden.
  Die Regel verlangt jetzt mindestens 5 Minuten Kühlmitteldaten und 10 Minuten
  Motorlaufzeit, sonst ist sie nicht bewertbar — und sagt, was ihr fehlt.

## Sonstiges

- Die Streckenquellen stehen jetzt einzeln im XML-Export, mit einer Warnung, falls sie
  sich widersprechen.
