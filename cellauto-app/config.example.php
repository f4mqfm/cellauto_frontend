<?php
/**
 * Másold `config.local.php` névre, vagy szerkeszd közvetlenül ezt a fájlt.
 * A router.php innen olvassa: hova továbbítsa az /api/* hívásokat (Laravel gyökér, /api nélkül).
 *
 * Példák (válaszd a műközőt):
 *   'http://192.168.200.19:8000'     — php artisan serve a szerveren (lásd lent)
 *   'http://192.168.200.19'         — nginx/apache 80-as porton
 *   'http://192.168.200.19:443'     — ha külön port (ritka)
 *
 * Ha „Couldn't connect to server” jön:
 *   1) A Laravel gépen fusson és hallgasson a hálózaton, ne csak localhoston:
 *      php artisan serve --host=0.0.0.0 --port=8000
 *   2) Tűzfal: engedélyezd a 8000-at (vagy a használt portot) befelé a szerveren.
 *   3) A gépedről ellenőrizd (ahol a php -S fut):
 *      curl -v http://192.168.200.19:8000/api/ping
 *      Ha ez is elhasal, a proxy sem fog tudni csatlakozni — hálózat / szolgáltatás.
 *   4) Ha nginx mögött van az API (80), állítsd a backend-et http://192.168.200.19 -re (port nélkül).
 */
declare(strict_types=1);

return [
    'backend' => 'http://192.168.200.19:8000',
];
