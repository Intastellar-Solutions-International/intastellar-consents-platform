// Copies every Stripe subscription into billing_subscriptions.
//
// Run once before the platform's paywall switches to /api/billing-subscription
// (existing customers would otherwise read as "no plan"), and any time the
// table needs rebuilding. Safe to re-run: rows are upserted.
//
//   vercel env pull .env.billing --environment=production
//   node --env-file=.env.billing scripts/backfill-subscriptions.mjs [live|test]
//
// Needs POSTGRES_URL, STRIPE_SECRET_KEY_<MODE> and the STRIPE_PRICE_ID_* vars.
// Node 20+ for --env-file.

import { getPool } from "../api/_db.js";
import { stripe, syncSubscription, planForPrice } from "../api/_stripe.js";

const mode = process.argv[2] === "test" ? "test" : "live";
const db = getPool();

let startingAfter;
const counts = { stored: 0, noOrganisation: 0, unmappedPrice: 0, failed: 0 };
do {
    const page = await stripe("GET", "/subscriptions", { status: "all", limit: 100, starting_after: startingAfter }, mode);
    for (const sub of page.data) {
        try {
            const row = await syncSubscription(db, sub.id, { livemode: mode === "live" });
            if (!row) { counts.noOrganisation++; console.log(`  skipped ${sub.id} (${sub.status}): no organisation`); continue; }
            counts.stored++;
            if (!planForPrice(row.price_id)) { counts.unmappedPrice++; console.log(`  ${sub.id}: price ${row.price_id} has no plan`); }
            console.log(`  org ${row.organisation_id}: ${row.plan ?? "?"} ${row.status} (${sub.id})`);
        } catch (err) {
            counts.failed++;
            console.error(`  FAILED ${sub.id}: ${err.message}`);
        }
    }
    startingAfter = page.has_more ? page.data[page.data.length - 1].id : undefined;
} while (startingAfter);

console.log(`\n${mode}: ${counts.stored} stored, ${counts.noOrganisation} without organisation, ${counts.unmappedPrice} with an unmapped price, ${counts.failed} failed`);
await db.end();
process.exit(counts.failed ? 1 : 0);
