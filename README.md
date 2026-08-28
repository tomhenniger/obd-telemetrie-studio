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

Vier Wege, alle rein im Browser:

| Weg | Wann |
|---|---|
| **Datei** | Drag-and-drop oder „CSV auswählen". Nimmt auch `.zip` und `.gz` und entpackt im Browser. |
| **Zwischenablage** | Knopf „Aus Zwischenablage" oder das Einfügefeld auf dem Startbildschirm (⌘V / Strg+V geht überall auf der Seite). Versteht rohen CSV-Text ebenso wie Base64 einer ZIP- oder gzip-Datei. |
| **Adresse** | `?src=https://…/fahrt.csv` an die URL anhängen. Der fremde Server muss `Access-Control-Allow-Origin` senden. |
| **Anker** | `#clipboard` öffnet die Seite mit Übernahme-Knopf, `#gz=<base64>` übergibt kleine Dateien direkt in der Adresse. |

### Vom iPhone: Siri-Kurzbefehl

Fünf Aktionen in der Kurzbefehle-App, danach taucht der Kurzbefehl im Teilen-Menü der Dateien-App auf
(in den Kurzbefehl-Einstellungen „Bei Teilen anzeigen" mit Eingabetyp „Dateien"):

1. **Datei auswählen** — oder „Kurzbefehl-Eingabe erhalten" für den Teilen-Weg
2. **Archiv erstellen** — packt als ZIP, aus 28 MB werden rund 2 MB
3. **Base64 codieren** — die Zwischenablage gibt nur Text an eine Webseite weiter
4. **In die Zwischenablage kopieren**
5. **URL öffnen** — `https://tomhenniger.github.io/obd-telemetrie-studio/#clipboard`

Safari fragt einmal nach der Erlaubnis zum Einsetzen, dann steht die Auswertung. Die Datei wird
nirgendwo gespeichert und nirgendwo hochgeladen — es gibt keinen Server, der sie annehmen könnte.

Schritt 2 und 3 sind optional: ohne sie liegen 28 MB Rohtext in der Zwischenablage, was funktioniert,
aber spürbar zäh ist. Gepackt sind es rund 3 Mio. Zeichen und die Übernahme dauert unter zwei Sekunden.

**Was nicht geht:** die CSV per POST an die Seite schicken und dafür einen teilbaren Ergebnis-Link
bekommen. GitHub Pages ist statisches Hosting — es gibt keinen Prozess, der eine Anfrage
entgegennehmen könnte, und ein teilbarer Link setzt voraus, dass die Daten irgendwo liegen. Genau
dieses Fehlen ist der Grund, warum die Aufzeichnung das Gerät nicht verlässt.

### Erkannte Formate

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

## Kaufcheck

Ein eigener Bereich für die Gebrauchtwagen-Besichtigung, nutzbar **ohne geladene CSV** – beim
Termin gibt es die Messdaten noch nicht, die Checkliste aber schon.

- **85 Prüfpunkte in neun Phasen**, vom Telefonat vor dem Termin über Papiere, Karosserie,
  kalten Motorraum, Kaltstart, Innenraum und Fahrwerk bis zur Probefahrt und dem Blick unter das
  warme Auto. Je Punkt: was genau zu tun ist, woran man erkennt dass es passt, das Warnsignal,
  Schweregrad, grobe Reparaturkosten und benötigtes Hilfsmittel.
- **Dreiwertiger Zustand** je Punkt – in Ordnung, Befund, übersprungen. Übersprungen bleibt
  bewusst ein eigener Zustand: ein ungeprüfter Punkt ist etwas anderes als ein geprüfter ohne Befund.
- **Mitlaufende Kostenbilanz** aus den markierten Befunden als Verhandlungsgrundlage.
  Abbruchkriterien erscheinen gesondert statt in der Summe unterzugehen.
- **Elf Messfahrten** in Durchführungsreihenfolge, vom Vorbereitungsabend über den Kaltstart
  (gibt es pro Termin genau einmal) bis zum zweiten Fehlerspeicher-Scan – je Schritt mit Dauer,
  genauer Fahranweisung und Erwartungswerten in Zahlen.
- **PID-Empfehlungen** getrennt für Benziner und Diesel, nach Pflicht, nützlich und optional,
  mit Hinweis zur sinnvollen Obergrenze: je mehr Werte gleichzeitig, desto langsamer jeder einzelne.
- **Mehrere Besichtigungen** parallel führbar. Alles im Gerätespeicher, Export als Textprotokoll.

## Fahrzeugprofile

Die Sollbereiche der Diagnose kommen aus dem gewählten Fahrzeugprofil. Der Katalog umfasst
**220 Profile** – VW-Konzern, Mercedes-Benz, BMW, Toyota, Hyundai/Kia, Mazda, Honda, Nissan,
Suzuki und mehr, Benziner wie Diesel, Baujahre etwa 2003 bis heute. 200 davon sind vollständig
belegt, jedes bringt seine bekannten Schwachstellen samt Erkennungssignatur mit.

Gesucht wird über Marke, Motorfamilie, Motorkennbuchstaben, Leistung, Hubraum, Trägerfahrzeug
oder Baujahr – „cjeb", „320d", „a4 tdi 150" oder „2015" führen alle zum Ziel. Findet die Suche
nichts, das alle Begriffe trifft, zeigt sie die besten Teiltreffer statt einer leeren Liste.

**Was ein Profil nicht belegt, wird nicht erfunden.** Leerlaufdrehzahl, Ladedruck-Sollband und
Thermostat-Temperatur stehen in keinem öffentlichen Datenblatt; sie fehlen deshalb in den meisten
Profilen und werden aus dem Klassenprofil der Motorbauart ergänzt. Die betroffenen Befunde tragen
sichtbar den Hinweis „Sollwert klassenbasiert" – ein weit gefasster ehrlicher Bereich statt einer
erfundenen Werksangabe.

Acht Klassenprofile decken alles ab, wofür es keinen Einzeleintrag gibt: Sauger, kleine und große
Turbo-Benziner, Kompressor, Vollhybrid, Pumpe-Düse-Diesel sowie Common-Rail-Diesel mit vier und
mit sechs Zylindern. Eigene Profile lassen sich anlegen, bearbeiten, als JSON sichern und einlesen.

Das passende Profil wird beim Laden automatisch vorgeschlagen (anhand Zylinderbänken,
Ladeluftkühler-Sensoren, Lastniveau und Höchstdrehzahl) und lässt sich jederzeit wechseln.

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

| `src/26-profiles.js` | Fahrzeugprofil-Katalog, Suche, Klassenwerte, eigene Profile |
| `src/27-diag.js` | Diagnose-Regelwerk |
| `src/28-ui.js` | UI-Bausteine |
| `src/29-ingest.js` | Übergabewege: Zwischenablage, Adresse, ZIP- und gzip-Entpacken |
| `src/30-buycheck.js` | Kaufcheck: Prüfpunkte, Messprotokoll, PID-Listen |
| `src/31-app.js` | Zustand, Navigation und Sektionen |

## Hinweis

Das Werkzeug ordnet Messwerte in dokumentierte Sollbereiche ein. Es ersetzt keine
Werkstattdiagnose, und eine einzelne Fahrt ist eine Momentaufnahme – Aussagekraft entsteht
erst im Vergleich mehrerer Aufzeichnungen desselben Fahrzeugs unter ähnlichen Bedingungen.

## Lizenz

MIT
