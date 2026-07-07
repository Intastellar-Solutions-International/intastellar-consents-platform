<?php
/**
 * Returns a singleton PDO connection using DB_* environment variables.
 */
function getDb(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $host   = $_ENV['DB_HOST']   ?? getenv('DB_HOST')   ?: 'localhost';
    $name   = $_ENV['DB_NAME']   ?? getenv('DB_NAME')   ?: '';
    $user   = $_ENV['DB_USER']   ?? getenv('DB_USER')   ?: '';
    $pass   = $_ENV['DB_PASS']   ?? getenv('DB_PASS')   ?: '';
    $port   = $_ENV['DB_PORT']   ?? getenv('DB_PORT')   ?: '3306';
    $charset = 'utf8mb4';

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}
