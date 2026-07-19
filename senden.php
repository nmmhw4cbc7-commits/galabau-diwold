<?php
/**
 * senden.php
 * GaLaBau Diwold – Kontaktformular-Handler
 * Nimmt POST-Daten vom Kontaktformular + Gartenplaner-Rechner entgegen,
 * validiert und bereinigt sie, versendet eine E-Mail und antwortet als JSON.
 */

header('Content-Type: application/json; charset=utf-8');

// Nur POST-Anfragen akzeptieren
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        "status" => "error",
        "message" => "Ungültige Anfragemethode."
    ]);
    exit;
}

/**
 * Hilfsfunktion: bereinigt einen String-Input gegen XSS / Header-Injection.
 */
function clean_input($value) {
    $value = isset($value) ? trim($value) : '';
    $value = strip_tags($value);
    // Entfernt Zeilenumbrüche/Wagenrücklauf, um Header-Injection über mail() zu verhindern
    $value = str_replace(["\r", "\n", "%0a", "%0d"], '', $value);
    $value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    return $value;
}

// ---------- Eingehende Felder auslesen & bereinigen ----------
$name             = clean_input($_POST['name'] ?? '');
$emailRaw         = trim($_POST['email'] ?? '');
$telefon          = clean_input($_POST['telefon'] ?? '');
$plz              = clean_input($_POST['plz'] ?? '');
$nachricht        = clean_input($_POST['nachricht'] ?? '');

$leistungen       = clean_input($_POST['leistungen'] ?? '');
$flaeche          = clean_input($_POST['flaeche_m2'] ?? '');
$zusatzleistungen = clean_input($_POST['zusatzleistungen'] ?? '');
$preisspanne      = clean_input($_POST['preisspanne'] ?? '');

// E-Mail separat validieren (filter_var statt reiner htmlspecialchars-Bereinigung)
$email = filter_var($emailRaw, FILTER_SANITIZE_EMAIL);

// ---------- Validierung der Pflichtfelder ----------
if (
    $name === '' ||
    $email === '' ||
    !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    $nachricht === ''
) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Bitte füllen Sie alle erforderlichen Felder aus."
    ]);
    exit;
}

// ---------- Serverseitige PLZ-Umkreisprüfung (Absicherung des Frontend-Checks) ----------
$validPrefixes = ['67', '68', '69', '76'];
$plzPrefix = substr($plz, 0, 2);

if ($plz === '' || !in_array($plzPrefix, $validPrefixes, true)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Leider liegt Ihr Projekt außerhalb unseres aktuellen Einzugsgebiets (50 km um Römerberg)."
    ]);
    exit;
}

// ---------- E-Mail zusammenstellen ----------
$empfaenger = 'philippdachtler01@gmail.com';
$betreff    = 'Neue Anfrage über die Website – GaLaBau Diwold';

$body  = "Es ist eine neue Anfrage über das Kontaktformular der Website eingegangen.\r\n";
$body .= "========================================================\r\n\r\n";

$body .= "KUNDENDATEN\r\n";
$body .= "--------------------------------------------------------\r\n";
$body .= "Name:            " . $name . "\r\n";
$body .= "E-Mail:          " . $email . "\r\n";
$body .= "Telefon:         " . ($telefon !== '' ? $telefon : '(nicht angegeben)') . "\r\n";
$body .= "PLZ:             " . $plz . "\r\n\r\n";

$body .= "PROJEKTDETAILS\r\n";
$body .= "--------------------------------------------------------\r\n";
$body .= $nachricht . "\r\n\r\n";

$body .= "DETAILS AUS DEM GARTENPLANER-RECHNER\r\n";
$body .= "--------------------------------------------------------\r\n";
$body .= "Gewählte Leistungen:      " . ($leistungen !== '' ? $leistungen : '(keine Auswahl)') . "\r\n";
$body .= "Fläche:                   " . ($flaeche !== '' ? $flaeche . ' m²' : '(nicht angegeben)') . "\r\n";
$body .= "Zusatzleistungen:         " . ($zusatzleistungen !== '' ? $zusatzleistungen : '(keine Auswahl)') . "\r\n";
$body .= "Errechnete Preisspanne:   " . ($preisspanne !== '' ? $preisspanne : '(nicht berechnet)') . "\r\n\r\n";

$body .= "========================================================\r\n";
$body .= "Diese Nachricht wurde automatisch über das Kontaktformular\r\n";
$body .= "auf der Website von GaLaBau Diwold generiert.\r\n";

// ---------- Header setzen ----------
$absenderName = 'GaLaBau Diwold Website';
$headers  = "From: {$absenderName} <no-reply@galabau-diwold.de>\r\n";
$headers .= "Reply-To: {$name} <{$email}>\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";

// ---------- Versand ----------
$erfolg = @mail($empfaenger, $betreff, $body, $headers);

if ($erfolg) {
    echo json_encode([
        "status" => "success",
        "message" => "Ihre Nachricht wurde erfolgreich übermittelt."
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Beim Versand ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns telefonisch."
    ]);
}
