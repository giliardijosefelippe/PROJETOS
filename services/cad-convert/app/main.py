"""
FastAPI microserviço: POST /convert (multipart file) → PDF + PNG.

Rodar localmente:
  cd services/cad-convert
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --host 127.0.0.1 --port 8091
"""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from .convert import CadConvertError, convert_bytes, converter_status

MAX_BYTES = int(os.environ.get("CAD_CONVERT_MAX_BYTES", str(40 * 1024 * 1024)))

app = FastAPI(
    title="Lunardeli CAD Convert",
    description="DWG/DXF → PDF/PNG via ezdxf (+ ODA opcional para DWG).",
    version="0.1.0",
)


@app.get("/health")
def health():
    return {"ok": True, "service": "lunardeli-cad-convert", **converter_status()}


@app.post("/convert")
async def convert(
    file: Annotated[UploadFile, File(...)],
    format: str = "pdf",  # pdf | png | both (default both via Accept / query)
):
    """
    Aceita .dxf ou .dwg.
    Query `format`:
      - pdf  → application/pdf
      - png  → image/png
      - both → JSON com metadados + base64 (uso interno / debug)
    Header opcional X-Return-Format: pdf|png|both (sobrescreve query).
    """
    name = file.filename or "drawing.dxf"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo maior que o limite de {MAX_BYTES} bytes.",
        )

    want = (format or "pdf").lower().strip()
    try:
        result = convert_bytes(name, data)
    except CadConvertError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    meta = {
        "source_format": result.source_format,
        "converter_path": result.converter_path,
        "notes": result.notes,
        "original_filename": name,
    }

    if want == "png":
        return Response(
            content=result.png_bytes,
            media_type="image/png",
            headers={
                "X-Cad-Source-Format": result.source_format,
                "X-Cad-Converter": result.converter_path,
                "Content-Disposition": 'inline; filename="preview.png"',
            },
        )

    if want == "both":
        import base64

        return JSONResponse(
            {
                **meta,
                "pdf_base64": base64.b64encode(result.pdf_bytes).decode("ascii"),
                "png_base64": base64.b64encode(result.png_bytes).decode("ascii"),
            }
        )

    # default pdf
    return Response(
        content=result.pdf_bytes,
        media_type="application/pdf",
        headers={
            "X-Cad-Source-Format": result.source_format,
            "X-Cad-Converter": result.converter_path,
            "Content-Disposition": 'inline; filename="preview.pdf"',
        },
    )


@app.post("/convert/bundle")
async def convert_bundle(file: Annotated[UploadFile, File(...)]):
    """Retorna PDF e PNG como multipart/related JSON base64 (para Next.js)."""
    import base64

    name = file.filename or "drawing.dxf"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande.")

    try:
        result = convert_bytes(name, data)
    except CadConvertError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    return {
        "ok": True,
        "source_format": result.source_format,
        "converter_path": result.converter_path,
        "notes": result.notes,
        "original_filename": name,
        "pdf_base64": base64.b64encode(result.pdf_bytes).decode("ascii"),
        "png_base64": base64.b64encode(result.png_bytes).decode("ascii"),
        "pdf_mime": "application/pdf",
        "png_mime": "image/png",
    }
