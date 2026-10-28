# Guia de setup — Supabase + app local

**Lunardeli Engenharia — Conferência de Projetos**  
Objetivo: deixar o MVP (etapas A–D) utilizável de ponta a ponta no seu ambiente.

> Sem as chaves e as migrations, o código sobe, mas **login e dados reais não funcionam**.

Cópia canônica também no Project store: `docs/setup-supabase.md` (Cursor Project).

---

## 1. Criar o projeto Supabase

1. Acesse [https://supabase.com](https://supabase.com) e faça login.
2. **New project** → organização, nome (ex.: `lunardeli-conferencia`), senha do banco e região.
3. Aguarde o projeto **Healthy**.

### Chaves → `.env.local`

Em **Project Settings → API**, copie para o arquivo local (nunca commitar):

```bash
cp .env.example .env.local
```

| Variável | Origem |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` (somente servidor) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `STORAGE_BUCKET_LIBRARY` | `library` |
| `STORAGE_BUCKET_EVIDENCE` | `evidence` |
| `STORAGE_BUCKET_REPORTS` | `reports` |

Modelo: [`.env.example`](../.env.example).

---

## 2. Auth (redirects)

1. **Authentication → Providers** → Email habilitado.
2. **URL Configuration**: Site URL `http://localhost:3000`; Redirect `http://localhost:3000/auth/callback`.

---

## 3. Migrations (ordem obrigatória)

No **SQL Editor**, um arquivo por vez:

1. `supabase/migrations/00001_init.sql`
2. `supabase/migrations/00002_rls.sql`
3. `supabase/migrations/00003_storage.sql` — buckets `library` / `evidence` / `reports` + policies
4. `supabase/migrations/00004_immutability.sql` (Etapa C)
5. `supabase/migrations/00005_etapa_d.sql` (Etapa D)

Confirme em **Storage** os três buckets **privados**. Paths: `{organization_id}/...`.

---

## 4. Seed e app

```bash
npm install
npm run seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Usuários demo (senha padrão; altere em produção / sobrescreva com `SEED_*`):

| Papel | E-mail | Senha |
|-------|--------|-------|
| Admin | `admin@lunardeli.local` | `ChangeMe-Admin-123!` |
| Coordenador | `coordenador@lunardeli.local` | `ChangeMe-Coord-123!` |
| Desenhista | `desenhista@lunardeli.local` | `ChangeMe-Des-123!` |
| Conferente | `conferente@lunardeli.local` | `ChangeMe-Conf-123!` |

Seed cria org demo, templates Forma/Vigas/Lajes, projeto `DEMO-001`, prancha `VIG-01` R00.

---

## 5. Validar aceite do MVP

1. Admin → `/templates` — Vigas com foto/vídeo/parâmetro/referência; publicar.
2. Desenhista → `DEMO-001` / `VIG-01` / R00 → produção + evidência → encaminhar.
3. Conferente **≠** desenhista → NC → devolver.
4. Desenhista corrige issue → aguardando reconferência.
5. Conferente reconfere e aprova (bloqueio de auto-aprovação se for production owner).
6. Gerar PDF na revisão.
7. Admin publica v2 do template; run v1 mantém snapshot.
8. Sem membership / outra org não vê dados (RLS).

Extras: `/indicators`, `/revisions/compare`, anotações, CSV, `/integrations` (stubs).

```bash
npm test && npm run build
```

---

## 6. Problemas comuns

| Sintoma | Causa |
|---------|-------|
| Login não autentica | Keys / reiniciar `dev` após `.env.local` |
| Tabelas/buckets faltando | Migration pulada ou fora de ordem |
| Upload falha | Buckets/policies da 00003 |
| Seed aborta | Falta service role ou URL placeholder |
| Telas D vazias | Falta 00005 |
)
