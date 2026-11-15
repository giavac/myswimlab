/** Basic HTML helpers, with escaping applied to untrusted FIT metadata. */
export const query = selector => document.querySelector(selector);

export function escapeHtml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => replacements[character]);
}

export function tag(text, kind = '') {
  return `<span class="tag ${escapeHtml(kind)}">${escapeHtml(text)}</span>`;
}

export const icons = {
  home: '⌂', sessions: '▤', trends: '▥', curve: '⌁', settings: '⚙'
};

export function icon(name, size = 20) {
  const paths = {
    wave: '<path d="M2 9c4-4 6-4 10 0s6 4 10 0M2 15c4-4 6-4 10 0s6 4 10 0"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',
    chart: '<path d="M3 21V9m5 12V4m5 17v-9m5 9V2"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${paths[name] || ''}</svg>`;
}
