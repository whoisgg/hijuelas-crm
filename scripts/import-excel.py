#!/usr/bin/env python3
"""
Hijuelas CRM - Excel Importer
=============================

Reads `~/Downloads/BBDD ventas (1).xlsx` (ONLY the "Compromisos" sheet),
normalizes the data (trim, typo fixes, currency mapping, incoterm parsing,
contract-number generation), deduplicates clients with fuzzy matching, and
emits a single idempotent SQL file at `scripts/seed-from-excel.sql` that
can be executed against the Supabase database.

In addition to the main SQL file, four split files are written to /tmp:
  /tmp/seed-contacts.sql, /tmp/seed-contracts.sql,
  /tmp/seed-items.sql, /tmp/seed-payments.sql
each containing only the INSERTs for the corresponding table.

The generated SQL uses `SELECT id FROM ... WHERE ...` subqueries for FKs
(no hardcoded UUIDs) and wraps everything in a single transaction. To make
the importer re-runnable it first DELETEs the rows it previously inserted
(identified by `legacy_excel_row IS NOT NULL` on contract_items, plus a
narrow delete on clients/contracts/etc that have `source = 'excel_import'`
or no descendants). Catalog rows (countries / organizations / species /
genetic_programs / opportunity_stages) are NEVER touched.

Usage:
    python3 scripts/import-excel.py [--excel PATH] [--out PATH]

Defaults:
    --excel  ~/Downloads/BBDD ventas (1).xlsx
    --out    scripts/seed-from-excel.sql
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------

DEFAULT_EXCEL = Path.home() / "Downloads" / "BBDD ventas (1).xlsx"
DEFAULT_OUT = Path(__file__).resolve().parent / "seed-from-excel.sql"

SHEETS = ["Compromisos"]

# Allowed enum values from the Supabase schema (verified via MCP)
ENUM_CURRENCY = {"CLP", "USD", "EUR"}
ENUM_CONTRACT_STATUS = {
    "borrador",
    "por_revisar",
    "firmado",
    "en_proceso",
    "finalizado",
    "cancelado",
}
ENUM_CONDITION = {"venta", "reposicion", "muestra"}
ENUM_SALE_TYPE = {"nacional", "exportacion"}
ENUM_MATERIAL = {"vitro", "raiz_cubierta", "otros"}
ENUM_DELIVERY_STATUS = {"pendiente", "en_proceso", "finalizado", "eliminado"}
ENUM_PAYMENT_STATUS = {"pendiente", "pagado", "vencido"}
ENUM_PAYMENT_TYPE = {"anticipo_1", "anticipo_2", "saldo"}

# ---------------------------------------------------------------------------
# Normalization dictionaries
# ---------------------------------------------------------------------------

COUNTRY_NORMALIZE = {
    "potugal": "Portugal",
    "portugal": "Portugal",
    "mexico": "México",
    "méxico": "México",
    "peru": "Perú",
    "perú": "Perú",
    "chile": "Chile",
    "argentina": "Argentina",
    "brasil": "Brasil",
    "colombia": "Colombia",
    "ecuador": "Ecuador",
    "españa": "España",
    "holanda": "Holanda",
    "marruecos": "Marruecos",
    "zambia": "Zambia",
    "azerbaijan": "Azerbaiyán",
    "azerbaiyán": "Azerbaiyán",
    "corea": "Corea del Sur",
    "corea del sur": "Corea del Sur",
}

SPECIES_NORMALIZE = {
    "arándano": "Arándano",
    "arandano": "Arándano",
    "frambuesa": "Frambuesa",
    "mora": "Mora",
    "cítricos": "Cítricos",
    "citricos": "Cítricos",
    "avellano": "Avellano",
    "portainjerto": "Portainjerto",
    "murtilla": "Murtilla",
    "zarzaparilla": "Zarzaparrilla",
    "zarzaparrilla": "Zarzaparrilla",
}

GENETIC_PROGRAM_NORMALIZE = {
    "bloom fresh": "Bloom Fresh",
    "driscolls": "Driscolls",
    "driscoll's": "Driscolls",
    "earth market": "Earth Market",
    "fall creek genetics": "Fall Creek Genetics",
    "fall creek": "Fall Creek Genetics",
    "florida": "Florida",
    "hortifrut": "Hortifrut",
    "libre": "Libre",
    "variedades libres": "Libre",
    "variedad publica": "Variedad Publica",
    "variedad pública": "Variedad Publica",
    "mbo": "MBO",
    "michigan": "Michigan",
    "northwest plant company": "Northwest Plant Company",
    "npc": "Northwest Plant Company",
    "oregon blueberries": "Oregon Blueberries",
    "osu": "OSU",
    "oz": "OZ",
    "royal": "Royal",
}

# Map Excel "Empresa vendedora" → org contract_prefix (the unique key)
ORG_PREFIX_BY_NAME = {
    "frutivar": "FRU",
    "hmc": "HMC",
    "in vitro lab": "IVL",
    "inversiones san juan de la luz": "SJL",
    "inversiones san juan de la luz sac": "SJL",
    "sociedad agricola catapilco": "CAT",
    "sociedad agricola catapilco ltda": "CAT",
    "viveros hijuelas frutales": "VHF",
    "viveros hijuelas s.a": "VHSA",
    "viveros hijuelas s.a.": "VHSA",
    "viveros hijuelas sa": "VHSA",
    "viveros hijelas sa": "VHSA",  # typo in source
    "viveros nefuen ltda": "NEF",
    "viveros stonefly ltda": "STF",
    "viveros vh": "VH",
    "viveros vh sa": "VH",
    "zoe nursery sa de cv": "ZOE",
}

CURRENCY_MAP = {
    "dólares": "USD",
    "dolares": "USD",
    "usd": "USD",
    "pesos": "CLP",
    "clp": "CLP",
    "euro": "EUR",
    "euros": "EUR",
    "eur": "EUR",
}

CONDITION_MAP = {
    "venta": "venta",
    "reposicion": "reposicion",
    "reposición": "reposicion",
    "muestra": "muestra",
}

SALE_TYPE_MAP = {
    "exportación": "exportacion",
    "exportacion": "exportacion",
    "nacional": "nacional",
}

MATERIAL_MAP = {
    "vitro": "vitro",
    "raiz cubierta": "raiz_cubierta",
    "raíz cubierta": "raiz_cubierta",
    "-": None,
    "": None,
}

DELIVERY_STATUS_MAP = {
    "pendiente": "pendiente",
    "en proceso": "en_proceso",
    "finalizado": "finalizado",
    "eliminado": "eliminado",
}

CONTRACT_STATUS_MAP = {
    "firmado": "firmado",
    "por revisar": "por_revisar",
    "pendiente": "borrador",
    "no califica": "borrador",
    "reposición": "borrador",
    "spot": "borrador",
    "-": "borrador",
    "": "borrador",
}

PAYMENT_STATUS_MAP = {
    "pagado": "pagado",
    "pendiente": "pendiente",
    "no califica": "pendiente",  # we still record the row but mark pending
    "vencido": "vencido",
}

MONTH_MAP = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11,
    "diciembre": 12,
}

INCOTERM_RE = re.compile(r"\b(EXW|FOB|CIF|DDP|FCA|CPT|CFR|DAP|DPU)\b", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def sql_str(value: Any) -> str:
    """Render a Python value as a SQL string literal or NULL."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        if pd.isna(value):
            return "NULL"
        # Integers stay as integers; floats keep up to 4 decimals.
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return f"{value}"
    s = str(value).replace("'", "''")
    return f"'{s}'"


def sql_num(value: Any) -> str:
    """Render a numeric value or NULL. NaN → NULL."""
    if value is None:
        return "NULL"
    try:
        if pd.isna(value):
            return "NULL"
    except (TypeError, ValueError):
        pass
    try:
        f = float(value)
    except (TypeError, ValueError):
        return "NULL"
    if f.is_integer():
        return str(int(f))
    return f"{f}"


def sql_int(value: Any) -> str:
    """Render an integer or NULL."""
    if value is None:
        return "NULL"
    try:
        if pd.isna(value):
            return "NULL"
    except (TypeError, ValueError):
        pass
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return "NULL"


def trim_str(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    s = str(value).strip()
    if s == "" or s == "-":
        return None
    return s


def normalize_key(s: Any) -> str:
    if s is None:
        return ""
    try:
        if pd.isna(s):
            return ""
    except (TypeError, ValueError):
        pass
    if not isinstance(s, str):
        s = str(s)
    return re.sub(r"\s+", " ", s.strip().lower())


# ---------------------------------------------------------------------------
# Warning / report collection
# ---------------------------------------------------------------------------


@dataclass
class Report:
    rows_read: int = 0
    rows_emitted: int = 0
    rows_skipped: int = 0
    warnings: list[str] = field(default_factory=list)
    skip_reasons: Counter = field(default_factory=Counter)
    dedup_candidates: list[tuple[str, str, float]] = field(default_factory=list)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def skip(self, row_idx: int, reason: str) -> None:
        self.rows_skipped += 1
        self.skip_reasons[reason] += 1
        self.warnings.append(f"Row {row_idx}: skipped ({reason})")


# ---------------------------------------------------------------------------
# Excel loading
# ---------------------------------------------------------------------------


def load_sheets(excel_path: Path) -> pd.DataFrame:
    """Load the Compromisos sheet (only) into a DataFrame, tagging origin."""
    frames = []
    for sheet in SHEETS:
        df = pd.read_excel(excel_path, sheet_name=sheet)
        df.columns = [c.strip() for c in df.columns]
        df["__sheet__"] = sheet
        df["__sheet_row__"] = df.index + 2  # +2 = header row + 1-based
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    return combined


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def norm_country(raw: str | None) -> str | None:
    if raw is None:
        return None
    return COUNTRY_NORMALIZE.get(normalize_key(raw), raw.strip())


def norm_species(raw: str | None) -> str | None:
    if raw is None:
        return None
    return SPECIES_NORMALIZE.get(normalize_key(raw))


def norm_genetic_program(raw: str | None) -> str | None:
    if raw is None:
        return None
    return GENETIC_PROGRAM_NORMALIZE.get(normalize_key(raw))


def norm_org_prefix(raw: str | None) -> str | None:
    if raw is None:
        return None
    key = normalize_key(raw)
    if key in ORG_PREFIX_BY_NAME:
        return ORG_PREFIX_BY_NAME[key]
    # Fallback: try prefix match
    for k, prefix in ORG_PREFIX_BY_NAME.items():
        if key.startswith(k) or k.startswith(key):
            return prefix
    return None


def norm_currency(raw: str | None) -> tuple[str | None, str | None]:
    """Return (currency_code, warning) — warning is a human message if input was unmappable."""
    if raw is None:
        return None, None
    key = normalize_key(raw)
    if key in CURRENCY_MAP:
        return CURRENCY_MAP[key], None
    if key == "agricola":
        return None, f"Currency 'Agricola' is not a real currency"
    return None, f"Currency '{raw}' is unknown"


def parse_incoterm(raw: Any) -> tuple[str | None, str | None]:
    """Return (canonical_incoterm, leftover_for_notes)."""
    raw = trim_str(raw)
    if raw is None:
        return None, None
    m = INCOTERM_RE.search(raw)
    if not m:
        # E.g. "Venta 2024" → no incoterm, push the whole thing to notes
        return None, raw.strip()
    incoterm = m.group(1).upper()
    leftover = (raw[: m.start()] + raw[m.end():]).strip()
    leftover = leftover.strip(" ,;-") or None
    return incoterm, leftover


def parse_month(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        if pd.isna(raw):
            return None
    except (TypeError, ValueError):
        pass
    if not isinstance(raw, str):
        return None
    key = normalize_key(raw)
    # Handle "Noviembre/Enero" → take the first
    if "/" in key:
        key = key.split("/")[0].strip()
    return MONTH_MAP.get(key)


def parse_year(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        if pd.isna(raw):
            return None
    except (TypeError, ValueError):
        pass
    s = str(raw).strip()
    # Handle "2024/2025" → take the first
    if "/" in s:
        s = s.split("/")[0]
    try:
        y = int(float(s))
    except (TypeError, ValueError):
        return None
    # Sanity check
    if y < 2000 or y > 2100:
        return None
    return y


def parse_week(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        if pd.isna(raw):
            return None
    except (TypeError, ValueError):
        pass
    # Datetime in source → derive ISO week
    if hasattr(raw, "isocalendar"):
        try:
            return int(raw.isocalendar()[1])
        except Exception:
            return None
    s = str(raw).strip()
    if "/" in s:
        s = s.split("/")[0]
    try:
        w = int(float(s))
    except (TypeError, ValueError):
        return None
    if 1 <= w <= 53:
        return w
    return None


def derive_week_from_month(month: int | None) -> int:
    """Fallback when Wk is missing. Approximate."""
    if month is None:
        return 1
    return (month - 1) * 4 + 2


def norm_condition(raw: str | None) -> str:
    if raw is None:
        return "venta"
    return CONDITION_MAP.get(normalize_key(raw), "venta")


def norm_sale_type(raw: str | None) -> str | None:
    if raw is None:
        return None
    return SALE_TYPE_MAP.get(normalize_key(raw))


def norm_material(raw: str | None) -> str | None:
    if raw is None:
        return None
    return MATERIAL_MAP.get(normalize_key(raw))


def norm_delivery_status(raw: str | None) -> str:
    if raw is None:
        return "pendiente"
    return DELIVERY_STATUS_MAP.get(normalize_key(raw), "pendiente")


def norm_contract_status(raw: str | None) -> str:
    if raw is None:
        return "borrador"
    return CONTRACT_STATUS_MAP.get(normalize_key(raw), "borrador")


def norm_payment_status(raw: str | None) -> str:
    if raw is None:
        return "pendiente"
    return PAYMENT_STATUS_MAP.get(normalize_key(raw), "pendiente")


# ---------------------------------------------------------------------------
# Client deduplication (fuzzy)
# ---------------------------------------------------------------------------


def dedup_clients(names: Iterable[str], threshold: float = 0.85) -> tuple[dict[str, str], list[tuple[str, str, float]]]:
    """Return (raw_name → canonical_name mapping, list of fuzzy candidate pairs)."""
    cleaned = sorted({n.strip() for n in names if n and n.strip()})
    mapping: dict[str, str] = {}
    candidates: list[tuple[str, str, float]] = []

    # Group by a normalized key (lower, no extra spaces). The canonical name is
    # the longest variant (usually the most complete form).
    by_key: dict[str, list[str]] = defaultdict(list)
    for name in cleaned:
        by_key[normalize_key(name)].append(name)

    canonical_by_key: dict[str, str] = {}
    for k, variants in by_key.items():
        canonical = max(variants, key=len)
        canonical_by_key[k] = canonical
        for v in variants:
            mapping[v] = canonical

    # Fuzzy compare canonical names to flag merge candidates (NOT auto-merged).
    canonicals = sorted(set(canonical_by_key.values()))
    for i, a in enumerate(canonicals):
        for b in canonicals[i + 1:]:
            ratio = SequenceMatcher(None, normalize_key(a), normalize_key(b)).ratio()
            if ratio >= threshold:
                candidates.append((a, b, round(ratio, 3)))

    return mapping, candidates


# ---------------------------------------------------------------------------
# Contract number generation
# ---------------------------------------------------------------------------


def make_contract_number(org_prefix: str, year: int, seq: int) -> str:
    return f"{org_prefix}-{year}-{seq:04d}"


# ---------------------------------------------------------------------------
# SQL building
# ---------------------------------------------------------------------------


@dataclass
class SqlBuilder:
    lines: list[str] = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)

    def add(self, sql: str, table: str | None = None) -> None:
        self.lines.append(sql)
        if table:
            self.counts[table] += 1

    def header(self, msg: str) -> None:
        self.lines.append("")
        self.lines.append(f"-- {'-' * 76}")
        self.lines.append(f"-- {msg}")
        self.lines.append(f"-- {'-' * 76}")


def org_id_sql(prefix: str) -> str:
    return f"(SELECT id FROM organizations WHERE contract_prefix = '{prefix}')"


def country_id_sql(name: str) -> str:
    safe = name.replace("'", "''")
    return f"(SELECT id FROM countries WHERE name_es = '{safe}')"


def species_id_sql(name: str) -> str:
    safe = name.replace("'", "''")
    return f"(SELECT id FROM species WHERE name = '{safe}')"


def genetic_program_id_sql(name: str) -> str:
    safe = name.replace("'", "''")
    return f"(SELECT id FROM genetic_programs WHERE name = '{safe}')"


def variety_id_sql(species_name: str, variety_name: str) -> str:
    sp = species_name.replace("'", "''")
    vr = variety_name.replace("'", "''")
    return (
        f"(SELECT v.id FROM varieties v JOIN species s ON s.id = v.species_id "
        f"WHERE s.name = '{sp}' AND v.name = '{vr}')"
    )


def client_id_sql(name: str) -> str:
    safe = name.replace("'", "''")
    return (
        f"(SELECT id FROM clients WHERE name = '{safe}' AND source = 'excel_import' LIMIT 1)"
    )


def contract_id_sql(number: str) -> str:
    safe = number.replace("'", "''")
    return f"(SELECT id FROM contracts WHERE number = '{safe}')"


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run(excel_path: Path, out_path: Path) -> Report:
    report = Report()
    df = load_sheets(excel_path)
    report.rows_read = len(df)

    # ---- Pass 1: collect normalized values & dedup --------------------------

    # Clean string columns up-front
    str_cols = [
        "País origen", "País Destino", "Región", "Empresa vendedora", "Cliente",
        "# Contrato", "Situación Contrato", "Situación Anticipo 1",
        "Situación Anticipo 2", "Condición", "Tipo de venta", "Centro de costo",
        "Especie", "Variedad", "Tipo de material", "Situación entrega",
        "Programa genético", "Formato", "Moneda", "Incoterm", "Rut", "Giro",
        "Comentario", "Contacto", "Teléfono de contacto", "Mail", "Punto contacto",
    ]
    for col in str_cols:
        if col in df.columns:
            df[col] = df[col].apply(trim_str)

    # Collect unique varieties (species + variety + program)
    varieties: dict[tuple[str, str], dict[str, Any]] = {}
    unknown_species_rows: list[int] = []
    skipped_no_variety: list[int] = []

    for idx, row in df.iterrows():
        sp_raw = row.get("Especie")
        var_raw = row.get("Variedad")
        sp = norm_species(sp_raw) if sp_raw else None
        var = trim_str(var_raw)
        gp = norm_genetic_program(row.get("Programa genético"))

        if not sp:
            if sp_raw:
                report.warn(f"Row {row['__sheet_row__']} ({row['__sheet__']}): unknown species '{sp_raw}'")
                unknown_species_rows.append(idx)
            continue
        if not var:
            skipped_no_variety.append(idx)
            continue

        key = (sp, var)
        if key not in varieties:
            varieties[key] = {"species": sp, "variety": var, "program": gp}
        elif gp and not varieties[key]["program"]:
            varieties[key]["program"] = gp

    # Collect raw client names (with their tax_id / giro / country / region / contact info)
    @dataclass
    class ClientRaw:
        name: str
        tax_id: str | None = None
        giro: str | None = None
        country: str | None = None
        region: str | None = None
        contact_name: str | None = None
        contact_phone: str | None = None
        contact_email: str | None = None
        notes: str | None = None

    raw_clients: dict[str, ClientRaw] = {}
    for _, row in df.iterrows():
        name_raw = row.get("Cliente")
        if not name_raw:
            continue
        name = name_raw.strip()
        if name not in raw_clients:
            raw_clients[name] = ClientRaw(name=name)
        c = raw_clients[name]
        # Fill in fields the first time we see them
        rut = row.get("Rut")
        if rut and not c.tax_id:
            c.tax_id = str(rut).strip()
        giro = row.get("Giro")
        if giro and not c.giro and giro.strip().lower() not in {"agricola", "agrícola"}:
            c.giro = giro.strip()
        country = norm_country(row.get("País Destino"))
        if country and not c.country:
            c.country = country
        region = row.get("Región")
        if region and not c.region:
            c.region = region.strip()
        contact = row.get("Contacto")
        if contact and not c.contact_name:
            c.contact_name = contact.strip()
        phone = row.get("Teléfono de contacto")
        if phone and not c.contact_phone:
            phone_str = str(phone).strip()
            # Drop trailing .0 from floats
            if phone_str.endswith(".0"):
                phone_str = phone_str[:-2]
            c.contact_phone = phone_str
        email = row.get("Mail")
        if email and not c.contact_email:
            c.contact_email = email.strip()

    client_map, dedup_candidates = dedup_clients(raw_clients.keys())
    report.dedup_candidates = dedup_candidates

    # Build canonical client list
    canonical_clients: dict[str, ClientRaw] = {}
    for raw_name, canon_name in client_map.items():
        src = raw_clients[raw_name]
        if canon_name not in canonical_clients:
            canonical_clients[canon_name] = ClientRaw(name=canon_name)
        dst = canonical_clients[canon_name]
        for field_name in ("tax_id", "giro", "country", "region", "contact_name", "contact_phone", "contact_email"):
            if not getattr(dst, field_name) and getattr(src, field_name):
                setattr(dst, field_name, getattr(src, field_name))

    # ---- Pass 2: collect contracts & contract_items -------------------------

    @dataclass
    class ContractRow:
        number: str
        client: str
        org_prefix: str
        currency: str | None
        incoterm: str | None
        incoterm_notes: str | None
        condition: str
        sale_type: str | None
        status: str
        notes: str | None
        total_neto: float
        total_iva: float
        anticipo_1: float
        iva_anticipo_1: float
        anticipo_1_status: str
        anticipo_2: float
        iva_anticipo_2: float
        anticipo_2_status: str
        saldo: float
        iva_saldo: float

    @dataclass
    class ItemRow:
        contract_number: str
        species: str
        variety: str
        qty_plants: int
        qty_delivered: int
        format: str | None
        unit_price: float
        currency: str
        material: str | None
        delivery_year: int
        delivery_week: int
        delivery_month: int | None
        status: str
        genetic_program: str | None
        legacy_excel_row: int
        notes: str | None

    contracts_by_key: dict[tuple[str, str], ContractRow] = {}  # (number_or_synth, canon_client) → contract
    items: list[ItemRow] = []
    # For contract-number generation per (org, year)
    auto_seq: dict[tuple[str, int], int] = defaultdict(lambda: 0)

    for _, row in df.iterrows():
        excel_row = int(row["__sheet_row__"])
        sheet_label = row["__sheet__"]

        # --- Required fields -------------------------------------------------
        client_raw = row.get("Cliente")
        if not client_raw:
            report.skip(excel_row, "no client")
            continue
        client_canon = client_map.get(client_raw.strip())
        if not client_canon:
            report.skip(excel_row, "client could not be canonicalized")
            continue

        sp = norm_species(row.get("Especie"))
        var = trim_str(row.get("Variedad"))
        if not sp or not var:
            report.skip(excel_row, "missing species or variety")
            continue

        org_prefix = norm_org_prefix(row.get("Empresa vendedora"))
        if not org_prefix:
            emp = row.get("Empresa vendedora")
            reason = "missing empresa vendedora" if not emp else f"unknown empresa vendedora '{emp}'"
            report.skip(excel_row, reason)
            continue

        qty_plants = row.get("# plantas")
        try:
            qty_plants_int = int(float(qty_plants))
        except (TypeError, ValueError):
            report.skip(excel_row, "invalid # plantas")
            continue

        # --- Currency & incoterm --------------------------------------------
        currency, curr_warn = norm_currency(row.get("Moneda"))
        if curr_warn:
            report.warn(f"Row {excel_row} ({sheet_label}): {curr_warn} — defaulting to USD")
        currency = currency or "USD"

        incoterm, incoterm_leftover = parse_incoterm(row.get("Incoterm"))

        # --- Delivery date components ---------------------------------------
        year = parse_year(row.get("Año entrega")) or 2024
        if year > 2100 or year < 2000:
            year = 2024
        week = parse_week(row.get("Wk entrega"))
        month = parse_month(row.get("Mes entrega"))
        if week is None:
            week = derive_week_from_month(month)

        # --- Contract number -------------------------------------------------
        contract_raw = row.get("# Contrato")
        # Only accept legacy numbers that look like real contract IDs
        # (digits, optionally with a -N suffix like "246-1"). Reject phrases
        # like "No califica", "Spot", "Pendiente" etc.
        is_real_contract_id = (
            contract_raw is not None
            and contract_raw not in {"-", ""}
            and re.match(r"^\d+(-\d+)?$", str(contract_raw).strip()) is not None
        )
        if is_real_contract_id:
            contract_number = f"{org_prefix}-{year}-LEG{str(contract_raw).strip()}"
        else:
            key = (org_prefix, year)
            auto_seq[key] += 1
            contract_number = make_contract_number(org_prefix, year, 9000 + auto_seq[key])

        # Multiple rows for the same legacy contract number → use the same contract
        contract_key = (contract_number, client_canon)

        # --- Build / update contract record ---------------------------------
        notes_parts = []
        if row.get("Comentario"):
            notes_parts.append(row["Comentario"])
        if incoterm_leftover:
            notes_parts.append(f"Incoterm note: {incoterm_leftover}")
        if row.get("Centro de costo"):
            notes_parts.append(f"Centro de costo: {row['Centro de costo']}")
        if sheet_label == "Fall Creek":
            notes_parts.append("source_sheet:Fall Creek")
        notes = " | ".join(notes_parts) if notes_parts else None

        def num_or_zero(v: Any) -> float:
            try:
                f = float(v)
                if pd.isna(f):
                    return 0.0
                return f
            except (TypeError, ValueError):
                return 0.0

        cr_total_neto = num_or_zero(row.get("Total Neto"))
        cr_total_iva = num_or_zero(row.get("Total IVA"))

        if contract_key not in contracts_by_key:
            contracts_by_key[contract_key] = ContractRow(
                number=contract_number,
                client=client_canon,
                org_prefix=org_prefix,
                currency=currency,
                incoterm=incoterm,
                incoterm_notes=incoterm_leftover,
                condition=norm_condition(row.get("Condición")),
                sale_type=norm_sale_type(row.get("Tipo de venta")),
                status=norm_contract_status(row.get("Situación Contrato")),
                notes=notes,
                total_neto=cr_total_neto,
                total_iva=cr_total_iva,
                anticipo_1=num_or_zero(row.get("Anticipo 1")),
                iva_anticipo_1=num_or_zero(row.get("IVA anticipo 1")),
                anticipo_1_status=norm_payment_status(row.get("Situación Anticipo 1")),
                anticipo_2=num_or_zero(row.get("Anticipo 2")),
                iva_anticipo_2=num_or_zero(row.get("IVA anticipo 2")),
                anticipo_2_status=norm_payment_status(row.get("Situación Anticipo 2")),
                saldo=num_or_zero(row.get("Saldo")),
                iva_saldo=num_or_zero(row.get("IVA saldo")),
            )
        else:
            # Aggregate totals across rows of the same contract
            c = contracts_by_key[contract_key]
            c.total_neto += cr_total_neto
            c.total_iva += cr_total_iva
            c.anticipo_1 += num_or_zero(row.get("Anticipo 1"))
            c.iva_anticipo_1 += num_or_zero(row.get("IVA anticipo 1"))
            c.anticipo_2 += num_or_zero(row.get("Anticipo 2"))
            c.iva_anticipo_2 += num_or_zero(row.get("IVA anticipo 2"))
            c.saldo += num_or_zero(row.get("Saldo"))
            c.iva_saldo += num_or_zero(row.get("IVA saldo"))

        # --- Build item record ----------------------------------------------
        try:
            qty_delivered = int(float(row.get("# entregada"))) if not pd.isna(row.get("# entregada")) else 0
        except (TypeError, ValueError):
            qty_delivered = 0

        try:
            unit_price = float(row.get("Valor planta"))
            if pd.isna(unit_price):
                unit_price = 0.0
        except (TypeError, ValueError):
            unit_price = 0.0

        item_notes_parts = []
        if row.get("Punto contacto"):
            item_notes_parts.append(f"Punto contacto: {row['Punto contacto']}")
        if row.get("Centro de costo"):
            item_notes_parts.append(f"Centro de costo: {row['Centro de costo']}")
        item_notes = " | ".join(item_notes_parts) if item_notes_parts else None

        items.append(ItemRow(
            contract_number=contract_number,
            species=sp,
            variety=var,
            qty_plants=qty_plants_int,
            qty_delivered=qty_delivered,
            format=row.get("Formato"),
            unit_price=unit_price,
            currency=currency,
            material=norm_material(row.get("Tipo de material")),
            delivery_year=year,
            delivery_week=week,
            delivery_month=month,
            status=norm_delivery_status(row.get("Situación entrega")),
            genetic_program=norm_genetic_program(row.get("Programa genético")),
            legacy_excel_row=excel_row,
            notes=item_notes,
        ))
        report.rows_emitted += 1

    # ---- Build the SQL ------------------------------------------------------

    sb = SqlBuilder()
    sb.add("-- Hijuelas CRM seed from BBDD ventas (1).xlsx")
    sb.add("-- Generated by scripts/import-excel.py")
    sb.add(f"-- Source: Compromisos sheet only ({report.rows_read} rows)")
    sb.add("-- Idempotent: deletes any prior excel-imported rows before re-inserting.")
    sb.add("-- Varieties are upserted with ON CONFLICT DO NOTHING (kept across runs).")
    sb.add("-- DOES NOT touch catalog tables (countries, organizations, species,")
    sb.add("--   genetic_programs, opportunity_stages) — they are seeded separately.")
    sb.add("")
    sb.add("BEGIN;")
    sb.add("")

    # --- Idempotency: clean previous excel-imported data ---------------------
    # Order matters: children → parents to respect FKs.
    # Varieties are NOT deleted (would break FKs with other rows in the future,
    # and INSERTs use ON CONFLICT DO NOTHING so re-runs are safe).
    sb.header("Idempotency cleanup (delete prior excel-imported data)")
    sb.add("DELETE FROM payments WHERE contract_id IN (")
    sb.add("  SELECT id FROM contracts WHERE notes LIKE 'source:excel_import%'")
    sb.add(");")
    sb.add("DELETE FROM contract_items WHERE legacy_excel_row IS NOT NULL;")
    sb.add("DELETE FROM contracts WHERE notes LIKE 'source:excel_import%';")
    sb.add("DELETE FROM client_contacts WHERE client_id IN (")
    sb.add("  SELECT id FROM clients WHERE source = 'excel_import'")
    sb.add(");")
    sb.add("DELETE FROM clients WHERE source = 'excel_import';")
    sb.add("")

    # --- Varieties -----------------------------------------------------------
    sb.header(f"Varieties ({len(varieties)} unique)")
    for (sp, var), info in sorted(varieties.items()):
        gp_sql = (
            genetic_program_id_sql(info["program"]) if info["program"] else "NULL"
        )
        sb.add(
            f"INSERT INTO varieties (name, species_id, genetic_program_id) VALUES "
            f"({sql_str(var)}, {species_id_sql(sp)}, {gp_sql}) "
            f"ON CONFLICT (species_id, name) DO NOTHING;",
            "varieties",
        )

    # --- Clients -------------------------------------------------------------
    sb.header(f"Clients ({len(canonical_clients)} unique after dedup)")
    for name, c in sorted(canonical_clients.items()):
        country_expr = country_id_sql(c.country) if c.country else "NULL"
        sb.add(
            "INSERT INTO clients (name, tax_id, giro, country_id, region, source, notes) VALUES ("
            f"{sql_str(c.name)}, {sql_str(c.tax_id)}, {sql_str(c.giro)}, "
            f"{country_expr}, {sql_str(c.region)}, 'excel_import', NULL);",
            "clients",
        )

    # --- Client contacts -----------------------------------------------------
    contact_count = sum(1 for c in canonical_clients.values() if c.contact_name or c.contact_email or c.contact_phone)
    sb.header(f"Client contacts ({contact_count} with at least one contact field)")
    for name, c in sorted(canonical_clients.items()):
        if not (c.contact_name or c.contact_email or c.contact_phone):
            continue
        contact_name = c.contact_name or "Contacto principal"
        sb.add(
            "INSERT INTO client_contacts (client_id, name, email, phone, is_primary) VALUES ("
            f"{client_id_sql(name)}, {sql_str(contact_name)}, "
            f"{sql_str(c.contact_email)}, {sql_str(c.contact_phone)}, true);",
            "client_contacts",
        )

    # --- Contracts -----------------------------------------------------------
    sb.header(f"Contracts ({len(contracts_by_key)} unique)")
    for (_, _), ctr in sorted(contracts_by_key.items(), key=lambda kv: kv[0]):
        notes_field = f"source:excel_import"
        if ctr.notes:
            safe_notes = ctr.notes.replace("\n", " ")
            notes_field += " | " + safe_notes
        sb.add(
            "INSERT INTO contracts (number, client_id, organization_id, status, currency, incoterm, "
            "condition, sale_type, notes, total_neto, total_iva, total_neto_usd) VALUES ("
            f"{sql_str(ctr.number)}, {client_id_sql(ctr.client)}, {org_id_sql(ctr.org_prefix)}, "
            f"{sql_str(ctr.status)}::contract_status, {sql_str(ctr.currency or 'USD')}::currency_code, "
            f"{sql_str(ctr.incoterm)}, {sql_str(ctr.condition)}::condition_type, "
            f"{sql_str(ctr.sale_type) + '::sale_type' if ctr.sale_type else 'NULL'}, "
            f"{sql_str(notes_field)}, {sql_num(ctr.total_neto)}, {sql_num(ctr.total_iva)}, 0) "
            "ON CONFLICT (number) DO NOTHING;",
            "contracts",
        )

    # --- Contract items ------------------------------------------------------
    sb.header(f"Contract items ({len(items)} rows)")
    for it in items:
        material_expr = f"{sql_str(it.material)}::material_type" if it.material else "NULL"
        gp_expr = genetic_program_id_sql(it.genetic_program) if it.genetic_program else "NULL"
        sb.add(
            "INSERT INTO contract_items (contract_id, variety_id, qty_plants, qty_delivered, format, "
            "unit_price, currency, material_type, delivery_year, delivery_week, delivery_month, "
            "status, genetic_program_id, legacy_excel_row, notes) VALUES ("
            f"{contract_id_sql(it.contract_number)}, {variety_id_sql(it.species, it.variety)}, "
            f"{sql_int(it.qty_plants)}, {sql_int(it.qty_delivered)}, {sql_str(it.format)}, "
            f"{sql_num(it.unit_price)}, {sql_str(it.currency)}::currency_code, {material_expr}, "
            f"{sql_int(it.delivery_year)}, {sql_int(it.delivery_week)}, {sql_int(it.delivery_month)}, "
            f"{sql_str(it.status)}::delivery_status, {gp_expr}, "
            f"{sql_int(it.legacy_excel_row)}, {sql_str(it.notes)});",
            "contract_items",
        )

    # --- Payments (3 per contract) ------------------------------------------
    sb.header(f"Payments ({len(contracts_by_key) * 3} = 3 per contract)")
    for (_, _), ctr in sorted(contracts_by_key.items(), key=lambda kv: kv[0]):
        for ptype, amount, iva, status in [
            ("anticipo_1", ctr.anticipo_1, ctr.iva_anticipo_1, ctr.anticipo_1_status),
            ("anticipo_2", ctr.anticipo_2, ctr.iva_anticipo_2, ctr.anticipo_2_status),
            ("saldo", ctr.saldo, ctr.iva_saldo, "pendiente"),
        ]:
            sb.add(
                "INSERT INTO payments (contract_id, type, amount, iva, currency, status) VALUES ("
                f"{contract_id_sql(ctr.number)}, {sql_str(ptype)}::payment_type, "
                f"{sql_num(amount)}, {sql_num(iva)}, "
                f"{sql_str(ctr.currency or 'USD')}::currency_code, "
                f"{sql_str(status)}::payment_status);",
                "payments",
            )

    sb.add("")
    sb.add("COMMIT;")
    sb.add("")

    # --- Write SQL -----------------------------------------------------------
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(sb.lines) + "\n", encoding="utf-8")

    # --- Write split files to /tmp -------------------------------------------
    # Each contains only the INSERT statements for the corresponding table.
    split_targets = {
        "/tmp/seed-contacts.sql": "INSERT INTO client_contacts ",
        "/tmp/seed-contracts.sql": "INSERT INTO contracts ",
        "/tmp/seed-items.sql": "INSERT INTO contract_items ",
        "/tmp/seed-payments.sql": "INSERT INTO payments ",
    }
    split_sizes: dict[str, int] = {}
    for path_str, prefix in split_targets.items():
        matching = [line for line in sb.lines if line.startswith(prefix)]
        content = "\n".join(matching) + ("\n" if matching else "")
        Path(path_str).write_text(content, encoding="utf-8")
        split_sizes[path_str] = Path(path_str).stat().st_size

    # --- Print report --------------------------------------------------------
    print("=" * 76)
    print("HIJUELAS CRM — Excel Importer Report")
    print("=" * 76)
    print(f"Rows read           : {report.rows_read}")
    print(f"Rows emitted        : {report.rows_emitted}")
    print(f"Rows skipped        : {report.rows_skipped}")
    print()
    print(f"Unique varieties    : {len(varieties)}")
    print(f"Unique clients      : {len(canonical_clients)} (from {len(raw_clients)} raw names)")
    print(f"Unique contracts    : {len(contracts_by_key)}")
    print(f"Contract items      : {len(items)}")
    print(f"Payments            : {len(contracts_by_key) * 3}")
    print()
    print("Skip reasons:")
    for reason, n in report.skip_reasons.most_common():
        print(f"  {n:4d}  {reason}")
    print()
    print("Counts by table (INSERT statements):")
    for table, n in sorted(sb.counts.items()):
        print(f"  {table:20s} {n}")
    total_inserts = sum(sb.counts.values())
    print(f"  {'TOTAL':20s} {total_inserts}")
    print()
    print(f"Fuzzy-match merge candidates (similarity >= 0.85): {len(report.dedup_candidates)}")
    for a, b, r in sorted(report.dedup_candidates, key=lambda t: -t[2])[:15]:
        print(f"  {r:.3f}  {a!r}  ↔  {b!r}")
    print()
    print(f"Output written      : {out_path}")
    print(f"Output size         : {out_path.stat().st_size:,} bytes")
    print()
    print("Split files (/tmp):")
    for path_str, size in split_sizes.items():
        print(f"  {path_str:30s} {size:>10,} bytes")
    print()
    print("Top 15 warnings:")
    for w in report.warnings[:15]:
        print(f"  - {w}")
    print()
    print("To apply: review the SQL, then execute it via the Supabase MCP `apply_migration` or `execute_sql`.")

    return report


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--excel", type=Path, default=DEFAULT_EXCEL)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = p.parse_args()

    if not args.excel.exists():
        print(f"ERROR: Excel file not found: {args.excel}", file=sys.stderr)
        return 1

    run(args.excel, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
