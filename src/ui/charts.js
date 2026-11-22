/** Small SVG/HTML chart renderers. No charting library or server required. */
import { formatNumber, formatSeconds } from '../analytics/metrics.js';
import { escapeHtml } from './shared.js';

/**
 * Colors come from CSS custom properties so the theme controls them.
 * `band` shades data indexes `from`..`to` (inclusive) with an optional label.
 */
export function lineChart(data, { color = 'var(--accent)', fill = false, unit = '', label = '', band = null } = {}) {
  if (!data.length) return '<div class="empty-chart">Upload sessions to see a trend</div>';

  const values = data.map(item => item.value).filter(Number.isFinite);
  if (!values.length) return '<div class="empty-chart">No comparable data yet</div>';

  const width = 640;
  const height = 220;
  const left = 52;
  const right = 18;
  const top = 18;
  const bottom = 40;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const margin = Math.max((maximum - minimum) * 0.24, 0.5);
  const lower = minimum - margin;
  const upper = maximum + margin;

  const x = index => left + index * (width - left - right) / Math.max(1, data.length - 1);
  const y = value => top + (upper - value) * (height - top - bottom) / (upper - lower);
  const points = data.map((item, index) => `${x(index)},${y(item.value)}`).join(' ');

  const grid = [0, 1, 2, 3, 4].map(index => {
    const gridY = top + index * (height - top - bottom) / 4;
    const value = upper - index * (upper - lower) / 4;
    const caption = unit === 'pace' ? formatSeconds(value) : formatNumber(value, 1);
    return `
      <line class="chart-grid" x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}"/>
      <text class="chart-text" x="${left - 9}" y="${gridY + 4}" text-anchor="end" font-size="11">${caption}</text>`;
  }).join('');

  const labels = data.map((item, index) => {
    if (data.length > 8 && index % Math.ceil(data.length / 6) !== 0) return '';
    return `<text class="chart-text" x="${x(index)}" y="${height - 13}" text-anchor="middle" font-size="11">${escapeHtml(item.label)}</text>`;
  }).join('');

  const area = fill
    ? `<polygon points="${left},${height - bottom} ${points} ${x(data.length - 1)},${height - bottom}" style="fill:${color}" opacity=".08"/>`
    : '';

  // Half a step on each side, so a one-point band still has a width.
  const step = (width - left - right) / Math.max(1, data.length - 1);
  const shade = band ? `
      <rect class="chart-band" x="${Math.max(left, x(band.from) - step / 2)}" y="${top}"
        width="${Math.min(width - right, x(band.to) + step / 2) - Math.max(left, x(band.from) - step / 2)}" height="${height - top - bottom}"/>
      ${band.label ? `<text class="chart-band-text" x="${(x(band.from) + x(band.to)) / 2}" y="${top + 14}" text-anchor="middle" font-size="11">${escapeHtml(band.label)}</text>` : ''}` : '';

  return `
    <svg class="plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label || 'Time series')}" preserveAspectRatio="none">
      ${grid}
      ${shade}
      ${area}
      <polyline points="${points}" style="stroke:${color}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
      ${data.map((item, index) => `<rect class="chart-point" x="${x(index) - 3.5}" y="${y(item.value) - 3.5}" width="7" height="7" style="stroke:${color}"/>`).join('')}
      <line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>
      ${labels}
    </svg>`;
}

export function barChart(data) {
  if (!data.length) return '<div class="empty-chart">Upload sessions to see a trend</div>';
  const maximum = Math.max(1, ...data.map(item => item.value));

  return `<div class="bars">${data.map(item => `
    <div class="barcol">
      <div class="bar-track">
        <div class="bar-fill" style="height:${item.value > 0 ? Math.max(3, item.value / maximum * 100) : 0}%" title="${item.value.toFixed(2)} km"></div>
      </div>
      <small>${escapeHtml(item.label)}</small>
    </div>`).join('')}</div>`;
}
