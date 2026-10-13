import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = fileURLToPath(new URL("../apps/web/", import.meta.url));
if (process.env.MODALIS_LOCAL_DEVELOPMENT !== "true" && existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const require = createRequire(`${app}package.json`);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)], {
  cwd: app, env: process.env, stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
