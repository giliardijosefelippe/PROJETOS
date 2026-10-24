import { copyFile, mkdir, rename } from "node:fs/promises";

const built = "dist-html/index.html";
const packaged = "dist-html/puncao.html";
const repoCopy = "docs/puncao.html";

await mkdir("docs", { recursive: true });
await copyFile(built, repoCopy);
await rename(built, packaged);
console.log(`HTML único: ${repoCopy}`);
