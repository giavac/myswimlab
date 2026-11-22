/** The in-memory state is the only source of data displayed by the dashboard. */
export const state = {
  sessions: [],
  page: 'overview',
  selectedSessionId: null,
  period: 'all',
  weeklyGoal: null,
  referencePaces: { m: null, yd: null },
  drafts: new Map()
};

export function sortedSessions() {
  return [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
}

export function selectedSession() {
  const sessions = sortedSessions();
  return sessions.find(session => session.id === state.selectedSessionId) ?? sessions[0] ?? null;
}

/** Time windows are relative to the latest imported workout, not today's date. */
export function visibleSessions() {
  const sessions = sortedSessions();
  if (state.period === 'all' || sessions.length === 0) return sessions;

  const lastDate = new Date(sessions[0].date).getTime();
  const intervalMs = Number(state.period) * 86400000;
  return sessions.filter(session => lastDate - new Date(session.date).getTime() < intervalMs);
}

export function replaceSessions(sessions) {
  state.sessions = sessions;
  state.selectedSessionId = null;
  state.page = 'overview';
  state.period = 'all';
}
