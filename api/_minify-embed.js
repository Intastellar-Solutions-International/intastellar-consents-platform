/**
 * Minification for the analytics embed script served by GET /api/a.
 *
 * EMBED_SCRIPT is authored readable — long explanatory comments included —
 * and minified here at serve time rather than in a build step, since this
 * project has no build step for api/ functions. Cuts the script to less than
 * half (≈73 KB → 33 KB raw, ≈24 KB → 11 KB gzipped).
 *
 * terser is loaded with a dynamic import so only the GET path pays for it:
 * the same function also handles every ingest POST, and those cold starts
 * shouldn't load a minifier they never use.
 */
export const MINIFY_OPTIONS = {
    // The embed script is hand-written ES5 for old-browser support; keep the
    // output ES5 too so compression never introduces newer syntax.
    ecma: 5,
    compress: { passes: 2 },
    mangle: true,
    // ascii_only: escape the em dashes etc. in user-facing messages so the
    // script can't be mis-decoded on a page served in a non-UTF-8 charset.
    format: { comments: false, ascii_only: true },
};

export async function minifyEmbed(source) {
    const { minify } = await import("terser");
    const result = await minify(source, MINIFY_OPTIONS);
    if (!result.code) throw new Error("terser returned no code");
    return result.code;
}

/**
 * Memoized per function instance (minifying takes a few hundred ms). Falls
 * back to the unminified source if minification ever fails, so a terser
 * problem can never stop the script from being served.
 */
export function createEmbedCache(source) {
    let pending = null;
    return function getEmbed() {
        if (!pending) {
            pending = minifyEmbed(source).catch((err) => {
                console.error("[a] embed script minification failed, serving unminified:", err?.message || err);
                return source;
            });
        }
        return pending;
    };
}
