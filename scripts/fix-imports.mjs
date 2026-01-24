/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

// Node ESM requires explicit file extensions for relative imports.
// Nest compiles TS -> JS without adding ".js" to specifiers, so we patch emitted JS.
//
// Pragmatic, targeted rewrite:
// - only touches ESM import/export specifiers in dist/**/*.js
// - only for relative specifiers (./ or ../)
// - only when there is no extension already

const distDir = path.resolve(process.cwd(), "dist");

function hasExtension(spec) {
  // Only treat *real runtime* extensions as "already has extension".
  // Filenames like "app.module" should still become "app.module.js".
  return /\.(mjs|cjs|js|json|node)$/i.test(spec);
}

function rewriteLine(line) {
  // import ... from "./x"
  // export ... from "../y"
  const rewrittenStatic = line.replace(
    /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (m, p1, spec, p3) => {
      if (hasExtension(spec)) return m;
      if (spec.endsWith("/")) return m;
      return `${p1}${spec}.js${p3}`;
    }
  );

  // dynamic import("./x")
  const rewrittenDynamic = rewrittenStatic.replace(
    /(import\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g,
    (m, p1, spec, p3) => {
      if (hasExtension(spec)) return m;
      if (spec.endsWith("/")) return m;
      return `${p1}${spec}.js${p3}`;
    }
  );

  // side-effect import "./x";
  return rewrittenDynamic.replace(
    /(import\s+['"])(\.\.?\/[^'"]+)(['"]\s*;?)/g,
    (m, p1, spec, p3) => {
      if (hasExtension(spec)) return m;
      if (spec.endsWith("/")) return m;
      return `${p1}${spec}.js${p3}`;
    }
  );
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

if (!fs.existsSync(distDir)) {
  console.error(`dist/ not found at ${distDir}`);
  process.exit(1);
}

const files = walk(distDir);
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const lines = original.split("\n");
  const rewritten = lines.map((l) => rewriteLine(l)).join("\n");

  if (rewritten !== original) {
    fs.writeFileSync(file, rewritten, "utf8");
  }
}

