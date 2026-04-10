(function () {
  'use strict';

  var api = window.CELLautoApi;
  if (!api) return;

  var DEFAULT_HEX_COLORS = ['#25ad4f', '#fcf400', '#ee1c25', '#00a4e6', '#b97b55', '#ffc70a'];
  var STORAGE_WORD_LIST = 'cellauto_sel_word_list_id';
  var STORAGE_COLOR_LIST = 'cellauto_sel_color_list_id';

  function $(id) {
    return document.getElementById(id);
  }

  function setAuthBar(user) {
    var userEl = $('authUser');
    var loginBtn = $('btnLogin');
    var logoutBtn = $('btnLogout');
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
    el.textContent = loggedIn
      ? 'Több szólista esetén válassz listát. A szavak mind a hat szinten ugyanabból a listából választhatók.'
      : 'Szólista csak bejelentkezés után érhető el. Színek: alapértelmezett paletta (vagy bejelentkezve az API).';
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
    var head = document.head;
    var old = document.getElementById('cellauto-dynamic-colors');
    if (old) old.remove();

    var style = document.createElement('style');
    style.id = 'cellauto-dynamic-colors';
    var css = '';
    for (var i = 0; i < Math.min(6, hexList.length); i++) {
      var c = hexList[i];
      if (!c) continue;
      css += '.color' + (i + 1) + '{background-color:' + c + '!important;}\n';
    }
    style.textContent = css;
    head.appendChild(style);
  }

  function clearDynamicColors() {
    var old = document.getElementById('cellauto-dynamic-colors');
    if (old) old.remove();
  }

  function applyGuestColors() {
    clearDynamicColors();
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

  async function loadWordsForListId(listId) {
    var full = await api.getList(listId);
    if (!full || !full.words) return emptyMatrixWord();
    var words = full.words
      .slice()
      .sort(function (a, b) {
        if (a.position !== b.position) return a.position - b.position;
        return a.id - b.id;
      })
      .map(function (w) {
        return w.word;
      });
    var row = words;
    return [0, 1, 2, 3, 4, 5].map(function () {
      return row.slice();
    });
  }

  function emptyMatrixWord() {
    return Array.from({ length: 6 }, function () {
      return [];
    });
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

    var lists = await api.getLists();
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
      o.textContent = l.name || 'Lista #' + l.id;
      if (l.id === selectedId) o.selected = true;
      sel.appendChild(o);
    });

    wrap.hidden = lists.length <= 1;

    var mw = await loadWordsForListId(selectedId);
    window.matrixWord = mw;
    buildWordLevelSelects(mw);

    if (!sel._cellautoWired) {
      sel._cellautoWired = true;
      sel.addEventListener('change', onWordListChange);
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
      buildWordLevelSelects(mw);
      if (typeof window.reDrawTable === 'function') window.reDrawTable();
    } catch (e) {}
  }

  async function setupColorListsAndApply() {
    var wrap = $('colorListPickerWrap');
    var sel = $('colorListSelect');
    if (!wrap || !sel) return;

    var lists = await api.getColorLists();
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

    if (typeof window.initGameBoard === 'function' && !window.__gameBoardInited) {
      window.initGameBoard();
      window.__gameBoardInited = true;
    } else if (typeof window.reDrawTable === 'function') {
      window.reDrawTable();
    }

    if (typeof window.CELLAUTO_boardSaveAuthChanged === 'function') {
      window.CELLAUTO_boardSaveAuthChanged();
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
    loadAppData();
  });
})();
