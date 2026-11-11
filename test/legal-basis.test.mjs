import assert from "node:assert/strict";
import { test } from "./_harness.mjs";
import { bannerLegalBasis, hostPattern, normalizeHost, validateServices } from "../api/_legal-basis.js";

const hubspot = { name: "HubSpot Forms", purpose: "functional", basis: "legitimate_interest", hosts: "https://js.hsforms.net/forms, forms.hsforms.com" };

test("normalizeHost keeps only the hostname and refuses anything broader", () => {
    assert.strictEqual(normalizeHost("https://JS.hsforms.net/forms/v2.js"), "js.hsforms.net");
    assert.strictEqual(normalizeHost("*.hsforms.net"), "hsforms.net");
    assert.strictEqual(normalizeHost("js.hsforms.net:443"), "js.hsforms.net");
    for (const raw of [".*", "com", "hsforms", "", "a b.com", "(.*)"]) assert.strictEqual(normalizeHost(raw), null, raw);
});

test("hostPattern matches the host and its subdomains but no look-alike", () => {
    const re = new RegExp(hostPattern("hsforms.net"), "i");
    for (const yes of ["https://hsforms.net/x.js", "https://js.hsforms.net/x.js", "//JS.HSFORMS.NET/x", "s.src='https://js.hsforms.net/v2.js'"]) {
        assert.ok(re.test(yes), yes);
    }
    for (const no of ["https://evilhsforms.net/x.js", "https://hsforms.net.attacker.com/x.js", "https://js-hsforms.net/x", "https://hsforms.network/x"]) {
        assert.ok(!re.test(no), no);
    }
});

test("validateServices turns the form into stored services", () => {
    const { services, error } = validateServices([hubspot]);
    assert.strictEqual(error, undefined);
    assert.deepStrictEqual(services, [{
        id: "hubspot-forms", name: "HubSpot Forms", purpose: "functional", basis: "legitimate_interest",
        hosts: ["js.hsforms.net", "forms.hsforms.com"], deviceAccess: false,
    }]);
});

test("validateServices refuses consent, bad hosts and duplicate names", () => {
    assert.ok(validateServices([{ ...hubspot, basis: "consent" }]).error);
    assert.ok(validateServices([{ ...hubspot, hosts: ".*" }]).error);
    assert.ok(validateServices([{ ...hubspot, hosts: "" }]).error);
    assert.ok(validateServices([hubspot, hubspot]).error);
    assert.ok(validateServices("nope").error);
});

test("bannerLegalBasis leaves out services that store or read on the device", () => {
    const { services } = validateServices([hubspot, { ...hubspot, name: "HubSpot Tracking", hosts: "js.hs-scripts.com", deviceAccess: true }]);
    const banner = bannerLegalBasis(services);
    assert.deepStrictEqual(banner.services.map((s) => s.id), ["hubspot-forms"]);
    assert.ok(new RegExp(banner.services[0].match[0], "i").test("https://js.hsforms.net/forms/v2.js"));
});
