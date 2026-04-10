/**
 * Másold `config.js` névre, vagy szerkeszd közvetlenül a `config.js` fájlt.
 *
 * CELLAUTO_API_BASE – hova küldje a böngésző a fetch hívásokat:
 *
 * 1) Proxy (ajánlott): ugyanazon a hoston fut a php -S + router.php, mint az oldal.
 *    Állítsd: '/api'  → pl. http://127.0.0.1:8080/api/login a proxy továbbítja a Laravelhez.
 *
 * 2) Közvetlen LAN / más gép: a Laravel elérhető URL-je + /api
 *    pl. 'http://192.168.200.19/api'  → CORS-nak engedélyeznie kell a böngésző originjét a Laravelben.
 */
(function (w) {
  'use strict';
  w.CELLAUTO_API_BASE = '/api';
})(typeof window !== 'undefined' ? window : globalThis);
