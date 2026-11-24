<?php
/**
 * JWT auth helpers.
 *
 * Compatible with tokens from Intastellar Accounts (apis.intastellaraccounts.com).
 * Handles:
 *   - Plain JWT:          header.payload.sig  (no outer encoding)
 *   - Outer-encoded JWT:  base64( header.payload.sig )  (Checkcookies.php adds base64_encode)
 *   - Algorithms:         HS256 and HS512 (reads from JWT header)
 *   - Signature encoding: standard single base64url OR double base64url (JWTGenerate quirk)
 */

function getAuthToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!$header && function_exists('apache_request_headers')) {
        $all    = apache_request_headers();
        $header = $all['Authorization'] ?? $all['authorization'] ?? '';
    }

    if (str_starts_with($header, 'Bearer ')) {
        $token = substr($header, 7);
        return $token !== '' ? $token : null;
    }
    return null;
}

function validateToken(string $token): ?object
{
    // JWT_SECRETS: comma-separated, newest first — lets the signing key rotate
    // (old and new both accepted for a while). JWT_SECRET still works alone.
    $secrets = array_values(array_unique(array_filter(array_map('trim', array_merge(
        explode(',', (string)($_ENV['JWT_SECRETS'] ?? getenv('JWT_SECRETS') ?: '')),
        [(string)($_ENV['JWT_SECRET'] ?? getenv('JWT_SECRET') ?: '')]
    )))));

    // Resolve the raw "header.payload.sig" string — try plain first, then base64-decoded
    $raw = null;
    if (substr_count($token, '.') === 2) {
        $raw = $token;                          // Format A: plain JWT
    } else {
        $decoded = base64_decode($token, true);
        if ($decoded !== false && substr_count($decoded, '.') === 2) {
            $raw = $decoded;                    // Format B: outer-base64 wrapped
        }
    }

    if ($raw === null) {
        error_log('[auth] Cannot parse token (not 3-part JWT in any known format)');
        return null;
    }

    $parts = explode('.', $raw, 3);
    [$headerB64, $payloadB64, $sigPart] = $parts;

    // Decode header to read algorithm
    $headerJson = base64_decode(strtr($headerB64, '-_', '+/'));
    $headerObj  = json_decode($headerJson, true);
    $alg        = strtolower($headerObj['alg'] ?? 'hs256');

    // Decode payload
    $payload = json_decode(base64_decode(strtr($payloadB64, '-_', '+/')), false);
    if (!$payload) {
        error_log('[auth] JWT payload JSON decode failed');
        return null;
    }

    // Check expiry
    if (isset($payload->exp) && $payload->exp < time()) {
        error_log('[auth] JWT expired (exp=' . $payload->exp . ', now=' . time() . ')');
        return null;
    }

    // Verify the signature against any configured secret
    if ($secrets) {
        $algo = ($alg === 'hs512') ? 'sha512' : 'sha256';
        $data = $headerB64 . '.' . $payloadB64;
        $valid = false;
        foreach ($secrets as $secret) {
            $hmac = hash_hmac($algo, $data, $secret, true);
            // Standard encoding: base64url(hmac_binary)
            $single = rtrim(strtr(base64_encode($hmac), '+/', '-_'), '=');
            // Double encoding: base64url(base64url(hmac_binary))  — JWTGenerate() quirk
            $double = rtrim(strtr(base64_encode($single), '+/', '-_'), '=');
            if (hash_equals($single, $sigPart) || hash_equals($double, $sigPart)) { $valid = true; break; }
        }
        if (!$valid) {
            error_log('[auth] JWT signature mismatch (alg=' . $algo . ')');
            return null;
        }
    } else {
        error_log('[auth] JWT_SECRET(S) not set — token signatures are NOT verified');
    }

    return $payload;
}
