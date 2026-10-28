# Serviço CAD Convert (Python)

Microserviço local/cloud para **Lunardeli Engenharia — Conferência de Projetos**.

Converte **DXF** (nativo) e **DWG** (via conversor opcional) em **PDF + PNG** para o pipeline de visualização/anotações do app Next.js.

## Por que Python + ezdxf (não Forge)

- Requisito do produto: leitura CAD via **biblioteca Python**, sem Autodesk Forge como caminho primário.
- **ezdxf** lê/escreve DXF e renderiza modelspace (addon `drawing` + matplotlib).
- **DWG binário** não é coberto de forma confiável só com ezdxf: use **ODA File Converter** (Open Design Alliance — registro gratuito, sem paid API key no código) para DWG→DXF, depois o mesmo render.
- Alternativas documentadas (não embutidas): LibreCAD/QCAD CLI; Aspose e similares **pagos** não são inventados aqui.

## Rodar

```bash
cd services/cad-convert
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8091
```

Health: [http://127.0.0.1:8091/health](http://127.0.0.1:8091/health)

No app Next.js:

```bash
CAD_CONVERT_URL=http://127.0.0.1:8091
```

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/health` | Status + disponibilidade ODA |
| POST | `/convert?format=pdf\|png\|both` | Multipart `file` → PDF/PNG |
| POST | `/convert/bundle` | JSON com PDF+PNG em base64 (usado pelo Next.js) |

## DWG (ODA File Converter)

1. Baixe o [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) (requer registro ODA gratuito).
2. Instale e garanta o binário no `PATH`, ou defina:

```bash
export ODA_FILE_CONVERTER=/caminho/para/ODAFileConverter
```

3. Envie `.dwg` — o serviço faz DWG→DXF→PDF/PNG.

Sem ODA, uploads **DXF** e **PDF** continuam funcionando; DWG retorna erro explícito `DWG_CONVERTER_MISSING`.

## Limites

- `CAD_CONVERT_MAX_BYTES` (default 40 MB)
- `CAD_CONVERT_TIMEOUT_SEC` (default 120) — só ODA

## Segurança

- Serviço pensado para rede local / rede privada do app (não exponha à internet sem auth).
- O Next.js chama o serviço no **servidor** (`CAD_CONVERT_URL`); o browser não fala com o Python diretamente.
