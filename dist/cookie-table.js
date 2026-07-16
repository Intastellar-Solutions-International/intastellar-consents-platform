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
            noData:     'No cookies were detected for this domain. The website may restrict cookies before consent is given.',
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
            noData:     'Für diese Domain wurden keine Cookies erkannt. Die Website schränkt Cookies möglicherweise vor der Einwilligung ein.',
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
            noData:     'Der blev ikke registreret nogen cookies for dette domæne. Webstedet kan begrænse cookies, før der gives samtykke.',
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
            noData:     'Ingen informasjonskapsler ble oppdaget for dette domenet. Nettstedet kan begrense informasjonskapsler før samtykke gis.',
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
            noData:     'Inga cookies hittades för den här domänen. Webbplatsen kan begränsa cookies innan samtycke ges.',
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
            noData:     'Nie wykryto plików cookie dla tej domeny. Witryna może ograniczać pliki cookie przed udzieleniem zgody.',
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
            noData:     'Er zijn geen cookies gedetecteerd voor dit domein. De website kan cookies beperken voordat toestemming wordt gegeven.',
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
            noData:     'Geen koekies is vir hierdie domein bespeur nie. Die webwerf kan koekies beperk voordat toestemming gegee word.',
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
            noData:     "Aucun cookie n’a été détecté pour ce domaine. Le site peut restreindre les cookies avant l’obtention du consentement.",
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
            noData:     'No se detectaron cookies para este dominio. El sitio web puede restringir las cookies antes de obtener el consentimiento.',
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
            noData:     'Não foram detetados cookies para este domínio. O website pode restringir cookies antes de ser dado o consentimento.',
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

    function renderCategories(container, data, L) {
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

        if (scannedAt) {
            var d = new Date(scannedAt);
            var formatted = isNaN(d.getTime()) ? scannedAt : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
            html += '<p class="ics-ct-meta">' + esc(L.updated) + ' ' + esc(formatted) + '</p>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function loadContainer(container) {
        if (container.getAttribute('data-ics-init')) return;
        container.setAttribute('data-ics-init', '1');
        var domain = (container.getAttribute('data-domain') || '').trim();
        var lang   = (container.getAttribute('data-lang')   || 'en').trim().toLowerCase();
        var L = LABELS[lang] || LABELS.en;

        if (!domain) {
            container.innerHTML = '<p class="ics-ct-msg ics-ct-err">data-domain attribute is required.</p>';
            return;
        }

        container.innerHTML = '<p class="ics-ct-msg">' + esc(L.loading) + '</p>';

        // data-api-base lets the embedding site proxy the API through their own domain,
        // making the request first-party and bypassing content-blocker / ITP restrictions.
        // e.g. data-api-base="/ics-proxy"  →  GET /ics-proxy?domain=example.com
        var apiBase = (container.getAttribute('data-api-base') || '').trim() || (BASE + '/api/cookie-banner');
        var url = apiBase + (apiBase.indexOf('?') === -1 ? '?' : '&') + 'domain=' + encodeURIComponent(domain);

        fetch(url, { mode: 'cors', cache: 'no-cache' })
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
                renderCategories(container, data, L);
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
