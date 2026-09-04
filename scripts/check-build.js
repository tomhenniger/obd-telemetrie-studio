/* Prüft, ob das gebaute index.html syntaktisch gültiges JavaScript enthält.
   Ohne diesen Schritt fällt ein fehlendes Klammerpaar erst im Rauchtest auf. */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
if (!m) { console.error('Kein Skriptblock in index.html gefunden'); process.exit(1); }
try { new Function(m[1]); } catch (e) { console.error('Syntaxfehler im gebauten Skript: ' + e.message); process.exit(1); }
console.log('index.html: Skript parst sauber (' + (m[1].length / 1024).toFixed(0) + ' KB)');
