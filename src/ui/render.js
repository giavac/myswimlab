/** UI rendering and small browser utilities. No FIT parsing in this module. */
import { state, visibleSessions } from '../state.js';
import { query } from './shared.js';
import { layout } from './layout.js';
import { overview } from './overview.js';
import { sessionPage } from './session-detail.js';
import { sessionsPage } from './sessions-list.js';
import { performancePage, trendsPage, settingsPage, trainingGuidePage } from './other-pages.js';

export function render() {
  const previousFocus = document.activeElement;
  const focusKey = ['page', 'period'].find(key => previousFocus?.dataset?.[key]);
  const focusValue = focusKey ? previousFocus.dataset[focusKey] : null;
  const list = visibleSessions();
  query('#app').innerHTML = layout();

  const pages = {
    overview: () => overview(list),
    sessions: () => sessionsPage(list),
    'session-detail': () => sessionPage(),
    performance: () => performancePage(list),
    trends: () => trendsPage(list, state.weeklyGoal, state.referencePaces),
    settings: () => settingsPage(),
    guide: () => trainingGuidePage()
  };

  query('#main').innerHTML = (pages[state.page] || pages.overview)();
  document.title = `${state.page[0].toUpperCase() + state.page.slice(1).replace('-', ' ')} · MySwimLab`;
  if (focusKey && focusValue) {
    const replacement = [...document.querySelectorAll(`[data-${focusKey}]`)]
      .find(item => item.dataset[focusKey] === focusValue);
    replacement?.focus({ preventScroll: true });
  }
}

let toastTimer = null;

export function toast(message) {
  const element = query('#toast');
  if (!element) return;
  if (toastTimer !== null) clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.add('shown');
  toastTimer = setTimeout(() => {
    element.classList.remove('shown');
    toastTimer = null;
  }, 4200);
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
