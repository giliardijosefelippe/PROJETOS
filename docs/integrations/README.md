# Integrações futuras (Etapa D) — stubs honestos + CAD Python

Nenhuma integração externa “mágica” sem serviço/credencial. O app expõe **contratos, UI e documentação** — e, para CAD, um serviço Python real.

## PRUMO

- **Status:** stub / contrato apenas.
- **Objetivo futuro:** sincronizar metadados de projeto/prancha ou status de emissão.
- **O que NÃO fazer:** inventar API concluída ou tokens no repositório.
- **Próximo passo:** definir contrato (auth, IDs externos, webhooks) em PR dedicado antes de codificar cliente HTTP.
- Código de referência: página `/integrations` + este doc.

## DWG / DXF (Python — implementado)

- **Status:** utilizável localmente com o microserviço `services/cad-convert`.
- **Caminho primário:** **ezdxf** (Python) — **não** Autodesk Forge.
- **DXF:** leitura + render (matplotlib) → PDF + PNG; upload na revisão; preview nas marcações.
- **DWG:** ezdxf não lê DWG binário de forma confiável. Pipeline: **ODA File Converter** (gratuito com registro ODA, sem paid key no repo) DWG→DXF → mesmo render. Sem ODA, DXF/PDF seguem ok; DWG retorna erro explícito.
- **Alternativas documentadas (não embutidas):** LibreCAD/QCAD CLI; Aspose e similares pagos **não** são inventados como “já configurados”.
- **IFC:** ainda stub (viewer especializado futuro).
- **App:**
  - UI: seção **Arquivo da prancha** em `/revisions/[id]` (aceita PDF/DXF/DWG)
  - Action: `uploadDrawingFileAction`
  - Proxy: `GET /api/cad/health`, `POST /api/cad/convert`
  - Storage: bucket `library` sob `{org}/drawings/{revision_id}/…`
  - Migration: `supabase/migrations/00006_dwg_support.sql`
  - Env: `CAD_CONVERT_URL=http://127.0.0.1:8091`
- Guia do serviço: [`services/cad-convert/README.md`](../../services/cad-convert/README.md)

## IA (localizar inconsistências)

- **Status:** stub gerador de dicas (`ai_suggestions`, `source = stub`).
- **Regra obrigatória:** sempre `pending_human_review` até aceite/rejeição humana.
- **Proibido:** apresentar interpretação estrutural automática como se já fosse validada.
- Provider real (quando houver): nova `source`, feature flag, e mesmos estados de revisão humana.

## Excel / planilhas

- **Implementado:** CSV com BOM (abre no Excel) — export de template/run e import de itens em versão **draft**.
- Modelo: `GET /api/export/template-csv-template`.

## Marcações PDF / preview CAD

- **MVP:** clique → coordenadas 0–1 → persistência sobre preview PNG/PDF da revisão.
- Preview vem de PDF direto ou conversão DXF/DWG via Python.
- **Evolução:** PDF.js pleno multipágina; link opcional a `issues`.
