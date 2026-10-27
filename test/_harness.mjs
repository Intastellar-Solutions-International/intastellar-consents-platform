// Minimal dependency-free test harness.
//
// This repo's active local Node (v16.20.2 per `node --version`) predates the
// built-in `node:test` runner (added in Node 18) — see the note left for the
// user in docs/analytics-audit-plan.md. No .nvmrc/engines field pins Node 16
// for this project either, so this is almost certainly just this machine's
// stale nvm default rather than a real constraint — but changing the dev
// environment's Node version is a bigger decision than one bug-fix commit
// should make unilaterally. This harness works on any Node version with zero
// new dependencies, so test infra isn't blocked either way; swap it for
// node:test or Jest/Vitest later without needing to rewrite the test files
// themselves (they only use `test()` + `node:assert`).

const tests = [];

export function test(name, fn) {
    tests.push({ name, fn });
}

export async function run() {
    let failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`  ok - ${name}`);
        } catch (err) {
            failed++;
            console.error(`  FAIL - ${name}`);
            console.error(`    ${err && err.stack || err}`);
        }
    }
    const passed = tests.length - failed;
    console.log(`\n${passed}/${tests.length} passed`);
    if (failed) process.exitCode = 1;
}
