<?php
/**
 * Paginated user consent rows for the dashboard “Consent decisions overview”.
 * Headers: Organisation, Domains, FromDate, ToDate, Offset, Limit, SortOrder (asc|desc, default desc).
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
$sortDir = ($sortRaw === "asc") ? "ASC" : "DESC";

$consent_url = [];

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
        "consent_method" => $row["consent_method"],
    ]);
}


$orderSql = "GROUP BY ucs.consents_timestamp ORDER BY ucs.consents_timestamp, ucs.uid $sortDir";

if ($domains != "combined view") {
    $sql = "SELECT ucs.*, bp.`GitHub-link`, bp.code_version "
        . "FROM user_consents_tracking ucs "
        . "INNER JOIN banner_policies bp ON ucs.banner_policy_id = bp.policy_id "
        . "WHERE ucs.domain = '$domainsEsc' "
        . $andClause
        . " $orderSql "
        . "LIMIT $limit OFFSET $offset";

    $query = mysqli_query($db, $sql);

    if (!$query) {
        echo json_encode(["error" => mysqli_error($db)]);
        exit;
    }

    while ($row = mysqli_fetch_assoc($query)) {
        push_consent_row($consent_url, $row);
    }

    if (count($consent_url) === 0) {
        echo json_encode("Err_No_Data_Found");
    } else {
        echo json_encode($consent_url);
    }
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
        echo json_encode("Err_No_Data_Found");
        exit;
    }

    $inList = implode(",", $domainList);

    $sql = "SELECT ucs.*, bp.`GitHub-link`, bp.code_version FROM user_consents_tracking ucs "
        . "INNER JOIN banner_policies bp ON ucs.banner_policy_id = bp.policy_id "
        . "WHERE ucs.domain IN ($inList) "
        . $andClause
        . " $orderSql "
        . "LIMIT $limit OFFSET $offset";

    $totalSettingsQuery = mysqli_query($db, $sql);

    if (!$totalSettingsQuery) {
        echo json_encode(["error" => mysqli_error($db)]);
        exit;
    }

    while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
        push_consent_row($consent_url, $row);
    }

    if (count($consent_url) === 0) {
        echo json_encode("Err_No_Data_Found");
    } else {
        echo json_encode($consent_url);
    }
}
