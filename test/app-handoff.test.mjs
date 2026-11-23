// Mobile app → web hand-over (api/_app-handoff.js): codes are single-use,
// expire, only open their own token, and the table never holds a token in
// the clear.
import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { seal, open, newCode, bearerToken, cleanUser, createHandoff, redeemHandoff, HANDOFF_CODE_RE, MAX_OPEN_CODES_PER_USER } from "../api/_app-handoff.js";

// Just enough of pg for the three statements the module runs.
function fakeDb() {
    const rows = new Map(); // code_hash → row
    let now = Date.now();
    return {
        rows,
        advance(sec) { now += sec * 1000; },
        async query(sql, params = []) {
            if (sql.startsWith("DELETE FROM app_handoff_codes WHERE expires_at < NOW()")) {
                for (const [k, r] of rows) if (r.expires < now) rows.delete(k);
                return { rows: [] };
            }
            if (sql.startsWith("SELECT COUNT(*)")) {
                return { rows: [{ n: [...rows.values()].filter((r) => r.email === params[0]).length }] };
            }
            if (sql.trim().startsWith("INSERT INTO app_handoff_codes")) {
                const [hash, org, email, userJson, sealed, ttl] = params;
                rows.set(hash, { organisation_id: org, email, user_json: JSON.parse(userJson), sealed_token: sealed, expires: now + ttl * 1000 });
                return { rows: [] };
            }
            if (sql.trim().startsWith("DELETE FROM app_handoff_codes WHERE code_hash")) {
                const r = rows.get(params[0]);
                if (!r || r.expires < now) return { rows: [] };
                rows.delete(params[0]);
                return { rows: [r] };
            }
            throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
        },
    };
}

const member = { organisationId: 7, email: "felix@example.com" };

test("app hand-over: a code opens only its own sealed token", () => {
    const code = newCode();
    assert.match(code, HANDOFF_CODE_RE);
    const sealed = seal(code, "TOKEN123");
    assert.ok(!sealed.includes("TOKEN123"));
    assert.equal(open(code, sealed), "TOKEN123");
    assert.equal(open(newCode(), sealed), null);
    assert.equal(open(code, "garbage"), null);
});

test("app hand-over: create → redeem once → gone; the table holds no token", async () => {
    const db = fakeDb();
    const created = await createHandoff(db, { member, token: "TOKEN123", user: { name: { first: "Felix" }, image: "javascript:x" } });
    assert.match(created.code, HANDOFF_CODE_RE);
    assert.equal(created.expiresIn, 60);
    assert.ok(![...db.rows.values()].some((r) => JSON.stringify(r).includes("TOKEN123")), "token never stored in the clear");

    const first = await redeemHandoff(db, created.code);
    assert.equal(first.token, "TOKEN123");
    assert.equal(first.email, member.email);
    assert.equal(first.organisationId, 7);
    assert.equal(first.user.image, undefined, "non-https image dropped");

    const again = await redeemHandoff(db, created.code);
    assert.equal(again.status, 410, "single use");
});

test("app hand-over: expired and malformed codes are refused", async () => {
    const db = fakeDb();
    const { code } = await createHandoff(db, { member, token: "T", user: {} });
    db.advance(61);
    assert.equal((await redeemHandoff(db, code)).status, 410);
    assert.equal((await redeemHandoff(db, "short")).status, 400);
    assert.equal((await redeemHandoff(db, "'; DROP TABLE x;--aaaaaaaaaaaaaaaaaaaaaaaaaa")).status, 400);
});

test("app hand-over: open codes per user are capped", async () => {
    const db = fakeDb();
    for (let i = 0; i < MAX_OPEN_CODES_PER_USER; i++) await createHandoff(db, { member, token: "T", user: {} });
    assert.equal((await createHandoff(db, { member, token: "T", user: {} })).status, 429);
    assert.equal((await createHandoff(db, { member, token: null, user: {} })).status, 401);
});

test("app hand-over: bearer token and display details are parsed safely", () => {
    assert.equal(bearerToken("Bearer abc.def"), "abc.def");
    assert.equal(bearerToken("abc"), null);
    assert.deepEqual(cleanUser({ name: { first: "A".repeat(500) } }).name.first.length, 100);
    assert.equal(cleanUser({ image: "https://x.test/a.png" }).image, "https://x.test/a.png");
});
