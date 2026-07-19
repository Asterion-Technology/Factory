# RAD-19: convert the owner-maintained Ontario outreach workbook into the
# normalized seed CSV consumed by build-agency-seed.ts.
#
#   python packages/db/scripts/convert-ontario-xlsx.py \
#       docs/Ontario_Collection_Agency_Cease_Desist_Outreach_Researched.xlsx \
#       packages/db/seed-data/agencies/ca-on.csv
#
# The workbook is NOT checked in (it carries outreach-campaign data:
# escalation contacts, C&D tracking, notes). Only registry-reference fields
# cross into the CSV. The "Full Licence Registry" sheet drives rows (one per
# licence); the "Agency Outreach" sheet enriches matched legal names with
# verified public contact channels. Stdlib only — no pip installs.

import csv
import re
import sys
import zipfile
from datetime import date, timedelta
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

HEADER = [
    "country", "region", "name", "aliases", "licence_number", "licence_status",
    "expires_at", "phone", "email", "website", "address_line1", "address_line2",
    "city", "address_region", "postal_code", "source_registry", "source_url",
    "verified_at",
]

DEFAULT_SOURCE_URL = "https://collectionagencies.ca/provinces/ontario/licensed-collection-agencies"
SOURCE_REGISTRY = "collectionagencies.ca (Ontario licensed collection agencies)"
# The registry sheet's status column is captioned "Status as of 2026-07-19".
FALLBACK_VERIFIED_AT = "2026-07-19T00:00:00.000Z"


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def load_sheets(path):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    shared = [
        "".join(t.text or "" for t in si.findall(".//m:t", NS))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)
    ]
    sheets = {}
    for i, s in enumerate(wb.findall(".//m:sheet", NS), start=1):
        root = ET.fromstring(z.read(f"xl/worksheets/sheet{i}.xml"))
        rows = []
        for r in root.findall(".//m:row", NS):
            cells = {}
            for c in r.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None or v.text is None:
                    continue
                val = shared[int(v.text)] if c.get("t") == "s" else v.text
                cells[col_index(c.get("r"))] = str(val).strip()
            rows.append(cells)
        sheets[s.get("name")] = rows
    return sheets


def to_dicts(rows):
    if not rows:
        return []
    header = rows[0]
    width = max(header) + 1
    names = [header.get(i, "") for i in range(width)]
    out = []
    for cells in rows[1:]:
        if not cells:
            continue
        out.append({names[i]: cells.get(i, "") for i in range(width) if names[i]})
    return out


def excel_date(value):
    if not value:
        return ""
    try:
        serial = float(value)
    except ValueError:
        return value if re.match(r"^\d{4}-\d{2}-\d{2}$", value) else ""
    return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()


def norm_key(name):
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def map_status(raw):
    s = raw.lower()
    if "current" in s or "active" in s:
        return "active"
    if "expire" in s:
        return "expired"
    if "suspend" in s:
        return "suspended"
    if "revok" in s:
        return "revoked"
    return "unknown"


def main(xlsx_path, csv_path):
    sheets = load_sheets(xlsx_path)
    registry = to_dicts(sheets["Full Licence Registry"])
    outreach = {norm_key(r.get("Legal Name", "")): r for r in to_dicts(sheets["Agency Outreach"]) if r.get("Legal Name")}

    rows, seen_licences, skipped = [], set(), 0
    for reg in registry:
        legal = reg.get("Legal Name", "")
        if not legal:
            skipped += 1
            continue
        licence = reg.get("Licence Number", "")
        if licence and licence in seen_licences:
            print(f"warn: duplicate licence {licence} for {legal}; keeping first", file=sys.stderr)
            continue
        if licence:
            seen_licences.add(licence)

        extra = outreach.get(norm_key(legal), {})
        aliases = []
        for op in (reg.get("Operating Name", ""), extra.get("Operating Name", "")):
            if op and op not in aliases and norm_key(op) != norm_key(legal):
                aliases.append(op)

        mailing = extra.get("Mailing / Head Office Address", "")
        city = "" if mailing else reg.get("Registered City", "")
        email = extra.get("General Email", "") or extra.get("Ombudsman / Compliance Email", "")
        verified = excel_date(extra.get("Last Verified", ""))
        rows.append({
            "country": "CA",
            "region": "ON",
            "name": legal,
            "aliases": "|".join(aliases),
            "licence_number": licence,
            "licence_status": map_status(reg.get("Status as of 2026-07-19", "")),
            "expires_at": excel_date(reg.get("Expiry", "")),
            "phone": extra.get("Main Telephone", ""),
            "email": email,
            "website": extra.get("Website", ""),
            "address_line1": mailing,
            "address_line2": "",
            "city": city,
            "address_region": "ON" if city else "",
            "postal_code": "",
            "source_registry": SOURCE_REGISTRY,
            "source_url": reg.get("Source", "") or extra.get("Registry Source", "") or DEFAULT_SOURCE_URL,
            "verified_at": f"{verified}T00:00:00.000Z" if verified else FALLBACK_VERIFIED_AT,
        })

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {csv_path} (skipped {skipped} blank)", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: convert-ontario-xlsx.py <workbook.xlsx> <out.csv>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
