import { spawn } from "node:child_process";
import path from "node:path";
import chokidar from "chokidar";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let serverProc = null;
let restarting = false;
let queued = false;

async function runFixImports() {
  // run in a separate process to avoid caching issues
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.resolve("scripts/fix-imports.mjs")], {
      stdio: "inherit",
      shell: false
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`fix-imports exited ${code}`))));
  });
}

async function restartServer() {
  if (restarting) {
    queued = true;
    return;
  }
  restarting = true;

  try {
    // small debounce to wait for dist writes to finish
    await sleep(150);
    await runFixImports();

    if (serverProc) {
      serverProc.kill();
      serverProc = null;
    }

    serverProc = spawn(process.execPath, ["dist/entry.js"], {
      stdio: "inherit",
      shell: false
    });
  } catch (err) {
    console.error(err);
  } finally {
    restarting = false;
    if (queued) {
      queued = false;
      restartServer();
    }
  }
}

// Start Nest build in watch mode
const buildProc = spawn("npx", ["nest", "build", "--watch"], {
  stdio: "inherit",
  shell: true
});

buildProc.on("exit", (code) => {
  console.log(`nest build --watch exited with ${code}`);
  if (serverProc) serverProc.kill();
  process.exit(code ?? 1);
});

// Watch dist/ and restart server on changes
const watcher = chokidar.watch(["dist/**/*.js", "dist/**/*.json"], {
  ignoreInitial: true
});

watcher.on("add", restartServer);
watcher.on("change", restartServer);
watcher.on("unlink", restartServer);

// Start once if dist/main.js exists already (e.g., after a prior build)
const distMain = path.resolve("dist/entry.js");
await restartServer();

