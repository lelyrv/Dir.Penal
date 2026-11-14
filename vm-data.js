/**
 * VMData — carregador compartilhado do manifesto (articles.json) e do índice de busca
 * (search-index.json). Ambos são gerados por tools/build.py.
 *
 * Funciona em http(s) (GitHub Pages, servidor local, app instalado). Em file:// o navegador
 * bloqueia fetch de arquivos locais: nesse caso as funções resolvem com null e quem chama degrada.
 */
(function(window) {
  'use strict';

  var cache = {};

  function load(name) {
    if (cache[name]) return cache[name];
    cache[name] = (window.fetch && location.protocol !== 'file:')
      ? fetch(name).then(function(r) { if (!r.ok) throw new Error(name + ': ' + r.status); return r.json(); })
          .catch(function() { cache[name] = null; return null; })
      : Promise.resolve(null);
    return cache[name];
  }

  /** Nome do arquivo da página atual ("DP-ART-28.html"; "index.html" quando termina em /). */
  function currentFile() {
    var p = location.pathname.split('/').pop();
    return p || 'index.html';
  }

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /** Dias desde a data de conferência ("2026-05-03", "2026-05" ou "2026"; mês/ano contam do início do período, critério conservador). */
  function ageDays(iso) {
    var p = iso.split('-');
    var t = new Date(+p[0], p[1] ? +p[1] - 1 : 0, p[2] ? +p[2] : 1).getTime();
    return Math.floor((Date.now() - t) / 86400000);
  }
  function fmtAge(d) {
    if (d < 0) return 'data futura';
    if (d === 0) return 'hoje';
    if (d === 1) return 'há 1 dia';
    if (d < 60) return 'há ' + d + ' dias';
    if (d < 730) return 'há ' + Math.round(d / 30) + ' meses';
    return 'há ' + Math.round(d / 365) + ' anos';
  }
  /** Situação da conferência de um artigo: { cls: ok|warn|old|unknown, main, warn, days }. */
  function freshness(a, reviewDays) {
    reviewDays = reviewDays || 90;
    if (!a || !a.checked) return { cls: 'unknown', main: 'Sem data de conferência registrada nesta página.', warn: true, days: Infinity };
    var p = a.checked.split('-'), prec = a.checkedPrecision;
    var label = prec === 'dia' ? p[2] + '/' + p[1] + '/' + p[0]
              : prec === 'mês' ? MESES[+p[1] - 1] + ' de ' + p[0] + ' (sem o dia exato)'
              : p[0] + ' (sem data exata)';
    var d = ageDays(a.checked);
    var cls = d <= reviewDays ? 'ok' : d <= reviewDays * 2 ? 'warn' : 'old';
    return { cls: cls, main: 'Última conferência: ' + label + ' · ' + fmtAge(d), warn: cls !== 'ok', days: d };
  }

  window.VMData = {
    ageDays: ageDays, fmtAge: fmtAge, freshness: freshness,
    manifest: function() { return load('articles.json'); },
    searchIndex: function() { return load('search-index.json'); },
    currentFile: currentFile,
    /** Artigos disponíveis de uma matéria, na ordem do catálogo. */
    availableOf: function(m, subjectId) {
      var out = [];
      m.subjects.forEach(function(s) {
        if (s.id !== subjectId) return;
        s.groups.forEach(function(g) {
          g.items.forEach(function(f) { if (m.articles[f] && m.articles[f].available) out.push(f); });
        });
      });
      return out;
    },
    subjectById: function(m, id) {
      return m.subjects.filter(function(s) { return s.id === id; })[0] || null;
    }
  };
})(window);
