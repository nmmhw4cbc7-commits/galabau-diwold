/**
 * api/senden.js
 * GaLaBau Diwold – Kontaktformular-Handler für Vercel (Node.js Serverless Function)
 * Validiert die eingehenden Daten und verschickt die Anfrage per E-Mail über Resend.
 */

// PLZ-Prüfung: Format, Existenz und Luftlinien-Entfernung zu Römerberg (siehe api/_lib/plz.js)
const { pruefePlz, RADIUS_KM } = require('./_lib/plz');

// Ziel-E-Mail-Adresse, an die Anfragen gehen
const EMPFAENGER = 'info@galabau-diwold.de';

// ---------- Bild-Anhänge: Konfiguration & Validierung ----------
const MAX_BILDER = 5;
const MAX_BILD_BYTES = 5 * 1024 * 1024; // 5 MB pro Bild (nach Base64-Dekodierung)
const ERLAUBTE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Prüft und bereinigt die vom Client gesendeten Bild-Anhänge.
// Gibt ein Array von { filename, content (Base64), content_type } für Resend zurück.
function verarbeiteBildAnhaenge(bilder) {
  if (!Array.isArray(bilder) || bilder.length === 0) return [];

  return bilder
    .slice(0, MAX_BILDER)
    .filter((bild) => {
      if (!bild || typeof bild !== 'object') return false;
      if (!ERLAUBTE_CONTENT_TYPES.includes(bild.contentType)) return false;
      if (typeof bild.base64 !== 'string' || bild.base64.length === 0) return false;

      // Grobe Größenprüfung anhand der Base64-Länge (Base64 ist ca. 4/3 der Originalgröße)
      const geschaetzteBytes = bild.base64.length * 0.75;
      if (geschaetzteBytes > MAX_BILD_BYTES) return false;

      return true;
    })
    .map((bild, index) => {
      const sicheresDateiname = cleanInput(bild.dateiname || `bild-${index + 1}.jpg`)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 100) || `bild-${index + 1}.jpg`;

      return {
        filename: sicheresDateiname,
        content: bild.base64,
        content_type: bild.contentType
      };
    });
}

// Bereinigt Text-Eingaben (verhindert einfache HTML/Skript-Injektion)
function cleanInput(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/<[^>]*>/g, '')   // HTML-Tags entfernen
    .replace(/[\r\n]/g, ' ');  // Zeilenumbrüche entfernen (Header-Injection-Schutz)
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  // Nur POST-Anfragen akzeptieren
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Ungültige Anfragemethode.' });
    return;
  }

  try {
    const body = req.body || {};

    const name = cleanInput(body.name);
    const email = cleanInput(body.email);
    const telefon = cleanInput(body.telefon);
    const plz = cleanInput(body.plz);
    const nachricht = cleanInput(body.nachricht);
    const quelle = cleanInput(body.quelle);

    const leistungen = cleanInput(body.leistungen);
    const flaeche = cleanInput(body.flaeche_m2);               // Summe aller Flächen
    const flaechenDetails = cleanInput(body.flaechen_details); // Fläche je Leistung, z. B. "Pflasterarbeiten: 40 m²; Rollrasen: 80 m²"
    const preisspanne = cleanInput(body.preisspanne);

    // Bild-Anhänge aus dem Kontaktformular (Drag & Drop, bereits im Browser komprimiert)
    const bildAnhaenge = verarbeiteBildAnhaenge(body.bilder);

    // Pflichtfelder prüfen
    if (!name || !email || !isValidEmail(email) || !nachricht) {
      res.status(400).json({
        status: 'error',
        message: 'Bitte füllen Sie alle erforderlichen Felder aus.'
      });
      return;
    }

    // Serverseitige PLZ-Prüfung.
    // Hart abgelehnt wird nur eine unvollständige oder nicht existierende PLZ.
    // Liegt der Ort außerhalb des Umkreises, wird die Anfrage trotzdem angenommen und
    // in der E-Mail zur manuellen Bewertung markiert (größere Projekte nach Absprache).
    const plzErgebnis = pruefePlz(plz);
    if (plzErgebnis.status === 'format' || plzErgebnis.status === 'unbekannt') {
      res.status(400).json({
        status: 'error',
        message: 'Bitte geben Sie eine gültige, fünfstellige Postleitzahl ein.'
      });
      return;
    }

    const ausserhalb = plzErgebnis.status === 'ausserhalb';
    const entfernungUnsicher = plzErgebnis.status === 'unsicher';

    let plzHinweis;      // Zeile im E-Mail-Text
    let betreffMarker;   // Zusatz im Betreff, damit die Anfrage im Postfach sofort auffällt
    if (ausserhalb) {
      plzHinweis = `ca. ${plzErgebnis.km} km Luftlinie ab Römerberg – AUSSERHALB des ${RADIUS_KM}-km-Gebiets. Bitte manuell bewerten (größeres Projekt nach Absprache?).`;
      betreffMarker = ` [außerhalb ${RADIUS_KM} km: ca. ${plzErgebnis.km} km]`;
    } else if (entfernungUnsicher) {
      plzHinweis = 'nicht automatisch ermittelbar (Sonder-PLZ ohne verlässliche Koordinaten) – bitte manuell prüfen.';
      betreffMarker = ' [Entfernung prüfen]';
    } else {
      plzHinweis = `ca. ${plzErgebnis.km} km Luftlinie ab Römerberg – innerhalb des ${RADIUS_KM}-km-Gebiets.`;
      betreffMarker = '';
    }

    // Flächenangabe für die E-Mail: bevorzugt die Aufschlüsselung je Leistung,
    // sonst die Summe (das Frontend sendet '0', wenn keine Fläche angegeben wurde)
    const flaecheText = flaechenDetails
      ? flaechenDetails
      : (flaeche && flaeche !== '0' ? `${flaeche} m² (gesamt)` : '(nicht angegeben)');

    // E-Mail-Inhalt zusammenstellen
    const textBody = [
      'Es ist eine neue Anfrage über das Kontaktformular der Website eingegangen.',
      '========================================================',
      '',
      'KUNDENDATEN',
      '--------------------------------------------------------',
      `Name:             ${name}`,
      `E-Mail:           ${email}`,
      `Telefon:          ${telefon || '(nicht angegeben)'}`,
      `PLZ:              ${plzErgebnis.plz}`,
      `Entfernung:       ${plzHinweis}`,
      `Aufmerksam durch: ${quelle || '(nicht angegeben)'}`,
      '',
      'PROJEKTDETAILS',
      '--------------------------------------------------------',
      nachricht,
      '',
      'DETAILS AUS DEM GARTENPLANER-RECHNER',
      '--------------------------------------------------------',
      `Gewählte Leistungen:      ${leistungen || '(keine Auswahl)'}`,
      `Fläche je Leistung:       ${flaecheText}`,
      `Errechnete Preisspanne:   ${preisspanne || '(nicht berechnet)'}`,
      '',
      'FOTOS',
      '--------------------------------------------------------',
      bildAnhaenge.length > 0
        ? `${bildAnhaenge.length} Foto(s) im Anhang dieser E-Mail.`
        : '(keine Fotos hochgeladen)',
      '',
      '========================================================',
      'Diese Nachricht wurde automatisch über das Kontaktformular',
      'auf der Website von GaLaBau Diwold generiert.'
    ].join('\n');

    // ---------- Versand über Resend ----------
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'GaLaBau Diwold Website <anfrage@galabau-diwold.de>',
        to: [EMPFAENGER],
        reply_to: email,
        subject: `Neue Anfrage über die Website – GaLaBau Diwold${betreffMarker}`,
        text: textBody,
        ...(bildAnhaenge.length > 0 ? { attachments: bildAnhaenge } : {})
      })
    });

    if (!resendResponse.ok) {
      const errorDetails = await resendResponse.text();
      console.error('Resend-Fehler:', errorDetails);
      res.status(500).json({
        status: 'error',
        message: 'Beim Versand ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns telefonisch.'
      });
      return;
    }

    const erfolgsText = ausserhalb
      ? `Ihre Nachricht wurde erfolgreich übermittelt. Ihr Projekt liegt außerhalb unseres üblichen Einsatzgebiets (${RADIUS_KM} km um Römerberg). Größere Projekte übernehmen wir nach Absprache – wir prüfen Ihre Anfrage und melden uns persönlich bei Ihnen.`
      : 'Ihre Nachricht wurde erfolgreich übermittelt.';

    res.status(200).json({
      status: 'success',
      message: erfolgsText
    });

  } catch (err) {
    console.error('Serverfehler:', err);
    res.status(500).json({
      status: 'error',
      message: 'Beim Versand ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns telefonisch.'
    });
  }
};
