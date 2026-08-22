/**
 * Shared FX utilities for ad-spend-report and cron-ad-sync.
 *
 * ECB rates are EUR-based: 1 EUR = rates[currency].
 * `fx(amount, from, to, rates)` converts between any two currencies.
 *
 * FALLBACK_RATES seeds the rates object before ECB overrides — so common
 * currencies always work even if the ECB XML fails to parse (partial fetch,
 * changed format, transient outage). Rate values are approximate mid-market;
 * close enough for spend aggregation display, not for financial settlement.
 */

export const FALLBACK_RATES = {
    EUR: 1,    USD: 1.09,  GBP: 0.86,  DKK: 7.46,
    SEK: 11.3, NOK: 11.7,  CHF: 0.97,  PLN: 4.30,
    AUD: 1.68, CAD: 1.49,  SGD: 1.46,  JPY: 163.0,
    HUF: 395,  CZK: 24.8,  RON: 4.97,  BGN: 1.96,
};

let _fxCache = { rates: null, fetchedAt: 0 };

export async function getEcbRates() {
    if (_fxCache.rates && Object.keys(_fxCache.rates).length > 5 && Date.now() - _fxCache.fetchedAt < 86_400_000) {
        return _fxCache.rates;
    }
    try {
        const xml = await fetch(
            "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
            { signal: AbortSignal.timeout(5000) }
        ).then(r => r.text());
        const rates = { ...FALLBACK_RATES };
        for (const m of xml.matchAll(/currency="([A-Z]{3})" rate="([0-9.]+)"/g)) {
            rates[m[1]] = parseFloat(m[2]);
        }
        _fxCache = { rates, fetchedAt: Date.now() };
        return rates;
    } catch {
        return Object.keys(_fxCache.rates || {}).length > 5 ? _fxCache.rates : { ...FALLBACK_RATES };
    }
}

/**
 * Convert `amount` from currency `from` to `to` using ECB-style rates.
 * Returns the original amount unchanged when either currency is unknown
 * (so callers never get NaN/undefined silently).
 */
export function fx(amount, from, to, rates) {
    if (!from || !to || from === to) return Number(amount || 0);
    const n = Number(amount);
    if (!n) return 0;
    const fromRate = rates[from];
    const toRate   = rates[to];
    if (!fromRate || !toRate) return n;
    return (n / fromRate) * toRate;
}
