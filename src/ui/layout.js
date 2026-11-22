/** Fixed application frame; each navigation action renders into #main. */
import { state } from '../state.js';
import { icon } from './shared.js';

const NAVIGATION = [
  ['overview', 'Overview'],
  ['sessions', 'Sessions'],
  ['trends', 'Trends'],
  ['performance', 'Performance curve'],
  ['settings', 'Data & settings']
];

export function layout() {
  const navigation = NAVIGATION.map(([page, label], index) => `
    <button data-page="${page}" class="navitem ${state.page === page ? 'active' : ''}">
      <span class="navnum">${String(index + 1).padStart(2, '0')}</span>${label}
    </button>`).join('');
  const periods = [
    ['7', '7D'], ['28', '4W'], ['84', '12W'], ['365', '1Y'], ['all', 'All']
  ].map(([period, label]) => `
    <button data-period="${period}" class="${state.period === period ? 'chosen' : ''}">${label}</button>`).join('');

  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo"><div class="mark">${icon('wave', 31)}</div><span>MySwimLab</span></div>
        <div class="nav">${navigation}</div>
        <div class="asidefoot">
          <div class="privacy">● Processing local</div>
          <div class="privacy-sub">No upload · No telemetry</div>
          <p>Select FIT files to load your sessions.</p>
          <button class="asidelink" data-page="settings">Data privacy & backup ↗</button>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <div class="mobilelogo">${icon('wave', 24)} MySwimLab</div>
          <div class="periods">${periods}</div>
          <div class="statusline"><span class="dot">●</span> N=${state.sessions.length} · LOCAL</div>
          <div class="topactions">
            <button class="primary upload" data-upload="true">${icon('upload', 17)} <span>Import FIT files</span></button>
          </div>
        </header>
        <main id="main"></main>
        <footer>MySwimLab v0.1.0 review · Experimental analytics · <a href="https://developer.garmin.com/fit/" target="_blank" rel="noopener">About FIT</a> · <a href="https://github.com/giavac/myswimlab/issues/new" target="_blank" rel="noopener">Report an issue</a></footer>
      </div>
    </div>
    <input id="fileInput" type="file" accept=".fit,application/octet-stream" multiple hidden/>
    <input id="backupInput" type="file" accept="application/json,.json" hidden/>
    <div id="toast" role="status" aria-live="polite"></div>`;
}
