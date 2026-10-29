# Checklist de pranchas — protótipo HTML

Protótipo estático da Lunardeli Engenharia para produzir e conferir pranchas. Abre no navegador, sem build e sem Supabase. Não é o aplicativo Next.js e não emite assinatura digital.

## Abrir

Na pasta do repositório:

```bash
python3 -m http.server 8765 --directory checklist-pranchas
```

Abra `http://127.0.0.1:8765/`.

O `index.html` também abre direto no Chrome. A pré-visualização página a página do PDF usa pdf.js (CDN) e fica mais estável com o servidor acima. Se o CDN não carregar, o leitor de PDF do navegador entra no lugar.

## O que fica gravado

- Checklists, respostas, pendências e auditoria: `localStorage` (`lunardeli.checklist.html.v1`).
- PDF, imagem e vídeo enviados: IndexedDB `lunardeli-checklist-files`.
- Trocar de pessoa no topo simula o papel. Não há login.

Administração ou coordenação pode exportar/importar o JSON e restaurar o exemplo didático. O JSON não leva os arquivos grandes.

## Como validar

1. Em **Checklist geral**, crie um item (como Ana Lima). Ele continua depois de recarregar.
2. Abra **DEMO-001 / VIG-01 / R00** como Paulo Ribeiro e marque um item.
3. Abra a figura ou o vídeo do item — o lightbox mostra como é feito.
4. Em **Modelos**, abra a folha de vigas de exemplo.
5. Em **Mini-checklists**, publique uma versão nova e confira que a revisão já aberta continua na cópia anterior.
6. Na revisão, use **Usar PDF didático** (ou envie um PDF). O painel **O que falta** lista itens não marcados e itens sem evidência. Isso não lê o desenho.
7. Encaminhe a produção, troque para Helena Duarte e confira. Paulo, autor da produção, não aprova essa revisão.
8. **Não aplicável** sem justificativa e **Não conforme** sem comentário são recusados.
9. Item bloqueante impede a aprovação até correção conferida ou exceção formal. A exceção não vira conforme.
10. Depois de aprovar, a revisão fica imutável. Alteração é uma nova revisão. Arquivar não apaga respostas nem auditoria.

O exemplo inicial (Forma, Vigas, Lajes) é didático. Os campos de norma começam vazios de propósito.

Checagem das regras, sem navegador:

```bash
node checklist-pranchas/js/self-check.js
```
