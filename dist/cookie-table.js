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
            intro:      'Cookies are small text files placed on your device when you visit a website. They may contain an anonymous unique identifier and are used to remember your preferences or track your behaviour across visits. In addition to cookies, we may use other tracking technologies such as web beacons, tags, and scripts to collect and analyse information about your use of this service. The table below lists all cookies and trackers currently in use on this website, grouped by purpose.',
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
            intro:      'Cookies sind kleine Textdateien, die auf Ihrem Gerät gespeichert werden, wenn Sie eine Website besuchen. Sie können eine anonyme eindeutige Kennung enthalten und werden verwendet, um Ihre Einstellungen zu speichern oder Ihr Verhalten über mehrere Besuche hinweg zu verfolgen. Neben Cookies können wir auch andere Tracking-Technologien wie Web-Beacons, Tags und Skripte einsetzen, um Informationen über Ihre Nutzung dieses Dienstes zu erfassen und zu analysieren. Die nachstehende Tabelle listet alle Cookies und Tracker auf, die derzeit auf dieser Website verwendet werden, geordnet nach Zweck.',
            catDesc: {
                necessary:  'Diese Cookies sind für den ordnungsgemäßen Betrieb der Website unentbehrlich. Sie ermöglichen grundlegende Funktionen wie Navigation, Sicherheit und den Zugriff auf geschützte Bereiche. Ohne sie kann die Website nicht wie vorgesehen funktionieren und sie können nicht deaktiviert werden.',
                security:   'Diese Cookies helfen uns, böswillige Aktivitäten, Bots und betrügerisches Verhalten zu erkennen und zu verhindern. Sie speichern keine personenbezogenen Daten.',
                analytics:  'Diese Cookies helfen uns zu verstehen, wie Besucher mit unserer Website interagieren, indem sie Informationen anonym erfassen und auswerten. Sie ermöglichen es uns, den Datenverkehr zu messen, beliebte Inhalte zu identifizieren und die allgemeine Nutzererfahrung zu verbessern.',
                marketing:  'Diese Cookies verfolgen Ihre Surfaktivitäten auf verschiedenen Websites, um Ihnen personalisierte und relevante Werbung anzuzeigen. Sie werden in der Regel von unseren Werbepartnern gesetzt und ermöglichen diesen, ein Profil Ihrer Interessen aufzubauen.',
                functional: 'Diese Cookies ermöglichen erweiterte Funktionen und Personalisierung, wie z. B. Live-Chat-Widgets, eingebettete Videos und Social-Media-Integrationen. Das Deaktivieren dieser Cookies kann die Funktionalität bestimmter Teile der Website einschränken.',
            },
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
            intro:      'Cookies er små tekstfiler, der placeres på din enhed, når du besøger et websted. De kan indeholde en anonym unik identifikator og bruges til at huske dine præferencer eller spore din adfærd på tværs af besøg. Ud over cookies kan vi bruge andre sporingsteknologier som webbakoner, tags og scripts til at indsamle og analysere oplysninger om din brug af denne tjeneste. Tabellen nedenfor viser alle cookies og trackere, der i øjeblikket bruges på dette websted, grupperet efter formål.',
            catDesc: {
                necessary:  'Disse cookies er nødvendige for, at webstedet fungerer korrekt. De muliggør kernefunktioner som navigation, sikkerhed og adgang til beskyttede områder. Uden dem kan webstedet ikke fungere som tilsigtet, og de kan ikke deaktiveres.',
                security:   'Disse cookies hjælper os med at opdage og forhindre ondsindet aktivitet, bots og svigagtig adfærd. De gemmer ingen personligt identificerbare oplysninger.',
                analytics:  'Disse cookies hjælper os med at forstå, hvordan besøgende interagerer med vores websted ved at indsamle og rapportere oplysninger anonymt. De giver os mulighed for at måle trafik, identificere populært indhold og forbedre den overordnede brugeroplevelse.',
                marketing:  'Disse cookies sporer din browsingaktivitet på tværs af websteder for at levere personaliseret og relevant reklame. De sættes typisk af vores reklamepartnere og giver disse partnere mulighed for at opbygge en profil af dine interesser.',
                functional: 'Disse cookies muliggør forbedrede funktioner og personalisering, såsom live chat-widgets, indlejrede videoer og integration af sociale medier. Deaktivering af dem kan reducere funktionaliteten af visse dele af webstedet.',
            },
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
            intro:      'Informasjonskapsler (cookies) er små tekstfiler som lagres på enheten din når du besøker et nettsted. De kan inneholde en anonym unik identifikator og brukes til å huske preferansene dine eller spore atferden din på tvers av besøk. I tillegg til informasjonskapsler kan vi bruke andre sporingsteknologier som web-beacons, tagger og skript for å samle inn og analysere informasjon om din bruk av denne tjenesten. Tabellen nedenfor viser alle informasjonskapsler og sporere som for øyeblikket brukes på dette nettstedet, gruppert etter formål.',
            catDesc: {
                necessary:  'Disse informasjonskapslene er nødvendige for at nettstedet skal fungere korrekt. De muliggjør kjernefunksjoner som navigasjon, sikkerhet og tilgang til beskyttede områder. Uten dem kan ikke nettstedet fungere som tiltenkt, og de kan ikke deaktiveres.',
                security:   'Disse informasjonskapslene hjelper oss med å oppdage og forhindre ondsinnet aktivitet, roboter og svindelatferd. De lagrer ingen personlig identifiserbar informasjon.',
                analytics:  'Disse informasjonskapslene hjelper oss med å forstå hvordan besøkende samhandler med nettstedet vårt ved å samle inn og rapportere informasjon anonymt. De lar oss måle trafikk, identifisere populært innhold og forbedre den generelle brukeropplevelsen.',
                marketing:  'Disse informasjonskapslene sporer nettleseraktiviteten din på tvers av nettsteder for å levere personalisert og relevant annonsering. De settes vanligvis av annonsepartnerne våre og gir disse partnerne mulighet til å bygge en profil av interessene dine.',
                functional: 'Disse informasjonskapslene muliggjør forbedrede funksjoner og personalisering, som live chat-widgets, innebygde videoer og integrasjoner med sosiale medier. Deaktivering av dem kan redusere funksjonaliteten til visse deler av nettstedet.',
            },
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
            intro:      'Kakor (cookies) är små textfiler som placeras på din enhet när du besöker en webbplats. De kan innehålla en anonym unik identifierare och används för att komma ihåg dina inställningar eller spåra ditt beteende över besök. Utöver kakor kan vi använda andra spårningstekniker som webb-beacons, taggar och skript för att samla in och analysera information om din användning av denna tjänst. Tabellen nedan listar alla kakor och spårare som för närvarande används på denna webbplats, grupperade efter syfte.',
            catDesc: {
                necessary:  'Dessa kakor är nödvändiga för att webbplatsen ska fungera korrekt. De möjliggör grundläggande funktioner som navigering, säkerhet och tillgång till skyddade områden. Utan dem kan webbplatsen inte fungera som avsett och de kan inte stängas av.',
                security:   'Dessa kakor hjälper oss att upptäcka och förhindra skadlig aktivitet, robotar och bedrägligt beteende. De lagrar ingen personligt identifierbar information.',
                analytics:  'Dessa kakor hjälper oss att förstå hur besökare interagerar med vår webbplats genom att samla in och rapportera information anonymt. De gör det möjligt för oss att mäta trafik, identifiera populärt innehåll och förbättra den övergripande användarupplevelsen.',
                marketing:  'Dessa kakor spårar din surfaktivitet på webbplatser för att leverera personaliserad och relevant annonsering. De sätts vanligtvis av våra reklampartners och gör det möjligt för dessa partners att bygga en profil av dina intressen.',
                functional: 'Dessa kakor möjliggör förbättrade funktioner och personalisering, som live chat-widgets, inbäddade videor och integrationer med sociala medier. Att inaktivera dem kan minska funktionaliteten i vissa delar av webbplatsen.',
            },
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
            intro:      'Pliki cookie to małe pliki tekstowe umieszczane na urządzeniu użytkownika podczas odwiedzania strony internetowej. Mogą one zawierać anonimowy unikalny identyfikator i są używane do zapamiętywania preferencji użytkownika lub śledzenia jego zachowania podczas kolejnych wizyt. Oprócz plików cookie możemy stosować inne technologie śledzenia, takie jak sygnały nawigacyjne, tagi i skrypty, w celu gromadzenia i analizowania informacji o korzystaniu z naszego serwisu. Poniższa tabela zawiera listę wszystkich plików cookie i narzędzi śledzenia aktualnie używanych na tej stronie, pogrupowanych według celu.',
            catDesc: {
                necessary:  'Te pliki cookie są niezbędne do prawidłowego działania strony internetowej. Umożliwiają podstawowe funkcje, takie jak nawigacja, bezpieczeństwo i dostęp do chronionych obszarów. Bez nich strona nie może działać zgodnie z przeznaczeniem i nie można ich wyłączyć.',
                security:   'Te pliki cookie pomagają nam wykrywać i zapobiegać złośliwej aktywności, botom i oszukańczym zachowaniom. Nie przechowują żadnych danych osobowych.',
                analytics:  'Te pliki cookie pomagają nam zrozumieć, w jaki sposób odwiedzający wchodzą w interakcje z naszą stroną, zbierając i raportując informacje anonimowo. Pozwalają nam mierzyć ruch, identyfikować popularne treści i poprawiać ogólne wrażenia użytkownika.',
                marketing:  'Te pliki cookie śledzą Twoją aktywność przeglądania na różnych stronach internetowych, aby dostarczać spersonalizowane i trafne reklamy. Są zazwyczaj ustawiane przez naszych partnerów reklamowych i umożliwiają im budowanie profilu Twoich zainteresowań.',
                functional: 'Te pliki cookie umożliwiają zaawansowane funkcje i personalizację, takie jak widgety czatu na żywo, osadzone filmy i integracje z mediami społecznościowymi. Ich wyłączenie może zmniejszyć funkcjonalność niektórych części strony.',
            },
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
            intro:      'Cookies zijn kleine tekstbestanden die op uw apparaat worden geplaatst wanneer u een website bezoekt. Ze kunnen een anonieme unieke identifier bevatten en worden gebruikt om uw voorkeuren te onthouden of uw gedrag over meerdere bezoeken te volgen. Naast cookies kunnen wij ook andere trackingtechnologieën gebruiken, zoals webbakens, tags en scripts, om informatie over uw gebruik van deze dienst te verzamelen en analyseren. De onderstaande tabel geeft een overzicht van alle cookies en trackers die momenteel op deze website worden gebruikt, gegroepeerd op doel.',
            catDesc: {
                necessary:  'Deze cookies zijn essentieel voor het correct functioneren van de website. Ze maken kernfuncties mogelijk zoals navigatie, beveiliging en toegang tot beveiligde gebieden. Zonder deze cookies kan de website niet naar behoren werken en ze kunnen niet worden uitgeschakeld.',
                security:   'Deze cookies helpen ons kwaadaardige activiteiten, bots en frauduleus gedrag te detecteren en te voorkomen. Ze bevatten geen persoonlijk identificeerbare informatie.',
                analytics:  'Deze cookies helpen ons te begrijpen hoe bezoekers met onze website omgaan door informatie anoniem te verzamelen en te rapporteren. Ze stellen ons in staat om verkeer te meten, populaire inhoud te identificeren en de algehele gebruikerservaring te verbeteren.',
                marketing:  'Deze cookies volgen uw browseactiviteit op websites om gepersonaliseerde en relevante advertenties te leveren. Ze worden doorgaans ingesteld door onze advertentiepartners en stellen deze partners in staat een profiel van uw interesses op te bouwen.',
                functional: 'Deze cookies maken verbeterde functies en personalisering mogelijk, zoals live chat-widgets, ingesloten video\'s en integraties met sociale media. Het uitschakelen ervan kan de functionaliteit van bepaalde delen van de website verminderen.',
            },
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
            intro:      'Koekies is klein tekslêers wat op u toestel geplaas word wanneer u \'n webwerf besoek. Dit kan \'n anonieme unieke identifiseerder bevat en word gebruik om u voorkeure te onthou of u gedrag oor besoeke na te spoor. Benewens koekies kan ons ander naspoortegnologieë gebruik soos webbakens, etikette en skrifte om inligting oor u gebruik van hierdie diens te versamel en te ontleed. Die tabel hieronder lys alle koekies en naspoorders wat tans op hierdie webwerf gebruik word, gegroepeer volgens doel.',
            catDesc: {
                necessary:  'Hierdie koekies is noodsaaklik vir die korrekte werking van die webwerf. Dit stel kernfunksies soos navigasie, sekuriteit en toegang tot beskermde areas in staat. Sonder hulle kan die webwerf nie soos bedoel funksioneer nie en dit kan nie afgeskakel word nie.',
                security:   'Hierdie koekies help ons kwaadwillige aktiwiteit, bots en bedrieglike gedrag op te spoor en te voorkom. Dit stoor geen persoonlik identifiseerbare inligting nie.',
                analytics:  'Hierdie koekies help ons verstaan hoe besoekers met ons webwerf omgaan deur inligting anoniem te versamel en te rapporteer. Dit stel ons in staat om verkeer te meet, gewilde inhoud te identifiseer en die algehele gebruikerservaring te verbeter.',
                marketing:  'Hierdie koekies naspoor u blaai-aktiwiteit oor webwerwe om gepersonaliseerde en relevante advertensies te lewer. Dit word tipies deur ons advertensieskennisse gestel en laat hulle toe om \'n profiel van u belangstellings te bou.',
                functional: 'Hierdie koekies stel verbeterde funksies en personalisering in staat, soos kitsklets-wysers, ingeslote video\'s en sosialemedia-integrasies. Die deaktivering daarvan kan die funksionaliteit van sekere dele van die webwerf verminder.',
            },
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
            retrying:   'Analyse en cours — veuillez recharger dans ~30 s.',
            error:      'Impossible de charger la liste des cookies. Veuillez réessayer plus tard.',
            noCookies:  'Aucun cookie détecté pour cette catégorie.',
            updated:    'Dernière mise à jour :',
            intro:      'Les cookies sont de petits fichiers texte placés sur votre appareil lorsque vous visitez un site web. Ils peuvent contenir un identifiant unique anonyme et sont utilisés pour mémoriser vos préférences ou suivre votre comportement au fil de vos visites. En plus des cookies, nous pouvons utiliser d’autres technologies de suivi telles que les balises web, les tags et les scripts pour collecter et analyser des informations sur votre utilisation de ce service. Le tableau ci-dessous répertorie tous les cookies et traceurs actuellement utilisés sur ce site web, regroupés par finalité.',
            catDesc: {
                necessary:  'Ces cookies sont indispensables au bon fonctionnement du site web. Ils permettent des fonctionnalités essentielles telles que la navigation, la sécurité et l’accès aux zones protégées. Sans eux, le site ne peut pas fonctionner comme prévu et ils ne peuvent pas être désactivés.',
                security:   'Ces cookies nous aident à détecter et à prévenir les activités malveillantes, les robots et les comportements frauduleux. Ils ne stockent aucune information personnellement identifiable.',
                analytics:  'Ces cookies nous aident à comprendre comment les visiteurs interagissent avec notre site web en collectant et en rapportant des informations de manière anonyme. Ils nous permettent de mesurer le trafic, d’identifier les contenus populaires et d’améliorer l’expérience utilisateur globale.',
                marketing:  'Ces cookies suivent votre activité de navigation sur les sites web afin de diffuser des publicités personnalisées et pertinentes. Ils sont généralement définis par nos partenaires publicitaires et leur permettent de constituer un profil de vos centres d’intérêt.',
                functional: 'Ces cookies permettent des fonctionnalités améliorées et une personnalisation, tels que les widgets de chat en direct, les vidéos intégrées et les intégrations avec les réseaux sociaux. Les désactiver peut réduire les fonctionnalités de certaines parties du site web.',
            },
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
            retrying:   'Análisis en curso — recargue en ~30 s.',
            error:      'No se pudo cargar la lista de cookies. Inténtelo de nuevo más tarde.',
            noCookies:  'No se detectaron cookies para esta categoría.',
            updated:    'Última actualización:',
            intro:      'Las cookies son pequeños archivos de texto que se colocan en su dispositivo cuando visita un sitio web. Pueden contener un identificador único anónimo y se utilizan para recordar sus preferencias o rastrear su comportamiento a lo largo de las visitas. Además de las cookies, podemos utilizar otras tecnologías de seguimiento como balizas web, etiquetas y scripts para recopilar y analizar información sobre su uso de este servicio. La siguiente tabla enumera todas las cookies y rastreadores que se utilizan actualmente en este sitio web, agrupados por finalidad.',
            catDesc: {
                necessary:  'Estas cookies son esenciales para el correcto funcionamiento del sitio web. Permiten funciones básicas como la navegación, la seguridad y el acceso a áreas protegidas. Sin ellas, el sitio web no puede funcionar como se pretende y no pueden desactivarse.',
                security:   'Estas cookies nos ayudan a detectar y prevenir actividades maliciosas, bots y comportamientos fraudulentos. No almacenan ninguna información de identificación personal.',
                analytics:  'Estas cookies nos ayudan a entender cómo los visitantes interactúan con nuestro sitio web recopilando e informando sobre información de forma anónima. Nos permiten medir el tráfico, identificar el contenido popular y mejorar la experiencia general del usuario.',
                marketing:  'Estas cookies rastrean su actividad de navegación en los sitios web para ofrecer publicidad personalizada y relevante. Generalmente son establecidas por nuestros socios publicitarios y les permiten crear un perfil de sus intereses.',
                functional: 'Estas cookies permiten funciones mejoradas y personalización, como widgets de chat en vivo, vídeos incrustados e integraciones con redes sociales. Desactivarlas puede reducir la funcionalidad de ciertas partes del sitio web.',
            },
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
            retrying:   'Análise em curso — recarregue em ~30 s.',
            error:      'Não foi possível carregar a lista de cookies. Tente novamente mais tarde.',
            noCookies:  'Nenhum cookie detetado para esta categoria.',
            updated:    'Última atualização:',
            intro:      'Os cookies são pequenos ficheiros de texto colocados no seu dispositivo quando visita um website. Podem conter um identificador único anónimo e são utilizados para memorizar as suas preferências ou acompanhar o seu comportamento ao longo das visitas. Para além dos cookies, podemos utilizar outras tecnologias de rastreio, como web beacons, tags e scripts, para recolher e analisar informações sobre a sua utilização deste serviço. A tabela abaixo lista todos os cookies e rastreadores atualmente utilizados neste website, agrupados por finalidade.',
            catDesc: {
                necessary:  'Estes cookies são essenciais para o correto funcionamento do website. Permitem funcionalidades essenciais como navegação, segurança e acesso a áreas protegidas. Sem eles, o website não pode funcionar como previsto e não podem ser desativados.',
                security:   'Estes cookies ajudam-nos a detetar e prevenir atividades maliciosas, bots e comportamentos fraudulentos. Não armazenam qualquer informação pessoal identificável.',
                analytics:  'Estes cookies ajudam-nos a compreender como os visitantes interagem com o nosso website, recolhendo e reportando informações de forma anónima. Permitem-nos medir o tráfego, identificar conteúdos populares e melhorar a experiência geral do utilizador.',
                marketing:  'Estes cookies rastreiam a sua atividade de navegação em websites para fornecer publicidade personalizada e relevante. São normalmente definidos pelos nossos parceiros publicitários e permitem-lhes construir um perfil dos seus interesses.',
                functional: 'Estes cookies permitem funcionalidades melhoradas e personalização, como widgets de chat ao vivo, vídeos incorporados e integrações com redes sociais. Desativá-los pode reduzir a funcionalidade de certas partes do website.',
            },
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
            '.ics-ct-intro{font-size:14px;color:#374151;line-height:1.6;margin-bottom:24px}',
            '.ics-ct-group{margin-bottom:28px}',
            '.ics-ct-group-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px}',
            '.ics-ct-group-desc{font-size:13px;color:#6b7280;margin:0 0 10px}',
            '.ics-ct-table{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}',
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

    function renderCategories(container, data, L) {
        var cats = data.categories || {};
        var scannedAt = data.scanned_at;
        var html = '<div class="ics-ct">';

        html += '<p class="ics-ct-intro">' + esc(L.intro) + '</p>';

        CAT_ORDER.forEach(function (cat) {
            var group = cats[cat];
            if (!group || !group.cookies || !group.cookies.length) return;

            var grouped = groupCookiesByName(group.cookies);
            var desc = L.catDesc && L.catDesc[cat] ? L.catDesc[cat] : '';
            html += '<div class="ics-ct-group">';
            html += '<div class="ics-ct-group-label">' + esc(L[cat] || cat) + ' (' + grouped.length + ')</div>';
            if (desc) html += '<p class="ics-ct-group-desc">' + esc(desc) + '</p>';
            html += '<table class="ics-ct-table"><thead><tr>';
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
                html += '<td>' + esc(c.description || '') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div>';
        });

        if (scannedAt) {
            var d = new Date(scannedAt);
            var formatted = isNaN(d.getTime()) ? scannedAt : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
            html += '<p class="ics-ct-meta">' + esc(L.updated) + ' ' + esc(formatted) + '</p>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function loadContainer(container) {
        var domain = (container.getAttribute('data-domain') || '').trim();
        var lang   = (container.getAttribute('data-lang')   || 'en').trim().toLowerCase();
        var L = LABELS[lang] || LABELS.en;

        if (!domain) {
            container.innerHTML = '<p class="ics-ct-msg ics-ct-err">data-domain attribute is required.</p>';
            return;
        }

        container.innerHTML = '<p class="ics-ct-msg">' + esc(L.loading) + '</p>';

        var url = BASE + '/api/cookie-banner?domain=' + encodeURIComponent(domain);

        fetch(url)
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
