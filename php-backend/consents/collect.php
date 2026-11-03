<?php

/* ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
ini_set('display_errors', 1); */

header("Content-Type: text/plain");
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Cross-Origin-Resource-Policy: cross-origin");
date_default_timezone_set('Europe/Copenhagen');
/* ini_set('proc_open', 1); */

// Credentials live in db-config.php next to this file on the server — never
// in git. See php-backend/db-config.example.php.
$dbConfig = require __DIR__ . "/db-config.php";
$db = mysqli_connect($dbConfig["host"], $dbConfig["username"], $dbConfig["password"], $dbConfig["dbname"]);

if (isset($_GET['health']) || isset($_SERVER['HTTP_X_HEALTH_CHECK'])) {
    http_response_code(200);
    header('Content-Type: application/json');
    $dbOk = false;
    // Ping the database
    if($db){
        $dbOk = (bool) mysqli_query($db, 'SELECT 1');
        mysqli_close($db);
    }

    http_response_code($dbOk ? 200 : 503);
    echo json_encode(['status' => $dbOk ? 'ok' : 'error', 'db' => $dbOk]);
    exit;
}

$data = json_decode(file_get_contents("php://input"));

$value = $data->checked;
$type = $data->type;
$userAgent = $data->userAgent;
$uid = $data->uid;
$consentsGiving = $data->consentsTimeStamp;
$cookies_accepted = $data->cookies_accepted;
$cookiesFound = $data->allCookies;
$timestamp = time();
$timeToDecision = $data->timeToDecision;

$experiment = $data->experiment ?? null;


/**
 * The banner sends an ISO-8601 UTC timestamp ("2026-11-03T14:30:05.123Z").
 * Stored as UTC wall-clock time, 24-hour. Previously
 *   date('Y-m-d h:i:s', strtotime(substr($ts, 0, strpos($ts, 'Z'))))
 * used "h" — the 12-hour clock with no AM/PM — so 14:30 was stored as 02:30,
 * and a timestamp without a "Z" collapsed to 1970-01-01.
 */
function normalizeConsentTimestamp($raw)
{
    $ts = is_string($raw) && $raw !== "" ? strtotime($raw) : false;
    if ($ts === false) {
        $ts = time();
    }
    return gmdate('Y-m-d H:i:s', $ts);
}

$consentsGiving = normalizeConsentTimestamp($consentsGiving);

$tcfData = $data->tcfData;

$companyName = $data->companyName ?? "Unknown Company";

$screen = $data->device->screen;
$screen = json_encode($screen);

$domain = $_GET["ev"];
$consent_url = $_GET["consent_url"];
$consent_giving = $_GET["consent_giving"];
$referrer = ($_GET["referrer"] && $_GET["referrer"] != "") ? $_GET["referrer"] : "direct";
$design = $data->design;
$language = $_GET["lang"];

$consent = json_encode($cookies_accepted);
$shopifyConsentId = $data->shopifyConsentId;

$supportedRegulations = [
    "gdpr",
    "uk_gdpr",
    "swiss_fadp",
    "lgpd",
    "ccpa",
    "cdpa",
    "cpa",
    "ucpa",
    "ctdpa",
    "popia",
    "pdpa",
    "apa",
    "pdpl",
    "pipeda",
    "law25",
];

/* include 'analytics.php'; */

// Check if the domain is valid and returns a 200 status code if it is
/* $ch = curl_init($domain);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$result = curl_exec($ch);

if ($_GET["ev"] == "wbrbh.de") {
    echo curl_errno($ch);
    echo curl_error($ch);
    echo $result;
    echo $httpCode;
    exit;
}

if ($httpCode == 0) {
    http_response_code(500);
    return;
} */

if (strpos($domain, "appspot.com") === true) {
    http_response_code(500);
    return;
}

$domain = str_replace("www.", "", $domain);
$domain = str_replace("https://", "", $domain);
$domain = str_replace("http://", "", $domain);

// fetch cookies via Headless Chrome (fallback to Guzzle if proc_open is disabled)
require_once __DIR__ . '/vendor/autoload.php';

// check if any errors are found & if the array is not empty

if (isset($data->errors) && !empty($data->errors)) {
    $consoleErrors = $data->errors;

    $errorMessage = $consoleErrors->message;
    $colNr = $consoleErrors->colno;
    $lineNr = $consoleErrors->lineno;
    $source = $consoleErrors->source;

    $errorSql = "INSERT INTO static_error_tracking(`domain`, `errorMessage`, `source`, `colnr`, `linenr`, `useragent`) VALUES('$domain', '$errorMessage', '$source', '$colNr', '$lineNr', '$userAgent')";

    $errorQuery = mysqli_query($db, $errorSql);
    //$errorQuery2 = mysqli_query($backUpDb, $errorSql);
}

function getUserIP()
{
    // Get real visitor IP behind CloudFlare network
    // Get real visitor IP behind apple private relay

    // Convert IP to IPv4 if it is IPv6
    if (filter_var($_SERVER['REMOTE_ADDR'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $ipv4 = inet_pton($_SERVER['REMOTE_ADDR']);
        if ($ipv4 !== false) {
            $_SERVER['REMOTE_ADDR'] = inet_ntop($ipv4);
            $_SERVER['HTTP_CLIENT_IP'] = $_SERVER['REMOTE_ADDR'];
        }
    }

    if (isset($_SERVER["HTTP_CF_CONNECTING_IP"])) {
        $_SERVER['REMOTE_ADDR'] = $_SERVER["HTTP_CF_CONNECTING_IP"];
        $_SERVER['HTTP_CLIENT_IP'] = $_SERVER["HTTP_CF_CONNECTING_IP"];
    }
    $client  = @$_SERVER['HTTP_CLIENT_IP'];
    $forward = @$_SERVER['HTTP_X_FORWARDED_FOR'];
    $remote  = $_SERVER['REMOTE_ADDR'];

    if (filter_var($client, FILTER_VALIDATE_IP)) {
        $ip = $client;
    } elseif (filter_var($forward, FILTER_VALIDATE_IP)) {
        $ip = $forward;
    } else {
        $ip = $remote;
    }

    return $ip;
}

$isBlocked = false;

/* if (getUserIP()) {
    $usersIP = getUserIP();

    $sql = "SELECT * FROM black_list_ip WHERE ip = ?";
    $stmt = mysqli_prepare($db, $sql);
    //$stmt2 = mysqli_prepare($backUpDb, $sql);
    if ($stmt) {
        mysqli_stmt_bind_param($stmt, "s", $usersIP);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
        if (mysqli_num_rows($result) > 0) {
            $isBlocked = true;
        }
    }
}
// Do not allow to collect data from IP addresses that are blacklisted
if ($isBlocked) {
    http_response_code(500);
    return;
} */

function MyFunction()
{
    $apiDomain = "https://api.ipinfo.io/lite/";

    $ip = getUserIP();

    // Convert IPv6 to IPv4 if necessary
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $convertedIP = convertIPv6ToIPv4($ip);
        if ($convertedIP) {
            $ip = $convertedIP;
        }
    }

    /* $url = $apiDomain . $ip . "?token=<IPINFO_TOKEN>";

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $result = curl_exec($ch);

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($httpCode != 200) { */
        $newAPI = "http://ip-api.com/json/" . $ip . "?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query,continentCode";
        $ch = curl_init($newAPI);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $result = curl_exec($ch);
        
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode != 200) {
            return null;
        }
    /* } */

    $user = json_decode($result, true);

    return [
        'country_name' => $user['country'],
        'countryCode'  => $user['country_code'] ?? $user['countryCode'],
        'continentCode' => $user['continent_code'] ?? $user['continentCode'],
        'regionName'   => $user['regionName'] ?? "",
        // ISO 3166-2 subdivision code, e.g. "CA" — what getRegulationApplied() compares against.
        'regionCode'   => $user['region'] ?? "",
        // ip-api: the IP belongs to a hosting/datacenter provider.
        'hosting'      => !empty($user['hosting']),
        'city'         => $user['city'] ?? "",
        'ip'           => $ip,
        'isp'          => $user['isp'] ?? $user["as_name"],
    ];
}

$countryData = MyFunction();
$country = $countryData['country_name'];
$countryCode = $countryData['countryCode'];
$region = $countryData['regionName'];
$regionCode = $countryData['regionCode'];
$city = $countryData['city'];
$continentCode = $countryData['continentCode'];

/**
 * Resolve which privacy regulation applies to *this* visitor.
 *
 * We distinguish EEA (true GDPR) from UK (UK GDPR, adequacy-based) and
 * Switzerland (FADP, adequacy-based), because the transfer basis they need
 * is different even though all three are "European-style" regimes.
 *
 * Returns one of: gdpr | uk_gdpr | swiss_fadp | pdpa | lgpd | popia | ccpa | ''
 */

function getRegulationApplied($countryCode, $region, $continentCode) {
    // EEA = EU-27 + Iceland + Liechtenstein + Norway. These countries trigger
    // the GDPR directly and their data stays in the EEA when our importer is EU.
    static $EEA = [
        'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
        'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
        'IS','LI','NO',
    ];

    if ($countryCode === 'BR')                              return 'lgpd';
    // US state laws — check specific states before the California/CCPA fallback
    if ($countryCode === 'US' && $region === 'CA')          return 'ccpa';
    if ($countryCode === 'US' && $region === 'VA')          return 'cdpa';
    if ($countryCode === 'US' && $region === 'CO')          return 'cpa';
    if ($countryCode === 'US' && $region === 'UT')          return 'ucpa';
    if ($countryCode === 'US' && $region === 'CT')          return 'ctdpa';
    if ($countryCode === 'ZA')                              return 'popia';
    if ($countryCode === 'TH' || $countryCode === 'SG')     return 'pdpa';
    if ($countryCode === 'AU')                              return 'apa';
    if ($countryCode === 'SA')                              return 'pdpl';
    // Quebec has stricter requirements than federal PIPEDA (Law 25)
    if ($countryCode === 'CA' && $region === 'QC')          return 'law25';
    if ($countryCode === 'CA')                              return 'pipeda';
    if (in_array($countryCode, $EEA, true))                 return 'gdpr';
    if ($countryCode === 'GB')                              return 'uk_gdpr';
    if ($countryCode === 'CH')                              return 'swiss_fadp';
    // Fallback: continent-level match for unmapped European microstates etc.
    if ($continentCode === 'EU')                            return 'gdpr';
    return '';
}

/**
 * Resolve the cross-border transfer mechanism for this consent event.
 * Lookup order:
 *   1. Domain + regulation-specific override (domain_data_transfer.regulation = $regulation)
 *   2. Domain default                        (domain_data_transfer.regulation = '')
 *   3. Per-regulation fallback (safe defaults — tenants can override via domain_data_transfer)
 *   4. A universal "disclosure_only" stub when nothing is configured.
 *
 * Returns an associative array with: basis, destination, data_importer, instrument, effective_from.
 */
function getDataTransferMechanism($db, $domain, $regulation) {
    $domainEsc     = mysqli_real_escape_string($db, $domain);
    $regulationEsc = mysqli_real_escape_string($db, $regulation);

    $sql = "SELECT basis, destination, data_importer, instrument, effective_from
            FROM domain_data_transfer
            WHERE domain = '$domainEsc' AND (regulation = '$regulationEsc' OR regulation = '')
            ORDER BY CASE WHEN regulation = '$regulationEsc' THEN 0 ELSE 1 END
            LIMIT 1";
    $res = @mysqli_query($db, $sql);
    if ($res && mysqli_num_rows($res) > 0) {
        $row = mysqli_fetch_assoc($res);
        return [
            'basis'          => $row['basis']          ?? '',
            'destination'    => $row['destination']    ?? '',
            'data_importer'  => $row['data_importer']  ?? '',
            'instrument'     => $row['instrument']     ?? '',
            'effective_from' => $row['effective_from'] ?? null,
        ];
    }

    static $defaults = [
        // EEA visitor + EU importer = no cross-border transfer at all.
        'gdpr'       => ['basis' => 'none_required',   'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'Processing within EEA (GDPR Art. 44 not engaged)',                      'effective_from' => null],
        // UK visitor. UK recognises the EEA as adequate → adequacy, not SCCs.
        'uk_gdpr'    => ['basis' => 'adequacy',        'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'UK DPA 2018 s17A adequacy regulations (EEA)',                           'effective_from' => null],
        // Swiss visitor. FDPIC list recognises the EEA as providing adequate protection.
        'swiss_fadp' => ['basis' => 'adequacy',        'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'Swiss FADP art. 16 / FDPIC adequacy list (EEA)',                        'effective_from' => null],
        'pdpa'       => ['basis' => 'sccs',            'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'PDPC Cross-Border Transfer Regs (Mar 2024)',                            'effective_from' => null],
        'lgpd'       => ['basis' => 'sccs',            'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'ANPD clausulas-padrao (Res. 19/2024)',                                  'effective_from' => null],
        'popia'      => ['basis' => 'intra_group',     'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'POPIA section 72 intra-group binding rules',                           'effective_from' => null],
        // US opt-out state laws — disclosure only, no transfer instrument required.
        'ccpa'       => ['basis' => 'disclosure_only', 'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => '',                                                                      'effective_from' => null],
        'cdpa'       => ['basis' => 'disclosure_only', 'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => '',                                                                      'effective_from' => null],
        'cpa'        => ['basis' => 'disclosure_only', 'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => '',                                                                      'effective_from' => null],
        'ucpa'       => ['basis' => 'disclosure_only', 'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => '',                                                                      'effective_from' => null],
        'ctdpa'      => ['basis' => 'disclosure_only', 'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => '',                                                                      'effective_from' => null],
        // Australia — no EU adequacy decision; SCCs required.
        'apa'        => ['basis' => 'sccs',            'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'EU SCCs 2021/914 (Module 2)',                                           'effective_from' => null],
        // Saudi Arabia — no EU adequacy decision; SCCs required.
        'pdpl'       => ['basis' => 'sccs',            'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'EU SCCs 2021/914 (Module 2)',                                           'effective_from' => null],
        // Canada — EU adequacy decision covers PIPEDA private-sector organisations (2002/2/EC).
        'pipeda'     => ['basis' => 'adequacy',        'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'European Commission adequacy decision — Canada PIPEDA (2002/2/EC)',     'effective_from' => null],
        'law25'      => ['basis' => 'adequacy',        'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => 'European Commission adequacy decision — Canada PIPEDA (2002/2/EC)',     'effective_from' => null],
    ];
    if (isset($defaults[$regulation])) {
        return $defaults[$regulation];
    }
    return ['basis' => 'disclosure_only', 'destination' => 'EU', 'data_importer' => 'Intastellar Solutions, International', 'instrument' => '', 'effective_from' => null];
}

/**
 * Derive the consent method from the raw cookies_accepted payload when the
 * banner didn't explicitly tell us which button was clicked. Preferred order:
 *   1. $data->consentMethod / $data->method  (banner is authoritative)
 *   2. This derivation                       (fallback for older banner builds)
 *
 * Heuristic: ignore the always-on "necessary" bucket, then look at the
 * accept/decline distribution of the remaining categories.
 *
 * Returns one of: banner_accept_all | banner_reject_all | banner_granular
 *               | banner_essential_only | '' (when nothing can be inferred).
 */
function deriveConsentMethod($cookiesAccepted) {
    if (!is_array($cookiesAccepted) && !is_object($cookiesAccepted)) {
        return '';
    }
    $items = is_array($cookiesAccepted) ? $cookiesAccepted : (array) $cookiesAccepted;

    $nonEssential = [];
    foreach ($items as $item) {
        $type    = is_object($item) ? ($item->type    ?? '') : ($item['type']    ?? '');
        $checked = is_object($item) ? ($item->checked ?? '') : ($item['checked'] ?? '');
        if (strtolower((string) $type) === 'necessary') {
            continue;
        }
        $accepted = ($checked === 'checked' || $checked === '1' || $checked === 1 || $checked === true);
        $nonEssential[] = $accepted;
    }

    if (count($nonEssential) === 0) {
        return 'banner_essential_only';
    }

    $acceptedCount = count(array_filter($nonEssential));
    $totalCount    = count($nonEssential);

    if ($acceptedCount === $totalCount) return 'banner_accept_all';
    if ($acceptedCount === 0)           return 'banner_reject_all';
    return 'banner_granular';
}

/**
 * Seed domain_data_transfer rows for a domain the first time we see it.
 * Inserts one row per supported regulation (gdpr, ccpa, lgpd, popia, pdpa)
 * plus a catch-all row (regulation = '') for visitors outside those regimes.
 *
 * INSERT IGNORE is idempotent against the UNIQUE(domain, regulation) key, so
 * repeated calls are cheap no-ops after the first insert. effective_from =
 * today, snapshotting when this tenant went live on the platform.
 *
 * Instrument/basis values mirror the hard-coded fallbacks in
 * getDataTransferMechanism(). Tenants (or the future admin UI) can UPDATE
 * these rows later without changing code.
 */
function seedDomainDataTransferDefault($db, $domain) {
    $domainEsc = mysqli_real_escape_string($db, $domain);
    if ($domainEsc === '') {
        return;
    }

    $importer = 'Intastellar Solutions, International';

    // [regulation, basis, destination, instrument]
    // Matches the per-regulation $defaults in getDataTransferMechanism so the
    // DB and the hard-coded fallback stay in sync.
    $seedRows = [
        // Catch-all for visitors from countries outside any listed regime: SCCs to EU is a defensible baseline.
        ['',           'sccs',            'EU', 'EU SCCs 2021/914 (Module 2)'],
        // EEA visitor + EU importer → no transfer occurs.
        ['gdpr',       'none_required',   'EU', 'Processing within EEA (GDPR Art. 44 not engaged)'],
        // UK visitor → UK adequacy regulations recognise the EEA.
        ['uk_gdpr',    'adequacy',        'EU', 'UK DPA 2018 s17A adequacy regulations (EEA)'],
        // Swiss visitor → FDPIC adequacy list recognises the EEA.
        ['swiss_fadp', 'adequacy',        'EU', 'Swiss FADP art. 16 / FDPIC adequacy list (EEA)'],
        ['pdpa',       'sccs',            'EU', 'PDPC Cross-Border Transfer Regs (Mar 2024)'],
        ['lgpd',       'sccs',            'EU', 'ANPD clausulas-padrao (Res. 19/2024)'],
        ['popia',      'intra_group',     'EU', 'POPIA section 72 intra-group binding rules'],
        // US opt-out state laws — disclosure only.
        ['ccpa',       'disclosure_only', 'EU', ''],
        ['cdpa',       'disclosure_only', 'EU', ''],
        ['cpa',        'disclosure_only', 'EU', ''],
        ['ucpa',       'disclosure_only', 'EU', ''],
        ['ctdpa',      'disclosure_only', 'EU', ''],
        // Australia — no EU adequacy; SCCs required.
        ['apa',        'sccs',            'EU', 'EU SCCs 2021/914 (Module 2)'],
        // Saudi Arabia — no EU adequacy; SCCs required.
        ['pdpl',       'sccs',            'EU', 'EU SCCs 2021/914 (Module 2)'],
        // Canada — covered by EU adequacy decision 2002/2/EC (PIPEDA private sector).
        ['pipeda',     'adequacy',        'EU', 'European Commission adequacy decision — Canada PIPEDA (2002/2/EC)'],
        ['law25',      'adequacy',        'EU', 'European Commission adequacy decision — Canada PIPEDA (2002/2/EC)'],
    ];

    $values = [];
    foreach ($seedRows as $row) {
        $regEsc        = mysqli_real_escape_string($db, $row[0]);
        $basisEsc      = mysqli_real_escape_string($db, $row[1]);
        $destEsc       = mysqli_real_escape_string($db, $row[2]);
        $instrumentEsc = mysqli_real_escape_string($db, $row[3]);
        $importerEsc   = mysqli_real_escape_string($db, $importer);
        $values[] = "('$domainEsc', '$regEsc', '$basisEsc', '$destEsc', '$importerEsc', '$instrumentEsc', CURDATE())";
    }

    $sql = "INSERT IGNORE INTO domain_data_transfer
                (domain, regulation, basis, destination, data_importer, instrument, effective_from)
            VALUES " . implode(", ", $values);
    @mysqli_query($db, $sql);
}

// Region *code*, not $region: $region is ip-api's full name ("California"),
// so comparing it with 'CA'/'VA'/… never matched and no US state law was ever
// applied — every US visitor fell through to the catch-all.
$regulation_applied = getRegulationApplied($countryCode, $regionCode, $continentCode);

seedDomainDataTransferDefault($db, $domain);

$transfer = getDataTransferMechanism($db, $domain, $regulation_applied);
$transfer_basis          = mysqli_real_escape_string($db, $transfer['basis'] ?? '');
$transfer_destination    = mysqli_real_escape_string($db, $transfer['destination'] ?? '');
$transfer_data_importer  = mysqli_real_escape_string($db, $transfer['data_importer'] ?? '');
$transfer_instrument     = mysqli_real_escape_string($db, $transfer['instrument'] ?? '');
$transfer_effective_from = !empty($transfer['effective_from']) ? mysqli_real_escape_string($db, $transfer['effective_from']) : null;

// Consent method: prefer whatever the banner explicitly sent; otherwise infer
// from the consent payload so older banner builds still produce useful data.
$consentMethodRaw = $data->consentMethod ?? $data->method ?? deriveConsentMethod($cookies_accepted);
$consentMethod    = mysqli_real_escape_string($db, (string) $consentMethodRaw);

$sql = "INSERT INTO statics_useragent(domain, useragent) VALUES('$domain', '$userAgent')";
$query = mysqli_query($db, $sql);
//$query2 = mysqli_query($backUpDb, $sql);

$checkIfDesignExists = "SELECT * FROM banner_style WHERE domain = '$domain' AND design = '$design'";
$checkIfDesignExists_query = mysqli_query($db, $checkIfDesignExists);
$checkIfDesignExists_num = mysqli_num_rows($checkIfDesignExists_query);

if ($design != "") {
    $timestamp = date('Y-m-d H:i:s', time());
    $insertDesign = "INSERT INTO banner_style(domain, design, `timestamp`) VALUES('$domain', '$design', '$timestamp')";
    $insertDesign_query = mysqli_query($db, $insertDesign);
    //$insertDesign_query2 = mysqli_query($backUpDb, $insertDesign);

    if (!$insertDesign_query) {
        echo mysqli_error($db);
        http_response_code(500);
        return;
    }
}

$check = "SELECT * FROM cookiebanner_tracking WHERE domain = '$domain'";

$check1 = "SELECT * FROM cookiebanner_tracking_language WHERE domain = '$domain'";
$query = mysqli_query($db, $check);
$query2 = mysqli_query($db, $check1);

if(mysqli_num_rows($query) == 0) {
    $platform = $_GET["platform"];
    $icon = ($_GET["icon"] != "") ? $_GET["icon"] : "";
    $domain = preg_replace('/^(https?:\/\/)?(www\.)?/', '', $domain);
    $domain = mysqli_real_escape_string($db, $domain);
    $companyName = mysqli_real_escape_string($db, $companyName);
    $platform = mysqli_real_escape_string($db, $platform);
    $icon = mysqli_real_escape_string($db, $icon);

    // Check if domain exists
    $checkSql = "SELECT id FROM cookiebanner_tracking WHERE domain = '$domain' LIMIT 1";
    $checkQuery = mysqli_query($db, $checkSql);

    if (!$checkQuery) {
        echo mysqli_error($db);
        http_response_code(500);
        exit;
    }

    if (mysqli_num_rows($checkQuery) === 0) {
        // Insert new entry
        $insertSql = "
            INSERT IGNORE INTO cookiebanner_tracking
            (domain, company_name, platform, logo_icon, installtime, updated_on)
            VALUES ('$domain', '$companyName', '$platform', '$icon', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ";
        $query = mysqli_query($db, $insertSql);
    } else {
        // Update existing entry
        $updateSql = "
            UPDATE cookiebanner_tracking
            SET company_name = '$companyName',
                platform = '$platform',
                logo_icon = '$icon',
                updated_on = CURRENT_TIMESTAMP
            WHERE domain = '$domain'
        ";
        $query = mysqli_query($db, $updateSql);
    }
}

if($experiment && $experiment->id) {
    $experimentId = $experiment->id;
    $experimentVariant = $experiment->currentVariant;
    $uid = $data->uid;
    $timeToDecision = $data->timeToDecision;

    $settings = json_encode($experiment->settings);
    $channel = '';
    if (isset($experiment->channel)) {
        if (is_object($experiment->channel)) {
            $channel = $experiment->channel->id ?? '';
        } elseif (is_string($experiment->channel)) {
            $channel = $experiment->channel;
        }
    }
    if ($channel === '' && isset($experiment->channelId)) {
        $channel = $experiment->channelId;
    }

    // experiment_tracking: one row per user per experiment (upsert)
    $experimentSql = "INSERT INTO experiment_tracking(domain, uid, experiment_id, experiment_variant, settings, `channel`) 
    VALUES('" . mysqli_real_escape_string($db, $domain) . "', '" . mysqli_real_escape_string($db, $uid) . "', 
           '" . mysqli_real_escape_string($db, $experimentId) . "', '" . mysqli_real_escape_string($db, $experimentVariant) . "', '" . mysqli_real_escape_string($db, $settings) . "', '" . mysqli_real_escape_string($db, $channel) . "')
    ON DUPLICATE KEY UPDATE experiment_variant = VALUES(experiment_variant), settings = VALUES(settings), `channel` = VALUES(`channel`)";

    // experiment_consents_tracking: one row per consent event
    $experimentConsentsSql = "INSERT INTO experiment_consents_tracking(domain, uid, experiment_id, experiment_variant, settings, consent, time_to_decision) 
    VALUES('" . mysqli_real_escape_string($db, $domain) . "', '" . mysqli_real_escape_string($db, $uid) . "', 
           '" . mysqli_real_escape_string($db, $experimentId) . "', '" . mysqli_real_escape_string($db, $experimentVariant) . "',
           '" . mysqli_real_escape_string($db, json_encode($settings)) . "', '" . mysqli_real_escape_string($db, $consent) . "', " . ($timeToDecision !== null ? (int)$timeToDecision : "NULL") . ")";

    $experimentQuery = mysqli_query($db, $experimentSql);
    $experimentConsentsQuery = mysqli_query($db, $experimentConsentsSql);

    if (!$experimentQuery || !$experimentConsentsQuery) {
        echo mysqli_error($db);
        http_response_code(500);
        return;
    }
}

/**
 * Why this consent record looks automated, or "" if it doesn't.
 *
 *   datacenter_ip          the visitor's IP belongs to a hosting provider
 *                          (ip-api "hosting") — scanners, headless browsers
 *   conflicting_decisions  the same visitor stored a *different* consent
 *                          within ±1 second — no person accepts and rejects
 *                          in the same second
 *   high_rate              more than 5 separate decisions by one visitor in
 *                          the last 60 seconds
 *
 * Deliberately not used: "no regulation applied" on its own (that is every
 * visitor from a place without a listed privacy law), ip-api "proxy" (VPN
 * users are people), and per-IP rates (IPs aren't stored).
 * Note one decision arrives as several identical rows (one request per
 * category), so rates count distinct decisions, not rows.
 */
function suspectedBotReason($isHostingIp, $hasConflictingDecision, $recentDecisions)
{
    if ($isHostingIp) return 'datacenter_ip';
    if ($hasConflictingDecision) return 'conflicting_decisions';
    if ((int) $recentDecisions >= 5) return 'high_rate'; // this one is the 6th+
    return '';
}

$botUid      = mysqli_real_escape_string($db, (string) $uid);
$botDomain   = mysqli_real_escape_string($db, (string) $domain);
$botConsent  = mysqli_real_escape_string($db, (string) $consent);
$hasConflictingDecision = false;
$recentDecisions = 0;
if ($botUid !== '') {
    $conflictWhere = "uid = '$botUid' AND domain = '$botDomain'
        AND consents_timestamp BETWEEN DATE_SUB('$consentsGiving', INTERVAL 1 SECOND) AND DATE_ADD('$consentsGiving', INTERVAL 1 SECOND)
        AND consent <> '$botConsent'";
    $res = @mysqli_query($db, "SELECT 1 FROM user_consents_tracking WHERE $conflictWhere LIMIT 1");
    $hasConflictingDecision = $res && mysqli_num_rows($res) > 0;

    $res = @mysqli_query($db, "SELECT COUNT(DISTINCT consents_timestamp) AS n FROM user_consents_tracking
        WHERE uid = '$botUid' AND domain = '$botDomain'
          AND consents_timestamp >= DATE_SUB('$consentsGiving', INTERVAL 60 SECOND)
          AND consents_timestamp < '$consentsGiving'");
    if ($res) $recentDecisions = (int) (mysqli_fetch_assoc($res)['n'] ?? 0);

    // The earlier half of a conflicting pair was stored before we knew —
    // flag it too, so both sides drop out of the totals.
    if ($hasConflictingDecision) {
        @mysqli_query($db, "UPDATE user_consents_tracking SET is_suspected_bot = 1, bot_reason = 'conflicting_decisions' WHERE $conflictWhere");
    }
}
$botReason = suspectedBotReason(!empty($countryData['hosting']), $hasConflictingDecision, $recentDecisions);
$isSuspectedBot = $botReason !== '' ? 1 : 0;
$botReasonSql = $botReason !== '' ? "'$botReason'" : "NULL";

$selectPolicyId = "SELECT policy_id FROM banner_policies WHERE active = 1 LIMIT 1";
$selectPolicyId_query = mysqli_query($db, $selectPolicyId);
$policyIdRow = mysqli_fetch_assoc($selectPolicyId_query);
$policyId = $policyIdRow['policy_id'] ?? "ic-consent-v1";

$transferEffectiveFromSql = $transfer_effective_from !== null ? "'$transfer_effective_from'" : "NULL";
$user_consents_tracking = "INSERT INTO user_consents_tracking(`url`, `domain`,`consents_timestamp`, `referrer`, `consent`, `uid`, `banner_policy_id`, `time_to_decision`, `shopify_consent_id`, `regulation_applied`, `country_code`, `region`, `language`, `consent_method`, `transfer_basis`, `transfer_destination`, `transfer_data_importer`, `transfer_instrument`, `transfer_effective_from`, `is_suspected_bot`, `bot_reason`) VALUES('$consent_url', '$domain', '$consentsGiving', '$referrer', '$consent', '$uid', '$policyId', '$timeToDecision', '$shopifyConsentId', '$regulation_applied', '$countryCode', '$region', '$language', '$consentMethod', '$transfer_basis', '$transfer_destination', '$transfer_data_importer', '$transfer_instrument', $transferEffectiveFromSql, $isSuspectedBot, $botReasonSql)";
$user_consents_query = mysqli_query($db, $user_consents_tracking);
//$user_consents_query2 = mysqli_query($backUpDb, $user_consents_tracking);

function convertIPv6ToIPv4($ipv6)
{
    if (filter_var($ipv6, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $ipv4 = inet_ntop(inet_pton($ipv6));
        return $ipv4;
    }
    return null;
}

// Collect TCF data if available
if ($tcfData && $tcfData->tcString != null && count($tcfData->vendors) > 0 && $tcfData->tcString->version != null) {



    // Insert tcf data into main tcf_data_tracking, tcf_purpose_consents, tcf_vendor_consents, tcf_special_feature_optins
    /* 
        CREATE TABLE tcf_purpose_consents (
            tracking_id BIGINT UNSIGNED NOT NULL,
            purpose_id INT NOT NULL,
            consent_given BOOLEAN NOT NULL,

            PRIMARY KEY (tracking_id, purpose_id),

            CONSTRAINT fk_purpose_tracking
                FOREIGN KEY (tracking_id)
                REFERENCES tcf_data_tracking(id)
                ON DELETE CASCADE,

            INDEX idx_purpose_lookup (purpose_id, consent_given)

        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


       CREATE TABLE tcf_data_tracking (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

            -- Multi-tenant scope
            domain VARCHAR(255) NOT NULL,
            uid VARCHAR(255) NOT NULL,

            -- CMP info
            cmp_id INT NOT NULL,
            cmp_version INT NOT NULL,

            consent_language VARCHAR(5) NOT NULL,
            consent_screen INT NOT NULL DEFAULT 0,

            is_service_specific BOOLEAN NOT NULL,
            tcf_policy_version INT NOT NULL,
            use_non_standard_stacks BOOLEAN NOT NULL,
            vendor_list_version INT NOT NULL,

            -- TC String metadata
            tc_version INT NOT NULL,
            tc_created BIGINT NOT NULL,        -- epoch ms
            tc_last_updated BIGINT NOT NULL,   -- epoch ms
            tc_string TEXT,

            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP 
                ON UPDATE CURRENT_TIMESTAMP,

            PRIMARY KEY (id),
            UNIQUE KEY uq_domain_uid (domain, uid),
            INDEX idx_domain (domain),
            INDEX idx_uid (uid)

        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE tcf_vendor_consents (
    tracking_id BIGINT UNSIGNED NOT NULL,
    vendor_id INT NOT NULL,
    consent_given BOOLEAN NOT NULL,

    PRIMARY KEY (tracking_id, vendor_id),

    CONSTRAINT fk_vendor_tracking
        FOREIGN KEY (tracking_id)
        REFERENCES tcf_data_tracking(id)
        ON DELETE CASCADE,

    INDEX idx_vendor_lookup (vendor_id, consent_given)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tcf_special_feature_optins (
    tracking_id BIGINT UNSIGNED NOT NULL,
    feature_id INT NOT NULL,
    opted_in BOOLEAN NOT NULL,

    PRIMARY KEY (tracking_id, feature_id),

    CONSTRAINT fk_feature_tracking
        FOREIGN KEY (tracking_id)
        REFERENCES tcf_data_tracking(id)
        ON DELETE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


    */
    /* 
        Map these values to the right variables & insert them into the database
        "tcfData": {
        "tcString": {
            "version": 2,
            "created": 17713445878,
            "lastUpdated": 17713445878,
            "cmpId": 1,
            "cmpVersion": 1,
            "consentScreen": 0,
            "consentLanguage": "EN",
            "vendorListVersion": 1,
            "tcfPolicyVersion": 2,
            "isServiceSpecific": false,
            "useNonStandardStacks": false,
            "specialFeatureOptIns": "000000000000",
            "purposes": [
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true,
                true
            ],
            "maxVendorId": 24,
            "vendors": [
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                false
            ]
        },
        "vendors": [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false
        ],
        "purposeConsents": [
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true
        ],
        "cmpId": 1,
        "cmpVersion": 1,
        "consentScreen": 0,
        "consentLanguage": "EN",
        "vendorListVersion": 1,
        "tcfPolicyVersion": 2,
        "isServiceSpecific": false,
        "useNonStandardStacks": false,
        "specialFeatureOptIns": "000000000000"
    }
    */
    $cmpId = $tcfData->tcString->cmpId;
    $cmpVersion = $tcfData->tcString->cmpVersion;
    $consentLanguage = $tcfData->tcString->consentLanguage;
    $consentScreen = $tcfData->tcString->consentScreen;
    $isServiceSpecific = $tcfData->tcString->isServiceSpecific ? 1 : 0;
    $tcfPolicyVersion = $tcfData->tcString->tcfPolicyVersion;
    $useNonStandardStacks = $tcfData->tcString->useNonStandardStacks ? 1 : 0;
    $vendorListVersion = $tcfData->tcString->vendorListVersion;
    $tcVersion = $tcfData->tcfPolicyVersion;
    $tcCreated = $tcfData->tcString->created;
    $tcLastUpdated = $tcfData->tcString->lastUpdated;
    $tcString = json_encode($tcfData->tcString);
    $purposeId = $tcfData->purposeConsents[0] ? 1 : 0;
    $vendorId = $tcfData->vendors[0] ? 1 : 0;
    $featureId = $tcfData->specialFeatureOptIns[0];
    $optedIn = $tcfData->specialFeatureOptIns[0] ? 1 : 0;
    $consentGiven = $tcfData->purposeConsents[0] ? 1 : 0;

    // Id from tcf_data_tracking table
    $trackingId = "SELECT id FROM tcf_data_tracking WHERE domain = '$domain' AND uid = '$uid' LIMIT 1";
    $trackingId_query = mysqli_query($db, $trackingId);
    $trackingId_row = mysqli_fetch_assoc($trackingId_query);
    $trackingId = $trackingId_row['id'] ?? 1;

    $tcfSql = "INSERT INTO tcf_data_tracking (`domain`, `uid`, `cmp_id`, `cmp_version`, `consent_language`, `consent_screen`, `is_service_specific`, `tcf_policy_version`, `use_non_standard_stacks`, `vendor_list_version`, `tc_version`, `tc_created`, `tc_last_updated`, `tc_string`) VALUES ('$domain', '$uid', '$cmpId', '$cmpVersion', '$consentLanguage', '$consentScreen', '$isServiceSpecific', '$tcfPolicyVersion', '$useNonStandardStacks', '$vendorListVersion', '$tcVersion', '$tcCreated', '$tcLastUpdated', '$tcString')
    ON DUPLICATE KEY UPDATE
        `cmp_version` = VALUES(`cmp_version`),
        `consent_language` = VALUES(`consent_language`),
        `consent_screen` = VALUES(`consent_screen`),
        `is_service_specific` = VALUES(`is_service_specific`),
        `tcf_policy_version` = VALUES(`tcf_policy_version`),
        `use_non_standard_stacks` = VALUES(`use_non_standard_stacks`),
        `vendor_list_version` = VALUES(`vendor_list_version`),
        `tc_version` = VALUES(`tc_version`),
        `tc_created` = VALUES(`tc_created`),
        `tc_last_updated` = VALUES(`tc_last_updated`),
        `tc_string` = VALUES(`tc_string`)";
    $tcfPurposeConsentsSql = "INSERT INTO tcf_purpose_consents(`tracking_id`, `purpose_id`, `consent_given`) VALUES('$trackingId', '$purposeId', '$consentGiven') ON DUPLICATE KEY UPDATE `consent_given` = VALUES(`consent_given`)";
    $tcfVendorConsentsSql = "INSERT INTO tcf_vendor_consents(`tracking_id`, `vendor_id`, `consent_given`) VALUES('$trackingId', '$vendorId', '$consentGiven') ON DUPLICATE KEY UPDATE `consent_given` = VALUES(`consent_given`)";
    $tcfSpecialFeatureOptinsSql = "INSERT INTO tcf_special_feature_optins(`tracking_id`, `feature_id`, `opted_in`) VALUES('$trackingId', '$featureId', '$optedIn') ON DUPLICATE KEY UPDATE `opted_in` = VALUES(`opted_in`)";

    $tcfQuery = mysqli_query($db, $tcfSql);
    $tcfPurposeConsentsQuery = mysqli_query($db, $tcfPurposeConsentsSql);
    $tcfVendorConsentsQuery = mysqli_query($db, $tcfVendorConsentsSql);
    $tcfSpecialFeatureOptinsQuery = mysqli_query($db, $tcfSpecialFeatureOptinsSql);

    /* if (!$tcfQuery || !$tcfPurposeConsentsQuery || !$tcfVendorConsentsQuery || !$tcfSpecialFeatureOptinsQuery) {
        http_response_code(500);
        return;
    } */
}


try {
    $liveData = "INSERT INTO live_data(`domain`, `useragent`, `consentsGiving`, `country`, `countryCode`, `region`, `consent`, `uid`, `timestamp`) VALUES('$domain', '$userAgent', '$consentsGiving', '$country', '$countryCode', '$region', '$consent', '$uid', '$timestamp')";
    $liveData_query = mysqli_query($db, $liveData);
    //$liveData_query2 = mysqli_query($backUpDb, $liveData);

    if (!$liveData_query && $consent_giving != 1) {
        echo mysqli_error($db);
        http_response_code(500);
        return;
    }
} catch (Exception $e) {
    echo $e->getMessage();
}

if ($consent_giving == 1 ) {
    $sql2 = "INSERT INTO cookiebanner_tracking_settings(`type`, `value`, domain, country, countryCode, region, consentsGiving, screenSize, new_datetime_column, time_to_decision, is_suspected_bot, bot_reason) VALUES('$type', '$value', '$domain', '$country', '$countryCode', '$region', '$consentsGiving', '$screen', '$timestamp', '$timeToDecision', $isSuspectedBot, $botReasonSql)";
    $query2 = mysqli_query($db, $sql2);
    //$query2BackUp = mysqli_query($backUpDb, $sql2);

    echo mysqli_error($db);
    
    if (!$query2) {
        http_response_code(500);
        // echo mysqli_error($db);
        return;
    } else {
        http_response_code(201);
        // echo "success";
        return;
    }
}
    