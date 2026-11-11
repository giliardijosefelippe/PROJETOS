# Serviço CAD Convert (Python)

Microserviço local/cloud para **Lunardeli Engenharia — Conferência de Projetos / MapaConcreto**.

Converte **DXF** (nativo) e **DWG** (via ODA → DXF intermediário) em **PDF + PNG** e JSON de layers/entities. IFC opcional via **ifcopenshell**.

## Por que Python + ezdxf / ODA (não Forge)

- Requisito: leitura CAD via **biblioteca Python**, sem Autodesk Forge como caminho primário e **sem SDK pago** embutido.
- **ezdxf** lê DXF e renderiza modelspace (addon `drawing` + matplotlib).
- **DWG binário** não é lido nativamente: use **ODA File Converter** (registro gratuito ODA) para **DWG→DXF**, depois o mesmo pipeline.
- **IFC:** `ifcopenshell` (open source, opcional). O app Next.js também tem parser STEP textual para fixtures/CI.

## Rodar

```bash
cd services/cad-convert
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Opcional IFC:
pip install ifcopenshell
uvicorn app.main:app --host 127.0.0.1 --port 8091
```

Health: [http://127.0.0.1:8091/health](http://127.0.0.1:8091/health)

```bash
CAD_CONVERT_URL=http://127.0.0.1:8091
```

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/health` | Status + ODA + ifcopenshell |
| POST | `/convert` | Multipart → PDF/PNG |
| POST | `/convert/bundle` | PDF+PNG base64 (Next.js) |
| POST | `/parse` | DXF ou DWG→DXF → layers/entities (+ `intermediate_dxf_base64` no DWG) |
| POST | `/parse-ifc` | IFC → elementos GUID/Qto (requer ifcopenshell) |

## DWG (ODA File Converter)

1. Baixe o [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) (registro ODA gratuito).
2. Binário no `PATH` ou:

```bash
export ODA_FILE_CONVERTER=/caminho/para/ODAFileConverter
```

3. Envie `.dwg` em `/parse` ou `/convert` — o serviço faz DWG→DXF→parse/render.

Sem ODA: DXF/PDF/IFC-TS continuam; DWG retorna `DWG_CONVERTER_MISSING`.

### Formato intermediário

```
.dwg (original) → ODA → .dxf (intermediário) → ezdxf → geometria em metros
```

Não alegamos suporte nativo a DWG binário.

## IFC

- Preferência no app: parser STEP em `src/lib/mapas/ifc/` (sem binário).
- Enriquecimento opcional: `POST /parse-ifc` com ifcopenshell.
- Volumes **somente** se Qto* existir; vista 3D fora deste serviço.

## Limites

- `CAD_CONVERT_MAX_BYTES` (default 40 MB)
- `CAD_CONVERT_TIMEOUT_SEC` (default 120) — ODA
- Sem Forge / Aspose / outros SDKs pagos

## Segurança

- Rede local / privada do app. Browser não chama o Python diretamente (`CAD_CONVERT_URL` só no servidor Next.js).
