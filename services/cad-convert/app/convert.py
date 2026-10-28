"""
Convert DXF (native via ezdxf) and DWG (via optional ODA File Converter) to PDF/PNG.

DWG binary is not fully readable by ezdxf alone. Realistic open-source path:
1. Prefer DXF uploads (ezdxf).
2. For true DWG, install ODA File Converter (free registration, no paid API key)
   or LibreCAD/QCAD CLI if available, then convert DWG → DXF → render.
3. Autodesk Forge is intentionally NOT the primary path.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import ezdxf
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from ezdxf.addons.drawing import Frontend, RenderContext  # noqa: E402
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend  # noqa: E402
from reportlab.lib.pagesizes import landscape, A3  # noqa: E402
from reportlab.lib.utils import ImageReader  # noqa: E402
from reportlab.pdfgen import canvas as pdf_canvas  # noqa: E402

SUPPORTED_EXT = {".dxf", ".dwg"}
ODA_BIN = os.environ.get("ODA_FILE_CONVERTER", "ODAFileConverter")
LIBRECAD_BIN = os.environ.get("LIBRECAD_BIN", "librecad")


@dataclass
class ConvertResult:
    pdf_bytes: bytes
    png_bytes: bytes
    source_format: str
    converter_path: str
    notes: list[str]


class CadConvertError(Exception):
    def __init__(self, message: str, code: str = "CAD_CONVERT_ERROR"):
        super().__init__(message)
        self.code = code
        self.message = message


def oda_available() -> bool:
    return shutil.which(ODA_BIN) is not None


def converter_status() -> dict:
    return {
        "ezdxf": True,
        "oda_file_converter": oda_available(),
        "oda_bin": ODA_BIN,
        "librecad": shutil.which(LIBRECAD_BIN) is not None,
        "dwg_supported": oda_available(),
        "dxf_supported": True,
        "notes": [
            "DXF: renderizado com ezdxf + matplotlib (PDF/PNG).",
            "DWG: requer ODA File Converter no PATH (gratuito com registro ODA) "
            "para DWG→DXF; depois o mesmo pipeline ezdxf. Sem Forge como caminho primário.",
        ],
    }


def _ext(name: str) -> str:
    return Path(name).suffix.lower()


def _dwg_to_dxf(dwg_path: Path, out_dir: Path) -> Path:
    """Convert DWG → DXF via ODA File Converter if installed."""
    if not oda_available():
        raise CadConvertError(
            "Arquivo DWG exige conversor DWG→DXF. Instale o ODA File Converter "
            "(Open Design Alliance, registro gratuito) e defina ODA_FILE_CONVERTER, "
            "ou envie DXF. Forge/Autodesk não é o caminho primário deste serviço.",
            code="DWG_CONVERTER_MISSING",
        )

    in_dir = out_dir / "in"
    dxf_dir = out_dir / "out"
    in_dir.mkdir(parents=True, exist_ok=True)
    dxf_dir.mkdir(parents=True, exist_ok=True)
    staged = in_dir / dwg_path.name
    shutil.copy2(dwg_path, staged)

    # ODAFileConverter <input> <output> <output_version> <output_type> <recurse> <audit>
    # output_type: DXF ; version e.g. ACAD2018
    cmd = [
        ODA_BIN,
        str(in_dir),
        str(dxf_dir),
        "ACAD2018",
        "DXF",
        "0",
        "1",
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("CAD_CONVERT_TIMEOUT_SEC", "120")),
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise CadConvertError(
            "Timeout na conversão DWG→DXF via ODA File Converter.",
            code="DWG_CONVERT_TIMEOUT",
        ) from exc

    candidates = list(dxf_dir.rglob("*.dxf")) + list(dxf_dir.rglob("*.DXF"))
    if not candidates:
        detail = (proc.stderr or proc.stdout or "").strip()[:500]
        raise CadConvertError(
            "ODA File Converter não gerou DXF. "
            + (detail or f"exit={proc.returncode}"),
            code="DWG_CONVERT_FAILED",
        )
    return candidates[0]


def _render_dxf(dxf_path: Path, work: Path) -> tuple[Path, Path]:
    """Render modelspace to PNG + PDF via ezdxf drawing addon."""
    try:
        doc = ezdxf.readfile(str(dxf_path))
    except ezdxf.DXFError as exc:
        raise CadConvertError(
            f"DXF inválido ou não suportado: {exc}",
            code="DXF_READ_ERROR",
        ) from exc

    msp = doc.modelspace()
    fig = plt.figure(figsize=(16, 10), dpi=120)
    ax = fig.add_axes([0, 0, 1, 1])
    ctx = RenderContext(doc)
    backend = MatplotlibBackend(ax)
    try:
        Frontend(ctx, backend).draw_layout(msp, finalize=True)
    except Exception as exc:  # noqa: BLE001 — surface as convert error
        plt.close(fig)
        raise CadConvertError(
            f"Falha ao renderizar DXF: {exc}",
            code="DXF_RENDER_ERROR",
        ) from exc

    png_path = work / "preview.png"
    fig.savefig(png_path, dpi=120, bbox_inches="tight", facecolor="white")
    plt.close(fig)

    pdf_path = work / "preview.pdf"
    _png_to_pdf(png_path, pdf_path)
    return pdf_path, png_path


def _png_to_pdf(png_path: Path, pdf_path: Path) -> None:
    page = landscape(A3)
    c = pdf_canvas.Canvas(str(pdf_path), pagesize=page)
    page_w, page_h = page
    img = ImageReader(str(png_path))
    iw, ih = img.getSize()
    scale = min((page_w - 36) / iw, (page_h - 36) / ih)
    w, h = iw * scale, ih * scale
    x = (page_w - w) / 2
    y = (page_h - h) / 2
    c.drawImage(img, x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
    c.showPage()
    c.save()


def convert_bytes(filename: str, data: bytes) -> ConvertResult:
    ext = _ext(filename)
    if ext not in SUPPORTED_EXT:
        raise CadConvertError(
            f"Extensão não suportada: {ext or '(vazia)'}. Use .dxf ou .dwg.",
            code="UNSUPPORTED_FORMAT",
        )

    notes: list[str] = []
    with tempfile.TemporaryDirectory(prefix="lunardeli-cad-") as tmp:
        work = Path(tmp)
        src = work / f"input{ext}"
        src.write_bytes(data)

        if ext == ".dwg":
            notes.append("DWG→DXF via ODA File Converter")
            dxf_path = _dwg_to_dxf(src, work / "oda")
            converter_path = "oda+ezdxf"
            source_format = "dwg"
        else:
            notes.append("DXF nativo via ezdxf")
            dxf_path = src
            converter_path = "ezdxf"
            source_format = "dxf"

        pdf_path, png_path = _render_dxf(dxf_path, work)
        notes.append("Preview PDF/PNG gerado para o pipeline de anotações")
        return ConvertResult(
            pdf_bytes=pdf_path.read_bytes(),
            png_bytes=png_path.read_bytes(),
            source_format=source_format,
            converter_path=converter_path,
            notes=notes,
        )
