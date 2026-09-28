#!/usr/bin/env python3
"""Build CrewCheck's auditable S450/S750 provider snapshot from the published PDFs.

This is a maintenance script, not a Render runtime dependency. Install pdfplumber
locally and run it from the repository root. PDFs are kept outside version control;
the generated JSON records their URL, print date, page count and SHA-256 digest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber


SOURCE_PAGE = "https://www.garantiaseg.com.br/plano-de-saude/amil/rede-credenciada-amil/"
SOURCES = [
    ("AC", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_AC.pdf"),
    ("AL", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_AL.pdf"),
    ("AP", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_AP.pdf"),
    ("BA", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_BA.pdf"),
    ("BA_LABS", "diagnostic", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Laboratorios_BA.pdf"),
    ("CE", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Hospitais_CE.pdf"),
    ("DF", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_DF-2.pdf"),
    ("ES", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Hospitais_ES.pdf"),
    ("GO", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_GO.pdf"),
    ("MA", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_MA.pdf"),
    ("MT", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_MT.pdf"),
    ("MS", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_MS.pdf"),
    ("MG", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_MG-1.pdf"),
    ("PA", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_PA-1.pdf"),
    ("PB", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Hospitais_PB.pdf"),
    ("PR", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Hospitais_PR.pdf"),
    ("PE", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_PE.pdf"),
    ("PI", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_PI.pdf"),
    ("RJ", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_RJ_2025-06.pdf"),
    ("RJ_LABS", "diagnostic", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Laboratorios_RJ.pdf"),
    ("RN", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_RN.pdf"),
    ("RN_LABS", "diagnostic", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Laboratorios_RN.pdf"),
    # The page labels this link as laboratories, but the PDF itself is a hospital network table.
    ("RS_LABS", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Laboratorios_RS.pdf"),
    ("RO", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_RO-1.pdf"),
    ("RR", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_RR.pdf"),
    ("SC", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_SC.pdf"),
    ("SP", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_SP_2025-06.pdf"),
    ("SP_LABS", "diagnostic", "https://www.garantiaseg.com.br/wp-content/uploads/2024/03/Rede_Amil_Laboratorios_SP.pdf"),
    ("SE", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_SE.pdf"),
    ("TO", "hospital", "https://www.garantiaseg.com.br/wp-content/uploads/2025/06/Rede_Amil_Hospitais_TO.pdf"),
]


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized(value: object) -> str:
    text = unicodedata.normalize("NFD", clean(value).upper())
    return "".join(character for character in text if unicodedata.category(character) != "Mn")


def service_codes(value: object) -> list[str]:
    text = normalized(value).replace("\uf00d", " ").replace("\uf00c", " ")
    matches = re.findall(r"PS CARD|PS OBST|H CARD|H ORT|PSI|PSO|HP|HD|PA|PS|M|H", text)
    return list(dict.fromkeys(matches))


def source_state(source_id: str) -> str:
    return source_id.split("_", 1)[0]


def crop_text(page, box) -> str:
    return clean(page.crop(box).extract_text(x_tolerance=2, y_tolerance=3))


def hospital_rows(pdf, source_id: str, source_category: str) -> list[dict]:
    records: list[dict] = []
    state = source_state(source_id)
    for page_number, page in enumerate(pdf.pages, 1):
        for table in page.find_tables():
            xs = sorted({cell[0] for cell in table.cells} | {cell[2] for cell in table.cells})
            if len(xs) < 6 or len(table.rows) < 2:
                continue
            header_bottom = table.rows[1].bbox[3]
            headers = [
                normalized(crop_text(page, (x0 + 0.4, table.bbox[1] + 0.4, x1 - 0.4, header_bottom - 0.4)))
                for x0, x1 in zip(xs, xs[1:])
            ]
            s450_index = next((index for index, value in enumerate(headers) if "S450" in value), None)
            s750_index = next((index for index, value in enumerate(headers) if "S750" in value), None)
            if s450_index is None or s750_index is None:
                continue
            name_index = next((index for index, value in enumerate(headers) if "PRESTADOR" in value), 0)
            city_index = next((index for index, value in enumerate(headers) if "CIDADE" in value), 2)
            region_index = next((index for index, value in enumerate(headers) if "REGIAO" in value), 1)

            # pdfplumber occasionally drops the rounded final row. Horizontal first-column
            # edges preserve that boundary, so use them instead of only table.rows.
            raw_boundaries = [header_bottom]
            for edge in page.edges:
                if edge.get("orientation") != "h" or edge["top"] < header_bottom - 1 or edge["top"] > 790:
                    continue
                if abs(edge["x0"] - xs[0]) < 2 and abs(edge["x1"] - xs[1]) < 2:
                    raw_boundaries.append(float(edge["top"]))
            boundaries: list[float] = []
            for value in sorted(raw_boundaries):
                if not boundaries or value - boundaries[-1] > 2:
                    boundaries.append(value)

            for top, bottom in zip(boundaries, boundaries[1:]):
                if bottom - top < 8:
                    continue
                values = [
                    crop_text(page, (x0 + 0.4, top + 0.8, x1 - 0.4, bottom - 0.8))
                    for x0, x1 in zip(xs, xs[1:])
                ]
                name = values[name_index]
                plans = {"S450": service_codes(values[s450_index]), "S750": service_codes(values[s750_index])}
                if not name or not any(plans.values()):
                    continue
                records.append({
                    "name": name,
                    "region": values[region_index],
                    "city": values[city_index],
                    "state": state,
                    "category": source_category,
                    "plans": plans,
                    "sourceId": source_id,
                    "sourcePage": page_number,
                })
    return records


def diagnostic_rows(pdf, source_id: str) -> list[dict]:
    records: list[dict] = []
    state = source_state(source_id)
    for page_number, page in enumerate(pdf.pages, 1):
        words = page.extract_words(x_tolerance=2, y_tolerance=3)
        plan_labels: dict[str, float] = {}
        for word in words:
            label = normalized(word["text"])
            if label in {"S750", "S580", "S450", "S380"} and word["top"] < 140:
                plan_labels[label] = (word["x0"] + word["x1"]) / 2
        if not {"S450", "S750"}.issubset(plan_labels):
            continue

        def header_center(label: str):
            candidates = [word for word in words if normalized(word["text"]) == label and word["top"] < 140]
            return (candidates[0]["x0"] + candidates[0]["x1"]) / 2 if candidates else None

        centers = [90.0, header_center("ESTADO"), header_center("REGIAO"), header_center("CIDADE")]
        if any(value is None for value in centers[1:]):
            continue
        plan_centers = [value for value in plan_labels.values() if value]
        mark_groups: list[dict] = []
        for word in words:
            if word["text"] not in {"\uf00c", "\uf00d"} or word["top"] < 120:
                continue
            x_center = (word["x0"] + word["x1"]) / 2
            if min(abs(x_center - value) for value in plan_centers) > 14:
                continue
            y_center = (word["top"] + word["bottom"]) / 2
            group = next((item for item in mark_groups if abs(item["y"] - y_center) < 3), None)
            if group is None:
                group = {"y": y_center, "items": []}
                mark_groups.append(group)
            group["items"].append((x_center, word["text"]))
        mark_groups.sort(key=lambda item: item["y"])
        legend_tops = [word["top"] for word in words if normalized(word["text"]).startswith("LEGENDA") and word["top"] > 120]
        # Legend text starts on the same baseline as some right-column labels.
        # Leave a small guard band so the last provider row cannot absorb it.
        content_bottom = min(legend_tops) - 10 if legend_tops else 780
        column_centers = [float(value) for value in centers]
        boundaries = [30.0] + [
            (column_centers[index] + column_centers[index + 1]) / 2 for index in range(3)
        ] + [(column_centers[3] + plan_labels["S750"]) / 2]

        for index, group in enumerate(mark_groups):
            top = 120 if index == 0 else (mark_groups[index - 1]["y"] + group["y"]) / 2
            bottom = content_bottom if index == len(mark_groups) - 1 else (group["y"] + mark_groups[index + 1]["y"]) / 2
            if bottom <= top:
                continue
            values = [crop_text(page, (boundaries[i], top, boundaries[i + 1], bottom)) for i in range(4)]

            def covered(plan: str) -> bool:
                nearest = min(group["items"], key=lambda item: abs(item[0] - plan_labels[plan]))
                return abs(nearest[0] - plan_labels[plan]) < 14 and nearest[1] == "\uf00c"

            plans = {"S450": ["DIAGNOSTICO"] if covered("S450") else [], "S750": ["DIAGNOSTICO"] if covered("S750") else []}
            if values[0] and any(plans.values()):
                records.append({
                    "name": values[0],
                    "region": values[2],
                    "city": values[3],
                    "state": state,
                    "category": "diagnostic",
                    "plans": plans,
                    "sourceId": source_id,
                    "sourcePage": page_number,
                })
    return records


def printed_at(pdf) -> str:
    pattern = re.compile(r"Data da impress[aã]o:\s*(\d{2}/\d{2}/\d{4})", re.I)
    for page in pdf.pages:
        match = pattern.search(page.extract_text() or "")
        if match:
            day, month, year = match.group(1).split("/")
            return f"{year}-{month}-{day}"
    return ""


def stable_id(record: dict) -> str:
    identity = "|".join(normalized(record.get(key)) for key in ("state", "city", "name", "category"))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]


def download_sources(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for source_id, _, url in SOURCES:
        destination = directory / f"{source_id}.pdf"
        if destination.exists():
            continue
        print(f"Downloading {source_id}…")
        request = urllib.request.Request(url, headers={"User-Agent": "CrewCheck network importer/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            destination.write_bytes(response.read())


def build(input_directory: Path) -> dict:
    providers: list[dict] = []
    source_metadata: list[dict] = []
    for source_id, category, url in SOURCES:
        path = input_directory / f"{source_id}.pdf"
        if not path.exists():
            raise FileNotFoundError(f"Missing {path}")
        with pdfplumber.open(path) as pdf:
            if category == "diagnostic":
                records = diagnostic_rows(pdf, source_id)
            else:
                records = hospital_rows(pdf, source_id, category)
            date = printed_at(pdf)
            pages = len(pdf.pages)
        for record in records:
            record["id"] = stable_id(record)
        providers.extend(records)
        source_metadata.append({
            "id": source_id,
            "state": source_state(source_id),
            "category": category,
            "url": url,
            "fileName": url.rsplit("/", 1)[-1],
            "printedAt": date,
            "pages": pages,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "importedRecords": len(records),
            "plansPresent": [plan for plan in ("S450", "S750") if any(item["plans"][plan] for item in records)],
        })

    seen: set[str] = set()
    unique_providers: list[dict] = []
    for provider in providers:
        if provider["id"] in seen:
            continue
        seen.add(provider["id"])
        unique_providers.append(provider)
    unique_providers.sort(key=lambda item: (item["state"], normalized(item["city"]), normalized(item["name"])))
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourcePage": SOURCE_PAGE,
        "plans": ["S450", "S750"],
        "missingPublishedStates": ["AM"],
        "disclaimer": "Snapshot informativo. Confirme rede, elegibilidade, especialidade, horário e autorização nos canais oficiais da Amil antes do atendimento.",
        "sources": source_metadata,
        "providers": unique_providers,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("tmp/pdfs/amil"))
    parser.add_argument("--output", type=Path, default=Path("server/data/amil-network-s450-s750.json"))
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    if args.download:
        download_sources(args.input)
    payload = build(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['providers'])} providers from {len(payload['sources'])} PDFs to {args.output}")


if __name__ == "__main__":
    main()
