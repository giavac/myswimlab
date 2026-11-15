/** Small SVG/HTML chart renderers. No charting library or server required. */
import { formatNumber, formatSeconds } from '../analytics/metrics.js';
import { escapeHtml } from './shared.js';

export function lineChart(data, { color = '#2766d6', fill = false, unit = '', label = '' } = {}) {
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
      <line x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}" stroke="#e8eff5"/>
      <text x="${left - 9}" y="${gridY + 4}" text-anchor="end" fill="#7890a7" font-size="11">${caption}</text>`;
  }).join('');

  const labels = data.map((item, index) => {
    if (data.length > 8 && index % Math.ceil(data.length / 6) !== 0) return '';
    return `<text x="${x(index)}" y="${height - 13}" text-anchor="middle" font-size="11" fill="#7d91a8">${escapeHtml(item.label)}</text>`;
  }).join('');

  const area = fill
    ? `<polygon points="${left},${height - bottom} ${points} ${x(data.length - 1)},${height - bottom}" fill="${color}" opacity=".08"/>`
    : '';

  return `
    <svg class="plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label || 'Time series')}" preserveAspectRatio="none">
      ${grid}
      ${area}
      <polyline points="${points}" stroke="${color}" stroke-width="3" fill="none" stroke-linejoin="round"/>
      ${data.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.value)}" r="4" fill="${color}" stroke="white" stroke-width="1.7"/>`).join('')}
      ${labels}
    </svg>`;
}

export function barChart(data) {
  if (!data.length) return '<div class="empty-chart">Upload sessions to see a trend</div>';
  const maximum = Math.max(1, ...data.map(item => item.value));

  return `<div class="bars">${data.map(item => `
    <div class="barcol">
      <div class="bar-track">
        <div class="bar-fill" style="height:${Math.max(3, item.value / maximum * 100)}%" title="${item.value.toFixed(2)} km"></div>
      </div>
      <small>${escapeHtml(item.label)}</small>
    </div>`).join('')}</div>`;
}
