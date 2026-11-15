/**
 * Backup automático em uma pasta do computador (e lembrete semanal quando isso não é possível).
 *
 *  - Usa a API de acesso a pastas do Chrome/Edge (showDirectoryPicker). Firefox, Safari e navegadores de celular
 *    NÃO têm essa API: nesses, só vale o lembrete e o botão "Backup (JSON)" do painel da home.
 *  - Você escolhe a pasta uma vez. O arquivo "vademecum-backup-latest-<aparelho>.json" é regravado depois de cada sessão de
 *    estudo concluída e, no máximo uma vez a cada 7 dias, é guardada uma cópia com a data no nome. Nada é apagado.
 *  - Cada aparelho grava só o SEU arquivo (a etiqueta <aparelho> é sorteada uma vez por navegador). Escolhendo, nos dois
 *    aparelhos, a mesma pasta de uma nuvem sincronizada (Google Drive, OneDrive...), "Importar da pasta" soma ao navegador
 *    os arquivos dos outros aparelhos (a soma é idempotente: nada se duplica nem se apaga). Não há servidor nosso nisso.
 *  - Criptografia opcional: com uma senha, os arquivos da pasta saem protegidos (AES-GCM). A senha é pedida uma vez; o navegador
 *    guarda apenas uma chave derivada NÃO extraível (nunca a senha). Sem a senha não há como abrir os arquivos.
 *  - Após fechar o navegador, o Chrome pode pedir para você autorizar a pasta de novo (um clique na home).
 */
(function(window) {
  'use strict';

  var DB = 'vm-backup-db', STORE = 'kv', KEY = 'dir', KEY_ENC = 'enc';
  var DEVICE_KEY = 'vadeMecum_deviceId';
  var STATE_KEY = 'vadeMecum_autoBackup';          // { enabled, lastTs, lastDatedTs, folder }
  var REMIND_KEY = 'vadeMecum_remindDay';
  var DAY = 86400000;
  var mem = null, memEnc = null;                    // alternativas em memória quando o IndexedDB não guarda a pasta / a chave

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

  function idbGet(key) {
    return idb().then(function(db) {
      return new Promise(function(resolve) {
        var q = db.transaction(STORE).objectStore(STORE).get(key);
        q.onsuccess = function() { resolve(q.result || null); };
        q.onerror = function() { resolve(null); };
      });
    }).catch(function() { return null; });
  }
  function idbPut(key, val) {
    return idb().then(function(db) {
      return new Promise(function(resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        try { if (val === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(val, key); } catch (e) { resolve(false); return; }
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = tx.onabort = function() { resolve(false); };
      });
    }).catch(function() { return false; });
  }
  function deviceId() {
    var id = lsGet(DEVICE_KEY);
    if (!/^[0-9a-f]{6}$/.test(id || '')) {
      var b = new Uint8Array(3);
      (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(b) : b.forEach(function(_, i) { b[i] = Math.floor(Math.random() * 256); }));
      id = [].map.call(b, function(x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      lsSet(DEVICE_KEY, id);
    }
    return id;
  }
  function latestName() { return 'vademecum-backup-latest-' + deviceId() + '.json'; }
  var RE_LATEST = /^vademecum-backup-latest(?:-[0-9a-f]{6})?\.json$/;

  /** Chave de criptografia guardada (derivada da senha; não extraível): { salt (base64), iter, key }. */
  function getEnc() { return memEnc ? Promise.resolve(memEnc) : idbGet(KEY_ENC); }

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

  /** Texto do arquivo: JSON aberto, ou criptografado se a criptografia está ativa. null se ativa mas sem chave guardada. */
  function makeText(st) {
    var obj = VMTracker.buildBackup();
    if (!st.encrypted) return Promise.resolve(JSON.stringify(obj, null, 1));
    return getEnc().then(function(e) {
      if (!e || !e.key || !e.salt) return null;
      var salt = Uint8Array.from(atob(e.salt), function(c) { return c.charCodeAt(0); });
      return VMTracker.encryptBackupWithKey(obj, e.key, salt, e.iter).then(function(c) { return JSON.stringify(c, null, 1); });
    });
  }

  /** Grava o backup agora. opts.ask = true só dentro de um clique do usuário (para pedir permissão). */
  function run(reason, opts) {
    if (!window.VMTracker) return Promise.resolve({ ok: false, why: 'sem-tracker' });
    var st = state();
    if (!st.enabled) return Promise.resolve({ ok: false, why: 'desativado' });
    return getHandle().then(function(h) {
      if (!h) return { ok: false, why: 'sem-pasta' };
      return permission(h, opts && opts.ask).then(function(p) {
        if (p !== 'granted') return { ok: false, why: 'sem-permissao' };
        var now = Date.now();
        var d = new Date(now);
        var day = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        var dated = !st.lastDatedTs || (now - st.lastDatedTs) >= 7 * DAY;
        return makeText(st).then(function(json) {
          if (json === null) return { ok: false, why: 'sem-chave' };
          return writeFile(h, latestName(), json).then(function() {
            return dated ? writeFile(h, 'vademecum-backup-' + day + '-' + deviceId() + '.json', json) : null;
          }).then(function() {
            saveState({ lastTs: now, lastDatedTs: dated ? now : st.lastDatedTs, lastReason: reason || '' });
            if (VMTracker.markBackup) VMTracker.markBackup();
            notify();
            return { ok: true, dated: dated };
          });
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

  /** Ativa a criptografia dos arquivos da pasta. A senha só é usada aqui para derivar a chave. */
  function enableEncryption(password) {
    if (typeof password !== 'string' || password.length < 8) return Promise.resolve({ ok: false, why: 'senha-curta' });
    if (!window.VMTracker || !VMTracker.cryptoOk()) return Promise.resolve({ ok: false, why: 'sem-cripto' });
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iter = VMTracker.BACKUP_ENC.iter;
    return VMTracker.deriveBackupKey(password, salt, iter, false).then(function(key) {
      var rec = { salt: btoa(String.fromCharCode.apply(null, salt)), iter: iter, key: key };
      memEnc = rec;
      return idbPut(KEY_ENC, rec).then(function() {
        saveState({ encrypted: true });
        notify();
        return { ok: true };
      });
    }).catch(function(e) { return { ok: false, why: 'erro', detail: String(e && e.message || e) }; });
  }
  function disableEncryption() {
    memEnc = null;
    return idbPut(KEY_ENC, null).then(function() { saveState({ encrypted: false }); notify(); return true; });
  }

  /** Lista os arquivos "latest" de OUTROS aparelhos na pasta. needsPermission: o navegador precisa de um clique (ask). */
  function listOthers(opts) {
    return getHandle().then(function(h) {
      if (!h) return { ok: false, why: 'sem-pasta', items: [] };
      return permission(h, opts && opts.ask).then(function(p) {
        if (p !== 'granted') return { ok: false, why: 'sem-permissao', items: [] };
        var own = latestName(), items = [];
        var iter = h.values ? h.values() : null;
        if (!iter) return { ok: true, items: [] };
        var step = function() {
          return iter.next().then(function(r) {
            if (r.done) return { ok: true, items: items };
            var f = r.value;
            if (f && f.kind === 'file' && RE_LATEST.test(f.name) && f.name !== own) items.push(f);
            return step();
          });
        };
        return step();
      });
    }).catch(function(e) { return { ok: false, why: 'erro', detail: String(e && e.message || e), items: [] }; });
  }

  /**
   * Soma ao navegador os backups dos outros aparelhos (modo "merge"). askPassword() devolve uma Promise com a senha
   * (ou null) e só é chamada para arquivo criptografado cuja chave guardada não serve.
   */
  function importOthers(opts) {
    opts = opts || {};
    return listOthers({ ask: opts.ask }).then(function(l) {
      if (!l.ok) return { ok: false, why: l.why, detail: l.detail };
      var out = { ok: true, files: 0, sessions: 0, completed: 0, cards: 0, notes: 0, marks: 0, skipped: [] };
      var chain = Promise.resolve();
      l.items.forEach(function(fh) {
        chain = chain.then(function() { return fh.getFile(); }).then(function(file) {
          if (file.size > 5 * 1024 * 1024) { out.skipped.push(fh.name + ' (grande demais)'); return null; }
          return file.text();
        }).then(function(txt) {
          if (txt === null || txt === undefined) return null;
          var o;
          try { o = JSON.parse(txt); } catch (e) { out.skipped.push(fh.name + ' (JSON inválido)'); return null; }
          if (!VMTracker.isEncryptedBackup(o)) return o;
          return getEnc().then(function(e) {
            if (e && e.key && e.salt === VMTracker.backupSalt(o)) return VMTracker.decryptBackupWithKey(o, e.key);
            if (!opts.askPassword) { out.skipped.push(fh.name + ' (protegido por senha)'); return null; }
            return opts.askPassword(fh.name).then(function(pw) {
              if (!pw) { out.skipped.push(fh.name + ' (senha não informada)'); return null; }
              return VMTracker.decryptBackup(o, pw);
            });
          }).catch(function() { out.skipped.push(fh.name + ' (senha incorreta ou arquivo alterado)'); return null; });
        }).then(function(o) {
          if (!o) return;
          var r = VMTracker.importBackup(o, 'merge');
          if (!r.ok) { out.skipped.push(fh.name + ' (' + r.error + ')'); return; }
          out.files++;
          out.sessions += r.sessions.added; out.completed += r.completed.added;
          out.cards += r.cards ? r.cards.added : 0; out.notes += r.notes ? r.notes.added : 0; out.marks += r.marks ? r.marks.added : 0;
        }).catch(function(e) { out.skipped.push(fh.name + ' (' + String(e && e.message || e) + ')'); });
      });
      return chain.then(function() { return out; });
    });
  }

  function disable() {
    saveState({ enabled: false, encrypted: false });
    memEnc = null;
    return idbPut(KEY_ENC, null).then(function() { return dropHandle(); }).then(function() { notify(); return true; });   // a chave derivada também é apagada
  }

  /** Situação para a interface. permission: granted | prompt | denied | none */
  function status() {
    var st = state();
    if (!st.enabled) return Promise.resolve({ supported: supported(), enabled: false, lastTs: st.lastTs || null, folder: '', encrypted: !!st.encrypted, device: deviceId() });
    return getHandle().then(function(h) {
      if (!h) return { supported: supported(), enabled: true, permission: 'none', lastTs: st.lastTs || null, folder: st.folder || '', encrypted: !!st.encrypted, device: deviceId() };
      return permission(h, false).then(function(p) { return { supported: supported(), enabled: true, permission: p, lastTs: st.lastTs || null, folder: st.folder || h.name || '', encrypted: !!st.encrypted, device: deviceId() }; });
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

  window.VMAutoBackup = { supported: supported, choose: choose, disable: disable, run: run, status: status,
    enableEncryption: enableEncryption, disableEncryption: disableEncryption, listOthers: listOthers, importOthers: importOthers, deviceId: deviceId };
})(window);
