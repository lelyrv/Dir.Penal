// Calculadoras: lógica pura (calc-core.js) contra casos conferidos à mão a partir do TEXTO OFICIAL dos dispositivos
// (CP arts. 10, 77, 109, 110, 115, 117; Lei 9.099 arts. 61 e 89; Súmula 723/STF). Sem navegador.
import { createRequire } from 'node:module';
import { suite } from './lib.mjs';

const C = createRequire(import.meta.url)('../calc-core.js');
const T = suite('Calculadoras (lógica)');
const Y = 360, M = 30;
const pena = (a = 0, m = 0, d = 0) => ({ anos: a, meses: m, dias: d });
const raises = (fn) => { try { fn(); return false; } catch (e) { return true; } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── art. 109: cada fronteira dos incisos ──
const t109 = [
  [Y - 1, 3, 'VI'], [Y, 4, 'V'], [2 * Y, 4, 'V'], [2 * Y + 1, 8, 'IV'], [4 * Y, 8, 'IV'], [4 * Y + 1, 12, 'III'],
  [8 * Y, 12, 'III'], [8 * Y + 1, 16, 'II'], [12 * Y, 16, 'II'], [12 * Y + 1, 20, 'I'],
];
T.check('Art. 109: prazo correto nas 10 fronteiras (inferior a 1 ano = 3; igual a 1 = 4; igual a 2 = 4; 2a1d = 8; ... 12a1d = 20)',
  t109.every(([d, anos, inc]) => { const r = C.prazo109(d); return r.anos === anos && r.inciso === inc; }),
  t109.map(([d]) => C.prazo109(d).anos).join(','));
T.check('Art. 109: pena zero ou negativa é recusada', raises(() => C.prazo109(0)) && raises(() => C.toDays(pena(-1))));

// ── art. 115 ──
const ab = (o) => C.prazoPrescricao(Object.assign({ modo: 'abstrata' }, o));
T.check('Prescrição abstrata: máximo de 4 anos → 8 anos (96 meses)', ab({ pena: pena(4) }).meses === 96);
T.check('Art. 115: menor de 21 anos ao tempo do crime reduz de metade (8 anos → 4 anos)', ab({ pena: pena(4), menor21: true }).meses === 48);
T.check('Art. 115: maior de 70 anos na sentença também reduz de metade', ab({ pena: pena(4), maior70: true }).meses === 48);
T.check('Art. 115: prazo de 3 anos vira 1 ano e 6 meses', ab({ pena: pena(0, 11), menor21: true }).texto === '1 ano e 6 meses');
const vs = ab({ pena: pena(5), menor21: true, violenciaSexualMulher: true });
T.check('Art. 115 (Lei 15.160/2025): violência sexual contra a mulher NÃO tem redução, e a calculadora avisa', vs.meses === 144 && vs.avisos.some((a) => a.includes('violência sexual')));
T.check('Menor de 21 e maior de 70 juntos: redução uma só vez (e aviso)', ab({ pena: pena(4), menor21: true, maior70: true }).meses === 48);

// ── art. 110 ──
const ex = (o) => C.prazoPrescricao(Object.assign({ modo: 'executoria' }, o));
T.check('Art. 110, caput: pena aplicada de 2 anos (prazo 4) + 1/3 se reincidente = 5 anos e 4 meses', ex({ pena: pena(2), reincidente: true }).texto === '5 anos e 4 meses');
T.check('Art. 110, caput: sem reincidência não aumenta (4 anos)', ex({ pena: pena(2), reincidente: false }).meses === 48);
T.check('Art. 110 + 115: reincidente e maior de 70 → 2 anos e 8 meses', ex({ pena: pena(2), reincidente: true, maior70: true }).texto === '2 anos e 8 meses');
const co = C.prazoPrescricao({ modo: 'concreta', pena: pena(2), reincidente: true });
T.check('Art. 110, § 1º: não aplica o aumento de reincidência e avisa do termo inicial (não anterior à denúncia)', co.meses === 48 && co.avisos.some((a) => a.includes('denúncia')));
T.check('Todo resultado de prescrição lembra os arts. 111, 116 e 117', ab({ pena: pena(4) }).avisos.some((a) => /111/.test(a) && /116/.test(a) && /117/.test(a)));

// ── datas: art. 10 (o dia do começo inclui-se) ──
T.check('Prazo de 4 anos iniciado em 10/01/2020 termina em 09/01/2024', C.ultimoDia('2020-01-10', 48).data === '2024-01-09');
T.check('Prazo de 4 anos a partir de 29/02/2020: aniversário 29/02/2024, termina 28/02/2024 (sem ajuste)', eq(C.ultimoDia('2020-02-29', 48), { data: '2024-02-28', aniversario: '2024-02-29', ajustado: false }));
const aj = C.ultimoDia('2020-02-29', 12);
T.check('Aniversário inexistente (29/02 + 1 ano): recua para 28/02 e MARCA como ajustado para conferência', aj.ajustado === true && aj.aniversario === '2021-02-28' && aj.data === '2021-02-27');
T.check('Virada de ano: 31/12/2020 + 1 ano termina em 30/12/2021', C.ultimoDia('2020-12-31', 12).data === '2021-12-30');
T.check('Datas inválidas são recusadas (formato, 30/02, mês 13)', raises(() => C.parseDate('10/01/2020')) && raises(() => C.parseDate('2020-02-30')) && raises(() => C.parseDate('2020-13-01')));

// ── marcos interruptivos (art. 117, § 2º) ──
const ev = [{ rotulo: 'Recebimento da denúncia', data: '2018-06-15' }];
let r = C.conferirIntervalos('2015-03-01', ev, '2022-06-14', 48);
T.check('Intervalos: um dia antes do fim do prazo de 4 anos após o recebimento da denúncia ainda NÃO prescreveu', r.prescreveu === false && r.intervalos.length === 2 && r.intervalos[1].ultimoDia === '2022-06-14');
r = C.conferirIntervalos('2015-03-01', ev, '2022-06-15', 48);
T.check('Intervalos: no dia seguinte prescreveu (fim em 14/06/2022)', r.prescreveu === true && r.quando === '2022-06-14');
r = C.conferirIntervalos('2015-03-01', ev, '2019-01-01', 48);
T.check('Intervalos: o marco reinicia o prazo (entre 01/03/2015 e a denúncia de 2018 não prescreveu)', r.prescreveu === false && r.intervalos[0].prescreveu === false);
r = C.conferirIntervalos('2015-03-01', [{ rotulo: 'Denúncia', data: '2019-03-01' }], '2019-03-02', 48);
T.check('Sem marco no prazo: prescreveu antes da denúncia (fim em 28/02/2019)', r.prescreveu === true && r.quando === '2019-02-28' && r.intervalos.length === 1);
r = C.conferirIntervalos('2015-03-01', [{ rotulo: 'B', data: '2020-01-01' }, { rotulo: 'A', data: '2017-01-01' }], '2021-01-01', 48);
T.check('Marcos fora de ordem são ordenados pela data', r.intervalos[1].de === 'A' && r.intervalos[2].de === 'B');
T.check('Data de referência anterior a um marco é recusada', raises(() => C.conferirIntervalos('2015-03-01', ev, '2016-01-01', 48)));

// ── suspensão condicional do processo (art. 89 + Súmula 723/STF) ──
const sc = (o) => C.scpp(o);
T.check('Art. 89: pena mínima de 1 ano admite; 1 ano e 1 dia não admite', sc({ minima: pena(1) }).admissivel === true && sc({ minima: pena(1, 0, 1) }).admissivel === false);
T.check('Súmula 723/STF: crime continuado, mínima de 10 meses + 1/6 (11m20d) admite', sc({ minima: pena(0, 10), continuado: true }).admissivel === true);
T.check('Súmula 723/STF: crime continuado, mínima de 11 meses + 1/6 (12m25d) NÃO admite', sc({ minima: pena(0, 11), continuado: true }).admissivel === false);
T.check('Súmula 723/STF: fronteira exata (308 dias admite, 309 não; 1 ano = 360 dias)', sc({ minima: pena(0, 0, 308), continuado: true }).admissivel === true && sc({ minima: pena(0, 0, 309), continuado: true }).admissivel === false);
const pp = C.periodoProva('2024-03-10', 2, [2, 4]);
T.check('Período de prova de 2 anos desde 10/03/2024 termina em 09/03/2026; fora de 2 a 4 anos é recusado', pp.fim === '2026-03-09' && raises(() => C.periodoProva('2024-03-10', 5, [2, 4])) && raises(() => C.periodoProva('2024-03-10', 1, [2, 4])));

// ── suspensão condicional da pena (art. 77) ──
const su = (o) => C.sursis(o);
T.check('Art. 77: pena de 2 anos cabe (2 a 4 anos); 2 anos e 1 dia não cabe', su({ pena: pena(2) }).cabe && eq(su({ pena: pena(2) }).faixa, [2, 4]) && !su({ pena: pena(2, 0, 1) }).cabe);
T.check('Art. 77, § 2º: maior de 70 anos ou saúde, pena até 4 anos → 4 a 6 anos', eq(su({ pena: pena(3), maior70OuSaude: true }).faixa, [4, 6]) && !su({ pena: pena(4, 0, 1), maior70OuSaude: true }).cabe);
T.check('Art. 77, I: reincidente em crime doloso não cabe', su({ pena: pena(1), reincidenteDoloso: true }).cabe === false);

// ── menor potencial ofensivo (art. 61) ──
T.check('Art. 61: máxima de 2 anos é de menor potencial; 2 anos e 1 dia não; contravenção sempre', C.menorPotencial({ maxima: pena(2) }).sim && !C.menorPotencial({ maxima: pena(2, 0, 1) }).sim && C.menorPotencial({ contravencao: true }).sim);
T.check('Formatação: 400 dias = 1 ano, 1 mês e 10 dias; 54 meses = 4 anos e 6 meses', C.fmtPena(400) === '1 ano e 1 mês e 10 dias' && C.fmtMonths(54) === '4 anos e 6 meses');

T.done();
