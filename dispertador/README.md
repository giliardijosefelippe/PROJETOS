# Dispertador

Lembrete de medicamentos com alarme tipo despertador, para o Giliardi. Interface em pt-BR, sem backend, dados salvos no próprio aparelho (`localStorage`), funciona offline.

Existem dois modos:

| Modo | O que é | Confiabilidade do alarme |
|------|---------|--------------------------|
| **APK Android (recomendado)** | Capacitor + plugin nativo próprio (`DispertadorAlarm`) | Alta. Toca com o app fechado e a tela bloqueada (ver "Permissões"). |
| **Web (PWA)** | HTML/JS/CSS estático em `www/` | **Limitada.** Só toca de forma confiável com a página aberta. |

> Este projeto é independente do restante do repositório (que trata de outro produto). Nada fora de `dispertador/` foi alterado.

## O que o app faz

- Cadastro de quantos medicamentos quiser (nome, dose, observações), cada um com quantos horários quiser e, opcionalmente, dias da semana.
- Alarme em tela cheia com som alto e repetitivo, vibração e três ações: **Tomei**, **Adiar** (soneca, padrão 10 min, configurável) e **Pular**.
- Insistência: se ignorado, o alarme para após 120 s e é rearmado 5 min depois, até 5 vezes, com uma notificação "Você não respondeu".
- Tela **Hoje** (próxima dose, tomados / pulados / atrasados / a tomar), **Histórico** com adesão, pausar e arquivar medicamento, backup (exportar/importar JSON).
- Doses não registradas há mais de 12 h entram no histórico como "perdidas". Editar um remédio não reescreve o histórico passado.

## Limites do alarme no navegador (leia)

Navegadores não oferecem um despertador real. Na versão web:

- O alarme só dispara com a página **aberta** (um timer de 1 s verifica os horários). Com a aba fechada, em segundo plano, congelada pelo sistema ou com o aparelho em economia de energia, **pode não tocar**.
- Som: Web Audio em loop; o navegador só libera áudio depois de um toque do usuário na página (o app pede isso). Não é possível forçar o volume máximo.
- Há vibração (`navigator.vibrate`, não existe no iOS/Safari), Wake Lock para manter a tela acesa e notificações via Service Worker com botões Tomei/Adiar, mas elas dependem de permissão e do sistema, e não repetem o som.
- O app mostra um aviso permanente de "modo navegador limitado".

Para lembrar de remédio de verdade, use o **APK**.

## Rodar a versão web

```bash
cd dispertador
npm install        # só necessário para o APK; a web não tem dependências
npm run serve      # http://localhost:8080
```

Qualquer servidor estático servindo `www/` funciona (precisa de `localhost` ou HTTPS para Service Worker e notificações). Em celular, abra a URL e use "Instalar app" / "Adicionar à tela inicial".

## Testes

```bash
npm test
```

17 testes de unidade (`node:test`, sem dependências) da lógica em `www/js/core.js`: cadastro e validação, vários remédios e horários, próxima ocorrência com dias da semana, histórico/aderência, doses perdidas, soneca, agenda enviada ao Android e eventos vindos do Android.

## Gerar o APK (debug)

Requisitos: Node 18+, JDK 17+ (testado com 21), Android SDK com `platform-tools`, `platforms;android-35` e `build-tools;35.0.0`.

```bash
export ANDROID_HOME=$HOME/Android/Sdk     # ajuste para o seu SDK
cd dispertador
npm install
npm run apk:debug
```

O script roda `cap sync android`, o Gradle (`assembleDebug`) e copia o resultado para `dist/dispertador-debug.apk` (os `*.apk` não são versionados no git; o APK desta entrega está anexado ao PR). O APK é assinado com a chave **debug**: serve para uso próprio, não para a Play Store.

Depois de editar algo em `www/`, rode `npm run apk:debug` de novo.

## Instalar no aparelho

1. Ative "Depuração USB" e rode `adb install -r dist/dispertador-debug.apk`, **ou** copie o arquivo para o celular e abra-o (permita "instalar apps desconhecidos").
2. Abra o app uma vez. O cartão "Alarme nativo" no topo de **Hoje** mostra o estado de cada permissão.

## Permissões para o alarme ser confiável

O app guia estes passos (botões no cartão "Alarme nativo" e em **Ajustes**):

1. **Notificações** (Android 13+): permitir.
2. **Alarmes e lembretes / alarmes exatos**: permitir (`SCHEDULE_EXACT_ALARM`).
3. **Notificações em tela cheia** (Android 14+, `USE_FULL_SCREEN_INTENT`): permitir para o Dispertador.
4. **Bateria sem restrição**: Configurações > Apps > Dispertador > Bateria > "Sem restrição". Recomendado; em Xiaomi, Samsung, Huawei, Oppo etc. também desative otimizações agressivas / "suspender apps não usados" e permita início automático, senão o fabricante pode matar o app.
5. Deixe o volume de **alarme** audível. O app tenta levá-lo ao máximo enquanto toca e restaura o valor depois, mas não ignora o modo "Não perturbe" total.

Use "Testar alarme (8 s)" para conferir som, vibração e tela cheia no seu aparelho.

## Como o alarme nativo funciona

- O `localStorage` é a fonte da verdade. O app envia ao Android a agenda dos próximos **14 dias** (até 400 alarmes); abra o app pelo menos a cada 14 dias para renovar a janela.
- `AlarmManager.setAlarmClock` (alarme exato, aparece o ícone de despertador na barra de status) dispara um serviço em primeiro plano (`AlarmService`) com MediaPlayer em loop no canal de áudio de alarme, vibração repetida, wake lock e notificação de alta prioridade com full-screen intent, que abre a tela de alarme sobre a tela bloqueada.
- Doses em horários próximos (até 45 s) são agrupadas numa tela só.
- Reagendamento automático após reinício, atualização do app, mudança de hora ou de fuso.
- Ações feitas no alarme (Tomei / Adiar / Pular) ficam guardadas no Android e são importadas para o histórico quando o app abre.
- Alarmes atrasados mais de 30 min no momento em que o Android os processa (ex.: aparelho desligado) são descartados e aparecem como perdidos no histórico.

## O que foi testado e o que não foi

Testado:

- Testes de unidade (17/17) em 3 fusos horários.
- Versão web em Chrome headless (script E2E, 16 verificações): cadastro, alarme em tela cheia, soneca, Tomei, histórico, persistência após recarregar, funcionamento offline, sem erros de JS.
- APK debug compilado na VM (JDK 21, Android SDK 35) e executado em **emulador Android 14 (API 34, x86_64)**: alarme agendado via `setAlarmClock`, tela acordou com a tela de alarme em tela cheia, serviço em primeiro plano com som em loop (uso ALARM) e vibração, volume de alarme levado ao máximo, agrupamento de doses, Tomei refletido no histórico do app, rearmar após 120 s sem resposta (+5 min) com notificação de não respondido e novo toque, Adiar refletido no app ("Adiado até"), e **reagendamento após reinício do emulador** (o alarme voltou sem abrir o app).

**Não testado:**

- Nenhum teste em aparelho físico (o emulador rodou sem áudio, então o som foi verificado apenas pelo estado do player/volume no Android, não ouvido).
- Restrições de bateria de fabricantes (Xiaomi, Samsung, etc.), Android 15 ou superior, tela de bloqueio com PIN/biometria ativa, modo Não perturbe, aparelho dormindo por horas (Doze) e uso por vários dias.
- Botões de ação (Tomei/Adiar) da notificação fora da tela de alarme.
- Versão web em Safari/iOS e Firefox, e instalação do PWA em celular.
- Build de release / assinatura para loja.

## Estrutura

```
dispertador/
  www/                 app web (index.html, js/core.js lógica, js/app.js UI, sw.js, manifest)
  tests/               testes da lógica
  tools/               serve.mjs, build-apk.mjs, make-assets.py
  android/             projeto Capacitor; código nativo em
                       app/src/main/java/com/giliardi/dispertador/
  dist/                APK debug gerado (não versionado)
```
