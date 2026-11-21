"""
Parse IFC → elementos MapaConcreto (GUID, tipo, Qto).
Usa ifcopenshell quando instalado; caso contrário retorna erro explícito
(o app Next.js tem parser STEP textual próprio para fixtures).
Nunca inventa volumes.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from .convert import CadConvertError


def ifcopenshell_available() -> bool:
    try:
        import ifcopenshell  # noqa: F401

        return True
    except Exception:
        return False


TYPE_MAP = {
    "IfcSlab": "laje",
    "IfcBeam": "viga",
    "IfcColumn": "pilar",
    "IfcWall": "parede",
    "IfcWallStandardCase": "parede",
    "IfcFooting": "fundacao",
    "IfcPile": "fundacao",
    "IfcRaftFoundation": "radier",
}


def parse_ifc_bytes(data: bytes, filename: str = "model.ifc") -> dict[str, Any]:
    if not ifcopenshell_available():
        raise CadConvertError(
            "ifcopenshell não instalado neste serviço. "
            "Use o parser STEP do app Next.js ou: pip install ifcopenshell",
            code="IFC_ENGINE_MISSING",
        )

    import ifcopenshell
    import ifcopenshell.util.element as element_util
    import ifcopenshell.util.unit as unit_util

    with tempfile.TemporaryDirectory(prefix="lunardeli-ifc-") as tmp:
        path = Path(tmp) / filename
        path.write_bytes(data)
        try:
            model = ifcopenshell.open(str(path))
        except Exception as exc:  # noqa: BLE001
            raise CadConvertError(
                f"Falha ao abrir IFC: {exc}",
                code="IFC_READ_ERROR",
            ) from exc

    warnings: list[str] = []
    try:
        length_scale = float(unit_util.calculate_unit_scale(model))
    except Exception:
        length_scale = 1.0
        warnings.append("Unidade IFC não resolvida — assumindo metros (fator 1).")

    schema = model.schema
    project = model.by_type("IfcProject")
    project_name = None
    if project:
        project_name = project[0].Name or project[0].LongName

    elements: list[dict[str, Any]] = []
    for ifc_type, kind in TYPE_MAP.items():
        for el in model.by_type(ifc_type):
            guid = el.GlobalId
            name = el.Name or guid
            qto = element_util.get_psets(el, qtos_only=True)
            psets = element_util.get_psets(el, psets_only=True)
            volume = None
            area = None
            quantity_origin = None
            for qset_name, props in qto.items():
                for key, val in props.items():
                    if key == "id":
                        continue
                    if volume is None and "volume" in key.lower() and isinstance(val, (int, float)):
                        volume = float(val)
                        quantity_origin = f"{qset_name}.{key}"
                    if area is None and "area" in key.lower() and isinstance(val, (int, float)):
                        area = float(val)
            if volume is None:
                warnings.append(
                    f"{guid}: volume ausente no IFC — não inventado."
                )
            elements.append(
                {
                    "guid": guid,
                    "ifcType": ifc_type,
                    "kind": kind,
                    "name": name,
                    "objectType": getattr(el, "ObjectType", None),
                    "tag": getattr(el, "Tag", None),
                    "properties": psets,
                    "quantities": qto,
                    "volumeM3": volume,
                    "areaM2": area,
                    "quantityOrigin": quantity_origin,
                    "lengthUnitToM": length_scale,
                }
            )

    return {
        "ok": True,
        "sourceFormat": "ifc",
        "parser": "ifcopenshell",
        "schema": schema,
        "projectName": project_name,
        "unit": {"name": "from_ifcopenshell", "toMeters": length_scale},
        "elements": elements,
        "warnings": warnings
        + [
            "Vista 3D não gerada neste serviço.",
            "Volumes apenas quando presentes em Qto*.",
        ],
        "notes": [
            "Pipeline gratuito (ifcopenshell). Sem SDK pago.",
        ],
        "original_filename": filename,
    }
