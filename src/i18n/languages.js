// Languages the platform is offered in, named in their own language.
// Adding one: add it here, add src/i18n/<code>.js (and register it in
// src/i18n/index.js), and a block in src/Login/loginTranslations.js.
export const LANGUAGES = [
    { code: "en", name: "English" },
    { code: "de", name: "Deutsch" },
    { code: "da", name: "Dansk" },
    { code: "sv", name: "Svenska" },
    { code: "nb", name: "Norsk (bokmål)" },
    { code: "nl", name: "Nederlands" },
    { code: "fr", name: "Français" },
    { code: "es", name: "Español" },
    { code: "it", name: "Italiano" },
    { code: "pl", name: "Polski" },
];

const CODES = LANGUAGES.map((l) => l.code);

// Browsers report Norwegian as "no" or Nynorsk "nn" too; both get Bokmål.
const ALIASES = { no: "nb", nn: "nb" };

// The saved choice, else the browser's first supported language, else
// English.
export function pickLanguage(saved, browserLanguages) {
    if (CODES.includes(saved)) return saved;
    for (const tag of browserLanguages || []) {
        const base = String(tag || "").slice(0, 2).toLowerCase();
        const code = ALIASES[base] || base;
        if (CODES.includes(code)) return code;
    }
    return "en";
}

// Text in `dictionary` for `text` (the English original), with {name}
// placeholders filled from `vars`. Untranslated text stays English.
export function translateWith(dictionary, text, vars) {
    const out = (dictionary && dictionary[text]) || text;
    return vars ? out.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : out;
}
