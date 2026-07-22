/**
 * api/senden.js
 * GaLaBau Diwold – Kontaktformular-Handler für Vercel (Node.js Serverless Function)
 * Validiert die eingehenden Daten und verschickt die Anfrage per E-Mail über Resend.
 */

// PLZ-Präfixe im 50-km-Radius um Römerberg (Pfalz)
const VALID_PLZ_PREFIXES = ['67', '68', '69', '76'];

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

    const leistungen = cleanInput(body.leistungen);
    const flaeche = cleanInput(body.flaeche_m2);
    const zusatzleistungen = cleanInput(body.zusatzleistungen);
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

    // Serverseitige PLZ-Umkreisprüfung (zusätzlich zur Frontend-Prüfung)
    const plzPrefix = plz.substring(0, 2);
    if (!plz || !VALID_PLZ_PREFIXES.includes(plzPrefix)) {
      res.status(400).json({
        status: 'error',
        message: 'Leider liegt Ihr Projekt außerhalb unseres aktuellen Einzugsgebiets (50 km um Römerberg).'
      });
      return;
    }

    // E-Mail-Inhalt zusammenstellen
    const textBody = [
      'Es ist eine neue Anfrage über das Kontaktformular der Website eingegangen.',
      '========================================================',
      '',
      'KUNDENDATEN',
      '--------------------------------------------------------',
      `Name:            ${name}`,
      `E-Mail:          ${email}`,
      `Telefon:         ${telefon || '(nicht angegeben)'}`,
      `PLZ:             ${plz}`,
      '',
      'PROJEKTDETAILS',
      '--------------------------------------------------------',
      nachricht,
      '',
      'DETAILS AUS DEM GARTENPLANER-RECHNER',
      '--------------------------------------------------------',
      `Gewählte Leistungen:      ${leistungen || '(keine Auswahl)'}`,
      `Fläche:                   ${flaeche ? flaeche + ' m²' : '(nicht angegeben)'}`,
      `Zusatzleistungen:         ${zusatzleistungen || '(keine Auswahl)'}`,
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
        subject: 'Neue Anfrage über die Website – GaLaBau Diwold',
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

    res.status(200).json({
      status: 'success',
      message: 'Ihre Nachricht wurde erfolgreich übermittelt.'
    });

  } catch (err) {
    console.error('Serverfehler:', err);
    res.status(500).json({
      status: 'error',
      message: 'Beim Versand ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns telefonisch.'
    });
  }
};
