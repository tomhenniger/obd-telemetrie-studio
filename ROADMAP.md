# Roadmap

Alles hier läuft weiter als eine statische HTML-Datei auf GitHub Pages: kein Server, kein Konto, keine laufenden Kosten. Aufwand: klein = Stunden, mittel = ein Tag, groß = mehrere Tage.

## Aufgenommen (2026-09-04)

### Erledigt
- [x] Tacho & Reifen: Reifenfaktor aus OBD gegen GPS, Tempomat-Tabelle, Reifenrechner mit passenden Größen, wirksamer Umfang für die Gangerkennung. (2026-09-04)

### Auswertung
- [ ] Zwei Fahrten überlagern: Verläufe und Kennfelder zweier Aufzeichnungen übereinander (vor/nach Reparatur, Sommer/Winter). Mittel.
- [ ] Schaltanalyse: Schaltpunkte je Gang, Schaltdauer aus dem Drehzahleinbruch, Zeitanteil je Gang. Mittel.
- [ ] Ladedruckaufbau je Volllastzug (Spool-Zeit), Trend in der Akte. Klein bis mittel.
- [ ] Thermomanagement-Profil: Kühlmittel, Öl, Ladeluft, Getriebe in einem Bild, Warmlaufzeit je Größe. Klein.
- [ ] Ereignisse auf der Karte: Bremsungen, Kickdowns, Klopfereignisse, Warmlauf-Ende als Marker. Klein.

### Strecke (auf dem OSM-Matching)
- [ ] Verbrauch je Straßenabschnitt. Klein.
- [ ] „Was hätte das Limit gekostet“: Zeitgewinn und Mehrverbrauch der Überschreitungen. Klein.
- [ ] Wiederkehrende Abschnitte erkennen und über Fahrten vergleichen. Mittel.

### Werkstatt und Kauf
- [ ] Druckbares Protokoll (Kaufcheck, Diagnose) über die Druckfunktion. Klein.
- [ ] Teilen per Link: Zusammenfassung komprimiert in der URL, als QR-Code. Mittel.
- [ ] Datenschutz-Schnitt: Start und Ziel der Route verwischen. Klein.

### Plattform
- [ ] Installierbar und offline (PWA, Kachel-Cache). Mittel.
- [ ] Live-Verbindung zum ELM327 per Web Bluetooth (Chrome Android/Desktop). Groß.
- [ ] Fahrgestellnummer aus der CSV lesen: Hersteller, Werk, Modelljahr für den Profilvorschlag. Klein.

## Vorgeschlagen (zweite Runde)

### Motor tiefer
- [ ] Leistung aus Beschleunigung: zweite, physikalische Leistungsschätzung (Masse, Steigung, Luft- und Rollwiderstand) neben der aus dem Verbrauch; Abweichung der beiden ist ein Befund. Mittel.
- [ ] Fahrzeugmasse schätzen aus Leistung und Beschleunigung: Plausibilität von Beladung und Leistungsangabe. Mittel.
- [ ] Leerlaufqualität: Drehzahlstreuung im warmen Leerlauf als Regel und als Akte-Trend (Aussetzer, Verkokung, Luftleck). Klein.
- [ ] Startspannung: Einbruch beim Anlassen und Erholung als Batterie-Alter über Fahrten. Klein.
- [ ] Bremsanalyse: maximale Verzögerung, Bremsweg-Schätzung 100–0, Fading über Wiederholungen. Klein.

### Deine eigenen Sollwerte
- [ ] Persönliche Baseline: ab fünf Fahrten lernt die Akte den normalen Bereich dieses Wagens; Abweichung davon ist ein Befund, auch innerhalb des Werksbands. Mittel.
- [ ] Fremde Akte als Referenz: exportierte Akte eines anderen Wagens desselben Motors einlesen und danebenlegen. Klein.
- [ ] Wartungsstand: Intervalle je Profil (Öl, Kerzen, Kompressoröl, Getriebeöl) gegen Kilometerstand und Datum aus der Akte. Klein bis mittel.

### Daten und Import
- [ ] Mehrere CSV-Teile zu einer Fahrt zusammenführen (abgebrochene Aufzeichnung). Klein bis mittel.
- [ ] VCDS-Messwertblock-Logs einlesen: die Werkstatt-Logs der Audi-Welt. Mittel.
- [ ] GPX-Track ergänzen, wenn die OBD-App kein GPS hatte. Klein.

### Erlebnis
- [ ] Anmerkungen an Zeitpunkte („hier hat es geruckelt“), in Akte und KI-Prompt. Klein.
- [ ] Fahrt nacherleben: Zeitraffer mit Marker auf Karte und Zeiger in den Verläufen. Mittel.
- [ ] Sollband als Schattierung in den Verläufen (Kühlmittel, Ladeluft, Gemisch). Klein.
- [ ] Diagramme als Bild speichern. Klein.
- [ ] Prompt-Varianten: Werkstatt-Übergabe, Kaufberatung, Tiefenanalyse, mit Rückfragen-Katalog. Klein.
