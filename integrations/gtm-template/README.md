# Intastellar Analytics — Google Tag Manager template

Install [Intastellar Analytics](https://www.intastellarconsents.com) from Google Tag Manager without pasting code.

## Use it

1. In Google Tag Manager: **Tags → New → Tag configuration → Discover more tag types in the Community Template Gallery**, search for **Intastellar Analytics**, add it.
   (Before it's in the gallery: **Templates → Tag templates → New → ⋮ → Import** and pick `template.tpl`.)
2. **Site key:** from Intastellar Analytics → Settings (the `data-site` value of the install code).
3. **Consent banner:** tick *Also load the Intastellar consent banner* only if the banner isn't already in your site's code, and enter the domain as registered in Intastellar Consents.
4. **Trigger:**
   - Tracker only: **All Pages**.
   - With the banner: **Consent Initialization – All Pages**, so the banner appears as early as possible.
5. Don't add GTM consent checks to this tag: the tracker follows the visitor's banner choice itself — anonymous page counts without consent, full analytics with it.

The tag loads, in this order and only from these addresses:

| Script | When |
|---|---|
| `https://downloads.intastellarsolutions.com/cookieconsents/<domain>/config.js` | banner enabled |
| `https://consents.cdn.intastellarsolutions.com/uc.js` | banner enabled |
| `https://analytics.consentsmanagement.com/api/a?id=<site key>` | always |

## Publish to the Community Template Gallery

The gallery reads a GitHub repository with only `template.tpl`, `metadata.yaml` and `LICENSE` (Apache 2.0) at its root, on the main branch, with Issues enabled.

1. Import `template.tpl` into a GTM container (see above), open the **Tests** tab and run the tests; on the **Info** tab accept the gallery terms; export it again if GTM changed anything.
2. Create the repository (e.g. `intastellar-analytics-gtm-template`) and push these files to its root.
3. Copy the commit SHA that contains `template.tpl` into `metadata.yaml` (`versions[0].sha`) and push that.
4. [tagmanager.google.com/gallery](https://tagmanager.google.com/gallery) → **Submit template** → repository URL.

Updates: commit the new `template.tpl`, add a new `sha` + `changeNotes` at the **top** of `versions`.
