# Lunardeli Engenharia — Conferência de Projetos

**Lunardeli Engenharia — Gestão e Qualidade de Projetos Estruturais**  
Nome curto na navegação: **Lunardeli | Qualidade**

Aplicativo web (pt-BR) para padronizar, executar, conferir, corrigir e rastrear pranchas de projetos estruturais (Forma, Vigas, Lajes e categorias expansíveis).

> **Estado:** Etapas A–D no código (planejamento + MVP + robustez + evolução com stubs honestos). Persistência real via Supabase — **requer chaves e migrations aplicadas** para login e dados. Sem credenciais, o código/testes unitários e as instruções estão prontos; PRUMO/DWG/IFC/IA externa **não** são fingidos como concluídos.

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| Auth / DB / Storage | Supabase (Auth, Postgres, Storage privado) + RLS |
| PDF | PDFKit no servidor |
| Identidade | Tokens CSS em `src/app/globals.css` (vermelho `#E00024`, grafite, branco, cinza claro) |

Documentação de produto: [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md), modelo [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md), roadmap [`docs/ROADMAP.md`](./docs/ROADMAP.md), marca [`docs/identidade-visual.md`](./docs/identidade-visual.md).

## Pré-requisitos

- Node.js 20+ e npm
- Projeto Supabase (Auth + Postgres + Storage)
- Variáveis conforme [`.env.example`](./.env.example)

## Configuração Supabase (obrigatória para uso real)

Guia passo a passo (pt-BR): [`docs/SETUP_SUPABASE.md`](./docs/SETUP_SUPABASE.md).

1. Crie um projeto no [Supabase](https://supabase.com).
2. **SQL:** no SQL Editor, execute na ordem:
   - `supabase/migrations/00001_init.sql`
   - `supabase/migrations/00002_rls.sql`
   - `supabase/migrations/00003_storage.sql`
   - `supabase/migrations/00004_immutability.sql` (Etapa C — triggers)
   - `supabase/migrations/00005_etapa_d.sql` (Etapa D — anotações, presença, ai_suggestions)
3. **Auth:** Authentication → Providers → Email habilitado. Em URL Configuration, adicione `http://localhost:3000/auth/callback` (e a URL de produção quando houver).
4. **API keys:** Project Settings → API → copie URL, `anon` e `service_role`.
5. Confirme buckets privados `library`, `evidence`, `reports` (criados pela migration 00003).

## Como rodar localmente

```bash
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY (somente servidor; nunca no browser)

npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### Seed (demo Forma / Vigas / Lajes)

Com `.env.local` e migrations aplicadas:

```bash
npm run seed
```

Cria organização demo, usuários por papel, tipos Forma/Vigas/Lajes, templates produção+conferência publicados, projeto `DEMO-001` e prancha `VIG-01` R00.

Senhas padrão (altere em produção) são impressas no terminal; também configuráveis via `SEED_*` no `.env.local`.

### Marca / logotipo

Admin → **Marca** (`/admin/branding`): upload do logotipo oficial. Slot placeholder até o arquivo da marca estar disponível. O logo entra no cabeçalho e nos PDFs. **Não** redesenhar a marca.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run test` | Testes unitários do workflow |
| `npm run typecheck` | TypeScript |
| `npm run seed` | Seed demo (precisa service role) |

## O que o MVP + Etapa C cobrem

- Login / sessão / papéis (admin, coordenador, desenhista, conferente, consulta)
- Projetos, pranchas, revisões e workflow
- Templates editáveis com seções/itens/mídia; publicar versão; nova versão sem alterar runs antigos; **diff v1/v2**; **reordenação**
- Runs de produção e conferência com snapshot; respostas + evidências; NC gera pendência
- Pendências com histórico; reconferência; aprovação interna (**bloqueio de auto-aprovação**)
- Relatórios PDF (produção, conferência, pendências, resumo)
- Seed didático Forma/Vigas/Lajes (não normativo)
- Identidade visual com tokens CSS e estados com **texto + ícone**
- **C:** triggers de imutabilidade; audit append-only; validações de upload; dashboard `/indicators`; filtros; nav fluido do checklist; testes de aprovação/RLS-matriz/condicionais; [LGPD](./docs/LGPD_RETENTION.md)
- **D:** comparação de revisões; export/import CSV (Excel); marcações coordenadas MVP; presença colaborativa leve; stubs IA com revisão humana; [integrações](./docs/integrations/README.md) PRUMO/DWG/IFC

## Critérios de aceite — como validar

1. Admin cria/edita checklist de **Vigas** com foto, vídeo, parâmetro e referência → `/templates`.
2. Desenhista faz login, abre `DEMO-001` / `VIG-01` / R00, inicia produção, responde, anexa evidência, encaminha.
3. Conferente **diferente** marca NC → pendência criada; devolve.
4. Desenhista corrige (status da issue → em correção → aguardando reconferência).
5. Conferente reconfere e **aprova** (não pode ser o production owner).
6. Gera PDF na revisão.
7. Admin publica v2 do template; runs da v1 permanecem com snapshot antigo.
8. Usuário de outra org (ou sem membership) não vê dados (RLS).

## O que depende de configuração externa

- Chaves Supabase e Auth redirects
- Buckets + policies de storage (migrations)
- Seed / usuários reais
- Arquivo oficial do logotipo (`image.png` / logo da marca) — validar vermelho `#E00024` contra o original

## Etapas

| Etapa | Status |
|-------|--------|
| A — Planejamento | Concluída |
| B — MVP funcional | Concluída (código) |
| C — Robustez | Concluída (código) |
| D — Evolução | Este branch (fundações + stubs) |
