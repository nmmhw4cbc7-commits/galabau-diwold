/**
 * api/_lib/plz.js
 * PLZ-Prüfung für GaLaBau Diwold: Format, Existenz und Luftlinien-Entfernung zu Römerberg.
 *
 * Der Unterstrich im Ordnernamen sorgt dafür, dass Vercel diese Datei nicht als eigene
 * Serverless Function veröffentlicht.
 *
 * Datenquelle: siehe PLZ-DATEN-LIZENZ.md (CC BY 4.0). Neu erzeugen: scripts/build-plz-data.py
 */
const PLZ_DATEN = require('./plz-de.json');

const HEIMAT_PLZ = '67354';   // Römerberg – Bezugspunkt der "50 km"-Aussage auf der Website
const RADIUS_KM = 50;

// Mögliche Ergebnisse von pruefePlz():
//   'format'     – keine vollständige, fünfstellige Zahl            -> Anfrage ablehnen
//   'unbekannt'  – fünfstellig, aber keine existierende PLZ         -> Anfrage ablehnen
//   'innerhalb'  – im Umkreis von RADIUS_KM                         -> normal bearbeiten
//   'ausserhalb' – weiter weg                                       -> zulassen, manuell bewerten
//   'unsicher'   – gültig, aber keine verlässlichen Koordinaten     -> zulassen, manuell prüfen

function normalisierePlz(wert) {
  return String(wert == null ? '' : wert).replace(/\s+/g, '');
}

// Luftlinie in km (Haversine)
function entfernungKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pruefePlz(roh) {
  const plz = normalisierePlz(roh);

  if (!/^\d{5}$/.test(plz)) return { status: 'format', plz };
  if (!Object.prototype.hasOwnProperty.call(PLZ_DATEN, plz)) return { status: 'unbekannt', plz };

  const ziel = PLZ_DATEN[plz];
  const heimat = PLZ_DATEN[HEIMAT_PLZ];
  if (!ziel || !heimat) return { status: 'unsicher', plz };

  const km = Math.round(entfernungKm(heimat[0], heimat[1], ziel[0], ziel[1]));
  return { status: km <= RADIUS_KM ? 'innerhalb' : 'ausserhalb', plz, km };
}

module.exports = { pruefePlz, normalisierePlz, entfernungKm, RADIUS_KM, HEIMAT_PLZ };
