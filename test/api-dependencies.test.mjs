// Vercel installs the functions' dependencies from api/package.json (the
// nearest package.json to each function), not from the repo root. A package
// imported in api/ but missing there only works while Vercel's build cache
// still holds an old root node_modules — a cache-less redeploy then crashes
// every function with ERR_MODULE_NOT_FOUND.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "./_harness.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.join(ROOT, "api");
const apiPkg = JSON.parse(fs.readFileSync(path.join(API, "package.json"), "utf8"));
const rootLock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));

function importedPackages() {
    const found = new Set();
    for (const file of fs.readdirSync(API).filter(f => f.endsWith(".js"))) {
        const src = fs.readFileSync(path.join(API, file), "utf8");
        for (const [, spec] of src.matchAll(/(?:^|\s)(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+)["']([^"'.][^"']*)["']/gm)) {
            if (spec.startsWith("node:")) continue;
            const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
            if (!builtinModules.includes(name)) found.add(name);
        }
    }
    return found;
}

test("every package imported by an API function is declared in api/package.json", () => {
    const declared = Object.keys(apiPkg.dependencies || {});
    const missing = [...importedPackages()].filter(name => !declared.includes(name));
    assert.deepEqual(missing, [], `add to api/package.json (and run npm install --package-lock-only in api/): ${missing.join(", ")}`);
});

test("api/package.json pins the same versions the root lockfile resolves", () => {
    for (const [name, version] of Object.entries(apiPkg.dependencies || {})) {
        assert.equal(version, rootLock.packages[`node_modules/${name}`]?.version, name);
    }
});

test("api/package.json keeps the functions on ES modules", () => {
    assert.equal(apiPkg.type, "module");
    assert.ok(fs.existsSync(path.join(API, "package-lock.json")), "api/package-lock.json is missing");
});
