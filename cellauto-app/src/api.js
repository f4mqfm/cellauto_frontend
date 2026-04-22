/**
 * API kliens – igazodik a repó docs/api-spec.md fájlhoz:
 * - Alap URL: .../api (CELLAUTO_API_BASE), pl. http://cellauto.local/api
 * - POST /login { login, password } → { token, user }
 * - GET /user Bearer
 * - GET /ping (teszt)
 * Szólisták / színek: docs/api-lists-words.md, docs/api-color-lists-colors.md
 * Tábla mentés: docs/api-board-saves.md
 */
(function (global) {
  'use strict';

  var API_BASE = (global.CELLAUTO_API_BASE || '/api').replace(/\/$/, '');
  var TOKEN_KEY = 'cellauto_token';
  var ENTRY_POINT = global.CELLAUTO_ENTRY_POINT || 'www';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function clearToken() {
    setToken(null);
  }

  /** Ha a válasz nem JSON (pl. HTML 404 vagy Laravel hibaoldal), a parse után { _raw: szöveg } marad */
  function nonJsonBodyMessage(raw, status) {
    var isHtml = typeof raw === 'string' && /<!DOCTYPE|<\s*html[\s>]/i.test(raw);
    var parts = [];
    parts.push(
      'A szerver nem JSON-t küldött vissza' +
        (status ? ' (HTTP ' + status + ').' : '.') +
        (isHtml ? ' HTML oldal érkezett' : ' Nem érvényes JSON a törzs.')
    );
    parts.push(
      'Gyakori ok: a /api helyett a statikus index.html érkezik. Fejlesztésben futtasd a routerrel: ' +
        'cd cellauto-app/src && php -S 127.0.0.1:8080 router.php (vagy cellauto-app/router.php a fölötte lévő mappából). ' +
        'Ne használj sima "php -S" router nélkül. Alternatíva: Laravel CORS + CELLAUTO_API_BASE = teljes :8000/api cím.'
    );
    parts.push('Jelenlegi API bázis: ' + API_BASE);
    var preview = String(raw)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    if (preview) parts.push('Válasz eleje: ' + preview + (String(raw).length > 220 ? '…' : ''));
    return parts.join('\n');
  }

  async function apiFetch(method, path, body, useToken) {
    var url = API_BASE + (path.startsWith('/') ? path : '/' + path);
    var headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    var token = useToken !== false ? getToken() : null;
    if (token) headers.Authorization = 'Bearer ' + token;

    var opts = { method: method, headers: headers };
    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      opts.body = JSON.stringify(body);
    }

    var res;
    try {
      res = await fetch(url, opts);
    } catch (netErr) {
      var e = new Error(
        'Nem sikerült elérni az API-t: ' +
          (netErr && netErr.message ? netErr.message : 'ismeretlen hiba') +
          '. Ellenőrizd a CELLAUTO_API_BASE címet és hogy fut-e a backend.'
      );
      e.status = 0;
      e.data = null;
      throw e;
    }

    var text = await res.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { _raw: text };
      }
    }

    if (!res.ok) {
      var msg =
        (data && !data._raw && data.error) ||
        (data && !data._raw && data.message) ||
        (data && !data._raw && data.errors && JSON.stringify(data.errors)) ||
        res.statusText ||
        'API error';
      if (data && data._raw) {
        msg = nonJsonBodyMessage(data._raw, res.status);
      } else if (res.status === 404) {
        msg =
          'API nem található (404). A frontend és az API külön fut? Állítsd be a teljes API címet: ' +
          'a <head>-ben window.CELLAUTO_API_BASE = "http://127.0.0.1:8000/api"; (Laravel címe).';
      }
      if (res.status === 0 || res.type === 'opaque') {
        msg = 'Hálózati hiba vagy CORS. Ellenőrizd az API URL-t és a backend CORS beállítását.';
      }
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;

      // Ha a token érvénytelen (lejárt / törölt), lépjünk ki automatikusan.
      // 403 lehet "valódi" tiltás is (pl. más user listájára), ezért ott NEM törlünk tokent.
      if (res.status === 401 && token) {
        try {
          clearToken();
        } catch (e) {}
        try {
          if (typeof global.CELLAUTO_boardSaveAuthChanged === 'function') global.CELLAUTO_boardSaveAuthChanged();
        } catch (e) {}
        try {
          document.dispatchEvent(new CustomEvent('cellauto:auth-invalid', { detail: { status: res.status, path: path } }));
        } catch (e) {}
      }
      throw err;
    }

    if (data && data._raw) {
      var okErr = new Error(nonJsonBodyMessage(data._raw, res.status));
      okErr.status = res.status;
      okErr.data = data;
      throw okErr;
    }

    return data;
  }

  var TOKEN_KEYS = [
    'token',
    'plainTextToken',
    'access_token',
    'accessToken',
    'bearer_token',
    'api_token',
  ];

  function pickTokenString(obj) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      var k = TOKEN_KEYS[i];
      var v = obj[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  }

  /**
   * Laravel: { token, user } | { data: { token } } | Passport: { access_token }
   */
  function extractToken(data) {
    if (!data || typeof data !== 'object') return null;

    var direct = pickTokenString(data);
    if (direct) return direct;

    if (data.data !== undefined && data.data !== null && typeof data.data === 'object') {
      var inner = pickTokenString(data.data);
      if (inner) return inner;
    }

    return deepFindToken(data, 0);
  }

  function deepFindToken(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) return null;
    var t = pickTokenString(obj);
    if (t) return t;
    for (var key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      var child = obj[key];
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        var found = deepFindToken(child, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function extractUserFromLogin(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.user) return data.user;
    if (data.data && typeof data.data === 'object' && data.data.user) return data.data.user;
    return null;
  }

  async function login(loginField, password) {
    var data = await apiFetch(
      'POST',
      '/login',
      { login: loginField, password: password, entry_point: ENTRY_POINT },
      false
    );
    var tok = extractToken(data);
    if (tok) {
      setToken(tok);
    } else {
      var keys = data && typeof data === 'object' && !data._raw ? Object.keys(data).join(', ') : '';
      var err = new Error(
        'A szerver JSON válaszából nem sikerült tokent kiolvasni. Kulcsok: ' +
          (keys || '(üres)') +
          '. Várható: { "token": "...", "user": { ... } }. Ha a kulcs csak _raw volt, a válasz nem JSON volt (lásd előző hibaüzenet).'
      );
      err.data = data;
      throw err;
    }
    return data;
  }

  async function getUser() {
    return apiFetch('GET', '/user', null, true);
  }

  /** docs/api-spec.md – GET /ping, auth nélkül */
  async function ping() {
    return apiFetch('GET', '/ping', null, false);
  }

  async function logout() {
    return apiFetch('POST', '/logout', { entry_point: ENTRY_POINT }, true);
  }

  async function logVisit(occurredAtIso) {
    var body = { entry_point: ENTRY_POINT };
    if (occurredAtIso) body.occurred_at = occurredAtIso;
    return apiFetch('POST', '/access-logs/visit', body, true);
  }

  async function getLists() {
    return apiFetch('GET', '/lists', null, true);
  }

  async function getPublicLists() {
    var candidates = ['/lists/public', '/public-lists', '/lists?scope=public', '/lists?public=1'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var d = await apiFetch('GET', candidates[i], null, true);
        return unwrapArray(d);
      } catch (e) {
        if (e && (e.status === 404 || e.status === 405)) continue;
      }
    }
    return [];
  }

  async function getList(id) {
    return apiFetch('GET', '/lists/' + id, null, true);
  }

  async function getListWords(id) {
    return apiFetch('GET', '/lists/' + id + '/words', null, true);
  }

  async function getListWordRelations(id) {
    return apiFetch('GET', '/lists/' + id + '/word-relations', null, true);
  }

  async function getListWordGenMessages(id) {
    return apiFetch('GET', '/lists/' + id + '/word-gen-messages', null, true);
  }

  async function getColorLists() {
    return apiFetch('GET', '/color-lists', null, true);
  }

  async function getPublicColorLists() {
    var candidates = ['/color-lists/public', '/public-color-lists', '/color-lists?scope=public', '/color-lists?public=1'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var d = await apiFetch('GET', candidates[i], null, true);
        return unwrapArray(d);
      } catch (e) {
        if (e && (e.status === 404 || e.status === 405)) continue;
      }
    }
    return [];
  }

  async function getColorList(id) {
    return apiFetch('GET', '/color-lists/' + id, null, true);
  }

  /** Laravel Resource / tömb válasz kezelése */
  function unwrapArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  async function getBoardSaveGroups() {
    var d = await apiFetch('GET', '/board-save-groups', null, true);
    return unwrapArray(d);
  }

  async function createBoardSaveGroup(body) {
    return apiFetch('POST', '/board-save-groups', body, true);
  }

  async function getBoardSaveGroup(id) {
    return apiFetch('GET', '/board-save-groups/' + id, null, true);
  }

  async function updateBoardSaveGroup(id, body) {
    return apiFetch('PUT', '/board-save-groups/' + id, body, true);
  }

  async function deleteBoardSaveGroup(id) {
    return apiFetch('DELETE', '/board-save-groups/' + id, null, true);
  }

  async function getBoardSaves(groupId) {
    var d = await apiFetch('GET', '/board-save-groups/' + groupId + '/saves', null, true);
    return unwrapArray(d);
  }

  async function createBoardSave(groupId, body) {
    return apiFetch('POST', '/board-save-groups/' + groupId + '/saves', body, true);
  }

  async function getBoardSave(groupId, saveId) {
    return apiFetch('GET', '/board-save-groups/' + groupId + '/saves/' + saveId, null, true);
  }

  async function updateBoardSave(groupId, saveId, body) {
    return apiFetch('PUT', '/board-save-groups/' + groupId + '/saves/' + saveId, body, true);
  }

  async function deleteBoardSave(groupId, saveId) {
    return apiFetch('DELETE', '/board-save-groups/' + groupId + '/saves/' + saveId, null, true);
  }

  async function getTaskSaveGroups() {
    var candidates = [
      '/task-save-groups?scope=all',
      '/task-save-groups?all=1',
      '/task-save-groups/all',
      '/task-save-groups',
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var d = await apiFetch('GET', candidates[i], null, true);
        return unwrapArray(d);
      } catch (e) {
        if (e && (e.status === 404 || e.status === 405 || e.status === 422)) continue;
        if (i < candidates.length - 1 && e && e.status === 403) continue;
        throw e;
      }
    }
    return [];
  }

  async function createTaskSaveGroup(body) {
    return apiFetch('POST', '/task-save-groups', body, true);
  }

  async function getTaskSaves(groupId) {
    var candidates = [
      '/task-save-groups/' + groupId + '/saves?scope=all',
      '/task-save-groups/' + groupId + '/saves?all=1',
      '/task-save-groups/' + groupId + '/all-saves',
      '/task-save-groups/' + groupId + '/saves',
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var d = await apiFetch('GET', candidates[i], null, true);
        return unwrapArray(d);
      } catch (e) {
        if (e && (e.status === 404 || e.status === 405 || e.status === 422)) continue;
        if (i < candidates.length - 1 && e && e.status === 403) continue;
        throw e;
      }
    }
    return [];
  }

  async function createTaskSave(groupId, body) {
    return apiFetch('POST', '/task-save-groups/' + groupId + '/saves', body, true);
  }

  async function updateTaskSave(groupId, saveId, body) {
    return apiFetch('PUT', '/task-save-groups/' + groupId + '/saves/' + saveId, body, true);
  }

  async function getTaskSave(groupId, saveId) {
    return apiFetch('GET', '/task-save-groups/' + groupId + '/saves/' + saveId, null, true);
  }

  async function getTaskSaveById(saveId) {
    var candidates = ['/task-saves/' + saveId, '/task-save/' + saveId];
    for (var i = 0; i < candidates.length; i++) {
      try {
        return await apiFetch('GET', candidates[i], null, true);
      } catch (e) {
        if (e && (e.status === 404 || e.status === 405)) continue;
        throw e;
      }
    }
    throw new Error('Task mentés nem található.');
  }

  async function getAllTaskSaves() {
    var candidates = [
      '/task-saves?scope=all',
      '/task-saves?all=1',
      '/task-saves',
      '/task-save-groups/all/saves',
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var d = await apiFetch('GET', candidates[i], null, true);
        return unwrapArray(d);
      } catch (e) {
        if (e && (e.status === 404 || e.status === 405 || e.status === 422)) continue;
        if (i < candidates.length - 1 && e && e.status === 403) continue;
        throw e;
      }
    }
    return [];
  }

  /** docs/api-task-saves.md — POST /api/task-saves/{task_save}/evaluations */
  async function createTaskEvaluation(taskSaveId, body) {
    return apiFetch('POST', '/task-saves/' + taskSaveId + '/evaluations', body, true);
  }

  /** docs/api-task-saves.md — PUT /api/task-saves/{task_save}/evaluations/{task_evaluation} */
  async function updateTaskEvaluation(taskSaveId, evaluationId, body) {
    return apiFetch(
      'PUT',
      '/task-saves/' + taskSaveId + '/evaluations/' + evaluationId,
      body,
      true
    );
  }

  global.CELLautoApi = {
    API_BASE: API_BASE,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    apiFetch: apiFetch,
    extractToken: extractToken,
    extractUserFromLogin: extractUserFromLogin,
    login: login,
    getUser: getUser,
    ping: ping,
    logout: logout,
    logVisit: logVisit,
    getLists: getLists,
    getPublicLists: getPublicLists,
    getList: getList,
    getListWords: getListWords,
    getListWordRelations: getListWordRelations,
    getListWordGenMessages: getListWordGenMessages,
    getColorLists: getColorLists,
    getPublicColorLists: getPublicColorLists,
    getColorList: getColorList,
    unwrapArray: unwrapArray,
    getBoardSaveGroups: getBoardSaveGroups,
    createBoardSaveGroup: createBoardSaveGroup,
    getBoardSaveGroup: getBoardSaveGroup,
    updateBoardSaveGroup: updateBoardSaveGroup,
    deleteBoardSaveGroup: deleteBoardSaveGroup,
    getBoardSaves: getBoardSaves,
    createBoardSave: createBoardSave,
    getBoardSave: getBoardSave,
    updateBoardSave: updateBoardSave,
    deleteBoardSave: deleteBoardSave,
    getTaskSaveGroups: getTaskSaveGroups,
    createTaskSaveGroup: createTaskSaveGroup,
    getTaskSaves: getTaskSaves,
    createTaskSave: createTaskSave,
    updateTaskSave: updateTaskSave,
    getTaskSave: getTaskSave,
    getTaskSaveById: getTaskSaveById,
    getAllTaskSaves: getAllTaskSaves,
    createTaskEvaluation: createTaskEvaluation,
    updateTaskEvaluation: updateTaskEvaluation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
