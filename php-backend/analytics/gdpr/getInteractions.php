<?php

header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, *");
header("Content-Type: application/json; charset=UTF-8");
require("../../functions/Authentication.php");
/* ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
ini_set('display_errors', 1); */
// Credentials live in db-config.php next to this file on the server — never
// in git. See php-backend/db-config.example.php.
$dbConfig = require __DIR__ . "/db-config.php";
$db = mysqli_connect($dbConfig["host"], $dbConfig["username"], $dbConfig["password"], $dbConfig["dbname"]);
$domains = $_SERVER["HTTP_DOMAINS"];
$domainsArray = [];
$organisation = $_SERVER["HTTP_ORGANISATION"];
$fromDate = $_SERVER["HTTP_FROMDATE"];
$toDate = $_SERVER["HTTP_TODATE"];

$body = json_decode(file_get_contents('php://input'), true);
$workspaceId = (int)($body['workspaceId'] ?? 0);

if ($workspaceId > 0 && $domains == "combined view") {
    $sql = "SELECT * FROM workspace_domains WHERE workspace_id = $workspaceId";
    $query = mysqli_query($db, $sql);
    $row = $query->fetch_assoc();
    $domains = $row['domain'];
    $domainsArray = explode(',', $domains);
    $domains = implode(',', $domainsArray);
}

/**
 * Comparison window for KPIs + dailyNum.previousPeriod (chronological: $compareStart <= $compareEnd).
 * Optional headers (send from client when compare mode is on):
 *   X-Compare-Start: YYYY-MM-DD
 *   X-Compare-End:   YYYY-MM-DD
 * If omitted, defaults to the same number of calendar days as the primary range, immediately before FromDate.
 */
$compareStart = null;
$compareEnd = null;
if (!empty($_SERVER["HTTP_X_COMPARE_START"]) && !empty($_SERVER["HTTP_X_COMPARE_END"])) {
    $compareStart = date("Y-m-d", strtotime($_SERVER["HTTP_X_COMPARE_START"]));
    $compareEnd = date("Y-m-d", strtotime($_SERVER["HTTP_X_COMPARE_END"]));
} elseif (!empty($fromDate) && !empty($toDate) && $fromDate !== "null" && $toDate !== "null") {
    $f = strtotime(date("Y-m-d", strtotime($fromDate)));
    $t = strtotime(date("Y-m-d", strtotime($toDate)));
    if ($f !== false && $t !== false) {
        $inclusiveDays = (int) floor(($t - $f) / 86400) + 1;
        $compareEnd = date("Y-m-d", strtotime("-1 day", $f));
        $compareStart = date("Y-m-d", strtotime("-" . $inclusiveDays . " days", strtotime($compareEnd)));
    }
}
// Legacy names used below in SQL: previousPeriod2 = range start, previousPeriod = range end (inclusive dates)
$previousPeriod2 = $compareStart;
$previousPeriod = $compareEnd;

$total = 0;

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

// Appended wherever $whereClause / $andClause / $previousAndClause are (re)set
// below, so every count honours it. Unqualified on purpose: the column exists
// on both cookiebanner_tracking_settings and user_consents_tracking (the
// active-users query rewrites these clauses for the latter).
$botFilter = botFilterSql($_SERVER["HTTP_EXCLUDEBOTS"] ?? null);
$whereClause = "WHERE `type` != ''" . $botFilter;
$andClause = $botFilter;
$num_per_day = [];
$bannerStyle = "";
/**
 * Today view helper: turn an hourly-grouped SELECT into enriched buckets
 * with both raw counts AND per-hour percentages for each consent category.
 *
 * The SQL string MUST expose these aliases:
 *   h            -> int hour 0..23
 *   num_per_day  -> total rows in that hour (kept named for symmetry with
 *                   the multi-day path so downstream consumers don't care)
 *   accepted, declined, marketing, functional, statics -> conditional
 *                   aggregates from the same set of rows
 *
 * The optional $compareHourly map ([hour => count]) yields a per-bucket
 * `previousPeriod` block aligned by hour, mirroring the multi-day shape
 * that widget.js' summarizeDailySeries() already understands.
 *
 * Output shape preserves the existing `dailyNum` contract (`date`, `num`,
 * optional `previousPeriod.num`) and adds extra fields that hourly-aware
 * UIs can opt into (hour, num_accepted, accepted%, ...).
 */
function buildHourlyBuckets($db, $sql, $dayYmd, $compareHourly = []) {
    $res = mysqli_query($db, $sql);
    if (!$res) return [];

    $pct = function ($n, $d) {
        if ((int) $d <= 0) return null;
        $v = (float) $n / (float) $d * 100.0;
        return ($v > 0 && $v < 0.1) ? round($v, 2) : round($v, 1);
    };

    $out = [];
    while ($r = mysqli_fetch_assoc($res)) {
        $hour       = (int) $r["h"];
        $total      = (int) ($r["num_per_day"] ?? 0);
        $accepted   = (int) ($r["accepted"]    ?? 0);
        $declined   = (int) ($r["declined"]    ?? 0);
        $marketing  = (int) ($r["marketing"]   ?? 0);
        $functional = (int) ($r["functional"]  ?? 0);
        $statics    = (int) ($r["statics"]     ?? 0);

        $bucket = [
            "date"           => $dayYmd . sprintf(" %02d:00:00", $hour),
            "hour"           => $hour,
            "num"            => $total,
            "num_accepted"   => $accepted,
            "num_declined"   => $declined,
            "num_marketing"  => $marketing,
            "num_functional" => $functional,
            "num_statics"    => $statics,
            "accepted"       => $pct($accepted, $total),
            "declined"       => $pct($declined, $total),
            "marketing"      => $pct($marketing, $total),
            "functional"     => $pct($functional, $total),
            "statics"        => $pct($statics, $total),
        ];

        if (!empty($compareHourly)) {
            $prevCount = array_key_exists($hour, $compareHourly) ? (int) $compareHourly[$hour] : 0;
            $bucket["previousPeriod"] = [
                "date" => sprintf("%02d:00", $hour),
                "num"  => $prevCount,
            ];
        }

        $out[] = $bucket;
    }
    return $out;
}

/**
 * Run a "SELECT HOUR(...) AS h, COUNT(*) AS c ..." compare query and return
 * a [hour => count] map suitable for buildHourlyBuckets().
 */
function fetchCompareHourly($db, $sql) {
    $res = mysqli_query($db, $sql);
    if (!$res) return [];
    $out = [];
    while ($r = mysqli_fetch_assoc($res)) {
        $out[(int) $r["h"]] = (int) $r["c"];
    }
    return $out;
}

if ($domains != "combined view") {

    $sql = "SELECT installtime FROM cookiebanner_tracking WHERE domain = '" . $domains . "'";

    $query = mysqli_query($db, $sql);
    $row = $query->fetch_assoc();

    $installedTime = date(
        "Y-m-d",
        strtotime($fromDate)
    );

    $whereClause = "WHERE domain='" . $domains . "' AND `type` != '' AND DATE(consentsGiving) >= $installedTime" . $botFilter;
    /* $andClause .= "AND domain = '" . $domains . "'"; */

    $fromDate = $installedTime;
}

if (isset($_SERVER["HTTP_FROMDATE"]) && isset($_SERVER["HTTP_TODATE"])) {
    if ($fromDate != "null" || $toDate != "null") {
        if ($fromDate == $toDate) {
            $fromDate = date("Y-m-d", strtotime($fromDate));
            // I want to get the data for a single day only and get the range from 00:00 to 23:59
            $toDate = date("Y-m-d", strtotime($toDate . "+0 days"));
            $andClause .= " AND  DATE(consentsGiving) = '$fromDate'";
        } else {
            $fromDate = date("Y-m-d", strtotime($fromDate));
            $toDate = date("Y-m-d H:i:s", strtotime($toDate . "+1 days"));
            $andClause .= " AND  CAST(consentsGiving AS DATETIME) >= '$fromDate' AND CAST(consentsGiving AS DATETIME) <= '$toDate'";
            $fromDate = date("Y-m-d", strtotime($fromDate));
            $toDate = date("Y-m-d", strtotime($toDate . "-1 days"));
        }
    }
}

if($workspaceId > 0){
    $sql = "SELECT * FROM workspace_domains WHERE workspace_id = $workspaceId";
    $query = mysqli_query($db, $sql);
    $row = $query->fetch_assoc();
    $domains = $row['domain'];
    $domainsArray = explode(',', $domains);
    $domains = implode(',', $domainsArray);
    $andClause = " AND domain IN ($domains)" . $botFilter;
    $whereClause = " AND cookiebanner_tracking_settings.domain IN ($domains)" . $botFilter;
    
    $hourlyTodaySql = "SELECT
        HOUR(cookiebanner_tracking_settings.consentsGiving) AS h,
        COUNT(*) AS num_per_day,
        SUM(CASE WHEN `type` = 'all'        AND `value` = '1'        THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN `type` = 'all'        AND `value` = 'declined' THEN 1 ELSE 0 END) AS declined,
        SUM(CASE WHEN `type` = 'marketing'  AND `value` = '1'        THEN 1 ELSE 0 END) AS marketing,
        SUM(CASE WHEN `type` = 'functional' AND `value` = '1'        THEN 1 ELSE 0 END) AS functional,
        SUM(CASE WHEN `type` = 'statics'    AND `value` = '1'        THEN 1 ELSE 0 END) AS statics
    FROM cookiebanner_tracking_settings
    INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
    " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause . "
    GROUP BY HOUR(cookiebanner_tracking_settings.consentsGiving)
    ORDER BY HOUR(cookiebanner_tracking_settings.consentsGiving) ASC";
    $totalSettingsQuery = mysqli_query($db, $hourlyTodaySql);
    $num = mysqli_num_rows($totalSettingsQuery);
    while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
        $total += $row["num_per_day"];
        if (!in_array($row["domain"], $domainsArray)) {
            array_push($domainsArray, $row["domain"]);
        }
    }
}

if ($organisation != 1 && $workspaceId == 0 && $domains == "combined view") {
    if ($fromDate == $toDate) {
        /*
         * TODAY view (single-day): group by HOUR with conditional aggregates
         * so each hourly bucket carries both raw counts and per-category
         * percentages. Replaces the old `num_per_hour` query whose alias
         * mismatch ($row["num_per_day"]) silently zeroed `$total` and forced
         * the response into the 0%-everything fallback at the bottom.
         */
        $hourlyTodaySql = "SELECT
                HOUR(cookiebanner_tracking_settings.consentsGiving) AS h,
                COUNT(*) AS num_per_day,
                SUM(CASE WHEN `type` = 'all'        AND `value` = '1'        THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN `type` = 'all'        AND `value` = 'declined' THEN 1 ELSE 0 END) AS declined,
                SUM(CASE WHEN `type` = 'marketing'  AND `value` = '1'        THEN 1 ELSE 0 END) AS marketing,
                SUM(CASE WHEN `type` = 'functional' AND `value` = '1'        THEN 1 ELSE 0 END) AS functional,
                SUM(CASE WHEN `type` = 'statics'    AND `value` = '1'        THEN 1 ELSE 0 END) AS statics
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause . "
            GROUP BY HOUR(cookiebanner_tracking_settings.consentsGiving)
            ORDER BY HOUR(cookiebanner_tracking_settings.consentsGiving) ASC";

        // Today vs Yesterday hourly compare (only when a compare window is given)
        $compareHourly = [];
        if (!empty($compareStart) && !empty($compareEnd)) {
            $cs = mysqli_real_escape_string($db, $compareStart);
            $ce = mysqli_real_escape_string($db, $compareEnd);
            $compareHourlySql = "SELECT HOUR(cookiebanner_tracking_settings.consentsGiving) AS h, COUNT(*) AS c
                FROM cookiebanner_tracking_settings
                INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
                " . $whereClause . " AND organisation_domains.org_id = '$organisation'
                AND DATE(cookiebanner_tracking_settings.consentsGiving) >= '$cs'
                AND DATE(cookiebanner_tracking_settings.consentsGiving) <= '$ce'
                GROUP BY HOUR(cookiebanner_tracking_settings.consentsGiving)";
            $compareHourly = fetchCompareHourly($db, $compareHourlySql);
        }

        $num_per_day = buildHourlyBuckets($db, $hourlyTodaySql, $fromDate, $compareHourly);
        foreach ($num_per_day as $b) {
            $total += (int) $b["num"];
        }

        // Domain list still drives the IN(...) filter further down. Fetch
        // it separately since the hourly aggregate doesn't carry domains.
        $domainListSql = "SELECT DISTINCT cookiebanner_tracking_settings.domain AS d
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause;
        $domainListRes = mysqli_query($db, $domainListSql);
        if ($domainListRes) {
            while ($d = mysqli_fetch_assoc($domainListRes)) {
                if (!empty($d["d"]) && !in_array($d["d"], $domainsArray)) {
                    $domainsArray[] = $d["d"];
                }
            }
        }
    } else {
        $totalQuery = "SELECT *, COUNT(*) AS num_per_day, 
            DATE(consentsGiving) AS consentsGiving
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause . " GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
        $totalSettingsQuery = mysqli_query($db, $totalQuery);

    if ($fromDate != $toDate && !empty($compareStart) && !empty($compareEnd)) {
        $compareDaily = [];
        $c1 = mysqli_real_escape_string($db, $compareStart);
        $c2 = mysqli_real_escape_string($db, $compareEnd);
        $cmpDates = " AND DATE(cookiebanner_tracking_settings.consentsGiving) >= '$c1' AND DATE(cookiebanner_tracking_settings.consentsGiving) <= '$c2' ";
        $compareGroupSql = "SELECT DATE(cookiebanner_tracking_settings.consentsGiving) AS d, COUNT(*) AS c
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . $cmpDates . " AND organisation_domains.org_id = '$organisation'
            GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving)";
        $compareGroupRes = mysqli_query($db, $compareGroupSql);
        if ($compareGroupRes) {
            while ($cr = mysqli_fetch_assoc($compareGroupRes)) {
                $compareDaily[$cr["d"]] = (int) $cr["c"];
            }
        }
        $primaryStartTs = strtotime(date("Y-m-d", strtotime($fromDate)));
        $compareStartTs = strtotime($compareStart);
        $offsetSec = ($primaryStartTs !== false && $compareStartTs !== false) ? ($compareStartTs - $primaryStartTs) : 0;

        while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
            $total += $row["num_per_day"];
            if (!in_array($row["domain"], $domainsArray)) {
                array_push($domainsArray, $row["domain"]);
            }
            $pDay = date("Y-m-d", strtotime($row["consentsGiving"]));
            $aligned = date("Y-m-d", strtotime($pDay) + $offsetSec);
            $num2 = isset($compareDaily[$aligned]) ? $compareDaily[$aligned] : 0;
            array_push($num_per_day, [
                "date" => $row["consentsGiving"],
                "num" => (int) $row["num_per_day"],
                "previousPeriod" => [
                    "date" => $aligned,
                    "num" => (int) $num2,
                ],
            ]);
        }
    } else {
        while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
            $total += $row["num_per_day"];
            if (!in_array($row["domain"], $domainsArray)) {
                array_push($domainsArray, $row["domain"]);
            }

            $days = "30";
            $fromDate30 = date("Y-m-d", strtotime("-" . $days . " days", strtotime($fromDate)));
            $toDate30 = date("Y-m-d", strtotime("-" . $days . " days", strtotime($toDate)));

            $andClause2 = " AND CAST(consentsGiving AS DATETIME) >= '$fromDate' AND CAST(consentsGiving AS DATETIME) <= '$toDate'";

            if ($domains !== "combined view") {
                $getQuery = "SELECT *, COUNT(*) AS num_per_day2,
                DATE(consentsGiving) AS consentsGiving2
                FROM cookiebanner_tracking_settings
                " . $whereClause . $andClause2 . "
                GROUP BY DATE(consentsGiving) ORDER BY consentsGiving ASC";
            } else {
                $getQuery = "SELECT *, COUNT(*) AS num_per_day2,
                DATE(consentsGiving) AS consentsGiving2
                FROM cookiebanner_tracking_settings
                INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
                " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause2 . "
                GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
            }

            $totalSettingsQuery2 = mysqli_query($db, $getQuery);
            $num = mysqli_num_rows($totalSettingsQuery2);
            while ($row2 = mysqli_fetch_assoc($totalSettingsQuery2)) {
                $consent = $row2["consentsGiving2"];
                $num_per_day2 = $row2["num_per_day2"];
                array_push($num_per_day, [
                    "date" => $row["consentsGiving"],
                    "num" => (int) $row["num_per_day"],
                    "previousPeriod" => [
                        "date" => $consent,
                        "num" => (int) $num_per_day2,
                    ],
                ]);
            }
        }
    }
    } /* end multi-day else for branch 1 */
} else if ($organisation == 1 &&  $workspaceId == 0 && $domains == "combined view") {

    $sql = "SELECT * FROM cookiebanner_tracking WHERE domain != '' AND domain  NOT LIKE '%localhost%' ORDER BY id DESC";
    $totalDomains = mysqli_query($db, $sql);
    $numRows = mysqli_num_rows($totalDomains);

    while ($row = mysqli_fetch_assoc($totalDomains)) {
        if (!in_array($row["domain"], $domainsArray)) {
            array_push($domainsArray, $row["domain"]);
        }
    }

    if ($fromDate == $toDate) {
        /*
         * TODAY view (admin combined view): hourly buckets with conditional
         * aggregates and per-hour percentages. See branch 1 for the full
         * rationale; this branch differs only in the absence of the
         * organisation_domains JOIN since admins see everything.
         */
        $hourlyTodaySql = "SELECT
                HOUR(consentsGiving) AS h,
                COUNT(*) AS num_per_day,
                SUM(CASE WHEN `type` = 'all'        AND `value` = '1'        THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN `type` = 'all'        AND `value` = 'declined' THEN 1 ELSE 0 END) AS declined,
                SUM(CASE WHEN `type` = 'marketing'  AND `value` = '1'        THEN 1 ELSE 0 END) AS marketing,
                SUM(CASE WHEN `type` = 'functional' AND `value` = '1'        THEN 1 ELSE 0 END) AS functional,
                SUM(CASE WHEN `type` = 'statics'    AND `value` = '1'        THEN 1 ELSE 0 END) AS statics
            FROM cookiebanner_tracking_settings
            " . $whereClause . " " . $andClause . "
            GROUP BY HOUR(consentsGiving)
            ORDER BY HOUR(consentsGiving) ASC";

        $compareHourly = [];
        if (!empty($compareStart) && !empty($compareEnd)) {
            $cs = mysqli_real_escape_string($db, $compareStart);
            $ce = mysqli_real_escape_string($db, $compareEnd);
            $compareHourlySql = "SELECT HOUR(consentsGiving) AS h, COUNT(*) AS c
                FROM cookiebanner_tracking_settings
                " . $whereClause . "
                AND DATE(consentsGiving) >= '$cs' AND DATE(consentsGiving) <= '$ce'
                GROUP BY HOUR(consentsGiving)";
            $compareHourly = fetchCompareHourly($db, $compareHourlySql);
        }

        $num_per_day = buildHourlyBuckets($db, $hourlyTodaySql, $fromDate, $compareHourly);
        foreach ($num_per_day as $b) {
            $total += (int) $b["num"];
        }
    } else {
        $totalQuery = "SELECT *, COUNT(*) AS num_per_day FROM cookiebanner_tracking_settings "
            . $whereClause . $andClause
            . " GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";

    $totalSettingsQuery = mysqli_query($db, $totalQuery);

    if ($fromDate != $toDate && !empty($compareStart) && !empty($compareEnd)) {
        $compareDaily = [];
        $c1 = mysqli_real_escape_string($db, $compareStart);
        $c2 = mysqli_real_escape_string($db, $compareEnd);
        $cmpDates = " AND DATE(cookiebanner_tracking_settings.consentsGiving) >= '$c1' AND DATE(cookiebanner_tracking_settings.consentsGiving) <= '$c2' ";
        $compareGroupSql = "SELECT DATE(cookiebanner_tracking_settings.consentsGiving) AS d, COUNT(*) AS c
            FROM cookiebanner_tracking_settings
            " . $whereClause . $cmpDates . "
            GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving)";
        $compareGroupRes = mysqli_query($db, $compareGroupSql);
        if ($compareGroupRes) {
            while ($cr = mysqli_fetch_assoc($compareGroupRes)) {
                $compareDaily[$cr["d"]] = (int) $cr["c"];
            }
        }
        $primaryStartTs = strtotime(date("Y-m-d", strtotime($fromDate)));
        $compareStartTs = strtotime($compareStart);
        $offsetSec = ($primaryStartTs !== false && $compareStartTs !== false) ? ($compareStartTs - $primaryStartTs) : 0;

        while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
            $total += $row["num_per_day"];
            $pDay = date("Y-m-d", strtotime($row["consentsGiving"]));
            $aligned = date("Y-m-d", strtotime($pDay) + $offsetSec);
            $num2 = isset($compareDaily[$aligned]) ? $compareDaily[$aligned] : 0;
            array_push($num_per_day, [
                "date" => $row["consentsGiving"],
                "num" => (int) $row["num_per_day"],
                "previousPeriod" => [
                    "date" => $aligned,
                    "num" => (int) $num2,
                ],
            ]);
        }
    } else {
        while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
            $total += $row["num_per_day"];

            $days = "30";
            $fromDate30 = date("Y-m-d", strtotime("-" . $days . " days", strtotime($fromDate)));
            $toDate30 = date("Y-m-d", strtotime("-" . $days . " days", strtotime($toDate)));

            $andClause2 = " AND CAST(consentsGiving AS DATE) >= '$fromDate30' AND CAST(consentsGiving AS DATE) <= '$toDate30'";
            $getQuery = "SELECT *, COUNT(*) AS num_per_day2, 
            DATE(consentsGiving) AS consentsGiving2
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . " " . $andClause2 . " AND organisation_domains.org_id = '$organisation' GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";

            $totalSettingsQuery2 = mysqli_query($db, $getQuery);
            $num = mysqli_num_rows($totalSettingsQuery2);

            if ($num > 0) {
                while ($row2 = mysqli_fetch_assoc($totalSettingsQuery2)) {
                    $consent = $row2["consentsGiving2"];
                    $num_per_day2 = $row2["num_per_day2"];
                    array_push($num_per_day, [
                        "date" => $row["consentsGiving"],
                        "num" => (int) $row["num_per_day"],
                        "previousPeriod" => [
                            "date" => $consent,
                            "num" => (int) $num_per_day2,
                        ],
                    ]);
                }
            } else {
                array_push($num_per_day, [
                    "date" => $row["consentsGiving"],
                    "num" => (int) $row["num_per_day"],
                    "previousPeriod" => [
                        "date" => null,
                        "num" => 0,
                    ],
                ]);
            }
        }
    }
    } /* end multi-day else for branch 2 */
} else {

    if ($fromDate == $toDate) {
        // Fetch data for a single day, grouped by hours
        $totalQuery = "SELECT *, COUNT(*) AS num_per_day, 
            HOUR(consentsGiving) AS consentsGiving
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause . " GROUP BY HOUR(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
    } else {
        if ($domains == "combined view") {
            $totalQuery = "SELECT *, COUNT(*) AS num_per_day, 
            DATE(consentsGiving) AS consentsGiving
            FROM cookiebanner_tracking_settings
            INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
            " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause . " GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
        } else {

            $andClause = str_replace("AND domain =", "domain =", $andClause);
            $totalQuery = "SELECT *, COUNT(*) AS num_per_day, 
            DATE(consentsGiving) AS consentsGiving
            FROM cookiebanner_tracking_settings
            " . $whereClause . "  " . $andClause . " GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
        }
    }
    $totalSettingsQuery = mysqli_query($db, $totalQuery);

    if ($domains != "combined view") {
        $sql = "SELECT * FROM cookiebanner_tracking WHERE domain != '' AND domain  NOT LIKE '%localhost%' AND domain = '" . $domains . "' ORDER BY id DESC";
    } else {
        $sql = "SELECT * FROM cookiebanner_tracking WHERE domain != '' AND domain  NOT LIKE '%localhost%' ORDER BY id DESC";
    }
    $totalDomains = mysqli_query($db, $sql);
    $numRows = mysqli_num_rows($totalDomains);

    while ($row = mysqli_fetch_assoc($totalDomains)) {
        if (!in_array($row["domain"], $domainsArray)) {
            array_push($domainsArray, $row["domain"]);
        }
    }
    $screenSize = [];

    $bannerStyleQuery = "SELECT * FROM banner_style WHERE domain != '' AND domain  NOT LIKE '%localhost%'
        AND domain NOT LIKE '%vercel%' AND domain NOT LIKE '%0.0%' AND domain NOT LIKE '%appspot%' AND domain IN ('" . implode("','", $domainsArray) . "') ORDER BY timestamp DESC LIMIT 1";
    $bannerStyleResult = mysqli_query($db, $bannerStyleQuery);

    if ($bannerStyleResult) {
        while ($row = mysqli_fetch_assoc($bannerStyleResult)) {
            $bannerStyle .= $row["design"];
        }
    }

    if ($fromDate == $toDate) {
        /*
         * TODAY view (domain-specific OR filtered combined). Group by HOUR
         * with conditional aggregates so the dashboard can plot an hourly
         * progression with per-category percentages. We DON'T touch the
         * downstream while loops; we just bypass them by wrapping them in
         * the corresponding multi-day else.
         */
        if ($organisation == 1) {
            $hourlyFromJoin   = "FROM cookiebanner_tracking_settings";
            $hourlyOrgFilter  = "";
        } else {
            $hourlyFromJoin   = "FROM cookiebanner_tracking_settings
                INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain";
            $hourlyOrgFilter  = " AND organisation_domains.org_id = '$organisation'";
        }
        $hourlyTodaySql = "SELECT
                HOUR(cookiebanner_tracking_settings.consentsGiving) AS h,
                COUNT(*) AS num_per_day,
                SUM(CASE WHEN `type` = 'all'        AND `value` = '1'        THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN `type` = 'all'        AND `value` = 'declined' THEN 1 ELSE 0 END) AS declined,
                SUM(CASE WHEN `type` = 'marketing'  AND `value` = '1'        THEN 1 ELSE 0 END) AS marketing,
                SUM(CASE WHEN `type` = 'functional' AND `value` = '1'        THEN 1 ELSE 0 END) AS functional,
                SUM(CASE WHEN `type` = 'statics'    AND `value` = '1'        THEN 1 ELSE 0 END) AS statics
            " . $hourlyFromJoin . "
            " . $whereClause . $hourlyOrgFilter . " " . $andClause . "
            GROUP BY HOUR(cookiebanner_tracking_settings.consentsGiving)
            ORDER BY HOUR(cookiebanner_tracking_settings.consentsGiving) ASC";

        $compareHourly = [];
        if (!empty($compareStart) && !empty($compareEnd)) {
            $cs = mysqli_real_escape_string($db, $compareStart);
            $ce = mysqli_real_escape_string($db, $compareEnd);
            $compareHourlySql = "SELECT HOUR(cookiebanner_tracking_settings.consentsGiving) AS h, COUNT(*) AS c
                " . $hourlyFromJoin . "
                " . $whereClause . $hourlyOrgFilter . "
                AND DATE(cookiebanner_tracking_settings.consentsGiving) >= '$cs'
                AND DATE(cookiebanner_tracking_settings.consentsGiving) <= '$ce'
                GROUP BY HOUR(cookiebanner_tracking_settings.consentsGiving)";
            $compareHourly = fetchCompareHourly($db, $compareHourlySql);
        }

        $num_per_day = buildHourlyBuckets($db, $hourlyTodaySql, $fromDate, $compareHourly);
        foreach ($num_per_day as $b) {
            $total += (int) $b["num"];
        }
    } else {
        if ($organisation == 1) {
            $totalQuery = "SELECT *, COUNT(*) AS num_per_day, COUNT(screenSize) AS screenSize
                FROM cookiebanner_tracking_settings
                " . $whereClause . $andClause . "
                GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving)
                ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
        } else {
            $totalQuery = "SELECT *, COUNT(*) AS num_per_day, COUNT(screenSize) AS screenSize
                FROM cookiebanner_tracking_settings
                INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
                " . $whereClause . $andClause . " AND organisation_domains.org_id = '$organisation'
                GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving)
                ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
        }

    $totalSettingsQuery = mysqli_query($db, $totalQuery);

    // Multi-day range: align each primary day with the parallel day inside the compare window (same index offset).
    if ($fromDate != $toDate && !empty($compareStart) && !empty($compareEnd)) {
        $compareDaily = [];
        $c1 = mysqli_real_escape_string($db, $compareStart);
        $c2 = mysqli_real_escape_string($db, $compareEnd);
        $cmpDates = " AND DATE(cookiebanner_tracking_settings.consentsGiving) >= '$c1' AND DATE(cookiebanner_tracking_settings.consentsGiving) <= '$c2' ";
        if ($organisation == 1) {
            $compareGroupSql = "SELECT DATE(cookiebanner_tracking_settings.consentsGiving) AS d, COUNT(*) AS c
                FROM cookiebanner_tracking_settings
                " . $whereClause . $cmpDates . "
                GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving)";
        } else {
            $compareGroupSql = "SELECT DATE(cookiebanner_tracking_settings.consentsGiving) AS d, COUNT(*) AS c
                FROM cookiebanner_tracking_settings
                INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
                " . $whereClause . $cmpDates . " AND organisation_domains.org_id = '$organisation'
                GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving)";
        }
        $compareGroupRes = mysqli_query($db, $compareGroupSql);
        if ($compareGroupRes) {
            while ($cr = mysqli_fetch_assoc($compareGroupRes)) {
                $compareDaily[$cr["d"]] = (int) $cr["c"];
            }
        }
        $primaryStartTs = strtotime(date("Y-m-d", strtotime($fromDate)));
        $compareStartTs = strtotime($compareStart);
        $offsetSec = ($primaryStartTs !== false && $compareStartTs !== false) ? ($compareStartTs - $primaryStartTs) : 0;

        while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
            $total += $row["num_per_day"];
            array_push($screenSize, $row["screenSize"]);
            $pDay = date("Y-m-d", strtotime($row["consentsGiving"]));
            $aligned = date("Y-m-d", strtotime($pDay) + $offsetSec);
            $num2 = isset($compareDaily[$aligned]) ? $compareDaily[$aligned] : 0;
            array_push($num_per_day, [
                "date" => $row["consentsGiving"],
                "num" => (int) $row["num_per_day"],
                "previousPeriod" => [
                    "date" => $aligned,
                    "num" => (int) $num2,
                ],
            ]);
        }
    } else {
        while ($row = mysqli_fetch_assoc($totalSettingsQuery)) {
            $total += $row["num_per_day"];

            array_push($screenSize, $row["screenSize"]);

            $days = "30";
            $fromDate30 = date("Y-m-d", strtotime("-" . $days . " days", strtotime($fromDate)));
            $toDate30 = date("Y-m-d", strtotime("-" . $days . " days", strtotime($toDate)));

            $andClause2 = " AND  CAST(consentsGiving AS DATETIME) >= '$fromDate' AND CAST(consentsGiving AS DATETIME) <= '$toDate'";
            if ($domains !== "combined view") {
                $getQuery = "SELECT *, COUNT(*) AS num_per_day2, 
                DATE(consentsGiving) AS consentsGiving2
                FROM cookiebanner_tracking_settings
                " . $whereClause . $andClause2 . "
                GROUP BY DATE(consentsGiving) ORDER BY consentsGiving ASC";
            } else {
                $getQuery = "SELECT *, COUNT(*) AS num_per_day2, 
                DATE(consentsGiving) AS consentsGiving2
                FROM cookiebanner_tracking_settings
                INNER JOIN organisation_domains ON cookiebanner_tracking_settings.domain = organisation_domains.domain
                " . $whereClause . " AND organisation_domains.org_id = '$organisation' " . $andClause2 . "
                GROUP BY DATE(cookiebanner_tracking_settings.consentsGiving) ORDER BY cookiebanner_tracking_settings.consentsGiving ASC";
            }

            $totalSettingsQuery2 = mysqli_query($db, $getQuery);
            $num = mysqli_num_rows($totalSettingsQuery2);
            while ($row2 = mysqli_fetch_assoc($totalSettingsQuery2)) {
                $consent = $row2["consentsGiving2"];
                $num_per_day2 = $row2["num_per_day2"];
                array_push($num_per_day, [
                    "date" => $row["consentsGiving"],
                    "num" => (int) $row["num_per_day"],
                    "previousPeriod" => [
                        "date" => $consent,
                        "num" => (int) $num_per_day2,
                    ],
                ]);
            }
        }
    }
    } /* end multi-day else for branch 3 */
}

if (count($domainsArray) > 0) {
    $andClause .= " AND domain IN ('" . implode("','", $domainsArray) . "')";
}

// EU countries with names
$euCountries = [
    'AT' => 'Austria',
    'BE' => 'Belgium',
    'BG' => 'Bulgaria',
    'HR' => 'Croatia',
    'CY' => 'Cyprus',
    'CZ' => 'Czech Republic',
    'DK' => 'Denmark',
    'EE' => 'Estonia',
    'FI' => 'Finland',
    'FR' => 'France',
    'DE' => 'Germany',
    'GR' => 'Greece',
    'HU' => 'Hungary',
    'IE' => 'Ireland',
    'IT' => 'Italy',
    'LV' => 'Latvia',
    'LT' => 'Lithuania',
    'LU' => 'Luxembourg',
    'MT' => 'Malta',
    'NL' => 'Netherlands',
    'PL' => 'Poland',
    'PT' => 'Portugal',
    'RO' => 'Romania',
    'SK' => 'Slovakia',
    'SI' => 'Slovenia',
    'ES' => 'Spain',
    'SE' => 'Sweden',
    'GB' => 'United Kingdom'
];

$euCountryNames = array_map(function ($name) {
    return addslashes($name);
}, array_values($euCountries));
$euCountryNamesList = "'" . implode("','", $euCountryNames) . "'";

$getFullNumber = "SELECT * FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . "";
$getFullNumberQuery = mysqli_query($db, $getFullNumber);
$allTotal = mysqli_num_rows($getFullNumberQuery);

// Active users: uid lives on user_consents_tracking; consent (LONGTEXT) + consents_timestamp align with banner scope
$activeUsers = 0;
$userConsentsWhere = str_replace(
    ["`type` != ''", "consentsGiving"],
    ["(TRIM(COALESCE(`consent`, '')) <> '')", "consents_timestamp"],
    $whereClause
);
$userConsentsAnd = str_replace("consentsGiving", "consents_timestamp", $andClause);
$activeUsersSql =
    "SELECT COUNT(DISTINCT `uid`) AS active_users FROM `user_consents_tracking` "
    . $userConsentsWhere
    . " "
    . $userConsentsAnd
    . " AND `uid` IS NOT NULL AND TRIM(CAST(`uid` AS CHAR)) <> ''";
$activeUsersQuery = mysqli_query($db, $activeUsersSql);
if ($activeUsersQuery) {
    $activeUsersRow = mysqli_fetch_assoc($activeUsersQuery);
    $activeUsers = (int) ($activeUsersRow["active_users"] ?? 0);
}

/* $country = "SELECT *, count(country) AS 'count', count(region) AS 'regionCount' FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " GROUP BY country ORDER BY country";
$countryQuery = mysqli_query($db, $country);
$countryNum = mysqli_num_rows($countryQuery); */

$euAccepted = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = '1' AND country IN ('" . implode("','", $euCountryNames) . "') " . $andClause . "";
$euAcceptedQuery = mysqli_query($db, $euAccepted);
$euAcceptedNum = mysqli_num_rows($euAcceptedQuery);

$noneEUAccepted = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = '1' AND country NOT IN ('" . implode("','", $euCountryNames) . "') " . $andClause . "";
$noneEUAcceptedQuery = mysqli_query($db, $noneEUAccepted);
$noneEUAcceptedNum = mysqli_num_rows($noneEUAcceptedQuery);

$settings = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = 'declined' " . $andClause . "";
$declineSettingsQuery = mysqli_query($db, $settings);

$accepts = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = '1' " . $andClause . "";

$acceptsQuery = mysqli_query($db, $accepts);

$marketing = "SELECT * FROM cookiebanner_tracking_settings WHERE `type` = 'marketing' AND `value` = '1' " . $andClause . "";

$marketingSettingsQuery = mysqli_query($db, $marketing);

$functional = "SELECT * FROM cookiebanner_tracking_settings WHERE `type` = 'functional' AND `value` = '1' " . $andClause . "";
$functionalSettingsQuery = mysqli_query($db, $functional);

$statics = "SELECT * FROM cookiebanner_tracking_settings WHERE `type` = 'statics' AND `value` = '1' " . $andClause . "";
$staticsSettingsQuery = mysqli_query($db, $statics);


// Previous period: use comparison window only (NOT $andClause which has current-period dates)
if (!empty($compareStart) && !empty($compareEnd)) {
    $cs = mysqli_real_escape_string($db, $compareStart);
    $ce = mysqli_real_escape_string($db, $compareEnd);
    $previousAndClause = " AND DATE(consentsGiving) >= '$cs' AND DATE(consentsGiving) <= '$ce'";
} else {
    $previousAndClause = " AND 1=0";
}
$previousAndClause .= $botFilter;
// Preserve domain IN filter for combined view if present in $andClause
if (strpos($andClause, 'domain IN') !== false) {
    $previousAndClause .= preg_replace('/.*( AND domain IN \([^)]+\)).*/s', '$1', $andClause);
}

// Optional opaque flag from client (e.g. compare mode / span hint)
$compareRange = isset($_SERVER["HTTP_X_COMPARE_RANGE"]) ? $_SERVER["HTTP_X_COMPARE_RANGE"] : null;

$previousAllTotal = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = '1' " . $previousAndClause . "";
$previousAllTotalQuery = mysqli_query($db, $previousAllTotal);
$previousAllTotal = mysqli_num_rows($previousAllTotalQuery);


$previousAccepts = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = '1' " . $previousAndClause . "";
$previousDeclineSettings = "SELECT * FROM cookiebanner_tracking_settings WHERE `type`='all' AND `value` = 'declined' " . $previousAndClause . "";
$previousMarketing = "SELECT * FROM cookiebanner_tracking_settings WHERE `type` = 'marketing' AND `value` = '1' " . $previousAndClause . "";
$previousFunctional = "SELECT * FROM cookiebanner_tracking_settings WHERE `type` = 'functional' AND `value` = '1' " . $previousAndClause . "";
$previousStatics = "SELECT * FROM cookiebanner_tracking_settings WHERE `type` = 'statics' AND `value` = '1' " . $previousAndClause . "";

$previousAcceptsQuery = mysqli_query($db, $previousAccepts);
$previousDeclineSettingsQuery = mysqli_query($db, $previousDeclineSettings);
$previousMarketingSettingsQuery = mysqli_query($db, $previousMarketing);
$previousFunctionalSettingsQuery = mysqli_query($db, $previousFunctional);
$previousStaticsSettingsQuery = mysqli_query($db, $previousStatics);

if ($acceptsQuery && $declineSettingsQuery) {
    $accepted = mysqli_num_rows($acceptsQuery);
    $declined = mysqli_num_rows($declineSettingsQuery);
    $marketingNum = mysqli_num_rows($marketingSettingsQuery);
    $functionalNum = mysqli_num_rows($functionalSettingsQuery);
    $staticsNum = mysqli_num_rows($staticsSettingsQuery);

    $previousAccepted = mysqli_num_rows($previousAcceptsQuery);
    $previousDeclined = mysqli_num_rows($previousDeclineSettingsQuery);
    $previousMarketingNum = mysqli_num_rows($previousMarketingSettingsQuery);
    $previousFunctionalNum = mysqli_num_rows($previousFunctionalSettingsQuery);
    $previousStaticsNum = mysqli_num_rows($previousStaticsSettingsQuery);

    $totalNumber = $total;
    
    if ($totalNumber > 0) {
        $num2 = mysqli_num_rows($acceptsQuery);
        /* $countryArr = [];
        $regionArr = [];

        while ($row = mysqli_fetch_assoc($countryQuery)) {
            if (!empty($row["country"])) {
                $country = $row["country"];
            } else {
                $country = "";
            }

            if (!empty($row["region"])) {
                $region = $row["region"];
            } else {
                $region = "";
            }

            $sqlAll = "SELECT *, count(country) AS 'countryCountAccpet' FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . " AND `type`='all' AND `value` = 1 GROUP BY country ORDER BY country";
            $sqlDeclined = "SELECT *, count(country) AS 'countryCountDecline' FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . " AND `type`='all' AND `value` = 'declined' GROUP BY country ORDER BY country";
            $sqlStatics = "SELECT *, count(country) AS 'countryCountStatics' FROM cookiebanner_tracking_settings WHERE  country = '$country' " . $andClause . "  AND `type` = 'statics' AND `value` = 1 GROUP BY country ORDER BY country";
            $sqlFunctional = "SELECT *, count(country) AS 'countryCountFunctional'FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . "  AND `type` = 'functional' AND `value` = 1 GROUP BY country ORDER BY country";
            $sqlMarketing = "SELECT *, count(country) AS 'countryCountMarketing' FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . " AND `type` = 'marketing' AND `value` = 1 GROUP BY country ORDER BY country";

            $sqlAllRegion = "SELECT *, count(region) AS 'regionCountAccpet' FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . " AND `type`='all' AND `value` = 1 GROUP BY country ORDER BY country";
            $sqlDeclinedRegion = "SELECT *, count(region) AS 'regionCountDecline' FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . " AND `type`='all' AND `value` = 'declined' GROUP BY country ORDER BY country";
            $sqlStaticsRegion = "SELECT *, count(region) AS 'regionCountStatics' FROM cookiebanner_tracking_settings WHERE  country = '$country' " . $andClause . "  AND `type` = 'statics' AND `value` = 1 GROUP BY country ORDER BY country";
            $sqlFunctionalRegion = "SELECT *, count(region) AS 'regionCountFunctional'FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . "  AND `type` = 'functional' AND `value` = 1 GROUP BY country ORDER BY country";
            $sqlMarketingRegion = "SELECT *, count(region) AS 'regionCountMarketing' FROM cookiebanner_tracking_settings WHERE country = '$country' " . $andClause . " AND `type` = 'marketing' AND `value` = 1 GROUP BY country ORDER BY country";

            $acceptsQueryByCountry = mysqli_query($db, $sqlAll)->fetch_assoc();
            $declineSettingsQueryByCountry = mysqli_query($db, $sqlDeclined)->fetch_assoc();
            $marketingSettingsQueryByCountry = mysqli_query($db, $sqlMarketing)->fetch_assoc();
            $functionalSettingsQueryByCountry = mysqli_query($db, $sqlFunctional)->fetch_assoc();
            $staticsSettingsQueryByCountry = mysqli_query($db, $sqlStatics)->fetch_assoc();


            $acceptsQueryByRegion = mysqli_query($db, $sqlAllRegion)->fetch_assoc();
            $declineSettingsQueryByRegion = mysqli_query($db, $sqlDeclinedRegion)->fetch_assoc();
            $marketingSettingsQueryByRegion = mysqli_query($db, $sqlMarketingRegion)->fetch_assoc();
            $functionalSettingsQueryByRegion = mysqli_query($db, $sqlFunctionalRegion)->fetch_assoc();
            $staticsSettingsQueryByRegion = mysqli_query($db, $sqlStaticsRegion)->fetch_assoc();

            $earliest = "SELECT MIN(consentsGiving) AS earliest FROM cookiebanner_tracking_settings WHERE consentsGiving NOT LIKE '19%' " . $andClause . "";
            $earliestQuery = mysqli_query($db, $earliest);
            $earliestDate = mysqli_fetch_assoc($earliestQuery);

            $latest = "SELECT MAX(consentsGiving) AS latest FROM cookiebanner_tracking_settings";
            $latestQuery = mysqli_query($db, $latest);
            $latestDate = mysqli_fetch_assoc($latestQuery);

            if (!isset($_SERVER["HTTP_FROMDATE"]) && !isset($_SERVER["HTTP_TODATE"])) {
                $fromDate = $earliestDate["earliest"];
                $toDate = $latestDate["latest"];
            }

            array_push($regionArr, [
                "name" => $row["region"],
                "total" => (float)  round($row["regionCount"], 2),
                "accept" => (float) $acceptsQueryByRegion["regionCountAccpet"],
                "decline" => (float) $declineSettingsQueryByRegion["regionCountDecline"],
                "marketing" => (float) $marketingSettingsQueryByRegion["regionCountMarketing"],
                "functional" => (float) $functionalSettingsQueryByRegion["regionCountFunctional"],
                "statics" => (float) $staticsSettingsQueryByRegion["regionCountStatics"]
            ]);

            array_push($countryArr, [
                "country" => ($row["country"] == "" ? "Unknown" : $row["country"]),
                "region" => $regionArr,
                "num" => [
                    "total" => (float)  round($row["count"], 2),
                    "accept" => (float) $acceptsQueryByCountry["countryCountAccpet"],
                    "decline" => (float) $declineSettingsQueryByCountry["countryCountDecline"],
                    "marketing" => (float) $marketingSettingsQueryByCountry["countryCountMarketing"],
                    "functional" => (float) $functionalSettingsQueryByCountry["countryCountFunctional"],
                    "statics" => (float) $staticsSettingsQueryByCountry["countryCountStatics"]
                ],
                "accepted" => round($acceptsQueryByCountry["countryCountAccpet"] / $row["count"] * 100, 1),
                "declined" => round($declineSettingsQueryByCountry["countryCountDecline"] / $row["count"] * 100, 1),
                "marketing" => round($marketingSettingsQueryByCountry["countryCountMarketing"] / $row["count"] * 100, 1),
                "functional" => round($functionalSettingsQueryByCountry["countryCountFunctional"] / $row["count"] * 100, 1),
                "statics" => round($staticsSettingsQueryByCountry["countryCountStatics"] / $row["count"] * 100, 1)
            ]);
        } */

        // mobile: width 0–767px
        $mobile = "SELECT *, COUNT(screenSize) AS screenSize 
            FROM cookiebanner_tracking_settings 
            WHERE JSON_EXTRACT(screenSize,'$.width') BETWEEN 0 AND 767 
            AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 900"
            . $andClause . " 
            GROUP BY JSON_EXTRACT(screenSize,'$.width')";

        // tablet: width 768–1024px
        $tablet = "SELECT *, COUNT(screenSize) AS screenSize 
            FROM cookiebanner_tracking_settings 
            WHERE JSON_EXTRACT(screenSize,'$.width') BETWEEN 768 AND 1024 
            AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 400
            "
            . $andClause . " 
            GROUP BY JSON_EXTRACT(screenSize,'$.width')";

        // desktop: width >1024px
        $desktop = "SELECT *, COUNT(screenSize) AS screenSize 
            FROM cookiebanner_tracking_settings 
            WHERE JSON_EXTRACT(screenSize,'$.width') > 1024 
            AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 1400"
            . $andClause . " 
            GROUP BY JSON_EXTRACT(screenSize,'$.width')";

        $mobileQuery  = mysqli_query($db, $mobile);
        $tabletQuery  = mysqli_query($db, $tablet);
        $desktopQuery = mysqli_query($db, $desktop);

        $mobileNum = mysqli_num_rows($mobileQuery);
        $tabletNum = mysqli_num_rows($tabletQuery);
        $desktopNum = mysqli_num_rows($desktopQuery);

        $mobileNum = $mobileNum == 0 ? 0 : $mobileNum;
        $tabletNum = $tabletNum == 0 ? 0 : $tabletNum;
        $desktopNum = $desktopNum == 0 ? 0 : $desktopNum;
        $deviceType = [
            "mobile" => $mobileNum,
            "tablet" => $tabletNum,
            "desktop" => $desktopNum
        ];
        $deviceTotal = $mobileNum + $tabletNum + $desktopNum;
        $deviceTypeNum = [
            "mobile" => ($deviceTotal > 0) ? (float) round($mobileNum / $deviceTotal * 100, 1) : 0,
            "tablet" => ($deviceTotal > 0) ? (float) round($tabletNum / $deviceTotal * 100, 1) : 0,
            "desktop" => ($deviceTotal > 0) ? (float) round($desktopNum / $deviceTotal * 100, 1) : 0
        ];

        $euUsersQuery = "SELECT * FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU')";
        $euNoneEUQuery = mysqli_query($db, $euUsersQuery);
        $euNoneEUNum = mysqli_num_rows($euNoneEUQuery);

        $noneEUUsersQuery = "SELECT * FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '')";
        $noneEUQuery = mysqli_query($db, $noneEUUsersQuery);
        $noneEUNum = mysqli_num_rows($noneEUQuery);

        $timeToDecisionQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . "";
        $timeToDecisionQuery = mysqli_query($db, $timeToDecisionQuery);
        $timeToDecision = mysqli_fetch_assoc($timeToDecisionQuery);
        $avgTimeToDecision = $timeToDecision["avg_time_to_decision"];

        $avgTimeToDecisionEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU')";
        $avgTimeToDecisionEUQuery = mysqli_query($db, $avgTimeToDecisionEUQuery);
        $avgTimeToDecisionEU = mysqli_fetch_assoc($avgTimeToDecisionEUQuery);
        $avgTimeToDecisionEU = $avgTimeToDecisionEU["avg_time_to_decision"];

        $avgTimeToDecisionNoneEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '')";
        $avgTimeToDecisionNoneEUQuery = mysqli_query($db, $avgTimeToDecisionNoneEUQuery);
        $avgTimeToDecisionNoneEU = mysqli_fetch_assoc($avgTimeToDecisionNoneEUQuery);
        $avgTimeToDecisionNoneEU = $avgTimeToDecisionNoneEU["avg_time_to_decision"];


        /* 
            medianTimeToDecision
            p75TimeToDecision
            p90TimeToDecision
            countUnder1s
            countOver10s
        */

        $baseFrom = "FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND time_to_decision IS NOT NULL AND time_to_decision > 0";

        // Median (50th): one or two middle rows, then average in seconds
        $medianTimeToDecisionQuery = "
        SELECT AVG(time_to_decision) / 1000 AS median_time_to_decision_seconds
        FROM (
          SELECT time_to_decision,
            ROW_NUMBER() OVER (ORDER BY time_to_decision) AS rn,
            COUNT(*) OVER () AS cnt
          " . $baseFrom . "
        ) t
        WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))
        ";
        
        $medianTimeToDecisionQuery = mysqli_query($db, $medianTimeToDecisionQuery);
        $medianRow = mysqli_fetch_assoc($medianTimeToDecisionQuery);
        $medianTimeToDecision = isset($medianRow['median_time_to_decision_seconds']) ? (float) $medianRow['median_time_to_decision_seconds'] : null;
        
        // P75
        $p75TimeToDecisionQuery = "
        SELECT (time_to_decision / 1000) AS p75_time_to_decision_seconds
        FROM (
          SELECT time_to_decision,
            ROW_NUMBER() OVER (ORDER BY time_to_decision) AS rn,
            COUNT(*) OVER () AS cnt
          " . $baseFrom . "
        ) t
        WHERE rn = CEIL(cnt * 0.75)
        LIMIT 1
        ";
        $p75TimeToDecisionQuery = mysqli_query($db, $p75TimeToDecisionQuery);
        $p75Row = mysqli_fetch_assoc($p75TimeToDecisionQuery);
        $p75TimeToDecision = isset($p75Row['p75_time_to_decision_seconds']) ? (float) $p75Row['p75_time_to_decision_seconds'] : null;
        
        // P90
        $p90TimeToDecisionQuery = "
        SELECT (time_to_decision / 1000) AS p90_time_to_decision_seconds
        FROM (
          SELECT time_to_decision,
            ROW_NUMBER() OVER (ORDER BY time_to_decision) AS rn,
            COUNT(*) OVER () AS cnt
          " . $baseFrom . "
        ) t
        WHERE rn = CEIL(cnt * 0.90)
        LIMIT 1
        ";
        $p90TimeToDecisionQuery = mysqli_query($db, $p90TimeToDecisionQuery);
        $p90Row = mysqli_fetch_assoc($p90TimeToDecisionQuery);
        $p90TimeToDecision = isset($p90Row['p90_time_to_decision_seconds']) ? (float) $p90Row['p90_time_to_decision_seconds'] : null;

        $countUnder1sQuery = "SELECT COUNT(*) AS count FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND time_to_decision < 1";
        $countUnder1sQuery = mysqli_query($db, $countUnder1sQuery);
        $countUnder1s = mysqli_fetch_assoc($countUnder1sQuery);
        $countUnder1s = $countUnder1s["count"] ?? null;

        $countOver10sQuery = "SELECT COUNT(*) AS count FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND time_to_decision > 10";
        $countOver10sQuery = mysqli_query($db, $countOver10sQuery);
        $countOver10s = mysqli_fetch_assoc($countOver10sQuery);
        $countOver10s = $countOver10s["count"] ?? null;

        $baseFrom = "FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause;
        $andTime  = " AND time_to_decision IS NOT NULL AND time_to_decision > 0";
        $euFilter = " AND (country IN ($euCountryNamesList) OR country LIKE 'EU')";
        $noneEUFilter = " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '')";
        
        // ---- Helper: run percentile query and return float or null ----
        function fetchPercentileSeconds($db, $baseFrom, $andTime, $extraFilter, $percentile, $alias) {
            $sql = "SELECT (time_to_decision / 1000) AS {$alias}
        FROM (
          SELECT time_to_decision,
            ROW_NUMBER() OVER (ORDER BY time_to_decision) AS rn,
            COUNT(*) OVER () AS cnt
          " . $baseFrom . $andTime . $extraFilter . "
        ) t
        WHERE rn = CEIL(cnt * " . ((float) $percentile) . ")
        LIMIT 1";
            $res = mysqli_query($db, $sql);
            if (!$res) return null;
            $row = mysqli_fetch_assoc($res);
            return isset($row[$alias]) ? (float) $row[$alias] : null;
        }
        
        function fetchMedianSeconds($db, $baseFrom, $andTime, $extraFilter) {
            $sql = "SELECT AVG(time_to_decision) / 1000 AS median_time_to_decision_seconds
        FROM (
          SELECT time_to_decision,
            ROW_NUMBER() OVER (ORDER BY time_to_decision) AS rn,
            COUNT(*) OVER () AS cnt
          " . $baseFrom . $andTime . $extraFilter . "
        ) t
        WHERE rn IN (FLOOR((cnt + 1) / 2), CEIL((cnt + 1) / 2))";
            $res = mysqli_query($db, $sql);
            if (!$res) return null;
            $row = mysqli_fetch_assoc($res);
            return isset($row['median_time_to_decision_seconds']) ? (float) $row['median_time_to_decision_seconds'] : null;
        }
        
        // ---------- EU: median, p75, p90 (percentiles) ----------
        $medianTimeToDecisionEU = fetchMedianSeconds($db, $baseFrom, $andTime, $euFilter);
        $p75TimeToDecisionEU   = fetchPercentileSeconds($db, $baseFrom, $andTime, $euFilter, 0.75, 'p75_time_to_decision_seconds');
        $p90TimeToDecisionEU    = fetchPercentileSeconds($db, $baseFrom, $andTime, $euFilter, 0.90, 'p90_time_to_decision_seconds');
        
        // ---------- EU: counts (< 1s and > 10s in ms) ----------
        $countUnder1sEUQuery = "SELECT COUNT(*) AS count FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU') AND time_to_decision < 1000";
        $countUnder1sEU = (int) (mysqli_fetch_assoc(mysqli_query($db, $countUnder1sEUQuery))['count'] ?? 0);
        
        $countOver10sEUQuery = "SELECT COUNT(*) AS count FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU') AND time_to_decision > 10000";
        $countOver10sEU = (int) (mysqli_fetch_assoc(mysqli_query($db, $countOver10sEUQuery))['count'] ?? 0);
        
        // ---------- Non-EU: median, p75, p90 (percentiles) ----------
        $medianTimeToDecisionNoneEU = fetchMedianSeconds($db, $baseFrom, $andTime, $noneEUFilter);
        $p75TimeToDecisionNoneEU    = fetchPercentileSeconds($db, $baseFrom, $andTime, $noneEUFilter, 0.75, 'p75_time_to_decision_seconds');
        $p90TimeToDecisionNoneEU    = fetchPercentileSeconds($db, $baseFrom, $andTime, $noneEUFilter, 0.90, 'p90_time_to_decision_seconds');
        
        // ---------- Non-EU: counts (< 1s and > 10s in ms) ----------
        $countUnder1sNoneEUQuery = "SELECT COUNT(*) AS count FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '') AND time_to_decision < 1000";
        $countUnder1sNoneEU = (int) (mysqli_fetch_assoc(mysqli_query($db, $countUnder1sNoneEUQuery))['count'] ?? 0);
        
        $countOver10sNoneEUQuery = "SELECT COUNT(*) AS count FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '') AND time_to_decision > 10000";
        $countOver10sNoneEU = (int) (mysqli_fetch_assoc(mysqli_query($db, $countOver10sNoneEUQuery))['count'] ?? 0);
        
        // ---------- Decision time by screen size (avg only; only rows with time_to_decision) ----------
        $screenBase = $baseFrom . $andTime;
        
        // mobile: width 0–767px
        $decisionTimeByScreenSizeMobileQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND JSON_EXTRACT(screenSize,'$.width') BETWEEN 0 AND 767 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 900";
        $decisionTimeByScreenSizeMobile = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeMobileQuery)))['avg_time_to_decision']) ?  $r['avg_time_to_decision'] : null;
        
        // tablet: width 768–1024px
        $decisionTimeByScreenSizeTabletQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND JSON_EXTRACT(screenSize,'$.width') BETWEEN 768 AND 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 400";
        $decisionTimeByScreenSizeTablet = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeTabletQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // desktop: width >1024px
        $decisionTimeByScreenSizeDesktopQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND JSON_EXTRACT(screenSize,'$.width') > 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 1400";
        $decisionTimeByScreenSizeDesktop = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeDesktopQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // EU desktop
        $decisionTimeByScreenSizeEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU') AND JSON_EXTRACT(screenSize,'$.width') > 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 1400";
        $decisionTimeByScreenSizeEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // non-EU desktop
        $decisionTimeByScreenSizeNoneEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '') AND JSON_EXTRACT(screenSize,'$.width') > 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 1400";
        $decisionTimeByScreenSizeNoneEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeNoneEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // mobile EU
        $decisionTimeByScreenSizeMobileEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU') AND JSON_EXTRACT(screenSize,'$.width') BETWEEN 0 AND 767 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 900";
        $decisionTimeByScreenSizeMobileEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeMobileEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // tablet EU
        $decisionTimeByScreenSizeTabletEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU') AND JSON_EXTRACT(screenSize,'$.width') BETWEEN 768 AND 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 400";
        $decisionTimeByScreenSizeTabletEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeTabletEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // desktop EU
        $decisionTimeByScreenSizeDesktopEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country IN ($euCountryNamesList) OR country LIKE 'EU') AND JSON_EXTRACT(screenSize,'$.width') > 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 1400";
        $decisionTimeByScreenSizeDesktopEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeDesktopEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // mobile non-EU
        $decisionTimeByScreenSizeMobileNoneEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '') AND JSON_EXTRACT(screenSize,'$.width') BETWEEN 0 AND 767 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 900";
        $decisionTimeByScreenSizeMobileNoneEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeMobileNoneEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // tablet non-EU
        $decisionTimeByScreenSizeTabletNoneEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '') AND JSON_EXTRACT(screenSize,'$.width') BETWEEN 768 AND 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 400";
        $decisionTimeByScreenSizeTabletNoneEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeTabletNoneEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;
        
        // desktop non-EU
        $decisionTimeByScreenSizeDesktopNoneEUQuery = "SELECT AVG(time_to_decision) / 1000 AS avg_time_to_decision FROM cookiebanner_tracking_settings " . $whereClause . " " . $andClause . $andTime . " AND (country NOT IN ($euCountryNamesList) AND country NOT LIKE 'EU' AND country != '') AND JSON_EXTRACT(screenSize,'$.width') > 1024 AND JSON_EXTRACT(screenSize,'$.height') BETWEEN 0 AND 1400";
        $decisionTimeByScreenSizeDesktopNoneEU = isset(($r = mysqli_fetch_assoc(mysqli_query($db, $decisionTimeByScreenSizeDesktopNoneEUQuery)))['avg_time_to_decision']) ? $r['avg_time_to_decision'] : null;

        
        // Calculating the change in decision over time - the current time period vs the previous time period
        
        $acceptedChange = $accepted - $previousAccepted;
        $declinedChange = $declined - $previousDeclined;
        $marketingChange = $marketingNum - $previousMarketingNum;
        $functionalChange = $functionalNum - $previousFunctionalNum;
        $staticsChange = $staticsNum - $previousStaticsNum;

        // Change in percentage points: (currentShare - previousShare) where share = metric/total*100
        // Return null when totals are 0
        $previousTotal = $previousAccepted + $previousDeclined;
        $changeRate = function($current, $previous, $currentTotal, $previousTotal) {
            if ((float) $currentTotal == 0 || (float) $previousTotal == 0) return null;
            $currentShare = (float) $current / (float) $currentTotal * 100;
            $previousShare = (float) $previous / (float) $previousTotal * 100;
            return round($currentShare - $previousShare, 1);
        };
        $acceptedChangeRate = $changeRate($accepted, $previousAccepted, $allTotal, $previousTotal);
        $declinedChangeRate = $changeRate($declined, $previousDeclined, $allTotal, $previousTotal);
        $marketingChangeRate = $changeRate($marketingNum, $previousMarketingNum, $allTotal, $previousTotal);
        $functionalChangeRate = $changeRate($functionalNum, $previousFunctionalNum, $allTotal, $previousTotal);
        $staticsChangeRate = $changeRate($staticsNum, $previousStaticsNum, $allTotal, $previousTotal);

        // Relative drop in %: (previousShare - currentShare) / previousShare * 100
        // Positive = share dropped, negative = share increased
        $relativeDrop = function($current, $previous, $currentTotal, $previousTotal) {
            if ((float) $currentTotal == 0 || (float) $previousTotal == 0) return null;
            $currentShare = (float) $current / (float) $currentTotal * 100;
            $previousShare = (float) $previous / (float) $previousTotal * 100;
            if ((float) $previousShare == 0) return null;
            return round((float) ($previousShare - $currentShare) / (float) $previousShare * 100, 1);
        };
        $acceptedRelativeDrop = $relativeDrop($accepted, $previousAccepted, $allTotal, $previousTotal);
        $declinedRelativeDrop = $relativeDrop($declined, $previousDeclined, $allTotal, $previousTotal);
        $marketingRelativeDrop = $relativeDrop($marketingNum, $previousMarketingNum, $allTotal, $previousTotal);
        $functionalRelativeDrop = $relativeDrop($functionalNum, $previousFunctionalNum, $allTotal, $previousTotal);
        $staticsRelativeDrop = $relativeDrop($staticsNum, $previousStaticsNum, $allTotal, $previousTotal);

        // Interaction "rate" helpers from existing row counts (not impressions — see interactions_rate.note)
        $fromTs = strtotime((string) $fromDate);
        $toTs = strtotime((string) $toDate);
        $daysInRange = ($fromTs && $toTs) ? max(1, (int) floor(($toTs - $fromTs) / 86400) + 1) : 1;
        $avgInteractionsPerDay = $daysInRange > 0 ? round((float) $allTotal / (float) $daysInRange, 2) : null;
        // Share of logged events that are an explicit accept or decline on category "all" (may overlap other row types in data model)
        $acceptOrDeclineCount = (float) $accepted + (float) $declined;
        $acceptOrDeclinePercent = ($allTotal > 0)
            ? (($acceptOrDeclineCount / (float) $allTotal * 100 < 0.1)
                ? round($acceptOrDeclineCount / (float) $allTotal * 100, 2)
                : round($acceptOrDeclineCount / (float) $allTotal * 100, 1))
            : null;

        echo json_encode([
            "Domains" => $domains,
            "Total" => (float) $allTotal,
            "activeUsers" => (float) $activeUsers,
            "dailyNum" => $num_per_day,
            /*
             * `granularity` tells the frontend whether `dailyNum` buckets
             * are per-hour (Today view) or per-day. Hourly buckets carry
             * extra fields (hour, num_accepted, accepted % …) so charts can
             * opt into a richer per-hour rendering without breaking the
             * existing { date, num } contract.
             */
            "granularity" => ($fromDate == $toDate) ? "hour" : "day",
            "date" => [
                "from" => $fromDate,
                "to" => $toDate,
                "previousPeriod" => $compareStart,
                "previousPeriod2" => $compareEnd,
            ],
            "bannerStyle" => $bannerStyle,
            "interactions_number" => [
                "accept" => (float) $accepted,
                "decline" => (float) $declined,
                "marketing" => (float) $marketingNum,
                "functional" => (float) $functionalNum,
                "statics" => (float) $staticsNum
            ],
            "interactions_rate" => [
                "avgPerDay" => $avgInteractionsPerDay,
                "daysInRange" => $daysInRange,
                "acceptOrDeclinePercentOfTotal" => $acceptOrDeclinePercent,
                "acceptOrDeclineCount" => (float) $acceptOrDeclineCount,
                "note" => "Accepted/Declined/Marketing/etc. keys above are already % of Total. True interaction/impression rate needs impression or pageview counts stored separately."
            ],
            "relativeDrop" => [
                "accepted" => (float) $acceptedRelativeDrop,
                "declined" => (float) $declinedRelativeDrop,
                "marketing" => (float) $marketingRelativeDrop,
                "functional" => (float) $functionalRelativeDrop,
                "statics" => (float) $staticsRelativeDrop,
            ],
            "euUsers" => $euNoneEUNum,
            "noneEUUsers" => $noneEUNum,
            "euAcceptedRate" => ($allTotal > 0) ? (((float) $euAcceptedNum / (float) $euNoneEUNum * 100 < 0.1) ? round((float) $euAcceptedNum / (float) $euNoneEUNum * 100, 2) : round((float) $euAcceptedNum / (float) $euNoneEUNum * 100, 1)) : null,
            "noneEUAcceptedRate" => ($noneEUNum > 0) ? (((float) $noneEUAcceptedNum / (float) $noneEUNum * 100 < 0.1) ? round((float) $noneEUAcceptedNum / (float) $noneEUNum * 100, 2) : round((float) $noneEUAcceptedNum / (float) $noneEUNum * 100, 1)) : null,
            "Accepted" => ($allTotal > 0) ? (((float) $accepted / (float) $allTotal * 100 < 0.1) ? round((float) $accepted / (float) $allTotal * 100, 2) : round((float) $accepted / (float) $allTotal * 100, 1)) : null,
            "Declined" => ($allTotal > 0) ? (((float) $declined / (float) $allTotal * 100 < 0.1) ? round((float) $declined / (float) $allTotal * 100, 2) : round((float) $declined / (float) $allTotal * 100, 1)) : null,
            "Marketing" => ($allTotal > 0) ? (((float) $marketingNum / (float) $allTotal * 100 < 0.1) ? round((float) $marketingNum / (float) $allTotal * 100, 2) : round((float) $marketingNum / (float) $allTotal * 100, 1)) : null,
            "Functional" => ($allTotal > 0) ? (((float) $functionalNum / (float) $allTotal * 100 < 0.1) ? round((float) $functionalNum / (float) $allTotal * 100, 2) : round((float) $functionalNum / (float) $allTotal * 100, 1)) : null,
            "Statics" => ($allTotal > 0) ? (((float) $staticsNum / (float) $allTotal * 100 < 0.1) ? round((float) $staticsNum / (float) $allTotal * 100, 2) : round((float) $staticsNum / (float) $allTotal * 100, 1)) : null,
            /* "Countries" => $countryArr, */
            "change" => [
                "accepted" => (float) $acceptedChange,
                "declined" => (float) $declinedChange,
                "marketing" => (float) $marketingChange,
                "functional" => (float) $functionalChange,
                "statics" => (float) $staticsChange,
            ],
            "changeRate" => [
                "accepted" => $acceptedChangeRate,
                "declined" => $declinedChangeRate,
                "marketing" => $marketingChangeRate,
                "functional" => $functionalChangeRate,
                "statics" => $staticsChangeRate,
            ],
            "device_type" => [
                "mobile" => $mobileNum ?? null,
                "tablet" => $tabletNum ?? null,
                "desktop" => $desktopNum ?? null,
                "other" => $allTotal - ($mobileNum + $tabletNum + $desktopNum) ?? null,
                "deviceTypeNum" => $deviceTypeNum ?? null
            ],
            "timeToDecision" => [
                "global" => [
                    "count" => (int) $allTotal,
                    "avg" => (float) number_format(round($avgTimeToDecision, 1), 1, ',', ''),
                    "median" => (float) number_format(round($medianTimeToDecision, 1), 1, ',', ''),
                    "p75" => (float) number_format(round($p75TimeToDecision, 1), 1, ',', ''),
                    "p90" => (float) number_format(round($p90TimeToDecision, 1), 1, ',', ''),
                    "countUnder1s" => (int) $countUnder1s,
                    "countOver10s" => (int) $countOver10s,
                    "percentageUnder1s" => ($allTotal > 0) ? (((float) $countUnder1s / (float) $allTotal * 100 < 0.1) ? round((float) $countUnder1s / (float) $allTotal * 100, 2) : round((float) $countUnder1s / (float) $allTotal * 100, 1)) : null,
                    "percentageOver10s" => ($allTotal > 0) ? (((float) $countOver10s / (float) $allTotal * 100 < 0.1) ? round((float) $countOver10s / (float) $allTotal * 100, 2) : round((float) $countOver10s / (float) $allTotal * 100, 1)) : null,
                    "deviceType" => [
                        "mobile" => [
                            "avg" => (float) $decisionTimeByScreenSizeMobile,
                            "median" => (float) $decisionTimeByScreenSizeMobile,
                            "p75" => (float) $decisionTimeByScreenSizeMobile,
                            "p90" => (float) $decisionTimeByScreenSizeMobile,
                        ],
                        "tablet" => [
                            "avg" => (float) $decisionTimeByScreenSizeTablet,
                            "median" => (float) $decisionTimeByScreenSizeTablet,
                            "p75" => (float) $decisionTimeByScreenSizeTablet,
                            "p90" => (float) $decisionTimeByScreenSizeTablet,
                        ],
                        "desktop" => [
                            "avg" => (float) $decisionTimeByScreenSizeDesktop,
                            "median" => (float) $decisionTimeByScreenSizeDesktop,
                            "p75" => (float) $decisionTimeByScreenSizeDesktop,
                            "p90" => (float) $decisionTimeByScreenSizeDesktop,
                        ],
                    ],
                ],
                "eu" => [
                    "count" => (int) $euNoneEUNum,
                    "avg" => (float) number_format(round($avgTimeToDecisionEU, 1), 1, ',', ''),
                    "median" => (float) number_format(round($medianTimeToDecisionEU, 1), 1, ',', ''),
                    "p75" => (float) number_format(round($p75TimeToDecisionEU, 1), 1, ',', ''),
                    "p90" => (float) number_format(round($p90TimeToDecisionEU, 1), 1, ',', ''),
                    "countUnder1s" => (int) $countUnder1sEU,
                    "countOver10s" => (int) $countOver10sEU,
                    "percentageUnder1s" => ($euNoneEUNum > 0) ? (((float) $countUnder1sEU / (float) $euNoneEUNum * 100 < 0.1) ? round((float) $countUnder1sEU / (float) $euNoneEUNum * 100, 2) : round((float) $countUnder1sEU / (float) $euNoneEUNum * 100, 1)) : null,
                    "percentageOver10s" => ($euNoneEUNum > 0) ? (((float) $countOver10sEU / (float) $euNoneEUNum * 100 < 0.1) ? round((float) $countOver10sEU / (float) $euNoneEUNum * 100, 2) : round((float) $countOver10sEU / (float) $euNoneEUNum * 100, 1)) : null,
                    "deviceType" => [
                        "mobile" => [
                            "avg" => (float) number_format(round($decisionTimeByScreenSizeMobileEU, 1), 1, ',', ''),
                            "median" => (float) number_format(round($decisionTimeByScreenSizeMobileEU, 1), 1, ',', ''),
                            "p75" => (float) number_format(round($decisionTimeByScreenSizeMobileEU, 1), 1, ',', ''),
                            "p90" => (float) number_format(round($decisionTimeByScreenSizeMobileEU, 1), 1, ',', ''),
                        ],
                        "tablet" => [
                            "avg" => (float) number_format(round($decisionTimeByScreenSizeTabletEU, 1), 1, ',', ''),
                            "median" => (float) number_format(round($decisionTimeByScreenSizeTabletEU, 1), 1, ',', ''),
                            "p75" => (float) number_format(round($decisionTimeByScreenSizeTabletEU, 1), 1, ',', ''),
                            "p90" => (float) number_format(round($decisionTimeByScreenSizeTabletEU, 1), 1, ',', ''),
                        ],
                        "desktop" => [
                            "avg" => (float) number_format(round($decisionTimeByScreenSizeDesktopEU, 1), 1, ',', ''),
                            "median" => (float) number_format(round($decisionTimeByScreenSizeDesktopEU, 1), 1, ',', ''),
                            "p75" => (float) number_format(round($decisionTimeByScreenSizeDesktopEU, 1), 1, ',', ''),
                            "p90" => (float) number_format(round($decisionTimeByScreenSizeDesktopEU, 1), 1, ',', ''),
                        ],
                    ],
                ],
                "noneEU" => [
                    "count" => (int) $noneEUNum,
                    "avg" =>  (float) number_format(round($avgTimeToDecisionNoneEU, 1), 2, ',', ''),
                    "median" => (float) number_format(round($medianTimeToDecisionNoneEU, 1), 1, ',', ''),
                    "p75" => (float) number_format(round($p75TimeToDecisionNoneEU, 1), 1, ',', ''),
                    "p90" => (float) number_format(round($p90TimeToDecisionNoneEU, 1), 1, ',', ''),
                    "countUnder1s" => (int) $countUnder1sNoneEU,
                    "countOver10s" => (int) $countOver10sNoneEU,
                    "percentageUnder1s" => ($noneEUNum > 0) ? (((float) $countUnder1sNoneEU / (float) $noneEUNum * 100 < 0.1) ? round((float) $countUnder1sNoneEU / (float) $noneEUNum * 100, 2) : round((float) $countUnder1sNoneEU / (float) $noneEUNum * 100, 1)) : null,
                    "percentageOver10s" => ($noneEUNum > 0) ? (((float) $countOver10sNoneEU / (float) $noneEUNum * 100 < 0.1) ? round((float) $countOver10sNoneEU / (float) $noneEUNum * 100, 2) : round((float) $countOver10sNoneEU / (float) $noneEUNum * 100, 1)) : null,
                    "deviceType" => [
                        "mobile" => [
                            "avg" => (float) number_format(round($decisionTimeByScreenSizeMobileNoneEU, 1), 1, ',', ''),
                            "median" => (float) number_format(round($decisionTimeByScreenSizeMobileNoneEU, 1), 1, ',', ''),
                            "p75" => (float) number_format(round($decisionTimeByScreenSizeMobileNoneEU, 1), 1, ',', ''),
                            "p90" => (float) number_format(round($decisionTimeByScreenSizeMobileNoneEU, 1), 1, ',', ''),
                        ],
                        "tablet" => [
                            "avg" => (float) number_format(round($decisionTimeByScreenSizeTabletNoneEU, 1), 1, ',', ''),
                            "median" => (float) number_format(round($decisionTimeByScreenSizeTabletNoneEU, 1), 1, ',', ''),
                            "p75" => (float) number_format(round($decisionTimeByScreenSizeTabletNoneEU, 1), 1, ',', ''),
                            "p90" => (float) number_format(round($decisionTimeByScreenSizeTabletNoneEU, 1), 1, ',', ''),
                        ],
                        "desktop" => [
                            "avg" => (float) number_format(round($decisionTimeByScreenSizeDesktopNoneEU, 1), 1, ',', ''),
                            "median" => (float)  number_format(round($decisionTimeByScreenSizeDesktopNoneEU, 1), 1, ',', ''),
                            "p75" => (float) number_format(round($decisionTimeByScreenSizeDesktopNoneEU, 1), 1, ',', ''),
                            "p90" => (float) number_format(round($decisionTimeByScreenSizeDesktopNoneEU, 1), 1, ',', ''),
                        ],
                    ],
                ],
                "unit" => "seconds"
            ],
            "compareRange" => $compareRange,
            "compareWindow" => [
                "start" => $compareStart,
                "end" => $compareEnd,
            ],
            "comaprison" => [
                "accepted" => $acceptedChangeRate,
                "declined" => $declinedChangeRate,
                "marketing" => $marketingChangeRate,
                "functional" => $functionalChangeRate,
                "statics" => $staticsChangeRate,
                "acceptedRelativeDrop" => $acceptedRelativeDrop,
                "declinedRelativeDrop" => $declinedRelativeDrop,
                "marketingRelativeDrop" => $marketingRelativeDrop,
                "functionalRelativeDrop" => $functionalRelativeDrop,
                "staticsRelativeDrop" => $staticsRelativeDrop,
            ],
        ]);
    } else {


        echo json_encode([
            "Domains" => $domains,
            "Total" => (float) $allTotal,
            "activeUsers" => (float) $activeUsers,
            "dailyNum" => 0,
            "granularity" => ($fromDate == $toDate) ? "hour" : "day",
            "date" => [
                "from" => $fromDate,
                "to" => $toDate,
                "previousPeriod" => $compareStart,
                "previousPeriod2" => $compareEnd,
            ],
            "compareRange" => $compareRange,
            "compareWindow" => [
                "start" => $compareStart,
                "end" => $compareEnd,
            ],
            "bannerStyle" => "",
            "euUsers" => 0,
            "noneEUUsers" => 0,
            "Accepted" => 0,
            "Declined" => 0,
            "Marketing" => 0,
            "Functional" => 0,
            "Statics" => 0,
            "Countries" => [],
            "device_type" => [
                "mobile" => 0,
                "tablet" => 0,
                "desktop" => 0,
                "other" => 0
            ]
        ]);
    }
}
