(function () {
  'use strict';

  var api = window.CELLautoApi;
  if (!api) return;

  var DEFAULT_HEX_COLORS = ['#25ad4f', '#fcf400', '#ee1c25', '#00a4e6', '#b97b55', '#ffc70a'];
  var STORAGE_WORD_LIST = 'cellauto_sel_word_list_id';
  var STORAGE_COLOR_LIST = 'cellauto_sel_color_list_id';
  var VISIT_LOG_THROTTLE_MS = 15000;
  var __lastVisitLogMs = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function setAuthBar(user) {
    var userEl = $('authUser');
    var loginBtn = $('btnLogin');
    var logoutBtn = $('btnLogout');
    window.CELLAUTO_currentUser = user || null;
    if (!userEl || !loginBtn || !logoutBtn) return;

    if (user) {
      var label = user.name || user.username || user.email || '#' + user.id;
      userEl.textContent = 'Bejelentkezve: ' + label;
      userEl.hidden = false;
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
    } else {
      userEl.textContent = '';
      userEl.hidden = true;
      loginBtn.hidden = false;
      logoutBtn.hidden = true;
    }
  }

  function setWordHint(loggedIn) {
    var el = $('wordListHint');
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  }

  function openLoginModal() {
    var bd = $('loginBackdrop');
    var err = $('loginError');
    if (err) err.textContent = '';
    if (bd) bd.classList.add('is-open');
    var inp = $('loginField');
    if (inp) inp.focus();
  }

  function closeLoginModal() {
    var bd = $('loginBackdrop');
    if (bd) bd.classList.remove('is-open');
  }

  function applyDynamicColors(hexList) {
    var src = hexList && hexList.length ? hexList : DEFAULT_HEX_COLORS.slice();
    var padded = [];
    for (var p = 0; p < 6; p++) {
      padded[p] = src[p] || DEFAULT_HEX_COLORS[p];
    }
    window.CELLAUTO_lastPaletteHex = padded.slice();

    var head = document.head;
    var old = document.getElementById('cellauto-dynamic-colors');
    if (old) old.remove();

    var style = document.createElement('style');
    style.id = 'cellauto-dynamic-colors';
    var css = '';
    for (var i = 0; i < 6; i++) {
      css += '.color' + (i + 1) + '{background-color:' + padded[i] + '!important;}\n';
    }
    style.textContent = css;
    head.appendChild(style);

    if (typeof window.CELLAUTO_refreshExamGenPills === 'function') {
      window.CELLAUTO_refreshExamGenPills();
    }
  }

  function clearDynamicColors() {
    var old = document.getElementById('cellauto-dynamic-colors');
    if (old) old.remove();
  }

  function applyGuestColors() {
    clearDynamicColors();
    window.CELLAUTO_lastPaletteHex = DEFAULT_HEX_COLORS.slice();
  }

  function pickSavedListId(lists, storageKey) {
    if (!lists || !lists.length) return null;
    var saved = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch (e) {}
    if (saved) {
      var sid = parseInt(saved, 10);
      if (lists.some(function (l) {
        return l.id === sid;
      })) {
        return sid;
      }
    }
    return lists[0].id;
  }

  function unwrapListArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function mergeUniqueLists(primary, secondary) {
    var out = [];
    var seen = Object.create(null);
    var all = []
      .concat(primary || [])
      .concat(secondary || []);
    all.forEach(function (l) {
      if (!l || typeof l.id !== 'number') return;
      if (seen[l.id]) return;
      seen[l.id] = true;
      out.push(l);
    });
    return out;
  }

  async function loadColorsForListId(colorListId) {
    var full = await api.getColorList(colorListId);
    if (!full || !full.colors || !full.colors.length) return false;
    var sorted = full.colors.slice().sort(function (a, b) {
      if (a.position !== b.position) return a.position - b.position;
      return a.id - b.id;
    });
    var hex = sorted.map(function (c) {
      return c.color;
    });
    while (hex.length < 6) hex.push(DEFAULT_HEX_COLORS[hex.length] || '#888888');
    applyDynamicColors(hex);
    return true;
  }

  function normalizeGenerations(data) {
    if (!data) return [];
    if (Array.isArray(data.generations)) return data.generations;
    if (data.data && Array.isArray(data.data.generations)) return data.data.generations;
    return [];
  }

  async function loadWordsForListId(listId) {
    var data = await api.getListWords(listId);
    var generations = normalizeGenerations(data);
    if (!generations.length) return emptyMatrixWord();

    return generations
      .slice()
      .sort(function (a, b) {
        return (a.generation || 0) - (b.generation || 0);
      })
      .map(function (g) {
        if (!Array.isArray(g.words)) return [];
        return g.words
          .map(function (w) {
            if (w && typeof w === 'object') return String(w.word || '').trim();
            return String(w || '').trim();
          })
          .filter(function (w) {
            return w.length > 0;
          });
      });
  }

  function emptyMatrixWord() {
    return Array.from({ length: 1 }, function () {
      return [];
    });
  }

  function ownerLabel(list) {
    if (!list || typeof list !== 'object') return '';
    return (
      list.owner_name ||
      list.owner_username ||
      list.username ||
      (list.user && (list.user.name || list.user.username || list.user.email)) ||
      list.user_name ||
      ''
    );
  }

  function ownerFullLabel(list) {
    if (!list || typeof list !== 'object') return '';
    var parts = [
      (list.owner_username || '').trim(),
      (list.owner_name || '').trim(),
      (list.owner_email || '').trim(),
    ].filter(function (p) {
      return p.length > 0;
    });
    return parts.join(' -- ');
  }

  function formatWordListOptionLabel(list) {
    var name = (list && list.name) || 'Lista #' + (list && list.id ? list.id : '?');
    if (!list || !list.public) return name;
    var owner = ownerFullLabel(list) || ownerLabel(list);
    return owner ? name + ' - ' + owner : name;
  }

  function buildWordLevelSelects(matrixWord) {
    var form = $('wordLevel');
    if (!form) return;

    form.innerHTML = '';

    matrixWord.forEach(function (level, index) {
      var select = document.createElement('select');
      select.name = 'lev' + (index + 1);
      select.id = 'lev' + (index + 1);

      var noneOption = document.createElement('option');
      noneOption.value = '---';
      noneOption.selected = true;
      noneOption.textContent = '---';
      select.appendChild(noneOption);

      level.forEach(function (item) {
        var option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        select.appendChild(option);
      });

      form.appendChild(select);
    });
  }


  async function setupWordListsAndMatrix() {
    var wrap = $('wordListPickerWrap');
    var sel = $('wordListSelect');
    if (!wrap || !sel) return;

    var ownListsRaw = await api.getLists();
    var ownLists = unwrapListArray(ownListsRaw);
    var publicLists = [];
    if (typeof api.getPublicLists === 'function') {
      try {
        publicLists = await api.getPublicLists();
      } catch (e) {
        publicLists = [];
      }
    }
    var lists = mergeUniqueLists(ownLists, publicLists);
    if (!lists || !lists.length) {
      wrap.hidden = true;
      window.matrixWord = emptyMatrixWord();
      buildWordLevelSelects(window.matrixWord);
      return;
    }

    lists = lists.slice().sort(function (a, b) {
      return a.id - b.id;
    });
    var selectedId = pickSavedListId(lists, STORAGE_WORD_LIST);

    sel.innerHTML = '';
    lists.forEach(function (l) {
      var o = document.createElement('option');
      o.value = String(l.id);
      o.textContent = formatWordListOptionLabel(l);
      if (l.id === selectedId) o.selected = true;
      sel.appendChild(o);
    });

    // Ne rejtsük el az egész blokkot egy lista esetén sem.
    wrap.hidden = false;
    sel.disabled = lists.length <= 1;

    try {
      var mw = await loadWordsForListId(selectedId);
      window.matrixWord = mw;
      window.__cellautoLastWordListId = selectedId;
      buildWordLevelSelects(mw);
    } catch (e) {
      // 403: pl. public lista szavai nincsenek engedélyezve ezen a szerveren.
      if (typeof window.showToast === 'function') {
        window.showToast('Szólista betöltése nem engedélyezett (HTTP ' + (e && e.status ? e.status : '?') + ').', 5000);
      }
      window.matrixWord = emptyMatrixWord();
      buildWordLevelSelects(window.matrixWord);
    }

    if (!sel._cellautoWired) {
      sel._cellautoWired = true;
      sel.addEventListener('change', onWordListChange);
    }
    if (typeof window.CELLAUTO_refreshExamMetaWordList === 'function') {
      window.CELLAUTO_refreshExamMetaWordList();
    }
  }

  async function onWordListChange() {
    var sel = $('wordListSelect');
    if (!sel) return;
    var id = parseInt(sel.value, 10);
    if (!id) return;
    try {
      localStorage.setItem(STORAGE_WORD_LIST, String(id));
    } catch (e) {}
    try {
      var mw = await loadWordsForListId(id);
      window.matrixWord = mw;
      window.__cellautoLastWordListId = id;
      buildWordLevelSelects(mw);
      if (typeof window.reDrawTable === 'function') window.reDrawTable();
    } catch (e) {
      // 403: ne dobjuk ki a tokent, csak jelezzük és állítsuk vissza a legutóbbi jó listára.
      if (typeof window.showToast === 'function') {
        window.showToast('Szólista betöltése nem engedélyezett (HTTP ' + (e && e.status ? e.status : '?') + ').', 6000);
      }
      var prev = window.__cellautoLastWordListId;
      if (prev && sel.querySelector('option[value="' + prev + '"]')) {
        sel.value = String(prev);
      }
    }
  }

  async function setupColorListsAndApply() {
    var wrap = $('colorListPickerWrap');
    var sel = $('colorListSelect');
    if (!wrap || !sel) return;

    var ownListsRaw = await api.getColorLists();
    var ownLists = unwrapListArray(ownListsRaw);
    var publicLists = [];
    if (typeof api.getPublicColorLists === 'function') {
      try {
        publicLists = await api.getPublicColorLists();
      } catch (e) {
        publicLists = [];
      }
    }
    var lists = mergeUniqueLists(ownLists, publicLists);
    if (!lists || !lists.length) {
      wrap.hidden = true;
      applyDynamicColors(DEFAULT_HEX_COLORS);
      return;
    }

    lists = lists.slice().sort(function (a, b) {
      return b.id - a.id;
    });
    var selectedId = pickSavedListId(lists, STORAGE_COLOR_LIST);

    sel.innerHTML = '';
    lists.forEach(function (l) {
      var o = document.createElement('option');
      o.value = String(l.id);
      o.textContent = l.name || 'Paletta #' + l.id;
      if (l.id === selectedId) o.selected = true;
      sel.appendChild(o);
    });

    wrap.hidden = lists.length <= 1;

    var ok = await loadColorsForListId(selectedId);
    if (!ok) applyDynamicColors(DEFAULT_HEX_COLORS);

    if (!sel._cellautoWired) {
      sel._cellautoWired = true;
      sel.addEventListener('change', onColorListChange);
    }
  }

  async function onColorListChange() {
    var sel = $('colorListSelect');
    if (!sel) return;
    var id = parseInt(sel.value, 10);
    if (!id) return;
    try {
      localStorage.setItem(STORAGE_COLOR_LIST, String(id));
    } catch (e) {}
    try {
      var ok = await loadColorsForListId(id);
      if (!ok) applyDynamicColors(DEFAULT_HEX_COLORS);
      if (typeof window.reDrawTable === 'function') window.reDrawTable();
    } catch (e) {
      applyDynamicColors(DEFAULT_HEX_COLORS);
    }
  }

  function hidePickers() {
    var w = $('wordListPickerWrap');
    var c = $('colorListPickerWrap');
    if (w) w.hidden = true;
    if (c) c.hidden = true;
  }

  async function safeLogVisit(force) {
    if (!api || typeof api.logVisit !== 'function') return;
    var now = Date.now();
    if (!force && now - __lastVisitLogMs < VISIT_LOG_THROTTLE_MS) return;
    __lastVisitLogMs = now;
    try {
      await api.logVisit(new Date(now).toISOString());
    } catch (e) {}
  }

  function wireVisitLogging() {
    safeLogVisit(true);
    ['click', 'change', 'keydown'].forEach(function (evt) {
      document.addEventListener(
        evt,
        function () {
          safeLogVisit(false);
        },
        { passive: true }
      );
    });
  }

  function resetBoardToLoggedOutDefaults() {
    var sizeSel = $('boardSizeSelect');
    if (sizeSel) {
      sizeSel.value = '30';
      sizeSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    var zoomSel = $('boardZoomSelect');
    if (zoomSel) {
      zoomSel.value = '1';
      zoomSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    var neighborsSel = $('neighbors');
    if (neighborsSel) {
      neighborsSel.value = 'side';
      neighborsSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (typeof window.resetMatrix === 'function') {
      window.resetMatrix(0);
    } else if (typeof window.reDrawTable === 'function') {
      window.reDrawTable();
    }

    try {
      localStorage.setItem('cellauto_board_size', '30');
      localStorage.setItem('cellauto_board_zoom', '1');
    } catch (e) {}
  }

  /**
   * @param {{ userFallback?: object }} opts
   */
  async function loadAppData(opts) {
    opts = opts || {};

    if (api.getToken()) {
      try {
        var user = await api.getUser();
        setAuthBar(user);
      } catch (e) {
        if (opts.userFallback) {
          setAuthBar(opts.userFallback);
        } else if (e.status === 401 || e.status === 403) {
          api.clearToken();
          setAuthBar(null);
        } else {
          setAuthBar(null);
        }
      }
    } else {
      setAuthBar(null);
    }

    var loggedIn = !!api.getToken();
    if (!loggedIn) {
      var examPanel = $('sidebarExamPanel');
      if (examPanel && !examPanel.hidden && typeof window.CELLAUTO_exitExamMode === 'function') {
        window.CELLAUTO_exitExamMode();
      }
      resetBoardToLoggedOutDefaults();
    }
    setWordHint(loggedIn);

    if (api.getToken()) {
      try {
        await setupColorListsAndApply();
      } catch (e) {
        applyDynamicColors(DEFAULT_HEX_COLORS);
      }
      try {
        await setupWordListsAndMatrix();
      } catch (e) {
        window.matrixWord = emptyMatrixWord();
        buildWordLevelSelects(window.matrixWord);
      }
    } else {
      applyGuestColors();
      hidePickers();
      window.matrixWord = emptyMatrixWord();
      buildWordLevelSelects(window.matrixWord);
    }

    if (typeof window.reDrawTable === 'function') {
      window.reDrawTable();
    }

    if (typeof window.CELLAUTO_boardSaveAuthChanged === 'function') {
      window.CELLAUTO_boardSaveAuthChanged();
    }

    var levelSel = document.getElementById('level');
    if (
      typeof window.ensureMaxGenSelectOptions === 'function' &&
      (!levelSel || !levelSel.options || levelSel.options.length === 0)
    ) {
      window.ensureMaxGenSelectOptions();
    }
  }

  async function onLoginSubmit(ev) {
    ev.preventDefault();
    var err = $('loginError');
    var loginField = $('loginField');
    var passField = $('loginPassword');
    if (err) err.textContent = '';
    try {
      var data = await api.login(loginField.value.trim(), passField.value);
      passField.value = '';
      closeLoginModal();
      var u = data && data.user ? data.user : api.extractUserFromLogin(data);
      await loadAppData({ userFallback: u || null });
    } catch (e) {
      if (err) err.textContent = (e.data && e.data.error) || e.message || 'Bejelentkezés sikertelen';
    }
  }

  async function onLogout() {
    try {
      if (typeof api.logout === 'function') await api.logout();
    } catch (e) {}
    api.clearToken();
    setAuthBar(null);
    await loadAppData();
  }

  function wireUi() {
    var lb = $('btnLogin');
    var lo = $('btnLogout');
    var form = $('loginForm');
    var cancel = $('loginCancel');
    var backdrop = $('loginBackdrop');

    if (lb) lb.addEventListener('click', openLoginModal);
    if (lo) lo.addEventListener('click', onLogout);
    if (form) form.addEventListener('submit', onLoginSubmit);
    if (cancel) cancel.addEventListener('click', closeLoginModal);

    if (backdrop) {
      backdrop.addEventListener('click', function (ev) {
        if (ev.target.id === 'loginBackdrop') closeLoginModal();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireUi();
    if (typeof window.initGameBoard === 'function' && !window.__gameBoardInited) {
      window.initGameBoard();
      window.__gameBoardInited = true;
    }
    wireVisitLogging();
    loadAppData();
  });
})();
