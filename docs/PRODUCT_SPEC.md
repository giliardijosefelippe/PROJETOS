# Especificação de produto — Conferência de Projetos

**Produto:** Lunardeli Engenharia — Conferência de Projetos  
**Idioma:** pt-BR  
**Versão do doc:** Etapa A (planejamento)

## 1. Problema e resultado de negócio

Escritórios de engenharia estrutural precisam padronizar produção e conferência de pranchas (Forma, Vigas, Lajes, etc.), com rastreabilidade de respostas, evidências, pendências e aprovações internas — sem depender de planilhas soltas ou checklists que “mudam no passado” quando o padrão é editado.

O administrador configura, **sem programar**:

- Categorias de pranchas (inicialmente Forma, Vigas, Lajes; expansível).
- Pranchas-padrão (PDF/imagem) com metadados e anexos.
- Templates de checklist por categoria, tipo de atividade (produção / conferência) e disciplina.
- Itens ricos: código, título, objetivo, passo a passo, parâmetro verificável, critério de aceitação, referência técnica opcional, prioridade, mídia, exemplos certo/errado, vídeo, anexos.
- Perguntas/campos personalizáveis, grupos, subseções, ordem e condicionais.
- Parâmetros internos da empresa (escalas, layers, nomenclaturas, grafismo, notas, carimbo). **Parâmetros internos não têm força normativa automática.**

## 2. Papéis

| Papel | Capacidades principais |
|-------|------------------------|
| **Administrador** | Equipe, papéis, biblioteca, templates, parâmetros, relatórios |
| **Coordenador** | Projetos, atribuições, publicação de versões de checklist, progresso, liberação de emissão conforme permissão |
| **Desenhista** | Checklist de produção, evidências, correções, solicitação de conferência |
| **Conferente/Revisor** | Avaliação independente, NCs, reabertura de itens, aprovação/reprovação técnica interna |
| **Consulta** | Visualização e download somente quando autorizado |

- Login e perfil individuais; autoria sempre do usuário autenticado (nunca só texto digitado).
- Na conferência independente: **impedir** que a pessoa aprove a própria prancha (mesma revisão em que foi responsável de produção).
- Isolamento por **organização/equipe** (multi-tenant).

## 3. Estados e regras de fluxo

### 3.1 Prancha / revisão

```
Rascunho
  → Em produção
  → Aguardando conferência
  → Em conferência
  → Com pendências
  → Em correção
  → Aguardando reconferência
  → Aprovado para emissão

Cancelado / Arquivado  (com justificativa + permissão)
```

Transições relevantes devem registrar autor, data e contexto (auditoria).

### 3.2 Resposta de item de checklist

| Status | Regras |
|--------|--------|
| Não iniciado | Estado inicial |
| Conforme | Item avaliado OK |
| Não conforme | Comentário obrigatório; evidência recomendada/possível; gera ocorrência |
| Não aplicável | Justificativa obrigatória |
| Pendente de verificação | Não equivale a “conforme” |

- “Marcado como revisado” ≠ “conforme”.
- Itens **críticos** não conformes ou pendentes **impedem** aprovação.
- Item **bloqueante** só deixa de bloquear por: correção verificada **ou** exceção formal autorizada e registrada. Exceção **não** transforma erro técnico em conformidade.

### 3.3 Imutabilidade e versionamento

- Revisão **aprovada**: evidências, respostas e template adotado **imutáveis**. Mudança → **nova revisão** (histórico + comparação na Etapa D).
- Cada `checklist_run` guarda **snapshot** do template publicado usado.
- Biblioteca de templates: rascunho → publicação → desativação; **duplicação** permitida. Edição de publicado = **nova versão**, não altera runs antigos.

### 3.4 Produção vs conferência

Fluxos independentes; podem usar templates diferentes, reutilizando itens-base e mídia da biblioteca. Templates associados a uma **revisão específica** no momento da aplicação.

## 4. Fluxos principais (MVP)

### 4.1 Configuração (Admin / Coordenador)

1. Criar/gerir organização (pré-provisionada ou no onboarding — ver decisões abertas).
2. Convidar membros e atribuir papéis.
3. Cadastrar categorias, parâmetros internos, pranchas-padrão e mídia.
4. Montar template (seções/itens/mídia), publicar versão.
5. Criar projeto → estruturas opcionais → pranchas → revisões → arquivos.

### 4.2 Produção (Desenhista)

1. Selecionar Projeto → (Torre/Bloco) → (Pavimento) → Prancha → Revisão.
2. Abrir checklist de produção (run com snapshot do template).
3. Responder itens; anexar evidências; salvamento automático.
4. Encaminhar para conferência quando critérios mínimos forem atendidos.

### 4.3 Conferência e pendências (Revisor ≠ autor)

1. Assumir/abrir conferência na revisão.
2. Avaliar itens; marcar NC → cria **issue** (ocorrência).
3. Devolver com pendências; desenhista corrige, anexa evidência de correção, pede reconferência.
4. Revisor resolve ou reabre; ao final, **aprovação técnica interna** se bloqueios resolvidos.

### 4.4 Relatórios

Gerar PDF no servidor com cabeçalho/logo configuráveis, identificação completa, template/versão, autores, datas, tabela de itens, justificativas, NCs, evidências selecionadas, indicadores e campos de assinatura **interna** (usuário autenticado). **Não** declarar assinatura digital juridicamente válida sem solução específica.

Tipos mínimos:

1. Relatório de produção do desenhista  
2. Relatório de conferência técnica da prancha  
3. Relatório de pendências e tratamento das correções  
4. Resumo por projeto, período, usuário ou tipo de prancha  

**Indicadores:** aplicáveis, verificados, conformes, NC, pendentes, N/A, bloqueantes.  
Taxa de conformidade padrão = `conformes / (conformes + não conformes)` entre itens avaliados e aplicáveis; **cobertura** apresentada à parte.

## 5. Biblioteca multimídia e UI do checklist

### 5.1 Conteúdo

- PDFs/imagens na biblioteca de pranchas-padrão.
- Imagem de destaque por item + galeria certo/errado com legenda.
- Vídeo curto (MP4/WebM) e/ou link privado autorizado (capa, duração, preview).
- Storage privado com permissões; validação de tamanho/formato.

### 5.2 Layout desktop (preferido)

| Zona | Conteúdo |
|------|----------|
| Cabeçalho | Projeto → Torre/Bloco → Pavimento → Prancha → Revisão; status; responsáveis |
| Esquerda | Categorias, grupos, itens, progresso |
| Centro | Pergunta, passos, parâmetros, resposta, observações, evidência |
| Direcha | Referência com zoom, vídeo, prancha-padrão, exemplos |

Mobile: painéis empilhados. Busca, filtros (status, categoria, responsável), feedback de erro/sucesso, acessibilidade básica; tema claro/escuro opcional (pós-MVP aceitável se não bloquear B).

Detalhe do item: **O que verificar**, **Como executar**, **Padrão correto**, **Erros comuns**, **Referência**, **Vídeo**, **Resposta/evidências**.

## 6. Pendências (issues)

Campos: código, texto, item, projeto, prancha/revisão, prioridade, responsável, prazo opcional, observação, evidência, abertura, status, histórico.

Status: **Aberta** → **Em correção** → **Aguardando reconferência** → **Resolvida** | **Reaberta**.

## 7. Seed didático (editável)

Exemplos iniciais **não** são conformidade automática com normas:

**FORMA** — identificação projeto/pavimento/revisão; eixos/cotas/geometria; pilares/vigas/lajes/aberturas; seções legíveis; numeração sem duplicidade indevida; correspondência planta × tabela de vigas.

**VIGAS** — levantamento independente da tabela; seções compatíveis; armaduras long. +/−; estribos; cortes/apoios/ancoragens/transpasse; tabelas/quantitativos coerentes.

**LAJES** — id/espessura/nível; compatibilidade com forma; armadura +/−; reforços em aberturas; legibilidade e compatibilização.

Referências ABNT (NBR 6118, 14931, etc.) = campos configuráveis (número, edição, item, observação), sujeitos a verificação humana. **Não inventar** prescrições normativas.

## 8. Critérios de aceite do MVP

1. Admin cria checklist de **Vigas** com foto, vídeo, parâmetro, etapas e referência.  
2. Desenhista autentica, escolhe projeto/revisão, preenche, anexa evidência e encaminha.  
3. Revisor **diferente** encontra NC e devolve.  
4. Desenhista corrige, documenta e reenvia.  
5. Revisor reconfere e aprova internamente com bloqueios resolvidos.  
6. PDF com nomes, projeto, revisão, respostas e histórico de pendências.  
7. Admin publica v2 do template **sem** alterar conferências da v1.  
8. Usuário sem permissão **não** acessa dados de outra organização.  
9. App roda localmente com instruções reproduzíveis; testes e build sem erros.

## 9. Fora de escopo do MVP (Etapa D)

Marcações coordenadas em PDF; diff entre revisões; importação planilha; revisão colaborativa simultânea; Excel; integração PRUMO; DWG/IFC; IA para inconsistências (sempre com revisão humana). Não implementar interpretação estrutural automática como se validada.

## 10. Telas (mapa textual)

| Área | Telas |
|------|-------|
| Auth | Login, recuperação de senha (Supabase Auth) |
| App shell | Nav por papel; seletor de organização (se multi-org) |
| Admin | Membros/papéis; categorias; parâmetros; biblioteca; templates (editor + publicar) |
| Projetos | Lista/criar projeto; estruturas; pranchas; revisões; upload de arquivos |
| Checklist | Workspace 3 colunas; detalhe do item; evidências |
| Pendências | Lista filtrável; detalhe + timeline de eventos |
| Aprovação | Painel de bloqueios; ação aprovar/reprovar interna |
| Relatórios | Escolha do tipo; preview/download PDF |
| Indicadores | Resumo por projeto (mínimo no MVP; dashboard rico na C) |

## 11. Decisões abertas (config / produto)

Ver também README. Em especial:

- Modelo de onboarding de organização (self-serve vs provisionamento manual).
- Provedores Auth além de e-mail/senha.
- Limites exatos de upload e codecs de vídeo aceitos.
- Biblioteca de componentes UI e de geração de PDF.
- Campos de “assinatura” no PDF: apenas registro de aprovação autenticada no MVP.
