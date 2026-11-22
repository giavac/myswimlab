/** Basic HTML helpers, with escaping applied to untrusted FIT metadata. */
export const query = selector => document.querySelector(selector);

export function escapeHtml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => replacements[character]);
}

/** Zero-based length index → the record number shown to users, e.g. "017". */
export function recordNumber(index) {
  return String(index + 1).padStart(3, '0');
}

export function tag(text, kind = '') {
  return `<span class="tag ${escapeHtml(kind)}">${escapeHtml(text)}</span>`;
}

export function icon(name, size = 20) {
  const paths = {
    wave: '<path d="M2 9c4-4 6-4 10 0s6 4 10 0M2 15c4-4 6-4 10 0s6 4 10 0"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',
    chart: '<path d="M3 21V9m5 12V4m5 17v-9m5 9V2"/>',
    curve: '<path d="M3 18l6-6 5 2 7-9"/><circle cx="3" cy="18" r="1"/><circle cx="21" cy="5" r="1"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4"/>',
    book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15"/>'
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${paths[name] || ''}</svg>`;
}
