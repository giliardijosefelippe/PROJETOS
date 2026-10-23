# Punção em lajes — NBR 6118

Calculadora de punção para laje maciça lisa e pilar retangular, em unidades do SI e com a interface em português. A verificação segue a seção 19.5 da ABNT NBR 6118. Não há fórmulas nem símbolos do ACI.

## Como executar

É preciso Node.js 20 ou superior. O projeto não usa Bun.

```bash
npm install
npm test
npm run dev
```

O servidor de desenvolvimento abre em `http://localhost:5173`. `npm run build` gera a versão de produção em `dist/`. `npm run typecheck` só confere os tipos.

A tela tem a entrada à esquerda, com recálculo imediato, e as abas **Gráfico** e **Relatório** à direita. **Imprimir / salvar PDF** usa a impressão do navegador; a folha de estilos de impressão deixa só o memorial.

## Edição da norma

O cálculo usa a redação de 2014 da seção 19.5, com dois limites confirmados na edição de 2023 do item 19.5.3.2: ρ ≤ 0,02 e k ≤ 2. Onde uma mudança de 2023 não foi conferida no texto publicado, permanece o texto de 2014. Essa ressalva aparece no rodapé da tela e no memorial.

Itens aplicados:

- 19.5.2 — altura útil ao longo de C', perímetro crítico u, perímetro reduzido u* de borda e de canto, momentos MSd e excentricidade.
- 19.5.2.2 — K da Tabela 19.2 e módulo plástico Wp.
- 19.5.3.1 — τRd2 = 0,27·αv·fcd, com αv = 1 − fck/250, verificado no contorno C (face do pilar), só com a força.
- 19.5.3.2 — τRd1 sem armadura de punção: k = 1 + √(20/d) ≤ 2, com d em cm, e ρ = √(ρx·ρz) ≤ 0,02.
- 19.5.3.3 — τRd3 com armadura de punção, limites de espaçamento, fywd de studs (≤ 300 MPa) e contorno externo C''.
- 19.4.2 — teto de fywd dos estribos em função da espessura da laje.

O colapso progressivo (19.5.4) não é dimensionado.

## O que a conta faz

- d a partir de h, cobrimento e bitola. A camada paralela a x é a externa; d é a média de dx e dz.
- u em C' (a 2d) e u0 na face do pilar, para pilar interno, de borda e de canto.
- τSd com FSd e os dois momentos, K conforme C1/C2 e Wp. Fora do intervalo 0,5 a 3,0 da Tabela 19.2, K fica no extremo da tabela e o memorial avisa.
- τRd2 na compressão diagonal e τRd1 na punção sem armadura.
- Com a armadura de punção ligada: τRd3, limites geométricos e o contorno C'' onde a armadura pode parar.
- Com a armadura desligada e τSd > τRd1: o memorial diz que a armadura de punção é necessária e mostra Asw/sr para atender C', além de uma sugestão de número de linhas para C'' passar.
- Veredito separado para compressão diagonal e para punção.
- MSd como na norma, inclusive o tratamento da excentricidade na borda e no canto. Se a excentricidade passa do limite em que a norma define a expressão, o memorial avisa em vez de extrapolar.
- Cargas já de cálculo, ou características com γf (padrão 1,4). A opção de ambos os sinais dos momentos escolhe a combinação governante.
- Carga uniforme opcional, desligada por padrão. Quando ligada, FSd é reduzido pela carga dentro do perímetro e o memorial declara a redução. Quando desligada, o memorial diz que FSd não foi reduzido.

## Exemplo padrão

Valores iniciais da tela, próximos da fronteira entre atender e não atender:

| Entrada | Valor |
| --- | --- |
| c₁ × c₂ | 50 cm × 50 cm |
| Posição | interno |
| h | 25 cm |
| fck / γc | 30 MPa / 1,4 |
| Cobrimento | 2,5 cm |
| Aço / bitola | CA-50, fyk = 500 MPa, 12,5 mm |
| As,x e As,z | 12 cm²/m em cada direção |
| Cargas | já de cálculo: FSd = 660 kN, MSd,x = 40 kN·m, MSd,z = 25 kN·m |
| Ambos os sinais | ligado |
| Armadura de punção | desligada |
| Carga uniforme | desligada |

Resultados esperados no memorial (três casas decimais):

| Grandeza | Valor |
| --- | --- |
| d | 21,250 cm |
| τSd em C (compressão) | 1,553 MPa |
| τSd em C' | 0,749 MPa |
| τRd1 | 0,658 MPa |
| τRd2 | 5,091 MPa |
| Compressão diagonal | atende |
| Punção em C' sem armadura | não atende |
| Situação | armadura de punção é necessária |

## Premissas

- Laje maciça lisa e pilar retangular. Fora desta versão: protensão, capitel, ábaco, pilar não retangular e laje apoiada no solo.
- Aberturas não são descontadas. O item 19.5.2.6 exigiria reduzir u de forma geométrica; uma redução aproximada não foi implementada.
- σcp = 0. A parcela de protensão de τRd1 não entra.
- A majoração de 20% de τRd2 (19.5.3.1) não é aplicada, porque os vãos da laje não são dados. O resultado fica a favor da segurança.
- u0 da compressão diagonal é o perímetro das faces em contato com a laje. O limite a = min(1,5d; 0,5·C₁) vale para u* em C' e C'', não para essa compressão.
- Em borda e canto, Wp é a integral do perímetro geométrico u. A força e a excentricidade e* usam u*.
- γs = 1,15. Mesma bitola nas duas direções da armadura de flexão.
- A armadura contra colapso progressivo não é dimensionada.

## Testes

`npm test` cobre o módulo `src/calc`, sem DOM: pilar interno sem momento, interno com momentos nas duas direções, pilar de borda, pilar de canto, e um caso que não passa sem armadura de punção e passa quando ela é informada. O exemplo padrão da interface também está fixado no teste.
