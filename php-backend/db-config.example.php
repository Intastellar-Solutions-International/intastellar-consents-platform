<?php
/**
 * Template for db-config.php, which the consent API files load with
 *   $dbConfig = require __DIR__ . "/db-config.php";
 *
 * Copy this to db-config.php in each server directory that holds those files
 * (analytics/gdpr/ and the directory of collect.php) and fill in the real
 * values there. db-config.php is gitignored — credentials never go in git.
 */
return [
    "host"     => "localhost",
    "username" => "",
    "password" => "",
    "dbname"   => "",
];
