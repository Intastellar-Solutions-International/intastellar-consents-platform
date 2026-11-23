// The web dashboard's translations (src/i18n), shared as-is: same keys,
// same wording, one place to fix a translation. The app follows the
// phone's language; unsupported languages fall back to English.
import { getLocales } from "expo-localization";
import { pickLanguage, translateWith } from "../../../../src/i18n/languages.js";
import de from "../../../../src/i18n/de.js";
import da from "../../../../src/i18n/da.js";
import sv from "../../../../src/i18n/sv.js";
import nb from "../../../../src/i18n/nb.js";
import nl from "../../../../src/i18n/nl.js";
import fr from "../../../../src/i18n/fr.js";
import es from "../../../../src/i18n/es.js";
import it from "../../../../src/i18n/it.js";
import pl from "../../../../src/i18n/pl.js";

const DICTIONARIES = { de, da, sv, nb, nl, fr, es, it, pl };

// Same mapping as the web (src/Functions/userLocale.js): the language's usual
// number format, unless the phone's region uses the same language.
const LANGUAGE_LOCALES = {
    en: "en-GB", de: "de-DE", da: "da-DK", sv: "sv-SE", nb: "nb-NO",
    nl: "nl-NL", fr: "fr-FR", es: "es-ES", it: "it-IT", pl: "pl-PL",
};

const deviceTags = getLocales().map((l) => l.languageTag).filter(Boolean);
export const language = pickLanguage(null, deviceTags);
export const locale = deviceTags.find((tag) => tag.slice(0, 2).toLowerCase() === language) || LANGUAGE_LOCALES[language] || "en-GB";

export function t(text, vars) {
    return translateWith(DICTIONARIES[language], text, vars);
}
