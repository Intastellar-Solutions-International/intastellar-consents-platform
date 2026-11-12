<?php
/**
 * Paginated user consent rows for the dashboard “Consent decisions overview”.
 * Headers: Organisation, Domains, FromDate, ToDate, Offset, Limit, SortOrder (asc|desc, default desc).
 * Audit log filters (all optional, see auditFilterSql()): Country, State, Method,
 * Framework, Choice, Language, Version, Page, UIDSearch.
 * IncludeTotal: 1 returns { rows, total, options, summary } instead of the bare array.
 *
 * Deploy on server only. Prefer env vars for DB credentials (see below).
 */
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, *");
header("Content-Type: application/json; charset=UTF-8");
ini_set("display_startup_errors", 0);
error_reporting(E_ALL);
ini_set("display_errors", 0);

require("../../functions/Authentication.php");

// Credentials live in db-config.php next to this file on the server — never
// in git. See php-backend/db-config.example.php.
$dbConfig = require __DIR__ . "/db-config.php";
$db = mysqli_connect($dbConfig["host"], $dbConfig["username"], $dbConfig["password"], $dbConfig["dbname"]);
if (!$db) {
    http_response_code(500);
    echo json_encode(["error" => "Database connection failed"]);
    exit;
}
mysqli_set_charset($db, "utf8mb4");
$domains = isset($_SERVER["HTTP_DOMAINS"]) ? $_SERVER["HTTP_DOMAINS"] : "";
$fromDate = isset($_SERVER["HTTP_FROMDATE"]) ? $_SERVER["HTTP_FROMDATE"] : null;
$toDate = isset($_SERVER["HTTP_TODATE"]) ? $_SERVER["HTTP_TODATE"] : null;
$organisation = isset($_SERVER["HTTP_ORGANISATION"]) ? $_SERVER["HTTP_ORGANISATION"] : "";
$uid = isset($_SERVER["HTTP_UID"]) ? trim((string) $_SERVER["HTTP_UID"]) : "";

$offset = isset($_SERVER["HTTP_OFFSET"]) ? (int) $_SERVER["HTTP_OFFSET"] : 0;
$offset = max(0, $offset);

$limit = isset($_SERVER["HTTP_LIMIT"]) ? (int) $_SERVER["HTTP_LIMIT"] : 40;
$limit = max(1, min(500, $limit));

$sortRaw = isset($_SERVER["HTTP_SORTORDER"]) ? strtolower(trim($_SERVER["HTTP_SORTORDER"])) : "desc";

$consent_url = [];

/**
 * SQL fragment that leaves out records flagged is_suspected_bot (see
 * suspectedBotReason() in collect.php). On unless the client sends
 * "ExcludeBots: 0" — the dashboard's "Exclude suspected bots" toggle.
 * Requires the columns from php-backend/sql/2026-11-03-suspected-bots.sql.
 */
function botFilterSql($excludeBotsHeader, $column = "is_suspected_bot")
{
    $include = trim((string) $excludeBotsHeader) === "0";
    return $include ? "" : " AND $column = 0";
}

$andClause = "";
if ($fromDate !== null && $toDate !== null) {
    if ($fromDate != "null" && $toDate != "null" && $fromDate !== "" && $toDate !== "") {
        $fd = mysqli_real_escape_string($db, $fromDate);
        $td = mysqli_real_escape_string($db, $toDate);
        $andClause .= " AND ucs.consents_timestamp >= '$fd' AND ucs.consents_timestamp < DATE_ADD('$td', INTERVAL 1 DAY)";
    }
}

/*
 * Optional single-user filter for audit-log investigations.
 * When the client sends header `UID: <value>`, return only records
 * for that visitor within the same domain/date constraints.
 */
if ($uid !== "" && strtolower($uid) !== "null") {
    $uidEsc = mysqli_real_escape_string($db, $uid);
    $andClause .= " AND ucs.uid = '$uidEsc'";
}

/** Escaped LIKE pattern with % and _ taken literally. */
function likeContains($value, callable $escape)
{
    return "'%" . $escape(addcslashes((string) $value, "%_\\")) . "%'";
}

/**
 * Whether a consent row accepted ($accepted) or declined one category. The
 * consent column is the banner's JSON array of { type, checked }; CASE keeps
 * JSON_CONTAINS away from legacy rows that aren't valid JSON.
 */
function consentChoiceSql($type, $accepted)
{
    $has = function ($checked) use ($type) {
        return "JSON_CONTAINS(ucs.consent, '" . json_encode(["type" => $type, "checked" => $checked]) . "')";
    };
    $yes = "(" . $has("checked") . " OR " . $has("1") . " OR " . $has(true) . ")";
    $present = "JSON_CONTAINS(ucs.consent, '" . json_encode(["type" => $type]) . "')";
    $test = $accepted ? $yes : "($present AND NOT $yes)";
    return "(CASE WHEN JSON_VALID(ucs.consent) THEN $test ELSE 0 END)";
}

/**
 * Audit log filters from request headers. Every value is checked against a
 * fixed shape or escaped, so nothing raw reaches the SQL. Returns a string of
 * " AND ..." conditions (empty when no filter applies).
 */
function auditFilterSql(array $f, callable $escape)
{
    $sql = "";
    $country = strtoupper(trim((string) ($f["country"] ?? "")));
    if (preg_match('/^[A-Z]{2}$/', $country)) $sql .= " AND ucs.country_code = '$country'";

    $state = trim((string) ($f["state"] ?? ""));
    if ($state !== "") $sql .= " AND ucs.region = '" . $escape(substr($state, 0, 64)) . "'";

    $method = trim((string) ($f["method"] ?? ""));
    if ($method === "none") $sql .= " AND (ucs.consent_method IS NULL OR ucs.consent_method = '')";
    elseif (preg_match('/^[a-z_]{1,40}$/', $method)) $sql .= " AND ucs.consent_method = '$method'";

    $framework = strtoupper(trim((string) ($f["framework"] ?? "")));
    if ($framework === "NONE") {
        $sql .= " AND (ucs.regulation_applied IS NULL OR ucs.regulation_applied = '')";
    } elseif ($framework === "CPA") {
        // CPA is also part of CCPA and UCPA.
        $sql .= " AND ucs.regulation_applied LIKE '%CPA%' AND ucs.regulation_applied NOT LIKE '%CCPA%' AND ucs.regulation_applied NOT LIKE '%UCPA%'";
    } elseif (preg_match('/^[A-Z0-9]{2,10}$/', $framework)) {
        $sql .= " AND ucs.regulation_applied LIKE '%$framework%'";
    }

    if (preg_match('/^(functional|statics|marketing):(accepted|declined)$/', trim((string) ($f["choice"] ?? "")), $m)) {
        $sql .= " AND " . consentChoiceSql($m[1], $m[2] === "accepted");
    }

    $language = trim((string) ($f["language"] ?? ""));
    if (preg_match('/^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/', $language)) $sql .= " AND ucs.language LIKE '$language%'";

    $version = trim((string) ($f["version"] ?? ""));
    if ($version !== "") $sql .= " AND bp.code_version = '" . $escape(substr($version, 0, 40)) . "'";

    $page = trim((string) ($f["page"] ?? ""));
    if ($page !== "") $sql .= " AND ucs.url LIKE " . likeContains(substr($page, 0, 200), $escape);

    $uidSearch = trim((string) ($f["uidSearch"] ?? ""));
    if ($uidSearch !== "") $sql .= " AND ucs.uid LIKE " . likeContains(substr($uidSearch, 0, 100), $escape);

    return $sql;
}

/**
 * Summary strip from decision counts grouped by method (m), country (c) and
 * UTC day (d): total, count per method, top five countries and count per day.
 */
function summarizeAuditGroups(array $groups)
{
    $total = 0;
    $methods = [];
    $countries = [];
    $daily = [];
    foreach ($groups as $g) {
        $n = (int) ($g["n"] ?? 0);
        $total += $n;
        $method = trim((string) ($g["m"] ?? ""));
        $methods[$method] = ($methods[$method] ?? 0) + $n;
        $country = strtoupper(trim((string) ($g["c"] ?? "")));
        if ($country !== "" && $country !== "-") $countries[$country] = ($countries[$country] ?? 0) + $n;
        $day = (string) ($g["d"] ?? "");
        if ($day !== "") $daily[$day] = ($daily[$day] ?? 0) + $n;
    }
    uksort($countries, function ($a, $b) use ($countries) { return $countries[$b] <=> $countries[$a] ?: strcmp($a, $b); });
    ksort($daily);
    $top = [];
    foreach (array_slice($countries, 0, 5, true) as $code => $n) $top[] = ["code" => $code, "n" => $n];
    return ["total" => $total, "methods" => (object) $methods, "countries" => $top, "otherCountries" => $total - array_sum(array_column($top, "n")), "daily" => (object) $daily];
}

/**
 * Whether the is_suspected_bot / bot_reason columns exist yet
 * (php-backend/sql/2026-11-03-suspected-bots.sql). Until they do, the bot
 * filter and flag are skipped instead of failing every query — this file can
 * be deployed before or after the migration. Checked once per request.
 */
function botColumnsReady($db)
{
    static $ready = null;
    if ($ready !== null) return $ready;
    $ready = true;
    foreach (["cookiebanner_tracking_settings", "user_consents_tracking"] as $table) {
        try {
            $res = mysqli_query($db, "SHOW COLUMNS FROM `$table` LIKE 'is_suspected_bot'");
            if (!$res || mysqli_num_rows($res) === 0) $ready = false;
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}
if (botColumnsReady($db)) {
    $andClause .= botFilterSql($_SERVER["HTTP_EXCLUDEBOTS"] ?? null, "ucs.is_suspected_bot");
}

$escape = function ($v) use ($db) { return mysqli_real_escape_string($db, $v); };
// The dashboard URL-encodes filter values, since headers can't carry non-ASCII text.
$header = function ($name) { return rawurldecode((string) ($_SERVER["HTTP_" . $name] ?? "")); };
$filterClause = auditFilterSql([
    "country" => $header("COUNTRY"),
    "state" => $header("STATE"),
    "method" => $header("METHOD"),
    "framework" => $header("FRAMEWORK"),
    "choice" => $header("CHOICE"),
    "language" => $header("LANGUAGE"),
    "version" => $header("VERSION"),
    "page" => $header("PAGE"),
    "uidSearch" => $header("UIDSEARCH"),
], $escape);
$includeTotal = trim((string) $header("INCLUDETOTAL")) === "1";

$domainsEsc = mysqli_real_escape_string($db, $domains);

function push_consent_row(&$consent_url, $row)
{
    $gh = null;
    if (isset($row["GitHub-link"])) {
        $gh = $row["GitHub-link"];
    } elseif (isset($row["github_link"])) {
        $gh = $row["github_link"];
    }

    $consent = $row["consent"];
    $consent = json_decode($consent);

    array_push($consent_url, [
        "url" => $row["url"],
        "consents_timestamp" => $row["consents_timestamp"],
        "domain" => $row["domain"],
        "referrer" => $row["referrer"],
        "consent" => $consent,
        "uid" => $row["uid"],
        "shopify_consent_id" => $row["shopify_consent_id"],
        "regulation_applied" => $row["regulation_applied"],
        "country_code" => $row["country_code"] ?? "-",
        "state_code" => $row["region"] ?? "-",
        "banner_policy_id" => $row["banner_policy_id"],
        "code_version" => $row["code_version"],
        "language" => $row["language"],
        "github_link" => $gh,
        "transfer_basis" => $row["transfer_basis"],
        "transfer_destination" => $row["transfer_destination"],
        "transfer_data_importer" => $row["transfer_data_importer"],
        "transfer_instrument" => $row["transfer_instrument"],
        "transfer_effective_from" => $row["transfer_effective_from"] ?? null,
        "time_to_decision" => isset($row["time_to_decision"]) ? (int) $row["time_to_decision"] : null,
        "consent_method" => $row["consent_method"],
        "is_suspected_bot" => !empty($row["is_suspected_bot"]),
        "bot_reason" => $row["bot_reason"] ?? null,
    ]);
}


/**
 * One row per decision, newest (or oldest) first. Previously
 * "GROUP BY ucs.consents_timestamp ORDER BY ucs.consents_timestamp, ucs.uid $sortDir":
 * - the direction only applied to uid, so the timestamp always sorted
 *   ascending and every page started at the oldest record in the window;
 * - grouping by timestamp alone merged *different visitors* who decided in
 *   the same second into one row.
 * collect.php is called once per consent category and writes a full
 * user_consents_tracking row each time, so one decision arrives as several
 * identical rows — grouping on (uid, timestamp, consent) collapses exactly
 * those, while distinct visitors and conflicting decisions stay separate.
 */
function consentRowsOrderSql($sortOrder)
{
    $dir = (strtolower(trim((string) $sortOrder)) === "asc") ? "ASC" : "DESC";
    return "GROUP BY ucs.uid, ucs.consents_timestamp, ucs.consent ORDER BY ucs.consents_timestamp $dir, ucs.uid $dir";
}

$orderSql = consentRowsOrderSql($sortRaw);

if ($domains != "combined view") {
    $domainWhere = "ucs.domain = '$domainsEsc'";
} else {
    if ($organisation != 1) {
        $sql = "SELECT * FROM organisation_domains WHERE `org_id` = '" . mysqli_real_escape_string($db, $organisation) . "'";
        $organisationQuery = mysqli_query($db, $sql);
    } else {
        $sql = "SELECT * FROM organisation_domains";
        $organisationQuery = mysqli_query($db, $sql);
    }

    if (!$organisationQuery) {
        echo json_encode(["error" => mysqli_error($db)]);
        exit;
    }

    $domainList = [];
    while ($row = mysqli_fetch_assoc($organisationQuery)) {
        $domainList[] = "'" . mysqli_real_escape_string($db, $row["domain"]) . "'";
    }

    if (count($domainList) === 0) {
        echo json_encode($includeTotal ? ["rows" => [], "total" => 0, "options" => (object) []] : "Err_No_Data_Found");
        exit;
    }

    $domainWhere = "ucs.domain IN (" . implode(",", $domainList) . ")";
}

$from = "FROM user_consents_tracking ucs "
    . "INNER JOIN banner_policies bp ON ucs.banner_policy_id = bp.policy_id "
    . "WHERE $domainWhere ";

$query = mysqli_query($db, "SELECT ucs.*, bp.`GitHub-link`, bp.code_version " . $from . $andClause . $filterClause . " $orderSql LIMIT $limit OFFSET $offset");

if (!$query) {
    echo json_encode(["error" => mysqli_error($db)]);
    exit;
}

while ($row = mysqli_fetch_assoc($query)) {
    push_consent_row($consent_url, $row);
}

if (!$includeTotal) {
    echo json_encode(count($consent_url) === 0 ? "Err_No_Data_Found" : $consent_url);
    exit;
}

// Same grouping as the rows, so totals count decisions, not raw rows. One
// pass gives the total and the summary strip; filters apply to both.
$groups = [];
$groupQuery = mysqli_query($db, "SELECT m, c, d, COUNT(*) AS n FROM (SELECT MIN(ucs.consent_method) AS m, MIN(ucs.country_code) AS c, DATE(MIN(ucs.consents_timestamp)) AS d "
    . $from . $andClause . $filterClause . " GROUP BY ucs.uid, ucs.consents_timestamp, ucs.consent) t GROUP BY m, c, d");
while ($groupQuery && ($row = mysqli_fetch_assoc($groupQuery))) $groups[] = $row;
$summary = summarizeAuditGroups($groups);
$total = $summary["total"];

/*
 * Values seen in the selected period, for the filter menus. Scoped to domain,
 * dates and the bot setting only, so choosing one filter doesn't empty the
 * other menus.
 */
$options = [];
$facets = ["country" => "ucs.country_code", "method" => "ucs.consent_method", "framework" => "ucs.regulation_applied", "language" => "ucs.language", "version" => "bp.code_version"];
foreach ($facets as $key => $column) {
    $options[$key] = [];
    $facetQuery = mysqli_query($db, "SELECT DISTINCT $column AS v " . $from . $andClause . " AND $column IS NOT NULL AND $column <> '' ORDER BY v LIMIT 300");
    while ($facetQuery && ($row = mysqli_fetch_assoc($facetQuery))) $options[$key][] = $row["v"];
}

echo json_encode(["rows" => $consent_url, "total" => $total, "options" => $options, "summary" => $summary]);

