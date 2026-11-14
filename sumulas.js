/** Página "Súmulas e teses citadas": lê citations.json (gerado por tools/build.py a partir do texto das páginas + registro). */
(function() {
  'use strict';
  if (!window.VMData) return;
  var $ = function(id) { return document.getElementById(id); };
  var entries = {}, manifest = null;
  var STATUS = { vigente: 'Vigente', cancelada: 'Cancelada', superada: 'Superada', alterada: 'Alterada', 'nao-verificado': 'Enunciado não cadastrado' };

  function fold(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function brDate(iso) { return iso.split('-').reverse().join('/'); }
  function pageUrl(m) {
    var a = manifest && manifest.articles[m.file];
    var sub = a && manifest.subjects.filter(function(s) { return s.id === a.subject; })[0];
    return sub ? sub.index + '?art=' + encodeURIComponent(m.file) + (m.sec ? '&sec=' + encodeURIComponent(m.sec) : '') : m.file + (m.sec ? '#' + m.sec : '');
  }

  function render() {
    var q = fold($('f-q').value.trim()), trib = $('f-trib').value, st = $('f-status').value;
    var ids = Object.keys(entries).filter(function(id) {
      var e = entries[id];
      if (trib && e.tribunal !== trib) return false;
      if (st === 'problema' && !/^(cancelada|superada|alterada)$/.test(e.status)) return false;
      if (st && st !== 'problema' && e.status !== st) return false;
      if (q && fold(e.label + ' ' + (e.enunciado || '') + ' ' + e.numero).indexOf(q) < 0) return false;
      return true;
    });
    var box = $('lista');
    box.innerHTML = '';
    ids.forEach(function(id) {
      var e = entries[id];
      var d = document.createElement('article');
      d.className = 'sm-item ' + e.status; d.id = id;
      var h = document.createElement('div'); h.className = 'sm-head';
      var t = document.createElement('h3'); t.textContent = e.label;
      var b = document.createElement('span'); b.className = 'tp-badge ' + e.status; b.textContent = STATUS[e.status] || e.status;
      h.appendChild(t); h.appendChild(b);
      d.appendChild(h);
      if (e.enunciado) { var en = document.createElement('p'); en.className = 'sm-enun'; en.textContent = e.enunciado; d.appendChild(en); }
      if (e.observacao) { var ob = document.createElement('div'); ob.className = 'sm-obs'; ob.textContent = e.observacao; d.appendChild(ob); }
      var src = document.createElement('div'); src.className = 'tp-src';
      if (e.fonte) {
        src.appendChild(document.createTextNode('Fonte oficial: '));
        var a = document.createElement('a'); a.href = e.fonte; a.target = '_blank'; a.rel = 'noopener'; a.textContent = e.fonte.replace(/^https:\/\//, '').slice(0, 70);
        src.appendChild(a);
        src.appendChild(document.createTextNode(' · lida em ' + brDate(e.verificadoEm)));
      } else {
        src.textContent = 'Sem leitura da fonte oficial neste site. Confira no tribunal antes de citar.';
      }
      d.appendChild(src);
      var ul = document.createElement('ul'); ul.className = 'sm-men';
      e.mentions.forEach(function(m) {
        var li = document.createElement('li');
        var a = document.createElement('a'); a.href = pageUrl(m);
        var art = manifest && manifest.articles[m.file];
        a.textContent = (art ? art.label : m.file) + ' · ' + m.secTitle;
        li.appendChild(a); ul.appendChild(li);
      });
      if (e.mentions.length) { var lab = document.createElement('div'); lab.className = 'tp-src'; lab.style.marginTop = '.5rem'; lab.textContent = 'Aparece em ' + e.mentions.length + ' seção(ões):'; d.appendChild(lab); d.appendChild(ul); }
      else { var no = document.createElement('div'); no.className = 'tp-src'; no.textContent = 'Cadastrada no registro, mas não citada em nenhuma página publicada.'; d.appendChild(no); }
      box.appendChild(d);
    });
    var all = Object.keys(entries).length, ver = Object.keys(entries).filter(function(k) { return entries[k].status !== 'nao-verificado'; }).length;
    $('count').textContent = ids.length + ' de ' + all + ' precedentes · ' + ver + ' com enunciado cadastrado e lido na fonte oficial · ' + (all - ver) + ' ainda sem enunciado cadastrado';
    var hit = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (hit) { hit.classList.add('hit'); hit.scrollIntoView(); }
  }

  Promise.all([VMData.citations(), VMData.manifest()]).then(function(r) {
    if (!r[0]) { $('count').textContent = 'Esta página só carrega quando o site é aberto pelo endereço publicado (não direto do arquivo no disco).'; return; }
    entries = r[0].entries; manifest = r[1];
    var tribs = {};
    Object.keys(entries).forEach(function(k) { tribs[entries[k].tribunal] = 1; });
    Object.keys(tribs).sort().forEach(function(t) { var o = document.createElement('option'); o.value = t; o.textContent = t; $('f-trib').appendChild(o); });
    ['f-q', 'f-trib', 'f-status'].forEach(function(id) { $(id).addEventListener('input', render); $(id).addEventListener('change', render); });
    window.addEventListener('hashchange', render);
    render();
  });
})();
