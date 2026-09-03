# Changelog — 2026-09-03

## Neue Features
- **Tempolimit-Vergleich auf der Karte**: neue Einfärbung „Tempolimit-Vergleich (OSM)“. Auf Klick werden die Tempolimits der befahrenen Straßen über die Overpass-API von OpenStreetMap geholt (die ausgedünnte Route verlässt dafür einmal das Gerät, Ergebnis wird im Browser gespeichert). Grün = unter dem Limit, Rot = über einem Limit durch Schild oder Ortstafel, Gelb = über dem impliziten Außerorts-Limit ohne Schild, Blau = unsicher (kein Limit in OSM, Zeitregel wie „Mo–Fr 7–17 Uhr“ ohne bekanntes Datum, oder keine Geschwindigkeit), Grau = keine Straße im Umkreis. Bedingte Limits werden mit Datum und Uhrzeit aus dem Dateinamen entschieden. Dazu Kennzahlen (km über Limit, größte Überschreitung), Verstoßliste mit Straße, Limit, Tempo und Dauer, Limit im Karten-Messfenster. Fahrtrichtung fließt in die Zuordnung ein (maxspeed:forward/backward). Ohne Toleranz gerechnet, Vergleich mit OBD-Geschwindigkeit (GPS, wo OBD fehlt).


## UI-Änderungen


## Bugfixes


## Sonstiges

