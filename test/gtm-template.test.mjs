// The Google Tag Manager template (integrations/gtm-template/template.tpl):
// sections parse, the sandboxed code loads the right scripts in order, and
// every URL it builds is covered by the declared inject_script permission.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "./_harness.mjs";

const tpl = readFileSync(new URL("../integrations/gtm-template/template.tpl", import.meta.url), "utf8");
const section = (name) => {
    const m = tpl.match(new RegExp(`___${name}___\\n\\n([\\s\\S]*?)\\n\\n\\n?___`));
    assert.ok(m, `section ${name}`);
    return m[1];
};

function run(data) {
    const injected = [];
    let result = null;
    const apis = {
        injectScript: (url, onSuccess, onFailure) => { injected.push(url); (data.__fail ? onFailure : onSuccess)(); },
        encodeUriComponent: encodeURIComponent,
    };
    const full = { ...data, gtmOnSuccess: () => { result = "success"; }, gtmOnFailure: () => { result = "failure"; } };
    // eslint-disable-next-line no-new-func
    new Function("require", "data", section("SANDBOXED_JS_FOR_WEB_TEMPLATE"))((name) => {
        assert.ok(apis[name], `uses only known sandbox APIs (${name})`);
        return apis[name];
    }, full);
    return { injected, result };
}

const permittedPatterns = () => JSON.parse(section("WEB_PERMISSIONS"))[0].instance.param[0].value.listItem.map((i) => i.string);
const allowed = (url) => permittedPatterns().some((p) => new RegExp(`^${p.replace(/[.?+^$()[\]{}|\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(url));

test("gtm template: sections parse; gallery metadata present", () => {
    const info = JSON.parse(section("INFO"));
    assert.equal(info.type, "TAG");
    assert.ok(info.categories.includes("ANALYTICS"));
    assert.match(info.brand.thumbnail, /^data:image\/png;base64,/);
    assert.equal(JSON.parse(section("TEMPLATE_PARAMETERS")).length, 3);
    assert.match(tpl, /___TESTS___\n\nscenarios:/);
    const license = readFileSync(new URL("../integrations/gtm-template/LICENSE", import.meta.url), "utf8");
    assert.match(license, /Apache License\s+Version 2\.0/);
});

test("gtm template: tracker only, or banner config → banner → tracker; all within the permission", () => {
    const only = run({ siteKey: "AbCdEf12_-xyZ789", loadBanner: false });
    assert.deepEqual(only.injected, ["https://analytics.consentsmanagement.com/api/a?id=AbCdEf12_-xyZ789"]);
    assert.equal(only.result, "success");

    const withBanner = run({ siteKey: "AbCdEf12_-xyZ789", loadBanner: true, bannerDomain: "example.com" });
    assert.deepEqual(withBanner.injected, [
        "https://downloads.intastellarsolutions.com/cookieconsents/example.com/config.js",
        "https://consents.cdn.intastellarsolutions.com/uc.js",
        "https://analytics.consentsmanagement.com/api/a?id=AbCdEf12_-xyZ789",
    ]);
    for (const url of withBanner.injected) assert.ok(allowed(url), url);
    assert.ok(!allowed("https://evil.example/api/a"), "nothing else");

    const failed = run({ siteKey: "AbCdEf12_-xyZ789", loadBanner: true, bannerDomain: "example.com", __fail: true });
    assert.deepEqual(failed.injected.length, 1, "tracker not loaded when the banner fails");
    assert.equal(failed.result, "failure");
});

test("gtm template: site key and domain validation match real values", () => {
    const [siteKey, , domain] = JSON.parse(section("TEMPLATE_PARAMETERS"));
    const re = (p) => new RegExp(p.valueValidators.find((v) => v.type === "REGEX").args[0]);
    assert.ok(re(siteKey).test("Xk3_9aB-cD4eF5gH"), "a generated key (16 base64url chars)");
    assert.ok(!re(siteKey).test("abc"), "too short");
    assert.ok(!re(siteKey).test("bad key!"), "spaces / symbols");
    assert.ok(re(domain).test("shop.example.co.uk"));
    assert.ok(!re(domain).test("https://example.com"));
    assert.ok(!re(domain).test("Example.com"), "lowercase like the CDN paths");
});
