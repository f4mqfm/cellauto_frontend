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
    var vz = $('vizsgaWrap');
    var vis = !!api.getToken();
    if (wrap) wrap.hidden = !vis;
    if (vz) vz.hidden = !vis;
  }

  function parseLoadSelection() {
    var sel = $('loadSaveSelect');
    var raw = sel && sel.value ? String(sel.value) : '';
    if (!raw) return { gid: 0, sid: 0 };
    if (raw.indexOf(':') === -1) return { gid: 0, sid: parseInt(raw, 10) || 0 };
    var parts = raw.split(':');
    return {
      gid: parseInt(parts[0], 10) || 0,
      sid: parseInt(parts[1], 10) || 0,
    };
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
      o1.textContent = '— összes csoport —';
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
    var saves = [];
    var selectedGroupName = '';
    var groups = [];
    try {
      groups = await api.getBoardSaveGroups();
    } catch (e) {
      groups = [];
    }
    if (groupId) {
      var matched = groups.find(function (g) {
        return g.id === groupId;
      });
      selectedGroupName = matched ? (matched.name || 'Csoport #' + matched.id) : '';
      try {
        saves = await api.getBoardSaves(groupId);
      } catch (e) {
        saves = [];
      }
      saves = saves.map(function (s) {
        return {
          id: s.id,
          name: s.name,
          groupId: groupId,
          groupName: selectedGroupName,
        };
      });
    } else {
      var perGroup = await Promise.all(
        groups.map(async function (g) {
          try {
            var gs = await api.getBoardSaves(g.id);
            return gs.map(function (s) {
              return {
                id: s.id,
                name: s.name,
                groupId: g.id,
                groupName: g.name || 'Csoport #' + g.id,
              };
            });
          } catch (e) {
            return [];
          }
        })
      );
      saves = perGroup.flat();
    }

    if (!saves.length) {
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = groupId
        ? '— nincs mentés ebben a csoportban —'
        : '— nincs mentés egyetlen csoportban sem —';
      sel.appendChild(o0);
      return;
    }
    saves.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.groupId) + ':' + String(s.id);
      var saveName = s.name || 'Mentés #' + s.id;
      o.textContent = groupId ? saveName : saveName + ' — ' + s.groupName;
      sel.appendChild(o);
    });
  }

  /** Mentés modál: mentett nevek összegzése + felülírás lista */
  async function refreshSaveModalSaves(groupId) {
    var summary = $('saveNamesSummary');
    var ow = $('saveOverwriteSelect');
    var ng = $('saveNewGroupName');
    if (!ow) return;

    ow.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '— új mentés (név alább) —';
    ow.appendChild(o0);

    if (ng && ng.value.trim()) {
      ow.disabled = true;
      if (summary) {
        summary.textContent =
          'Új csoport megadásakor nincs korábbi mentés; a mentés után itt jelennek meg a nevek.';
      }
      return;
    }

    ow.disabled = false;
    if (!groupId) {
      if (summary) summary.textContent = 'Válassz csoportot a mentett nevek megjelenítéséhez.';
      return;
    }

    var saves = [];
    try {
      saves = await api.getBoardSaves(groupId);
    } catch (e) {
      saves = [];
    }

    if (summary) {
      if (!saves.length) {
        summary.textContent = 'Ebben a csoportban még nincs mentés.';
      } else {
        var names = saves.map(function (s) {
          return s.name || '#' + s.id;
        });
        summary.textContent = 'Mentett nevek (' + saves.length + '): ' + names.join(', ');
      }
    }

    saves.forEach(function (s) {
      var o = document.createElement('option');
      o.value = String(s.id);
      o.textContent = s.name || 'Mentés #' + s.id;
      ow.appendChild(o);
    });
  }

  function onSaveOverwriteChange() {
    var sel = $('saveOverwriteSelect');
    var inp = $('saveNameInput');
    if (!sel || !inp) return;
    if (sel.disabled) return;
    var id = sel.value ? parseInt(sel.value, 10) : 0;
    if (!id) {
      inp.value = '';
      return;
    }
    var opt = sel.options[sel.selectedIndex];
    inp.value = opt ? String(opt.textContent).trim() : '';
  }

  function onSaveNewGroupInput() {
    var gid = $('saveGroupSelect') && $('saveGroupSelect').value ? parseInt($('saveGroupSelect').value, 10) : 0;
    refreshSaveModalSaves(gid);
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

  function formatApiError(e) {
    if (e && (e.status === 401 || e.status === 403)) {
      return (
        'Nincs jogosultság (HTTP ' +
        e.status +
        '). Valószínű ok: nem vagy belépve ezen az oldalon (www vs lokális más origin), lejárt a token, vagy nem a saját csoportodat/mentésedet próbálod felülírni. Lépj be újra.'
      );
    }
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
    var owSel = $('saveOverwriteSelect');
    var overwriteId =
      owSel && !owSel.disabled && owSel.value ? parseInt(owSel.value, 10) : 0;

    try {
      if (newG) {
        overwriteId = 0;
        var created = unwrapEntity(await api.createBoardSaveGroup({ name: newG, position: 0 }));
        gid = created && created.id ? created.id : null;
        if (!gid) throw new Error('Csoport létrehozása sikertelen');
      } else if (!gid) {
        if (err) err.textContent = 'Válassz csoportot, vagy adj meg új csoportnevet.';
        return;
      }

      var payload = typeof window.CELLAUTO_buildSavePayload === 'function' ? window.CELLAUTO_buildSavePayload() : null;
      if (!payload) throw new Error('Payload üres');
      payload.icon = !!($('saveAsIcon') && $('saveAsIcon').checked);

      if (overwriteId) {
        await api.updateBoardSave(gid, overwriteId, { name: name, payload: payload });
      } else {
        await api.createBoardSave(gid, { name: name, payload: payload });
      }

      closeBackdrop('saveBackdrop');
      if ($('saveNameInput')) $('saveNameInput').value = '';
      if ($('saveNewGroupName')) $('saveNewGroupName').value = '';
      if ($('saveAsIcon')) $('saveAsIcon').checked = false;
      if ($('saveOverwriteSelect')) {
        $('saveOverwriteSelect').value = '';
        $('saveOverwriteSelect').disabled = false;
      }
      await refreshGroupSelects();
      var gAfter = $('saveGroupSelect');
      if (gAfter && gid) {
        gAfter.value = String(gid);
      }
      await refreshSaveModalSaves(gid);
      await refreshSaveSelectForGroup(gid);
    } catch (e) {
      if (err) err.textContent = formatApiError(e);
    }
  }

  async function onLoadDelete() {
    var err = $('loadError');
    if (err) err.textContent = '';
    var parsed = parseLoadSelection();
    var gid = parsed.gid;
    var sid = parsed.sid;
    if (!gid || !sid) {
      if (err) err.textContent = 'Válassz törölni kívánt mentést.';
      return;
    }
    var sel = $('loadSaveSelect');
    var label = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : 'ez a mentés';
    if (!window.confirm('Biztosan törlöd: „' + label + '”?')) return;
    try {
      await api.deleteBoardSave(gid, sid);
      await refreshSaveSelectForGroup(gid);
      await refreshSaveModalSaves(gid);
    } catch (e) {
      if (err) err.textContent = formatApiError(e);
    }
  }

  async function onLoadSubmit() {
    var err = $('loadError');
    if (err) err.textContent = '';
    var parsed = parseLoadSelection();
    var gid = parsed.gid;
    var sid = parsed.sid;
    if (!gid || !sid) {
      if (err) err.textContent = 'Válassz mentést.';
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

      var currentBoard = typeof window.CELLAUTO_getBoardType === 'function'
        ? window.CELLAUTO_getBoardType()
        : null;
      if (payload.board && currentBoard && payload.board !== currentBoard) {
        throw new Error('Eltérő rácstípus: négyzetrácsos mentés nem tölthető hexára, és fordítva.');
      }

      if (typeof window.CELLAUTO_applySavePayload === 'function') {
        window.CELLAUTO_applySavePayload(payload, { asIcon: !!payload.icon });
      }
      applyListIdsFromPayload(payload);
      closeBackdrop('loadBackdrop');
    } catch (e) {
      if (err) err.textContent = formatApiError(e);
    }
  }

  function wire() {
    var bs = $('btnOpenSaveModal');
    var bl = $('btnOpenLoadModal');
    var sgc = $('saveGroupSelect');
    if (sgc) {
      sgc.addEventListener('change', function () {
        var id = sgc.value ? parseInt(sgc.value, 10) : 0;
        refreshSaveModalSaves(id);
      });
    }
    var sng = $('saveNewGroupName');
    if (sng) {
      sng.addEventListener('input', onSaveNewGroupInput);
    }
    var sow = $('saveOverwriteSelect');
    if (sow) {
      sow.addEventListener('change', onSaveOverwriteChange);
    }

    if (bs) {
      bs.addEventListener('click', async function () {
        await refreshGroupSelects();
        if ($('saveError')) $('saveError').textContent = '';
        if ($('saveAsIcon')) $('saveAsIcon').checked = false;
        var gid = $('saveGroupSelect') && $('saveGroupSelect').value ? parseInt($('saveGroupSelect').value, 10) : 0;
        await refreshSaveModalSaves(gid);
        openBackdrop('saveBackdrop');
      });
    }
    if (bl) {
      bl.addEventListener('click', async function () {
        await refreshGroupSelects();
        if ($('loadError')) $('loadError').textContent = '';
        var lg = $('loadGroupSelect');
        var gid = lg && lg.value ? parseInt(lg.value, 10) : 0;
        await refreshSaveSelectForGroup(gid);
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
    if ($('loadDelete')) $('loadDelete').addEventListener('click', onLoadDelete);

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
