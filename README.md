# Estacas — cálculo de apoio

Aplicativo para conferir estacas (hélice contínua e outros tipos) pelos métodos de Aoki-Velloso e Décourt-Quaresma, com os fatores publicados e os critérios numéricos da ABNT NBR 6122:2019 e da Emenda 1 de 25/03/2022.

Cálculo de apoio. Não substitui o engenheiro responsável nem a ART.

## Abrir sem instalar

O arquivo de verdade é o `index.html`, na raiz desta pasta. Abra-o no navegador (arquivo local, sem servidor). Os scripts são clássicos, então o endereço `file://` funciona.

O preset do tanque de aeração entra pelo botão **Carregar preset Palmar / Palmas do Arvoredo**, ou pelo endereço `index.html?preset=palmar`.

## Executável no Linux

O programa `estacas-helice`, nesta mesma pasta, abre esse `index.html`. É um lançador em C: procura Google Chrome, Chromium ou `xdg-open`. Não leva o cálculo dentro do binário. Se mover o programa, mova o `index.html`, a pasta `js/` e a pasta `css/` junto.

Para recompilar:

```sh
gcc -O2 -o estacas-helice desktop/launcher.c
```

## Windows

Não há arquivo `.exe` para Windows. Esta máquina não tem toolchain para gerar esse binário, e o arquivo não foi produzido. No Windows, abra o `index.html` no navegador.
