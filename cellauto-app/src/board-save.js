(function () {
  'use strict';

  var api = window.CELLautoApi;
  if (!api) return;

  function $(id) {
    return document.getElementById(id);
  }

  function unwrapEntity(d) {
    if (!d) return null;
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) return d.data;
    return d;
  }

  function openBackdrop(id) {
    var el = $(id);
    if (el) el.classList.add('is-open');
  }

  function closeBackdrop(id) {
    var el = $(id);
    if (el) el.classList.remove('is-open');
  }

  function setVisibility() {
    var wrap = $('saveLoadWrap');
    if (!wrap) return;
    wrap.hidden = !api.getToken();
  }

  async function refreshGroupSelects() {
    var groups = [];
    try {
      groups = await api.getBoardSaveGroups();
    } catch (e) {
      groups = [];
    }

    var saveSel = $('saveGroupSelect');
    var loadSel = $('loadGroupSelect');
    if (saveSel) {
      saveSel.innerHTML = '';
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = groups.length ? '— válassz csoportot —' : '— előbb hozz létre csoportot (Új csoport) —';
      saveSel.appendChild(o0);
      groups.forEach(function (g) {
        var o = document.createElement('option');
        o.value = String(g.id);
        o.textContent = g.name || 'Csoport #' + g.id;
        saveSel.appendChild(o);
      });
    }
    if (loadSel) {
      loadSel.innerHTML = '';
      var o1 = document.createElement('option');
      o1.value = '';
      o1.textContent = '— válassz csoportot —';
      loadSel.appendChild(o1);
      groups.forEach(function (g) {
        var o = document.createElement('option');
        o.value = String(g.id);
        o.textContent = g.name || 'Csoport #' + g.id;
        loadSel.appendChild(o);
      });
    }
    return groups;
  }

  async function refreshSaveSelectForGroup(groupId) {
    var sel = $('loadSaveSelect');
    if (!sel) return;
    sel.innerHTML = '';
    if (!groupId) {
      var ox = document.createElement('option');
      ox.value = '';
      ox.textContent = '— előbb csoport —';
      sel.appendChild(ox);
      return;
    }
    var saves = [];
    try {
      saves = await api.getBoardSaves(groupId);
    } catch (e) {
      saves = [];
    }
    if (!saves.length) {
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = '— nincs mentés ebben a csoportban —';
      sel.appendChild(o0);
      return;
    }
    saves.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.id);
      o.textContent = s.name || 'Mentés #' + s.id;
      sel.appendChild(o);
    });
  }

  function applyListIdsFromPayload(payload) {
    if (!payload) return;
    setTimeout(function () {
      try {
        if (payload.wordListId) {
          var wl = $('wordListSelect');
          if (wl && wl.querySelector('option[value="' + payload.wordListId + '"]')) {
            wl.value = String(payload.wordListId);
            wl.dispatchEvent(new Event('change'));
          }
        }
        if (payload.colorListId) {
          var cl = $('colorListSelect');
          if (cl && cl.querySelector('option[value="' + payload.colorListId + '"]')) {
            cl.value = String(payload.colorListId);
            cl.dispatchEvent(new Event('change'));
          }
        }
      } catch (e) {}
    }, 50);
  }

  async function onSaveSubmit() {
    var err = $('saveError');
    if (err) err.textContent = '';
    var name = ($('saveNameInput') && $('saveNameInput').value.trim()) || '';
    if (!name) {
      if (err) err.textContent = 'Add meg a mentés nevét.';
      return;
    }
    var newG = $('saveNewGroupName') && $('saveNewGroupName').value.trim();
    var groupSel = $('saveGroupSelect');
    var gid = groupSel && groupSel.value ? parseInt(groupSel.value, 10) : 0;

    try {
      if (newG) {
        var created = unwrapEntity(await api.createBoardSaveGroup({ name: newG, position: 0 }));
        gid = created && created.id ? created.id : null;
        if (!gid) throw new Error('Csoport létrehozása sikertelen');
      } else if (!gid) {
        if (err) err.textContent = 'Válassz csoportot, vagy adj meg új csoportnevet.';
        return;
      }

      var payload = typeof window.CELLAUTO_buildSavePayload === 'function' ? window.CELLAUTO_buildSavePayload() : null;
      if (!payload) throw new Error('Payload üres');

      await api.createBoardSave(gid, { name: name, payload: payload });
      closeBackdrop('saveBackdrop');
      if ($('saveNameInput')) $('saveNameInput').value = '';
      if ($('saveNewGroupName')) $('saveNewGroupName').value = '';
      await refreshGroupSelects();
    } catch (e) {
      if (err) err.textContent = (e.data && e.data.message) || e.message || 'Mentés sikertelen';
    }
  }

  async function onLoadSubmit() {
    var err = $('loadError');
    if (err) err.textContent = '';
    var gid = $('loadGroupSelect') && $('loadGroupSelect').value ? parseInt($('loadGroupSelect').value, 10) : 0;
    var sid = $('loadSaveSelect') && $('loadSaveSelect').value ? parseInt($('loadSaveSelect').value, 10) : 0;
    if (!gid || !sid) {
      if (err) err.textContent = 'Válassz csoportot és mentést.';
      return;
    }
    try {
      var raw = await api.getBoardSave(gid, sid);
      var rec = unwrapEntity(raw);
      var payload = rec && rec.payload ? rec.payload : raw && raw.payload ? raw.payload : null;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          payload = null;
        }
      }
      if (!payload) throw new Error('Üres mentés');

      if (typeof window.CELLAUTO_applySavePayload === 'function') {
        window.CELLAUTO_applySavePayload(payload);
      }
      applyListIdsFromPayload(payload);
      closeBackdrop('loadBackdrop');
    } catch (e) {
      if (err) err.textContent = (e.data && e.data.message) || e.message || 'Betöltés sikertelen';
    }
  }

  function wire() {
    var bs = $('btnOpenSaveModal');
    var bl = $('btnOpenLoadModal');
    if (bs) {
      bs.addEventListener('click', async function () {
        await refreshGroupSelects();
        if ($('saveError')) $('saveError').textContent = '';
        openBackdrop('saveBackdrop');
      });
    }
    if (bl) {
      bl.addEventListener('click', async function () {
        await refreshGroupSelects();
        if ($('loadError')) $('loadError').textContent = '';
        var lg = $('loadGroupSelect');
        if (lg && lg.value) await refreshSaveSelectForGroup(parseInt(lg.value, 10));
        openBackdrop('loadBackdrop');
      });
    }
    var lgc = $('loadGroupSelect');
    if (lgc) {
      lgc.addEventListener('change', function () {
        var id = lgc.value ? parseInt(lgc.value, 10) : 0;
        refreshSaveSelectForGroup(id);
      });
    }
    if ($('saveCancel')) $('saveCancel').addEventListener('click', function () { closeBackdrop('saveBackdrop'); });
    if ($('saveSubmit')) $('saveSubmit').addEventListener('click', onSaveSubmit);
    if ($('loadCancel')) $('loadCancel').addEventListener('click', function () { closeBackdrop('loadBackdrop'); });
    if ($('loadSubmit')) $('loadSubmit').addEventListener('click', onLoadSubmit);

    if ($('saveBackdrop')) {
      $('saveBackdrop').addEventListener('click', function (ev) {
        if (ev.target.id === 'saveBackdrop') closeBackdrop('saveBackdrop');
      });
    }
    if ($('loadBackdrop')) {
      $('loadBackdrop').addEventListener('click', function (ev) {
        if (ev.target.id === 'loadBackdrop') closeBackdrop('loadBackdrop');
      });
    }
  }

  window.CELLAUTO_boardSaveAuthChanged = function () {
    setVisibility();
    if (api.getToken()) refreshGroupSelects();
  };

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    setVisibility();
    if (api.getToken()) refreshGroupSelects();
  });
})();
