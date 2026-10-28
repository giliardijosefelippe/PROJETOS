# AGENTS.md — Convenções para agentes de código

Instruções para agentes (Cursor e similares) que implementarem ou alterarem este repositório. Leia isto **antes** de editar código.

## Fonte de verdade

1. [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — produto, papéis, fluxos, aceite do MVP  
2. [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) — schema, imutabilidade, versionamento  
3. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — escopo por etapa  
4. [`README.md`](./README.md) — stack, env, como rodar  

Se o prompt mestre do projeto Cursor divergir destes docs, **atualize os docs em PR** e alinhe o código; não ignore silenciosamente.

## Escopo por etapa

| Etapa | O que fazer | O que **não** fazer |
|-------|-------------|---------------------|
| **A** | Docs + `.env.example` | App, mocks “prontos”, migrations reais |
| **B** | MVP utilizável com persistência real | Features da Etapa D; “assinatura digital jurídica” |
| **C** | Robustez, RLS testada, auditoria, UX | Bloquear entrega com features D |
| **D** | Itens listados no ROADMAP como evolução | Interpretação estrutural automática “já validada” |

Não declare módulo pronto sem: persistência real (quando aplicável), teste mínimo e instruções de validação.

## Stack e camadas

- **Next.js App Router** + **TypeScript** + **Tailwind**. Preferir Server Components; mutações via Server Actions ou Route Handlers.
- **Supabase**: Auth, Postgres, Storage. Cliente browser só com **anon key** (RLS). `SUPABASE_SERVICE_ROLE_KEY` **somente** em código de servidor.
- Validar permissões **no servidor** além do RLS; não confiar só no cliente.
- Organização (`organization_id`) em quase todas as tabelas de negócio; queries filtradas por membership ativa.
- Idioma de UI e mensagens de erro ao usuário: **pt-BR**. Comentários de código e nomes de símbolos: inglês técnico consistente.

## Domínio — regras que não podem ser “simplificadas”

- Conferente **não** aprova prancha da qual é o autor de produção daquela revisão.
- Item **Não aplicável** exige justificativa; **Não conforme** exige comentário (+ evidência quando possível).
- Itens críticos / bloqueantes impedem aprovação até correção verificada ou **exceção formal registrada** (exceção ≠ conformidade).
- Template **publicado** → nova edição = **nova versão**; runs antigos mantêm snapshot.
- Revisão **aprovada** = imutável (respostas, evidências, template); alteração = **nova revisão**.
- Soft-delete / arquivamento para auditoria e conferências; sem exclusão física de `audit_events` e runs aprovados.
- Referências normativas (NBR etc.) são **campos configuráveis** — não inventar texto, limites ou prescrições normativas.

## Storage e arquivos

- Buckets privados; URLs assinadas de curta duração.
- Validar MIME e tamanho no servidor.
- Separar biblioteca (`library`), evidências (`evidence`) e relatórios (`reports`).

## Dados de demonstração

Seed editável Forma / Vigas / Lajes: conteúdo **didático**, não conformidade automática com normas. Deve ser alterável pelo admin sem deploy de código (templates no banco).

## Commits e PRs

- Branch: seguir o padrão do ambiente (ex. `cursor/<descricao>-<suffixo>`).
- Commits pequenos e descritivos por incremento testável.
- PR descreve: o que funciona de verdade, o que depende de Supabase/env, como validar.
- Não versionar `.env`, secrets, dumps com PII.

## Testes mínimos esperados (a partir da Etapa B)

- Fluxo feliz: produção → NC → correção → reconferência → aprovação.
- Isolamento entre organizações (RLS + API).
- Auto-aprovação bloqueada (mesmo usuário produção/conferência).
- Publicar v2 do template não altera runs da v1.
- Build e lint passam no CI/local.

## Anti-padrões

- Mock-only UI fingindo MVP completo.
- Service role no bundle do cliente.
- Editar in-place template já usado em run / revisão aprovada.
- Inventar “integração concluída” com Supabase, PRUMO, DWG/IFC ou IA sem config/código reais.
- Expandir para Etapa D no meio do MVP sem pedido explícito.
