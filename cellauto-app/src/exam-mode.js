(function () {
  'use strict';

  var api = window.CELLautoApi;
  if (!api) return;

  function $(id) {
    return document.getElementById(id);
  }

  function openBackdrop(id) {
    var el = $(id);
    if (el) el.classList.add('is-open');
  }

  function closeBackdrop(id) {
    var el = $(id);
    if (el) el.classList.remove('is-open');
  }

  function unwrapEntity(d) {
    if (!d) return null;
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) return d.data;
    return d;
  }

  function parseIntSafe(v, def) {
    var n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  }

  function stopRunningSim() {
    if (typeof window.stopGenerate === 'function') window.stopGenerate();
    try {
      if (typeof generationHistory !== 'undefined' && generationHistory.length) generationHistory.length = 0;
    } catch (e) {}
  }

  function mapApiGenerationModeToNeighbor(gm) {
    var g = gm ? String(gm) : '';
    if (g === 'square_lateral') return 'side';
    if (g === 'square_apex') return 'apex';
    if (g === 'hexagonal') return 'hex';
    return 'side';
  }

  function neighborLabel(neighborValue) {
    var n = neighborValue ? String(neighborValue) : '';
    if (n === 'side') return 'Square lateral';
    if (n === 'apex') return 'Square apex';
    if (n === 'hex') return 'Hexagonal';
    if (n === 'life') return 'Game of Life (B3/S23)';
    if (n === 'life_hex') return 'HighLife (B36/S23)';
    return n || '—';
  }

  function examValidCell(x, y, meta) {
    if (!meta) return false;
    var vr = meta.viewRow;
    var vc = meta.viewCol;
    var bt = meta.board;
    if (x < 0 || y < 0 || x >= vc || y >= vr) return false;
    if (bt === 'hex' && y % 2 !== 0 && x === vc - 1) return false;
    return true;
  }

  function applyMinimalCells(cells) {
    if (!cells || !cells.length) return;
    var meta = typeof window.CELLAUTO_getViewBoardMeta === 'function' ? window.CELLAUTO_getViewBoardMeta() : null;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;
      if (!examValidCell(c.x, c.y, meta)) continue;
      if (typeof matrix !== 'undefined') matrix[c.x][c.y] = c.v | 0;
    }
    if (typeof reDrawTable === 'function') reDrawTable();
  }

  function applyTaskRecord(task) {
    stopRunningSim();
    try {
      if (typeof pendingLoadedPlacement !== 'undefined') pendingLoadedPlacement = null;
      if (typeof clearPlacementPreview === 'function') clearPlacementPreview();
    } catch (e) {}

    var p = task.payload;
    if (p && p.schemaVersion === 1 && typeof window.CELLAUTO_applySavePayload === 'function') {
      window.CELLAUTO_applySavePayload(p, { asIcon: false, immediatePlacement: true });
    } else {
      var bs = $('boardSizeSelect');
      var sz = parseIntSafe(task.board_size || task.boardSize, 0);
      if (bs && sz >= 10 && bs.querySelector('option[value="' + sz + '"]')) {
        bs.value = String(sz);
        bs.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var neighEl = $('neighbors');
      var nv = mapApiGenerationModeToNeighbor(task.generation_mode || task.generationMode);
      if (neighEl) {
        neighEl.value = nv;
        neighEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var rawCells = p && Array.isArray(p.cells) ? p.cells : [];
      applyMinimalCells(rawCells);
    }

    var gc = parseIntSafe(task.generations_count || task.generationsCount, 10);
    var lv = $('level');
    if (lv && gc >= 1) {
      if (typeof window.ensureMaxGenSelectOptions === 'function') window.ensureMaxGenSelectOptions();
      lv.value = String(Math.min(gc, 100));
    }
  }

  function buildExamDrawRadios(n) {
    var wrap = $('examDrawLevelRadios');
    if (!wrap) return;
    wrap.innerHTML = '';
    var form = document.createElement('div');
    form.className = 'exam-draw-level-form';
    var def = Math.min(2, n);
    for (var g = 1; g <= n; g++) {
      var id = 'examDrawLev' + g;
      var inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'examDrawLevel';
      inp.value = String(g);
      inp.id = id;
      if (g === def) inp.checked = true;
      var lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = 'Gen. ' + g + '.';
      lab.className = 'exam-gen-pill';
      lab.setAttribute('data-gen', String(g));
      lab.title = 'Generáció ' + g + ' — ugyanaz a szín a táblán, mint a színpaletta ' + (((g - 1) % 6) + 1) + '. színe';
      form.appendChild(inp);
      form.appendChild(lab);
      form.appendChild(document.createTextNode(' '));
    }
    wrap.appendChild(form);
    window.CELLAUTO_refreshExamGenPills();
  }

  var state = {
    active: false,
    mode: '',
    groupId: 0,
    taskSaveId: 0,
    taskRow: null,
    refMatrix: null,
    good: 0,
    bad: 0,
    possible: 0,
    timeLimit: 0,
    timerId: null,
    startedAt: 0,
    practiceElapsed: 0,
    examRemaining: 0,
    evaluationDone: false,
    cachedRows: [],
    frozenCells: null,
    totalSolutionCells: 0,
    examSessionStarted: false,
    savedEvaluationId: null,
    savedEvaluationApiPayload: null,
  };

  window.CELLAUTO_examEditBlockedReason = function (col, row) {
    if (!state.active) return '';
    if (state.evaluationDone) return 'done';
    if (state.mode === 'exam' && !state.examSessionStarted) return 'not_started';
    if (!state.frozenCells) return '';
    return state.frozenCells[col + ',' + row] ? 'frozen' : '';
  };

  /** Összes nem üres cella a helyes végső állapotban (referencia mátrix). */
  function countNonZeroInRef(ref) {
    if (!ref) return 0;
    var meta = typeof window.CELLAUTO_getViewBoardMeta === 'function' ? window.CELLAUTO_getViewBoardMeta() : null;
    if (!meta) return 0;
    var n = 0;
    var xMax;
    for (var y = 0; y < meta.viewRow; y++) {
      xMax = meta.viewCol - (meta.board === 'hex' && y % 2 !== 0 ? 1 : 0);
      for (var x = 0; x < xMax; x++) {
        if ((ref[x][y] | 0) > 0) n++;
      }
    }
    return n;
  }

  /** Kiindulásban üres, de a megoldás szerint nem üres → ezt kell a felhasználónak kitöltenie. */
  function countFillableCells(ref, frozenCells) {
    if (!ref) return 0;
    var meta = typeof window.CELLAUTO_getViewBoardMeta === 'function' ? window.CELLAUTO_getViewBoardMeta() : null;
    if (!meta) return 0;
    var fc = frozenCells || {};
    var n = 0;
    var xMax;
    for (var y = 0; y < meta.viewRow; y++) {
      xMax = meta.viewCol - (meta.board === 'hex' && y % 2 !== 0 ? 1 : 0);
      for (var x = 0; x < xMax; x++) {
        if ((ref[x][y] | 0) <= 0) continue;
        if (fc[x + ',' + y]) continue;
        n++;
      }
    }
    return n;
  }

  function formatDateTimeSql() {
    var d = new Date();
    function pad(t) {
      return (t < 10 ? '0' : '') + t;
    }
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }

  function updateStatsDom() {
    var g = $('examGoodCell');
    var b = $('examBadCell');
    var wrap = $('examPracticeCounters');
    if (state.active && state.mode === 'exam') {
      if (wrap) wrap.hidden = true;
      return;
    }
    if (state.active && state.mode === 'practice' && wrap) wrap.hidden = false;
    if (g) g.textContent = String(state.good);
    if (b) b.textContent = String(state.bad);
  }

  function clearTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function tickTimer() {
    var el = $('examTimerBig');
    var cap = $('examTimerCaption');
    if (!state.active) return;
    if (state.mode === 'exam' && !state.examSessionStarted) return;
    if (state.mode === 'practice') {
      state.practiceElapsed += 1;
      if (cap) cap.textContent = 'Gyakorlás — eltelt idő (nincs lejárat)';
      if (el) el.textContent = formatSeconds(state.practiceElapsed);
    } else {
      state.examRemaining -= 1;
      if (state.examRemaining < 0) state.examRemaining = 0;
      if (cap) cap.textContent = 'Hátralévő idő';
      if (el) el.textContent = formatSeconds(state.examRemaining);
      if (state.examRemaining <= 0) {
        clearTimer();
        if (!state.evaluationDone && state.mode === 'exam') {
          onEvaluate();
        }
      }
    }
  }

  function formatSeconds(s) {
    var n = parseIntSafe(s, 0);
    var m = Math.floor(n / 60);
    var r = n % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function escapeExamSummaryHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function examTaskWhenLabel(task) {
    var raw =
      task.created_at ||
      task.createdAt ||
      task.updated_at ||
      task.updatedAt ||
      '';
    if (!raw) return '—';
    var d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    try {
      return d.toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  var examPracticeHintTimer = null;
  var examNotStartedCaptionTimer = null;
  var MSG_EXAM_NOT_STARTED_CAPTION = 'A vizsga még nem indult — nyomd meg a zöld gombot';

  function showPracticeCellHint(ptr, message) {
    var x = ptr && typeof ptr.clientX === 'number' ? ptr.clientX : window.innerWidth / 2;
    var y = ptr && typeof ptr.clientY === 'number' ? ptr.clientY : window.innerHeight / 2;
    var old = document.querySelector('.exam-practice-hint');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var bubble = document.createElement('div');
    bubble.className = 'exam-practice-hint';
    bubble.textContent = message;
    bubble.setAttribute('role', 'status');
    document.body.appendChild(bubble);
    var pad = 12;
    var w = bubble.offsetWidth || 160;
    var h = bubble.offsetHeight || 40;
    var bx = Math.min(Math.max(8, x + pad), window.innerWidth - w - 8);
    var by = Math.min(Math.max(8, y + pad), window.innerHeight - h - 8);
    bubble.style.left = bx + 'px';
    bubble.style.top = by + 'px';
    clearTimeout(examPracticeHintTimer);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bubble.classList.add('exam-practice-hint--visible');
      });
    });
    examPracticeHintTimer = setTimeout(function () {
      bubble.classList.remove('exam-practice-hint--visible');
      setTimeout(function () {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
      }, 220);
    }, 2600);
  }

  window.CELLAUTO_showPracticeCellHint = showPracticeCellHint;

  window.CELLAUTO_notifyExamNotStartedCellClick = function (ptr) {
    if (!state.active || state.mode !== 'exam' || state.examSessionStarted) return;
    var msg = 'A vizsgát előbb indítsd el — nyomd meg a zöld gombot.';
    showPracticeCellHint(ptr, msg);
    var cap = $('examTimerCaption');
    if (cap) {
      clearTimeout(examNotStartedCaptionTimer);
      cap.textContent = msg;
      cap.classList.add('exam-timer-caption--flash');
      examNotStartedCaptionTimer = setTimeout(function () {
        examNotStartedCaptionTimer = null;
        if (cap && state.active && state.mode === 'exam' && !state.examSessionStarted) {
          cap.textContent = MSG_EXAM_NOT_STARTED_CAPTION;
        }
        if (cap) cap.classList.remove('exam-timer-caption--flash');
      }, 4000);
    }
  };
  window.CELLAUTO_isExamPracticeMode = function () {
    return !!state.active && state.mode === 'practice';
  };

  /** Látható rács téglalapja a nézetablakban (#boardDiv zoom miatt gyakran nagyobb a layout doboz). */
  function syncPerfectOverlayToGrid(gridEl, overlay) {
    if (!gridEl || !overlay || !overlay.parentNode) return;
    var r = gridEl.getBoundingClientRect();
    overlay.style.left = Math.round(r.left) + 'px';
    overlay.style.top = Math.round(r.top) + 'px';
    overlay.style.width = Math.max(1, Math.round(r.width)) + 'px';
    overlay.style.height = Math.max(1, Math.round(r.height)) + 'px';
  }

  function removePerfectBoardCelebration() {
    var cur = document.querySelector('.exam-perfect-overlay[data-exam-perfect-overlay="1"]');
    if (!cur) return;
    if (typeof cur._examPerfectCleanup === 'function') cur._examPerfectCleanup();
    cur.remove();
  }

  function showPerfectBoardCelebration() {
    var bd = $('boardDiv');
    if (!bd) return;
    var grid = bd.querySelector('table') || bd.firstElementChild;
    if (!grid) return;
    removePerfectBoardCelebration();
    var overlay = document.createElement('div');
    overlay.className = 'exam-perfect-overlay';
    overlay.setAttribute('data-exam-perfect-overlay', '1');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="exam-perfect-frame">' +
      '<div class="exam-perfect-frame__inner">' +
      '<span class="exam-perfect-frame__text">Gratulálok!</span>' +
      '</div></div>';
    document.body.appendChild(overlay);
    var scrollOpts = { capture: true, passive: true };
    function onScrollOrResize() {
      requestAnimationFrame(function () {
        syncPerfectOverlayToGrid(grid, overlay);
      });
    }
    var scrollRoots = [];
    overlay._examPerfectCleanup = function () {
      window.removeEventListener('scroll', onScrollOrResize, scrollOpts);
      window.removeEventListener('resize', onScrollOrResize, scrollOpts);
      for (var si = 0; si < scrollRoots.length; si++) {
        scrollRoots[si].removeEventListener('scroll', onScrollOrResize, scrollOpts);
      }
      overlay._examPerfectCleanup = null;
    };
    window.addEventListener('scroll', onScrollOrResize, scrollOpts);
    window.addEventListener('resize', onScrollOrResize, scrollOpts);
    var mainEl = document.querySelector('.app-main');
    if (mainEl) {
      scrollRoots.push(mainEl);
      mainEl.addEventListener('scroll', onScrollOrResize, scrollOpts);
    }
    function cleanup() {
      overlay.removeEventListener('animationend', onAnimEnd);
      if (typeof overlay._examPerfectCleanup === 'function') overlay._examPerfectCleanup();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onAnimEnd(ev) {
      if (ev.target !== overlay) return;
      cleanup();
    }
    function startAnim() {
      syncPerfectOverlayToGrid(grid, overlay);
      void overlay.offsetWidth;
      overlay.classList.add('exam-perfect-overlay--play');
      overlay.addEventListener('animationend', onAnimEnd);
      setTimeout(function () {
        if (overlay.parentNode) cleanup();
      }, 4500);
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(startAnim);
    });
  }

  function beginExamSession() {
    if (!state.active || state.mode !== 'exam' || state.examSessionStarted) return;
    state.examSessionStarted = true;
    var sw = $('examStartWrap');
    var sb = $('examBtnStart');
    if (sw) sw.hidden = true;
    if (sb) sb.hidden = true;
    var evB = $('examBtnEvaluate');
    if (evB) {
      evB.disabled = false;
      evB.removeAttribute('aria-disabled');
    }
    startTimers();
    if (typeof window.reDrawTable === 'function') window.reDrawTable();
  }

  function syncExamNoteSaveBtnVisibility() {
    var ni = $('examNoteInput');
    var nsb = $('examNoteSaveBtn');
    if (!ni || !nsb) return;
    var t = String(ni.value || '').trim();
    var saved = '';
    if (state.savedEvaluationApiPayload && state.savedEvaluationApiPayload.note != null) {
      saved = String(state.savedEvaluationApiPayload.note).trim();
    }
    if (t.length === 0) {
      nsb.hidden = true;
      return;
    }
    nsb.hidden = t === saved;
  }

  function prepareExamNotesUiAfterEval() {
    if (state.mode !== 'exam') return;
    var nw = $('examNotesWrap');
    var ni = $('examNoteInput');
    if (!nw || !ni) return;
    nw.hidden = false;
    ni.value = '';
    ni.oninput = syncExamNoteSaveBtnVisibility;
    syncExamNoteSaveBtnVisibility();
  }

  async function onSaveExamNoteClick() {
    if (!state.savedEvaluationId || !state.taskSaveId || typeof api.updateTaskEvaluation !== 'function') return;
    var ni = $('examNoteInput');
    var noteText = ni && ni.value ? String(ni.value).trim() : '';
    var base = state.savedEvaluationApiPayload;
    if (!base || typeof base !== 'object') return;
    var putPayload = Object.assign({}, base, { note: noteText });
    var btn = $('examNoteSaveBtn');
    if (btn) btn.disabled = true;
    try {
      await api.updateTaskEvaluation(state.taskSaveId, state.savedEvaluationId, putPayload);
      state.savedEvaluationApiPayload = JSON.parse(JSON.stringify(putPayload));
      if (typeof window.showToast === 'function') window.showToast('Megjegyzés elmentve.', 3200);
      syncExamNoteSaveBtnVisibility();
    } catch (e) {
      if (typeof window.showToast === 'function') {
        window.showToast(e.message || 'Megjegyzés mentése sikertelen.', 4200);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function startTimers() {
    clearTimer();
    state.startedAt = Date.now();
    state.practiceElapsed = 0;
    state.examRemaining = parseIntSafe(state.timeLimit, 120);
    var cap = $('examTimerCaption');
    var el = $('examTimerBig');
    if (state.mode === 'practice') {
      if (cap) cap.textContent = 'Gyakorlás — eltelt idő (nincs lejárat)';
      if (el) el.textContent = '0:00';
      state.timerId = setInterval(tickTimer, 1000);
    } else {
      if (cap) cap.textContent = 'Hátralévő idő';
      if (el) el.textContent = formatSeconds(state.examRemaining);
      state.timerId = setInterval(tickTimer, 1000);
    }
  }

  function examAuthorName(task) {
    if (!task) return '—';
    var u = task.user || task.owner || task.creator;
    if (u && typeof u === 'object') {
      return String(u.name || u.username || u.email || '').trim() || '—';
    }
    if (task.user_name) return String(task.user_name).trim();
    if (task.author_name) return String(task.author_name).trim();
    if (task.creator_name) return String(task.creator_name).trim();
    return '—';
  }

  function formatTaskListLabel(r, t) {
    var parts = [];
    if (r.groupName) parts.push('[' + r.groupName + ']');
    parts.push(t.name || 'Feladat #' + t.id);
    if (t.level) parts.push(String(t.level));
    var auth = examAuthorName(t);
    if (auth && auth !== '—') parts.push('Tanár: ' + auth);
    return parts.join(' ');
  }

  function fillMeta(task, gc) {
    $('examMetaName').textContent = task.name || 'Feladat #' + task.id;
    $('examMetaAuthor').textContent = examAuthorName(task);
    var whenEl = $('examMetaWhen');
    if (whenEl) whenEl.textContent = examTaskWhenLabel(task);
    $('examMetaLevel').textContent = task.level || '—';
    $('examMetaGenMode').textContent = neighborLabel($('neighbors') && $('neighbors').value);
    $('examMetaGenCount').textContent = String(gc);
    $('examMetaPossible').textContent = String(state.possible);
    $('examSidebarSubtitle').textContent =
      state.mode === 'practice' ? 'Gyakorlási mód' : 'Vizsga mód';
    $('examSidebarTitle').textContent =
      state.mode === 'practice' ? 'Gyakorlás' : 'Vizsga';
  }

  window.CELLAUTO_examAfterCellChange = function (col, row, oldV, newV, ptr) {
    if (!state.active || state.evaluationDone) return;
    if (oldV === newV) return;
    var ref = state.refMatrix;
    if (!ref) return;

    var expected = ref[col][row] | 0;
    var k = col + ',' + row;
    var fillable = expected > 0 && !(state.frozenCells && state.frozenCells[k]);
    var practice = state.mode === 'practice';

    /* Gyakorlás: rossz / jó sejt törlése — good & bad visszacsökkentése (vizsgán nincs számláló) */
    if (practice && (newV | 0) <= 0 && (oldV | 0) > 0) {
      if (expected === 0) {
        if (state.bad > 0) state.bad--;
      } else if (fillable) {
        if ((oldV | 0) === (expected | 0)) {
          if (state.good > 0) state.good--;
        } else {
          if (state.bad > 0) state.bad--;
        }
      }
      updateStatsDom();
      return;
    }

    if ((newV | 0) <= 0) return;
    if (!practice) {
      updateStatsDom();
      return;
    }

    if (expected === 0) {
      var p =
        ptr ||
        (typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
          ? window.__cellautoLastPointer
          : null);
      showPracticeCellHint(p, 'Nem GEN' + (newV | 0) + ' cella');
      state.bad++;
      updateStatsDom();
      return;
    }
    if (!fillable) {
      updateStatsDom();
      return;
    }
    if ((newV | 0) === expected) {
      state.good++;
    } else {
      state.bad++;
      var p2 =
        ptr ||
        (typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
          ? window.__cellautoLastPointer
          : null);
      showPracticeCellHint(p2, 'Nem GEN' + (newV | 0) + ' cella');
    }
    updateStatsDom();
  };

  function collectFilteredTasks() {
    var gf = $('examGroupFilter');
    var gidWant = gf && gf.value ? parseIntSafe(gf.value, 0) : 0;
    var f = $('examLevelFilter');
    var lv = f && f.value ? String(f.value) : '';
    var rows = state.cachedRows;
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var t = r.save;
      if (gidWant && r.groupId !== gidWant) continue;
      var lvl = t.level ? String(t.level) : '';
      if (lv && lvl !== lv) continue;
      out.push(r);
    }
    return out;
  }

  function refreshExamTaskSelect() {
    var sel = $('examTaskSelect');
    if (!sel) return;
    sel.innerHTML = '';
    var list = collectFilteredTasks();
    if (!list.length) {
      var o = document.createElement('option');
      o.value = '';
      o.textContent = '— nincs feladat —';
      sel.appendChild(o);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var t = r.save;
      var o = document.createElement('option');
      o.value = String(r.groupId) + ':' + String(t.id);
      o.textContent = formatTaskListLabel(r, t);
      sel.appendChild(o);
    }
  }

  function populateGroupFilter(groups) {
    var sel = $('examGroupFilter');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = 'Minden csoport';
    sel.appendChild(o0);
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var o = document.createElement('option');
      o.value = String(g.id);
      o.textContent = g.name || 'Csoport #' + g.id;
      sel.appendChild(o);
    }
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
  }

  async function loadAllTaskRows() {
    var groups = [];
    try {
      groups = await api.getTaskSaveGroups();
    } catch (e) {
      groups = [];
    }
    populateGroupFilter(groups);
    var rows = [];
    for (var i = 0; i < groups.length; i++) {
      var gid = groups[i].id;
      var gname = groups[i].name || '';
      var saves = [];
      try {
        saves = await api.getTaskSaves(gid);
      } catch (e) {
        saves = [];
      }
      for (var j = 0; j < saves.length; j++) {
        rows.push({ groupId: gid, groupName: gname, save: saves[j] });
      }
    }
    state.cachedRows = rows;
    refreshExamTaskSelect();
  }

  async function parseSelection() {
    var sel = $('examTaskSelect');
    var raw = sel && sel.value ? String(sel.value) : '';
    if (!raw || raw.indexOf(':') === -1) return null;
    var parts = raw.split(':');
    var gid = parseIntSafe(parts[0], 0);
    var sid = parseIntSafe(parts[1], 0);
    if (!gid || !sid) return null;
    var data = await api.getTaskSave(gid, sid);
    var task = unwrapEntity(data);
    return { groupId: gid, task: task };
  }

  async function enterExam(mode) {
    var err = $('examModalError');
    if (err) err.textContent = '';
    var sel = $('examTaskSelect');
    if (!sel || !sel.value) {
      if (err) err.textContent = 'Válassz feladatot.';
      return;
    }

    var parsed;
    try {
      parsed = await parseSelection();
    } catch (e) {
      if (err) err.textContent = e.message || 'Nem sikerült betölteni a feladatot.';
      return;
    }
    if (!parsed || !parsed.task) {
      if (err) err.textContent = 'Üres feladat.';
      return;
    }

    var task = parsed.task;
    var gc = parseIntSafe(task.generations_count || task.generationsCount, 5);

    applyTaskRecord(task);

    state.frozenCells =
      typeof window.CELLAUTO_getExamFrozenMaskFromMatrix === 'function'
        ? window.CELLAUTO_getExamFrozenMaskFromMatrix()
        : {};

    state.prevWordListHidden = $('wordListPickerWrap') ? $('wordListPickerWrap').hidden : true;

    $('word_mode').value = 'select';
    $('word_mode').dispatchEvent(new Event('change', { bubbles: true }));

    $('playModeTest').checked = true;
    $('mode').value = 'test';
    $('mode').dispatchEvent(new Event('change', { bubbles: true }));

    $('level').value = String(Math.min(gc, 100));

    $('playModeTest').dispatchEvent(new Event('change', { bubbles: true }));

    buildExamDrawRadios(gc);

    var ref = typeof window.CELLAUTO_computeExpectedSolutionMatrix === 'function'
      ? window.CELLAUTO_computeExpectedSolutionMatrix(gc)
      : null;
    if (!ref) {
      if (err) err.textContent = 'Nem sikerült referencia számítás.';
      return;
    }

    state.active = true;
    state.mode = mode === 'exam' ? 'exam' : 'practice';
    state.evaluationDone = false;
    state.groupId = parsed.groupId;
    state.taskSaveId = parseIntSafe(task.id, 0);
    state.taskRow = task;
    state.refMatrix = ref;
    state.good = 0;
    state.bad = 0;
    state.possible = countFillableCells(ref, state.frozenCells);
    state.totalSolutionCells = countNonZeroInRef(ref);
    state.timeLimit = parseIntSafe(task.time_limit || task.timeLimit, 120);

    fillMeta(task, gc);
    updateStatsDom();

    state.examSessionStarted = state.mode !== 'exam';
    state.savedEvaluationId = null;
    state.savedEvaluationApiPayload = null;

    var startWrap = $('examStartWrap');
    var startBtnEl = $('examBtnStart');
    var noteSaveBtn0 = $('examNoteSaveBtn');
    if (noteSaveBtn0) noteSaveBtn0.hidden = true;

    var pc = $('examPracticeCounters');
    var nw = $('examNotesWrap');
    if (state.mode === 'practice') {
      if (pc) pc.hidden = false;
      if (nw) nw.hidden = true;
      if (startWrap) startWrap.hidden = true;
    } else {
      if (pc) pc.hidden = true;
      if (nw) nw.hidden = true;
      var niClear = $('examNoteInput');
      if (niClear) niClear.value = '';
      if (startWrap) startWrap.hidden = false;
      if (startBtnEl) startBtnEl.hidden = false;
    }

    $('examEvaluationBox').hidden = true;
    $('examEvaluationBox').textContent = '';
    $('examFinishWrap').hidden = true;
    var evReset = $('examBtnEvaluate');
    if (state.mode === 'exam') {
      if (evReset) {
        evReset.disabled = true;
        evReset.setAttribute('aria-disabled', 'true');
      }
    } else {
      if (evReset) {
        evReset.disabled = false;
        evReset.removeAttribute('aria-disabled');
      }
    }

    if ($('wordListPickerWrap')) $('wordListPickerWrap').hidden = true;
    $('sidebarPlayControls').hidden = true;
    $('saveLoadWrap').hidden = true;
    $('vizsgaWrap').hidden = true;
    $('sidebarExamPanel').hidden = false;

    var neigh = $('neighbors');
    var bs = $('boardSizeSelect');
    if (neigh) neigh.disabled = true;
    if (bs) bs.disabled = true;

    closeBackdrop('examBackdrop');

    if (state.mode === 'practice') {
      startTimers();
    } else {
      clearTimer();
      state.examRemaining = parseIntSafe(state.timeLimit, 120);
      var capSt = $('examTimerCaption');
      var elSt = $('examTimerBig');
      if (capSt) capSt.textContent = MSG_EXAM_NOT_STARTED_CAPTION;
      if (elSt) elSt.textContent = formatSeconds(parseIntSafe(state.timeLimit, 120));
    }

    if (typeof window.reDrawTable === 'function') window.reDrawTable();
  }

  function completedSecondsForApi() {
    if (state.mode === 'practice') return state.practiceElapsed;
    return Math.max(0, state.timeLimit - state.examRemaining);
  }

  async function onEvaluate() {
    if (!state.active || state.evaluationDone) return;
    if (state.mode === 'exam' && !state.examSessionStarted) return;
    state.evaluationDone = true;
    clearTimer();

    var noteEl = $('examNoteInput');
    var noteText =
      noteEl && noteEl.value ? String(noteEl.value).trim() : '';
    if (state.mode === 'exam') {
      noteText = '';
    }

    var diffStats =
      typeof window.CELLAUTO_paintMatrixDiffOverlay === 'function'
        ? window.CELLAUTO_paintMatrixDiffOverlay(state.refMatrix)
        : null;

    var totalPossible = state.possible | 0;
    var completedCorrect =
      typeof window.CELLAUTO_countCorrectExamFillCells === 'function'
        ? window.CELLAUTO_countCorrectExamFillCells(state.refMatrix, state.frozenCells)
        : Math.min(diffStats ? diffStats.ok : 0, totalPossible);
    if (totalPossible >= 0) {
      completedCorrect = Math.min(completedCorrect | 0, totalPossible);
    }
    var wrongMarked = diffStats ? diffStats.error + diffStats.plus : 0;
    var unfilled = diffStats ? diffStats.minus : 0;
    var pctNumerator = completedCorrect - wrongMarked - unfilled;
    var pct =
      totalPossible > 0 ? Math.round((pctNumerator / totalPossible) * 100) : null;
    var isPerfect =
      !!diffStats && diffStats.error + diffStats.plus + diffStats.minus === 0;

    var summary = '<h4 class="exam-eval-title">Összegzés</h4>';
    if (isPerfect) {
      summary +=
        '<p class="exam-eval-grats exam-eval-grats--replay" role="status" tabindex="0" title="Újra a táblán: egér fölé vagy kattintás">' +
        'Gratulálok!!!</p>';
    }
    summary +=
      '<p class="exam-eval-hero-line">Teljesítés: <span class="exam-eval-num">' +
      (pct !== null ? pct + '%' : '—') +
      '</span></p>';
    summary +=
      '<p class="exam-eval-meta-line">Teljesítési idő: <span class="exam-eval-num">' +
      formatSeconds(completedSecondsForApi()) +
      '</span></p>';
    if (noteText) {
      summary +=
        '<div class="exam-eval-teacher-note">' +
        '<div class="exam-eval-teacher-note-label">Megjegyzés a tanárnak</div>' +
        '<div class="exam-eval-teacher-note-body">' +
        escapeExamSummaryHtml(noteText).replace(/\n/g, '<br>') +
        '</div></div>';
    }
    summary += '<div class="exam-eval-stats">';
    summary +=
      '<div class="exam-eval-stats-table" role="group" aria-label="Összesítő cellaszámok">' +
      '<div class="exam-eval-stat-cell">' +
      '<div class="exam-eval-stat-label">Összes teljesíthető cellák száma</div>' +
      '<span class="exam-eval-num">' +
      totalPossible +
      '</span>' +
      '</div>' +
      '<div class="exam-eval-stat-cell">' +
      '<div class="exam-eval-stat-label">Teljesített cellák száma</div>' +
      '<span class="exam-eval-num exam-eval-num--good">' +
      completedCorrect +
      '</span>' +
      '</div>' +
      '<div class="exam-eval-stat-cell">' +
      '<div class="exam-eval-stat-label">Rosszul bejelölt cellák száma</div>' +
      '<span class="exam-eval-num exam-eval-num--bad">' +
      wrongMarked +
      '</span>' +
      '</div>' +
      '<div class="exam-eval-stat-cell">' +
      '<div class="exam-eval-stat-label">Be nem jelölt cellák száma</div>' +
      '<span class="exam-eval-num exam-eval-num--bad">' +
      unfilled +
      '</span>' +
      '</div>' +
      '</div>';
    summary += '</div>';
    summary +=
      '<div class="exam-eval-formula" role="note">' +
      '<div class="exam-eval-formula-heading">Teljesítés %</div>' +
      '<div class="exam-eval-formula-row">' +
      '<span class="exam-eval-formula-eq">=</span>' +
      '<span class="exam-eval-fraction">' +
      '<span class="exam-eval-fraction-num">good_cell − bad_cell − unfilled_cell</span>' +
      '<span class="exam-eval-fraction-bar"></span>' +
      '<span class="exam-eval-fraction-den">total_good_cell</span>' +
      '</span>' +
      '<span class="exam-eval-formula-operator"> × 100</span>' +
      '</div>' +
      '<div class="exam-eval-formula-row exam-eval-formula-row--values">' +
      '<span class="exam-eval-formula-eq">=</span>' +
      '<span class="exam-eval-fraction exam-eval-fraction--values">' +
      '<span class="exam-eval-fraction-num">' +
      completedCorrect +
      ' − ' +
      wrongMarked +
      ' − ' +
      unfilled +
      '</span>' +
      '<span class="exam-eval-fraction-bar"></span>' +
      '<span class="exam-eval-fraction-den">' +
      (totalPossible > 0 ? totalPossible : '—') +
      '</span>' +
      '</span>' +
      '<span class="exam-eval-formula-operator"> × 100' +
      (pct !== null ? ' = <strong class="exam-eval-pct-result">' + pct + '%</strong>' : '') +
      '</span>' +
      '</div>' +
      '</div>';
    summary +=
      '<div class="exam-eval-legend-list"><div class="exam-eval-legend-title">Jelölések a táblán</div>' +
      '<p class="exam-eval-legend-row"><span class="exam-eval-mark exam-eval-mark--x" aria-hidden="true">×</span> rossz generáció</p>' +
      '<p class="exam-eval-legend-row"><span class="exam-eval-mark exam-eval-mark--plus" aria-hidden="true">+</span> felesleges kitöltés</p>' +
      '<p class="exam-eval-legend-row"><span class="exam-eval-mark exam-eval-mark--m" aria-hidden="true">m</span> hiányzó sejt</p>' +
      '<p class="exam-eval-legend-row"><span class="exam-eval-mark exam-eval-mark--ok" aria-hidden="true"></span> Helyes kitöltés</p>' +
      '</div>';

    var box = $('examEvaluationBox');
    var fw = $('examFinishWrap');

    if (box) {
      box.innerHTML = summary;
      box.hidden = false;
    }
    if (isPerfect) {
      showPerfectBoardCelebration();
      var gr = box && box.querySelector('.exam-eval-grats--replay');
      if (gr) {
        var replayCelebrate = function () {
          showPerfectBoardCelebration();
        };
        gr.addEventListener('mouseenter', replayCelebrate);
        gr.addEventListener('click', replayCelebrate);
        gr.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            replayCelebrate();
          }
        });
      }
    }
    if (fw) fw.hidden = false;

    var evBtnDone = $('examBtnEvaluate');
    if (evBtnDone) {
      evBtnDone.disabled = true;
      evBtnDone.setAttribute('aria-disabled', 'true');
    }

    if (state.mode === 'exam' && state.taskSaveId) {
      try {
        var filledBoard =
          typeof window.CELLAUTO_captureEvaluationFieldBoards === 'function'
            ? window.CELLAUTO_captureEvaluationFieldBoards()
            : null;
        if (!filledBoard || typeof filledBoard !== 'object') {
          filledBoard = { schemaVersion: 1, board: 'square', cells: [] };
        }
        var apiGoodCell = completedCorrect;
        var apiBadCell = wrongMarked;
        var apiUnfilledCell = unfilled;
        var evalPayload = {
          date: formatDateTimeSql(),
          note: noteText,
          filled_board: filledBoard,
          total_good_cell: state.possible,
          good_cell: apiGoodCell,
          bad_cell: apiBadCell,
          unfilled_cell: apiUnfilledCell,
          possible_sentence: 0,
          good_sentence: 0,
          bad_sentence: 0,
          completed_time: completedSecondsForApi(),
        };
        var evalRaw = await api.createTaskEvaluation(state.taskSaveId, evalPayload);
        var evEntity = unwrapEntity(evalRaw);
        var evId = evEntity && evEntity.id != null ? parseIntSafe(evEntity.id, 0) : 0;
        if (evId) state.savedEvaluationId = evId;
        state.savedEvaluationApiPayload = JSON.parse(JSON.stringify(evalPayload));
        prepareExamNotesUiAfterEval();
      } catch (e) {
        if (box) box.innerHTML += '<br><em>Értékelés mentése sikertelen: ' + (e.message || '') + '</em>';
      }
    }
  }

  function exitExamMode() {
    removePerfectBoardCelebration();
    clearTimer();
    state.active = false;
    state.refMatrix = null;
    state.frozenCells = null;
    state.totalSolutionCells = 0;
    state.evaluationDone = false;
    state.examSessionStarted = false;
    state.savedEvaluationId = null;
    state.savedEvaluationApiPayload = null;

    var swExit = $('examStartWrap');
    if (swExit) swExit.hidden = true;

    $('sidebarExamPanel').hidden = true;
    $('sidebarPlayControls').hidden = false;
    $('examDrawLevelRadios').innerHTML = '';

    var neigh = $('neighbors');
    var bs = $('boardSizeSelect');
    if (neigh) neigh.disabled = false;
    if (bs) bs.disabled = false;

    if (api.getToken()) {
      $('saveLoadWrap').hidden = false;
      $('vizsgaWrap').hidden = false;
    }

    var wl = $('wordListPickerWrap');
    if (wl) wl.hidden = !!state.prevWordListHidden;

    $('examEvaluationBox').hidden = true;
    $('examFinishWrap').hidden = true;
    var evExit = $('examBtnEvaluate');
    if (evExit) {
      evExit.disabled = false;
      evExit.removeAttribute('aria-disabled');
    }
    var nw = $('examNotesWrap');
    var ni = $('examNoteInput');
    var nsbx = $('examNoteSaveBtn');
    if (ni) {
      ni.value = '';
      ni.oninput = null;
      syncExamNoteSaveBtnVisibility();
    }
    if (nsbx) nsbx.hidden = true;
    if (nw) nw.hidden = true;
    var pc = $('examPracticeCounters');
    if (pc) pc.hidden = false;

    if (typeof window.reDrawTable === 'function') window.reDrawTable();
  }

  function wire() {
    var openBtn = $('btnOpenExamModal');
    var cancel = $('examModalCancel');
    var practice = $('examModalPractice');
    var examBtn = $('examModalExam');
    var backdrop = $('examBackdrop');
    var filt = $('examLevelFilter');
    var grpFilt = $('examGroupFilter');

    if (openBtn)
      openBtn.addEventListener('click', async function () {
        if (!api.getToken()) {
          if (typeof window.showToast === 'function') window.showToast('Bejelentkezés szükséges.', 3800);
          return;
        }
        if ($('examModalError')) $('examModalError').textContent = '';
        await loadAllTaskRows();
        openBackdrop('examBackdrop');
      });

    if (filt) filt.addEventListener('change', refreshExamTaskSelect);
    if (grpFilt) grpFilt.addEventListener('change', refreshExamTaskSelect);

    if (cancel) cancel.addEventListener('click', function () { closeBackdrop('examBackdrop'); });

    if (practice)
      practice.addEventListener('click', function () {
        enterExam('practice');
      });

    if (examBtn)
      examBtn.addEventListener('click', function () {
        enterExam('exam');
      });

    if (backdrop) {
      backdrop.addEventListener('click', function (ev) {
        if (ev.target && ev.target.id === 'examBackdrop') closeBackdrop('examBackdrop');
      });
    }

    var evBtn = $('examBtnEvaluate');
    var finBtn = $('examBtnFinish');
    var startExamBtn = $('examBtnStart');
    var noteSaveBtn = $('examNoteSaveBtn');
    if (evBtn) evBtn.addEventListener('click', onEvaluate);
    if (finBtn) finBtn.addEventListener('click', exitExamMode);
    if (startExamBtn) startExamBtn.addEventListener('click', beginExamSession);
    if (noteSaveBtn) noteSaveBtn.addEventListener('click', onSaveExamNoteClick);
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
