/** Browsable session index, separate from the analysis of an individual swim. */
import { recentTable } from './components.js';

export function sessionsPage(sessions) {
  return `
    <div class="pagehead"><div>
      <h1>All sessions</h1>
      <p>${sessions.length} swimming activity/activities in the selected time period.</p>
    </div></div>
    <section class="panel">
      <div class="panelhead"><div><h2>Swimming history</h2>
        <p>Select a session to inspect lengths, pace, and annotations.</p>
      </div></div>
      ${recentTable(sessions)}
    </section>`;
}
