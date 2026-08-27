# OBD Telemetrie Studio

Ein einzelnes HTML-File, das CSV-Exporte aus OBD2-Apps auswertet: Kennzahlen, Diagramme,
GPS-Karte und eine Diagnose, die die Messwerte gegen hinterlegte Werksangaben stellt.

**→ [Live-Version öffnen](https://tomhenniger.github.io/obd-telemetrie-studio/)**

Kein Server, kein Framework, kein Tracking. Die CSV wird ausschließlich im Browser gelesen
und verlässt das Gerät nicht. Die einzige Netzwerkverbindung sind die Kartenkacheln von
OpenStreetMap – wer auch das vermeiden will, stellt den Kartenstil auf „Ohne Karte".

## Was es kann

**Überblick** – rund zwanzig Fahrt-Kennzahlen: Strecke, Verbrauch, CO₂, Höchst- und
Durchschnittswerte, Vollgas- und Schubanteil, Zeitbudget nach Betriebszustand sowie
automatisch erkannte Beschleunigungsmessungen (0–100, 60–100, 80–120 km/h).

**Zeitreihen** – bis zu vier Messgrößen gleichzeitig auf zwei Achsen, mit Zeitbereichsregler,
Mausrad-Zoom, synchronisiertem Fadenkreuz und Phasenbändern für Beschleunigung, Schub und Stillstand.

**Strecke** – GPS-Route auf OpenStreetMap, eingefärbt nach jeder beliebigen Messgröße.
Antippen zeigt alle Werte an dieser Stelle. Höhenprofil über die Strecke.

**Verteilungen** – zeitgewichtete Histogramme je Messgröße plus eine vollständige
Statistiktabelle mit Perzentilen, Streuung und Abdeckung.

**Kennfelder** – Betriebspunkt-Dichte über Drehzahl und Last, Klopfbild (Last × Zündwinkel,
eingefärbt nach Drehzahl), Gangerkennung per Clustering, Verbrauchskurve über der
Geschwindigkeit, Ladelufttemperatur über Last und eine Korrelationsmatrix.

**Diagnose** – über zwanzig Regeln mit numerischen Sollbereichen, jeweils mit Auswertefenster,
Ursachenbeschreibung und konkreten Prüfschritten. Fünf Zustände statt drei: unauffällig,
grenzwertig, auffällig, nicht bewertbar, PID fehlt.

**Datenqualität** – zuerst wird gezeigt, was tatsächlich in der Datei steht: Abdeckung je
Messgröße, erkannte Artefakte, Herkunft der GPS-Positionen. Export als CSV, JSON, GPX und
als lesbarer Diagnosebericht.

## Eigene CSV laden

Die Datei per Drag-and-drop ablegen oder über „CSV auswählen" öffnen. Erkannt werden automatisch:

- **Long-Format** (`SECONDS;PID;VALUE;UNITS;LATITUDE;LONGITUDE`) – Car Scanner ELM OBD2, OBD Auto Doctor
- **Wide-Format** (eine Spalte je Messgröße) – Torque Pro, OBDLink, Dragy
- Trennzeichen `;` `,` Tab oder `|`, Dezimalpunkt oder Dezimalkomma, BOM, CRLF, Anführungszeichen
- Zeitangaben als Sekunden seit Mitternacht, Unix-Zeit, `hh:mm:ss` oder ISO-Datum
- Einheiten-Umrechnung: °F→°C, mph→km/h, psi/kPa→bar, mpg→L/100 km, hp/kW→PS

Rund 40 gängige PIDs sind auf kanonische Metriken abgebildet; unbekannte Messreihen werden
trotzdem dargestellt und in die Statistik aufgenommen.

### Beispieldatei bereitstellen

Eine CSV unter `data/demo.csv` ablegen – dann erscheint auf dem Startbildschirm der Knopf
„Beispielfahrt laden". Der `data/`-Ordner ist absichtlich in `.gitignore`, damit keine
GPS-Spuren versehentlich veröffentlicht werden.

## Fahrzeugprofile

Die Sollbereiche der Diagnose kommen aus dem gewählten Fahrzeugprofil. Hinterlegt sind:

- **Audi S5 B8.5, 3.0 TFSI Kompressor (CGWC)** – vollständige Werksangaben inklusive
  bekannter Schwachstellen und ihrer Signatur in den Messwerten
- Generische Profile für aufgeladene Benziner, Saugmotoren und Diesel

Das passende Profil wird beim Laden automatisch vorgeschlagen (anhand Zylinderbänken,
Ladeluftkühler-Sensoren, Lastniveau und Höchstdrehzahl) und lässt sich in den Einstellungen wechseln.

## Zurückhaltung als Prinzip

Größen, die die OBD-App selbst rechnet statt misst, bekommen bewusst keine Ampel. Der
„Ladedruck" von Car Scanner etwa folgt der Motorlast mit R² ≈ 0,999 exakt linear – er ist eine
Linearabbildung, keine Messung, und kann ein Problem weder belegen noch ausschließen. Ebenso
bei der Leistungsschätzung aus dem Kraftstofffluss: sie erscheint nur als Spanne mit
sichtbarer Annahme. Fehlt einer Regel ihr Auswertefenster, steht dort „nicht bewertbar"
statt eines Urteils auf dünner Datenbasis.

## Bauen

`index.html` ist das Produkt und liegt fertig im Repo. Wer die Quellen ändert:

```bash
./build.sh      # setzt src/* zu einer einzelnen index.html zusammen
```

| Datei | Inhalt |
|---|---|
| `src/02–04-*.css` | Design-Tokens, Layout, Komponenten |
| `src/20-util.js` | Formatierung, Statistik-Helfer, LTTB-Downsampling |
| `src/21-parse.js` | CSV-Parser mit Format-, Trennzeichen- und Zeiterkennung |
| `src/22-metrics.js` | PID-Alias-Tabelle und Einheiten-Normalisierung |
| `src/23-stats.js` | Datensatzaufbau, abgeleitete Größen, Ereignisse, Ganganalyse |
| `src/24-chart.js` | Canvas-Diagramme (Linien, Histogramm, Streubild, Dichte) |
| `src/25-map.js` | Slippy-Map mit OSM-Kacheln |
| `src/26-diag.js` | Fahrzeugprofile und Diagnose-Regelwerk |
| `src/27-ui.js`, `src/28-app.js` | UI-Bausteine und Sektionen |

## Hinweis

Das Werkzeug ordnet Messwerte in dokumentierte Sollbereiche ein. Es ersetzt keine
Werkstattdiagnose, und eine einzelne Fahrt ist eine Momentaufnahme – Aussagekraft entsteht
erst im Vergleich mehrerer Aufzeichnungen desselben Fahrzeugs unter ähnlichen Bedingungen.

## Lizenz

MIT
