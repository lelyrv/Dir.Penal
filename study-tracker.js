/**
 * VM Study Tracker — Módulo de rastreamento de estudos
 * Armazena sessões de leitura e artigos concluídos no localStorage.
 *
 * v3 — correções da auditoria do cronômetro:
 *  - a sessão gravada é a ÚNICA fonte da verdade; a tela apenas a exibe
 *    (recarregar a página, em leitura ou em pausa, mostra o tempo correto);
 *  - sessão abandonada (aba fechada sem "Fim") é encerrada no último sinal de vida,
 *    e não contabiliza horas ou dias de ausência;
 *  - iniciar em outro artigo encerra e SALVA a sessão do artigo anterior;
 *  - abas sincronizadas (evento "storage"); sessão apagada/encerrada em outra aba
 *    é detectada e avisada, sem divergência silenciosa;
 *  - armazenamento indisponível (modo privado/bloqueio) cai para memória;
 *  - CSV com duração exata (HH:MM:SS), coluna de total real e valores entre aspas.
 *
 * A barra (HTML) fica em cada artigo; a lógica fica aqui: VMTracker.mountBar().
 */
(function(window) {
  'use strict';

  const SESSIONS_KEY   = 'vadeMecum_studySessions';
  const COMPLETED_KEY  = 'vadeMecum_completedArticles';
  const ACTIVE_KEY     = 'vadeMecum_activeSession';
  const SETTINGS_KEY   = 'vadeMecum_settings';      // { dailyGoalMin, reviewDays }
  const LASTREAD_KEY   = 'vadeMecum_lastRead';      // última página lida (para "continuar de onde parou")
  const BACKUP_KEY     = 'vadeMecum_lastBackup';    // quando foi feito o último backup
  const GOALFLAG_KEY   = 'vadeMecum_goalToastDay';  // dia em que o aviso de meta já foi mostrado
  const BACKUP_SCHEMA  = 1;

  const HEARTBEAT_MS     = 10 * 1000;        // sinal de vida da sessão em andamento
  const STALE_MS         = 15 * 60 * 1000;   // sem sinal por mais que isso = sessão abandonada
  const LEGACY_STALE_MS  = 4 * 60 * 60 * 1000; // sessões gravadas antes do sinal de vida

  // Configuração das matérias: total de artigos no código real
  const SUBJECTS_CONFIG = {
    'CP':  { name: 'Cód. Penal',          totalArticles: 361,  color: '#8b1a1a', colorLight: '#fde8e8' },
    'CPP': { name: 'Cód. de Proc. Penal', totalArticles: 811,  color: '#c0392b', colorLight: '#fdecea' },
    'CC':  { name: 'Cód. Civil',          totalArticles: 2046, color: '#b8922a', colorLight: '#fdf3d8' },
    'CPC': { name: 'Cód. de Proc. Civil', totalArticles: 1071, color: '#2471a3', colorLight: '#dce8f5' },
    'CLT': { name: 'CLT',                 totalArticles: 922,  color: '#145a32', colorLight: '#dceee3' },
    'L9099': { name: 'Lei 9.099/95 (JECrim)', totalArticles: 97, color: '#0f6e6e', colorLight: '#d9eeee' },
  };

  const DAYS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

  // ─── Armazenamento (localStorage com queda para memória) ─────────────────────
  const _mem = {};
  const _ls = (function() {
    try {
      const k = '__vm_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (e) { return null; }
  })();

  function _get(key) {
    if (_ls) { try { return _ls.getItem(key); } catch (e) { /* cai para memória */ } }
    return Object.prototype.hasOwnProperty.call(_mem, key) ? _mem[key] : null;
  }
  function _set(key, val) {
    if (_ls) { try { _ls.setItem(key, val); return true; } catch (e) { /* cai para memória */ } }
    _mem[key] = val; return false;
  }
  function _del(key) {
    if (_ls) { try { _ls.removeItem(key); } catch (e) { /* ignora */ } }
    delete _mem[key];
  }
  function _load(key) {
    try { return JSON.parse(_get(key)) || null; }
    catch(e) { return null; }
  }
  function _save(key, data) { return _set(key, JSON.stringify(data)); }

  // ─── Formatação ──────────────────────────────────────────────────────────────
  function _now() { return Date.now(); }
  function _pad(n) { return String(Math.floor(n)).padStart(2, '0'); }
  /** HH:MM:SS (relógio do cronômetro) */
  function _toHHMMSS(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    return _pad(totalSec / 3600) + ':' + _pad((totalSec % 3600) / 60) + ':' + _pad(totalSec % 60);
  }
  /** HH:MM (arredondado ao minuto; usado nos totais agregados) */
  function _msToHHMM(ms) {
    const totalMin = Math.round(Math.max(0, ms) / 60000);
    return _pad(totalMin / 60) + ':' + _pad(totalMin % 60);
  }
  /** Pausa em andamento: MM:SS (ou HH:MM:SS a partir de 1 h) */
  function _pauseFmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return s >= 3600 ? _toHHMMSS(ms) : _pad(s / 60) + ':' + _pad(s % 60);
  }
  function _timeStr(ts) {
    const d = new Date(ts);
    return _pad(d.getHours()) + ':' + _pad(d.getMinutes());
  }
  function _dateStr(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + _pad(d.getMonth()+1) + '-' + _pad(d.getDate());
  }
  function _dayOfWeek(ts) { return DAYS_PT[new Date(ts).getDay()]; }

  // ─── Session CRUD ────────────────────────────────────────────────────────────

  function getSessions() { return _load(SESSIONS_KEY) || []; }

  function saveSession(session) {
    const sessions = getSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.push(session);
    _save(SESSIONS_KEY, sessions);
  }

  function deleteSession(sessionId) {
    const sessions = getSessions().filter(s => s.id !== sessionId);
    _save(SESSIONS_KEY, sessions);
  }

  // ─── Active Session ──────────────────────────────────────────────────────────

  function getActiveSession() { return _load(ACTIVE_KEY); }

  function startSession(articleId, subject, subjectId, articleNum) {
    // Nunca sobrescreve uma sessão em andamento: encerra e salva a anterior.
    const prev = getActiveSession();
    if (prev) settleActive(articleId, { closeAny: true });

    const ts = _now();
    const session = {
      id: 'sess_' + ts + '_' + articleId,
      date: _dateStr(ts),
      dayOfWeek: _dayOfWeek(ts),
      subject: subject,
      subjectId: subjectId,
      articleFile: articleId,
      articleNum: articleNum,
      startTs: ts,
      startTime: _timeStr(ts),
      pauses: [],         // [{pauseStart, pauseStartTs, pauseEnd, pauseEndTs, pauseMs}]
      pauseTotalMs: 0,
      lastSeenTs: ts,     // sinal de vida (atualizado enquanto a página está aberta)
      endTs: null,
      endTime: null,
      totalStudyMs: null,
      state: 'reading'    // 'reading' | 'paused' | 'done'
    };
    _save(ACTIVE_KEY, session);
    return session;
  }

  function pauseSession() {
    const s = getActiveSession();
    if (!s || s.state !== 'reading') return null;
    const ts = _now();
    s.state = 'paused';
    s.lastSeenTs = ts;
    s.pauses.push({ pauseStartTs: ts, pauseStart: _timeStr(ts) });
    _save(ACTIVE_KEY, s);
    return s;
  }

  function resumeSession() {
    const s = getActiveSession();
    if (!s || s.state !== 'paused') return null;
    const ts = _now();
    const lastPause = s.pauses[s.pauses.length - 1];
    lastPause.pauseEndTs = ts;
    lastPause.pauseEnd   = _timeStr(ts);
    lastPause.pauseMs    = ts - lastPause.pauseStartTs;
    s.pauseTotalMs += lastPause.pauseMs;
    s.lastSeenTs = ts;
    s.state = 'reading';
    _save(ACTIVE_KEY, s);
    return s;
  }

  /** Fecha a sessão no instante informado (fecha pausa aberta) e a grava como concluída. */
  function _finalize(s, endTs) {
    let end = Math.max(endTs, s.startTs);
    if (s.state === 'paused') {
      const lp = s.pauses[s.pauses.length - 1];
      if (lp && !lp.pauseEndTs) {
        end = Math.max(end, lp.pauseStartTs);
        lp.pauseEndTs = end;
        lp.pauseEnd   = _timeStr(end);
        lp.pauseMs    = end - lp.pauseStartTs;
        s.pauseTotalMs += lp.pauseMs;
      }
    }
    s.endTs         = end;
    s.endTime       = _timeStr(end);
    s.totalStudyMs  = Math.max(0, (end - s.startTs) - s.pauseTotalMs);
    s.studyDuration = _msToHHMM(s.totalStudyMs);
    s.pauseDuration = _msToHHMM(s.pauseTotalMs);
    s.state = 'done';
    saveSession(s);
    try { window.dispatchEvent(new CustomEvent('vm:session-saved')); } catch (e) { /* ignora */ }   // gatilho do backup automático
    return s;
  }

  function endSession() {
    const s = getActiveSession();
    if (!s) return null;
    _finalize(s, _now());
    _del(ACTIVE_KEY);
    return s;
  }

  function clearActiveSession() { _del(ACTIVE_KEY); }

  /** Sinal de vida: só atualiza se a sessão armazenada ainda for a mesma. */
  function heartbeat(sessionId) {
    const s = getActiveSession();
    if (!s || s.id !== sessionId) return null;
    s.lastSeenTs = _now();
    _save(ACTIVE_KEY, s);
    return s;
  }

  /** Sessão sem sinal de vida há mais que o limite (ou legada muito antiga). */
  function _isStale(s, now) {
    return s.lastSeenTs ? (now - s.lastSeenTs > STALE_MS) : (now - s.startTs > LEGACY_STALE_MS);
  }

  /**
   * Resolve a sessão ativa que não deve continuar:
   *  - abandonada (sem sinal de vida) → encerrada no último sinal;
   *  - de OUTRO artigo, quando opts.closeForeign → encerrada e salva.
   * Retorna { session, reason, discarded } ou null se nada foi alterado.
   * Sessões encerradas com menos de 1 s de estudo são descartadas (não geram registro).
   */
  function settleActive(currentArticleId, opts) {
    const s = getActiveSession();
    if (!s) return null;
    const now = _now();
    const stale = _isStale(s, now);
    const foreign = !!currentArticleId && s.articleFile !== currentArticleId;
    const wanted = !!opts && (opts.closeAny || (opts.closeForeign && foreign));
    if (!stale && !wanted) return null;

    let end = s.lastSeenTs || (stale ? s.startTs : now);
    if (s.state === 'paused') {
      const lp = s.pauses[s.pauses.length - 1];
      if (lp) end = Math.max(end, lp.pauseStartTs);
    }
    end = Math.min(Math.max(end, s.startTs), now);
    const reason = stale ? 'inatividade' : (foreign ? 'troca de artigo' : 'nova sessao');

    // estimativa do estudo para decidir se vale gravar
    let openPause = 0;
    if (s.state === 'paused') {
      const lp = s.pauses[s.pauses.length - 1];
      if (lp && !lp.pauseEndTs) openPause = Math.max(0, end - lp.pauseStartTs);
    }
    const study = (end - s.startTs) - s.pauseTotalMs - openPause;
    if (study < 1000) {
      _del(ACTIVE_KEY);
      return { session: s, reason: reason, discarded: true };
    }
    s.autoClosed = true;
    s.autoClosedReason = reason;
    _finalize(s, end);
    _del(ACTIVE_KEY);
    return { session: s, reason: reason, discarded: false };
  }

  // ─── Completed Articles ───────────────────────────────────────────────────────

  function getCompletedArticles() { return _load(COMPLETED_KEY) || {}; }

  function markArticleCompleted(articleId, subject, subjectId, articleNum) {
    const completed = getCompletedArticles();
    completed[articleId] = {
      subject, subjectId, articleNum,
      completedAt: new Date().toISOString()
    };
    _save(COMPLETED_KEY, completed);
  }

  function unmarkArticleCompleted(articleId) {
    const completed = getCompletedArticles();
    delete completed[articleId];
    _save(COMPLETED_KEY, completed);
  }

  function isArticleCompleted(articleId) {
    return !!getCompletedArticles()[articleId];
  }

  // ─── Configurações, última leitura, notas e meta diária ───────────────────────

  function getSettings() {
    const s = _load(SETTINGS_KEY) || {};
    const goal = Math.round(+s.dailyGoalMin);
    const rev = Math.round(+s.reviewDays);
    return {
      dailyGoalMin: goal > 0 ? Math.min(1440, goal) : 0,       // 0 = sem meta
      reviewDays: rev >= 7 ? Math.min(730, rev) : 90            // prazo para "revisar" a conferência
    };
  }
  function saveSettings(patch) {
    _save(SETTINGS_KEY, Object.assign({}, getSettings(), patch || {}));
    return getSettings();
  }

  function getLastRead() { return _load(LASTREAD_KEY); }
  function setLastRead(info) { _save(LASTREAD_KEY, info); }

  function setSessionNote(sessionId, note) {
    const sessions = getSessions();
    const s = sessions.find(x => x.id === sessionId);
    if (!s) return false;
    const txt = String(note || '').trim().slice(0, 500);
    if (txt) s.note = txt; else delete s.note;
    _save(SESSIONS_KEY, sessions);
    return true;
  }

  /** Tempo de estudo (sem pausas) de uma sessão em andamento, em ms. */
  function activeStudyMs(s, now) {
    now = now || _now();
    if (s.state === 'paused') {
      const lp = s.pauses[s.pauses.length - 1];
      return (lp ? lp.pauseStartTs : now) - s.startTs - s.pauseTotalMs;
    }
    return now - s.startTs - s.pauseTotalMs;
  }

  /** Estudo de hoje (sessões concluídas + a que está em andamento), em ms. */
  function studyMsToday() {
    const today = _dateStr(_now());
    let ms = 0;
    getSessions().forEach(s => { if (s.state === 'done' && s.date === today) ms += s.totalStudyMs || 0; });
    const a = getActiveSession();
    if (a && a.date === today) ms += Math.max(0, activeStudyMs(a));
    return ms;
  }

  // ─── Cartões de treino (revisão espaçada, método Leitner) ─────────────────────
  // Cada cartão tem uma "caixa" 0..5. Acertar sobe a caixa e agenda a próxima revisão mais longe;
  // errar volta à caixa 0 (revisar hoje); "difícil" mantém a caixa e repete amanhã.

  const CARDS_KEY = 'vadeMecum_cards';
  const NOTES_KEY = 'vadeMecum_notes';
  const MARKS_KEY = 'vadeMecum_marks';
  const BOX_DAYS = [1, 3, 7, 21, 60];                 // dias até a próxima revisão ao ACERTAR, por caixa de origem

  function getCards() { return _load(CARDS_KEY) || {}; }

  function _addDays(ts, d) { const x = new Date(ts); x.setDate(x.getDate() + d); return _dateStr(x.getTime()); }

  /** rating: 'errei' | 'dificil' | 'acertei'. Retorna o estado novo do cartão. */
  function rateCard(id, rating, now) {
    now = now || _now();
    const cards = getCards();
    const c = cards[id] || { box: 0, seen: 0, ok: 0 };
    c.seen++; c.last = now;
    if (rating === 'acertei') { c.ok++; c.due = _addDays(now, BOX_DAYS[Math.min(c.box, BOX_DAYS.length - 1)]); c.box = Math.min(c.box + 1, 5); }
    else if (rating === 'dificil') { c.due = _addDays(now, 1); }
    else { c.box = 0; c.due = _dateStr(now); }
    cards[id] = c;
    _save(CARDS_KEY, cards);
    return c;
  }

  /** Estado de um cartão hoje: 'novo' (nunca visto), 'vencido' (revisar) ou 'em dia'. */
  function cardState(c, now) {
    if (!c) return 'novo';
    return c.due <= _dateStr(now || _now()) ? 'vencido' : 'em dia';
  }

  function dueCount(ids, now) {
    const cards = getCards();
    let novos = 0, vencidos = 0;
    ids.forEach(id => { const s = cardState(cards[id], now); if (s === 'novo') novos++; else if (s === 'vencido') vencidos++; });
    return { novos, vencidos };
  }

  // ─── Notas e marcadores por seção ─────────────────────────────────────────────
  // Chave: "ARQUIVO.html#id-da-secao".

  function getNotes() { return _load(NOTES_KEY) || {}; }
  function setNote(key, text) {
    const notes = getNotes();
    const t = String(text || '').trim().slice(0, 2000);
    if (t) notes[key] = { text: t, ts: _now() }; else delete notes[key];
    _save(NOTES_KEY, notes);
    return !!t;
  }
  function getMarks() { return _load(MARKS_KEY) || {}; }
  function toggleMark(key) {
    const marks = getMarks();
    let on;
    if (marks[key]) { delete marks[key]; on = false; } else { marks[key] = _now(); on = true; }
    _save(MARKS_KEY, marks);
    return on;
  }

  // ─── Backup e restauração (arquivo JSON) ──────────────────────────────────────
  // Os dados ficam só neste navegador; o backup permite trocar de aparelho ou recuperar após limpar o cache.

  function buildBackup() {
    return {
      app: 'vade-mecum', schema: BACKUP_SCHEMA, exportedAt: new Date().toISOString(),
      sessions: getSessions().filter(s => s.state === 'done'),
      completed: getCompletedArticles(),
      settings: getSettings(),
      lastRead: getLastRead(),
      cards: getCards(), notes: getNotes(), marks: getMarks()      // opcionais: backups antigos não têm
    };
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(buildBackup(), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vademecum-backup-' + _dateStr(_now()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    _set(BACKUP_KEY, String(_now()));
  }

  function getLastBackupTs() { const v = +_get(BACKUP_KEY); return v > 0 ? v : null; }
  function markBackup() { _set(BACKUP_KEY, String(_now())); }          // usado pelo backup automático em pasta

  const _isNum = v => typeof v === 'number' && isFinite(v);
  const _str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  /** Aceita só sessões bem formadas e devolve cópias com os campos conhecidos (nada de campo estranho). */
  function _cleanSession(s) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || s.id.length > 120) return null;
    if (s.state !== 'done' || !_isNum(s.startTs) || !_isNum(s.totalStudyMs)) return null;
    if (s.startTs < 946684800000 || s.startTs > _now() + 86400000) return null;           // 2000-01-01 .. amanhã
    if (s.totalStudyMs < 0 || s.totalStudyMs > 7 * 86400000) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) return null;
    const out = {
      id: s.id, date: s.date, dayOfWeek: _str(s.dayOfWeek, 20), subject: _str(s.subject, 60), subjectId: _str(s.subjectId, 20),
      articleFile: _str(s.articleFile, 40), articleNum: _isNum(+s.articleNum) ? +s.articleNum : _str(String(s.articleNum || ''), 10),
      startTs: s.startTs, startTime: _str(s.startTime, 8), endTs: _isNum(s.endTs) ? s.endTs : null, endTime: _str(s.endTime, 8),
      totalStudyMs: s.totalStudyMs, pauseTotalMs: _isNum(s.pauseTotalMs) && s.pauseTotalMs >= 0 ? s.pauseTotalMs : 0,
      studyDuration: _str(s.studyDuration, 12), pauseDuration: _str(s.pauseDuration, 12), state: 'done',
      pauses: Array.isArray(s.pauses) ? s.pauses.slice(0, 500).filter(p => p && _isNum(p.pauseStartTs)).map(p => ({
        pauseStartTs: p.pauseStartTs, pauseStart: _str(p.pauseStart, 8), pauseEndTs: _isNum(p.pauseEndTs) ? p.pauseEndTs : null,
        pauseEnd: _str(p.pauseEnd, 8), pauseMs: _isNum(p.pauseMs) ? p.pauseMs : 0 })) : []
    };
    if (typeof s.note === 'string' && s.note.trim()) out.note = s.note.trim().slice(0, 500);
    if (s.autoClosed === true) { out.autoClosed = true; out.autoClosedReason = _str(s.autoClosedReason, 40); }
    return out;
  }

  function validateBackup(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return 'O arquivo não é um backup do Vade Mecum.';
    if (o.app !== 'vade-mecum') return 'O arquivo não é um backup do Vade Mecum (campo "app" ausente).';
    if (o.schema !== BACKUP_SCHEMA) return 'Versão de backup não suportada (' + o.schema + ').';
    if (!Array.isArray(o.sessions) || typeof o.completed !== 'object' || o.completed === null || Array.isArray(o.completed)) return 'Backup incompleto ou corrompido.';
    if (o.sessions.length > 50000) return 'Backup grande demais.';
    return null;
  }

  /**
   * Importa um backup já lido (objeto). mode: 'merge' (padrão; soma ao que existe) ou 'replace' (substitui).
   * Retorna { ok, error?, sessions:{added, ignored}, completed:{added}, mode }.
   */
  function importBackup(o, mode) {
    const err = validateBackup(o);
    if (err) return { ok: false, error: err };
    mode = mode === 'replace' ? 'replace' : 'merge';
    const incoming = [];
    let ignored = 0;
    o.sessions.forEach(s => { const c = _cleanSession(s); if (c) incoming.push(c); else ignored++; });
    const completedIn = {};
    Object.keys(o.completed).slice(0, 20000).forEach(k => {
      const v = o.completed[k];
      if (/^[A-Z0-9]+-ART-\d+$/.test(k) && v && typeof v === 'object') {
        completedIn[k] = { subject: _str(v.subject, 60), subjectId: _str(v.subjectId, 20), articleNum: v.articleNum,
                           completedAt: _str(v.completedAt, 40) };
      }
    });
    let addedS = 0, addedC = 0;
    if (mode === 'replace') {
      _save(SESSIONS_KEY, incoming); addedS = incoming.length;
      _save(COMPLETED_KEY, completedIn); addedC = Object.keys(completedIn).length;
    } else {
      const cur = getSessions();
      const byId = {};
      cur.forEach(s => { byId[s.id] = s; });
      incoming.forEach(s => {
        if (!byId[s.id]) { cur.push(s); byId[s.id] = s; addedS++; }
        else if (s.note && !byId[s.id].note) byId[s.id].note = s.note;
      });
      _save(SESSIONS_KEY, cur);
      const comp = getCompletedArticles();
      Object.keys(completedIn).forEach(k => { if (!comp[k]) { comp[k] = completedIn[k]; addedC++; } });
      _save(COMPLETED_KEY, comp);
    }
    if (o.settings && typeof o.settings === 'object' && (mode === 'replace' || !_load(SETTINGS_KEY))) saveSettings(o.settings);
    if (o.lastRead && typeof o.lastRead === 'object' && typeof o.lastRead.file === 'string') {
      const cur = getLastRead();
      if (mode === 'replace' || !cur || (+o.lastRead.ts || 0) > (+cur.ts || 0)) setLastRead(o.lastRead);
    }
    // cartões, notas e marcadores (campos opcionais; só entra o que passa na validação)
    const KEY_RE = /^[A-Z0-9]+-ART-\d+\.html#[\w-]{0,60}$/;
    const _int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi);
    let addedCards = 0, addedNotes = 0, addedMarks = 0;
    if (o.cards && typeof o.cards === 'object' && !Array.isArray(o.cards)) {
      const cur = mode === 'replace' ? {} : getCards();
      Object.keys(o.cards).slice(0, 20000).forEach(k => {
        const c = o.cards[k];
        if (!KEY_RE.test(k) || !c || typeof c !== 'object' || !_int(c.box, 0, 5) || !/^\d{4}-\d{2}-\d{2}$/.test(c.due || '')) return;
        const clean = { box: c.box, due: c.due, seen: _int(c.seen, 0, 1e6) ? c.seen : 0, ok: _int(c.ok, 0, 1e6) ? c.ok : 0, last: _isNum(c.last) ? c.last : 0 };
        if (!cur[k] || (clean.last > (cur[k].last || 0))) { if (!cur[k]) addedCards++; cur[k] = clean; }
      });
      _save(CARDS_KEY, cur);
    }
    if (o.notes && typeof o.notes === 'object' && !Array.isArray(o.notes)) {
      const cur = mode === 'replace' ? {} : getNotes();
      Object.keys(o.notes).slice(0, 20000).forEach(k => {
        const n = o.notes[k];
        if (!KEY_RE.test(k) || !n || typeof n.text !== 'string' || !n.text.trim()) return;
        const clean = { text: n.text.trim().slice(0, 2000), ts: _isNum(n.ts) ? n.ts : 0 };
        if (!cur[k] || clean.ts > (cur[k].ts || 0)) { if (!cur[k]) addedNotes++; cur[k] = clean; }
      });
      _save(NOTES_KEY, cur);
    }
    if (o.marks && typeof o.marks === 'object' && !Array.isArray(o.marks)) {
      const cur = mode === 'replace' ? {} : getMarks();
      Object.keys(o.marks).slice(0, 20000).forEach(k => {
        if (KEY_RE.test(k) && _isNum(o.marks[k]) && !cur[k]) { cur[k] = o.marks[k]; addedMarks++; }
      });
      _save(MARKS_KEY, cur);
    }
    return { ok: true, mode, sessions: { added: addedS, ignored }, completed: { added: addedC },
             cards: { added: addedCards }, notes: { added: addedNotes }, marks: { added: addedMarks } };
  }

  // ─── Aggregation (for Dashboard) ──────────────────────────────────────────────

  function getSubjectsConfig() { return SUBJECTS_CONFIG; }

  /** Total de artigos de todas as matérias monitoradas (soma de SUBJECTS_CONFIG: fonte única). */
  function getTotalArticles() {
    return Object.values(SUBJECTS_CONFIG).reduce((a, c) => a + c.totalArticles, 0);
  }

  /** Retorna sessões filtradas por período e/ou matéria */
  function filterSessions({ period, subjectId, dateFrom, dateTo } = {}) {
    let sessions = getSessions().filter(s => s.state === 'done');
    if (subjectId) sessions = sessions.filter(s => s.subjectId === subjectId);
    const today = _dateStr(_now());
    if (period === 'today') {
      sessions = sessions.filter(s => s.date === today);
    } else if (period === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      const from = _dateStr(d.getTime());
      sessions = sessions.filter(s => s.date >= from);
    } else if (period === 'month') {
      const d = new Date(); d.setDate(d.getDate() - 29);
      const from = _dateStr(d.getTime());
      sessions = sessions.filter(s => s.date >= from);
    } else if (dateFrom) {
      sessions = sessions.filter(s => s.date >= dateFrom && (!dateTo || s.date <= dateTo));
    }
    return sessions;
  }

  /** Horas totais de estudo em minutos por matéria */
  function getStudyMinutesBySubject(sessions) {
    const map = {};
    sessions.forEach(s => {
      if (!map[s.subjectId]) map[s.subjectId] = 0;
      map[s.subjectId] += (s.totalStudyMs || 0) / 60000;
    });
    return map;
  }

  /** Horas por dia (últimos N dias) */
  function getStudyMinutesByDay(sessions, days = 14) {
    const result = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      result[_dateStr(d.getTime())] = 0;
    }
    sessions.forEach(s => {
      if (result.hasOwnProperty(s.date)) {
        result[s.date] += (s.totalStudyMs || 0) / 60000;
      }
    });
    return result;
  }

  /** Resumo por matéria para tabela do dashboard */
  function getSummaryBySubject() {
    const completed = getCompletedArticles();
    const sessions  = getSessions().filter(s => s.state === 'done');
    const result    = {};

    Object.entries(SUBJECTS_CONFIG).forEach(([key, cfg]) => {
      result[key] = {
        subjectId: key,
        name: cfg.name,
        totalArticles: cfg.totalArticles,
        color: cfg.color,
        colorLight: cfg.colorLight,
        completedCount: 0,
        studyMinutes: 0,
        pauseMinutes: 0,
        daysStudied: new Set()
      };
    });

    Object.values(completed).forEach(a => {
      if (result[a.subjectId]) result[a.subjectId].completedCount++;
    });

    sessions.forEach(s => {
      if (result[s.subjectId]) {
        result[s.subjectId].studyMinutes += (s.totalStudyMs || 0) / 60000;
        result[s.subjectId].pauseMinutes += (s.pauseTotalMs || 0) / 60000;
        result[s.subjectId].daysStudied.add(s.date);
      }
    });

    Object.values(result).forEach(r => {
      r.daysCount = r.daysStudied.size;
      r.pct = r.totalArticles > 0
        ? ((r.completedCount / r.totalArticles) * 100).toFixed(1)
        : '0.0';
      r.studyHHMM = _msToHHMM(r.studyMinutes * 60000);
    });

    return result;
  }

  /** Estatísticas globais */
  function getGlobalStats() {
    const sessions  = getSessions().filter(s => s.state === 'done');
    const completed = getCompletedArticles();
    const totalStudyMs  = sessions.reduce((a, s) => a + (s.totalStudyMs || 0), 0);
    const totalPauseMs  = sessions.reduce((a, s) => a + (s.pauseTotalMs || 0), 0);
    const uniqueDays    = new Set(sessions.map(s => s.date)).size;
    const avgMsPerDay   = uniqueDays > 0 ? totalStudyMs / uniqueDays : 0;
    return {
      totalStudyHHMM: _msToHHMM(totalStudyMs),
      totalPauseHHMM: _msToHHMM(totalPauseMs),
      totalSessions:  sessions.length,
      completedCount: Object.keys(completed).length,
      uniqueDays,
      avgPerDayHHMM:  _msToHHMM(avgMsPerDay)
    };
  }

  /** Formata ms como HH:MM:SS para timer ao vivo */
  function formatTimer(ms) { return _toHHMMSS(ms); }
  function msToHHMM(ms)    { return _msToHHMM(ms); }
  function dateStr(ts)     { return _dateStr(ts); }
  function timeStr(ts)     { return _timeStr(ts); }

  /** Durações exatas de uma sessão concluída (HH:MM:SS), com queda para os campos antigos. */
  function sessionDurations(s) {
    const hasMs = typeof s.totalStudyMs === 'number';
    const study = hasMs ? s.totalStudyMs : null;
    const pause = hasMs ? (s.pauseTotalMs || 0) : null;
    return {
      study: hasMs ? _toHHMMSS(study) : (s.studyDuration || ''),
      pause: hasMs ? _toHHMMSS(pause) : (s.pauseDuration || ''),
      total: hasMs ? _toHHMMSS(study + pause) : (s.studyDuration || '')
    };
  }

  // ─── Exportar como CSV ────────────────────────────────────────────────────────
  function _csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

  function exportCSV() {
    const sessions = getSessions().filter(s => s.state === 'done');
    const header = ['DATA','DIA','MATÉRIA','ARQUIVO','ART.','HORA INÍCIO','HORA FINAL','ESTUDO','PAUSA','TEMPO TOTAL (ESTUDO + PAUSA)','NOTA'];
    const rows = sessions.map(s => {
      const d = sessionDurations(s);
      return [
        s.date, s.dayOfWeek, s.subject, s.articleFile, s.articleNum,
        s.startTime || '', s.endTime || '', d.study, d.pause, d.total, s.note || ''
      ];
    });
    const csv = [header, ...rows].map(r => r.map(_csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'relatorio_estudos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Barra de estudo (cronômetro) dos artigos ─────────────────────────────────
  // Estado da tela = derivado da sessão gravada. Nada de contadores paralelos.

  function mountBar(opts) {
    const bar = document.getElementById('vm-study-bar');
    if (!bar || bar.__vmMounted) return;
    bar.__vmMounted = true;

    const ds = bar.dataset || {};
    const cfg = Object.assign({
      articleId: ds.articleId,
      subject: ds.subject,
      subjectId: ds.subjectId,
      articleNum: parseInt(ds.articleNum, 10)
    }, opts || {});

    const $ = id => document.getElementById(id);
    const elTimer = $('vm-timer'), elPause = $('vm-pause-timer'), elStatus = $('vm-status');
    const btnS = $('vm-btn-start'), btnP = $('vm-btn-pause'), btnE = $('vm-btn-end');
    const chk = $('vm-check'), lbl = $('vm-check-label');

    // Semântica para leitores de tela: o relógio não é anunciado a cada segundo (role="timer"
    // é "live=off"); só a mudança de estado ("Estudando", "Pausado"...) é anunciada.
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cronômetro de estudo');
    if (elTimer) { elTimer.setAttribute('role', 'timer'); elTimer.setAttribute('aria-label', 'Tempo de estudo'); }
    if (elPause) elPause.setAttribute('aria-label', 'Tempo em pausa');
    if (elStatus) { elStatus.setAttribute('role', 'status'); elStatus.setAttribute('aria-live', 'polite'); }
    if (btnP) btnP.setAttribute('aria-label', 'Pausar estudo');
    if (btnE) btnE.setAttribute('aria-label', 'Encerrar e salvar a sessão');

    let mode = 'idle';        // 'idle' | 'reading' | 'paused' | 'done'
    let mySid = null;         // id da sessão que esta tela exibe
    let doneMs = 0;
    let tickIv = null, hbIv = null, toastTimer = null, toastEl = null;

    // ── aviso discreto (injeta o próprio CSS; não depende do CSS do artigo) ──
    function toast(msg) {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'vm-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        toastEl.style.cssText = 'position:fixed;right:12px;z-index:2147483647;max-width:min(92vw,440px);' +
          'background:#0d1b2a;color:#f3e7c6;border:1px solid #c8960c;border-left:4px solid #e8b84b;' +
          'border-radius:4px;padding:.6rem .85rem;font:600 .78rem/1.4 "Source Serif 4",Georgia,serif;' +
          'box-shadow:0 6px 22px rgba(0,0,0,.45);cursor:pointer;display:none;';
        toastEl.addEventListener('click', function() { toastEl.style.display = 'none'; });
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.top = (bar.offsetHeight + 8) + 'px';
      toastEl.style.display = 'block';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function() { toastEl.style.display = 'none'; }, 9000);
    }

    function setStatus(t, c) { elStatus.textContent = t; elStatus.className = 'vm-status ' + c; }

    function setMode(m, session) {
      mode = m;
      btnS.setAttribute('aria-label', m === 'paused' ? 'Retomar estudo' : m === 'done' ? 'Nova sessão de estudo' : 'Iniciar estudo');
      mySid = session ? session.id : (m === 'reading' || m === 'paused' ? mySid : null);
      if (m === 'idle') {
        setStatus('Parado', 'vm-status-idle');
        btnS.textContent = '▶ Iniciar'; btnS.disabled = false;
        btnP.disabled = true; btnE.disabled = true;
        elTimer.textContent = '00:00:00'; elPause.textContent = '';
      } else if (m === 'reading') {
        setStatus('Estudando', 'vm-status-reading');
        btnS.textContent = '▶ Iniciar'; btnS.disabled = true;
        btnP.disabled = false; btnE.disabled = false;
        elPause.textContent = '';
      } else if (m === 'paused') {
        setStatus('Pausado', 'vm-status-paused');
        btnS.textContent = '► Retomar'; btnS.disabled = false;
        btnP.disabled = true; btnE.disabled = false;
      } else if (m === 'done') {
        setStatus('Concluído ✓', 'vm-status-done');
        btnS.textContent = '↺ Nova'; btnS.disabled = false;
        btnP.disabled = true; btnE.disabled = true;
        elTimer.textContent = _toHHMMSS(doneMs); elPause.textContent = '';
      }
      tick();
    }

    // Tempo exibido = calculado a partir da sessão gravada (inclui reload/abas).
    function tick() {
      if (mode !== 'reading' && mode !== 'paused') { refreshTitle(); return; }
      const s = getActiveSession();
      if (!s || s.id !== mySid) return;
      const now = _now();
      if (mode === 'reading') {
        elTimer.textContent = _toHHMMSS(now - s.startTs - s.pauseTotalMs);
      } else {
        const lp = s.pauses[s.pauses.length - 1];
        const ps = lp ? lp.pauseStartTs : now;
        elTimer.textContent = _toHHMMSS(ps - s.startTs - s.pauseTotalMs);
        elPause.textContent = '⏸ ' + _pauseFmt(now - ps);
      }
      refreshTitle();
    }

    // Tempo na aba do navegador ("▶ 12:34 · título"): dá para acompanhar o estudo de outra aba/janela.
    // Sem estado guardado: sempre parte do título atual sem o prefixo. Dentro do iframe, atualiza o título da janela de fora.
    const topDoc = (function() { try { return window.top.document; } catch (e) { return document; } })();
    const TITLE_RE = /^[▶⏸] [\d:]+ · /;
    function refreshTitle() {
      try {
        const cur = topDoc.title, base = cur.replace(TITLE_RE, '');
        if (mode === 'reading' || mode === 'paused') {
          const nt = (mode === 'reading' ? '▶ ' : '⏸ ') + elTimer.textContent.replace(/^00:/, '') + ' · ' + base;
          if (cur !== nt) topDoc.title = nt;
        } else if (base !== cur) {
          topDoc.title = base;
        }
      } catch (e) { /* sem acesso ao título de fora: ignora */ }
    }

    // ── Meta diária: avisa uma vez por dia ao atingir ──
    function checkGoal() {
      const goal = getSettings().dailyGoalMin;
      if (!goal) return;
      const today = _dateStr(_now());
      if (_get(GOALFLAG_KEY) === today) return;
      if (studyMsToday() >= goal * 60000) {
        _set(GOALFLAG_KEY, today);
        toast('Meta diária atingida: ' + goal + ' min de estudo hoje.');
      }
    }

    // ── Nota opcional ao encerrar a sessão (só para sessões com 30 s ou mais) ──
    let noteEl = null, noteTimer = null;
    function closeNote() { clearTimeout(noteTimer); if (noteEl) noteEl.style.display = 'none'; }
    function askNote(s) {
      if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.id = 'vm-note';
        noteEl.setAttribute('role', 'dialog');
        noteEl.setAttribute('aria-label', 'Anotação da sessão de estudo');
        noteEl.style.cssText = 'position:fixed;right:12px;z-index:2147483647;width:min(92vw,360px);background:#0d1b2a;color:#f3e7c6;' +
          'border:1px solid #c8960c;border-left:4px solid #e8b84b;border-radius:4px;padding:.7rem .8rem;' +
          'box-shadow:0 8px 26px rgba(0,0,0,.5);font:600 .78rem/1.4 "Source Serif 4",Georgia,serif;display:none;';
        noteEl.innerHTML = '<label for="vm-note-t" id="vm-note-l" style="display:block;margin-bottom:.35rem"></label>' +
          '<textarea id="vm-note-t" maxlength="500" rows="3" placeholder="Ex.: rever a tese da Súmula 523; dúvida sobre prazo" ' +
          'style="width:100%;box-sizing:border-box;font:400 .8rem/1.4 Georgia,serif;padding:.4rem;border:1px solid #c8960c;border-radius:3px;background:#fff;color:#1a1208;resize:vertical"></textarea>' +
          '<div style="display:flex;gap:.4rem;justify-content:flex-end;margin-top:.45rem">' +
          '<button type="button" data-a="skip" style="font-weight:700;font-size:.72rem;font-family:inherit;background:none;color:#e8b84b;border:1px solid rgba(232,184,75,.6);border-radius:3px;padding:.3rem .65rem;cursor:pointer">Pular</button>' +
          '<button type="button" data-a="save" style="font-weight:700;font-size:.72rem;font-family:inherit;background:#c8960c;color:#0d1b2a;border:1px solid #c8960c;border-radius:3px;padding:.3rem .65rem;cursor:pointer">Salvar nota</button></div>';
        document.body.appendChild(noteEl);
        noteEl.addEventListener('click', function(e) {
          const a = e.target.getAttribute && e.target.getAttribute('data-a');
          if (a === 'skip') closeNote();
          if (a === 'save') {
            setSessionNote(noteEl._sid, noteEl.querySelector('#vm-note-t').value);
            closeNote(); toast('Nota salva na sessão.');
          }
        });
        noteEl.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') { e.stopPropagation(); closeNote(); }
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); noteEl.querySelector('[data-a=save]').click(); }
        });
      }
      noteEl._sid = s.id;
      noteEl.querySelector('#vm-note-l').textContent = 'Sessão salva (' + _toHHMMSS(s.totalStudyMs) + '). Quer anotar algo?';
      noteEl.querySelector('#vm-note-t').value = '';
      noteEl.style.top = (bar.offsetHeight + 8 + (toastEl && toastEl.style.display === 'block' ? toastEl.offsetHeight + 8 : 0)) + 'px';
      noteEl.style.display = 'block';
      noteEl.querySelector('#vm-note-t').focus();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(closeNote, 45000);
    }

    function externalEnd(msg) {
      mySid = null;
      setMode('idle');
      toast(msg || 'Sessão encerrada em outra aba (ou os dados de estudo foram apagados). Confira no Dashboard.');
    }

    function announceSettled(r) {
      if (!r) return;
      const art = (r.session.subject || '') + ', art. ' + (r.session.articleNum || r.session.articleFile);
      if (r.discarded) {
        toast('Uma sessão anterior sem tempo de estudo (' + art + ') foi descartada.');
        return;
      }
      const when = _timeStr(r.session.endTs);
      toast(r.reason === 'inatividade'
        ? 'Sessão anterior (' + art + ') encerrada por inatividade às ' + when + '. Tempo registrado: ' + _toHHMMSS(r.session.totalStudyMs) + '.'
        : 'Sessão de ' + art + ' encerrada e salva (' + _toHHMMSS(r.session.totalStudyMs) + ') ao iniciar este artigo.');
    }

    // Reconcilia a tela com a sessão gravada (carga, evento storage, aba visível, sinal de vida).
    function sync() {
      const settled = settleActive(cfg.articleId, { closeForeign: false });
      if (settled) {
        if (settled.session.articleFile === cfg.articleId && (mode === 'reading' || mode === 'paused')) {
          mySid = null; setMode('idle');
        }
        announceSettled(settled);
      }
      const s = getActiveSession();
      if (s && s.articleFile === cfg.articleId) {
        if (s.id !== mySid || mode !== s.state) { mySid = s.id; setMode(s.state, s); }
      } else if (mode === 'reading' || mode === 'paused') {
        externalEnd();
      }
    }

    function guardOwn() {
      const a = getActiveSession();
      if (!a || a.id !== mySid || a.articleFile !== cfg.articleId) { externalEnd(); return null; }
      return a;
    }

    window.vmStartResume = function() {
      if (mode === 'done') { setMode('idle'); return; }          // botão "Nova"
      if (mode === 'idle') {
        sync();                                                   // outra aba pode já ter iniciado este artigo
        if (mode !== 'idle') return;
        const closed = settleActive(cfg.articleId, { closeForeign: true });
        const s = startSession(cfg.articleId, cfg.subject, cfg.subjectId, cfg.articleNum);
        setMode('reading', s);
        announceSettled(closed);
      } else if (mode === 'paused') {
        if (!guardOwn()) return;
        const s = resumeSession();
        if (!s) { externalEnd(); return; }
        setMode('reading', s);
      }
    };
    window.vmPause = function() {
      if (mode !== 'reading' || !guardOwn()) return;
      const s = pauseSession();
      if (!s) { externalEnd(); return; }
      setMode('paused', s);
    };
    window.vmEnd = function() {
      if (mode !== 'reading' && mode !== 'paused') return;
      if (!guardOwn()) return;
      const s = endSession();
      if (!s) { externalEnd(); return; }
      doneMs = s.totalStudyMs || 0;
      mySid = null;
      setMode('done');
      checkGoal();
      if (doneMs >= 30000) askNote(s);
    };
    window.vmToggleCompleted = function() {
      if (chk.checked) {
        markArticleCompleted(cfg.articleId, cfg.subject, cfg.subjectId, cfg.articleNum);
        lbl.textContent = '✓ Feito!'; lbl.style.color = '#2ecc71';
      } else {
        unmarkArticleCompleted(cfg.articleId);
        lbl.textContent = 'Concluído'; lbl.style.color = '';
      }
    };

    // ── inicialização ──
    if (isArticleCompleted(cfg.articleId)) {
      chk.checked = true; lbl.textContent = '✓ Feito!'; lbl.style.color = '#2ecc71';
    }
    setMode('idle');
    sync();

    tickIv = setInterval(tick, 500);
    hbIv = setInterval(function() {
      if (mode === 'reading' || mode === 'paused') { sync(); if (mySid) heartbeat(mySid); checkGoal(); }
    }, HEARTBEAT_MS);

    window.addEventListener('storage', function(e) {
      if (e.key === null || e.key === ACTIVE_KEY || e.key === COMPLETED_KEY) {
        sync();
        if (e.key === null || e.key === COMPLETED_KEY) {
          const done = isArticleCompleted(cfg.articleId);
          chk.checked = done;
          lbl.textContent = done ? '✓ Feito!' : 'Concluído';
          lbl.style.color = done ? '#2ecc71' : '';
        }
      }
    });
    document.addEventListener('visibilitychange', function() {
      if (mySid && (mode === 'reading' || mode === 'paused')) {
        if (document.visibilityState === 'visible') sync();
        if (mySid) heartbeat(mySid);
      }
    });
    window.addEventListener('pagehide', function() {
      if (mySid && (mode === 'reading' || mode === 'paused')) heartbeat(mySid);
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  window.VMTracker = {
    getSessions, saveSession, deleteSession,
    getActiveSession, startSession, pauseSession, resumeSession, endSession, clearActiveSession,
    heartbeat, settleActive,
    getCompletedArticles, markArticleCompleted, unmarkArticleCompleted, isArticleCompleted,
    getSubjectsConfig, getTotalArticles, filterSessions,
    getStudyMinutesBySubject, getStudyMinutesByDay,
    getSummaryBySubject, getGlobalStats,
    formatTimer, msToHHMM, sessionDurations, exportCSV,
    getSettings, saveSettings, getLastRead, setLastRead, setSessionNote, activeStudyMs, studyMsToday,
    getCards, rateCard, cardState, dueCount, getNotes, setNote, getMarks, toggleMark,
    buildBackup, downloadBackup, validateBackup, importBackup, getLastBackupTs, markBackup,
    mountBar
  };

})(window);
