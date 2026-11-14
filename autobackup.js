/**
 * Backup automático em uma pasta do computador (e lembrete semanal quando isso não é possível).
 *
 *  - Usa a API de acesso a pastas do Chrome/Edge (showDirectoryPicker). Firefox, Safari e navegadores de celular
 *    NÃO têm essa API: nesses, só vale o lembrete e o botão "Backup (JSON)" do painel da home.
 *  - Você escolhe a pasta uma vez. O arquivo "vademecum-backup-latest.json" é regravado depois de cada sessão de
 *    estudo concluída e, no máximo uma vez a cada 7 dias, é guardada uma cópia com a data no nome. Nada é apagado.
 *  - Após fechar o navegador, o Chrome pode pedir para você autorizar a pasta de novo (um clique na home).
 */
(function(window) {
  'use strict';

  var DB = 'vm-backup-db', STORE = 'kv', KEY = 'dir';
  var STATE_KEY = 'vadeMecum_autoBackup';          // { enabled, lastTs, lastDatedTs, folder }
  var REMIND_KEY = 'vadeMecum_remindDay';
  var DAY = 86400000;
  var mem = null;                                   // alternativa em memória quando o IndexedDB não guarda a pasta

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function state() { try { return JSON.parse(lsGet(STATE_KEY)) || {}; } catch (e) { return {}; } }
  function saveState(patch) { var s = Object.assign(state(), patch); lsSet(STATE_KEY, JSON.stringify(s)); return s; }
  function supported() { return typeof window.showDirectoryPicker === 'function'; }

  function idb() {
    return new Promise(function(resolve, reject) {
      if (!window.indexedDB) { reject(new Error('sem IndexedDB')); return; }
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function() { r.result.createObjectStore(STORE); };
      r.onsuccess = function() { resolve(r.result); };
      r.onerror = function() { reject(r.error); };
    });
  }
  function getHandle() {
    if (mem) return Promise.resolve(mem);
    return idb().then(function(db) {
      return new Promise(function(resolve) {
        var q = db.transaction(STORE).objectStore(STORE).get(KEY);
        q.onsuccess = function() { resolve(q.result || null); };
        q.onerror = function() { resolve(null); };
      });
    }).catch(function() { return null; });
  }
  function putHandle(h) {
    mem = h;
    return idb().then(function(db) {
      return new Promise(function(resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        try { tx.objectStore(STORE).put(h, KEY); } catch (e) { resolve(false); return; }
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = tx.onabort = function() { resolve(false); };
      });
    }).catch(function() { return false; });
  }
  function dropHandle() {
    mem = null;
    return idb().then(function(db) {
      return new Promise(function(resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = tx.onerror = tx.onabort = function() { resolve(true); };
      });
    }).catch(function() { return true; });
  }

  function permission(h, ask) {
    var o = { mode: 'readwrite' };
    var q = h.queryPermission ? h.queryPermission(o) : Promise.resolve('granted');
    return q.then(function(p) {
      if (p === 'granted' || !ask) return p;
      return h.requestPermission ? h.requestPermission(o) : 'denied';
    }).catch(function() { return 'denied'; });
  }

  function writeFile(dir, name, text) {
    return dir.getFileHandle(name, { create: true }).then(function(fh) { return fh.createWritable(); })
      .then(function(w) { return Promise.resolve(w.write(text)).then(function() { return w.close(); }); });
  }

  function notify() { try { window.dispatchEvent(new CustomEvent('vm:autobackup')); } catch (e) { /* ignora */ } }

  /** Grava o backup agora. opts.ask = true só dentro de um clique do usuário (para pedir permissão). */
  function run(reason, opts) {
    if (!window.VMTracker) return Promise.resolve({ ok: false, why: 'sem-tracker' });
    var st = state();
    if (!st.enabled) return Promise.resolve({ ok: false, why: 'desativado' });
    return getHandle().then(function(h) {
      if (!h) return { ok: false, why: 'sem-pasta' };
      return permission(h, opts && opts.ask).then(function(p) {
        if (p !== 'granted') return { ok: false, why: 'sem-permissao' };
        var json = JSON.stringify(VMTracker.buildBackup(), null, 1);
        var now = Date.now();
        var d = new Date(now);
        var day = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        var dated = !st.lastDatedTs || (now - st.lastDatedTs) >= 7 * DAY;
        return writeFile(h, 'vademecum-backup-latest.json', json).then(function() {
          return dated ? writeFile(h, 'vademecum-backup-' + day + '.json', json) : null;
        }).then(function() {
          saveState({ lastTs: now, lastDatedTs: dated ? now : st.lastDatedTs, lastReason: reason || '' });
          if (VMTracker.markBackup) VMTracker.markBackup();
          notify();
          return { ok: true, dated: dated };
        });
      });
    }).catch(function(e) { return { ok: false, why: 'erro', detail: String(e && e.message || e) }; });
  }

  /** Escolher a pasta (precisa ser chamado por um clique). */
  function choose() {
    if (!supported()) return Promise.resolve({ ok: false, why: 'nao-suportado' });
    return window.showDirectoryPicker({ id: 'vademecum-backup', mode: 'readwrite' }).then(function(h) {
      return putHandle(h).then(function() {
        saveState({ enabled: true, folder: h.name || '' });
        return run('escolha', { ask: true });
      });
    }).catch(function(e) { return { ok: false, why: e && e.name === 'AbortError' ? 'cancelado' : 'erro' }; });
  }

  function disable() { saveState({ enabled: false }); return dropHandle().then(function() { notify(); return true; }); }

  /** Situação para a interface. permission: granted | prompt | denied | none */
  function status() {
    var st = state();
    if (!st.enabled) return Promise.resolve({ supported: supported(), enabled: false, lastTs: st.lastTs || null, folder: '' });
    return getHandle().then(function(h) {
      if (!h) return { supported: supported(), enabled: true, permission: 'none', lastTs: st.lastTs || null, folder: st.folder || '' };
      return permission(h, false).then(function(p) { return { supported: supported(), enabled: true, permission: p, lastTs: st.lastTs || null, folder: st.folder || h.name || '' }; });
    });
  }

  // ── gatilhos automáticos ──
  var timer = null;
  function schedule(reason, ms) {
    clearTimeout(timer);
    timer = setTimeout(function() { run(reason); }, ms);
  }
  window.addEventListener('vm:session-saved', function() { schedule('sessao', 20000); });
  function onLoad() {
    var st = state();
    if (st.enabled && (!st.lastTs || Date.now() - st.lastTs > 6 * 3600000)) schedule('abertura', 4000);
    remind();
  }

  /** Lembrete semanal (só na home): sem pasta automática, com dados e sem backup há mais de 7 dias. */
  function remind() {
    if (!document.getElementById('dashboard') || !window.VMTracker) return;
    var st = state();
    if (st.enabled) return;
    var T = VMTracker;
    var hasData = T.getSessions().length || Object.keys(T.getCompletedArticles()).length || Object.keys(T.getNotes ? T.getNotes() : {}).length;
    var last = T.getLastBackupTs();
    var today = new Date().toISOString().slice(0, 10);
    if (!hasData || (last && Date.now() - last < 7 * DAY) || lsGet(REMIND_KEY) === today) return;
    lsSet(REMIND_KEY, today);
    var el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,460px);background:#0d1b2a;color:#f3e7c6;' +
      'border:1px solid #c8960c;border-left:4px solid #e8b84b;border-radius:4px;padding:.65rem .9rem;font:600 .8rem/1.45 "Source Serif 4",Georgia,serif;box-shadow:0 6px 22px rgba(0,0,0,.45);cursor:pointer;';
    el.textContent = (last ? 'Faz mais de 7 dias do seu último backup.' : 'Você ainda não fez backup dos seus estudos.') +
      ' Seus dados ficam só neste navegador. Clique para ir ao painel de backup.';
    el.addEventListener('click', function() { el.remove(); var d = document.getElementById('dashboard'); if (d) d.scrollIntoView(); });
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onLoad); else onLoad();

  window.VMAutoBackup = { supported: supported, choose: choose, disable: disable, run: run, status: status };
})(window);
