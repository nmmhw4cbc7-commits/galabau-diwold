#!/usr/bin/env python3
"""
Erzeugt api/_lib/plz-de.json aus dem öffentlichen PLZ-Datensatz
https://github.com/zauberware/postal-codes-json-xml-csv  (data/DE.zip -> zipcodes.de.json)
Lizenz der Quelldaten: CC BY 4.0 (siehe api/_lib/PLZ-DATEN-LIZENZ.md)

Aufruf:  python3 scripts/build-plz-data.py /pfad/zu/zipcodes.de.json

Ausgabe: { "67354": [49.295, 8.407], "10875": null, ... }
  - Schlüssel vorhanden  -> PLZ existiert (gültig)
  - Wert [lat, lon]      -> Median aller Einträge dieser PLZ (3 Nachkommastellen, ca. 100 m)
  - Wert null            -> PLZ gültig, aber Koordinaten unzuverlässig (Streuung > 25 km,
                            typisch bei Großkunden-PLZ) -> Entfernung muss manuell geprüft werden
"""
import json, math, statistics, sys, collections, pathlib

MAX_STREUUNG_KM = 25

def hav(a, b, c, e):
    R = 6371.0088; p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((e - b) * p / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

src = pathlib.Path(sys.argv[1])
by = collections.defaultdict(list)
for r in json.loads(src.read_text(encoding="utf-8")):
    z = r.get("zipcode", "")
    try:
        by[z].append((float(r["latitude"]), float(r["longitude"])))
    except (KeyError, ValueError):
        by.setdefault(z, [])

out = {}
for z in sorted(by):
    if len(z) != 5 or not z.isdigit():
        continue
    pts = by[z]
    if not pts:
        out[z] = None
        continue
    la = statistics.median(p[0] for p in pts)
    lo = statistics.median(p[1] for p in pts)
    streu = max(hav(la, lo, p[0], p[1]) for p in pts)
    out[z] = None if streu > MAX_STREUUNG_KM else [round(la, 3), round(lo, 3)]

dest = pathlib.Path(__file__).resolve().parent.parent / "api" / "_lib" / "plz-de.json"
dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print(f"{len(out)} PLZ geschrieben, davon {sum(v is None for v in out.values())} ohne verlässliche Koordinaten -> {dest}")
