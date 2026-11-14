/**
 * Extras da home (carregado só em index.html):
 *  - "Continuar de onde parou" (última página lida);
 *  - backup e restauração dos estudos em arquivo JSON (exportar / importar com validação);
 *  - meta diária de estudo com barra de progresso;
 *  - conferência a renovar: artigos cuja última conferência passou do prazo;
 *  - edição das notas das sessões na tabela do dashboard.
 * Depende de study-tracker.js e vm-data.js.
 */
(function() {
  'use strict';
  if (!window.VMTracker || !window.VMData) return;

  var T = VMTracker;
  var manifest = null;
  var ui = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function when(ts) {
    var min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'agora há pouco';
    if (min < 60) return 'há ' + min + ' min';
    if (min < 1440) return 'há ' + Math.round(min / 60) + ' h';
    return VMData.fmtAge(Math.floor(min / 1440));
  }
  function subjectOf(id) { return manifest && manifest.subjects.filter(function(s) { return s.id === id; })[0]; }
  function openUrl(file, extra) {
    var a = manifest && manifest.articles[file];
    var sub = a && subjectOf(a.subject);
    return sub ? sub.index + '?art=' + encodeURIComponent(file) + (extra || '') : file;
  }

  var css = document.createElement('style');
  css.textContent =
    '.vm-continue{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.7rem 1rem;margin:0 0 1.2rem;padding:.9rem 1.1rem;' +
      'background:#0d1b2a;color:#f3e7c6;border:1px solid #c8960c;border-left:5px solid #e8b84b;border-radius:6px;box-shadow:0 4px 18px rgba(13,27,42,.18);}' +
    '.vm-continue[hidden]{display:none;}' +
    '.vm-continue strong{display:block;font:700 .72rem "Source Serif 4",Georgia,serif;letter-spacing:1.3px;text-transform:uppercase;color:#e8b84b;margin-bottom:.15rem;}' +
    '.vm-continue .vc-t{font:600 .95rem/1.4 "Playfair Display",Georgia,serif;}' +
    '.vm-continue .vc-s{display:block;font:400 .78rem "Source Serif 4",Georgia,serif;color:rgba(243,231,198,.78);margin-top:.1rem;}' +
    '.vm-continue a{background:#c8960c;color:#0d1b2a;text-decoration:none;font:700 .8rem "Source Serif 4",Georgia,serif;padding:.55rem 1.1rem;border-radius:4px;}' +
    '.vm-db-extra{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.8rem;margin:.9rem 0 1.1rem;}' +
    '.vde-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-left:4px solid #c8960c;border-radius:5px;padding:.8rem .9rem;color:rgba(255,255,255,.88);font-size:.78rem;line-height:1.5;}' +
    '.vde-card h4{margin:0 0 .4rem;font:700 .72rem "Source Serif 4",Georgia,serif;letter-spacing:1.2px;text-transform:uppercase;color:#e8b84b;}' +
    '.vde-card.warn{border-left-color:#fc8181;}' +
    '.vde-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin:.35rem 0;}' +
    '.vde-bar i{display:block;height:100%;width:0;background:#2ecc71;transition:width .3s;}' +
    '.vde-card input[type=number]{width:5.5rem;font:600 .8rem "Source Serif 4",Georgia,serif;padding:.25rem .4rem;border-radius:3px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.25);color:#fff;}' +
    '.vde-card button,.vm-modal button{cursor:pointer;font:700 .72rem "Source Serif 4",Georgia,serif;padding:.32rem .65rem;border-radius:3px;border:1px solid rgba(232,184,75,.7);background:transparent;color:#e8b84b;}' +
    '.vde-card button:hover,.vm-modal button:hover{background:#c8960c;color:#0d1b2a;}' +
    '.vde-card ul{list-style:none;margin:.4rem 0;padding:0;max-height:11rem;overflow:auto;}' +
    '.vde-card li{padding:.15rem 0;border-bottom:1px dashed rgba(255,255,255,.12);}' +
    '.vde-card li a{color:#f3e7c6;text-decoration:none;}.vde-card li a:hover{text-decoration:underline;}' +
    '.vde-card li span{color:#fc8181;margin-left:.4rem;white-space:nowrap;}' +
    '.vde-row{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-top:.45rem;}' +
    '.td-note{max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:rgba(255,255,255,.8);}' +
    '.td-note:hover{text-decoration:underline;}' +
    '.vm-modal{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(7,14,22,.65);padding:12px;}' +
    '.vm-modal[hidden]{display:none;}' +
    '.vm-modal .vm-box{width:min(480px,100%);background:#0d1b2a;color:#f3e7c6;border:2px solid #c8960c;border-radius:8px;padding:1.1rem 1.2rem;font:400 .86rem/1.55 "Source Serif 4",Georgia,serif;box-shadow:0 18px 60px rgba(0,0,0,.55);}' +
    '.vm-modal h3{margin:0 0 .5rem;font:700 1rem "Playfair Display",Georgia,serif;color:#e8b84b;}' +
    '.vm-modal .vm-act{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end;margin-top:.9rem;}' +
    '.vm-modal .vm-danger{border-color:#fc8181;color:#fc8181;}';
  document.head.appendChild(css);

  function toast(msg) {
    var t = ui.toast;
    if (!t) {
      t = ui.toast = document.createElement('div');
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,460px);background:#0d1b2a;color:#f3e7c6;' +
        'border:1px solid #c8960c;border-left:4px solid #e8b84b;border-radius:4px;padding:.6rem .9rem;font:600 .8rem/1.4 "Source Serif 4",Georgia,serif;box-shadow:0 6px 22px rgba(0,0,0,.45);display:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._t); t._t = setTimeout(function() { t.style.display = 'none'; }, 5000);
  }

  // ── Continuar de onde parou ──
  function mountContinue() {
    var grid = document.querySelector('#materias .materia-grid');
    if (!grid || ui.cont) return;
    var c = ui.cont = document.createElement('div');
    c.className = 'vm-continue'; c.hidden = true;
    c.innerHTML = '<div><strong>Continuar de onde parou</strong><span class="vc-t"></span><span class="vc-s"></span></div><a href="#">Continuar leitura</a>';
    grid.parentNode.insertBefore(c, grid);
  }
  function renderContinue() {
    if (!ui.cont) return;
    var lr = T.getLastRead();
    var a = lr && manifest && manifest.articles[lr.file];
    if (!a || !a.available) { ui.cont.hidden = true; return; }
    var sub = subjectOf(a.subject);
    ui.cont.querySelector('.vc-t').textContent = a.label;
    ui.cont.querySelector('.vc-s').textContent = (sub ? sub.name : '') + ' · ' + (lr.pct || 0) + '% da página · ' + when(lr.ts || 0);
    ui.cont.querySelector('a').href = openUrl(lr.file, '&resume=1');
    ui.cont.hidden = false;
  }

  // ── Backup / restauração ──
  function modal(title, bodyHtml, buttons) {
    return new Promise(function(resolve) {
      var m = document.createElement('div');
      m.className = 'vm-modal';
      m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', title);
      m.innerHTML = '<div class="vm-box"><h3>' + esc(title) + '</h3><div>' + bodyHtml + '</div><div class="vm-act"></div></div>';
      var act = m.querySelector('.vm-act');
      buttons.forEach(function(b) {
        var x = document.createElement('button');
        x.type = 'button'; x.textContent = b.label; if (b.danger) x.className = 'vm-danger';
        x.addEventListener('click', function() { m.remove(); resolve(b.value); });
        act.appendChild(x);
      });
      m.addEventListener('keydown', function(e) { if (e.key === 'Escape') { m.remove(); resolve(null); } });
      document.body.appendChild(m);
      act.querySelector('button').focus();
    });
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Arquivo grande demais para ser um backup (máximo 5 MB).'); return; }
    var fr = new FileReader();
    fr.onerror = function() { toast('Não foi possível ler o arquivo.'); };
    fr.onload = function() {
      var obj;
      try { obj = JSON.parse(String(fr.result)); } catch (e) { toast('O arquivo não é um JSON válido.'); return; }
      var err = T.validateBackup(obj);
      if (err) { toast(err); return; }
      var body = 'Backup de <strong>' + esc((obj.exportedAt || '').slice(0, 10) || 'data desconhecida') + '</strong>: ' +
        obj.sessions.length + ' sessões e ' + Object.keys(obj.completed).length + ' artigos concluídos.<br><br>' +
        '<strong>Somar</strong> junta ao que já existe neste navegador (não apaga nada). ' +
        '<strong>Substituir tudo</strong> apaga os dados de estudo atuais e usa só os do arquivo.';
      modal('Restaurar backup', body, [
        { label: 'Somar aos dados atuais', value: 'merge' },
        { label: 'Substituir tudo', value: 'replace', danger: true },
        { label: 'Cancelar', value: null }
      ]).then(function(mode) {
        if (!mode) return;
        var r = T.importBackup(obj, mode);
        if (!r.ok) { toast(r.error); return; }
        toast('Backup restaurado: ' + r.sessions.added + ' sessões e ' + r.completed.added + ' artigos adicionados' +
          (r.sessions.ignored ? ' (' + r.sessions.ignored + ' sessões inválidas ignoradas)' : '') + '.');
        refreshAll();
      });
    };
    fr.readAsText(file);
  }

  function mountBackup() {
    var actions = document.querySelector('.db-actions');
    if (!actions || ui.bkBtn) return;
    ui.bkBtn = document.createElement('button');
    ui.bkBtn.className = 'db-btn'; ui.bkBtn.type = 'button'; ui.bkBtn.textContent = '⬇ Backup (JSON)';
    ui.bkBtn.title = 'Baixa um arquivo com todas as sessões, artigos concluídos e configurações';
    ui.bkBtn.addEventListener('click', function() { T.downloadBackup(); toast('Backup baixado. Guarde o arquivo em local seguro.'); renderExtras(); });
    ui.rsBtn = document.createElement('button');
    ui.rsBtn.className = 'db-btn'; ui.rsBtn.type = 'button'; ui.rsBtn.textContent = '⬆ Restaurar backup';
    ui.file = document.createElement('input');
    ui.file.type = 'file'; ui.file.accept = 'application/json,.json'; ui.file.hidden = true;
    ui.file.addEventListener('change', function() { importFile(ui.file.files[0]); ui.file.value = ''; });
    ui.rsBtn.addEventListener('click', function() { ui.file.click(); });
    actions.insertBefore(ui.rsBtn, actions.firstChild);
    actions.insertBefore(ui.bkBtn, actions.firstChild);
    actions.appendChild(ui.file);
  }

  // ── Meta diária, backup e conferência ──
  function mountExtras() {
    var stats = document.querySelector('.db-stats');
    if (!stats || ui.extra) return;
    var d = ui.extra = document.createElement('div');
    d.className = 'vm-db-extra';
    d.innerHTML =
      '<div class="vde-card" id="vde-goal"><h4>Meta diária</h4><div class="vde-txt"></div><div class="vde-bar"><i></i></div>' +
        '<div class="vde-row"><label>Meta (min/dia) <input type="number" min="0" max="1440" step="5" aria-label="Meta diária em minutos"></label><button type="button">Salvar meta</button></div></div>' +
      '<div class="vde-card" id="vde-bk"><h4>Backup dos estudos</h4><div class="vde-txt"></div>' +
        '<div class="vde-row"><button type="button">Fazer backup agora</button></div></div>' +
      '<div class="vde-card" id="vde-rev"><h4>Conferência a renovar</h4><div class="vde-txt"></div><ul></ul>' +
        '<div class="vde-row"><label>Prazo (dias) <input type="number" min="7" max="730" step="1" aria-label="Prazo em dias para renovar a conferência"></label><button type="button">Salvar prazo</button></div></div>';
    stats.parentNode.insertBefore(d, stats.nextSibling);
    d.querySelector('#vde-goal button').addEventListener('click', function() {
      var v = Math.round(+d.querySelector('#vde-goal input').value || 0);
      T.saveSettings({ dailyGoalMin: v });
      toast(v > 0 ? 'Meta diária: ' + v + ' min.' : 'Meta diária desativada.');
      renderExtras();
    });
    d.querySelector('#vde-bk button').addEventListener('click', function() { T.downloadBackup(); toast('Backup baixado.'); renderExtras(); });
    d.querySelector('#vde-rev button').addEventListener('click', function() {
      var v = Math.round(+d.querySelector('#vde-rev input').value || 0);
      if (v < 7) { toast('Use um prazo de pelo menos 7 dias.'); return; }
      T.saveSettings({ reviewDays: v });
      renderExtras();
    });
  }

  function renderExtras() {
    if (!ui.extra) return;
    var d = ui.extra, st = T.getSettings();
    // meta
    var goal = st.dailyGoalMin, today = T.studyMsToday() / 60000;
    var g = d.querySelector('#vde-goal');
    g.querySelector('.vde-txt').textContent = goal > 0
      ? 'Hoje: ' + Math.floor(today) + ' de ' + goal + ' min (' + Math.min(100, Math.round(today / goal * 100)) + '%)'
      : 'Defina uma meta diária para acompanhar seu estudo. Hoje: ' + Math.floor(today) + ' min.';
    g.querySelector('.vde-bar i').style.width = goal > 0 ? Math.min(100, today / goal * 100) + '%' : '0';
    var gi = g.querySelector('input'); if (document.activeElement !== gi) gi.value = goal || '';
    // backup
    var bk = d.querySelector('#vde-bk'), ts = T.getLastBackupTs();
    var ns = T.getSessions().filter(function(s) { return s.state === 'done'; }).length, nc = Object.keys(T.getCompletedArticles()).length;
    var old = !ts || (Date.now() - ts) > 14 * 86400000;
    bk.classList.toggle('warn', old && (ns + nc) > 0);
    bk.querySelector('.vde-txt').innerHTML = (ts ? 'Último backup: ' + when(ts) + '.' : 'Nenhum backup feito neste navegador.') +
      '<br>' + ns + (ns === 1 ? ' sessão e ' : ' sessões e ') + nc + (nc === 1 ? ' artigo concluído. ' : ' artigos concluídos. ') +
      ((old && (ns + nc) > 0) ? '<strong>Os dados ficam só neste navegador:</strong> limpar o cache ou trocar de aparelho apaga tudo. Faça um backup.' : 'Os dados ficam só neste navegador.');
    // conferência
    var rv = d.querySelector('#vde-rev'), ri = rv.querySelector('input');
    if (document.activeElement !== ri) ri.value = st.reviewDays;
    if (!manifest) { rv.querySelector('.vde-txt').textContent = 'Indisponível: abra pelo endereço publicado do site.'; rv.querySelector('ul').innerHTML = ''; return; }
    var list = [];
    Object.keys(manifest.articles).forEach(function(f) {
      var a = manifest.articles[f];
      if (!a.available) return;
      var fr = VMData.freshness(a, st.reviewDays);
      if (fr.cls !== 'ok') list.push({ f: f, a: a, fr: fr });
    });
    list.sort(function(x, y) { return y.fr.days - x.fr.days; });
    rv.classList.toggle('warn', list.length > 0);
    rv.querySelector('.vde-txt').textContent = list.length
      ? list.length + (list.length === 1 ? ' artigo com conferência acima de ' : ' artigos com conferência acima de ') + st.reviewDays + ' dias ou sem data exata. Reconfira súmulas, teses e leis antes de usar em peça ou audiência.'
      : 'Todos os artigos publicados foram conferidos dentro do prazo de ' + st.reviewDays + ' dias.';
    rv.querySelector('ul').innerHTML = list.slice(0, 40).map(function(x) {
      var lbl = x.fr.days === Infinity ? 'sem data' : (x.a.checkedPrecision === 'dia' ? VMData.fmtAge(x.fr.days) : (x.a.checkedLabel || 'sem data exata'));
      return '<li><a href="' + esc(openUrl(x.f)) + '">' + esc(x.a.label) + '</a><span>' + esc(lbl) + '</span></li>';
    }).join('');
  }

  // ── Notas das sessões (coluna do dashboard) ──
  function mountNotes() {
    var body = document.getElementById('dbSessionsBody');
    if (!body || body._vmNotes) return;
    body._vmNotes = true;
    body.addEventListener('click', function(e) {
      var td = e.target.closest && e.target.closest('td.td-note');
      if (!td) return;
      var id = td.getAttribute('data-id');
      var cur = (T.getSessions().filter(function(s) { return s.id === id; })[0] || {}).note || '';
      var v = window.prompt('Nota desta sessão (até 500 caracteres; deixe vazio para apagar):', cur);
      if (v === null) return;
      if (T.setSessionNote(id, v)) { if (window.dbRefresh) window.dbRefresh(); toast('Nota atualizada.'); }
    });
  }

  function refreshAll() {
    if (window.dbRefresh) window.dbRefresh();
    if (window.updateProgressBars) window.updateProgressBars();
    renderContinue(); renderExtras();
  }

  function start() {
    mountContinue(); mountBackup(); mountExtras(); mountNotes();
    renderExtras();
    VMData.manifest().then(function(m) { manifest = m; renderContinue(); renderExtras(); });
    window.addEventListener('storage', function() { renderContinue(); renderExtras(); });
    setInterval(renderExtras, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
