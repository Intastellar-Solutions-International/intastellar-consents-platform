<?php
/**
 * Tests for the pure logic inside the consent API endpoints.
 *
 * The endpoint files run top to bottom on include (headers, DB connection,
 * output), so they can't simply be required. Like test/tracker-embedded.test.mjs
 * does for api/a.js, this extracts individual functions from the real source
 * and evaluates just those — so the shipped code is what gets tested.
 *
 * Run: php php-backend/tests/run.php   (also run by `npm test`)
 */

$ROOT = dirname(__DIR__);

function load_functions(string $file, array $names): void
{
    $src = file_get_contents($file);
    foreach ($names as $name) {
        if (function_exists($name)) continue;
        if (!preg_match('/\bfunction\s+' . preg_quote($name, '/') . '\s*\(/', $src, $m, PREG_OFFSET_CAPTURE)) {
            throw new RuntimeException("function $name() not found in $file");
        }
        $start = $m[0][1];
        $i = strpos($src, '{', $start);
        $depth = 0;
        $len = strlen($src);
        $inStr = null;
        for (; $i < $len; $i++) {
            $c = $src[$i];
            if ($inStr !== null) {
                if ($c === '\\') { $i++; continue; }
                if ($c === $inStr) $inStr = null;
                continue;
            }
            if ($c === '"' || $c === "'") { $inStr = $c; continue; }
            if ($c === '{') $depth++;
            elseif ($c === '}' && --$depth === 0) { $i++; break; }
        }
        eval(substr($src, $start, $i - $start));
    }
}

$tests = [];
function test(string $name, callable $fn): void { global $tests; $tests[] = [$name, $fn]; }
function eq($actual, $expected, string $msg = ''): void
{
    if ($actual !== $expected) {
        throw new RuntimeException(($msg ? "$msg: " : '') . 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

foreach (glob(__DIR__ . '/*.test.php') as $file) require $file;

$failed = 0;
foreach ($tests as [$name, $fn]) {
    try {
        $fn();
        echo "  ok - $name\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL - $name\n    " . $e->getMessage() . "\n";
    }
}
echo "\n" . (count($tests) - $failed) . "/" . count($tests) . " PHP tests passed\n";
exit($failed ? 1 : 0);
