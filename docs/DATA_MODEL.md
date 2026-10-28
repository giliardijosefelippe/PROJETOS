# Modelo de dados — Conferência de Projetos

Schema lógico alinhado ao prompt mestre. Nomes em inglês (snake_case) para Postgres; labels de UI em pt-BR.

> **Estado:** desenho da Etapa A. Migrations SQL / tipos TypeScript serão criados na Etapa B. Não há banco provisionado neste repositório ainda.

## 1. Princípios

1. **Multi-tenant:** quase toda entidade de negócio carrega `organization_id`; RLS filtra por membership ativa.
2. **Autoria:** `created_by` / `updated_by` (UUID → `auth.users` / `users_profiles`); nunca só nome digitado.
3. **Soft-delete / arquivo:** preferir `deleted_at` ou status; não apagar fisicamente auditoria nem runs/revisões aprovadas.
4. **Snapshots:** `checklist_runs` congelam a versão do template; revisões aprovadas congelam respostas/evidências.
5. **Timestamps:** `created_at`, `updated_at` (timestamptz) em todas as tabelas mutáveis.

## 2. Diagrama de relacionamentos (resumo)

```
organizations
  ├── organization_memberships ── users_profiles (auth.users)
  ├── projects
  │     ├── structures (opcional: torre/bloco)
  │     │     └── levels (opcional: pavimento)  [pode ser coluna em structure ou tabela filha]
  │     └── drawings ── drawing_types
  │           └── drawing_revisions
  │                 ├── drawing_files
  │                 ├── checklist_runs ── checklist_template_versions (snapshot)
  │                 │     ├── checklist_run_items
  │                 │     └── checklist_item_responses ── response_evidence
  │                 ├── issues ── issue_events
  │                 └── approvals
  ├── standard_sheets / standard_parameters
  ├── checklist_templates ── checklist_template_versions
  │     ├── checklist_sections
  │     ├── checklist_items ── checklist_item_media
  └── report_exports, audit_events
```

## 3. Entidades

### 3.1 Identidade e acesso

#### `organizations`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| slug | text unique | |
| logo_storage_path | text null | para PDFs |
| settings | jsonb | defaults de relatório, limites, etc. |
| created_at / updated_at | timestamptz | |

#### `users_profiles`
Espelha / estende `auth.users`.

| Coluna | Tipo | Notas |
|--------|------|-------|
| user_id | uuid PK FK → auth.users | |
| full_name | text | |
| email | text | denormalizado para relatórios |
| avatar_url | text null | |
| created_at / updated_at | timestamptz | |

#### `organization_memberships`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| user_id | uuid FK | |
| role | enum | `admin` \| `coordenador` \| `desenhista` \| `conferente` \| `consulta` |
| status | enum | `active` \| `invited` \| `disabled` |
| created_at / updated_at | timestamptz | |

**Unique:** `(organization_id, user_id)`.

### 3.2 Projetos e pranchas

#### `projects`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| code | text | código interno |
| name | text | |
| description | text null | |
| status | enum | `active` \| `archived` |
| created_by | uuid | |

**Unique sugerido:** `(organization_id, code)`.

#### `structures`
Edifício / bloco / torre (opcional).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK | |
| organization_id | uuid FK | denormalizado p/ RLS |
| name | text | |
| kind | text null | torre, bloco, etc. |
| sort_order | int | |

#### `levels` (opcional; ou campos em `drawings`)
Pavimento / nível. Se a complexidade for baixa no MVP, `drawings.level_label` pode bastar; tabela própria facilita filtros.

#### `drawing_types` (categorias)
Forma, Vigas, Lajes, … expansível por organização.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| code | text | `FORMA`, `VIGAS`, `LAJES` |
| name | text | |
| sort_order | int | |
| active | boolean | |

**Unique:** `(organization_id, code)`.

#### `drawings` (pranchas)
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| project_id | uuid FK | |
| structure_id | uuid null FK | |
| level_label | text null | se sem tabela `levels` |
| drawing_type_id | uuid FK | |
| number | text | número da prancha |
| title | text | |
| discipline | text null | |
| status | text/enum | espelha revisão corrente ou agregado |
| created_by | uuid | |

**Unique sugerido:** `(project_id, number)` ou `(project_id, drawing_type_id, number)` — decidir na migration B.

#### `drawing_revisions`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| drawing_id | uuid FK | |
| organization_id | uuid FK | |
| revision_code | text | ex. `R00`, `A` |
| revision_date | date null | |
| workflow_status | enum | ver PRODUCT_SPEC §3.1 |
| production_owner_id | uuid null | desenhista |
| reviewer_id | uuid null | conferente atribuído |
| approved_at | timestamptz null | |
| approved_by | uuid null | |
| cancelled_at / cancel_reason | | para Cancelado/Arquivado |
| immutable | boolean | `true` após aprovação |

**Unique:** `(drawing_id, revision_code)`.  
**Check de negócio (app + opcional constraint/trigger):** `approved_by <> production_owner_id`.

#### `drawing_files`
Arquivos da revisão (PDF/imagem da prancha).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| revision_id | uuid FK | |
| organization_id | uuid FK | |
| storage_path | text | bucket evidence/library conforme uso |
| file_name | text | |
| mime_type | text | |
| size_bytes | bigint | |
| uploaded_by | uuid | |
| created_at | timestamptz | |

### 3.3 Biblioteca e parâmetros

#### `standard_sheets`
Pranchas-padrão da biblioteca (não confundir com prancha de projeto).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| title | text | |
| revision_label | text null | |
| description | text null | |
| drawing_type_id | uuid null FK | |
| storage_path | text | |
| classification | text null | |
| status | enum | `draft` \| `published` \| `disabled` |

#### `standard_parameters`
Parâmetros internos (escalas, layers, nomenclaturas, …).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| key | text | |
| label | text | |
| value | jsonb/text | |
| category | text null | |
| notes | text null | “sem força normativa” |

**Unique:** `(organization_id, key)`.

### 3.4 Templates de checklist

#### `checklist_templates`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| name | text | |
| drawing_type_id | uuid FK | |
| activity_kind | enum | `producao` \| `conferencia` |
| discipline | text null | |
| status | enum | `draft` \| `published` \| `disabled` |
| current_version_id | uuid null | FK lógica → versions |

#### `checklist_template_versions`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| template_id | uuid FK | |
| organization_id | uuid FK | |
| version_number | int | monotônico |
| status | enum | `draft` \| `published` \| `superseded` |
| published_at | timestamptz null | |
| published_by | uuid null | |
| snapshot_note | text null | |
| content_hash | text null | opcional p/ integridade |

**Unique:** `(template_id, version_number)`.  
Publicar: draft → published; versão anterior published → superseded. **Não** editar payload de versão já published/usada.

#### `checklist_sections`
Pertencem a uma **version** (não ao template solto).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| template_version_id | uuid FK | |
| parent_section_id | uuid null | subseções |
| title | text | |
| sort_order | int | |

#### `checklist_items`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| template_version_id | uuid FK | |
| section_id | uuid FK | |
| code | text | |
| title | text | |
| objective | text null | |
| steps | jsonb/text | passo a passo |
| verifiable_parameter | text null | |
| acceptance_criteria | text null | |
| technical_reference | jsonb null | `{ norm, edition, item, note }` |
| priority | enum | `baixa` \| `media` \| `alta` \| `critica` |
| is_blocking | boolean | |
| instructions | text null | |
| conditional_rules | jsonb null | MVP: estrutura simples ou null |
| sort_order | int | |

#### `checklist_item_media`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| item_id | uuid FK | |
| kind | enum | `highlight` \| `example_ok` \| `example_bad` \| `video` \| `attachment` |
| storage_path | text null | |
| external_url | text null | link privado autorizado |
| caption | text null | |
| cover_path | text null | vídeo |
| duration_seconds | int null | |
| sort_order | int | |

### 3.5 Execução (runs)

#### `checklist_runs`
Aplicação de um template a uma revisão.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| revision_id | uuid FK | |
| template_version_id | uuid FK | versão publicada usada |
| activity_kind | enum | `producao` \| `conferencia` |
| status | enum | alinhado ao workflow |
| assignee_id | uuid null | |
| template_snapshot | jsonb | cópia congelada suficiente p/ relatório |
| started_at / completed_at | timestamptz | |
| created_by | uuid | |

Índice: `(revision_id, activity_kind)`.

#### `checklist_run_items`
Materialização dos itens do snapshot (ids estáveis no run).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK | |
| source_item_id | uuid null | id na version (referência) |
| code / title / … | | campos necessários se snapshot parcial |
| is_blocking | boolean | |
| sort_order | int | |

#### `checklist_item_responses`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| run_item_id | uuid FK | unique 1:1 recomendado |
| status | enum | `nao_iniciado` \| `conforme` \| `nao_conforme` \| `nao_aplicavel` \| `pendente_verificacao` |
| comment | text null | obrigatório se NC ou N/A (app) |
| answered_by | uuid null | |
| answered_at | timestamptz null | |
| updated_at | timestamptz | |

#### `response_evidence`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| response_id | uuid FK | |
| organization_id | uuid FK | |
| storage_path | text | bucket `evidence` |
| file_name | mime_type | size_bytes | |
| uploaded_by | uuid | |
| created_at | timestamptz | |

### 3.6 Pendências e aprovação

#### `issues`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| code | text | sequencial por org/projeto |
| title / description | text | |
| run_item_id | uuid null FK | |
| response_id | uuid null FK | |
| revision_id | uuid FK | |
| project_id | uuid FK | |
| priority | enum | |
| assignee_id | uuid null | |
| due_date | date null | |
| status | enum | `aberta` \| `em_correcao` \| `aguardando_reconferencia` \| `resolvida` \| `reaberta` |
| opened_by / opened_at | | |
| resolved_at / resolved_by | null | |

#### `issue_events`
Timeline imutável (append-only).

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| issue_id | uuid FK | |
| event_type | text | comment, status_change, evidence, reassign, … |
| payload | jsonb | |
| actor_id | uuid | |
| created_at | timestamptz | |

#### `approvals`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| revision_id | uuid FK | |
| decision | enum | `aprovado_emissao` \| `reprovado` |
| decided_by | uuid | ≠ production_owner |
| decided_at | timestamptz | |
| notes | text null | |
| exception_records | jsonb null | exceções formais (não viram “conforme”) |

### 3.7 Auditoria e relatórios

#### `audit_events`
Append-only; sem delete físico.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid null | |
| actor_id | uuid null | |
| action | text | |
| entity_type / entity_id | text / uuid | |
| payload | jsonb | |
| created_at | timestamptz | |

#### `report_exports`
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| report_type | enum | producao, conferencia, pendencias, resumo |
| filters | jsonb | |
| storage_path | text | bucket `reports` |
| generated_by | uuid | |
| generated_at | timestamptz | |
| revision_id / project_id | uuid null | conforme tipo |

## 4. Índices sugeridos

| Tabela | Índice | Motivo |
|--------|--------|--------|
| organization_memberships | `(user_id)`, `(organization_id, role)` | authz |
| projects | `(organization_id, status)` | listagens |
| drawings | `(project_id)`, `(organization_id, drawing_type_id)` | filtros |
| drawing_revisions | `(drawing_id)`, `(organization_id, workflow_status)` | filas |
| checklist_templates | `(organization_id, drawing_type_id, activity_kind)` | biblioteca |
| checklist_template_versions | `(template_id, status)` | publicar |
| checklist_runs | `(revision_id, activity_kind)`, `(organization_id, status)` | workspace |
| checklist_item_responses | `(run_item_id)` unique | 1 resposta |
| issues | `(organization_id, status)`, `(revision_id)`, `(assignee_id)` | filas |
| issue_events | `(issue_id, created_at)` | timeline |
| audit_events | `(organization_id, created_at)`, `(entity_type, entity_id)` | investigação |
| report_exports | `(organization_id, generated_at desc)` | histórico |

FKs com `on delete restrict` para entidades imutáveis/aprovadas; cascata só onde seguro (ex. mídia de item em draft).

## 5. Regras de imutabilidade (aplicação + DB)

| Gatilho | Efeito |
|---------|--------|
| Template version `published` | Conteúdo de sections/items/media da versão congelado; edição → nova version |
| `checklist_run` criado | `template_snapshot` (+ run_items) congelados |
| Revisão `Aprovado para emissão` | `immutable = true`; bloquear update de responses/evidence/run vinculados; nova revisão para mudanças |
| `issue_events`, `audit_events` | Somente insert |
| Soft-delete | `deleted_at` / status; retenção para LGPD/auditoria conforme política da empresa |

Implementação na Etapa B/C: checks em Server Actions + policies RLS + testes; triggers Postgres onde o risco de bypass for alto.

## 6. RLS (esboço)

Política base (todas as tabelas com `organization_id`):

```sql
-- Pseudocódigo: usuário só vê linhas de orgs onde membership.status = 'active'
organization_id IN (
  SELECT organization_id FROM organization_memberships
  WHERE user_id = auth.uid() AND status = 'active'
)
```

Refinar por `role` (ex.: `consulta` = SELECT; `desenhista` = update limitado a runs atribuídos; `admin` = gestão de templates).  
Storage: paths prefixados por `organization_id/...`; policies espelhando membership.

**Service role:** apenas rotinas de servidor confiáveis (gerar PDF, jobs); nunca no cliente.

## 7. Storage (buckets — configuração externa)

| Bucket sugerido | Conteúdo | Privado |
|-----------------|----------|---------|
| `library` | standard_sheets, mídia de template | sim |
| `evidence` | response_evidence, arquivos de prancha de projeto | sim |
| `reports` | PDFs gerados | sim |

Criação de buckets, CORS e policies = **passo manual/CI no Supabase**, não inventado como “já feito”.

## 8. Enums — lista consolidada

- `membership_role`, `membership_status`
- `workflow_status` (revisão)
- `response_status`
- `activity_kind` (`producao` \| `conferencia`)
- `template_status`, `template_version_status`
- `issue_status`, `priority_level`
- `approval_decision`
- `media_kind`, `report_type`

Valores exatos em migration TypeScript/SQL na Etapa B; UI sempre pt-BR.

## 9. Seed (Etapa B)

- 1 organização demo + usuários por papel (senhas só em `.env.local` / docs de setup).
- `drawing_types`: Forma, Vigas, Lajes.
- Templates produção + conferência com itens didáticos do PRODUCT_SPEC.
- 1 projeto, 1–N pranchas/revisões para percorrer o aceite do MVP.

## 10. Decisões abertas de modelo

1. Tabela `levels` vs `level_label` no MVP.  
2. Granularidade do `template_snapshot` (JSONB completo vs só metadados + run_items densos).  
3. Sequência de `issues.code` (por org vs por projeto).  
4. Um ou múltiplos runs de conferência por revisão (reconferência = mesmo run vs novo run). **Recomendação:** um run de conferência por ciclo, com histórico de responses/issues; reconferência atualiza o mesmo run + events — validar na B.  
5. Convites: tabela própria vs só `memberships.status = invited`.
