// Builds the debug APK and copies it to dist/dispertador-debug.apk.
// Requires: JDK 17+ (21 recommended) and the Android SDK (ANDROID_HOME or android/local.properties).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const androidDir = join(root, "android");
const isWin = process.platform === "win32";

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin, env: process.env });
  if (r.status !== 0) {
    console.error(`\nFalhou: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), "Android", "Sdk");
const localProps = join(androidDir, "local.properties");
if (!existsSync(localProps)) {
  if (!existsSync(sdk)) {
    console.error(`Android SDK não encontrado. Defina ANDROID_HOME (tentado: ${sdk}). Veja o README.`);
    process.exit(1);
  }
  writeFileSync(localProps, `sdk.dir=${sdk.replace(/\\/g, "/")}\n`);
}

run(isWin ? "npx.cmd" : "npx", ["cap", "sync", "android"], root);
run(join(androidDir, isWin ? "gradlew.bat" : "gradlew"), ["assembleDebug"], androidDir);

const apk = join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
mkdirSync(join(root, "dist"), { recursive: true });
copyFileSync(apk, join(root, "dist", "dispertador-debug.apk"));
console.log("\nAPK pronto em dispertador/dist/dispertador-debug.apk");
