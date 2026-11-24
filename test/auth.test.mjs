// The shared token check (api/_member-auth.js → validateJwt) that replaced
// the per-endpoint copies, which only read claims and never the signature.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "./_harness.mjs";
import { validateJwt, configuredSecrets } from "../api/_member-auth.js";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
// Same shape as Intastellar Accounts' JWTGenerate: HS512, double base64url signature, whole token base64'd.
function accountsToken(claims, secret) {
    const head = `${b64u({ alg: "HS512", typ: "JWT" })}.${b64u(claims)}`;
    const single = createHmac("sha512", secret).update(head).digest("base64url");
    const jwt = `${head}.${Buffer.from(single).toString("base64url")}`;
    return `Bearer ${Buffer.from(jwt).toString("base64")}`;
}
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const claims = { iss: "Intastellar Account", exp: FUTURE, PAYLOAD: { email: "me@x.dk" } };

test("auth: with a secret set, only tokens signed with it pass", () => {
    const env = { JWT_SECRET: "real-secret" };
    assert.ok(validateJwt(accountsToken(claims, "real-secret"), { env }));
    assert.equal(validateJwt(accountsToken(claims, "intastellaraccounts.com"), { env }), null, "the old public key no longer works");
    assert.equal(validateJwt(accountsToken({ ...claims, exp: 1 }, "real-secret"), { env }), null, "expired");
    assert.equal(validateJwt(accountsToken({ ...claims, iss: "Someone" }, "real-secret"), { env }), null, "wrong issuer");
    assert.equal(validateJwt("Bearer garbage", { env }), null);
    assert.equal(validateJwt(undefined, { env }), null);
});

test("auth: during a key rotation both the new and the old key pass (JWT_SECRETS)", () => {
    const env = { JWT_SECRETS: "new-key, old-key" };
    assert.deepEqual(configuredSecrets(env), ["new-key", "old-key"]);
    assert.ok(validateJwt(accountsToken(claims, "new-key"), { env }));
    assert.ok(validateJwt(accountsToken(claims, "old-key"), { env }));
    assert.equal(validateJwt(accountsToken(claims, "other"), { env }), null);
});

test("auth: cron service tokens only where allowed, and only the configured one", () => {
    const cron = `${b64u({ alg: "none" })}.${b64u({ iss: "Intastellar Cron", sub: "cron_scan_domains", exp: 9999999999 })}.x`;
    const env = { JWT_SECRET: "real-secret", DOMAINS_API_KEY: cron };
    assert.ok(validateJwt(`Bearer ${cron}`, { env, allowCron: true }));
    assert.equal(validateJwt(`Bearer ${cron}`, { env }), null, "not on endpoints that don't opt in");
    const forged = `${b64u({ alg: "none" })}.${b64u({ iss: "Intastellar Cron", sub: "cron_scan_domains", exp: 9999999999 })}.y`;
    assert.equal(validateJwt(`Bearer ${forged}`, { env, allowCron: true }), null, "a self-made cron token is refused");
    assert.equal(validateJwt(`Bearer ${cron}`, { env: { JWT_SECRET: "real-secret" }, allowCron: true }), null, "no DOMAINS_API_KEY → no cron access");
});

test("auth: without any secret configured it behaves as before (claims only)", () => {
    assert.ok(validateJwt(accountsToken(claims, "anything"), { env: {} }));
    assert.equal(validateJwt(accountsToken({ ...claims, exp: 1 }, "anything"), { env: {} }), null);
});
