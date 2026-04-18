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

  function showMsg(msg, ms) {
    if (typeof window.showToast === 'function') window.showToast(msg, ms || 3800);
  }

  function normalizeRole(user) {
    var r = user && user.role ? String(user.role) : '';
    return r.trim().toLowerCase();
  }

  function isTeacherOrAdmin(user) {
    var role = normalizeRole(user);
    return role === 'admin' || role === 'teacher' || role === 'tanar' || role === 'tanár';
  }

  function currentUser() {
    return window.CELLAUTO_currentUser || null;
  }

  function isAllowed() {
    return !!api.getToken() && isTeacherOrAdmin(currentUser());
  }

  function mapGenerationModeFromUi() {
    var n = $('neighbors');
    var v = n ? String(n.value || '') : '';
    if (v === 'apex') return 'square_apex';
    if (v === 'hex') return 'hexagonal';
    return 'square_lateral';
  }

  function parseIntSafe(v, def) {
    var n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  }

  /** docs/api-task-saves.md — enum: Easy | Medium | Hard */
  function normalizedTaskLevel(el) {
    var v = el && el.value ? String(el.value) : 'Medium';
    if (v === 'Easy' || v === 'Medium' || v === 'Hard') return v;
    return 'Medium';
  }

  function formatApiError(e) {
    if (!e || !e.data || typeof e.data !== 'object') return e && e.message ? e.message : 'Hiba';
    var d = e.data;
    if (d.message) return d.message;
    if (d.error) return typeof d.error === 'string' ? d.error : JSON.stringify(d.error);
    if (d.errors && typeof d.errors === 'object') {
      var parts = [];
      Object.keys(d.errors).forEach(function (k) {
        var v = d.errors[k];
        parts.push(k + ': ' + (Array.isArray(v) ? v.join(', ') : String(v)));
      });
      if (parts.length) return parts.join(' ');
    }
    return e.message || 'Hiba';
  }

  var __wordListGenCountById = Object.create(null);
  var __taskGroups = [];

  async function getWordListGenerationCount(listId) {
    if (!listId) return 0;
    if (__wordListGenCountById[listId] !== undefined) return __wordListGenCountById[listId];
    try {
      var d = await api.getListWords(listId);
      var gens = Array.isArray(d && d.generations)
        ? d.generations
        : Array.isArray(d && d.data && d.data.generations)
          ? d.data.generations
          : [];
      __wordListGenCountById[listId] = gens.length;
      return gens.length;
    } catch (e) {
      __wordListGenCountById[listId] = 0;
      return 0;
    }
  }

  async function refreshTaskGroupSelect() {
    var sel = $('taskSaveGroupSelect');
    if (!sel) return [];
    sel.innerHTML = '';
    var groups = [];
    try {
      groups = await api.getTaskSaveGroups();
    } catch (e) {
      groups = [];
    }
    __taskGroups = groups.slice();

    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = groups.length ? '— válassz csoportot —' : '— előbb hozz létre csoportot (Új csoport) —';
    sel.appendChild(o0);
    groups.forEach(function (g) {
      var o = document.createElement('option');
      o.value = String(g.id);
      o.textContent = g.name || 'Csoport #' + g.id;
      sel.appendChild(o);
    });
    return groups;
  }

  async function refreshTaskOverwriteSelect(groupId) {
    var sel = $('taskSaveOverwriteSelect');
    if (!sel) return;
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '— új mentés (név alább) —';
    sel.appendChild(o0);

    var ng = $('taskSaveNewGroupName');
    if (ng && ng.value.trim()) {
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    if (!groupId) return;

    var saves = [];
    try {
      saves = await api.getTaskSaves(groupId);
    } catch (e) {
      saves = [];
    }
    saves.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.id);
      o.textContent = s.name || 'Mentés #' + s.id;
      sel.appendChild(o);
    });
  }

  async function refreshTaskWordListSelect() {
    var sel = $('taskWordListSelect');
    var genEl = $('taskGenerationsCount');
    if (!sel || !genEl) return;
    var genCount = parseIntSafe(genEl.value, 0);
    sel.innerHTML = '';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = '— nincs —';
    none.selected = true;
    sel.appendChild(none);

    var src = $('wordListSelect');
    if (!src) return;
    var opts = Array.prototype.slice.call(src.options || []);

    for (var i = 0; i < opts.length; i++) {
      var id = parseIntSafe(opts[i].value, 0);
      if (!id) continue;
      var listGenCount = await getWordListGenerationCount(id);
      if (genCount > 0 && listGenCount !== genCount) continue;
      var o = document.createElement('option');
      o.value = String(id);
      o.textContent = opts[i].textContent;
      sel.appendChild(o);
    }
  }

  function syncTaskDefaultsFromUi() {
    var gens = $('taskGenerationsCount');
    if (gens) gens.value = '5';
  }

  async function openTaskModal() {
    if (!isAllowed()) {
      showMsg('Ehhez Tanári jogosultság szükséges vagy admin.', 4200);
      return;
    }
    if ($('taskSaveError')) $('taskSaveError').textContent = '';
    syncTaskDefaultsFromUi();
    await refreshTaskGroupSelect();
    await refreshTaskOverwriteSelect(0);
    await refreshTaskWordListSelect();
    openBackdrop('taskSaveBackdrop');
  }

  async function onTaskSaveSubmit() {
    var err = $('taskSaveError');
    if (err) err.textContent = '';
    if (!isAllowed()) {
      if (err) err.textContent = 'Ehhez Tanári jogosultság szükséges vagy admin.';
      return;
    }

    var name = ($('taskSaveNameInput') && $('taskSaveNameInput').value.trim()) || '';
    if (!name) {
      if (err) err.textContent = 'Add meg a feladat nevét.';
      return;
    }

    var newGroup = ($('taskSaveNewGroupName') && $('taskSaveNewGroupName').value.trim()) || '';
    var groupId = parseIntSafe($('taskSaveGroupSelect') && $('taskSaveGroupSelect').value, 0);
    var overwriteId = parseIntSafe($('taskSaveOverwriteSelect') && $('taskSaveOverwriteSelect').value, 0);

    var generationMode = mapGenerationModeFromUi();
    var boardSize = parseIntSafe($('boardSizeSelect') && $('boardSizeSelect').value, 0);
    var level = normalizedTaskLevel($('taskDifficultyLevel'));
    var generationsCount = parseIntSafe($('taskGenerationsCount') && $('taskGenerationsCount').value, 0);
    var wordListId = parseIntSafe($('taskWordListSelect') && $('taskWordListSelect').value, 0);
    var timeLimit = parseIntSafe($('taskTimeLimit') && $('taskTimeLimit').value, 0);

    if (!boardSize || boardSize < 1) {
      if (err) err.textContent = 'A tábla méret kötelező.';
      return;
    }
    if (!generationsCount || generationsCount < 2 || generationsCount > 10) {
      if (err) err.textContent = 'A generációk száma csak 2 és 10 között lehet.';
      return;
    }
    if (!timeLimit || timeLimit < 1) {
      if (err) err.textContent = 'Az időlimit kötelező.';
      return;
    }

    if (wordListId) {
      var gcount = await getWordListGenerationCount(wordListId);
      if (gcount !== generationsCount) {
        if (err) err.textContent = 'A kiválasztott szólista generációszáma nem egyezik a megadott generációk számával.';
        return;
      }
    }

    if (newGroup) {
      overwriteId = 0;
      try {
        var created = await api.createTaskSaveGroup({ name: newGroup, position: 0 });
        var entity = created && created.data && !Array.isArray(created.data) ? created.data : created;
        groupId = entity && entity.id ? parseIntSafe(entity.id, 0) : 0;
      } catch (e) {
        if (err) err.textContent = formatApiError(e);
        return;
      }
    }

    if (!groupId) {
      if (err) err.textContent = 'Válassz csoportot, vagy adj meg új csoportnevet.';
      return;
    }

    var payload = typeof window.CELLAUTO_buildSavePayload === 'function' ? window.CELLAUTO_buildSavePayload() : null;
    if (!payload) {
      if (err) err.textContent = 'Nem sikerült a tábla állapotát kiolvasni.';
      return;
    }

    var body = {
      name: name,
      level: level,
      generation_mode: generationMode,
      board_size: boardSize,
      generations_count: generationsCount,
      word_list_id: wordListId || null,
      time_limit: timeLimit,
      payload: payload,
    };

    try {
      if (overwriteId) await api.updateTaskSave(groupId, overwriteId, body);
      else await api.createTaskSave(groupId, body);
      closeBackdrop('taskSaveBackdrop');
      showMsg('Feladat mentve.', 2600);
    } catch (e) {
      if (err) err.textContent = formatApiError(e);
    }
  }

  function wire() {
    var openBtn = $('btnOpenTaskSaveModal');
    var cancelBtn = $('taskSaveCancel');
    var submitBtn = $('taskSaveSubmit');
    var backdrop = $('taskSaveBackdrop');
    var groupSel = $('taskSaveGroupSelect');
    var newGroupEl = $('taskSaveNewGroupName');
    var gensEl = $('taskGenerationsCount');
    var overwriteSel = $('taskSaveOverwriteSelect');
    var nameInput = $('taskSaveNameInput');

    if (openBtn) openBtn.addEventListener('click', openTaskModal);
    if (cancelBtn) cancelBtn.addEventListener('click', function () { closeBackdrop('taskSaveBackdrop'); });
    if (submitBtn) submitBtn.addEventListener('click', onTaskSaveSubmit);
    if (backdrop) {
      backdrop.addEventListener('click', function (ev) {
        if (ev.target && ev.target.id === 'taskSaveBackdrop') closeBackdrop('taskSaveBackdrop');
      });
    }
    if (groupSel) {
      groupSel.addEventListener('change', function () {
        var gid = parseIntSafe(groupSel.value, 0);
        refreshTaskOverwriteSelect(gid);
      });
    }
    if (newGroupEl) {
      newGroupEl.addEventListener('input', function () {
        var gid = parseIntSafe(groupSel && groupSel.value, 0);
        refreshTaskOverwriteSelect(gid);
      });
    }
    if (gensEl) {
      gensEl.addEventListener('change', refreshTaskWordListSelect);
      gensEl.addEventListener('input', refreshTaskWordListSelect);
    }
    if (overwriteSel && nameInput) {
      overwriteSel.addEventListener('change', function () {
        if (!overwriteSel.value) {
          nameInput.value = '';
          return;
        }
        var opt = overwriteSel.options[overwriteSel.selectedIndex];
        nameInput.value = opt ? String(opt.textContent || '') : '';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', wire);
})();

