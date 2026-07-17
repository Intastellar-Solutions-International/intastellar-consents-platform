/**
 * Intastellar Cookie Table — v1
 * Drop-in embed for privacy / cookie policy pages.
 *
 * Usage:
 *   <div data-intastellar-cookies data-domain="example.com"></div>
 *   <script src="https://www.intastellarconsents.com/cookie-table.js" defer></script>
 *
 * The div is replaced with a live, auto-grouped cookie table sourced from the
 * most recent scan of the specified domain.
 *
 * Optional attributes on the div:
 *   data-lang="de"   — en (default), da, no, sv, pl, nl, af, fr, es, pt, de
 */
(function () {
    'use strict';

    // Capture base URL before any async work (currentScript is null after DOMContentLoaded)
    var BASE = (function () {
        var s = document.currentScript;
        if (s && s.src) {
            try { return new URL(s.src).origin; } catch (_) {}
        }
        return 'https://www.intastellarconsents.com';
    })();

    var STYLE_ID = 'ics-ct-styles';

    var LABELS = {
        en: {
            necessary:  'Necessary',
            security:   'Security',
            analytics:  'Analytics',
            marketing:  'Marketing',
            functional: 'Functional',
            colName:        'Cookie name',
            colDomain:      'Domain',
            colProvider:    'Provider',
            colLifetime:    'Lifetime',
            colDescription: 'Description',
            session:    'Session',
            persistent: 'Persistent',
            loading:    'Loading cookie list…',
            retrying:   'Scan in progress — please reload in ~30 s.',
            error:      'Could not load the cookie list. Please try again later.',
            noCookies:  'No cookies detected for this category.',
            updated:    'Last updated:',
            noData:          'No cookies were detected for this domain. The website may restrict cookies before consent is given.',
            servicesHeading: 'Third-party services',
            servicesIntro:   'The following third-party services may access or process personal data when you visit this website.',
            colService:      'Service',
            colPurpose:      'Purpose',
            colCountry:      'Country',
            colTransfer:       'Transfer basis',
            manageHeading:     'Managing your cookie preferences',
            managePara:        "You can withdraw or change your cookie consent at any time using the cookie settings panel on this website. Most web browsers also allow you to control cookies through their settings; refer to your browser's help documentation for details.",
            controllerHeading: 'Data controller',
            controllerText:    'This website is operated by',
            controllerContact: 'For privacy-related enquiries, please contact us at',
            intro: [
                'We use cookies and similar tracking technologies to track the activity on our Service and hold certain information.',
                'Cookies are files with a small amount of data which may include an anonymous unique identifier. Cookies are sent to your browser from a website and stored on your device. Other tracking technologies are also used such as beacons, tags and scripts to collect and track information and to improve and analyse our Service.',
                'You can manage your cookie preferences at any time using the cookie settings panel available on our website. You can also instruct your browser to refuse all cookies, though doing so may prevent some portions of our Service from functioning correctly.',
                'We organise the cookies we use into the following categories:',
            ],
            catDesc: {
                necessary:  'These cookies are essential for the website to function correctly. They enable core features such as page navigation, security, and access to protected areas. Without them, the website cannot operate as intended and they cannot be switched off.',
                security:   'These cookies help us detect and prevent malicious activity, bots, and fraudulent behaviour. They do not store any personally identifiable information.',
                analytics:  'These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously. They allow us to measure traffic, identify popular content, and improve the overall user experience.',
                marketing:  'These cookies track your browsing activity across websites to deliver personalised and relevant advertising. They are typically set by our advertising partners and allow those partners to build a profile of your interests.',
                functional: 'These cookies enable enhanced features and personalisation such as live chat widgets, embedded videos, and social media integrations. Disabling them may reduce the functionality of certain parts of the website.',
            },
        },
        de: {
            necessary:  'Notwendig',
            security:   'Sicherheit',
            analytics:  'Analyse',
            marketing:  'Marketing',
            functional: 'Funktional',
            colName:        'Cookie-Name',
            colDomain:      'Domain',
            colProvider:    'Anbieter',
            colLifetime:    'Lebensdauer',
            colDescription: 'Beschreibung',
            session:    'Sitzung',
            persistent: 'Dauerhaft',
            loading:    'Cookie-Liste wird geladen…',
            retrying:   'Scan läuft — bitte in ~30 s neu laden.',
            error:      'Cookie-Liste konnte nicht geladen werden. Bitte später erneut versuchen.',
            noCookies:  'Keine Cookies für diese Kategorie erkannt.',
            updated:    'Zuletzt aktualisiert:',
            noData:            'Für diese Domain wurden keine Cookies erkannt. Die Website schränkt Cookies möglicherweise vor der Einwilligung ein.',
            servicesHeading:   'Drittanbieter',
            servicesIntro:     'Die folgenden Drittanbieter können auf personenbezogene Daten zugreifen oder diese verarbeiten, wenn Sie diese Website besuchen.',
            colService:        'Dienst',
            colPurpose:        'Zweck',
            colCountry:        'Land',
            colTransfer:       'Übermittlungsgrundlage',
            manageHeading:     'Ihre Cookie-Einstellungen verwalten',
            managePara:        'Sie können Ihre Cookie-Einwilligung jederzeit über das Cookie-Einstellungspanel auf dieser Website widerrufen oder ändern. Die meisten Webbrowser ermöglichen auch die Steuerung von Cookies über die Browsereinstellungen; weitere Informationen entnehmen Sie bitte der Hilfedokumentation Ihres Browsers.',
            controllerHeading: 'Verantwortlicher',
            controllerText:    'Diese Website wird betrieben von',
            controllerContact: 'Bei datenschutzbezogenen Anfragen wenden Sie sich bitte an',
            intro: [
                'Wir verwenden Cookies und ähnliche Tracking-Technologien, um die Aktivität auf unserem Dienst zu verfolgen und bestimmte Informationen zu speichern.',
                'Cookies sind Dateien mit einer kleinen Datenmenge, die einen anonymen eindeutigen Bezeichner enthalten können. Cookies werden von einer Website an Ihren Browser gesendet und auf Ihrem Gerät gespeichert. Es werden auch andere Tracking-Technologien wie Beacons, Tags und Skripte eingesetzt, um Informationen zu erfassen und zu verfolgen sowie unseren Dienst zu verbessern und zu analysieren.',
                'Sie können Ihre Cookie-Einstellungen jederzeit über das Cookie-Einstellungspanel auf unserer Website verwalten. Sie können Ihren Browser auch anweisen, alle Cookies abzulehnen, obwohl dies dazu führen kann, dass einige Teile unseres Dienstes nicht mehr korrekt funktionieren.',
                'Wir ordnen die von uns verwendeten Cookies in folgende Kategorien ein:',
            ],
            catDesc: {
                necessary:  'Diese Cookies sind für den ordnungsgemäßen Betrieb der Website unentbehrlich. Sie ermöglichen grundlegende Funktionen wie Navigation, Sicherheit und den Zugriff auf geschützte Bereiche. Ohne sie kann die Website nicht wie vorgesehen funktionieren und sie können nicht deaktiviert werden.',
                security:   'Diese Cookies helfen uns, böswillige Aktivitäten, Bots und betrügerisches Verhalten zu erkennen und zu verhindern. Sie speichern keine personenbezogenen Daten.',
                analytics:  'Diese Cookies helfen uns zu verstehen, wie Besucher mit unserer Website interagieren, indem sie Informationen anonym erfassen und auswerten. Sie ermöglichen es uns, den Datenverkehr zu messen, beliebte Inhalte zu identifizieren und die allgemeine Nutzererfahrung zu verbessern.',
                marketing:  'Diese Cookies verfolgen Ihre Surfaktivitäten auf verschiedenen Websites, um Ihnen personalisierte und relevante Werbung anzuzeigen. Sie werden in der Regel von unseren Werbepartnern gesetzt und ermöglichen diesen, ein Profil Ihrer Interessen aufzubauen.',
                functional: 'Diese Cookies ermöglichen erweiterte Funktionen und Personalisierung, wie z. B. Live-Chat-Widgets, eingebettete Videos und Social-Media-Integrationen. Das Deaktivieren dieser Cookies kann die Funktionalität bestimmter Teile der Website einschränken.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Google Analytics Client-ID – identifiziert einen eindeutigen Besucher sitzungsübergreifend. Läuft nach 2 Jahren ab.' },
                { e: '_gid',                       d: 'Google Analytics-Sitzungscookie – unterscheidet Benutzer innerhalb einer 24-Stunden-Sitzung.' },
                { p: '_ga_',                       d: 'Google Analytics 4-Property-Cookie – speichert den Sitzungsstatus für eine bestimmte GA4-Mess-ID.' },
                { e: '_fbp',                       d: 'Facebook Pixel-Browser-ID – identifiziert Browser für Anzeigenauslieferung und Konversionsmessung. Läuft nach 3 Monaten ab.' },
                { e: '_fbc',                       d: 'Facebook-Klick-ID – speichert den fbclid-Parameter eines Facebook-Anzeigenklicks. Läuft nach 3 Monaten ab.' },
                { e: 'hubspotutk',                 d: 'HubSpot-Besuchertoken – verfolgt die Besucheridentität über Besuche und Formulare hinweg. Läuft nach 13 Monaten ab.' },
                { p: '_hj',                        d: 'Hotjar-Tracking-Cookie – wird für Sitzungsaufzeichnungen, Heatmaps und Verhaltensanalysen verwendet.' },
                { e: '_clck',                      d: 'Microsoft Clarity-Benutzer-ID – speichert die Clarity-Benutzer-ID und Einstellungen. Läuft nach 1 Jahr ab.' },
                { e: '_clsk',                      d: 'Microsoft Clarity-Sitzungsschlüssel – verbindet Seitenaufrufe innerhalb einer Sitzung. Läuft nach 24 Stunden ab.' },
                { e: '_ttp',                       d: 'TikTok Pixel-Tracking-ID – speichert die Browser-ID für die Anzeigenleistungsmessung. Läuft nach 13 Monaten ab.' },
                { e: '__cf_bm',                    d: 'Cloudflare Bot-Management-Cookie – unterscheidet menschliche Besucher von automatisierten Bots. Läuft nach 30 Minuten ab.' },
                { e: 'cf_clearance',               d: 'Cloudflare-Freigabe-Cookie – bestätigt, dass ein Besucher eine Cloudflare-Sicherheitsprüfung bestanden hat. Läuft nach 1 Tag ab.' },
                { e: 'IntastellarConsentSolution', d: 'Intastellar Consents-Datensatz – speichert die Cookie-Einwilligungsentscheidungen des Besuchers. Läuft nach 3 Monaten ab.' },
                { e: 'PHPSESSID',                  d: 'PHP-Sitzungscookie – verwaltet eine serverseitige Benutzersitzung. Sitzungscookie.' },
                { e: 'IDE',                        d: 'DoubleClick-Anzeigen-Cookie – identifiziert den Browser für personalisierte Google-Anzeigen. Läuft nach 13 Monaten ab.' },
                { e: 'ar_debug',               d: 'LinkedIn-Ads-Debug-Cookie – wird von LinkedIn zur Fehlerdiagnose beim Conversion-Tracking über den Insight Tag verwendet. Sitzungscookie.' },
                { e: 'AnalyticsSyncHistory',   d: 'LinkedIn Analytics-Synchronisierungscookie – zeichnet auf, wann LinkedIn-Analysedaten zuletzt mit der Besucheraktivität synchronisiert wurden. Läuft nach 1 Monat ab.' },
                { e: 'omnisendSessionID',      d: 'Omnisend-Sitzungscookie – verfolgt die aktuelle Besuchersitzung für E-Mail-Marketing-Automatisierung und Attribution von Omnisend. Sitzungscookie.' },
                { e: 'CLID',                   d: 'Microsoft Clarity Client-ID – speichert eine eindeutige Besucher-ID für Heatmaps und Sitzungsaufzeichnungen. Läuft nach 1 Jahr ab.' },
                { e: 'barometric[cuid]',        d: 'Barometric geräteübergreifende ID – speichert eine eindeutige Kennung für geräteübergreifendes Ad-Targeting und programmatische Werbe-Attribution.' },
                { e: 'TapAd_TS',                d: 'Tapad-Synchronisierungs-Zeitstempel – zeichnet auf, wann Tapads geräteübergreifender Identitätsgraph zuletzt für diesen Browser synchronisiert wurde.' },
                { e: 'TapAd_DID',               d: 'Tapad-Geräte-ID – speichert eine eindeutige Gerätekennung für geräteübergreifendes Ad-Targeting und Frequency Capping im Tapad-Werbenetzwerk.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Tapad-Sync-Zähler – verfolgt die Anzahl der Drei-Wege-Cookie-Synchronisierungen für die geräteübergreifende Identitätsauflösung.' },
                { e: 'cg_uuid',                  d: 'Geräteübergreifende Werbe-UUID – speichert eine eindeutige Kennung für websiteübergreifendes Audience-Targeting und Anzeigenpersonalisierung.' },
                { e: 'brwsr',                    d: 'HubSpot Browser-ID – identifiziert den Browser des Besuchers für HubSpot-Marketinganalysen und Retargeting auf HubSpot-eigenen Domains.' },
                { e: 'irld',                     d: 'HubSpot-Weiterleitungs-ID – erfasst eingehende Linkklicks und Kampagnen-Attribution auf HubSpot-Landingpages.' },
                { e: 'laboratory-anonymous-id',  d: 'HubSpot-Experiment-ID – weist eine anonyme Kennung für das interne A/B-Testing und Experimentierplatform von HubSpot zu.' },
                { e: '_switch_session_id',        d: 'HubSpot Portal-Wechsel-Sitzung – verfolgt die aktive Sitzung beim Wechsel zwischen HubSpot-Portalen. Läuft nach 6 Monaten ab.' },
                { e: 'FPAU',                     d: 'Google First-Party-Analyse-URL – wird vom First-Party-Modus von Google Tag Manager gesetzt, um Analysedaten ohne Drittanbieter-Cookies zu erfassen.' },
                { e: '_twpid',                   d: 'Twitter/X Pixel-ID – identifiziert den Besucher für Twitter/X-Werbe-Attribution und Retargeting. Läuft nach 2 Jahren ab.' },
                { p: '__pdst',                   d: 'Podscribe-Attributions-Cookie – verfolgt die Benutzeraktivität für Podcast-Werbe-Attribution und kanalübergreifende Reichweitenmessung.' },
                { p: '_tq_id',                   d: 'TVSquared Pixel-ID – speichert eine Zuschauer-ID für die kanalübergreifende TV- und Streaming-Werbemessung.' },
                { e: '_cq_duid',                  d: 'Contentsquare Geräte-ID – speichert eine eindeutige Gerätekennung für Sitzungsaufzeichnung und User-Journey-Analyse.' },
                { e: '_cq_suid',                  d: 'Contentsquare Sitzungsbenutzer-ID – weist jeder Besuchersitzung eine eindeutige ID für Heatmaps und Sitzungswiederholung zu.' },
                { e: '_cq_session',               d: 'Contentsquare Sitzungscookie – verfolgt die aktuelle Besuchersitzung für Digital-Experience-Analyse. Läuft nach 30 Minuten ab.' },
                { e: '_cq_s',                     d: 'Contentsquare Segment-Cookie – speichert Besuchersegmentdaten für Digital-Experience-Analyse und Personalisierung.' },
                { e: 'IR_PI',                    d: 'Impact Seitenaufruf-Cookie – erfasst Seitenaufrufe für die Affiliate- und Partnership-Attribution der Impact-Plattform.' },
                { e: 'IR_gbd',                   d: 'Impact globale Browserdaten – speichert Browserinformationen für das Affiliate- und Partnership-Conversion-Tracking von Impact.' },
                { p: 'IR_',                      d: 'Impact Affiliate-Tracking-Cookie – wird von der Impact-Plattform verwendet, um Conversions den jeweiligen Affiliate-Partnern zuzuordnen.' },
                { e: '_cfuvid',                  d: 'Cloudflare Rate-Limiting-Cookie – identifiziert Benutzer für anfragespezifisches Rate Limiting. Sitzungscookie.' },
                { e: 'guid',                     d: 'Werbenetzwerk-Benutzer-ID – speichert eine persistente eindeutige Benutzerkennung für Ad-Targeting und Frequency Capping im Werbenetzwerk.' },
                { e: 'geo',                     d: 'Apple Geo-Routing-Cookie – speichert den erkannten Ländercode des Besuchers, um ihn zum richtigen regionalen Apple Store weiterzuleiten. Sitzungscookie.' },
                { e: 's_vi',                    d: 'Adobe Analytics Besucher-ID – identifiziert eindeutig einen Besucher sitzungsübergreifend. Läuft nach bis zu 2 Jahren ab.' },
                { e: 's_fid',                   d: 'Adobe Analytics Fallback-Besucher-ID – wird verwendet, wenn s_vi nicht gesetzt werden kann (z. B. im privaten Browsermodus). Läuft nach 5 Jahren ab.' },
                { e: 's_cc',                    d: 'Adobe Analytics Cookie-Check – stellt fest, ob Cookies im Browser des Besuchers aktiviert sind. Sitzungscookie.' },
                { e: 'mk_epub',                 d: 'Apple Marketing-Attributions-Cookie – verfolgt, welche Marketingkampagne den Besucher auf Apple.com geführt hat.' },
            ],
        },
        da: {
            necessary:  'Nødvendige',
            security:   'Sikkerhed',
            analytics:  'Analyse',
            marketing:  'Marketing',
            functional: 'Funktionelle',
            colName:        'Cookie-navn',
            colDomain:      'Domæne',
            colProvider:    'Udbyder',
            colLifetime:    'Levetid',
            colDescription: 'Beskrivelse',
            session:    'Session',
            persistent: 'Vedvarende',
            loading:    'Indlæser cookie-liste…',
            retrying:   'Scanning i gang — genindlæs venligst om ~30 sek.',
            error:      'Cookie-listen kunne ikke indlæses. Prøv igen senere.',
            noCookies:  'Ingen cookies registreret for denne kategori.',
            updated:    'Senest opdateret:',
            noData:            'Der blev ikke registreret nogen cookies for dette domæne. Webstedet kan begrænse cookies, før der gives samtykke.',
            servicesHeading:   'Tredjepartstjenester',
            servicesIntro:     'Følgende tredjepartstjenester kan tilgå eller behandle personoplysninger, når du besøger dette websted.',
            colService:        'Tjeneste',
            colPurpose:        'Formål',
            colCountry:        'Land',
            colTransfer:       'Overførselsgrundlag',
            manageHeading:     'Administrér dine cookiepræferencer',
            managePara:        'Du kan til enhver tid trække eller ændre dit cookiesamtykke via cookieindstillingspanelet på dette websted. De fleste webbrowsere giver dig også mulighed for at styre cookies via browserindstillingerne; se din browsers hjælpedokumentation for detaljer.',
            controllerHeading: 'Dataansvarlig',
            controllerText:    'Dette websted drives af',
            controllerContact: 'Ved spørgsmål vedrørende databeskyttelse bedes du kontakte',
            intro: [
                'Vi bruger cookies og lignende sporingsteknologier til at spore aktiviteten på vores tjeneste og opbevare visse oplysninger.',
                'Cookies er filer med en lille mængde data, som kan indeholde en anonym unik identifikator. Cookies sendes til din browser fra et websted og gemmes på din enhed. Andre sporingsteknologier anvendes også, såsom beacons, tags og scripts, til at indsamle og spore information og til at forbedre og analysere vores tjeneste.',
                'Du kan til enhver tid administrere dine cookiepræferencer ved hjælp af cookie-indstillingspanelet på vores websted. Du kan også instruere din browser til at afvise alle cookies, men det kan forhindre, at visse dele af vores tjeneste fungerer korrekt.',
                'Vi organiserer de cookies, vi bruger, i følgende kategorier:',
            ],
            catDesc: {
                necessary:  'Disse cookies er nødvendige for, at webstedet fungerer korrekt. De muliggør kernefunktioner som navigation, sikkerhed og adgang til beskyttede områder. Uden dem kan webstedet ikke fungere som tilsigtet, og de kan ikke deaktiveres.',
                security:   'Disse cookies hjælper os med at opdage og forhindre ondsindet aktivitet, bots og svigagtig adfærd. De gemmer ingen personligt identificerbare oplysninger.',
                analytics:  'Disse cookies hjælper os med at forstå, hvordan besøgende interagerer med vores websted ved at indsamle og rapportere oplysninger anonymt. De giver os mulighed for at måle trafik, identificere populært indhold og forbedre den overordnede brugeroplevelse.',
                marketing:  'Disse cookies sporer din browsingaktivitet på tværs af websteder for at levere personaliseret og relevant reklame. De sættes typisk af vores reklamepartnere og giver disse partnere mulighed for at opbygge en profil af dine interesser.',
                functional: 'Disse cookies muliggør forbedrede funktioner og personalisering, såsom live chat-widgets, indlejrede videoer og integration af sociale medier. Deaktivering af dem kan reducere funktionaliteten af visse dele af webstedet.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Google Analytics klient-ID – identificerer en unik besøgende på tværs af sessioner. Udløber efter 2 år.' },
                { e: '_gid',                       d: 'Google Analytics-sessionscookie – skelner mellem brugere inden for en 24-timers session.' },
                { p: '_ga_',                       d: 'Google Analytics 4-egenskabscookie – gemmer sessionstilstand for et bestemt GA4-målings-ID.' },
                { e: '_fbp',                       d: 'Facebook Pixel-browser-ID – identificerer browsere til annoncelevering og konverteringsmåling. Udløber efter 3 måneder.' },
                { e: '_fbc',                       d: 'Facebook-klik-ID – gemmer fbclid-parameteren fra et Facebook-annonceklik. Udløber efter 3 måneder.' },
                { e: 'hubspotutk',                 d: 'HubSpot-besøgstoken – sporer besøgendes identitet på tværs af besøg og formularindsendelser. Udløber efter 13 måneder.' },
                { p: '_hj',                        d: 'Hotjar-sporingscookie – bruges til sessionsoptagelse, varmekort og adfærdsanalyse.' },
                { e: '_clck',                      d: 'Microsoft Clarity bruger-ID – bevarer Clarity bruger-ID og præferencer. Udløber efter 1 år.' },
                { e: '_clsk',                      d: 'Microsoft Clarity sessionsnøgle – forbinder sidevisninger inden for en enkelt session. Udløber efter 24 timer.' },
                { e: '_ttp',                       d: 'TikTok Pixel-sporings-ID – gemmer en browsers ID til måling af annonceprestæstation. Udløber efter 13 måneder.' },
                { e: '__cf_bm',                    d: 'Cloudflare bot-styringscookie – skelner menneskelige besøgende fra automatiserede bots. Udløber efter 30 minutter.' },
                { e: 'cf_clearance',               d: 'Cloudflare-udstedelses-cookie – bekræfter, at en besøgende har bestået en Cloudflare-sikkerhedsudfordring. Udløber efter 1 dag.' },
                { e: 'IntastellarConsentSolution', d: 'Intastellar Consents-record – gemmer besøgendes cookiesamtykkevalg. Udløber efter 3 måneder.' },
                { e: 'PHPSESSID',                  d: 'PHP-sessionscookie – opretholder en serversidessession for den aktuelle bruger. Sessionscookie.' },
                { e: 'IDE',                        d: 'DoubleClick-annoncetargetingcookie – identificerer en browsers til personaliserede Google-annoncer. Udløber efter 13 måneder.' },
                { e: 'ar_debug',               d: 'LinkedIn Ads-fejlfindingscookie – brugt af LinkedIn til fejlfinding af konverteringssporing via Insight Tag. Sessionscookie.' },
                { e: 'AnalyticsSyncHistory',   d: 'LinkedIn analysesynkroniseringscookie – registrerer, hvornår LinkedIn-analysedata sidst blev synkroniseret med besøgsaktivitet. Udløber efter 1 måned.' },
                { e: 'omnisendSessionID',      d: 'Omnisend sessionscookie – sporer den aktuelle besøgssession til e-mailmarkedsføring og attribution. Sessionscookie.' },
                { e: 'CLID',                   d: 'Microsoft Clarity klient-ID – gemmer et unikt besøgs-ID til varmekort og sessionsafspilning. Udløber efter 1 år.' },
                { e: 'barometric[cuid]',        d: 'Barometric enhedsidentifikator – gemmer et unikt ID til tværgående enhedsannoncering og programmatisk reklamattribution.' },
                { e: 'TapAd_TS',                d: 'Tapad synkroniseringstidsstempel – registrerer hvornår Tapads tværgående identitetsgraf sidst blev synkroniseret for denne browser.' },
                { e: 'TapAd_DID',               d: 'Tapad enheds-ID – gemmer et unikt enheds-ID til tværgående annoncering og frekvenskontrol i Tapads reklamenetværk.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Tapad synkroniseringstæller – sporer antallet af trevejs cookie-synkroniseringer til tværgående identitetsopløsning.' },
                { e: 'cg_uuid',                  d: 'Tværgående reklame-UUID – gemmer et unikt ID til målretning af målgrupper og annoncepersonalisering på tværs af websteder.' },
                { e: 'brwsr',                    d: 'HubSpot browser-ID – identificerer besøgendes browser til HubSpot-marketinganalyse og retargeting på HubSpot-domæner.' },
                { e: 'irld',                     d: 'HubSpot-omdirigerings-ID – registrerer indgående linkklik og kampagneattribution på HubSpot-landingssider.' },
                { e: 'laboratory-anonymous-id',  d: 'HubSpot eksperiment-ID – tildeler en anonym identifikator til HubSpots interne A/B-test- og eksperimentplatform.' },
                { e: '_switch_session_id',        d: 'HubSpot portalskift-session – sporer den aktive session ved skift mellem HubSpot-portaler. Udløber efter 6 måneder.' },
                { e: 'FPAU',                     d: 'Google første-parts analyse-URL – indstilles af Google Tag Managers første-parts tilstand til analyseindsamling uden tredjeparts-cookies.' },
                { e: '_twpid',                   d: 'Twitter/X pixel-ID – identificerer besøgende til Twitter/X-reklamattribution og retargeting. Udløber efter 2 år.' },
                { p: '__pdst',                   d: 'Podscribe attributionscookie – sporer brugeraktivitet til podcast-reklamattribution og tværkanals rækkeviddemåling.' },
                { p: '_tq_id',                   d: 'TVSquared pixel-ID – gemmer et seer-ID til tværmedial TV- og streamingreklamamåling.' },
                { e: '_cq_duid',                  d: 'Contentsquare enheds-ID – gemmer et unikt enheds-ID til sessionsoptagelse og analyse af brugerrejser.' },
                { e: '_cq_suid',                  d: 'Contentsquare sessions-bruger-ID – tildeler hvert besøg et unikt ID til varmekort og sessionsafspilning.' },
                { e: '_cq_session',               d: 'Contentsquare sessionscookie – sporer den aktuelle besøgssession til digital oplevelsesanalyse. Udløber efter 30 minutter.' },
                { e: '_cq_s',                     d: 'Contentsquare segmentcookie – gemmer besøgssegmentdata til digital oplevelsesanalyse og personalisering.' },
                { e: 'IR_PI',                    d: 'Impact sidevisningscookie – registrerer sidevisninger til Impacts affiliate- og partnerskabsattribution.' },
                { e: 'IR_gbd',                   d: 'Impact globale browserdata – gemmer browseroplysninger til Impacts affiliate- og partnerskabs-konverteringssporing.' },
                { p: 'IR_',                      d: 'Impact affiliate-sporingscookie – bruges af Impacts partnerskabsplatform til at tilskrive konverteringer til affiliatepartnere.' },
                { e: '_cfuvid',                  d: 'Cloudflare hastighedsbegrænsningscookie – identificerer brugere til forespørgselsspecifik hastighedsbegrænsning. Sessionscookie.' },
                { e: 'guid',                     d: 'Reklamenetværkets bruger-ID – gemmer et persistent unikt bruger-ID til annoncemålretning og frekvenskontrol i reklamenetværket.' },
                { e: 'geo',                     d: 'Apple geo-routingcookie – gemmer besøgerens registrerede landekode for at omdirigere til den korrekte regionale Apple Store. Sessionscookie.' },
                { e: 's_vi',                    d: 'Adobe Analytics besøgs-ID – identificerer entydigt en besøgende på tværs af sessioner. Udløber efter op til 2 år.' },
                { e: 's_fid',                   d: 'Adobe Analytics reserve-besøgs-ID – bruges når s_vi ikke kan sættes (f.eks. i privat browsing). Udløber efter 5 år.' },
                { e: 's_cc',                    d: 'Adobe Analytics cookie-check – afgør om cookies er aktiveret i besøgerens browser. Sessionscookie.' },
                { e: 'mk_epub',                 d: 'Apple marketing-attributionscookie – sporer hvilken marketingkampagne der ledte besøgeren til Apple.com.' },
            ],
        },
        no: {
            necessary:  'Nødvendige',
            security:   'Sikkerhet',
            analytics:  'Analyse',
            marketing:  'Markedsføring',
            functional: 'Funksjonelle',
            colName:        'Cookie-navn',
            colDomain:      'Domene',
            colProvider:    'Leverandør',
            colLifetime:    'Levetid',
            colDescription: 'Beskrivelse',
            session:    'Økt',
            persistent: 'Vedvarende',
            loading:    'Laster inn cookie-liste…',
            retrying:   'Skanning pågår — vennligst last inn på nytt om ~30 sek.',
            error:      'Kunne ikke laste inn cookie-listen. Prøv igjen senere.',
            noCookies:  'Ingen informasjonskapsler oppdaget for denne kategorien.',
            updated:    'Sist oppdatert:',
            noData:            'Ingen informasjonskapsler ble oppdaget for dette domenet. Nettstedet kan begrense informasjonskapsler før samtykke gis.',
            servicesHeading:   'Tredjepartstjenester',
            servicesIntro:     'Følgende tredjepartstjenester kan få tilgang til eller behandle personopplysninger når du besøker dette nettstedet.',
            colService:        'Tjeneste',
            colPurpose:        'Formål',
            colCountry:        'Land',
            colTransfer:       'Overføringsgrunnlag',
            manageHeading:     'Administrer dine informasjonskapselinnstillinger',
            managePara:        'Du kan når som helst trekke tilbake eller endre ditt samtykke til informasjonskapsler via innstillingspanelet på dette nettstedet. De fleste nettlesere lar deg også kontrollere informasjonskapsler via nettleserinnstillingene; se nettleserens hjelpedokumentasjon for detaljer.',
            controllerHeading: 'Behandlingsansvarlig',
            controllerText:    'Dette nettstedet drives av',
            controllerContact: 'For henvendelser om personvern, kontakt oss på',
            intro: [
                'Vi bruker informasjonskapsler og lignende sporingsteknologier for å spore aktiviteten på tjenesten vår og lagre viss informasjon.',
                'Informasjonskapsler er filer med en liten mengde data, som kan inneholde en anonym unik identifikator. Informasjonskapsler sendes til nettleseren din fra et nettsted og lagres på enheten din. Andre sporingsteknologier brukes også, som beacons, tagger og skript, for å samle inn og spore informasjon og for å forbedre og analysere tjenesten vår.',
                'Du kan administrere dine preferanser for informasjonskapsler når som helst ved hjelp av innstillingspanelet for informasjonskapsler som er tilgjengelig på nettstedet vårt. Du kan også instruere nettleseren din om å avvise alle informasjonskapsler, men dette kan hindre at noen deler av tjenesten vår fungerer korrekt.',
                'Vi organiserer informasjonskapslene vi bruker i følgende kategorier:',
            ],
            catDesc: {
                necessary:  'Disse informasjonskapslene er nødvendige for at nettstedet skal fungere korrekt. De muliggjør kjernefunksjoner som navigasjon, sikkerhet og tilgang til beskyttede områder. Uten dem kan ikke nettstedet fungere som tiltenkt, og de kan ikke deaktiveres.',
                security:   'Disse informasjonskapslene hjelper oss med å oppdage og forhindre ondsinnet aktivitet, roboter og svindelatferd. De lagrer ingen personlig identifiserbar informasjon.',
                analytics:  'Disse informasjonskapslene hjelper oss med å forstå hvordan besøkende samhandler med nettstedet vårt ved å samle inn og rapportere informasjon anonymt. De lar oss måle trafikk, identifisere populært innhold og forbedre den generelle brukeropplevelsen.',
                marketing:  'Disse informasjonskapslene sporer nettleseraktiviteten din på tvers av nettsteder for å levere personalisert og relevant annonsering. De settes vanligvis av annonsepartnerne våre og gir disse partnerne mulighet til å bygge en profil av interessene dine.',
                functional: 'Disse informasjonskapslene muliggjør forbedrede funksjoner og personalisering, som live chat-widgets, innebygde videoer og integrasjoner med sosiale medier. Deaktivering av dem kan redusere funksjonaliteten til visse deler av nettstedet.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Google Analytics klient-ID – identifiserer en unik besøkende på tvers av økter. Utløper etter 2 år.' },
                { e: '_gid',                       d: 'Google Analytics-sesjons-cookie – skiller brukere innenfor en 24-timers økt.' },
                { p: '_ga_',                       d: 'Google Analytics 4-egenskapscookie – lagrer øktstatus for et bestemt GA4-målings-ID.' },
                { e: '_fbp',                       d: 'Facebook Pixel-nettleser-ID – identifiserer nettlesere for annonselevering og konverteringsmåling. Utløper etter 3 måneder.' },
                { e: '_fbc',                       d: 'Facebook-klikk-ID – lagrer fbclid-parameteren fra et Facebook-annonseklikk. Utløper etter 3 måneder.' },
                { e: 'hubspotutk',                 d: 'HubSpot-besøkstoken – sporer besøkendes identitet på tvers av besøk og skjemainnsendinger. Utløper etter 13 måneder.' },
                { p: '_hj',                        d: 'Hotjar-sporingscookie – brukes til øktopptak, varmekart og adfærdsanalyse.' },
                { e: '_clck',                      d: 'Microsoft Clarity bruker-ID – bevarer Clarity bruker-ID og preferanser. Utløper etter 1 år.' },
                { e: '_clsk',                      d: 'Microsoft Clarity-sesjonsnøkkel – kobler sidevisninger innenfor én økt. Utløper etter 24 timer.' },
                { e: '_ttp',                       d: 'TikTok Pixel-sporings-ID – lagrer en nettlesers ID for måling av annonseyteelse. Utløper etter 13 måneder.' },
                { e: '__cf_bm',                    d: 'Cloudflare bot-administrasjonskake – skiller menneskelige besøkende fra automatiserte roboter. Utløper etter 30 minutter.' },
                { e: 'cf_clearance',               d: 'Cloudflare-klargjøringscookie – bekrefter at en besøkende har bestått en Cloudflare-sikkerhetsutfordring. Utløper etter 1 dag.' },
                { e: 'IntastellarConsentSolution', d: 'Intastellar Consents-record – lagrer besøkendes informasjonskapselssamtykkevalg. Utløper etter 3 måneder.' },
                { e: 'PHPSESSID',                  d: 'PHP-sesjons-cookie – opprettholder en serversidessesjon for den gjeldende brukeren. Sesjons-cookie.' },
                { e: 'IDE',                        d: 'DoubleClick-annonsemålrettings-cookie – identifiserer en nettleser for personaliserte Google-annonser. Utløper etter 13 måneder.' },
                { e: 'ar_debug',               d: 'LinkedIn Ads-feilsøkingscookie – brukes av LinkedIn til feilsøking av konverteringssporing via Insight Tag. Sesjonsscookie.' },
                { e: 'AnalyticsSyncHistory',   d: 'LinkedIn analyse-synkroniseringscookie – registrerer når LinkedIn-analysedata sist ble synkronisert med besøksaktivitet. Utløper etter 1 måned.' },
                { e: 'omnisendSessionID',      d: 'Omnisend sesjonsscookie – sporer den nåværende besøksøkten for e-postmarkedsføring og attribusjon. Sesjonsscookie.' },
                { e: 'CLID',                   d: 'Microsoft Clarity klient-ID – lagrer en unik besøks-ID for varmekart og sesjonsavspilling. Utløper etter 1 år.' },
                { e: 'barometric[cuid]',        d: 'Barometric enhets-ID – lagrer en unik identifikator for kryssenhetsmålretting og programmatisk reklamattribusjon.' },
                { e: 'TapAd_TS',                d: 'Tapad synkroniseringstidsstempel – registrerer når Tapads kryssenhetsidentitetsgraf sist ble synkronisert for denne nettleseren.' },
                { e: 'TapAd_DID',               d: 'Tapad enhets-ID – lagrer en unik enhetsidentifikator for kryssenhetsmålretting og frekvensbegrensning i Tapads reklamenettverk.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Tapad synkroniseringsteller – sporer antall trevejs cookie-synkroniseringer for kryssenhetsidentitetsoppløsning.' },
                { e: 'cg_uuid',                  d: 'Kryssenhets reklame-UUID – lagrer en unik identifikator for målgrupperetting og annonsepersonalisering på tvers av nettsteder.' },
                { e: 'brwsr',                    d: 'HubSpot nettleser-ID – identifiserer besøkendes nettleser for HubSpot-markedsanalyse og retargeting på HubSpot-domener.' },
                { e: 'irld',                     d: 'HubSpot viderekoblings-ID – registrerer innkommende lenkeklikk og kampanjeattribusjon på HubSpot-landingssider.' },
                { e: 'laboratory-anonymous-id',  d: 'HubSpot eksperiment-ID – tildeler en anonym identifikator for HubSpots interne A/B-testing og eksperimenteringsplattform.' },
                { e: '_switch_session_id',        d: 'HubSpot portalbytte-økt – sporer den aktive økten ved bytte mellom HubSpot-portaler. Utløper etter 6 måneder.' },
                { e: 'FPAU',                     d: 'Google førstepartsanalyse-URL – settes av Google Tag Managers førstepartsmodus for analyseinnsamling uten tredjeparts-informasjonskapsler.' },
                { e: '_twpid',                   d: 'Twitter/X piksel-ID – identifiserer besøkende for Twitter/X-reklamattribusjon og retargeting. Utløper etter 2 år.' },
                { p: '__pdst',                   d: 'Podscribe attribusjonskake – sporer brukeraktivitet for podkast-reklamattribusjon og kanaloverskriende rekkeviddemåling.' },
                { p: '_tq_id',                   d: 'TVSquared piksel-ID – lagrer en seer-ID for kanaloverskriende TV- og strømmingsreklamemåling.' },
                { e: '_cq_duid',                  d: 'Contentsquare enhets-ID – lagrer en unik enhetsidentifikator for øktopptak og analyse av brukerreiser.' },
                { e: '_cq_suid',                  d: 'Contentsquare øktbruker-ID – tildeler hvert besøk en unik ID for varmekart og øktavspilling.' },
                { e: '_cq_session',               d: 'Contentsquare øktinformasjonskapsel – sporer den nåværende besøksøkten for digital opplevelsesanalyse. Utløper etter 30 minutter.' },
                { e: '_cq_s',                     d: 'Contentsquare segmentinformasjonskapsel – lagrer besøkssegmentdata for digital opplevelsesanalyse og personalisering.' },
                { e: 'IR_PI',                    d: 'Impact sidevisningsinformasjonskapsel – registrerer sidevisninger for Impacts affiliate- og partnerskapsattribusjon.' },
                { e: 'IR_gbd',                   d: 'Impact globale nettleserdata – lagrer nettleserinformasjon for Impacts affiliate- og partnerskapskonverteringssporing.' },
                { p: 'IR_',                      d: 'Impact affiliate-sporingsinformasjonskapsel – brukes av Impacts partnerskapsplattform for å attribuere konverteringer til affiliatepartnere.' },
                { e: '_cfuvid',                  d: 'Cloudflare hastighetsbegrensningskake – identifiserer brukere for forespørselsspesifikk hastighetsbegrensning. Øktinformasjonskapsel.' },
                { e: 'guid',                     d: 'Reklamenettverk bruker-ID – lagrer en vedvarende unik brukeridentifikator for annonsemålretting og frekvensbegrensning i reklamanettverket.' },
                { e: 'geo',                     d: 'Apple geo-rutingcookie – lagrer besøkerens registrerte landskode for å omdirigere til riktig regional Apple Store. Øktcookie.' },
                { e: 's_vi',                    d: 'Adobe Analytics besøks-ID – identifiserer unikt en besøkende på tvers av økter. Utløper etter opptil 2 år.' },
                { e: 's_fid',                   d: 'Adobe Analytics reserve-besøks-ID – brukes når s_vi ikke kan settes (f.eks. i privat nettlesing). Utløper etter 5 år.' },
                { e: 's_cc',                    d: 'Adobe Analytics cookie-sjekk – fastslår om informasjonskapsler er aktivert i besøkerens nettleser. Øktcookie.' },
                { e: 'mk_epub',                 d: 'Apple marketing-attribusjoncookie – sporer hvilken markedsføringskampanje som ledet besøkeren til Apple.com.' },
            ],
        },
        sv: {
            necessary:  'Nödvändiga',
            security:   'Säkerhet',
            analytics:  'Analys',
            marketing:  'Marknadsföring',
            functional: 'Funktionella',
            colName:        'Cookie-namn',
            colDomain:      'Domän',
            colProvider:    'Leverantör',
            colLifetime:    'Livslängd',
            colDescription: 'Beskrivning',
            session:    'Session',
            persistent: 'Beständig',
            loading:    'Laddar cookie-lista…',
            retrying:   'Skanning pågår — vänligen ladda om om ~30 s.',
            error:      'Kunde inte ladda cookie-listan. Försök igen senare.',
            noCookies:  'Inga cookies hittades för denna kategori.',
            updated:    'Senast uppdaterad:',
            noData:            'Inga cookies hittades för den här domänen. Webbplatsen kan begränsa cookies innan samtycke ges.',
            servicesHeading:   'Tredjepartstjänster',
            servicesIntro:     'Följande tredjepartstjänster kan komma åt eller behandla personuppgifter när du besöker denna webbplats.',
            colService:        'Tjänst',
            colPurpose:        'Syfte',
            colCountry:        'Land',
            colTransfer:       'Överföringsgrund',
            manageHeading:     'Hantera dina cookieinställningar',
            managePara:        'Du kan när som helst återkalla eller ändra ditt cookiesamtycke via cookieinställningspanelen på denna webbplats. De flesta webbläsare ger dig också möjlighet att kontrollera cookies via webbläsarinställningarna; se din webbläsares hjälpdokumentation för mer information.',
            controllerHeading: 'Personuppgiftsansvarig',
            controllerText:    'Denna webbplats drivs av',
            controllerContact: 'Vid frågor om integritet, kontakta oss på',
            intro: [
                'Vi använder kakor och liknande spårningstekniker för att spåra aktiviteten på vår tjänst och lagra viss information.',
                'Kakor är filer med en liten mängd data som kan innehålla en anonym unik identifierare. Kakor skickas till din webbläsare från en webbplats och lagras på din enhet. Andra spårningstekniker används även, som beacons, taggar och skript, för att samla in och spåra information och för att förbättra och analysera vår tjänst.',
                'Du kan hantera dina kakinställningar när som helst via kakinställningspanelen som finns tillgänglig på vår webbplats. Du kan även instruera din webbläsare att avvisa alla kakor, men det kan förhindra att vissa delar av vår tjänst fungerar korrekt.',
                'Vi organiserar kakorna vi använder i följande kategorier:',
            ],
            catDesc: {
                necessary:  'Dessa kakor är nödvändiga för att webbplatsen ska fungera korrekt. De möjliggör grundläggande funktioner som navigering, säkerhet och tillgång till skyddade områden. Utan dem kan webbplatsen inte fungera som avsett och de kan inte stängas av.',
                security:   'Dessa kakor hjälper oss att upptäcka och förhindra skadlig aktivitet, robotar och bedrägligt beteende. De lagrar ingen personligt identifierbar information.',
                analytics:  'Dessa kakor hjälper oss att förstå hur besökare interagerar med vår webbplats genom att samla in och rapportera information anonymt. De gör det möjligt för oss att mäta trafik, identifiera populärt innehåll och förbättra den övergripande användarupplevelsen.',
                marketing:  'Dessa kakor spårar din surfaktivitet på webbplatser för att leverera personaliserad och relevant annonsering. De sätts vanligtvis av våra reklampartners och gör det möjligt för dessa partners att bygga en profil av dina intressen.',
                functional: 'Dessa kakor möjliggör förbättrade funktioner och personalisering, som live chat-widgets, inbäddade videor och integrationer med sociala medier. Att inaktivera dem kan minska funktionaliteten i vissa delar av webbplatsen.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Google Analytics klient-ID – identifierar en unik besökare mellan sessioner. Löper ut efter 2 år.' },
                { e: '_gid',                       d: 'Google Analytics-sessionskaka – skiljer användare inom en 24-timmarssession.' },
                { p: '_ga_',                       d: 'Google Analytics 4-egenskapskaka – lagrar sessionstillstånd för ett specifikt GA4-mätnings-ID.' },
                { e: '_fbp',                       d: 'Facebook Pixel-webbläsar-ID – identifierar webbläsare för annonsvisning och konverteringsmätning. Löper ut efter 3 månader.' },
                { e: '_fbc',                       d: 'Facebook klick-ID – lagrar fbclid-parametern från ett Facebook-annonsklick. Löper ut efter 3 månader.' },
                { e: 'hubspotutk',                 d: 'HubSpot besökstoken – spårar besökarens identitet mellan besök och formulärinlämningar. Löper ut efter 13 månader.' },
                { p: '_hj',                        d: 'Hotjar-spårningskaka – används för sessionsinspelning, värmekarta och beteendeanalys.' },
                { e: '_clck',                      d: 'Microsoft Clarity användar-ID – sparar Clarity användar-ID och inställningar. Löper ut efter 1 år.' },
                { e: '_clsk',                      d: 'Microsoft Clarity-sessionsnyckel – kopplar ihop sidvisningar inom en session. Löper ut efter 24 timmar.' },
                { e: '_ttp',                       d: 'TikTok Pixel-spårnings-ID – lagrar en webbläsares ID för annonsprestandamätning. Löper ut efter 13 månader.' },
                { e: '__cf_bm',                    d: 'Cloudflare bot-hanteringskaka – skiljer mänskliga besökare från automatiserade robotar. Löper ut efter 30 minuter.' },
                { e: 'cf_clearance',               d: 'Cloudflare-godkännandekaka – bekräftar att en besökare klarat en Cloudflare-säkerhetsutmaning. Löper ut efter 1 dag.' },
                { e: 'IntastellarConsentSolution', d: 'Intastellar Consents-post – lagrar besökarens cookie-samtyckesval. Löper ut efter 3 månader.' },
                { e: 'PHPSESSID',                  d: 'PHP-sessionskaka – upprätthåller en serversidessession för den aktuelle användaren. Sessionskaka.' },
                { e: 'IDE',                        d: 'DoubleClick-annonsmålkaka – identifierar en webbläsare för personaliserade Google-annonser. Löper ut efter 13 månader.' },
                { e: 'ar_debug',               d: 'LinkedIn Ads-felsökningscookie – används av LinkedIn för att felsöka konverteringsspårning via Insight Tag. Sessionscookie.' },
                { e: 'AnalyticsSyncHistory',   d: 'LinkedIn analyssynkroniseringscookie – registrerar när LinkedIn-analysdata senast synkroniserades med besökaraktivitet. Utgår efter 1 månad.' },
                { e: 'omnisendSessionID',      d: 'Omnisend sessionscookie – spårar den aktuella besökarsessionen för e-postmarknadsföring och attribuering. Sessionscookie.' },
                { e: 'CLID',                   d: 'Microsoft Clarity klient-ID – lagrar ett unikt besökar-ID för värmekarta och sessionsuppspelning. Utgår efter 1 år.' },
                { e: 'barometric[cuid]',        d: 'Barometric enhets-ID – lagrar en unik identifierare för enhetsmålriktning och programmatisk reklamattribuering.' },
                { e: 'TapAd_TS',                d: 'Tapad synkroniseringstidsstämpel – registrerar när Tapads enhetsoberoende identitetsgraf senast synkroniserades för den här webbläsaren.' },
                { e: 'TapAd_DID',               d: 'Tapad enhets-ID – lagrar ett unikt enhets-ID för enhetsmålriktning och frekvensbegränsning i Tapads annonsnätverk.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Tapad synkroniseringsräknare – spårar antalet trevägscookie-synkroniseringar för enhetsoberoende identitetsupplösning.' },
                { e: 'cg_uuid',                  d: 'Enhetsmålriktnings-UUID – lagrar en unik identifierare för målgruppsinriktning och annonsanpassning på olika webbplatser.' },
                { e: 'brwsr',                    d: 'HubSpot webbläsar-ID – identifierar besökarens webbläsare för HubSpot-marknadsföringsanalys och återannonsering på HubSpot-domäner.' },
                { e: 'irld',                     d: 'HubSpot omdirigerings-ID – registrerar inkommande länkklick och kampanjattribuering på HubSpot-landningssidor.' },
                { e: 'laboratory-anonymous-id',  d: 'HubSpot experiment-ID – tilldelar ett anonymt ID för HubSpots interna A/B-testnings- och experimentplattform.' },
                { e: '_switch_session_id',        d: 'HubSpot portalbyte-session – spårar den aktiva sessionen vid byte mellan HubSpot-portaler. Utgår efter 6 månader.' },
                { e: 'FPAU',                     d: 'Google förstapartsanalys-URL – sätts av Google Tag Managers förstapartsläge för analysinhämtning utan tredjepartscookies.' },
                { e: '_twpid',                   d: 'Twitter/X pixel-ID – identifierar besökaren för Twitter/X-reklamattribuering och återannonsering. Utgår efter 2 år.' },
                { p: '__pdst',                   d: 'Podscribe attribueringscookie – spårar användaraktivitet för podcast-reklamattribuering och kanalöverskridande räckviddsmätning.' },
                { p: '_tq_id',                   d: 'TVSquared pixel-ID – lagrar ett tittare-ID för kanalöverskridande TV- och streamingreklammätning.' },
                { e: '_cq_duid',                  d: 'Contentsquare enhets-ID – lagrar ett unikt enhets-ID för sessionsupptagning och analys av användarresor.' },
                { e: '_cq_suid',                  d: 'Contentsquare sessionsanvändar-ID – tilldelar varje besök ett unikt ID för värmekarta och sessionsuppspelning.' },
                { e: '_cq_session',               d: 'Contentsquare sessionscookie – spårar den aktuella besökarsessionen för digital upplevelseanalys. Utgår efter 30 minuter.' },
                { e: '_cq_s',                     d: 'Contentsquare segmentcookie – lagrar besökarsegmentdata för digital upplevelseanalys och personalisering.' },
                { e: 'IR_PI',                    d: 'Impact sidvisningscookie – registrerar sidvisningar för Impacts affiliate- och partnerattribuering.' },
                { e: 'IR_gbd',                   d: 'Impact globala webbläsardata – lagrar webbläsarinformation för Impacts affiliate- och partnerkonverteringsspårning.' },
                { p: 'IR_',                      d: 'Impact affiliatespårningscookie – används av Impacts partnerskapsplattform för att attribuera konverteringar till affiliatepartners.' },
                { e: '_cfuvid',                  d: 'Cloudflare hastighetsbegränsningscookie – identifierar användare för förfrågningsspecifik hastighetsbegränsning. Sessionscookie.' },
                { e: 'guid',                     d: 'Annonsnätverkets användar-ID – lagrar ett beständigt unikt användar-ID för annonsriktning och frekvensbegränsning i annonsnätverket.' },
                { e: 'geo',                     d: 'Apple geo-routningscookie – lagrar besökarens registrerade landskod för att omdirigera till rätt regional Apple Store. Sessionscookie.' },
                { e: 's_vi',                    d: 'Adobe Analytics besöks-ID – identifierar unikt en besökare över sessioner. Utgår efter upp till 2 år.' },
                { e: 's_fid',                   d: 'Adobe Analytics reserv-besöks-ID – används när s_vi inte kan sättas (t.ex. i privat surfning). Utgår efter 5 år.' },
                { e: 's_cc',                    d: 'Adobe Analytics cookie-check – avgör om cookies är aktiverade i besökarens webbläsare. Sessionscookie.' },
                { e: 'mk_epub',                 d: 'Apple marknadsföringsattribueringscookie – spårar vilken marknadsföringskampanj som ledde besökaren till Apple.com.' },
            ],
        },
        pl: {
            necessary:  'Niezbędne',
            security:   'Bezpieczeństwo',
            analytics:  'Analityczne',
            marketing:  'Marketingowe',
            functional: 'Funkcjonalne',
            colName:        'Nazwa pliku cookie',
            colDomain:      'Domena',
            colProvider:    'Dostawca',
            colLifetime:    'Ważność',
            colDescription: 'Opis',
            session:    'Sesja',
            persistent: 'Trwały',
            loading:    'Ładowanie listy plików cookie…',
            retrying:   'Skanowanie w toku — proszę odświeżyć za ~30 s.',
            error:      'Nie udało się załadować listy plików cookie. Spróbuj ponownie później.',
            noCookies:  'Nie wykryto plików cookie dla tej kategorii.',
            updated:    'Ostatnia aktualizacja:',
            noData:            'Nie wykryto plików cookie dla tej domeny. Witryna może ograniczać pliki cookie przed udzieleniem zgody.',
            servicesHeading:   'Usługi stron trzecich',
            servicesIntro:     'Następujące usługi stron trzecich mogą uzyskać dostęp do danych osobowych lub je przetwarzać podczas odwiedzania tej witryny.',
            colService:        'Usługa',
            colPurpose:        'Cel',
            colCountry:        'Kraj',
            colTransfer:       'Podstawa transferu',
            manageHeading:     'Zarządzanie preferencjami plików cookie',
            managePara:        'Możesz wycofać lub zmienić zgodę na pliki cookie w dowolnym momencie, korzystając z panelu ustawień plików cookie na tej stronie. Większość przeglądarek internetowych umożliwia również kontrolowanie plików cookie za pomocą ustawień przeglądarki; szczegółowe informacje można znaleźć w dokumentacji pomocy przeglądarki.',
            controllerHeading: 'Administrator danych',
            controllerText:    'Ta witryna jest obsługiwana przez',
            controllerContact: 'W sprawach związanych z ochroną prywatności prosimy o kontakt',
            intro: [
                'Używamy plików cookie i podobnych technologii śledzenia do monitorowania aktywności w naszym Serwisie i przechowywania określonych informacji.',
                'Pliki cookie to pliki zawierające niewielką ilość danych, które mogą obejmować anonimowy unikalny identyfikator. Pliki cookie są wysyłane do przeglądarki użytkownika ze strony internetowej i przechowywane na jego urządzeniu. Stosowane są również inne technologie śledzenia, takie jak sygnały nawigacyjne, tagi i skrypty, do gromadzenia i śledzenia informacji oraz ulepszania i analizowania naszego Serwisu.',
                'Możesz zarządzać swoimi preferencjami dotyczącymi plików cookie w dowolnym momencie za pomocą panelu ustawień plików cookie dostępnego na naszej stronie. Możesz również polecić przeglądarce odrzucenie wszystkich plików cookie, choć może to uniemożliwić prawidłowe działanie niektórych części naszego Serwisu.',
                'Pliki cookie, których używamy, dzielimy na następujące kategorie:',
            ],
            catDesc: {
                necessary:  'Te pliki cookie są niezbędne do prawidłowego działania strony internetowej. Umożliwiają podstawowe funkcje, takie jak nawigacja, bezpieczeństwo i dostęp do chronionych obszarów. Bez nich strona nie może działać zgodnie z przeznaczeniem i nie można ich wyłączyć.',
                security:   'Te pliki cookie pomagają nam wykrywać i zapobiegać złośliwej aktywności, botom i oszukańczym zachowaniom. Nie przechowują żadnych danych osobowych.',
                analytics:  'Te pliki cookie pomagają nam zrozumieć, w jaki sposób odwiedzający wchodzą w interakcje z naszą stroną, zbierając i raportując informacje anonimowo. Pozwalają nam mierzyć ruch, identyfikować popularne treści i poprawiać ogólne wrażenia użytkownika.',
                marketing:  'Te pliki cookie śledzą Twoją aktywność przeglądania na różnych stronach internetowych, aby dostarczać spersonalizowane i trafne reklamy. Są zazwyczaj ustawiane przez naszych partnerów reklamowych i umożliwiają im budowanie profilu Twoich zainteresowań.',
                functional: 'Te pliki cookie umożliwiają zaawansowane funkcje i personalizację, takie jak widgety czatu na żywo, osadzone filmy i integracje z mediami społecznościowymi. Ich wyłączenie może zmniejszyć funkcjonalność niektórych części strony.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Identyfikator klienta Google Analytics – identyfikuje unikalnego odwiedzającego w różnych sesjach. Wygaśa po 2 latach.' },
                { e: '_gid',                       d: 'Plik cookie sesji Google Analytics – odróżnia użytkowników w ramach 24-godzinnej sesji.' },
                { p: '_ga_',                       d: 'Plik cookie właściwości Google Analytics 4 – przechowuje stan sesji dla określonego identyfikatora pomiaru GA4.' },
                { e: '_fbp',                       d: 'Identyfikator przeglądarki Facebook Pixel – identyfikuje przeglądarki w celu wyświetlania reklam i pomiaru konwersji. Wygaśa po 3 miesiącach.' },
                { e: '_fbc',                       d: 'Identyfikator kliknięcia Facebook – przechowuje parametr fbclid z kliknięcia reklamy na Facebooku. Wygaśa po 3 miesiącach.' },
                { e: 'hubspotutk',                 d: 'Token odwiedzającego HubSpot – śledzi tożsamość odwiedzającego między wizytami i przesłaniami formularzy. Wygaśa po 13 miesiącach.' },
                { p: '_hj',                        d: 'Plik cookie śledzenia Hotjar – używany do nagrywania sesji, map ciepła i analizy zachowań.' },
                { e: '_clck',                      d: 'Identyfikator użytkownika Microsoft Clarity – utrwala identyfikator i ustawienia użytkownika Clarity. Wygaśa po 1 roku.' },
                { e: '_clsk',                      d: 'Klucz sesji Microsoft Clarity – łączy wiele odsłon strony w ramach jednej sesji. Wygaśa po 24 godzinach.' },
                { e: '_ttp',                       d: 'Identyfikator śledzenia TikTok Pixel – przechowuje identyfikator przeglądarki do pomiaru wydajności reklam. Wygaśa po 13 miesiącach.' },
                { e: '__cf_bm',                    d: 'Plik cookie zarządzania botami Cloudflare – odróżnia prawdziwych odwiedzających od zautomatyzowanych botów. Wygaśa po 30 minutach.' },
                { e: 'cf_clearance',               d: 'Plik cookie clearance Cloudflare – potwierdza przejście przez wyzwanie bezpieczeństwa Cloudflare. Wygaśa po 1 dniu.' },
                { e: 'IntastellarConsentSolution', d: 'Zapis zgody Intastellar Consents – przechowuje decyzje odwiedzającego dotyczące plików cookie. Wygaśa po 3 miesiącach.' },
                { e: 'PHPSESSID',                  d: 'Plik cookie sesji PHP – utrzymuje sesję po stronie serwera dla bieżącego użytkownika. Plik cookie sesji.' },
                { e: 'IDE',                        d: 'Plik cookie targetowania reklam DoubleClick – identyfikuje przeglądarkę w celu personalizacji reklam Google. Wygaśa po 13 miesiącach.' },
                { e: 'ar_debug',               d: 'Plik cookie debugowania LinkedIn Ads – używany przez LinkedIn do debugowania śledzenia konwersji za pomocą Insight Tag. Plik cookie sesji.' },
                { e: 'AnalyticsSyncHistory',   d: 'Plik cookie synchronizacji analityki LinkedIn – rejestruje czas ostatniej synchronizacji danych analitycznych z aktywnością odwiedzającego. Wygasa po 1 miesiącu.' },
                { e: 'omnisendSessionID',      d: 'Plik cookie sesji Omnisend – śledzi bieżącą sesję odwiedzającego na potrzeby automatyzacji e-mail marketingu i atrybucji. Plik cookie sesji.' },
                { e: 'CLID',                   d: 'Identyfikator klienta Microsoft Clarity – przechowuje unikalny identyfikator odwiedzającego do map cieplnych i odtwarzania sesji. Wygasa po 1 roku.' },
                { e: 'barometric[cuid]',        d: 'Identyfikator wielourządzeniowy Barometric – przechowuje unikalny identyfikator do targetowania wielourządzeniowego i atrybucji reklam programatycznych.' },
                { e: 'TapAd_TS',                d: 'Znacznik czasu synchronizacji Tapad – rejestruje czas ostatniej synchronizacji grafu tożsamości wielourządzeniowej Tapad dla tej przeglądarki.' },
                { e: 'TapAd_DID',               d: 'Identyfikator urządzenia Tapad – przechowuje unikalny identyfikator urządzenia do targetowania wielourządzeniowego i ograniczania częstotliwości w sieci Tapad.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Licznik synchronizacji Tapad – śledzi liczbę trzystronnych synchronizacji plików cookie do wielourządzeniowej identyfikacji.' },
                { e: 'cg_uuid',                  d: 'Reklamowy UUID wielourządzeniowy – przechowuje unikalny identyfikator do targetowania grup odbiorców i personalizacji reklam na różnych stronach.' },
                { e: 'brwsr',                    d: 'Identyfikator przeglądarki HubSpot – identyfikuje przeglądarkę odwiedzającego na potrzeby analityki marketingowej i retargetingu HubSpot.' },
                { e: 'irld',                     d: 'Identyfikator przekierowania HubSpot – rejestruje kliknięcia linków przychodzących i atrybucję kampanii na stronach docelowych HubSpot.' },
                { e: 'laboratory-anonymous-id',  d: 'Identyfikator eksperymentu HubSpot – przypisuje anonimowy ID do wewnętrznej platformy testów A/B i eksperymentów HubSpot.' },
                { e: '_switch_session_id',        d: 'Sesja przełączania portalu HubSpot – śledzi aktywną sesję podczas przełączania między portalami HubSpot. Wygasa po 6 miesiącach.' },
                { e: 'FPAU',                     d: 'URL analizy pierwszej strony Google – ustawiany przez tryb pierwszej strony Google Tag Manager do zbierania danych analitycznych bez plików cookie stron trzecich.' },
                { e: '_twpid',                   d: 'ID piksela Twitter/X – identyfikuje odwiedzającego do atrybucji reklam i retargetingu Twitter/X. Wygasa po 2 latach.' },
                { p: '__pdst',                   d: 'Plik cookie atrybucji Podscribe – śledzi aktywność użytkownika do atrybucji reklam podcastowych i wielokanałowego pomiaru zasięgu.' },
                { p: '_tq_id',                   d: 'ID piksela TVSquared – przechowuje identyfikator widza do wielomedialnego pomiaru reklam TV i streamingowych.' },
                { e: '_cq_duid',                  d: 'ID urządzenia Contentsquare – przechowuje unikalny identyfikator urządzenia do nagrywania sesji i analizy ścieżek użytkownika.' },
                { e: '_cq_suid',                  d: 'ID użytkownika sesji Contentsquare – przypisuje każdej wizycie unikalny ID do map cieplnych i odtwarzania sesji.' },
                { e: '_cq_session',               d: 'Plik cookie sesji Contentsquare – śledzi bieżącą sesję odwiedzającego do analizy doświadczeń cyfrowych. Wygasa po 30 minutach.' },
                { e: '_cq_s',                     d: 'Plik cookie segmentu Contentsquare – przechowuje dane segmentu odwiedzającego do analizy doświadczeń cyfrowych i personalizacji.' },
                { e: 'IR_PI',                    d: 'Plik cookie wyświetlenia strony Impact – rejestruje wyświetlenia stron dla platformy atrybucji afiliacyjnej i partnerskiej Impact.' },
                { e: 'IR_gbd',                   d: 'Globalne dane przeglądarki Impact – przechowuje informacje o przeglądarce do śledzenia konwersji afiliacyjnych i partnerskich Impact.' },
                { p: 'IR_',                      d: 'Plik cookie śledzenia afiliacyjnego Impact – używany przez platformę partnerską Impact do przypisywania konwersji partnerom afiliacyjnym.' },
                { e: '_cfuvid',                  d: 'Plik cookie ograniczania szybkości Cloudflare – identyfikuje użytkowników do ograniczania szybkości dla określonych żądań. Plik cookie sesji.' },
                { e: 'guid',                     d: 'ID użytkownika sieci reklamowej – przechowuje trwały unikalny identyfikator użytkownika do targetowania reklam i ograniczania częstotliwości w sieci reklamowej.' },
                { e: 'geo',                     d: 'Plik cookie routingu geograficznego Apple – przechowuje wykryty kod kraju odwiedzającego w celu przekierowania do odpowiedniego regionalnego Apple Store. Plik cookie sesji.' },
                { e: 's_vi',                    d: 'ID odwiedzającego Adobe Analytics – jednoznacznie identyfikuje odwiedzającego w wielu sesjach. Wygasa po maksymalnie 2 latach.' },
                { e: 's_fid',                   d: 'Zastępczy ID odwiedzającego Adobe Analytics – używany gdy nie można ustawić s_vi (np. w trybie prywatnym). Wygasa po 5 latach.' },
                { e: 's_cc',                    d: 'Sprawdzenie pliku cookie Adobe Analytics – sprawdza czy pliki cookie są włączone w przeglądarce odwiedzającego. Plik cookie sesji.' },
                { e: 'mk_epub',                 d: 'Plik cookie atrybucji marketingowej Apple – śledzi, która kampania marketingowa skierowała odwiedzającego na Apple.com.' },
            ],
        },
        nl: {
            necessary:  'Noodzakelijk',
            security:   'Beveiliging',
            analytics:  'Analyse',
            marketing:  'Marketing',
            functional: 'Functioneel',
            colName:        'Cookienaam',
            colDomain:      'Domein',
            colProvider:    'Aanbieder',
            colLifetime:    'Levensduur',
            colDescription: 'Beschrijving',
            session:    'Sessie',
            persistent: 'Permanent',
            loading:    'Cookielijst laden…',
            retrying:   'Scan wordt uitgevoerd — laad opnieuw in ~30 s.',
            error:      'De cookielijst kon niet worden geladen. Probeer het later opnieuw.',
            noCookies:  'Geen cookies gedetecteerd voor deze categorie.',
            updated:    'Laatst bijgewerkt:',
            noData:            'Er zijn geen cookies gedetecteerd voor dit domein. De website kan cookies beperken voordat toestemming wordt gegeven.',
            servicesHeading:   'Diensten van derden',
            servicesIntro:     'De volgende diensten van derden kunnen persoonlijke gegevens verwerken wanneer u deze website bezoekt.',
            colService:        'Dienst',
            colPurpose:        'Doel',
            colCountry:        'Land',
            colTransfer:       'Overdrachtsgrondslag',
            manageHeading:     'Uw cookievoorkeuren beheren',
            managePara:        'U kunt uw cookietoestemming op elk moment intrekken of wijzigen via het cookievoorkeurenpaneel op deze website. De meeste webbrowsers bieden ook de mogelijkheid om cookies te beheren via de browserinstellingen; raadpleeg de helpdocumentatie van uw browser voor meer informatie.',
            controllerHeading: 'Verwerkingsverantwoordelijke',
            controllerText:    'Deze website wordt beheerd door',
            controllerContact: 'Voor privacygerelateerde vragen kunt u contact met ons opnemen via',
            intro: [
                'Wij gebruiken cookies en vergelijkbare trackingtechnologieën om de activiteit op onze Service bij te houden en bepaalde informatie op te slaan.',
                'Cookies zijn bestanden met een kleine hoeveelheid data, die een anonieme unieke identifier kunnen bevatten. Cookies worden vanuit een website naar uw browser gestuurd en op uw apparaat opgeslagen. Ook andere trackingtechnologieën worden gebruikt, zoals beacons, tags en scripts, om informatie te verzamelen en bij te houden, en om onze Service te verbeteren en te analyseren.',
                'U kunt uw cookievoorkeuren op elk moment beheren via het cookievoorkeuren-paneel op onze website. U kunt uw browser ook opdragen alle cookies te weigeren, maar dit kan ertoe leiden dat sommige onderdelen van onze Service niet correct functioneren.',
                'Wij delen de cookies die wij gebruiken in de volgende categorieën:',
            ],
            catDesc: {
                necessary:  'Deze cookies zijn essentieel voor het correct functioneren van de website. Ze maken kernfuncties mogelijk zoals navigatie, beveiliging en toegang tot beveiligde gebieden. Zonder deze cookies kan de website niet naar behoren werken en ze kunnen niet worden uitgeschakeld.',
                security:   'Deze cookies helpen ons kwaadaardige activiteiten, bots en frauduleus gedrag te detecteren en te voorkomen. Ze bevatten geen persoonlijk identificeerbare informatie.',
                analytics:  'Deze cookies helpen ons te begrijpen hoe bezoekers met onze website omgaan door informatie anoniem te verzamelen en te rapporteren. Ze stellen ons in staat om verkeer te meten, populaire inhoud te identificeren en de algehele gebruikerservaring te verbeteren.',
                marketing:  'Deze cookies volgen uw browseactiviteit op websites om gepersonaliseerde en relevante advertenties te leveren. Ze worden doorgaans ingesteld door onze advertentiepartners en stellen deze partners in staat een profiel van uw interesses op te bouwen.',
                functional: 'Deze cookies maken verbeterde functies en personalisering mogelijk, zoals live chat-widgets, ingesloten video\'s en integraties met sociale media. Het uitschakelen ervan kan de functionaliteit van bepaalde delen van de website verminderen.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Google Analytics client-ID – identificeert een unieke bezoeker over sessies heen. Verloopt na 2 jaar.' },
                { e: '_gid',                       d: 'Google Analytics-sessiecookie – onderscheidt gebruikers binnen een sessie van 24 uur.' },
                { p: '_ga_',                       d: 'Google Analytics 4-eigenschapscookie – slaat sessiestatus op voor een specifiek GA4-metings-ID.' },
                { e: '_fbp',                       d: 'Facebook Pixel-browser-ID – identificeert browsers voor advertentielevering en conversiemeting. Verloopt na 3 maanden.' },
                { e: '_fbc',                       d: 'Facebook-klik-ID – slaat de fbclid-parameter op van een Facebook-advertentieklik. Verloopt na 3 maanden.' },
                { e: 'hubspotutk',                 d: 'HubSpot-bezoekerstoken – volgt de identiteit van een bezoeker over bezoeken en formulierinzendingen. Verloopt na 13 maanden.' },
                { p: '_hj',                        d: 'Hotjar-trackingcookie – gebruikt voor sessie-opnames, heatmaps en gedragsanalyse.' },
                { e: '_clck',                      d: 'Microsoft Clarity-gebruikers-ID – slaat het Clarity-gebruikers-ID en -voorkeuren op. Verloopt na 1 jaar.' },
                { e: '_clsk',                      d: 'Microsoft Clarity-sessiesleutel – verbindt meerdere paginaweergaven binnen één sessie. Verloopt na 24 uur.' },
                { e: '_ttp',                       d: 'TikTok Pixel-tracking-ID – slaat een browser-ID op voor het meten van advertentieprestaties. Verloopt na 13 maanden.' },
                { e: '__cf_bm',                    d: 'Cloudflare-botbeheercookie – onderscheidt menselijke bezoekers van geautomatiseerde bots. Verloopt na 30 minuten.' },
                { e: 'cf_clearance',               d: 'Cloudflare-vrijgeefcookie – bevestigt dat een bezoeker een Cloudflare-beveiligingsuitdaging heeft voltooid. Verloopt na 1 dag.' },
                { e: 'IntastellarConsentSolution', d: 'Intastellar Consents-record – slaat de cookietoestemmingskeuzes van de bezoeker op. Verloopt na 3 maanden.' },
                { e: 'PHPSESSID',                  d: 'PHP-sessiecookie – handhaaft een serversijdse sessie voor de huidige gebruiker. Sessiecookie.' },
                { e: 'IDE',                        d: 'DoubleClick-advertentietargetingcookie – identificeert een browser voor gepersonaliseerde Google-advertenties. Verloopt na 13 maanden.' },
                { e: 'ar_debug',               d: 'LinkedIn Ads debug-cookie – gebruikt door LinkedIn om conversietracking via de Insight Tag te debuggen. Sessiecookie.' },
                { e: 'AnalyticsSyncHistory',   d: 'LinkedIn analytics synchronisatiecookie – registreert wanneer LinkedIn-analysegegevens voor het laatst zijn gesynchroniseerd met bezoekersactiviteit. Verloopt na 1 maand.' },
                { e: 'omnisendSessionID',      d: 'Omnisend sessiecookie – volgt de huidige bezoekersessie voor e-mailmarketing en attributie. Sessiecookie.' },
                { e: 'CLID',                   d: 'Microsoft Clarity client-ID – slaat een unieke bezoekersidentificator op voor heatmaps en sessieopname. Verloopt na 1 jaar.' },
                { e: 'barometric[cuid]',        d: 'Barometric cross-device ID – slaat een unieke identificator op voor apparaatoverschrijdende advertentietargeting en programmatische reclameattributie.' },
                { e: 'TapAd_TS',                d: 'Tapad synchronisatietijdstempel – registreert wanneer Tapads cross-device identiteitsgraph voor het laatst werd gesynchroniseerd voor deze browser.' },
                { e: 'TapAd_DID',               d: 'Tapad apparaat-ID – slaat een uniek apparaat-ID op voor cross-device advertentietargeting en frequentiebeperking in Tapads netwerk.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Tapad synchronisatieteller – bijhouden van het aantal driewegs cookie-synchronisaties voor cross-device identiteitsresolutie.' },
                { e: 'cg_uuid',                  d: 'Cross-device advertentie-UUID – slaat een unieke identificator op voor doelgroeptargeting en advertentiepersonalisatie op verschillende websites.' },
                { e: 'brwsr',                    d: 'HubSpot browser-ID – identificeert de browser van de bezoeker voor HubSpot-marketinganalyse en retargeting op HubSpot-domeinen.' },
                { e: 'irld',                     d: "HubSpot omleiding-ID – registreert inkomende linkklikken en campagneattributie op HubSpot-bestemmingspagina's." },
                { e: 'laboratory-anonymous-id',  d: 'HubSpot experiment-ID – kent een anoniem ID toe voor het interne A/B-test- en experimentplatform van HubSpot.' },
                { e: '_switch_session_id',        d: 'HubSpot portaalwissel-sessie – volgt de actieve sessie bij het wisselen tussen HubSpot-portalen. Verloopt na 6 maanden.' },
                { e: 'FPAU',                     d: 'Google first-party analyse-URL – ingesteld door de first-party modus van Google Tag Manager voor analysegegevensverzameling zonder cookies van derden.' },
                { e: '_twpid',                   d: 'Twitter/X pixel-ID – identificeert de bezoeker voor Twitter/X-reclameattributie en retargeting. Verloopt na 2 jaar.' },
                { p: '__pdst',                   d: 'Podscribe attributiecookie – volgt gebruikersactiviteit voor podcast-reclameattributie en kanaloverschrijdende bereiksmeting.' },
                { p: '_tq_id',                   d: 'TVSquared pixel-ID – slaat een kijker-ID op voor kanaloverschrijdende TV- en streamingreclamemeting.' },
                { e: '_cq_duid',                  d: 'Contentsquare apparaat-ID – slaat een uniek apparaat-ID op voor sessieopname en analyse van gebruikersreizen.' },
                { e: '_cq_suid',                  d: 'Contentsquare sessiegebruikers-ID – kent elk bezoek een uniek ID toe voor heatmaps en sessieherhalingen.' },
                { e: '_cq_session',               d: 'Contentsquare sessiecookie – volgt de huidige bezoekersessie voor digitale ervaringsanalyse. Verloopt na 30 minuten.' },
                { e: '_cq_s',                     d: 'Contentsquare segmentcookie – slaat bezoekerssegmentgegevens op voor digitale ervaringsanalyse en personalisatie.' },
                { e: 'IR_PI',                    d: 'Impact paginaweergavecookie – registreert paginaweergaven voor de affiliate- en partnerattributie van Impact.' },
                { e: 'IR_gbd',                   d: 'Impact globale browsergegevens – slaat browserinformatie op voor de affiliate- en partnerconversietracking van Impact.' },
                { p: 'IR_',                      d: 'Impact affiliate-trackingcookie – gebruikt door het partnerschapsplatform van Impact om conversies toe te schrijven aan affiliatepartners.' },
                { e: '_cfuvid',                  d: 'Cloudflare snelheidsbeperkingscookie – identificeert gebruikers voor verzoekspecifieke snelheidsbeperking. Sessiecookie.' },
                { e: 'guid',                     d: 'Advertentienetwerk gebruikers-ID – slaat een persistente unieke gebruikersidentificator op voor advertentietargeting en frequentiebeperking.' },
                { e: 'geo',                     d: 'Apple geo-routeringscookie – slaat de gedetecteerde landcode van de bezoeker op om naar de juiste regionale Apple Store te verwijzen. Sessiecookie.' },
                { e: 's_vi',                    d: 'Adobe Analytics bezoekersidentificator – identificeert een bezoeker uniek over meerdere sessies. Verloopt na maximaal 2 jaar.' },
                { e: 's_fid',                   d: 'Adobe Analytics reservebezoekersidentificator – gebruikt wanneer s_vi niet kan worden ingesteld (bijv. in privémodus). Verloopt na 5 jaar.' },
                { e: 's_cc',                    d: 'Adobe Analytics cookiecontrole – bepaalt of cookies zijn ingeschakeld in de browser van de bezoeker. Sessiecookie.' },
                { e: 'mk_epub',                 d: 'Apple marketingattributiecookie – houdt bij welke marketingcampagne de bezoeker naar Apple.com heeft geleid.' },
            ],
        },
        af: {
            necessary:  'Noodsaaklik',
            security:   'Sekuriteit',
            analytics:  'Analitiek',
            marketing:  'Bemarking',
            functional: 'Funksioneel',
            colName:        'Koeknaam',
            colDomain:      'Domein',
            colProvider:    'Verskaffer',
            colLifetime:    'Leeftyd',
            colDescription: 'Beskrywing',
            session:    'Sessie',
            persistent: 'Blywend',
            loading:    'Koeklys word gelaai…',
            retrying:   'Skandering aan die gang — herlaai asseblief oor ~30 s.',
            error:      'Kon nie die koeklys laai nie. Probeer asseblief later weer.',
            noCookies:  'Geen koekies bespeur vir hierdie kategorie nie.',
            updated:    'Laas opgedateer:',
            noData:            'Geen koekies is vir hierdie domein bespeur nie. Die webwerf kan koekies beperk voordat toestemming gegee word.',
            servicesHeading:   'Derdeparty-dienste',
            servicesIntro:     'Die volgende derdeparty-dienste kan persoonlike data toegang tot kry of verwerk wanneer u hierdie webwerf besoek.',
            colService:        'Diens',
            colPurpose:        'Doel',
            colCountry:        'Land',
            colTransfer:       'Oordragsbasis',
            manageHeading:     'Bestuur u koekievoorkeuse',
            managePara:        'U kan u koekietoestemming te eniger tyd terugtrek of verander deur die koekieinstellingspaneel op hierdie webwerf te gebruik. Die meeste webblaaiers laat u ook toe om koekies deur die blaaier-instellings te beheer; raadpleeg u blaaier se hulpdokumentasie vir besonderhede.',
            controllerHeading: 'Data-verantwoordelike',
            controllerText:    'Hierdie webwerf word bedryf deur',
            controllerContact: 'Vir privaatheidsnavrae, kontak ons by',
            intro: [
                'Ons gebruik koekies en soortgelyke naspoortegnologieë om aktiwiteit op ons Diens na te spoor en sekere inligting te stoor.',
                "Koekies is lêers met 'n klein hoeveelheid data wat 'n anonieme unieke identifiseerder kan bevat. Koekies word van 'n webwerf na u blaaier gestuur en op u toestel gestoor. Ander naspoortegnologieë soos bakens, etikette en skrifte word ook gebruik om inligting te versamel en na te spoor, en om ons Diens te verbeter en te ontleed.",
                "U kan u koekievoorkeure te eniger tyd bestuur deur die koekievoorkeure-paneel wat op ons webwerf beskikbaar is. U kan u blaaier ook opdrag gee om alle koekies te weier, hoewel dit kan verhoed dat sommige dele van ons Diens korrek funksioneer.",
                'Ons organiseer die koekies wat ons gebruik in die volgende kategorieë:',
            ],
            catDesc: {
                necessary:  'Hierdie koekies is noodsaaklik vir die korrekte werking van die webwerf. Dit stel kernfunksies soos navigasie, sekuriteit en toegang tot beskermde areas in staat. Sonder hulle kan die webwerf nie soos bedoel funksioneer nie en dit kan nie afgeskakel word nie.',
                security:   'Hierdie koekies help ons kwaadwillige aktiwiteit, bots en bedrieglike gedrag op te spoor en te voorkom. Dit stoor geen persoonlik identifiseerbare inligting nie.',
                analytics:  'Hierdie koekies help ons verstaan hoe besoekers met ons webwerf omgaan deur inligting anoniem te versamel en te rapporteer. Dit stel ons in staat om verkeer te meet, gewilde inhoud te identifiseer en die algehele gebruikerservaring te verbeter.',
                marketing:  "Hierdie koekies naspoor u blaai-aktiwiteit oor webwerwe om gepersonaliseerde en relevante advertensies te lewer. Dit word tipies deur ons advertensieskennisse gestel en laat hulle toe om 'n profiel van u belangstellings te bou.",
                functional: "Hierdie koekies stel verbeterde funksies en personalisering in staat, soos kitsklets-wysers, ingeslote video's en sosialemedia-integrasies. Die deaktivering daarvan kan die funksionaliteit van sekere dele van die webwerf verminder.",
            },
            cookieDesc: [
                { e: '_ga',                        d: "Google Analytics-kliënt-ID – identifiseer 'n unieke besoeker oor sessies. Verval na 2 jaar." },
                { e: '_gid',                       d: 'Google Analytics-sessiekoekie – onderskei gebruikers binne ’n 24-uur-sessie.' },
                { p: '_ga_',                       d: "Google Analytics 4-eiendomskoekies – stoor sessie-toestand vir 'n spesifieke GA4-metings-ID." },
                { e: '_fbp',                       d: "Facebook Pixel-blaaier-ID – identifiseer blaaiers vir advertensielewering en omskakelingsmeting. Verval na 3 maande." },
                { e: '_fbc',                       d: "Facebook-klik-ID – stoor die fbclid-parameter van 'n Facebook-advertensieklik. Verval na 3 maande." },
                { e: 'hubspotutk',                 d: 'HubSpot-besoekerstoken – volg die identiteit van ’n besoeker oor besoeke en vorminsendinge. Verval na 13 maande.' },
                { p: '_hj',                        d: 'Hotjar-naspoorkoekies – gebruik vir sessie-opname, hitteraampies en gedragsontleding.' },
                { e: '_clck',                      d: 'Microsoft Clarity-gebruikers-ID – behou die Clarity-gebruikers-ID en -voorkeure. Verval na 1 jaar.' },
                { e: '_clsk',                      d: 'Microsoft Clarity-sessiesleutel – verbind verskeie bladsy-aansigte binne ’n enkele sessie. Verval na 24 uur.' },
                { e: '_ttp',                       d: "TikTok Pixel-naspoor-ID – stoor 'n blaaier-ID vir advertensie-prestasiemeting. Verval na 13 maande." },
                { e: '__cf_bm',                    d: 'Cloudflare bot-bestuurkoekies – onderskei menslike besoekers van geoutomatiseerde bots. Verval na 30 minute.' },
                { e: 'cf_clearance',               d: 'Cloudflare-vrystellingskoekies – bevestig dat ’n besoeker ’n Cloudflare-sekuriteitsuitdaging geslaag het. Verval na 1 dag.' },
                { e: 'IntastellarConsentSolution', d: 'Intastellar Consents-rekord – stoor die besoeker se koekie-toestemmingskeuses. Verval na 3 maande.' },
                { e: 'PHPSESSID',                  d: 'PHP-sessiekoekies – handhaaf ’n bediener-kant-sessie vir die huidige gebruiker. Sessiekoekies.' },
                { e: 'IDE',                        d: 'DoubleClick-advertensie-teikenkoekies – identifiseer ’n blaaier vir gepersonaliseerde Google-advertensies. Verval na 13 maande.' },
                { e: 'ar_debug',               d: "LinkedIn Ads-ontfoutingskoekie – gebruik deur LinkedIn om omskakelingsnasporing via die Insight Tag te ontfout. Sessiekoekie." },
                { e: 'AnalyticsSyncHistory',   d: "LinkedIn Analytics-sinchronisasiekoekie – teken op wanneer LinkedIn-ontledingsdata laas gesinkroniseer is met besoekeraksiwiteit. Verval na 1 maand." },
                { e: 'omnisendSessionID',      d: "Omnisend-sessiekoekie – spoor die huidige besoekersessie vir e-posbemarking en attribusie. Sessiekoekie." },
                { e: 'CLID',                   d: "Microsoft Clarity kliënt-ID – stoor 'n unieke besoeker-ID vir hittekaarte en sessie-herspeel. Verval na 1 jaar." },
                { e: 'barometric[cuid]',        d: "Barometric toestelling-ID – stoor 'n unieke identifikasie vir toestelling-oorskrydende advertensie-teikening en programatiese reklamattribusie." },
                { e: 'TapAd_TS',                d: "Tapad sinchronisasie-tydstempel – teken op wanneer Tapad se toestelling-oorskrydende identiteitsgrafiek laas vir hierdie blaaier gesinkroniseer is." },
                { e: 'TapAd_DID',               d: "Tapad toestelling-ID – stoor 'n unieke toestelling-identifikasie vir toestelling-oorskrydende advertensie-teikening en frekwensiebeheer." },
                { e: 'TapAd_3WAY_SYNCS',        d: "Tapad sinchronisasieteller – spoor die aantal drie-rigting koekiesinchronisasies vir toestelling-oorskrydende identiteitsoplossing." },
                { e: 'cg_uuid',                  d: "Toestelling-oorskrydende advertensie-UUID – stoor 'n unieke identifikasie vir gehore-teikening en advertensiepersonalisering oor webtuistes heen." },
                { e: 'brwsr',                    d: "HubSpot blaaier-ID – identifiseer die besoeker se blaaier vir HubSpot-bemarkingsanalise en herteikening op HubSpot-gebiede." },
                { e: 'irld',                     d: "HubSpot herleidings-ID – teken inkomende skakelklieke en kampanje-attribusie op HubSpot-bestemmingsbladsye op." },
                { e: 'laboratory-anonymous-id',  d: "HubSpot eksperiment-ID – ken 'n anonieme identifikasie toe vir HubSpot se interne A/B-toets- en eksperimenteerplatform." },
                { e: '_switch_session_id',        d: "HubSpot portaalwisselsessie – spoor die aktiewe sessie tydens wisseling tussen HubSpot-portale. Verval na 6 maande." },
                { e: 'FPAU',                     d: "Google eerstepart-analise-URL – stel deur Google Tag Manager se eerstepart-modus vir analise-insameling sonder derdeparty-koekies." },
                { e: '_twpid',                   d: "Twitter/X pixel-ID – identifiseer die besoeker vir Twitter/X-reklamattribusie en herteikening. Verval na 2 jaar." },
                { p: '__pdst',                   d: "Podscribe attribusiekoekie – spoor gebruikersaktiwiteit vir podgooier-reklamattribusie en kanaloverskrydende bereiksmeting." },
                { p: '_tq_id',                   d: "TVSquared pixel-ID – stoor 'n kyker-ID vir kanaloverskrydende TV- en stroomdiensmeting." },
                { e: '_cq_duid',                  d: "Contentsquare toestelling-ID – stoor 'n unieke toestelling-ID vir sessie-opname en gebruikerreis-analise." },
                { e: '_cq_suid',                  d: "Contentsquare sessiegebruiker-ID – ken elke besoek 'n unieke ID toe vir hittekaarte en sessie-herspeel." },
                { e: '_cq_session',               d: "Contentsquare sessiekoekie – spoor die huidige besoekersessie vir digitale ervaringanalise. Verval na 30 minute." },
                { e: '_cq_s',                     d: "Contentsquare segmentkoekie – stoor besoekersegmentdata vir digitale ervaringanalise en personalisering." },
                { e: 'IR_PI',                    d: "Impact bladsyvertoning-koekie – teken bladsyvertonings aan vir Impact se affiliaat- en vennootskapattribusie." },
                { e: 'IR_gbd',                   d: "Impact globale blaaierdata – stoor blaaierinligting vir Impact se affiliaat- en vennootskapomskakelingsnasporing." },
                { p: 'IR_',                      d: "Impact affiliaatnaspringskoekies – gebruik deur Impact se vennootskapplatform om omskakelings aan affiliaatvennote toe te skryf." },
                { e: '_cfuvid',                  d: "Cloudflare tempo-beperkingskoekie – identifiseer gebruikers vir versoekspesifieke tempo-beperking. Sessiekoekie." },
                { e: 'guid',                     d: "Reklamenetwerk-gebruiker-ID – stoor 'n volgehoue unieke gebruikersidentifikasie vir advertensie-teikening en frekwensiebeheer." },
                { e: 'geo',                     d: "Apple geo-routeringskoekie – stoor die besoeker se gedetekteerde landkode om na die korrekte streeks-Apple Store om te lei. Sessiekoekie." },
                { e: 's_vi',                    d: "Adobe Analytics besoeker-ID – identifiseer uniek 'n besoeker oor sessies heen. Verval na tot 2 jaar." },
                { e: 's_fid',                   d: "Adobe Analytics reserwe-besoeker-ID – gebruik wanneer s_vi nie ingestel kan word nie (bv. in privaat blaai). Verval na 5 jaar." },
                { e: 's_cc',                    d: "Adobe Analytics koekie-kontrole – bepaal of koekies in die besoeker se blaaier geaktiveer is. Sessiekoekie." },
                { e: 'mk_epub',                 d: "Apple bemarkingsattribusiekoekie – spoor watter bemarkingsveldtog die besoeker na Apple.com gelei het." },
            ],
        },
        fr: {
            necessary:  'Nécessaires',
            security:   'Sécurité',
            analytics:  'Analytiques',
            marketing:  'Marketing',
            functional: 'Fonctionnels',
            colName:        'Nom du cookie',
            colDomain:      'Domaine',
            colProvider:    'Fournisseur',
            colLifetime:    'Durée de vie',
            colDescription: 'Description',
            session:    'Session',
            persistent: 'Persistant',
            loading:    'Chargement de la liste des cookies…',
            retrying:   'Analyse en cours — veuillez recharger dans ~30 s.',
            error:      'Impossible de charger la liste des cookies. Veuillez réessayer plus tard.',
            noCookies:  'Aucun cookie détecté pour cette catégorie.',
            updated:    'Dernière mise à jour :',
            noData:            "Aucun cookie n’a été détecté pour ce domaine. Le site peut restreindre les cookies avant l’obtention du consentement.",
            servicesHeading:   ‘Services tiers’,
            servicesIntro:     ‘Les services tiers suivants peuvent accéder à des données personnelles ou les traiter lorsque vous visitez ce site web.’,
            colService:        ‘Service’,
            colPurpose:        ‘Finalité’,
            colCountry:        ‘Pays’,
            colTransfer:       ‘Base du transfert’,
            manageHeading:     ‘Gérer vos préférences en matière de cookies’,
            managePara:        "Vous pouvez retirer ou modifier votre consentement aux cookies à tout moment via le panneau de paramètres des cookies sur ce site web. La plupart des navigateurs web vous permettent également de gérer les cookies via les paramètres du navigateur ; consultez la documentation d’aide de votre navigateur pour plus de détails.",
            controllerHeading: ‘Responsable du traitement’,
            controllerText:    ‘Ce site web est exploité par’,
            controllerContact: ‘Pour toute demande relative à la protection des données, veuillez nous contacter à’,
            intro: [
                'Nous utilisons des cookies et des technologies de suivi similaires pour surveiller l’activité sur notre Service et conserver certaines informations.',
                'Les cookies sont des fichiers contenant une petite quantité de données, pouvant inclure un identifiant unique anonyme. Les cookies sont envoyés à votre navigateur depuis un site web et stockés sur votre appareil. D’autres technologies de suivi sont également utilisées, telles que les balises, les tags et les scripts, pour collecter et suivre des informations et pour améliorer et analyser notre Service.',
                'Vous pouvez gérer vos préférences en matière de cookies à tout moment grâce au panneau de paramètres des cookies disponible sur notre site web. Vous pouvez également configurer votre navigateur pour refuser tous les cookies, bien que cela puisse empêcher certaines parties de notre Service de fonctionner correctement.',
                'Nous regroupons les cookies que nous utilisons dans les catégories suivantes :',
            ],
            catDesc: {
                necessary:  'Ces cookies sont indispensables au bon fonctionnement du site web. Ils permettent des fonctionnalités essentielles telles que la navigation, la sécurité et l’accès aux zones protégées. Sans eux, le site ne peut pas fonctionner comme prévu et ils ne peuvent pas être désactivés.',
                security:   'Ces cookies nous aident à détecter et à prévenir les activités malveillantes, les robots et les comportements frauduleux. Ils ne stockent aucune information personnellement identifiable.',
                analytics:  'Ces cookies nous aident à comprendre comment les visiteurs interagissent avec notre site web en collectant et en rapportant des informations de manière anonyme. Ils nous permettent de mesurer le trafic, d’identifier les contenus populaires et d’améliorer l’expérience utilisateur globale.',
                marketing:  'Ces cookies suivent votre activité de navigation sur les sites web afin de diffuser des publicités personnalisées et pertinentes. Ils sont généralement définis par nos partenaires publicitaires et leur permettent de constituer un profil de vos centres d’intérêt.',
                functional: 'Ces cookies permettent des fonctionnalités améliorées et une personnalisation, tels que les widgets de chat en direct, les vidéos intégrées et les intégrations avec les réseaux sociaux. Les désactiver peut réduire les fonctionnalités de certaines parties du site web.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'Identifiant client Google Analytics – identifie un visiteur unique entre les sessions. Expire après 2 ans.' },
                { e: '_gid',                       d: 'Cookie de session Google Analytics – distingue les utilisateurs au cours d’une session de 24 heures.' },
                { p: '_ga_',                       d: 'Cookie de propriété Google Analytics 4 – stocke l’état de session pour un identifiant de mesure GA4 spécifique.' },
                { e: '_fbp',                       d: 'Identifiant navigateur Facebook Pixel – identifie les navigateurs pour la diffusion d’annonces et la mesure des conversions. Expire après 3 mois.' },
                { e: '_fbc',                       d: 'Identifiant de clic Facebook – stocke le paramètre fbclid d’un clic sur une annonce Facebook. Expire après 3 mois.' },
                { e: 'hubspotutk',                 d: 'Jeton de visiteur HubSpot – suit l’identité d’un visiteur entre les visites et les soumissions de formulaires. Expire après 13 mois.' },
                { p: '_hj',                        d: 'Cookie de suivi Hotjar – utilisé pour l’enregistrement de sessions, les cartes thermiques et l’analyse du comportement.' },
                { e: '_clck',                      d: 'Identifiant utilisateur Microsoft Clarity – conserve l’identifiant et les préférences utilisateur de Clarity. Expire après 1 an.' },
                { e: '_clsk',                      d: 'Clé de session Microsoft Clarity – relie plusieurs pages vues au sein d’une même session. Expire après 24 heures.' },
                { e: '_ttp',                       d: 'Identifiant de suivi TikTok Pixel – stocke l’identifiant du navigateur pour mesurer les performances publicitaires. Expire après 13 mois.' },
                { e: '__cf_bm',                    d: 'Cookie de gestion des bots Cloudflare – distingue les visiteurs humains des robots automatisés. Expire après 30 minutes.' },
                { e: 'cf_clearance',               d: 'Cookie de validation Cloudflare – confirme qu’un visiteur a réussi un défi de sécurité Cloudflare. Expire après 1 jour.' },
                { e: 'IntastellarConsentSolution', d: 'Enregistrement Intastellar Consents – stocke les choix de consentement aux cookies du visiteur. Expire après 3 mois.' },
                { e: 'PHPSESSID',                  d: 'Cookie de session PHP – maintient une session côté serveur pour l’utilisateur actuel. Cookie de session.' },
                { e: 'IDE',                        d: 'Cookie de ciblage publicitaire DoubleClick – identifie un navigateur pour les annonces personnalisées Google. Expire après 13 mois.' },
                { e: 'ar_debug',               d: "Cookie de débogage LinkedIn Ads — utilisé par LinkedIn pour déboguer le suivi des conversions via l'Insight Tag. Cookie de session." },
                { e: 'AnalyticsSyncHistory',   d: "Cookie de synchronisation analytique LinkedIn — enregistre la dernière synchronisation des données analytiques LinkedIn avec l'activité des visiteurs. Expire après 1 mois." },
                { e: 'omnisendSessionID',      d: "Cookie de session Omnisend — suit la session visiteur en cours pour l'automatisation du marketing par e-mail et l'attribution Omnisend. Cookie de session." },
                { e: 'CLID',                   d: "Identifiant client Microsoft Clarity — stocke un identifiant visiteur unique pour les cartes de chaleur et la relecture de session. Expire après 1 an." },
                { e: 'barometric[cuid]',        d: "Identifiant multi-appareils Barometric — stocke un identifiant unique pour le ciblage publicitaire multi-appareils et l'attribution de la publicité programmatique." },
                { e: 'TapAd_TS',                d: "Horodatage de synchronisation Tapad — enregistre la dernière synchronisation du graphe d'identité multi-appareils de Tapad pour ce navigateur." },
                { e: 'TapAd_DID',               d: "Identifiant d'appareil Tapad — stocke un identifiant unique d'appareil pour le ciblage multi-appareils et le plafonnement de fréquence dans le réseau Tapad." },
                { e: 'TapAd_3WAY_SYNCS',        d: "Compteur de synchronisation Tapad — comptabilise le nombre de synchronisations de cookies tripartites pour la résolution d'identité multi-appareils." },
                { e: 'cg_uuid',                  d: "UUID publicitaire multi-appareils — stocke un identifiant unique pour le ciblage d'audience et la personnalisation publicitaire sur plusieurs sites." },
                { e: 'brwsr',                    d: "Identifiant navigateur HubSpot — identifie le navigateur du visiteur pour l'analyse marketing et le reciblage HubSpot sur les domaines HubSpot." },
                { e: 'irld',                     d: "Identifiant de redirection HubSpot — enregistre les clics sur les liens entrants et l'attribution des campagnes sur les pages de destination HubSpot." },
                { e: 'laboratory-anonymous-id',  d: "Identifiant d'expérience HubSpot — attribue un ID anonyme à la plateforme interne de tests A/B et d'expérimentation de HubSpot." },
                { e: '_switch_session_id',        d: "Session de changement de portail HubSpot — suit la session active lors du changement entre les portails HubSpot. Expire après 6 mois." },
                { e: 'FPAU',                     d: "URL d'analyse first-party Google — défini par le mode first-party de Google Tag Manager pour la collecte d'analyses sans cookies tiers." },
                { e: '_twpid',                   d: "ID pixel Twitter/X — identifie le visiteur pour l'attribution publicitaire et le reciblage Twitter/X. Expire après 2 ans." },
                { p: '__pdst',                   d: "Cookie d'attribution Podscribe — suit l'activité des utilisateurs pour l'attribution publicitaire des podcasts et la mesure de la portée multicanal." },
                { p: '_tq_id',                   d: "ID pixel TVSquared — stocke un identifiant de spectateur pour la mesure publicitaire TV et streaming multi-médias." },
                { e: '_cq_duid',                  d: "ID d'appareil Contentsquare — stocke un identifiant unique d'appareil pour l'enregistrement de session et l'analyse du parcours utilisateur." },
                { e: '_cq_suid',                  d: "ID utilisateur de session Contentsquare — attribue un ID unique à chaque visite pour les cartes de chaleur et la relecture de session." },
                { e: '_cq_session',               d: "Cookie de session Contentsquare — suit la session visiteur en cours pour l'analyse de l'expérience numérique. Expire après 30 minutes." },
                { e: '_cq_s',                     d: "Cookie de segment Contentsquare — stocke les données de segment visiteur pour l'analyse de l'expérience numérique et la personnalisation." },
                { e: 'IR_PI',                    d: "Cookie d'impression de page Impact — enregistre les vues de page pour l'attribution affiliée et partenaire d'Impact." },
                { e: 'IR_gbd',                   d: "Données navigateur globales Impact — stocke les informations navigateur pour le suivi des conversions affiliées et partenaires d'Impact." },
                { p: 'IR_',                      d: "Cookie de suivi affilié Impact — utilisé par la plateforme partenaire d'Impact pour attribuer les conversions aux partenaires affiliés." },
                { e: '_cfuvid',                  d: "Cookie de limitation de débit Cloudflare — identifie les utilisateurs pour la limitation de débit par requête. Cookie de session." },
                { e: 'guid',                     d: "ID utilisateur du réseau publicitaire — stocke un identifiant utilisateur unique persistant pour le ciblage publicitaire et le plafonnement de fréquence." },
                { e: 'geo',                     d: "Cookie de géo-routage Apple — stocke le code pays détecté du visiteur pour le rediriger vers le bon Apple Store régional. Cookie de session." },
                { e: 's_vi',                    d: "Identifiant visiteur Adobe Analytics — identifie de manière unique un visiteur d'une session à l'autre. Expire après 2 ans au maximum." },
                { e: 's_fid',                   d: "Identifiant visiteur de secours Adobe Analytics — utilisé lorsque s_vi ne peut pas être défini (par ex. en navigation privée). Expire après 5 ans." },
                { e: 's_cc',                    d: "Vérification de cookie Adobe Analytics — détermine si les cookies sont activés dans le navigateur du visiteur. Cookie de session." },
                { e: 'mk_epub',                 d: "Cookie d'attribution marketing Apple — suit quelle campagne marketing a dirigé le visiteur vers Apple.com." },
            ],
        },
        es: {
            necessary:  'Necesarias',
            security:   'Seguridad',
            analytics:  'Analíticas',
            marketing:  'Marketing',
            functional: 'Funcionales',
            colName:        'Nombre de la cookie',
            colDomain:      'Dominio',
            colProvider:    'Proveedor',
            colLifetime:    'Duración',
            colDescription: 'Descripción',
            session:    'Sesión',
            persistent: 'Persistente',
            loading:    'Cargando lista de cookies…',
            retrying:   'Análisis en curso — recargue en ~30 s.',
            error:      'No se pudo cargar la lista de cookies. Inténtelo de nuevo más tarde.',
            noCookies:  'No se detectaron cookies para esta categoría.',
            updated:    'Última actualización:',
            noData:            'No se detectaron cookies para este dominio. El sitio web puede restringir las cookies antes de obtener el consentimiento.',
            servicesHeading:   'Servicios de terceros',
            servicesIntro:     'Los siguientes servicios de terceros pueden acceder o procesar datos personales cuando visita este sitio web.',
            colService:        'Servicio',
            colPurpose:        'Finalidad',
            colCountry:        'País',
            colTransfer:       'Base de la transferencia',
            manageHeading:     'Gestionar sus preferencias de cookies',
            managePara:        'Puede retirar o cambiar su consentimiento de cookies en cualquier momento utilizando el panel de configuración de cookies en este sitio web. La mayoría de los navegadores web también le permiten controlar las cookies a través de la configuración del navegador; consulte la documentación de ayuda de su navegador para obtener más detalles.',
            controllerHeading: 'Responsable del tratamiento',
            controllerText:    'Este sitio web es operado por',
            controllerContact: 'Para consultas relacionadas con la privacidad, contáctenos en',
            intro: [
                'Utilizamos cookies y tecnologías de seguimiento similares para rastrear la actividad en nuestro Servicio y almacenar cierta información.',
                'Las cookies son archivos con una pequeña cantidad de datos que pueden incluir un identificador único anónimo. Las cookies se envían a su navegador desde un sitio web y se almacenan en su dispositivo. También se utilizan otras tecnologías de seguimiento, como balizas, etiquetas y scripts, para recopilar y rastrear información y para mejorar y analizar nuestro Servicio.',
                'Puede gestionar sus preferencias de cookies en cualquier momento mediante el panel de configuración de cookies disponible en nuestro sitio web. También puede indicarle a su navegador que rechace todas las cookies, aunque hacerlo puede impedir que algunas partes de nuestro Servicio funcionen correctamente.',
                'Organizamos las cookies que utilizamos en las siguientes categorías:',
            ],
            catDesc: {
                necessary:  'Estas cookies son esenciales para el correcto funcionamiento del sitio web. Permiten funciones básicas como la navegación, la seguridad y el acceso a áreas protegidas. Sin ellas, el sitio web no puede funcionar como se pretende y no pueden desactivarse.',
                security:   'Estas cookies nos ayudan a detectar y prevenir actividades maliciosas, bots y comportamientos fraudulentos. No almacenan ninguna información de identificación personal.',
                analytics:  'Estas cookies nos ayudan a entender cómo los visitantes interactúan con nuestro sitio web recopilando e informando sobre información de forma anónima. Nos permiten medir el tráfico, identificar el contenido popular y mejorar la experiencia general del usuario.',
                marketing:  'Estas cookies rastrean su actividad de navegación en los sitios web para ofrecer publicidad personalizada y relevante. Generalmente son establecidas por nuestros socios publicitarios y les permiten crear un perfil de sus intereses.',
                functional: 'Estas cookies permiten funciones mejoradas y personalización, como widgets de chat en vivo, vídeos incrustados e integraciones con redes sociales. Desactivarlas puede reducir la funcionalidad de ciertas partes del sitio web.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'ID de cliente de Google Analytics – identifica a un visitante único entre sesiones. Caduca después de 2 años.' },
                { e: '_gid',                       d: 'Cookie de sesión de Google Analytics – distingue a los usuarios dentro de una sesión de 24 horas.' },
                { p: '_ga_',                       d: 'Cookie de propiedad de Google Analytics 4 – almacena el estado de sesión para un ID de medición GA4 específico.' },
                { e: '_fbp',                       d: 'ID de navegador de Facebook Pixel – identifica navegadores para la entrega de anuncios y la medición de conversiones. Caduca después de 3 meses.' },
                { e: '_fbc',                       d: 'ID de clic de Facebook – almacena el parámetro fbclid de un clic en un anuncio de Facebook. Caduca después de 3 meses.' },
                { e: 'hubspotutk',                 d: 'Token de visitante de HubSpot – rastrea la identidad de un visitante entre visitas y envíos de formularios. Caduca después de 13 meses.' },
                { p: '_hj',                        d: 'Cookie de seguimiento de Hotjar – utilizada para la grabación de sesiones, mapas de calor y análisis de comportamiento.' },
                { e: '_clck',                      d: 'ID de usuario de Microsoft Clarity – conserva el ID de usuario y las preferencias de Clarity. Caduca después de 1 año.' },
                { e: '_clsk',                      d: 'Clave de sesión de Microsoft Clarity – conecta varias vistas de página dentro de una sesión. Caduca después de 24 horas.' },
                { e: '_ttp',                       d: 'ID de seguimiento de TikTok Pixel – almacena el ID de un navegador para medir el rendimiento de los anuncios. Caduca después de 13 meses.' },
                { e: '__cf_bm',                    d: 'Cookie de gestión de bots de Cloudflare – distingue a los visitantes humanos de los bots automatizados. Caduca después de 30 minutos.' },
                { e: 'cf_clearance',               d: 'Cookie de autorización de Cloudflare – confirma que un visitante ha superado un desafío de seguridad de Cloudflare. Caduca después de 1 día.' },
                { e: 'IntastellarConsentSolution', d: 'Registro de Intastellar Consents – almacena las opciones de consentimiento de cookies del visitante. Caduca después de 3 meses.' },
                { e: 'PHPSESSID',                  d: 'Cookie de sesión de PHP – mantiene una sesión del lado del servidor para el usuario actual. Cookie de sesión.' },
                { e: 'IDE',                        d: 'Cookie de segmentación de anuncios de DoubleClick – identifica un navegador para anuncios personalizados de Google. Caduca después de 13 meses.' },
                { e: 'ar_debug',               d: 'Cookie de depuración de LinkedIn Ads — usada por LinkedIn para depurar el seguimiento de conversiones mediante el Insight Tag. Cookie de sesión.' },
                { e: 'AnalyticsSyncHistory',   d: 'Cookie de sincronización de analíticas de LinkedIn — registra cuándo se sincronizaron por última vez los datos de analíticas de LinkedIn con la actividad del visitante. Caduca en 1 mes.' },
                { e: 'omnisendSessionID',      d: 'Cookie de sesión de Omnisend — realiza un seguimiento de la sesión del visitante actual para la automatización del marketing por correo electrónico y la atribución de Omnisend. Cookie de sesión.' },
                { e: 'CLID',                   d: 'ID de cliente de Microsoft Clarity — almacena un identificador único del visitante para mapas de calor y reproducción de sesiones. Caduca en 1 año.' },
                { e: 'barometric[cuid]',        d: 'ID multidispositivo de Barometric — almacena un identificador único para la segmentación publicitaria entre dispositivos y la atribución de publicidad programática.' },
                { e: 'TapAd_TS',                d: 'Marca de tiempo de sincronización de Tapad — registra cuándo se sincronizó por última vez el gráfico de identidad multidispositivo de Tapad para este navegador.' },
                { e: 'TapAd_DID',               d: 'ID de dispositivo de Tapad — almacena un identificador único de dispositivo para la segmentación entre dispositivos y el límite de frecuencia en la red de Tapad.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Contador de sincronización de Tapad — registra el número de sincronizaciones de cookies tripartitas para la resolución de identidad entre dispositivos.' },
                { e: 'cg_uuid',                  d: 'UUID publicitario multidispositivo — almacena un identificador único para la segmentación de audiencias y la personalización de anuncios en varios sitios.' },
                { e: 'brwsr',                    d: 'ID de navegador de HubSpot — identifica el navegador del visitante para el análisis de marketing y la reorientación de HubSpot en dominios de HubSpot.' },
                { e: 'irld',                     d: 'ID de redirección de HubSpot — registra los clics en enlaces entrantes y la atribución de campañas en las páginas de destino de HubSpot.' },
                { e: 'laboratory-anonymous-id',  d: 'ID de experimento de HubSpot — asigna un ID anónimo a la plataforma interna de pruebas A/B y experimentación de HubSpot.' },
                { e: '_switch_session_id',        d: 'Sesión de cambio de portal de HubSpot — rastrea la sesión activa al cambiar entre portales de HubSpot. Caduca en 6 meses.' },
                { e: 'FPAU',                     d: 'URL de análisis de origen propio de Google — establecida por el modo de origen propio de Google Tag Manager para recopilar análisis sin cookies de terceros.' },
                { e: '_twpid',                   d: 'ID de píxel de Twitter/X — identifica al visitante para la atribución publicitaria y la reorientación de Twitter/X. Caduca en 2 años.' },
                { p: '__pdst',                   d: 'Cookie de atribución de Podscribe — rastrea la actividad del usuario para la atribución publicitaria de podcasts y la medición del alcance multicanal.' },
                { p: '_tq_id',                   d: 'ID de píxel de TVSquared — almacena un identificador de espectador para la medición de publicidad en TV y streaming entre medios.' },
                { e: '_cq_duid',                  d: 'ID de dispositivo de Contentsquare — almacena un identificador único de dispositivo para la grabación de sesiones y el análisis del recorrido del usuario.' },
                { e: '_cq_suid',                  d: 'ID de usuario de sesión de Contentsquare — asigna un ID único a cada visita para mapas de calor y reproducción de sesiones.' },
                { e: '_cq_session',               d: 'Cookie de sesión de Contentsquare — rastrea la sesión del visitante actual para el análisis de la experiencia digital. Caduca en 30 minutos.' },
                { e: '_cq_s',                     d: 'Cookie de segmento de Contentsquare — almacena datos de segmento del visitante para el análisis de la experiencia digital y la personalización.' },
                { e: 'IR_PI',                    d: 'Cookie de impresión de página de Impact — registra las vistas de página para la atribución de afiliados y socios de Impact.' },
                { e: 'IR_gbd',                   d: 'Datos globales del navegador de Impact — almacena información del navegador para el seguimiento de conversiones de afiliados y socios de Impact.' },
                { p: 'IR_',                      d: 'Cookie de seguimiento de afiliados de Impact — utilizada por la plataforma de socios de Impact para atribuir conversiones a los socios afiliados.' },
                { e: '_cfuvid',                  d: 'Cookie de limitación de velocidad de Cloudflare — identifica a los usuarios para la limitación de velocidad por solicitud. Cookie de sesión.' },
                { e: 'guid',                     d: 'ID de usuario de la red publicitaria — almacena un identificador único persistente de usuario para la segmentación de anuncios y el límite de frecuencia.' },
                { e: 'geo',                     d: 'Cookie de enrutamiento geográfico de Apple — almacena el código de país detectado del visitante para redirigirlo al Apple Store regional correcto. Cookie de sesión.' },
                { e: 's_vi',                    d: 'ID de visitante de Adobe Analytics — identifica de forma exclusiva a un visitante en múltiples sesiones. Caduca en un máximo de 2 años.' },
                { e: 's_fid',                   d: 'ID de visitante alternativo de Adobe Analytics — se usa cuando no se puede establecer s_vi (p. ej. en navegación privada). Caduca en 5 años.' },
                { e: 's_cc',                    d: 'Verificación de cookie de Adobe Analytics — determina si las cookies están habilitadas en el navegador del visitante. Cookie de sesión.' },
                { e: 'mk_epub',                 d: 'Cookie de atribución de marketing de Apple — rastrea qué campaña de marketing dirigió al visitante a Apple.com.' },
            ],
        },
        pt: {
            necessary:  'Necessários',
            security:   'Segurança',
            analytics:  'Analíticos',
            marketing:  'Marketing',
            functional: 'Funcionais',
            colName:        'Nome do cookie',
            colDomain:      'Domínio',
            colProvider:    'Fornecedor',
            colLifetime:    'Duração',
            colDescription: 'Descrição',
            session:    'Sessão',
            persistent: 'Persistente',
            loading:    'A carregar lista de cookies…',
            retrying:   'Análise em curso — recarregue em ~30 s.',
            error:      'Não foi possível carregar a lista de cookies. Tente novamente mais tarde.',
            noCookies:  'Nenhum cookie detetado para esta categoria.',
            updated:    'Última atualização:',
            noData:            'Não foram detetados cookies para este domínio. O website pode restringir cookies antes de ser dado o consentimento.',
            servicesHeading:   'Serviços de terceiros',
            servicesIntro:     'Os seguintes serviços de terceiros podem aceder ou processar dados pessoais quando visita este website.',
            colService:        'Serviço',
            colPurpose:        'Finalidade',
            colCountry:        'País',
            colTransfer:       'Base de transferência',
            manageHeading:     'Gerir as suas preferências de cookies',
            managePara:        'Pode retirar ou alterar o seu consentimento de cookies a qualquer momento utilizando o painel de definições de cookies neste website. A maioria dos browsers também lhe permite controlar os cookies através das definições do browser; consulte a documentação de ajuda do seu browser para mais detalhes.',
            controllerHeading: 'Responsável pelo tratamento',
            controllerText:    'Este website é operado por',
            controllerContact: 'Para questões relacionadas com a privacidade, contacte-nos em',
            intro: [
                'Utilizamos cookies e tecnologias de rastreio semelhantes para acompanhar a atividade no nosso Serviço e armazenar determinadas informações.',
                'Os cookies são ficheiros com uma pequena quantidade de dados que podem incluir um identificador único anónimo. Os cookies são enviados para o seu browser a partir de um website e armazenados no seu dispositivo. Outras tecnologias de rastreio também são utilizadas, como beacons, tags e scripts, para recolher e acompanhar informações e para melhorar e analisar o nosso Serviço.',
                'Pode gerir as suas preferências de cookies a qualquer momento através do painel de definições de cookies disponível no nosso website. Também pode instruir o seu browser a recusar todos os cookies, embora isso possa impedir que algumas partes do nosso Serviço funcionem corretamente.',
                'Organizamos os cookies que utilizamos nas seguintes categorias:',
            ],
            catDesc: {
                necessary:  'Estes cookies são essenciais para o correto funcionamento do website. Permitem funcionalidades essenciais como navegação, segurança e acesso a áreas protegidas. Sem eles, o website não pode funcionar como previsto e não podem ser desativados.',
                security:   'Estes cookies ajudam-nos a detetar e prevenir atividades maliciosas, bots e comportamentos fraudulentos. Não armazenam qualquer informação pessoal identificável.',
                analytics:  'Estes cookies ajudam-nos a compreender como os visitantes interagem com o nosso website, recolhendo e reportando informações de forma anónima. Permitem-nos medir o tráfego, identificar conteúdos populares e melhorar a experiência geral do utilizador.',
                marketing:  'Estes cookies rastreiam a sua atividade de navegação em websites para fornecer publicidade personalizada e relevante. São normalmente definidos pelos nossos parceiros publicitários e permitem-lhes construir um perfil dos seus interesses.',
                functional: 'Estes cookies permitem funcionalidades melhoradas e personalização, como widgets de chat ao vivo, vídeos incorporados e integrações com redes sociais. Desativá-los pode reduzir a funcionalidade de certas partes do website.',
            },
            cookieDesc: [
                { e: '_ga',                        d: 'ID de cliente do Google Analytics – identifica um visitante único entre sessões. Expira após 2 anos.' },
                { e: '_gid',                       d: 'Cookie de sessão do Google Analytics – distingue utilizadores numa sessão de 24 horas.' },
                { p: '_ga_',                       d: 'Cookie de propriedade do Google Analytics 4 – armazena o estado da sessão para um ID de medição GA4 específico.' },
                { e: '_fbp',                       d: 'ID de browser do Facebook Pixel – identifica browsers para entrega de anúncios e medição de conversões. Expira após 3 meses.' },
                { e: '_fbc',                       d: 'ID de clique do Facebook – armazena o parâmetro fbclid de um clique num anúncio do Facebook. Expira após 3 meses.' },
                { e: 'hubspotutk',                 d: 'Token de visitante do HubSpot – rastreia a identidade de um visitante entre visitas e submissões de formulários. Expira após 13 meses.' },
                { p: '_hj',                        d: 'Cookie de rastreio do Hotjar – utilizado para gravação de sessões, mapas de calor e análise de comportamento.' },
                { e: '_clck',                      d: 'ID de utilizador do Microsoft Clarity – mantém o ID de utilizador e preferências do Clarity. Expira após 1 ano.' },
                { e: '_clsk',                      d: 'Chave de sessão do Microsoft Clarity – liga múltiplas visualizações de página numa sessão. Expira após 24 horas.' },
                { e: '_ttp',                       d: 'ID de rastreio do TikTok Pixel – armazena o ID do browser para medição do desempenho de anúncios. Expira após 13 meses.' },
                { e: '__cf_bm',                    d: 'Cookie de gestão de bots do Cloudflare – distingue visitantes humanos de bots automatizados. Expira após 30 minutos.' },
                { e: 'cf_clearance',               d: 'Cookie de autorização do Cloudflare – confirma que um visitante passou um desafio de segurança do Cloudflare. Expira após 1 dia.' },
                { e: 'IntastellarConsentSolution', d: 'Registo do Intastellar Consents – armazena as escolhas de consentimento de cookies do visitante. Expira após 3 meses.' },
                { e: 'PHPSESSID',                  d: 'Cookie de sessão PHP – mantém uma sessão do lado do servidor para o utilizador atual. Cookie de sessão.' },
                { e: 'IDE',                        d: 'Cookie de segmentação de anúncios DoubleClick – identifica um browser para anúncios personalizados do Google. Expira após 13 meses.' },
                { e: 'ar_debug',               d: 'Cookie de depuração do LinkedIn Ads — utilizado pelo LinkedIn para depurar o rastreamento de conversões via Insight Tag. Cookie de sessão.' },
                { e: 'AnalyticsSyncHistory',   d: 'Cookie de sincronização de análises do LinkedIn — regista quando os dados de análise do LinkedIn foram sincronizados pela última vez com a atividade do visitante. Expira após 1 mês.' },
                { e: 'omnisendSessionID',      d: 'Cookie de sessão Omnisend — rastreia a sessão atual do visitante para automação de marketing por e-mail e atribuição do Omnisend. Cookie de sessão.' },
                { e: 'CLID',                   d: 'ID de cliente Microsoft Clarity — armazena um identificador único do visitante para mapas de calor e repetição de sessão. Expira após 1 ano.' },
                { e: 'barometric[cuid]',        d: 'ID multidispositivo da Barometric — armazena um identificador único para segmentação de anúncios entre dispositivos e atribuição de publicidade programática.' },
                { e: 'TapAd_TS',                d: 'Carimbo de data/hora de sincronização do Tapad — regista quando o gráfico de identidade multidispositivo do Tapad foi sincronizado pela última vez para este navegador.' },
                { e: 'TapAd_DID',               d: 'ID de dispositivo do Tapad — armazena um identificador único de dispositivo para segmentação entre dispositivos e limitação de frequência na rede do Tapad.' },
                { e: 'TapAd_3WAY_SYNCS',        d: 'Contador de sincronização do Tapad — rastreia o número de sincronizações de cookies triplas para resolução de identidade entre dispositivos.' },
                { e: 'cg_uuid',                  d: 'UUID de publicidade multidispositivo — armazena um identificador único para segmentação de audiências e personalização de anúncios em vários sites.' },
                { e: 'brwsr',                    d: 'ID de navegador HubSpot — identifica o navegador do visitante para análise de marketing e retargeting do HubSpot em domínios HubSpot.' },
                { e: 'irld',                     d: 'ID de redirecionamento HubSpot — regista cliques em links de entrada e atribuição de campanhas em páginas de destino HubSpot.' },
                { e: 'laboratory-anonymous-id',  d: 'ID de experimento HubSpot — atribui um ID anónimo à plataforma interna de testes A/B e experimentação do HubSpot.' },
                { e: '_switch_session_id',        d: 'Sessão de troca de portal HubSpot — rastreia a sessão ativa ao alternar entre portais HubSpot. Expira após 6 meses.' },
                { e: 'FPAU',                     d: 'URL de análise first-party do Google — definido pelo modo first-party do Google Tag Manager para recolha de análises sem cookies de terceiros.' },
                { e: '_twpid',                   d: 'ID de píxel Twitter/X — identifica o visitante para atribuição de anúncios e retargeting do Twitter/X. Expira após 2 anos.' },
                { p: '__pdst',                   d: 'Cookie de atribuição Podscribe — rastreia a atividade do utilizador para atribuição de publicidade em podcasts e medição de alcance multicanal.' },
                { p: '_tq_id',                   d: 'ID de píxel TVSquared — armazena um identificador de espectador para medição de publicidade em TV e streaming entre médias.' },
                { e: '_cq_duid',                  d: 'ID de dispositivo Contentsquare — armazena um identificador único de dispositivo para gravação de sessão e análise da jornada do utilizador.' },
                { e: '_cq_suid',                  d: 'ID de utilizador de sessão Contentsquare — atribui um ID único a cada visita para mapas de calor e repetição de sessão.' },
                { e: '_cq_session',               d: 'Cookie de sessão Contentsquare — rastreia a sessão atual do visitante para análise da experiência digital. Expira após 30 minutos.' },
                { e: '_cq_s',                     d: 'Cookie de segmento Contentsquare — armazena dados de segmento do visitante para análise da experiência digital e personalização.' },
                { e: 'IR_PI',                    d: 'Cookie de impressão de página Impact — regista visualizações de página para atribuição de afiliados e parceiros do Impact.' },
                { e: 'IR_gbd',                   d: 'Dados globais de navegador Impact — armazena informações do navegador para rastreamento de conversões de afiliados e parceiros do Impact.' },
                { p: 'IR_',                      d: 'Cookie de rastreamento de afiliados Impact — utilizado pela plataforma de parcerias do Impact para atribuir conversões a parceiros afiliados.' },
                { e: '_cfuvid',                  d: 'Cookie de limitação de taxa Cloudflare — identifica utilizadores para limitação de taxa por pedido. Cookie de sessão.' },
                { e: 'guid',                     d: 'ID de utilizador da rede publicitária — armazena um identificador único persistente de utilizador para segmentação de anúncios e limitação de frequência.' },
                { e: 'geo',                     d: 'Cookie de encaminhamento geográfico da Apple — armazena o código de país detectado do visitante para redirecionar para a Apple Store regional correta. Cookie de sessão.' },
                { e: 's_vi',                    d: 'ID de visitante do Adobe Analytics — identifica de forma exclusiva um visitante em várias sessões. Expira após no máximo 2 anos.' },
                { e: 's_fid',                   d: 'ID de visitante alternativo do Adobe Analytics — utilizado quando s_vi não pode ser definido (por ex. em navegação privada). Expira após 5 anos.' },
                { e: 's_cc',                    d: 'Verificação de cookie do Adobe Analytics — determina se os cookies estão ativados no navegador do visitante. Cookie de sessão.' },
                { e: 'mk_epub',                 d: 'Cookie de atribuição de marketing da Apple — rastreia qual campanha de marketing direcionou o visitante para Apple.com.' },
            ],
        },
    };

    var CAT_ORDER = ['necessary', 'security', 'analytics', 'marketing', 'functional'];

    function groupCookiesByName(rawCookies) {
        var map = {};
        rawCookies.forEach(function (c) {
            if (!map[c.name]) {
                map[c.name] = Object.assign({}, c, { domains: [c.domain] });
            } else {
                var g = map[c.name];
                if (g.domains.indexOf(c.domain) === -1) g.domains.push(c.domain);
                if (!g.session && c.expires && (!g.expires || c.expires > g.expires)) {
                    g.expires = c.expires;
                }
            }
        });
        return Object.values(map);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = [
            '.ics-ct{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:inherit;line-height:1.5}',
            '.ics-ct-intro{font-size:14px;color:#374151;line-height:1.6;margin-top:0;margin-bottom:8px}',
            '.ics-ct-intro:last-of-type{margin-bottom:24px}',
            '.ics-ct-group{margin-bottom:28px}',
            '.ics-ct-group-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px}',
            '.ics-ct-group-desc{font-size:13px;color:#6b7280;margin:0 0 10px}',
            '.ics-ct-table-wrap{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}',
            '.ics-ct-table{width:100%;border-collapse:collapse;background: transparent;}',
            '.ics-ct-table th,.ics-ct-table td{text-align:left;padding:9px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top}',
            '.ics-ct-table th{background:#f9fafb;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}',
            '.ics-ct-table tr:last-child td{border-bottom:none}',
            '.ics-ct-table td:first-child{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#111;word-break:break-all}',
            '.ics-ct-table td{font-size:13px;color:#374151}',
            '.ics-ct-meta{font-size:12px;color:#9ca3af;margin-top:12px}',
            '.ics-ct-msg{font-size:13px;padding:12px 0;color:#9ca3af}',
            '.ics-ct-err{color:#dc2626}',
            '.ics-ct-link{color:#6366f1;text-decoration:none}',
            '.ics-ct-link:hover{text-decoration:underline}',
        ].join('');
        (document.head || document.documentElement).appendChild(el);
    }

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function lookupCookieDesc(name, cd) {
        if (!cd) return null;
        for (var i = 0; i < cd.length; i++) {
            var entry = cd[i];
            if (entry.e && name === entry.e) return entry.d;
            if (entry.p && name.indexOf(entry.p) === 0) return entry.d;
        }
        return null;
    }

    function renderVendorTable(data, L) {
        var cats = data.categories || {};
        var seen = {};
        var vendors = [];
        CAT_ORDER.forEach(function (cat) {
            var group = cats[cat];
            if (!group || !group.vendors) return;
            group.vendors.forEach(function (v) {
                if (seen[v.service]) return;
                seen[v.service] = true;
                vendors.push(v);
            });
        });
        if (!vendors.length) return '';

        var html = '<div class="ics-ct-group" style="margin-top:32px">';
        html += '<div class="ics-ct-group-label">' + esc(L.servicesHeading || 'Third-party services') + ' (' + vendors.length + ')</div>';
        html += '<p class="ics-ct-group-desc">' + esc(L.servicesIntro || 'The following third-party services may access or process personal data when you visit this website.') + '</p>';
        html += '<div class="ics-ct-table-wrap"><table class="ics-ct-table"><thead><tr>';
        html += '<th>' + esc(L.colService  || 'Service')        + '</th>';
        html += '<th>' + esc(L.colPurpose  || 'Purpose')        + '</th>';
        html += '<th>' + esc(L.colCountry  || 'Country')        + '</th>';
        html += '<th>' + esc(L.colTransfer || 'Transfer basis') + '</th>';
        html += '</tr></thead><tbody>';
        vendors.forEach(function (v) {
            var catLabel = L[v.bannerCategory] || v.bannerCategory || '';
            html += '<tr>';
            if (v.privacyUrl) {
                html += '<td><a class="ics-ct-link" href="' + esc(v.privacyUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(v.service) + '</a></td>';
            } else {
                html += '<td>' + esc(v.service) + '</td>';
            }
            html += '<td>' + esc(catLabel)                          + '</td>';
            html += '<td>' + esc(v.dataCountry      || '—')    + '</td>';
            html += '<td>' + esc(v.transferMechanism || '—')   + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table></div></div>';
        return html;
    }

    function renderCategories(container, data, L, controller, contact) {
        var cats = data.categories || {};
        var scannedAt = data.scanned_at;
        var html = '<div class="ics-ct">';

        var introParas = Array.isArray(L.intro) ? L.intro : [L.intro];
        introParas.forEach(function (para) {
            html += '<p class="ics-ct-intro">' + esc(para) + '</p>';
        });

        CAT_ORDER.forEach(function (cat) {
            var group = cats[cat];
            if (!group || !group.cookies || !group.cookies.length) return;

            var grouped = groupCookiesByName(group.cookies);
            var desc = L.catDesc && L.catDesc[cat] ? L.catDesc[cat] : '';
            html += '<div class="ics-ct-group">';
            html += '<div class="ics-ct-group-label">' + esc(L[cat] || cat) + ' (' + grouped.length + ')</div>';
            if (desc) html += '<p class="ics-ct-group-desc">' + esc(desc) + '</p>';
            html += '<div class="ics-ct-table-wrap"><table class="ics-ct-table"><thead><tr>';
            html += '<th>' + esc(L.colName) + '</th>';
            html += '<th>' + esc(L.colDomain) + '</th>';
            html += '<th>' + esc(L.colProvider) + '</th>';
            html += '<th>' + esc(L.colLifetime) + '</th>';
            html += '<th>' + esc(L.colDescription) + '</th>';
            html += '</tr></thead><tbody>';

            grouped.forEach(function (c) {
                var provider = '';
                if (group.vendors) {
                    group.vendors.forEach(function (v) {
                        if (v.cookies && v.cookies.some(function (vc) { return vc.name === c.name; })) {
                            provider = v.service || '';
                        }
                    });
                }
                if (!provider) provider = c.provider || '';
                html += '<tr>';
                html += '<td>' + esc(c.name) + '</td>';
                html += '<td>' + esc(c.domains.join(', ')) + '</td>';
                html += '<td>' + esc(provider) + '</td>';
                var lifetime = c.session
                    ? L.session
                    : (c.expires ? new Date(c.expires * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : L.persistent);
                html += '<td>' + esc(lifetime) + '</td>';
                html += '<td>' + esc(lookupCookieDesc(c.name, L.cookieDesc) || c.description || '') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div></div>';
        });

        var hasAnyCookies = CAT_ORDER.some(function (cat) {
            var g = cats[cat];
            return g && g.cookies && g.cookies.length;
        });
        if (!hasAnyCookies) {
            html += '<p class="ics-ct-msg">' + esc(L.noData || 'No cookies were detected for this domain.') + '</p>';
        }

        html += renderVendorTable(data, L);

        html += '<div class="ics-ct-group" style="margin-top:32px">';
        html += '<div class="ics-ct-group-label">' + esc(L.manageHeading || 'Managing your cookie preferences') + '</div>';
        html += '<p class="ics-ct-intro">' + esc(L.managePara || "You can withdraw or change your cookie consent at any time using the cookie settings panel on this website. Most web browsers also allow you to control cookies through their settings.") + '</p>';
        html += '</div>';

        if (controller) {
            var safeContact = contact && contact.indexOf('@') > 0 ? contact : '';
            html += '<div class="ics-ct-group">';
            html += '<div class="ics-ct-group-label">' + esc(L.controllerHeading || 'Data controller') + '</div>';
            var ctrlHtml = esc(L.controllerText || 'This website is operated by') + ' <strong>' + esc(controller) + '</strong>.';
            if (safeContact) {
                ctrlHtml += ' ' + esc(L.controllerContact || 'For privacy-related enquiries, please contact us at') + ' <a class="ics-ct-link" href="mailto:' + esc(safeContact) + '">' + esc(safeContact) + '</a>.';
            }
            html += '<p class="ics-ct-intro">' + ctrlHtml + '</p>';
            html += '</div>';
        }

        if (scannedAt) {
            var d = new Date(scannedAt);
            var formatted = isNaN(d.getTime()) ? scannedAt : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
            html += '<p class="ics-ct-meta">' + esc(L.updated) + ' ' + esc(formatted) + '</p>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function originMatchesDomain(pageHost, dataDomain) {
        var allowed = dataDomain.replace(/^\./, '').toLowerCase();
        var host = pageHost.toLowerCase();
        return host === allowed || (host.length > allowed.length + 1 && host.slice(-(allowed.length + 1)) === '.' + allowed);
    }

    function loadContainer(container) {
        if (container.getAttribute('data-ics-init')) return;
        container.setAttribute('data-ics-init', '1');
        var domain     = (container.getAttribute('data-domain')     || '').trim();
        var lang       = (container.getAttribute('data-lang')       || 'en').trim().toLowerCase();
        var controller = (container.getAttribute('data-controller') || '').trim();
        var contact    = (container.getAttribute('data-contact')    || '').trim();
        var L = LABELS[lang] || LABELS.en;

        if (!domain) {
            container.innerHTML = '<p class="ics-ct-msg ics-ct-err">data-domain attribute is required.</p>';
            return;
        }

        if (!originMatchesDomain(window.location.hostname, domain)) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[Intastellar Cookie Table] Blocked: page origin (' + window.location.hostname + ') does not match data-domain="' + domain + '".');
            }
            return;
        }

        container.innerHTML = '<p class="ics-ct-msg">' + esc(L.loading) + '</p>';

        // data-api-base lets the embedding site proxy the API through their own domain,
        // making the request first-party and bypassing content-blocker / ITP restrictions.
        // e.g. data-api-base="/ics-proxy"  →  GET /ics-proxy?domain=example.com
        var apiBase = (container.getAttribute('data-api-base') || '').trim() || (BASE + '/api/cookie-banner');
        var url = apiBase + (apiBase.indexOf('?') === -1 ? '?' : '&') + 'domain=' + encodeURIComponent(domain);

        fetch(url, { mode: 'cors', credentials: 'omit' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.status === 'scan_in_progress' || data.status === 'scan_queued') {
                    container.innerHTML = '<p class="ics-ct-msg">' + esc(L.retrying) + '</p>';
                    return;
                }
                if (data.error && !data.categories) {
                    container.innerHTML = '<p class="ics-ct-msg ics-ct-err">' + esc(L.error) + '</p>';
                    return;
                }
                renderCategories(container, data, L, controller, contact);
            })
            .catch(function () {
                container.innerHTML = '<p class="ics-ct-msg ics-ct-err">' + esc(L.error) + '</p>';
            });
    }

    function init() {
        injectStyles();
        var containers = document.querySelectorAll('[data-intastellar-cookies]');
        for (var i = 0; i < containers.length; i++) {
            loadContainer(containers[i]);
        }
        // Catch containers injected after script load (SPA routing, CMS lazy rendering)
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(function () {
                var late = document.querySelectorAll('[data-intastellar-cookies]:not([data-ics-init])');
                for (var i = 0; i < late.length; i++) loadContainer(late[i]);
            }).observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
