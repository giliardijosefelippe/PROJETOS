# Lunardeli Engenharia — Conferência de Projetos

Aplicativo web para padronizar, executar, conferir, corrigir e rastrear pranchas de projetos estruturais (Forma, Vigas, Lajes e categorias expansíveis).

> **Estado atual:** Etapa A (planejamento). Documentação e contratos de ambiente prontos; o MVP (Etapa B) ainda não foi implementado.

## Stack alvo

| Camada | Tecnologia |
|--------|------------|
| App | Next.js (App Router) + TypeScript + Tailwind CSS |
| UI | Biblioteca de componentes acessíveis (a definir na Etapa B: ex. Radix/shadcn) |
| Auth / DB / Storage | Supabase (Auth, Postgres, Storage privado) |
| Autorização | RLS no Postgres + validação no servidor |
| PDF (visualização) | PDF.js (ou equivalente) |
| PDF (relatórios) | Geração no servidor (biblioteca a escolher na Etapa B) |
| Idioma | Português do Brasil (pt-BR) |

## Pré-requisitos

- Node.js 20+ e npm (ou pnpm/yarn)
- Conta e projeto Supabase (Auth, Postgres, Storage)
- Variáveis de ambiente conforme [`.env.example`](./.env.example)

## Como rodar localmente (após Etapa B)

```bash
cp .env.example .env.local
# Preencher NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# e SUPABASE_SERVICE_ROLE_KEY (somente servidor; nunca no browser)

npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

Migrations, seed (Forma / Vigas / Lajes) e scripts de teste serão adicionados na Etapa B. Até lá, estes comandos ainda não existem no repositório.

### Comandos previstos (Etapa B+)

```bash
npm run build          # build de produção
npm run lint           # lint
npm test               # testes unitários / fluxos críticos
npm run db:migrate     # aplicar migrations (Supabase CLI ou equivalente)
npm run db:seed        # seed editável de demonstração
```

## Variáveis de ambiente

Ver [`.env.example`](./.env.example). Resumo:

| Variável | Escopo | Uso |
|----------|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + servidor | Chave anon (RLS ativo) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Somente servidor** | Admin / jobs; **nunca** expor no browser |
| `NEXT_PUBLIC_APP_URL` | Cliente + servidor | URL canônica do app (links, redirects) |
| `STORAGE_BUCKET_LIBRARY` | Servidor | Bucket privado da biblioteca (padrão sugerido: `library`) |
| `STORAGE_BUCKET_EVIDENCE` | Servidor | Bucket privado de evidências (padrão sugerido: `evidence`) |
| `STORAGE_BUCKET_REPORTS` | Servidor | Bucket privado de PDFs exportados (padrão sugerido: `reports`) |

Credenciais reais ficam apenas em `.env.local` / secrets do ambiente de deploy. Não versionar segredos.

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) | Papéis, fluxos, MVP e critérios de aceite |
| [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) | Entidades, relacionamentos, índices, imutabilidade |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Etapas A–D e incrementos |
| [`AGENTS.md`](./AGENTS.md) | Convenções para agentes de código |

Prompt mestre de requisitos (contexto do projeto Cursor): ver store do projeto / handoff do coordenador.

## Arquitetura (visão)

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App Router (pt-BR)                             │
│  Route Handlers / Server Actions + validação servidor   │
└────────────┬──────────────────────────────┬─────────────┘
             │ anon key (RLS)               │ service role
             ▼                              ▼ (somente server)
      ┌──────────────┐              ┌──────────────────┐
      │ Supabase Auth│              │ Storage privado  │
      │ + Postgres   │◄── RLS ──────│ library/evidence │
      └──────────────┘              │ /reports         │
                                    └──────────────────┘
```

- **Organização** é a unidade de isolamento (multi-tenant).
- Checklists publicados viram **snapshot imutável** em cada execução (`checklist_runs`).
- Revisão aprovada: evidências/respostas/template adotado **imutáveis**; mudanças → **nova revisão**.
- Relatórios PDF gerados no servidor; aprovação interna autenticada (não é assinatura digital jurídica).

## Decisões que dependem de configuração externa

Estas **não** estão concluídas até alguém provisionar o projeto Supabase e buckets:

1. Criar projeto Supabase e obter URL + anon key + service role key.
2. Criar buckets privados (`library`, `evidence`, `reports`) e policies de Storage alinhadas às memberships.
3. Configurar Auth (e-mail/senha e/ou provedores) e redirect URLs (`NEXT_PUBLIC_APP_URL`).
4. Aplicar migrations + RLS + seed quando a Etapa B existir.
5. Escolher biblioteca de geração de PDF no servidor e limites de upload (tamanho/MIME).

## Etapas

- **A** — Planejamento (este PR) ✅
- **B** — MVP funcional (auth, projetos/pranchas, checklists, pendências, aprovação, PDF, seed)
- **C** — Robustez (versionamento, auditoria, RLS testada, dashboard)
- **D** — Evolução futura (não bloquear MVP)

## Licença / propriedade

Uso interno Lunardeli Engenharia / repositório do projeto. Ajustar licença formalmente se necessário.
