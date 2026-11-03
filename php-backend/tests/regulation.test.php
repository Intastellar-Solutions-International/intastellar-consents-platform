<?php
// Item 5 follow-up — which privacy law applies to a visitor.
load_functions("$ROOT/consents/collect.php", ['getRegulationApplied']);

test('US state laws match on the ISO region code', function () {
    eq(getRegulationApplied('US', 'CA', 'NA'), 'ccpa');
    eq(getRegulationApplied('US', 'VA', 'NA'), 'cdpa');
    eq(getRegulationApplied('US', 'CO', 'NA'), 'cpa');
    eq(getRegulationApplied('US', 'UT', 'NA'), 'ucpa');
    eq(getRegulationApplied('US', 'CT', 'NA'), 'ctdpa');
    eq(getRegulationApplied('CA', 'QC', 'NA'), 'law25');
});

test('a full region name never matched — the bug collect.php now avoids', function () {
    // What the old call passed (ip-api regionName). Documents why the caller
    // must use the code: with a name, California visitors got no framework.
    eq(getRegulationApplied('US', 'California', 'NA'), '');
});

test('country-level regulations are unaffected', function () {
    eq(getRegulationApplied('DK', 'DK-84', 'EU'), 'gdpr');
    eq(getRegulationApplied('GB', 'ENG', 'EU'), 'uk_gdpr');
    eq(getRegulationApplied('BR', 'SP', 'SA'), 'lgpd');
    eq(getRegulationApplied('US', 'TX', 'NA'), '');
});
