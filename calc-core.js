/**
 * Lógica das calculadoras (sem tela): prescrição, suspensão condicional do processo, suspensão condicional da pena
 * e infração de menor potencial ofensivo. Módulo puro: roda no navegador (window.VMCalc) e no Node (testes).
 *
 * FONTES (texto oficial lido no Planalto; os dispositivos aparecem na página, ao lado de cada resultado):
 *   CP art. 10 (contagem do prazo), 109, 110, 111, 115, 116, 117, 77; Lei 9.099/1995 arts. 61 e 89;
 *   Súmula 723/STF (crime continuado e suspensão condicional do processo; texto lido na página do STF).
 * Convenção aritmética: 1 ano = 360 dias e 1 mês = 30 dias, só para comparar e fracionar penas (sem calendário).
 * Datas: calendário comum (art. 10 CP: o dia do começo inclui-se no prazo).
 * O QUE ESTE MÓDULO NÃO FAZ: não determina o termo inicial (art. 111), não aplica causas que impedem a prescrição
 * (art. 116), nem interrupções por início de cumprimento de pena ou reincidência (art. 117, V e VI).
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VMCalc = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var Y = 360, M = 30;

  /** {anos, meses, dias} → dias (1 ano = 360, 1 mês = 30). Valores negativos ou não numéricos viram erro. */
  function toDays(p) {
    var a = +p.anos || 0, m = +p.meses || 0, d = +p.dias || 0;
    if (a < 0 || m < 0 || d < 0 || !isFinite(a + m + d)) throw new Error('A pena não pode ter valores negativos.');
    return Math.round(a) * Y + Math.round(m) * M + Math.round(d);
  }
  function fmtPena(days) {
    var a = Math.floor(days / Y), r = days - a * Y, m = Math.floor(r / M), d = r - m * M, out = [];
    if (a) out.push(a + (a === 1 ? ' ano' : ' anos'));
    if (m) out.push(m + (m === 1 ? ' mês' : ' meses'));
    if (d) out.push(d + (d === 1 ? ' dia' : ' dias'));
    return out.join(' e ') || '0';
  }
  function fmtMonths(n) {
    var a = Math.floor(n / 12), m = n % 12, out = [];
    if (a) out.push(a + (a === 1 ? ' ano' : ' anos'));
    if (m) out.push(m + (m === 1 ? ' mês' : ' meses'));
    return out.join(' e ') || '0';
  }

  // ───────── prescrição (CP arts. 109, 110, 115) ─────────
  /** Prazo em ANOS do art. 109, pelo máximo da pena (em dias). */
  function prazo109(maxDays) {
    if (!(maxDays > 0)) throw new Error('Informe uma pena maior que zero.');
    if (maxDays > 12 * Y) return { anos: 20, inciso: 'I' };
    if (maxDays > 8 * Y) return { anos: 16, inciso: 'II' };
    if (maxDays > 4 * Y) return { anos: 12, inciso: 'III' };
    if (maxDays > 2 * Y) return { anos: 8, inciso: 'IV' };
    if (maxDays >= 1 * Y) return { anos: 4, inciso: 'V' };           // igual a um ano ou, sendo superior, não excede a dois
    return { anos: 3, inciso: 'VI' };                                 // inferior a um ano
  }

  /**
   * opts: { modo: 'abstrata'|'concreta'|'executoria', pena:{anos,meses,dias}, menor21, maior70, violenciaSexualMulher,
   *         reincidente }
   * Retorna { meses, texto, passos[], avisos[] }.
   *  - abstrata:   art. 109 pelo máximo cominado (antes do trânsito da sentença).
   *  - concreta:   art. 110, § 1º: pena aplicada, trânsito em julgado para a acusação (ou improvido o recurso). Sem aumento de reincidência.
   *  - executoria: art. 110, caput: pena aplicada, após o trânsito em julgado; +1/3 se o condenado é reincidente.
   */
  function prazoPrescricao(o) {
    var days = toDays(o.pena), p = prazo109(days), meses = p.anos * 12, passos = [], avisos = [];
    passos.push('Pena ' + (o.modo === 'abstrata' ? 'máxima cominada' : 'aplicada') + ': ' + fmtPena(days) + ' → art. 109, ' + p.inciso + ': ' + p.anos + ' anos.');
    if (o.modo === 'concreta') {
      avisos.push('Art. 110, § 1º: o termo inicial não pode ser anterior à data da denúncia ou queixa. Esta calculadora não aplica o aumento de 1/3 por reincidência neste modo; confira a jurisprudência.');
    }
    if (o.modo === 'executoria' && o.reincidente) {
      meses = meses * 4 / 3;
      passos.push('Art. 110, caput: reincidente, prazo aumentado de um terço → ' + fmtMonths(p.anos * 12 * 4 / 3) + '.');
    }
    var reduz = (o.menor21 || o.maior70);
    if (reduz && o.violenciaSexualMulher) {
      avisos.push('Art. 115: a redução de metade NÃO se aplica se o crime envolver violência sexual contra a mulher (redação da Lei 15.160/2025).');
    } else if (reduz) {
      meses = meses / 2;
      passos.push('Art. 115: ' + (o.menor21 ? 'menor de 21 anos ao tempo do crime' : 'maior de 70 anos na data da sentença') + ' → prazo reduzido de metade → ' + fmtMonths(meses) + '.');
    }
    if (o.menor21 && o.maior70) avisos.push('Menor de 21 ao tempo do crime e maior de 70 na sentença: a redução de metade é uma só (art. 115); a calculadora aplicou uma vez.');
    avisos.push('Antes de usar o resultado: confira o termo inicial (art. 111), as causas que impedem a prescrição (art. 116) e as demais causas interruptivas (art. 117, V e VI). No concurso de crimes, a prescrição incide sobre a pena de cada um (art. 119).');
    return { meses: Math.round(meses), texto: fmtMonths(Math.round(meses)), inciso: p.inciso, anos109: p.anos, passos: passos, avisos: avisos };
  }

  // ───────── datas (calendário comum, art. 10 CP) ─────────
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) throw new Error('Data inválida: use AAAA-MM-DD.');
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error('Data inexistente: ' + s);
    return d;
  }
  function iso(d) { return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function br(isoStr) { return isoStr.split('-').reverse().join('/'); }
  function daysIn(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }

  /**
   * Último dia de um prazo em meses que começa em `start` (AAAA-MM-DD): o dia do começo inclui-se (art. 10 CP),
   * logo o prazo termina na véspera do "aniversário". Se o dia não existe no mês final (ex.: 29/02, dia 31),
   * o aniversário recua para o último dia do mês e `ajustado` vem verdadeiro (conferir manualmente).
   */
  function ultimoDia(start, meses) {
    var s = parseDate(start), total = s.getUTCFullYear() * 12 + s.getUTCMonth() + meses;
    var y = Math.floor(total / 12), m0 = total % 12, dd = s.getUTCDate(), max = daysIn(y, m0), ajustado = false;
    if (dd > max) { dd = max; ajustado = true; }
    var ann = new Date(Date.UTC(y, m0, dd));
    var last = new Date(ann.getTime() - 86400000);
    return { data: iso(last), aniversario: iso(ann), ajustado: ajustado };
  }

  /**
   * Confere intervalos entre o termo inicial e os marcos interruptivos (art. 117, I a IV), com o mesmo prazo.
   * eventos: [{ rotulo, data }] em qualquer ordem; ref: data de referência (hoje ou outra).
   * Cada marco reinicia a contagem (art. 117, § 2º). Retorna { intervalos[], prescreveu, quando }.
   */
  function conferirIntervalos(inicio, eventos, ref, meses) {
    var pts = [{ rotulo: 'Termo inicial', data: inicio }];
    (eventos || []).filter(function(e) { return e && e.data; })
      .sort(function(a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; })
      .forEach(function(e) { pts.push(e); });
    pts.push({ rotulo: 'Data de referência', data: ref });
    var out = [], prescreveu = false, quando = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (b.data < a.data) throw new Error('A data de referência é anterior a um marco.');
      var u = ultimoDia(a.data, meses);
      var decorreu = b.data > u.data;
      out.push({ de: a.rotulo, dataDe: a.data, ate: b.rotulo, dataAte: b.data, ultimoDia: u.data, prescreveu: decorreu, ajustado: u.ajustado });
      if (decorreu) { prescreveu = true; quando = u.data; break; }
    }
    return { intervalos: out, prescreveu: prescreveu, quando: quando };
  }

  // ───────── suspensão condicional do processo (Lei 9.099, art. 89) ─────────
  /** opts: { minima:{anos,meses,dias}, continuado } → { admissivel, razoes[] } (só o critério da pena mínima). */
  function scpp(o) {
    var min = toDays(o.minima), razoes = [], ok;
    if (o.continuado) {
      // Súmula 723/STF: não se admite se a pena mínima da infração mais grave + aumento mínimo de 1/6 for superior a um ano.
      ok = min * 7 <= Y * 6;
      razoes.push('Crime continuado (Súmula 723/STF): pena mínima ' + fmtPena(min) + ' + aumento mínimo de 1/6 = ' + fmtPena(Math.round(min * 7 / 6)) +
        (ok ? ', que não é superior a um ano.' : ', que é superior a um ano.'));
    } else {
      ok = min <= Y;
      razoes.push('Art. 89: pena mínima cominada ' + fmtPena(min) + (ok ? ' (igual ou inferior a um ano).' : ' (superior a um ano).'));
    }
    return { admissivel: ok, razoes: razoes };
  }
  /** Fim do período de prova (2 a 4 anos, art. 89) a partir de `inicio`. */
  function periodoProva(inicio, anos, faixa) {
    if (!(anos >= faixa[0] && anos <= faixa[1])) throw new Error('O período deve estar entre ' + faixa[0] + ' e ' + faixa[1] + ' anos.');
    var u = ultimoDia(inicio, anos * 12);
    return { fim: u.data, ajustado: u.ajustado };
  }

  // ───────── suspensão condicional da pena (CP, art. 77) ─────────
  /** opts: { pena:{...}, maior70OuSaude, reincidenteDoloso } → { cabe, faixa:[min,max], razoes[] } (só pena, idade/saúde e reincidência). */
  function sursis(o) {
    var d = toDays(o.pena), razoes = [], faixa = null, cabe = false;
    if (o.reincidenteDoloso) razoes.push('Art. 77, I: o condenado é reincidente em crime doloso: não cabe.');
    else if (d <= 2 * Y) { cabe = true; faixa = [2, 4]; razoes.push('Art. 77, caput: pena de ' + fmtPena(d) + ' (não superior a 2 anos): suspensão por 2 a 4 anos.'); }
    else if (o.maior70OuSaude && d <= 4 * Y) { cabe = true; faixa = [4, 6]; razoes.push('Art. 77, § 2º: pena de ' + fmtPena(d) + ' (não superior a 4 anos), condenado maior de 70 anos ou razões de saúde: suspensão por 4 a 6 anos.'); }
    else razoes.push('Pena de ' + fmtPena(d) + ' acima do limite do art. 77 para o seu caso.');
    return { cabe: cabe, faixa: faixa, razoes: razoes };
  }

  // ───────── menor potencial ofensivo (Lei 9.099, art. 61) ─────────
  function menorPotencial(o) {
    if (o.contravencao) return { sim: true, razao: 'Art. 61: as contravenções penais são infrações de menor potencial ofensivo.' };
    var d = toDays(o.maxima), sim = d <= 2 * Y;
    return { sim: sim, razao: 'Art. 61: pena máxima ' + fmtPena(d) + (sim ? ' (não superior a 2 anos).' : ' (superior a 2 anos).') +
      ' A lei não trata do concurso de crimes nem das causas de aumento: confira a jurisprudência.' };
  }

  return { toDays: toDays, fmtPena: fmtPena, fmtMonths: fmtMonths, prazo109: prazo109, prazoPrescricao: prazoPrescricao,
           parseDate: parseDate, ultimoDia: ultimoDia, conferirIntervalos: conferirIntervalos, scpp: scpp,
           periodoProva: periodoProva, sursis: sursis, menorPotencial: menorPotencial, br: br };
});
