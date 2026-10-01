# Quelle der PLZ-Koordinaten (`plz-de.json`)

Die Datei wurde aus dem öffentlichen Datensatz
<https://github.com/zauberware/postal-codes-json-xml-csv> (Deutschland, `DE.zip`) erzeugt.
Pro Postleitzahl wird der Median der enthaltenen Koordinaten verwendet; PLZ mit mehr als 25 km
Streuung (Großkunden-PLZ) erhalten keine Koordinaten.

Lizenz der Quelldaten: **Creative Commons Attribution 4.0 (CC BY 4.0)** –
<https://creativecommons.org/licenses/by/4.0/>. Die Daten basieren auf GeoNames (<https://www.geonames.org>).
Die Namensnennung ist hiermit erfolgt; bei Änderungen an den Daten bitte erneut prüfen.
Neu erzeugen: `python3 scripts/build-plz-data.py <zipcodes.de.json>`
