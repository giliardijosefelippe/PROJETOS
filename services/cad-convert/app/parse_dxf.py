"""
Parse DXF → layers/entities JSON (modelo alinhado ao MapaConcreto).
Usa ezdxf; não inventa elementos estruturais.
"""

from __future__ import annotations

import math
from typing import Any

import ezdxf
from ezdxf.document import Drawing
from ezdxf.entities import DXFEntity

from .convert import CadConvertError

# INSUNITS → meters (subset)
INSUNITS_TO_M = {
    0: 1.0,
    1: 0.0254,
    2: 0.3048,
    4: 0.001,
    5: 0.01,
    6: 1.0,
    7: 1000.0,
    14: 0.1,
}


def _unit_factor(doc: Drawing) -> tuple[float, int | None, str, list[str]]:
    warnings: list[str] = []
    try:
        ins = int(doc.header.get("$INSUNITS", 6))
    except Exception:
        ins = None
    if ins is None:
        warnings.append("INSUNITS ausente — assumindo metros.")
        return 1.0, None, "assumed_meters", warnings
    factor = INSUNITS_TO_M.get(ins)
    if factor is None:
        warnings.append(f"INSUNITS={ins} desconhecido — assumindo metros.")
        return 1.0, ins, "unknown", warnings
    labels = {
        0: "unitless",
        1: "inches",
        2: "feet",
        4: "millimeters",
        5: "centimeters",
        6: "meters",
        7: "kilometers",
        14: "decimeters",
    }
    if ins == 0:
        warnings.append("INSUNITS=0 (sem unidade): tratando como metros.")
    return factor, ins, labels.get(ins, str(ins)), warnings


def _scale_pts(pts: list[tuple[float, float]], f: float) -> list[list[float]]:
    return [[p[0] * f, p[1] * f] for p in pts]


def parse_dxf_bytes(data: bytes, filename: str = "drawing.dxf") -> dict[str, Any]:
    try:
        from io import BytesIO

        doc = ezdxf.read(BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        raise CadConvertError(f"Falha ao ler DXF: {exc}", code="DXF_PARSE_ERROR") from exc

    to_m, insunits, label, warnings = _unit_factor(doc)
    msp = doc.modelspace()
    layers_table = []
    for layer in doc.layers:
        layers_table.append(
            {
                "name": layer.dxf.name,
                "colorAci": int(layer.color) if layer.color else 7,
                "visible": not layer.is_off() and not layer.is_frozen(),
                "frozen": bool(layer.is_frozen()),
                "entityCount": 0,
            }
        )

    entities: list[dict[str, Any]] = []
    counts: dict[str, int] = {}

    def add_entity(
        layer: str,
        source_type: str,
        kind: str,
        coordinates: Any,
        handle: str | None = None,
        extra_warnings: list[str] | None = None,
    ) -> None:
        counts[layer] = counts.get(layer, 0) + 1
        entities.append(
            {
                "id": handle or f"ez-{len(entities)}",
                "layer": layer,
                "sourceType": source_type,
                "handle": handle,
                "geometryKind": kind,
                "coordinates": coordinates,
                "warnings": extra_warnings or [],
            }
        )

    for e in msp:
        try:
            _export_entity(e, to_m, add_entity)
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"Entidade ignorada ({e.dxftype()}): {exc}")

    for layer in layers_table:
        layer["entityCount"] = counts.get(layer["name"], 0)

    warnings.append(
        "Nenhum elemento estrutural foi criado automaticamente a partir do DXF. Use cadastro manual ou CSV."
    )

    return {
        "ok": True,
        "sourceFormat": "dxf",
        "parser": "ezdxf",
        "isDemo": False,
        "units": {"insunits": insunits, "label": label, "toMeters": to_m},
        "layers": layers_table,
        "entities": entities,
        "blocks": [b.name for b in doc.blocks if not b.name.startswith("*")],
        "warnings": warnings,
        "original_filename": filename,
    }


def _export_entity(e: DXFEntity, to_m: float, add) -> None:
    t = e.dxftype()
    layer = e.dxf.layer if e.dxf.hasattr("layer") else "0"
    handle = e.dxf.handle if e.dxf.hasattr("handle") else None

    if t == "LINE":
        pts = _scale_pts(
            [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)],
            to_m,
        )
        add(layer, t, "LineString", pts, handle)
        return

    if t in ("LWPOLYLINE", "POLYLINE"):
        try:
            pts = [(p[0], p[1]) for p in e.get_points("xy")]
        except Exception:
            pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]  # type: ignore[attr-defined]
        closed = bool(e.closed) if hasattr(e, "closed") else False
        scaled = _scale_pts(pts, to_m)
        if closed and len(scaled) >= 3:
            if scaled[0] != scaled[-1]:
                scaled = scaled + [scaled[0]]
            add(layer, t, "Polygon", [scaled], handle)
        else:
            add(layer, t, "LineString", scaled, handle)
        return

    if t == "CIRCLE":
        cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
        pts = []
        for i in range(33):
            a = 2 * math.pi * i / 32
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        scaled = _scale_pts(pts, to_m)
        add(layer, t, "Polygon", [scaled], handle)
        return

    if t == "INSERT":
        # Virtual entities with transform applied by ezdxf
        for ve in e.virtual_entities():
            _export_entity(ve, to_m, add)
        return
