<?php
/**
 * Fejlesztői kiszolgáló: ugyanazon a porton adja a statikus fájlokat és továbbítja az /api/* hívásokat a Laravelhez.
 * Így nincs CORS („Failed to fetch”), mert a böngésző mindig ugyanazt a host:portot látja.
 *
 * Indítás (cellauto-app mappából):
 *   php -S 127.0.0.1:8080 router.php
 *
 * Laravel külön terminálban:
 *   php artisan serve
 * (alapból http://127.0.0.1:8000)
 *
 * Backend URL (Laravel, ahova proxyzunk):
 *   1) config.local.php (saját gép – gitignore)
 *   2) CELLAUTO_BACKEND környezeti változó
 *   3) config.example.php (a repóban: alapból LAN Laravel)
 *   4) http://192.168.200.19:8000
 */

declare(strict_types=1);

function cellauto_router_backend(): string
{
    $local = __DIR__ . '/config.local.php';
    if (is_file($local)) {
        $c = require $local;
        if (is_array($c) && !empty($c['backend'])) {
            return rtrim((string) $c['backend'], '/');
        }
    }
    $env = getenv('CELLAUTO_BACKEND');
    if ($env !== false && $env !== '') {
        return rtrim($env, '/');
    }
    $example = __DIR__ . '/config.example.php';
    if (is_file($example)) {
        $c = require $example;
        if (is_array($c) && !empty($c['backend'])) {
            return rtrim((string) $c['backend'], '/');
        }
    }
    return 'http://192.168.200.19:8000';
}

$backend = cellauto_router_backend();

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// Statikus fájlok gyökere: alapból .../cellauto-app/src (vagy CELLAUTO_STATIC / $_SERVER['CELLAUTO_STATIC'])
$srcDir = getenv('CELLAUTO_STATIC') ?: ($_SERVER['CELLAUTO_STATIC'] ?? null);
if ($srcDir === null || $srcDir === '') {
    $srcDir = __DIR__ . '/src';
} else {
    $srcDir = rtrim((string) $srcDir, '/');
}

// /api és /api/... → Laravel proxy (kötelező, különben az index.html megy vissza)
$isApi =
    $uri === '/api' ||
    strpos($uri, '/api/') === 0;

if ($isApi) {
    if (!function_exists('curl_init')) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'PHP curl kiterjesztés szükséges a proxyhoz.']);
        return true;
    }

    $target = $backend . ($_SERVER['REQUEST_URI'] ?? '/');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    $ch = curl_init($target);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $body = file_get_contents('php://input');
    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $inHeaders = [];
    $hdrs = function_exists('getallheaders') ? getallheaders() : [];
    if ($hdrs === false) {
        $hdrs = [];
    }
    foreach ($hdrs as $k => $v) {
        $lk = strtolower((string) $k);
        if ($lk === 'host' || $lk === 'connection') {
            continue;
        }
        $inHeaders[] = $k . ': ' . $v;
    }

    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($clientIp !== '') {
        $existingXff = '';
        foreach ($hdrs as $k => $v) {
            if (strtolower((string) $k) === 'x-forwarded-for') {
                $existingXff = trim((string) $v);
                break;
            }
        }
        $xffValue = $existingXff !== '' ? ($existingXff . ', ' . $clientIp) : $clientIp;
        $inHeaders[] = 'X-Forwarded-For: ' . $xffValue;
        $inHeaders[] = 'X-Real-IP: ' . $clientIp;
    }

    if (!empty($inHeaders)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $inHeaders);
    }

    $raw = curl_exec($ch);
    $errno = curl_errno($ch);

    if ($errno || $raw === false) {
        http_response_code(502);
        header('Content-Type: application/json; charset=utf-8');
        $err = curl_error($ch);
        curl_close($ch);
        $hint =
            'A proxy a következő backendre küldi az /api hívásokat: ' .
            $backend .
            '. Technikai hiba: ' .
            $err .
            ' — Nem érhető el ez a cím (nincs ott futó Laravel, vagy más port / tűzfal). ' .
            'Állítsd a backend címet: cellauto-app/config.example.php vagy config.local.php (backend kulcs), vagy CELLAUTO_BACKEND=... környezeti változó. ' .
            'A Laravelnek a ' .
            $backend .
            ' címen kell hallgatnia (pl. php artisan serve --host=0.0.0.0 a szerveren).';
        echo json_encode(['error' => $hint], JSON_UNESCAPED_UNICODE);
        return true;
    }

    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $headerBlock = substr($raw, 0, $headerSize);
    $respBody = substr($raw, $headerSize);

    foreach (explode("\r\n", trim($headerBlock)) as $line) {
        if ($line === '' || strpos($line, 'HTTP/') === 0) {
            if (preg_match('/HTTP\/\S+\s+(\d+)/', $line, $m)) {
                http_response_code((int) $m[1]);
            }
            continue;
        }
        $skip = ['transfer-encoding:', 'connection:'];
        $low = strtolower($line);
        foreach ($skip as $s) {
            if (strpos($low, $s) === 0) {
                continue 2;
            }
        }
        header($line, false);
    }

    echo $respBody;
    return true;
}

$mime = [
    'html' => 'text/html',
    'htm' => 'text/html',
    'css' => 'text/css',
    'js' => 'application/javascript',
    'json' => 'application/json',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'svg' => 'image/svg+xml',
    'ico' => 'image/x-icon',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
];

if ($uri === '/' || $uri === '') {
    $file = $srcDir . '/index.html';
    if (is_file($file)) {
        header('Content-Type: text/html; charset=utf-8');
        // Ne legyen elavult HTML a CDN/böngésző cache-ben (max gen, hex opció, stb.)
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        readfile($file);
        return true;
    }
    http_response_code(500);
    echo 'Hiányzik: src/index.html';
    return true;
}

$path = $srcDir . $uri;
if (is_file($path)) {
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $ct = $mime[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $ct . (strpos($ct, 'text/') === 0 || $ct === 'application/javascript' ? '; charset=utf-8' : ''));
    readfile($path);
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo '404';
return true;
