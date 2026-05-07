/**
 * VM Study Tracker — Módulo de rastreamento de estudos
 * Armazena sessões de leitura e artigos concluídos no localStorage
 */
(function(window) {
  'use strict';

  const SESSIONS_KEY   = 'vadeMecum_studySessions';
  const COMPLETED_KEY  = 'vadeMecum_completedArticles';
  const ACTIVE_KEY     = 'vadeMecum_activeSession';

  // Configuração das matérias: total de artigos no código real
  const SUBJECTS_CONFIG = {
    'CP':  { name: 'Cód. Penal',          totalArticles: 361,  color: '#8b1a1a', colorLight: '#fde8e8' },
    'CPP': { name: 'Cód. de Proc. Penal', totalArticles: 811,  color: '#c0392b', colorLight: '#fdecea' },
    'CC':  { name: 'Cód. Civil',          totalArticles: 2046, color: '#b8922a', colorLight: '#fdf3d8' },
    'CPC': { name: 'Cód. de Proc. Civil', totalArticles: 1071, color: '#2471a3', colorLight: '#dce8f5' },
    'CLT': { name: 'CLT',                 totalArticles: 922,  color: '#145a32', colorLight: '#dceee3' },
  };

  const DAYS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

  function _load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch(e) { return null; }
  }
  function _save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch(e) { return false; }
  }
  function _now() { return Date.now(); }
  function _toHHMM(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return (h > 0 ? String(h).padStart(2,'0')+':' : '00:') +
           String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  function _msToHHMM(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }
  function _timeStr(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  function _dateStr(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
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
    s.state = 'paused';
    s.pauses.push({ pauseStartTs: _now(), pauseStart: _timeStr(_now()) });
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
    s.state = 'reading';
    _save(ACTIVE_KEY, s);
    return s;
  }

  function endSession() {
    const s = getActiveSession();
    if (!s) return null;
    // Close open pause if any
    if (s.state === 'paused') {
      const ts = _now();
      const lastPause = s.pauses[s.pauses.length - 1];
      if (!lastPause.pauseEndTs) {
        lastPause.pauseEndTs = ts;
        lastPause.pauseEnd   = _timeStr(ts);
        lastPause.pauseMs    = ts - lastPause.pauseStartTs;
        s.pauseTotalMs += lastPause.pauseMs;
      }
    }
    const ts = _now();
    s.endTs         = ts;
    s.endTime       = _timeStr(ts);
    s.totalStudyMs  = (ts - s.startTs) - s.pauseTotalMs;
    s.studyDuration = _msToHHMM(s.totalStudyMs);
    s.pauseDuration = _msToHHMM(s.pauseTotalMs);
    s.state = 'done';
    saveSession(s);
    localStorage.removeItem(ACTIVE_KEY);
    return s;
  }

  function clearActiveSession() { localStorage.removeItem(ACTIVE_KEY); }

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

  // ─── Aggregation (for Dashboard) ──────────────────────────────────────────────

  function getSubjectsConfig() { return SUBJECTS_CONFIG; }

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
  function formatTimer(ms) { return _toHHMM(ms); }
  function msToHHMM(ms)    { return _msToHHMM(ms); }
  function dateStr(ts)     { return _dateStr(ts); }
  function timeStr(ts)     { return _timeStr(ts); }

  // ─── Exportar como CSV ────────────────────────────────────────────────────────
  function exportCSV() {
    const sessions = getSessions().filter(s => s.state === 'done');
    const header = ['DATA','DIA','MATÉRIA','ARQUIVO','ART.','HORA INÍCIO','HORA FINAL','ESTUDO','PAUSA','HORAS TOTAIS'];
    const rows = sessions.map(s => [
      s.date, s.dayOfWeek, s.subject, s.articleFile, s.articleNum,
      s.startTime || '', s.endTime || '',
      s.studyDuration || '', s.pauseDuration || '',
      s.studyDuration || ''
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'relatorio_estudos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  window.VMTracker = {
    getSessions, saveSession, deleteSession,
    getActiveSession, startSession, pauseSession, resumeSession, endSession, clearActiveSession,
    getCompletedArticles, markArticleCompleted, unmarkArticleCompleted, isArticleCompleted,
    getSubjectsConfig, filterSessions,
    getStudyMinutesBySubject, getStudyMinutesByDay,
    getSummaryBySubject, getGlobalStats,
    formatTimer, msToHHMM, exportCSV
  };

})(window);
