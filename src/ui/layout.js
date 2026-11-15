/** Fixed application frame; each navigation action renders into #main. */
import { state } from '../state.js';
import { escapeHtml, icon, icons } from './shared.js';

const NAVIGATION = [
  ['overview', 'Overview', 'home'],
  ['sessions', 'Sessions', 'sessions'],
  ['trends', 'Trends', 'trends'],
  ['performance', 'Performance curve', 'curve'],
  ['settings', 'Data & settings', 'settings']
];

function folderStatus() {
  if (state.sourceMode === 'manual') {
    return `${state.sessions.length} manually imported FIT file(s)`;
  }
  switch (state.folderStatus) {
    case 'permission': return `Reconnect: ${state.folderName}`;
    case 'scanning': return `Scanning: ${state.folderName}`;
    case 'ready':
    case 'temporary': return `Folder: ${state.folderName}`;
    case 'error': return `Folder unavailable: ${state.folderName}`;
    default: return 'No FIT folder selected';
  }
}

export function layout() {
  const status = escapeHtml(folderStatus());
  const navigation = NAVIGATION.map(([page, label, symbol]) => `
    <button data-page="${page}" class="navitem ${state.page === page ? 'active' : ''}">
      <span class="navicon">${icons[symbol]}</span>${label}
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
          <div class="privacy">◉ &nbsp; Local-first beta</div>
          <p>No synthetic training history. The selected FIT folder or manual import determines the displayed sessions.</p>
          <button class="asidelink" data-page="settings">Data privacy & backup ↗</button>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <div class="mobilelogo">${icon('wave', 24)} MySwimLab</div>
          <div class="periods">${periods}</div>
          <div class="topactions">
            <span class="folder-source" title="${status}">${status}</span>
            <button class="secondary" data-folder-select="true">${state.folderName ? 'Change folder' : 'Choose FIT folder'}</button>
            ${state.folderHandle ? `<button class="secondary" data-folder-refresh="true">${state.folderStatus === 'permission' ? 'Reconnect' : 'Refresh'}</button>` : ''}
            <button class="primary upload" data-upload="true">${icon('upload', 17)} <span>Import FIT</span></button>
          </div>
        </header>
        <main id="main"></main>
        <footer>MySwimLab v0.1.0 review · Experimental analytics · <a href="https://developer.garmin.com/fit/" target="_blank" rel="noopener">About FIT</a> · <a href="https://github.com/giavac/myswimlab/issues/new" target="_blank" rel="noopener">Report an issue</a></footer>
      </div>
    </div>
    <input id="fileInput" type="file" accept=".fit,application/octet-stream" multiple hidden/>
    <input id="folderInput" type="file" webkitdirectory multiple hidden/>
    <input id="backupInput" type="file" accept="application/json,.json" hidden/>
    <div id="toast" role="status" aria-live="polite"></div>`;
}
