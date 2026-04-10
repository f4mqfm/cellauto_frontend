<?php
/**
 * Indítsd innen (ahogy eddig a statikus kiszolgálót):
 *   cd cellauto-app/src
 *   php -S 127.0.0.1:8080 router.php
 *
 * A szülő router.php továbbítja az /api/* kéréseket a Laravelhez (php artisan serve, :8000).
 * Ha csak "php -S 127.0.0.1:8080"-at írsz router nélkül, az /api/login az index.html-t adja vissza.
 */
$_SERVER['CELLAUTO_STATIC'] = __DIR__;
return require __DIR__ . '/../router.php';
