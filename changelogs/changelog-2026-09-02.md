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

## Neue Features (Testsuite)

- **Regressionstests** mit dem eingebauten Node-Testrunner, ohne Abhängigkeiten: 39 Tests
  für Parser, Einheiten, Statistik, Getriebezuordnung, Diagnoseregeln und XML-Export. Jeder
  Fehler, der in dieser Sitzung gefunden wurde, ist als Testfall festgenagelt – Mitternacht,
  Feldübernahme, Dezimalkomma, Phantom-Phasen, Ausfallstrecke, Thermostat-Fehlalarm,
  Steuerzeichen im XML.
- **Drei echte Aufzeichnungen** als lokale Referenztests mit den unabhängig nachgerechneten
  Werten (Strecke, Gänge, Sprints, Stopps, Verbrauch). Laufen nur mit `OBD_REAL=1`, die
  Dateien bleiben privat.
- **GitHub Actions** führt die Tests bei jedem Push aus und prüft, ob `index.html` aus `src/`
  gebaut wurde.

## Bugfixes

- **Höhenmeter fehlten bei Car-Scanner-Dateien.** Im Long-Format liefert die PID „Altitude
  (GPS)“ die Höhe als Messwert, nicht als eigene Spalte – der Parser hat sie nie übernommen.
- Der XML-Export hing an einer Funktion der Oberfläche; die Zeitbeschriftung liegt jetzt im
  Rechenkern.

## Neue Features (Diagnose-Ausbau)

- **15 neue Regeln.** Die Registry kannte 53 Messgrößen, die Diagnose fragte 16 davon ab.
  Neu bewertet werden Öltemperatur, Katalysatortemperatur (inkl. Bankvergleich),
  Kurzzeit-Gemischkorrektur (auch „eingefroren“ als Befund), Lambda in der Teillast,
  Schaltverhalten der Sprungsonde, Plausibilität des Luftmassenmessers, Kraftstoffdruck
  unter Last (Vorförder- und Hochdruck), Bordspannung, herstellerspezifische Klopfregelung,
  Getriebeöltemperatur und Ansaugluft gegen Außenluft.
- **Erster Diesel-Satz:** Partikelfilter (Regeneration erkennen, Übertemperatur),
  AGR-Plausibilität, Ladedruck aus dem Saugrohrdruck, Luftmasse im Leerlauf als AGR-Hinweis.
  Benzinregeln werden beim Diesel übersprungen und umgekehrt – jeweils mit Begründung.
- Damit 38 Regeln. Alle neuen tragen `sollwert_quelle="regelwerk"` – Werkstatt-Faustwerte,
  keine Werksangaben – und nennen ihre Bedingung.

## Bugfixes (Diagnose)

- **Leistungsschätzung** rechnete beim Diesel mit Otto-Dichte und Otto-Verbrauch und
  unterschätzte ihn um rund 40 %.
- **Verbrauch gegen Werksangabe** prüft jetzt, ob Kraftstoffzähler und Streckenquelle
  denselben Zeitraum abdecken – sonst entstand aus zwei ungleichen Zeiträumen ein
  kritischer Befund über einen gesunden Motor.
- **Zündwinkel-Trend** vergleicht Volllastzüge nur noch im gemeinsamen Fenster
  3000–4500 min⁻¹; vorher wurde aus verschiedenen Gängen ein „Trend“.
- Die adaptive **Volllastschwelle** erfand Volllast, wenn nie Vollgas gefahren wurde.
- **Ladeluft über Außentemperatur** sagt jetzt, ob es die Außen- oder die
  Ansauglufttemperatur als Referenz benutzt hat.
- E10-Hinweis: 1–2 % mehr Masse gegenüber E5, nicht 3 %.
- „Engine RPM ×1000“ als einzige Drehzahlquelle wird mit 1000 skaliert.
- Die Lambdasonden-Aliasse fanden „O2 Sensor 1 Bank 1“ nicht (Reihenfolge).

## Neue Features (Fahrzeugakte)

- **Neue Sektion „Fahrzeugakte“.** Jede importierte Fahrt wird als kleine Auswertung
  (einige Kilobyte, keine Rohdaten) im Browser abgelegt – IndexedDB, kein Server, kein Konto.
  Dieselbe Datei nochmal eingelesen ersetzt ihren Eintrag statt ihn zu verdoppeln.
- **Befunde im Verlauf:** Matrix Regel × Fahrt mit Bewertung und Messwert, nach Gruppen
  geordnet; dazu ein Balkenverlauf je Regel mit dem Sollbereich. Erst so wird sichtbar, ob
  ein Wert von Fahrt zu Fahrt in eine Richtung wandert.
- **Fahrtenliste** mit Datum aus dem Dateinamen, Dauer, Strecke, Verbrauch, Ampelzählern
  und einer Notiz je Fahrt („nach Ölwechsel“).
- **Export/Import als JSON** – der Ersatz für eine Synchronisation: die Akte wandert als
  Datei zwischen Geräten. Beim Einlesen gewinnt je Fahrt der jüngere Stand, Notizen bleiben.
- Automatisches Speichern nach dem Import lässt sich abschalten.

## Neue Features (Aufzeichnungs-Assistent)

- **„Damit die nächste Aufzeichnung mehr beantwortet“** – eine Karte oben in der Diagnose.
  Aus jedem „PID fehlt“ wird ein Eintrag mit dem Namen, den die OBD-App anzeigt, und dem
  OBD-Code; aus jedem „nicht bewertbar“ eine Fahrsituation mit Anleitung, in der Reihenfolge,
  in der man sie am besten fährt: Kaltstart, Warmfahrt, Leerlauf, Konstantfahrt, Volllastzug.
  Dazu steht, welche Prüfungen daran hängen. Als Text kopierbar fürs Handy.
- **Rauchtest im Browser** (`test/smoke.js`, Playwright): lädt eine Datei, öffnet jede Sektion
  auf Desktop und Handy, sammelt Konsolenfehler, prüft auf seitliches Überlaufen und legt
  Screenshots ab. Ergänzt die Unit-Tests um das, was nur ein Browser sieht.

## Bugfixes

- Die Fahrzeugakte zog auf dem Handy die ganze Seite auf 833 px auf: ein Rasterkind wächst
  ohne `min-width: 0` auf Tabellenbreite. Jetzt allgemein für alle Seiteninhalte gesetzt.
