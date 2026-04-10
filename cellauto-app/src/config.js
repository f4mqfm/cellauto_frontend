/**
 * Böngésző API bázis – lásd config.example.js
 * Közvetlen hívás LAN szerverre példa (CORS kell):
 *   window.CELLAUTO_API_BASE = 'http://192.168.200.19/api';
 */
(function (w) {
  'use strict';
  w.CELLAUTO_API_BASE = '/api';
})(typeof window !== 'undefined' ? window : globalThis);
