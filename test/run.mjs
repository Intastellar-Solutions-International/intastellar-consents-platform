import { run } from "./_harness.mjs";
import "./tracker-embedded.test.mjs";
import "./analytics-report-embed-filter.test.mjs";
import "./push-gate-scope.test.mjs";
import "./self-referral.test.mjs";
import "./noise-referral-sql.test.mjs";

await run();
