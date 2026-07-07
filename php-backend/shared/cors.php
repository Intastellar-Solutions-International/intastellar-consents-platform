<?php
/**
 * CORS headers — call at the very top of every endpoint before any output.
 */
function sendCorsHeaders(): void
{
    $allowed = [
        'https://www.intastellarconsents.com',
        'https://consentsplatform.com',
        'http://localhost:8080',
        'http://localhost:3000',
    ];

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }

    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Max-Age: 86400');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
