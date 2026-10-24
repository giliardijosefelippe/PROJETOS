/* Abre o index.html que está na mesma pasta deste executável.
   A interface é o HTML. Este arquivo só acha um navegador. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <limits.h>

static int tem(const char *nome) {
  char cmd[320];
  snprintf(cmd, sizeof cmd, "command -v %s >/dev/null 2>&1", nome);
  return system(cmd) == 0;
}

int main(void) {
  char exe[PATH_MAX];
  ssize_t n = readlink("/proc/self/exe", exe, sizeof exe - 1);
  if (n < 0) {
    fprintf(stderr, "Não foi possível localizar o executável.\n");
    return 1;
  }
  exe[n] = '\0';
  char *barra = strrchr(exe, '/');
  if (barra) *barra = '\0';

  char html[PATH_MAX];
  snprintf(html, sizeof html, "%s/index.html", exe);
  if (access(html, R_OK) != 0) {
    fprintf(stderr, "Não achei %s\nColoque este programa na mesma pasta do index.html.\n", html);
    return 1;
  }

  char url[PATH_MAX + 16];
  snprintf(url, sizeof url, "file://%s", html);

  char cmd[PATH_MAX * 2];
  if (tem("google-chrome")) snprintf(cmd, sizeof cmd, "google-chrome --app=%s", url);
  else if (tem("chromium")) snprintf(cmd, sizeof cmd, "chromium --app=%s", url);
  else if (tem("chromium-browser")) snprintf(cmd, sizeof cmd, "chromium-browser --app=%s", url);
  else if (tem("xdg-open")) snprintf(cmd, sizeof cmd, "xdg-open %s", url);
  else {
    fprintf(stderr, "Nenhum navegador encontrado. Abra o arquivo direto:\n%s\n", html);
    return 1;
  }
  int rc = system(cmd);
  return rc == 0 ? 0 : 1;
}
