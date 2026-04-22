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
    taskWordListId: 0,
    examWordSentencePhase: false,
    examIdleNothingToComplete: false,
    wordListPickerRestoreParent: null,
    wordListPickerRestoreNext: null,
    taskWordListName: '',
    examAutoWordTriggered: false,
    examAutoNoWordlistEvalTriggered: false,
    examAvailableSentences: 0,
    examEmbeddableSentences: 0,
    practiceCellWordIds: null,
    practiceWordGraph: null,
    taskGenCount: 0,
    practiceFillHelpEnabled: false,
    /** Gyakorlás: szóválasztás után GEN helyes/helytelen üzenet buborék */
    practiceKitoltesUzenetekEnabled: true,
    taskWordListNotes: '',
  };

  function ensurePracticeCellWordIdsMap() {
    if (!state.practiceCellWordIds) state.practiceCellWordIds = Object.create(null);
    return state.practiceCellWordIds;
  }

  function parseWordGenMessagesPayload(msgPayload) {
    var out = Object.create(null);
    var raw =
      msgPayload && Array.isArray(msgPayload.generations)
        ? msgPayload.generations
        : msgPayload && msgPayload.data && Array.isArray(msgPayload.data.generations)
          ? msgPayload.data.generations
          : null;
    if (!raw) return out;
    for (var i = 0; i < raw.length; i++) {
      var row = raw[i];
      var gn = parseIntSafe(row.generation, 0);
      if (gn < 1) continue;
      var c = row.correct_answer_message;
      var ic = row.incorrect_answer_message;
      out[gn] = {
        correct: c != null && String(c).trim() !== '' ? String(c).trim() : '',
        incorrect: ic != null && String(ic).trim() !== '' ? String(ic).trim() : '',
      };
    }
    return out;
  }

  /** Mely szó-ID-k szerepelnek legalább egy teljes GEN1…GENgc relációs láncban (gc = feladat generációszáma). */
  function computeFullPathWordIdFlags(byGen, adj, wordGen, edgeCount, gc) {
    var flags = {};
    var g;
    for (g = 1; g <= gc; g++) flags[g] = Object.create(null);

    if (gc < 1) return flags;

    if (!edgeCount) {
      for (var g2 = 1; g2 <= gc; g2++) {
        var row0 = byGen[g2];
        if (!row0) continue;
        for (var i0 = 0; i0 < row0.length; i0++) flags[g2][row0[i0].id] = true;
      }
      return flags;
    }

    function dfs(chain) {
      if (chain.length === gc) {
        for (var i = 0; i < chain.length; i++) flags[i + 1][chain[i]] = true;
        return;
      }
      var last = chain[chain.length - 1];
      var nextGen = chain.length + 1;
      var outs = adj[last] || [];
      for (var j = 0; j < outs.length; j++) {
        var toId = outs[j];
        if (wordGen[toId] !== nextGen) continue;
        dfs(chain.concat([toId]));
      }
    }

    var g1 = byGen[1];
    if (g1 && g1.length) {
      for (var s = 0; s < g1.length; s++) dfs([g1[s].id]);
    }
    return flags;
  }

  function buildPracticeWordGraph(wordsPayload, relPayload, msgPayload, gcPathLen) {
    var byGen = normalizeWordGenerationsByNum(wordsPayload);
    var wordGen = Object.create(null);
    var gk;
    for (gk in byGen) {
      if (!Object.prototype.hasOwnProperty.call(byGen, gk)) continue;
      var gn = parseIntSafe(gk, 0);
      var words = byGen[gk];
      for (var wi = 0; wi < words.length; wi++) {
        wordGen[words[wi].id] = gn;
      }
    }
    var rels = unwrapRelationsPayload(relPayload);
    if (!rels.length) rels = extractRelationsFromWordsPayload(wordsPayload);
    var adj = buildAdjacencyFromRelations(rels, wordGen);
    var edgeCount = 0;
    var ak;
    for (ak in adj) {
      if (!Object.prototype.hasOwnProperty.call(adj, ak)) continue;
      edgeCount += (adj[ak] && adj[ak].length) | 0;
    }
    var gc = parseIntSafe(gcPathLen, 1);
    if (gc < 1) gc = 1;
    var fullPathWordIds = computeFullPathWordIdFlags(byGen, adj, wordGen, edgeCount, gc);
    return {
      byGen: byGen,
      adj: adj,
      edgeCount: edgeCount,
      wordGen: wordGen,
      gc: gc,
      fullPathWordIds: fullPathWordIds,
      genMessages: parseWordGenMessagesPayload(msgPayload || {}),
    };
  }

  async function preloadPracticeWordGraph() {
    state.practiceWordGraph = null;
    var lid = state.taskWordListId | 0;
    if (!lid || !state.examWordSentencePhase) return;
    try {
      var wordsPayload = await api.getListWords(lid);
      var relPayload = [];
      var relLoadedOk = true;
      if (typeof api.getListWordRelations === 'function') {
        try {
          relPayload = await api.getListWordRelations(lid);
        } catch (e1) {
          relLoadedOk = false;
        }
      }
      var msgPayload = null;
      if (typeof api.getListWordGenMessages === 'function') {
        try {
          msgPayload = await api.getListWordGenMessages(lid);
        } catch (e2) {}
      }
      var gcPath =
        parseIntSafe(state.taskGenCount, 0) ||
        parseIntSafe(state.taskRow && (state.taskRow.generations_count || state.taskRow.generationsCount), 0) ||
        5;
      state.practiceWordGraph = buildPracticeWordGraph(wordsPayload, relPayload, msgPayload, gcPath);
      if (!relLoadedOk && extractRelationsFromWordsPayload(wordsPayload).length) relLoadedOk = true;
      if (state.practiceWordGraph) state.practiceWordGraph.relationsReliable = !!relLoadedOk;
    } catch (e) {
      state.practiceWordGraph = null;
    }
  }

  function countPracticeWordsFilled() {
    var o = state.practiceCellWordIds;
    if (!o) return 0;
    var n = 0;
    var k;
    for (k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k) && o[k]) n++;
    }
    return n;
  }

  function practiceWordIdsAllInGeneration(gen) {
    var g = state.practiceWordGraph;
    if (!g || !g.byGen[gen]) return null;
    var fp = g.fullPathWordIds && g.fullPathWordIds[gen];
    if (!fp) return [];
    var out = [];
    var k;
    for (k in fp) {
      if (Object.prototype.hasOwnProperty.call(fp, k) && fp[k]) {
        var idn = parseIntSafe(k, 0);
        if (idn) out.push(idn);
      }
    }
    return out;
  }

  function practiceHasAdjacentFilledPrevGen(col, row, gen) {
    var matrix = typeof window.matrix !== 'undefined' ? window.matrix : null;
    if (!matrix || typeof window.CELLAUTO_forEachBoardNeighbor !== 'function') return false;
    var ok = false;
    window.CELLAUTO_forEachBoardNeighbor(col, row, function (nx, ny) {
      if ((matrix[nx][ny] | 0) !== gen - 1) return;
      var map = ensurePracticeCellWordIdsMap();
      if (map[nx + ',' + ny]) ok = true;
    });
    return ok;
  }

  function practiceRelationHighlightIdsForCell(col, row, gen) {
    var g = state.practiceWordGraph;
    var matrix = typeof window.matrix !== 'undefined' ? window.matrix : null;
    if (!g || !matrix) return null;
    if (g.relationsReliable === false && gen > 1) return [];

    if (!g.edgeCount) return practiceWordIdsAllInGeneration(gen);

    if (gen <= 1) return practiceWordIdsAllInGeneration(1);

    var seen = Object.create(null);
    var out = [];
    function addId(id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    }

    if (typeof window.CELLAUTO_forEachBoardNeighbor !== 'function') return practiceWordIdsAllInGeneration(gen);

    window.CELLAUTO_forEachBoardNeighbor(col, row, function (nx, ny) {
      if ((matrix[nx][ny] | 0) !== gen - 1) return;
      var map = ensurePracticeCellWordIdsMap();
      var widPrev = map[nx + ',' + ny];
      if (!widPrev) return;
      var outs = g.adj[widPrev] || [];
      for (var i = 0; i < outs.length; i++) addId(outs[i]);
    });
    var fp = g.fullPathWordIds && g.fullPathWordIds[gen];
    if (fp) {
      var filtered = [];
      for (var f = 0; f < out.length; f++) {
        var oid = out[f];
        if (fp[oid]) filtered.push(oid);
      }
      return filtered;
    }
    return out;
  }

  function practiceWordIdFromLabel(wordStr, gen) {
    var g = state.practiceWordGraph;
    if (!g || !g.byGen[gen]) return 0;
    var words = g.byGen[gen];
    var s = String(wordStr || '').trim();
    for (var i = 0; i < words.length; i++) {
      if (words[i].word === s) return words[i].id;
    }
    return 0;
  }

  window.CELLAUTO_isPracticeWordSentencePhase = function () {
    return !!(
      state.active &&
      state.examWordSentencePhase &&
      (state.taskWordListId | 0) &&
      (state.mode === 'practice' || state.mode === 'exam')
    );
  };

  window.CELLAUTO_practiceWordPickGate = function (col, row) {
    if (!window.CELLAUTO_isPracticeWordSentencePhase()) return { ok: true, relationHighlightIds: null };

    var matrix = typeof window.matrix !== 'undefined' ? window.matrix : null;
    if (!matrix || !matrix[col]) return { ok: false, message: '', relationHighlightIds: null };

    var gen = matrix[col][row] | 0;
    if (gen <= 0) return { ok: false, message: 'Érvénytelen cella.', relationHighlightIds: null };

    var filled = countPracticeWordsFilled();

    if (filled === 0) {
      if (gen !== 1) return { ok: false, message: 'Előbb a GEN 1-gyel kezdj!', relationHighlightIds: null };
      return { ok: true, relationHighlightIds: practiceWordIdsAllInGeneration(1) };
    }

    if (gen === 1) return { ok: true, relationHighlightIds: practiceWordIdsAllInGeneration(1) };

    if (!practiceHasAdjacentFilledPrevGen(col, row, gen)) {
      // A szóválasztó ilyenkor is jelenjen meg, csak ne legyen relációs (zöld) ajánlás.
      return { ok: true, message: '', relationHighlightIds: [] };
    }

    return { ok: true, relationHighlightIds: practiceRelationHighlightIdsForCell(col, row, gen) };
  };

  window.CELLAUTO_onPracticeWordPicked = function (col, row, wordStr, highlightIds, ptrOpt) {
    if (!window.CELLAUTO_isPracticeWordSentencePhase()) return;
    var matrix = typeof window.matrix !== 'undefined' ? window.matrix : null;
    if (!matrix || !matrix[col]) return;
    var gen = matrix[col][row] | 0;
    var wid = practiceWordIdFromLabel(wordStr, gen);
    var map = ensurePracticeCellWordIdsMap();

    var valid;
    if (highlightIds === null || highlightIds === undefined) valid = true;
    else if (!highlightIds.length) valid = false;
    else valid = wid > 0 && highlightIds.indexOf(wid) >= 0;

    // Ha a választás nem érvényes reláció szerint, ne maradjon eltárolva:
    // így a következő GEN már nem kaphat ajánlást hibás láncra építve.
    if (valid && wid) map[col + ',' + row] = wid;
    else delete map[col + ',' + row];

    var gm =
      state.practiceWordGraph && state.practiceWordGraph.genMessages
        ? state.practiceWordGraph.genMessages[gen]
        : null;
    var cor = gm && gm.correct ? gm.correct : '';
    var inc = gm && gm.incorrect ? gm.incorrect : '';

    var msg;
    if (valid) {
      msg = cor || 'Helyes szó került be.';
    } else {
      msg = inc || 'Helytelen szó került be.';
    }

    /* Csak gyakorlás + bekapcsolt kapcsoló; vizsgán nem kellenek kattintásos GEN üzenetek. */
    if (state.mode !== 'practice' || !state.practiceKitoltesUzenetekEnabled) return;

    var ptr =
      ptrOpt && typeof ptrOpt.clientX === 'number'
        ? ptrOpt
        : typeof window.__cellautoLastPointer === 'object' && window.__cellautoLastPointer
          ? window.__cellautoLastPointer
          : null;
    if (ptr && typeof window.CELLAUTO_showPracticeCellHint === 'function') {
      window.CELLAUTO_showPracticeCellHint(ptr, msg);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, 4200);
    }
  };

  window.CELLAUTO_practiceWordIdForLabel = practiceWordIdFromLabel;

  window.CELLAUTO_practiceFillHelpActive = function () {
    return !!state.practiceFillHelpEnabled;
  };

  function updateExamPracticeFillHelpToggle() {
    var wrap = $('examPracticeHelpWrap');
    var chk = $('examPracticeFillHelp');
    var chkMsg = $('examPracticeKitoltesMessages');
    if (!wrap || !chk) return;
    var show = !!(state.active && state.mode === 'practice' && (state.taskWordListId | 0));
    wrap.hidden = !show;
    if (show) {
      chk.checked = !!state.practiceFillHelpEnabled;
      if (chkMsg) chkMsg.checked = !!state.practiceKitoltesUzenetekEnabled;
    }
  }

  window.CELLAUTO_examEditBlockedReason = function (col, row) {
    if (!state.active) return '';
    if (state.evaluationDone) return 'done';
    if (state.mode === 'exam' && !state.examSessionStarted) return 'not_started';
    if (!state.frozenCells) return '';
    return state.frozenCells[col + ',' + row] ? 'frozen' : '';
  };

  /** Szómondatos fázisban a kiinduló cellákra is lehet szót írni (vizsga). */
  window.CELLAUTO_examAllowFrozenWordFill = function () {
    return !!(state.active && state.examWordSentencePhase);
  };

  /** Vizsga szófázis: mindig a gyors helyi szóválasztó (mint a Gyors szóválasztó). */
  window.CELLAUTO_examUseWordQuickPicker = function () {
    return !!(state.active && state.examWordSentencePhase);
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
    /* Gyakorlás: Good/Bad cell számláló ne foglaljon helyet — a sejtrács kész/feladat aktív közben nem kell. */
    if (state.active && state.mode === 'practice' && wrap) wrap.hidden = true;
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

  /**
   * Gratuláló overlay ankor: négyzethez <table>, hexhez a méz konténere (`.hexagon-wrapper__hexagon-container`),
   * hogy a középre igazítás a valódi rács téglalapjára essen.
   */
  function resolveExamCelebrationAnchorEl(bd) {
    if (!bd) return null;
    var hexHoney = bd.querySelector('.hexagon-wrapper__hexagon-container');
    if (hexHoney) return hexHoney;
    var tbl = bd.querySelector('table');
    if (tbl) return tbl;
    return bd.firstElementChild || null;
  }

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
    var grid = resolveExamCelebrationAnchorEl(bd);
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
    var boardStage = document.querySelector('.board-stage');
    if (boardStage) {
      scrollRoots.push(boardStage);
      boardStage.addEventListener('scroll', onScrollOrResize, scrollOpts);
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

  /** Vizsgán a Kilépés csak indulás előtt; gyakorlásnál kiértékelésig látszik; kiértékelés után a befejezés gomb marad. */
  function updateExamExitBackButtonVisibility() {
    var wrap = $('examExitBackWrap');
    if (!wrap) return;
    if (!state.active || state.evaluationDone) {
      wrap.hidden = true;
      return;
    }
    if (state.mode === 'practice') {
      wrap.hidden = false;
      return;
    }
    wrap.hidden = !!(state.mode === 'exam' && state.examSessionStarted);
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
    updateExamWordSentenceGate();
    updateExamExitBackButtonVisibility();
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

  function extractWordListNotesFromTask(task) {
    if (!task || typeof task !== 'object') return '';
    var wl = task.word_list || task.wordList;
    if (wl && wl.notes != null && String(wl.notes).trim()) return String(wl.notes).trim();
    if (task.word_list_notes != null && String(task.word_list_notes).trim())
      return String(task.word_list_notes).trim();
    if (task.wordListNotes != null && String(task.wordListNotes).trim())
      return String(task.wordListNotes).trim();
    return '';
  }

  function syncExamTaskWordListNotesDom() {
    var box = $('examTaskWordListNotes');
    if (!box) return;
    var txt = state.taskWordListNotes ? String(state.taskWordListNotes).trim() : '';
    var ro = $('examTaskWordListReadonly');
    var locked = ro && !ro.hidden;
    if (!txt || !locked) {
      box.hidden = true;
      if (!locked) box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = txt;
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

  function setExamMetaWordListFromTask(task) {
    var wlDd = $('examMetaWordList');
    if (!wlDd) return;
    var t = task || state.taskRow;
    var wlName = String(
      (state.taskWordListName && String(state.taskWordListName).trim()) ||
        (t && (t.word_list_name || t.wordListName || (t.word_list && t.word_list.name))) ||
        ''
    ).trim();
    var wlId = state.taskWordListId | 0;
    if (!wlName && wlId) {
      var sel = $('wordListSelect');
      if (sel) {
        var opt = sel.querySelector('option[value="' + String(wlId) + '"]');
        if (opt) {
          var fromOpt = String(opt.textContent || '').replace(/\s+/g, ' ').trim();
          if (fromOpt) wlName = fromOpt;
        }
      }
    }
    if (wlName) wlDd.textContent = wlName;
    else if (wlId) wlDd.textContent = 'Lista #' + wlId;
    else wlDd.textContent = '—';
  }

  window.CELLAUTO_refreshExamMetaWordList = function () {
    if (!state.active) return;
    setExamMetaWordListFromTask(state.taskRow);
  };

  function normalizeWordGenerationsByNum(data) {
    var raw = [];
    if (data && Array.isArray(data.generations)) raw = data.generations;
    else if (data && data.data && Array.isArray(data.data.generations)) raw = data.data.generations;
    var byGen = Object.create(null);
    for (var i = 0; i < raw.length; i++) {
      var block = raw[i];
      var gn = parseIntSafe(block.generation, 0);
      if (gn < 1) continue;
      var words = Array.isArray(block.words) ? block.words : [];
      var arr = [];
      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        var wid = w && w.id != null ? parseIntSafe(w.id, 0) : 0;
        if (!wid) continue;
        arr.push({ id: wid, word: String(w.word || '').trim() });
      }
      if (arr.length) byGen[gn] = arr;
    }
    return byGen;
  }

  function unwrapRelationsPayload(d) {
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.relations)) return d.relations;
    return [];
  }

  function extractRelationsFromWordsPayload(wordsPayload) {
    var out = [];
    var gens =
      wordsPayload && Array.isArray(wordsPayload.generations)
        ? wordsPayload.generations
        : wordsPayload && wordsPayload.data && Array.isArray(wordsPayload.data.generations)
          ? wordsPayload.data.generations
          : [];
    for (var gi = 0; gi < gens.length; gi++) {
      var row = gens[gi];
      var words = row && Array.isArray(row.words) ? row.words : [];
      for (var wi = 0; wi < words.length; wi++) {
        var w = words[wi] || {};
        var fromId = parseIntSafe(w.id, 0);
        if (!fromId) continue;
        var candidates = [];
        if (Array.isArray(w.to_word_ids)) candidates = w.to_word_ids.slice();
        else if (Array.isArray(w.toWordIds)) candidates = w.toWordIds.slice();
        else if (Array.isArray(w.relations)) candidates = w.relations.slice();
        else if (Array.isArray(w.to_words)) candidates = w.to_words.slice();
        else if (Array.isArray(w.toWords)) candidates = w.toWords.slice();
        for (var ci = 0; ci < candidates.length; ci++) {
          var c = candidates[ci];
          var toId =
            typeof c === 'object' && c
              ? parseIntSafe(
                  c.to_word_id != null
                    ? c.to_word_id
                    : c.toWordId != null
                      ? c.toWordId
                      : c.id != null
                        ? c.id
                        : c.to_id != null
                          ? c.to_id
                          : c.toId,
                  0
                )
              : parseIntSafe(c, 0);
          if (!toId) continue;
          out.push({ from_word_id: fromId, to_word_id: toId });
        }
      }
    }
    return out;
  }

  function buildAdjacencyFromRelations(relations, wordGen) {
    var adj = Object.create(null);
    function pickRelationWordId(row, side) {
      if (!row || typeof row !== 'object') return 0;
      var directSnake = row[side + '_word_id'];
      var directCamel = row[side + 'WordId'];
      var directShortSnake = row[side + '_id'];
      var directShortCamel = row[side + 'Id'];
      var nestedWord = row[side + '_word'] && typeof row[side + '_word'] === 'object' ? row[side + '_word'].id : null;
      var nestedShort = row[side] && typeof row[side] === 'object' ? row[side].id : null;
      var raw =
        directSnake != null
          ? directSnake
          : directCamel != null
            ? directCamel
            : directShortSnake != null
              ? directShortSnake
              : directShortCamel != null
                ? directShortCamel
                : nestedWord != null
                  ? nestedWord
                  : nestedShort;
      return parseIntSafe(raw, 0);
    }
    for (var i = 0; i < relations.length; i++) {
      var r = relations[i];
      var fromId = pickRelationWordId(r, 'from');
      var toId = pickRelationWordId(r, 'to');
      if (!fromId || !toId) continue;
      var gFrom = wordGen[fromId];
      var gTo = wordGen[toId];
      if (!gFrom || !gTo || gTo !== gFrom + 1) continue;
      if (!adj[fromId]) adj[fromId] = [];
      adj[fromId].push(toId);
    }
    var k;
    for (k in adj) {
      if (!Object.prototype.hasOwnProperty.call(adj, k)) continue;
      var seen = Object.create(null);
      var lst = adj[k];
      var out = [];
      for (var t = 0; t < lst.length; t++) {
        var id = lst[t];
        if (seen[id]) continue;
        seen[id] = true;
        out.push(id);
      }
      adj[k] = out;
    }
    return adj;
  }

  function countDistinctRelationPaths(adj, gc, gen1Ids) {
    var sigs = Object.create(null);
    function walk(path) {
      if (path.length === gc) {
        sigs[path.join('|')] = true;
        return;
      }
      var cur = path[path.length - 1];
      var outs = adj[cur];
      if (!outs || !outs.length) return;
      for (var i = 0; i < outs.length; i++) {
        walk(path.concat([outs[i]]));
      }
    }
    if (!gen1Ids || !gen1Ids.length) return 0;
    for (var s = 0; s < gen1Ids.length; s++) {
      walk([gen1Ids[s]]);
    }
    return Object.keys(sigs).length;
  }

  function cartesianSentenceCount(byGen, gc) {
    var n = 1;
    for (var g = 1; g <= gc; g++) {
      var row = byGen[g];
      if (!row || !row.length) return 0;
      n *= row.length;
    }
    return n;
  }

  function hideExamWordSentenceMetaRows() {
    var els = document.querySelectorAll('.exam-meta-sentrows');
    for (var i = 0; i < els.length; i++) els[i].hidden = true;
    state.examAvailableSentences = 0;
    state.examEmbeddableSentences = 0;
  }

  async function refreshExamWordSentenceMeta(task, gc, ref) {
    var sAvail = $('examMetaAvailableSentences');
    var sEmb = $('examMetaEmbeddableSentences');
    var wlId = parseIntSafe(task && (task.word_list_id || task.wordListId), 0);
    if (!wlId) {
      hideExamWordSentenceMetaRows();
      if (sAvail) sAvail.textContent = '—';
      if (sEmb) sEmb.textContent = '—';
      return;
    }
    try {
      var wordsPayload = await api.getListWords(wlId);
      var relPayload = [];
      if (typeof api.getListWordRelations === 'function') {
        try {
          relPayload = await api.getListWordRelations(wlId);
        } catch (eRel) {
          relPayload = [];
        }
      }
      var byGen = normalizeWordGenerationsByNum(wordsPayload);
      var wordGen = Object.create(null);
      var gk;
      for (gk in byGen) {
        if (!Object.prototype.hasOwnProperty.call(byGen, gk)) continue;
        var gn = parseIntSafe(gk, 0);
        var words = byGen[gk];
        for (var wi = 0; wi < words.length; wi++) {
          wordGen[words[wi].id] = gn;
        }
      }

      var spatialCount =
        typeof window.CELLAUTO_countSpatialGenerationPaths === 'function'
          ? window.CELLAUTO_countSpatialGenerationPaths(ref, gc)
          : 0;

      var incomplete = false;
      var r;
      for (r = 1; r <= gc; r++) {
        if (!byGen[r] || !byGen[r].length) incomplete = true;
      }

      /* Szó-reláció szerinti különálló mondat-útak száma (1…gc szavas láncok a listában) */
      var wordSentenceCount = 0;
      if (!incomplete) {
        var rels = unwrapRelationsPayload(relPayload);
        if (!rels.length) rels = extractRelationsFromWordsPayload(wordsPayload);
        var adj = buildAdjacencyFromRelations(rels, wordGen);
        var edgeCount = 0;
        var ak;
        for (ak in adj) {
          if (!Object.prototype.hasOwnProperty.call(adj, ak)) continue;
          edgeCount += (adj[ak] && adj[ak].length) | 0;
        }
        if (edgeCount === 0) {
          wordSentenceCount = cartesianSentenceCount(byGen, gc);
        } else {
          var g1ids = byGen[1].map(function (w) {
            return w.id;
          });
          wordSentenceCount = countDistinctRelationPaths(adj, gc, g1ids);
        }
      }

      /* Lehetséges = szólista-reláció szerinti mondatútak száma, ha van rács-lánc.
         Kinyerhető = GEN1…GENgc rács-láncok darabszáma a táblán. */
      var wordPossible = spatialCount > 0 ? wordSentenceCount : 0;

      state.examAvailableSentences = wordPossible;
      state.examEmbeddableSentences = spatialCount;

      if (sAvail) sAvail.textContent = String(wordPossible);
      if (sEmb) sEmb.textContent = String(spatialCount);

      var els = document.querySelectorAll('.exam-meta-sentrows');
      for (var i = 0; i < els.length; i++) els[i].hidden = false;
    } catch (e) {
      hideExamWordSentenceMetaRows();
      if (sAvail) sAvail.textContent = '—';
      if (sEmb) sEmb.textContent = '—';
    }
  }

  function fillMeta(task, gc) {
    $('examMetaName').textContent = task.name || 'Feladat #' + task.id;
    $('examMetaAuthor').textContent = examAuthorName(task);
    var whenEl = $('examMetaWhen');
    if (whenEl) whenEl.textContent = examTaskWhenLabel(task);
    $('examMetaLevel').textContent = task.level || '—';
    $('examMetaGenMode').textContent = neighborLabel($('neighbors') && $('neighbors').value);
    $('examMetaGenCount').textContent = String(gc);
    setExamMetaWordListFromTask(task);
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
      updateExamWordSentenceGate();
      return;
    }

    if ((newV | 0) <= 0) {
      updateExamWordSentenceGate();
      return;
    }
    if (!practice) {
      updateStatsDom();
      updateExamWordSentenceGate();
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
      updateExamWordSentenceGate();
      return;
    }
    if (!fillable) {
      updateStatsDom();
      updateExamWordSentenceGate();
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
    updateExamWordSentenceGate();
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
    var nf = $('examTaskNameFilter');
    var q = nf && nf.value ? String(nf.value).trim().toLowerCase() : '';
    if (!q) return out;
    var outName = [];
    for (var k = 0; k < out.length; k++) {
      var rr = out[k];
      var tt = rr.save;
      var lab = formatTaskListLabel(rr, tt).toLowerCase();
      var nm = (tt.name || '').toLowerCase();
      var gn = (rr.groupName || '').toLowerCase();
      var lvl = tt.level ? String(tt.level).toLowerCase() : '';
      if (
        lab.indexOf(q) >= 0 ||
        nm.indexOf(q) >= 0 ||
        gn.indexOf(q) >= 0 ||
        lvl.indexOf(q) >= 0
      )
        outName.push(rr);
    }
    return outName;
  }

  function refreshExamTaskSelect() {
    var sel = $('examTaskSelect');
    if (!sel) return;
    var prevVal = sel.value;
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
    if (prevVal && sel.querySelector('option[value="' + prevVal + '"]')) sel.value = prevVal;
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
    if (!rows.length && typeof api.getAllTaskSaves === 'function') {
      var flat = [];
      try {
        flat = await api.getAllTaskSaves();
      } catch (e) {
        flat = [];
      }
      for (var k = 0; k < flat.length; k++) {
        var s = flat[k] || {};
        var gidFlat = parseIntSafe(
          s.task_save_group_id != null
            ? s.task_save_group_id
            : s.group_id != null
              ? s.group_id
              : s.groupId,
          0
        );
        var gnameFlat = String(
          s.task_save_group_name || s.group_name || s.groupName || (gidFlat ? 'Csoport #' + gidFlat : '')
        ).trim();
        rows.push({ groupId: gidFlat, groupName: gnameFlat, save: s });
      }
      if (rows.length) {
        var seen = Object.create(null);
        var merged = groups.slice();
        for (var m = 0; m < rows.length; m++) {
          var r = rows[m];
          if (!(r.groupId > 0) || seen[r.groupId]) continue;
          seen[r.groupId] = true;
          if (!merged.some(function (g) { return (g && g.id) === r.groupId; })) {
            merged.push({ id: r.groupId, name: r.groupName || 'Csoport #' + r.groupId });
          }
        }
        populateGroupFilter(merged);
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
    if (!sid) return null;
    var data;
    if (gid > 0) data = await api.getTaskSave(gid, sid);
    else if (typeof api.getTaskSaveById === 'function') data = await api.getTaskSaveById(sid);
    else return null;
    var task = unwrapEntity(data);
    return { groupId: gid, task: task };
  }

  function restoreWordListPickerPlacement() {
    var w = $('wordListPickerWrap');
    if (!w || !state.wordListPickerRestoreParent) return;
    var parent = state.wordListPickerRestoreParent;
    var next = state.wordListPickerRestoreNext;
    try {
      if (next && next.parentNode === parent) parent.insertBefore(w, next);
      else parent.appendChild(w);
    } catch (e) {}
    state.wordListPickerRestoreParent = null;
    state.wordListPickerRestoreNext = null;
  }

  function releaseExamWordListLockedUi() {
    var ro = $('examTaskWordListReadonly');
    var lab = $('wordListSelectLabel');
    var sel = $('wordListSelect');
    if (ro) ro.hidden = true;
    if (lab) lab.hidden = false;
    if (sel) {
      sel.hidden = false;
      sel.removeAttribute('aria-hidden');
      sel.disabled = false;
    }
    syncExamTaskWordListNotesDom();
  }

  function resolveTaskWordListDisplayName() {
    var raw = state.taskWordListName ? String(state.taskWordListName).trim() : '';
    if (raw) return raw;
    var wlSel = $('wordListSelect');
    if (wlSel && wlSel.selectedIndex >= 0 && wlSel.options[wlSel.selectedIndex]) {
      var t = String(wlSel.options[wlSel.selectedIndex].textContent || '').trim();
      if (t) return t;
    }
    var id = state.taskWordListId | 0;
    return id ? 'Lista #' + id : '—';
  }

  function applyExamWordListLockedUi() {
    var ro = $('examTaskWordListReadonly');
    var nm = $('examTaskWordListName');
    var lab = $('wordListSelectLabel');
    var sel = $('wordListSelect');
    if (nm) nm.textContent = resolveTaskWordListDisplayName();
    if (ro) ro.hidden = false;
    if (lab) lab.hidden = true;
    if (sel) {
      sel.hidden = true;
      sel.setAttribute('aria-hidden', 'true');
      sel.disabled = true;
    }
    syncExamTaskWordListNotesDom();
  }

  function showExamCellToWordAnimation(done) {
    var overlay = document.createElement('div');
    overlay.className = 'exam-word-phase-overlay';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML =
      '<div class="exam-word-phase-overlay__card">' +
      '<div class="exam-word-phase-overlay__title">Teljesítetted a cella módot</div>' +
      '<div class="exam-word-phase-overlay__sub">Következik a szó mód…</div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('exam-word-phase-overlay--visible');
      });
    });
    var dismissMs = 1850;
    setTimeout(function () {
      overlay.classList.add('exam-word-phase-overlay--exit');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (typeof done === 'function') done();
      }, 360);
    }, dismissMs);
  }

  /** Vizsga + gyakorlás: teljes rács + szólista után animáció, majd szó mód (gomb nélkül). Vizsgán csak Session indítása után. */
  /** Szólista nélkül + teljes rács: egyetlen automatikus kiértékelés (vizsgán csak elindítás után). */
  function scheduleAutoEvaluateNoWordlist() {
    if (!state.active || state.evaluationDone) return;
    if (state.taskWordListId | 0) return;
    if (typeof window.CELLAUTO_matrixMatchesExamRef !== 'function' || !window.CELLAUTO_matrixMatchesExamRef(state.refMatrix)) return;
    if (state.mode === 'exam' && !state.examSessionStarted) return;
    if (state.examAutoNoWordlistEvalTriggered) return;
    state.examAutoNoWordlistEvalTriggered = true;
    setTimeout(function () {
      if (!state.active || state.evaluationDone) return;
      if (state.taskWordListId | 0) return;
      if (typeof window.CELLAUTO_matrixMatchesExamRef === 'function' && !window.CELLAUTO_matrixMatchesExamRef(state.refMatrix)) return;
      onEvaluate();
    }, 400);
  }

  function scheduleAutoWordTransition() {
    if (state.examWordSentencePhase || state.evaluationDone) return;
    if (state.examAutoWordTriggered) return;
    if (!(state.taskWordListId | 0)) return;
    if (typeof window.CELLAUTO_matrixMatchesExamRef !== 'function' || !window.CELLAUTO_matrixMatchesExamRef(state.refMatrix)) return;
    if (state.mode === 'exam' && !state.examSessionStarted) return;
    state.examAutoWordTriggered = true;
    var gate = $('examWordSentenceGate');
    if (gate) gate.hidden = true;
    /* Nincs kitöltendő cella (total_good_cell === 0): nem volt cella feladat, ezért nincs átvezető overlay. */
    if ((state.possible | 0) === 0) {
      activateWordSentenceMode();
      return;
    }
    showExamCellToWordAnimation(function () {
      activateWordSentenceMode();
    });
  }

  function restoreExamSentenceUiHard() {
    releaseExamWordListLockedUi();
    restoreWordListPickerPlacement();
    state.examWordSentencePhase = false;
    state.examIdleNothingToComplete = false;
    state.examAutoWordTriggered = false;
    state.examAutoNoWordlistEvalTriggered = false;
    var slot = $('examWordPickerSlot');
    var gen = $('examGenPicker');
    var gate = $('examWordSentenceGate');
    if (slot) slot.hidden = true;
    if (gen) gen.hidden = false;
    if (gate) gate.hidden = true;
  }

  function updateExamWordSentenceGate() {
    var gate = $('examWordSentenceGate');
    var msg = $('examWordSentenceGateMsg');
    var btn = $('examBtnWordSentences');
    var genPick = $('examGenPicker');
    var fw = $('examFinishWrap');
    var startW = $('examStartWrap');
    var startBtn = $('examBtnStart');
    var evB = $('examBtnEvaluate');
    if (!gate || !msg || !btn) return;

    if (!state.active || state.evaluationDone) {
      gate.hidden = true;
      return;
    }
    if (state.examWordSentencePhase) {
      gate.hidden = true;
      return;
    }

    var ref = state.refMatrix;
    var full =
      typeof window.CELLAUTO_matrixMatchesExamRef === 'function' &&
      window.CELLAUTO_matrixMatchesExamRef(ref);
    var wlid = state.taskWordListId | 0;

    if (full && !wlid) {
      state.examIdleNothingToComplete = true;
      gate.hidden = false;
      btn.hidden = true;
      if (genPick) genPick.hidden = true;

      var canEval = state.mode !== 'exam' || state.examSessionStarted;
      if (state.mode === 'exam' && !state.examSessionStarted) {
        msg.textContent =
          'Nincs szólista — a rács már teljes. Indítsd el a vizsgát; utána automatikusan lefut az értékelés (vagy használd az Evaluation gombot).';
        if (startW) startW.hidden = false;
        if (startBtn) startBtn.hidden = false;
        if (evB) {
          evB.disabled = true;
          evB.setAttribute('aria-disabled', 'true');
        }
      } else {
        gate.hidden = true;
        if (msg) msg.textContent = '';
        if (startW) startW.hidden = true;
        if (startBtn) startBtn.hidden = true;
        if (evB) {
          evB.disabled = false;
          evB.removeAttribute('aria-disabled');
        }
        scheduleAutoEvaluateNoWordlist();
      }

      if (fw) fw.hidden = false;
      return;
    }

    state.examIdleNothingToComplete = false;

    if (full && wlid) {
      btn.hidden = true;
      if (state.mode === 'exam' && !state.examSessionStarted) {
        gate.hidden = false;
        msg.textContent =
          'Indítsd el a vizsgát — ezután automatikusan indul a szólistás rész.';
        if (genPick) genPick.hidden = false;
        if (fw) fw.hidden = true;
        return;
      }
      gate.hidden = true;
      msg.textContent = '';
      if (genPick) genPick.hidden = false;
      if (fw) fw.hidden = true;
      scheduleAutoWordTransition();
      return;
    }

    gate.hidden = true;
  }

  window.CELLAUTO_updateExamWordSentenceGate = updateExamWordSentenceGate;

  function activateWordSentenceMode() {
    if (!state.active || state.evaluationDone) return;
    if (state.mode === 'exam' && !state.examSessionStarted) {
      if (typeof window.showToast === 'function') window.showToast('Előbb indítsd el a vizsgát.', 3800);
      return;
    }
    var w = $('wordListPickerWrap');
    var slot = $('examWordPickerSlot');
    var genPick = $('examGenPicker');
    var gate = $('examWordSentenceGate');
    if (!w || !slot) return;

    state.examWordSentencePhase = true;
    if (!state.wordListPickerRestoreParent) {
      state.wordListPickerRestoreParent = w.parentNode;
      state.wordListPickerRestoreNext = w.nextSibling;
    }
    slot.appendChild(w);
    w.hidden = false;
    slot.hidden = false;
    if (genPick) genPick.hidden = true;
    if (gate) gate.hidden = true;

    var wlSel = $('wordListSelect');
    if (wlSel && state.taskWordListId) {
      var vs = String(state.taskWordListId);
      if (wlSel.querySelector('option[value="' + vs + '"]')) {
        wlSel.value = vs;
        wlSel.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (typeof window.showToast === 'function') {
        window.showToast('A feladathoz rendelt szólista nem szerepel a legördülőben.', 5200);
      }
    }

    var wm = $('word_mode');
    if (wm) {
      wm.value = 'word';
      wm.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var wr = $('wordModeWord');
    var wms = $('wordModeSelect');
    if (wr) wr.checked = true;
    if (wms) wms.checked = false;

    var tries = 0;
    function finishWordSentenceActivation() {
      state.practiceCellWordIds = Object.create(null);
      state.practiceWordGraph = null;
      preloadPracticeWordGraph();
      applyExamWordListLockedUi();
      if (typeof window.reDrawTable === 'function') window.reDrawTable();
    }
    function waitForWordLevels() {
      var lev1 = document.getElementById('lev1');
      if (lev1 && lev1.options && lev1.options.length) {
        finishWordSentenceActivation();
        return;
      }
      if (tries++ >= 80) {
        finishWordSentenceActivation();
        return;
      }
      setTimeout(waitForWordLevels, 25);
    }
    waitForWordLevels();
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

    restoreExamSentenceUiHard();

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
    state.taskWordListId = parseIntSafe(task.word_list_id || task.wordListId, 0);
    state.taskGenCount = gc;
    state.taskWordListName = String(
      task.word_list_name || task.wordListName || (task.word_list && task.word_list.name) || ''
    ).trim();
    state.taskWordListNotes = extractWordListNotesFromTask(task);
    state.examAutoWordTriggered = false;
    state.examAutoNoWordlistEvalTriggered = false;

    if ((state.taskWordListId | 0) && !state.taskWordListNotes) {
      try {
        var lrNotes = await api.getList(state.taskWordListId);
        var listEnt = unwrapEntity(lrNotes);
        if (listEnt && listEnt.notes != null && String(listEnt.notes).trim())
          state.taskWordListNotes = String(listEnt.notes).trim();
      } catch (e) {}
    }
    syncExamTaskWordListNotesDom();

    fillMeta(task, gc);
    await refreshExamWordSentenceMeta(task, gc, state.refMatrix);
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
      if (pc) pc.hidden = true;
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
    var examEvalActions = $('sidebarExamPanel') &&
      $('sidebarExamPanel').querySelector('.exam-eval-actions');
    if (examEvalActions) examEvalActions.hidden = false;
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
    updateExamPracticeFillHelpToggle();

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
    updateExamWordSentenceGate();
    updateExamExitBackButtonVisibility();
  }

  function completedSecondsForApi() {
    if (state.mode === 'practice') return state.practiceElapsed;
    return Math.max(0, state.timeLimit - state.examRemaining);
  }

  function wordLabelForIdFromGraph(graph, wid) {
    var id = parseIntSafe(wid, 0);
    if (!id || !graph || !graph.byGen) return '';
    var maxG = parseIntSafe(graph.gc, 1);
    var g;
    for (g = 1; g <= maxG; g++) {
      var words = graph.byGen[g];
      if (!words) continue;
      for (var i = 0; i < words.length; i++) {
        if (words[i].id === id) return String(words[i].word || '').trim();
      }
    }
    return '';
  }

  function resolveWordIdForSentenceEval(col, row, gen) {
    var map = state.practiceCellWordIds;
    if (map && map[col + ',' + row]) return map[col + ',' + row];
    var txt =
      typeof window.CELLAUTO_getCellDisplayedWordText === 'function'
        ? window.CELLAUTO_getCellDisplayedWordText(col, row)
        : '';
    return practiceWordIdFromLabel(txt, gen);
  }

  function sentenceChainWordIdsValid(ids, graph) {
    if (!ids || !ids.length || !graph) return false;
    var ec = graph.edgeCount | 0;
    var i;
    if (ec === 0) {
      for (i = 0; i < ids.length; i++) if (!(parseIntSafe(ids[i], 0) > 0)) return false;
      return true;
    }
    var adj = graph.adj || {};
    for (i = 0; i < ids.length - 1; i++) {
      var outs = adj[ids[i]] || [];
      if (outs.indexOf(ids[i + 1]) < 0) return false;
    }
    return true;
  }

  async function ensureWordGraphForSentenceEvaluation() {
    var lid = state.taskWordListId | 0;
    if (!lid) return null;
    var gcPath =
      parseIntSafe(state.taskGenCount, 0) ||
      parseIntSafe(state.taskRow && (state.taskRow.generations_count || state.taskRow.generationsCount), 0) ||
      5;
    try {
      var wordsPayload = await api.getListWords(lid);
      var relPayload = [];
      var relLoadedOk = true;
      if (typeof api.getListWordRelations === 'function') {
        try {
          relPayload = await api.getListWordRelations(lid);
        } catch (eR) {
          relLoadedOk = false;
        }
      }
      var msgPayload = null;
      if (typeof api.getListWordGenMessages === 'function') {
        try {
          msgPayload = await api.getListWordGenMessages(lid);
        } catch (eM) {}
      }
      state.practiceWordGraph = buildPracticeWordGraph(wordsPayload, relPayload, msgPayload, gcPath);
      if (!relLoadedOk && extractRelationsFromWordsPayload(wordsPayload).length) relLoadedOk = true;
      if (state.practiceWordGraph) state.practiceWordGraph.relationsReliable = !!relLoadedOk;
      return state.practiceWordGraph;
    } catch (e) {
      return null;
    }
  }

  async function computeSentenceEvaluationSummary(refMatrix) {
    var gc = parseIntSafe(state.taskGenCount, 0);
    var wlId = state.taskWordListId | 0;
    if (!wlId || gc < 1 || !refMatrix) return null;
    var graph = await ensureWordGraphForSentenceEvaluation();
    if (!graph) return null;
    var paths =
      typeof window.CELLAUTO_enumerateSpatialGenerationPaths === 'function'
        ? window.CELLAUTO_enumerateSpatialGenerationPaths(refMatrix, gc)
        : [];
    var embeddable = paths.length;
    var validInstances = [];
    var wrongInstances = [];
    var p;
    for (p = 0; p < paths.length; p++) {
      var path = paths[p];
      if (!path || path.length !== gc) continue;
      var ids = [];
      var step;
      for (step = 0; step < gc; step++) {
        var pt = path[step];
        var gen = step + 1;
        var wid = resolveWordIdForSentenceEval(pt.x, pt.y, gen);
        ids.push(wid | 0);
      }
      var full = true;
      var ii;
      for (ii = 0; ii < ids.length; ii++) {
        if (!(ids[ii] > 0)) {
          full = false;
          break;
        }
      }
      var chainOk = full && sentenceChainWordIdsValid(ids, graph);
      if (chainOk) {
        validInstances.push(ids);
        continue;
      }
      /* Hibás mondat: végig ki van töltve, de a relációs lánc nem helyes (részleges útvonalak nem számítanak). */
      if (full) wrongInstances.push(ids);
    }
    var wrongSentencePaths = wrongInstances.length;
    var totalValid = validInstances.length;
    var sigMap = Object.create(null);
    for (var vi = 0; vi < validInstances.length; vi++) {
      var sig = validInstances[vi].join('|');
      sigMap[sig] = (sigMap[sig] || 0) + 1;
    }
    var uniqKeys = Object.keys(sigMap);
    var uniqueCount = uniqKeys.length;
    var duplicateValidCount = Math.max(0, totalValid - uniqueCount);
    var pct = embeddable > 0 ? Math.round((uniqueCount / embeddable) * 100) : null;

    function fmtSentence(idsArr) {
      var parts = [];
      for (var ii = 0; ii < idsArr.length; ii++) {
        parts.push(wordLabelForIdFromGraph(graph, idsArr[ii]) || '?');
      }
      return parts.join(' → ');
    }

    uniqKeys.sort();
    var listHtml = '';
    for (var li = 0; li < uniqKeys.length; li++) {
      var sigKey = uniqKeys[li];
      var idsArr = sigKey.split('|').map(function (x) {
        return parseIntSafe(x, 0);
      });
      var cnt = sigMap[sigKey];
      listHtml +=
        '<li class="exam-eval-sentence-li">' +
        escapeExamSummaryHtml(fmtSentence(idsArr)) +
        (cnt > 1 ? ' <span class="exam-eval-sentence-dup">(×' + cnt + ')</span>' : '') +
        '</li>';
    }

    var wrongSigMap = Object.create(null);
    for (var wj = 0; wj < wrongInstances.length; wj++) {
      var wsig = wrongInstances[wj].join('|');
      wrongSigMap[wsig] = (wrongSigMap[wsig] || 0) + 1;
    }
    var wrongKeys = Object.keys(wrongSigMap);
    wrongKeys.sort();
    var wrongListHtml = '';
    for (var wk = 0; wk < wrongKeys.length; wk++) {
      var wSigKey = wrongKeys[wk];
      var wIdsArr = wSigKey.split('|').map(function (x) {
        return parseIntSafe(x, 0);
      });
      var wCnt = wrongSigMap[wSigKey];
      wrongListHtml +=
        '<li class="exam-eval-sentence-li">' +
        escapeExamSummaryHtml(fmtSentence(wIdsArr)) +
        (wCnt > 1 ? ' <span class="exam-eval-sentence-dup">(×' + wCnt + ')</span>' : '') +
        '</li>';
    }

    var srLines = [];
    srLines.push('Egyedi mondatok:');
    if (uniqKeys.length) {
      for (var sri = 0; sri < uniqKeys.length; sri++) {
        var srSig = uniqKeys[sri];
        var srIds = srSig.split('|').map(function (x) {
          return parseIntSafe(x, 0);
        });
        var srCnt = sigMap[srSig];
        srLines.push(
          fmtSentence(srIds) + (srCnt > 1 ? ' (×' + srCnt + ')' : '')
        );
      }
    } else {
      srLines.push('Nincs egyedi mondat a listában.');
    }
    srLines.push('Helytelen mondatok listája:');
    if (wrongKeys.length) {
      for (var srj = 0; srj < wrongKeys.length; srj++) {
        var wrSig = wrongKeys[srj];
        var wrIds = wrSig.split('|').map(function (x) {
          return parseIntSafe(x, 0);
        });
        var wrCnt = wrongSigMap[wrSig];
        srLines.push(
          fmtSentence(wrIds) + (wrCnt > 1 ? ' (×' + wrCnt + ')' : '')
        );
      }
    } else {
      srLines.push('Nincs helytelen mondat.');
    }
    var sentenceResultText = srLines.join('\n');

    var block =
      '<div class="exam-eval-sentence" role="region" aria-label="Mondatok kiértékelése">' +
      '<h4 class="exam-eval-sentence-title">Mondatok kiértékelése</h4>' +
      '<p class="exam-eval-sentence-hero">' +
      '<span class="exam-eval-sentence-hero-label">Teljesítés:</span> ' +
      '<span class="exam-eval-sentence-hero-pct">' +
      (pct !== null ? pct + '%' : '—') +
      '</span></p>' +
      '<div class="exam-eval-sentence-stats">' +
      '<div class="exam-eval-sentence-stats__row">' +
      '<span class="exam-eval-sentence-stats__label">Kinyerhető mondatok száma:</span>' +
      '<span class="exam-eval-sentence-stats__num">' +
      embeddable +
      '</span></div>' +
      '<div class="exam-eval-sentence-stats__row">' +
      '<span class="exam-eval-sentence-stats__label">Egyedi mondatok száma:</span>' +
      '<span class="exam-eval-sentence-stats__num exam-eval-num exam-eval-num--good">' +
      uniqueCount +
      '</span></div>' +
      '<div class="exam-eval-sentence-stats__row">' +
      '<span class="exam-eval-sentence-stats__label">Dupla mondatok száma:</span>' +
      '<span class="exam-eval-sentence-stats__num">' +
      duplicateValidCount +
      '</span></div>' +
      '<div class="exam-eval-sentence-stats__row">' +
      '<span class="exam-eval-sentence-stats__label">Helytelen mondatok száma:</span>' +
      '<span class="exam-eval-sentence-stats__num exam-eval-num exam-eval-num--bad">' +
      wrongSentencePaths +
      '</span></div>' +
      '</div>' +
      (listHtml
        ? '<div class="exam-eval-sentence-list-wrap"><div class="exam-eval-sentence-list-label">Egyedi mondatok:</div><ul class="exam-eval-sentence-ul">' +
          listHtml +
          '</ul></div>'
        : '<p class="exam-eval-sentence-none">Nincs egyedi mondat a listában.</p>') +
      (wrongListHtml
        ? '<div class="exam-eval-sentence-list-wrap exam-eval-sentence-list-wrap--wrong"><div class="exam-eval-sentence-list-label">Helytelen mondatok listája:</div><ul class="exam-eval-sentence-ul exam-eval-sentence-ul--wrong">' +
          wrongListHtml +
          '</ul></div>'
        : '') +
      '</div>';

    return {
      html: block,
      embeddable: embeddable,
      totalValid: totalValid,
      uniqueValid: uniqueCount,
      duplicateValid: duplicateValidCount,
      wrongSentences: wrongSentencePaths,
      pct: pct,
      sentenceResultText: sentenceResultText,
    };
  }

  async function onEvaluate() {
    if (!state.active || state.evaluationDone) return;
    if (state.mode === 'exam' && !state.examSessionStarted) return;
    state.evaluationDone = true;
    updateExamExitBackButtonVisibility();
    clearTimer();

    var noteEl = $('examNoteInput');
    var noteText =
      noteEl && noteEl.value ? String(noteEl.value).trim() : '';
    if (state.mode === 'exam') {
      noteText = '';
    }

    var totalPossible = state.possible | 0;
    var skipCellSummary = totalPossible === 0;

    var sentenceEval = null;
    if ((state.taskWordListId | 0) && (state.taskGenCount | 0) >= 1) {
      try {
        sentenceEval = await computeSentenceEvaluationSummary(state.refMatrix);
      } catch (eSen) {}
    }

    if (skipCellSummary && !(sentenceEval && sentenceEval.html)) {
      var boxSkip = $('examEvaluationBox');
      if (boxSkip) {
        boxSkip.innerHTML = '';
        boxSkip.hidden = true;
      }
      var fwSkip = $('examFinishWrap');
      if (fwSkip) fwSkip.hidden = false;
      var evSkip = $('examBtnEvaluate');
      if (evSkip) {
        evSkip.disabled = true;
        evSkip.setAttribute('aria-disabled', 'true');
      }
      if (state.mode === 'exam' && state.taskSaveId) {
        try {
          var filledBoard0 =
            typeof window.CELLAUTO_captureEvaluationFieldBoards === 'function'
              ? window.CELLAUTO_captureEvaluationFieldBoards()
              : null;
          if (!filledBoard0 || typeof filledBoard0 !== 'object') {
            filledBoard0 = { schemaVersion: 1, board: 'square', cells: [] };
          }
          var evalPayload0 = {
            date: formatDateTimeSql(),
            note: noteText,
            filled_board: filledBoard0,
            total_good_cell: 0,
            good_cell: 0,
            bad_cell: 0,
            unfilled_cell: 0,
            possible_sentence: 0,
            good_sentence: 0,
            bad_sentence: 0,
            duplicate_sentence: 0,
            sentence_result: '',
            completed_time: completedSecondsForApi(),
          };
          var evalRaw0 = await api.createTaskEvaluation(state.taskSaveId, evalPayload0);
          var evEntity0 = unwrapEntity(evalRaw0);
          var evId0 = evEntity0 && evEntity0.id != null ? parseIntSafe(evEntity0.id, 0) : 0;
          if (evId0) state.savedEvaluationId = evId0;
          state.savedEvaluationApiPayload = JSON.parse(JSON.stringify(evalPayload0));
          prepareExamNotesUiAfterEval();
        } catch (e0) {
          if (typeof window.showToast === 'function') {
            window.showToast(
              'Értékelés mentése sikertelen: ' + (e0.message || ''),
              4200
            );
          }
        }
      }
      return;
    }

    var diffStats = null;
    var completedCorrect = 0;
    var wrongMarked = 0;
    var unfilled = 0;
    if (!skipCellSummary) {
      diffStats =
        typeof window.CELLAUTO_paintMatrixDiffOverlay === 'function'
          ? window.CELLAUTO_paintMatrixDiffOverlay(state.refMatrix)
          : null;
      completedCorrect =
        typeof window.CELLAUTO_countCorrectExamFillCells === 'function'
          ? window.CELLAUTO_countCorrectExamFillCells(state.refMatrix, state.frozenCells)
          : Math.min(diffStats ? diffStats.ok : 0, totalPossible);
      if (totalPossible >= 0) {
        completedCorrect = Math.min(completedCorrect | 0, totalPossible);
      }
      wrongMarked = diffStats ? diffStats.error + diffStats.plus : 0;
      unfilled = diffStats ? diffStats.minus : 0;
    }
    var pctNumerator = completedCorrect - wrongMarked - unfilled;
    var pct =
      totalPossible > 0 ? Math.round((pctNumerator / totalPossible) * 100) : null;
    var isPerfect =
      !skipCellSummary &&
      !!diffStats &&
      diffStats.error + diffStats.plus + diffStats.minus === 0;

    var summary = '<h4 class="exam-eval-title">Összegzés</h4>';
    if (!skipCellSummary) {
      if (isPerfect) {
        summary +=
          '<p class="exam-eval-grats exam-eval-grats--replay" role="status" tabindex="0" title="Újra a táblán: egér fölé vagy kattintás">' +
          'Gratulálok!!!</p>';
      }
      summary +=
        '<p class="exam-eval-hero-line">Teljesítés: <span class="exam-eval-num">' +
        (pct !== null ? pct + '%' : '—') +
        '</span></p>';
    }
    summary +=
      '<p class="exam-eval-meta-line">Teljesítési idő: <span class="exam-eval-num">' +
      formatSeconds(completedSecondsForApi()) +
      '</span></p>';
    if (!skipCellSummary && noteText) {
      summary +=
        '<div class="exam-eval-teacher-note">' +
        '<div class="exam-eval-teacher-note-label">Megjegyzés a tanárnak</div>' +
        '<div class="exam-eval-teacher-note-body">' +
        escapeExamSummaryHtml(noteText).replace(/\n/g, '<br>') +
        '</div></div>';
    }
    if (!skipCellSummary) {
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
    }
    if (sentenceEval && sentenceEval.html) {
      summary += sentenceEval.html;
    }

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
          possible_sentence: sentenceEval ? sentenceEval.embeddable | 0 : 0,
          good_sentence: sentenceEval ? sentenceEval.uniqueValid | 0 : 0,
          bad_sentence: sentenceEval ? sentenceEval.wrongSentences | 0 : 0,
          duplicate_sentence: sentenceEval ? sentenceEval.duplicateValid | 0 : 0,
          sentence_result:
            sentenceEval && sentenceEval.sentenceResultText
              ? sentenceEval.sentenceResultText
              : '',
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

  function restorePlayControlsAfterExam() {
    var wm = $('word_mode');
    if (wm) {
      wm.value = 'select';
      wm.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var modeEl = $('mode');
    if (modeEl) {
      modeEl.value = 'play';
      modeEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function exitExamMode() {
    removePerfectBoardCelebration();
    restoreExamSentenceUiHard();
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

    hideExamWordSentenceMetaRows();
    var sAv = $('examMetaAvailableSentences');
    var sEm = $('examMetaEmbeddableSentences');
    if (sAv) sAv.textContent = '—';
    if (sEm) sEm.textContent = '—';

    state.practiceCellWordIds = null;
    state.practiceWordGraph = null;
    state.taskGenCount = 0;
    state.practiceFillHelpEnabled = false;
    state.practiceKitoltesUzenetekEnabled = true;
    state.taskWordListNotes = '';
    var nBox = $('examTaskWordListNotes');
    if (nBox) {
      nBox.hidden = true;
      nBox.textContent = '';
    }
    var helpCh = $('examPracticeFillHelp');
    if (helpCh) helpCh.checked = false;
    var msgCh = $('examPracticeKitoltesMessages');
    if (msgCh) msgCh.checked = true;
    var helpWrap = $('examPracticeHelpWrap');
    if (helpWrap) helpWrap.hidden = true;

    var neigh = $('neighbors');
    var bs = $('boardSizeSelect');
    if (neigh) neigh.disabled = false;
    if (bs) bs.disabled = false;

    restorePlayControlsAfterExam();

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

  window.CELLAUTO_exitExamMode = exitExamMode;

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
        var nameFiltOpen = $('examTaskNameFilter');
        if (nameFiltOpen) nameFiltOpen.value = '';
        await loadAllTaskRows();
        openBackdrop('examBackdrop');
      });

    if (filt) filt.addEventListener('change', refreshExamTaskSelect);
    if (grpFilt) grpFilt.addEventListener('change', refreshExamTaskSelect);
    var nameFilt = $('examTaskNameFilter');
    if (nameFilt) nameFilt.addEventListener('input', refreshExamTaskSelect);

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

    var wsBtn = $('examBtnWordSentences');
    if (wsBtn) wsBtn.addEventListener('click', activateWordSentenceMode);

    var exitBackBtn = $('examBtnExitBack');
    if (exitBackBtn) exitBackBtn.addEventListener('click', exitExamMode);

    var helpChk = $('examPracticeFillHelp');
    if (helpChk && !helpChk._cellautoWired) {
      helpChk._cellautoWired = true;
      helpChk.addEventListener('change', function () {
        state.practiceFillHelpEnabled = !!helpChk.checked;
      });
    }

    var kitoltesMsgChk = $('examPracticeKitoltesMessages');
    if (kitoltesMsgChk && !kitoltesMsgChk._cellautoWired) {
      kitoltesMsgChk._cellautoWired = true;
      kitoltesMsgChk.addEventListener('change', function () {
        state.practiceKitoltesUzenetekEnabled = !!kitoltesMsgChk.checked;
      });
    }
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
