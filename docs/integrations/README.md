# Integrações futuras (Etapa D) — stubs honestos

Nenhuma destas integrações está “pronta” sem serviço/credencial externa. O app expõe **contratos, UI de stub e documentação** para não bloquear o restante do produto.

## PRUMO

- **Status:** stub / contrato apenas.
- **Objetivo futuro:** sincronizar metadados de projeto/prancha ou status de emissão.
- **O que NÃO fazer:** inventar API concluída ou tokens no repositório.
- **Próximo passo:** definir contrato (auth, IDs externos, webhooks) em PR dedicado antes de codificar cliente HTTP.
- Código de referência: página `/integrations` + este doc.

## DWG / IFC

- **Status:** stub — visualização via componentes/serviços especializados **não** embutidos.
- **UI atual:** plano de marcação com coordenadas normalizadas (`drawing_annotations`); placeholder no lugar do viewer.
- **Caminho sugerido:** microserviço ou lib (ex. conversor → SVG/PDF) + URL assinada no Storage; nunca interpretar estrutura estrutural no browser como “validada”.

## IA (localizar inconsistências)

- **Status:** stub gerador de dicas (`ai_suggestions`, `source = stub`).
- **Regra obrigatória:** sempre `pending_human_review` até aceite/rejeição humana.
- **Proibido:** apresentar interpretação estrutural automática como se já fosse validada.
- Provider real (quando houver): nova `source`, feature flag, e mesmos estados de revisão humana.

## Excel / planilhas

- **Implementado:** CSV com BOM (abre no Excel) — export de template/run e import de itens em versão **draft**.
- Modelo: `GET /api/export/template-csv-template`.

## Marcações PDF

- **MVP:** clique → coordenadas 0–1 → persistência.
- **Evolução:** PDF.js + arquivo da revisão no Storage; link opcional a `issues`.
