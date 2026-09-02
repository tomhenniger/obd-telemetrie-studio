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

## Neue Features

- **Fahrzeugabfrage nach dem Import.** Direkt nach dem Einlesen fragt ein Dialog, welches
  Auto das ist: mit Vorschlag aus den Daten, zuletzt benutzten Profilen als Ein-Klick-Auswahl
  und Suche über den ganzen Katalog. Dazu die Belege, auf die sich die Schätzung stützt
  (Zahl der Bänke, Kraftstoff, Aufladung, höchste Drehzahl, gemessene Übersetzungen) und der
  ehrliche Hinweis, dass die Datei die Bauart hergibt, aber nicht das Modell. Über einen Knopf
  in den Einstellungen jederzeit wieder zu öffnen.

## Bugfixes (durch eine 1,5-Stunden-Fahrt aufgedeckt)

- **Beschleunigungszeiten bei niedrig getakteter Geschwindigkeitsquelle zu kurz.** Das
  Zeitraster hielt jeden Messwert bis zum nächsten, was aus einer 1-Hz-GPS-Geschwindigkeit
  eine Treppe macht: der Schwellenübertritt landete bis zu eine Sekunde daneben. 80→120 km/h
  wurde mit 2,98 s statt 3,35 s gemessen. Zwischen zwei Messpunkten wird jetzt interpoliert,
  wenn die Quelle gröber getaktet ist als das Raster. Aufzeichnungen mit dichter
  OBD-Geschwindigkeit ändern sich dadurch nicht.
- **Streckenwahl neu geordnet.** Alle drei Quellen können nur zu wenig zählen — deshalb
  gewinnt die größte. Ausnahme ist der GPS-Track: seine Luftlinien über Lücken sind eine
  vernünftige Schätzung, solange die übrigen Kanäle weiterliefen, aber keine Fahrleistung,
  wenn die ganze Aufzeichnung stillstand. Solche Ausfallstrecken werden erkannt und
  abgezogen. Ergebnis über drei Aufzeichnungen: 29,28 km, 10,54 km und 107,67 km — alle
  unabhängig nachgerechnet.
- **Warmlaufschwelle skaliert mit der Starttemperatur.** Feste sechs Minuten galten vorher
  für den 45-°C-Start wie für den Winterkaltstart. Ein Kaltstart bei 33 °C mit 6:33 min bis
  85 °C war damit „grenzwertig", ist jetzt unauffällig.

## UI-Änderungen (Gangerkennung)

- **Die Geraden im Gangdiagramm laufen nicht mehr bis zum Nullpunkt durch.** Kräftig
  gezeichnet ist jede nur noch über den Geschwindigkeitsbereich, in dem der Gang tatsächlich
  gefahren wurde; davor bleibt ein blasser Strich, der zeigt, dass die Gerade durch den
  Nullpunkt läuft. Bis 0 durchgezogen behauptete sie, man sei mit diesem Gang angefahren –
  dort liegt aber kein Messpunkt, weil der Motor im Leerlauf weiterdreht und die Kupplung
  beim Anfahren schlupft.
- **Das „S“ wird jetzt erklärt.** Spaltenkopf „Stufe (S = nach Übersetzung)“ und ein
  ausdrücklicher Hinweis, dass S1 keine Gangnummer ist.

## Neue Features (Gangerkennung)

- **Kurz durchfahrene Gänge werden nachgetragen.** Ein Gang, der nur beim Beschleunigen
  durchfahren wird, streut zu stark für einen eigenen Gipfel — besonders wenn die
  Geschwindigkeit nur mit 1 Hz vom GPS kommt. Die gefundenen Gänge verraten ihn trotzdem:
  eine Getriebeabstufung ist eine geometrische Folge, deren Stufensprünge nach unten größer
  werden. Wo die Vorhersage auf tatsächliche Messpunkte trifft, wird der Gang als „schwach
  belegt“ ergänzt; wo nicht, bleibt er weg. In der langen Fahrt kommt so ein fünfter Gang
  bei 21,8 km/h je 1000 min⁻¹ dazu (116 Punkte), in der ersten Fahrt wird nichts erfunden.

## Bugfixes (Getriebewahl)

- **Kennfelder aktualisierten sich nach einer Änderung nicht.** `recompute()` baute nur die
  gerade sichtbare Seite neu; alle anderen blieben als alter DOM-Stand liegen. Wer das
  Getriebe in den Einstellungen setzte und dann zu den Kennfeldern wechselte, sah weiter
  S1–S5 statt der echten Gangnummern. Jetzt werden alle gebauten Seiten verworfen.
- **Stufenlose Getriebe standen in der Vorschlagsliste.** Ein CVT hat keine festen Gänge –
  seine „Stufen“ sind Software und passen zufällig zu vielem. Beim Audi S5 rangierte die
  multitronic mit 1,0 % vor dem tatsächlich verbauten DL501 mit 1,2 %. CVTs sind jetzt
  ausgeschlossen.
- **Bei mehreren Varianten wurde die falsche angezeigt.** Es gewann die zuletzt passende
  statt der mit der größten Übereinstimmung – beim S5 stand deshalb die A6/A7-Variante da.
- **Das Urteil „eindeutig / mehrdeutig“ ging verloren**, weil es als Eigenschaft am
  Ergebnis-Array hing und ein `filter()` beim Aufrufer es abschnitt.

## UI-Änderungen (Getriebewahl)

- Die Vorschläge sind jetzt eine **geordnete Liste statt umbrechender Knöpfe**: je Zeile
  Kennung, Gangzahl, Trägerfahrzeuge und rechts die Bewertung.
- **Zum gewählten Motorprofil passende Getriebe stehen oben** und tragen ein „passt zum
  Fahrzeug“. Das ist der eigentliche Hinweis: die Messung kann ähnlich abgestufte Getriebe
  nicht auseinanderhalten, das Auto schon.
- Darüber steht ausdrücklich, ob eine Abstufung deutlich besser passt als alle anderen oder
  ob mehrere in Frage kommen, und darunter, dass Fahrzeugschein, Reparaturleitfaden oder
  Typschild entscheiden – nicht die Prozentzahl.

## UI-Änderungen (Gangdiagramm)

- **Punkte werden nach ihrer Rolle eingefärbt.** Farbig heißt einem Gang zugeordnet, hell
  grau geprüft aber keinem Gang zuzuordnen, sehr blass gar nicht ausgewertet – unter
  15 km/h, unter 900 min⁻¹ oder mit springender Drehzahl. Vorher lag alles in einer Farbe,
  und man las in den Anfahrbereich Geraden hinein, die dort niemand geprüft hatte.
- **„Nicht gefahren“ wird nicht mehr behauptet.** Fehlt ein niedriger Gang, steht jetzt
  „keine feste Übersetzung messbar – im Anfahrbereich schlupft die Kupplung“. Das Werkzeug
  kann nicht unterscheiden, ob ein Gang ungenutzt blieb oder nur nicht messbar war.
