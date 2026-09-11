// Sense-style "Usage" trend card — monthly cumulative usage vs. last month.
// type: custom:senselike-usage-trend-card
class SenseLikeUsageTrendCard extends HTMLElement {
  static getStubConfig() {
    return { title: 'Usage', entity: 'sensor.home_energy_cost', unit: '$', decimals: 0 };
  }

  static getConfigElement() {
    return document.createElement('senselike-usage-trend-card-editor');
  }

  setConfig(config) {
    if (!config.entity) throw new Error('senselike-usage-trend-card: "entity" is required');
    this._config = {
      title: 'Usage',
      unit: '$',
      value_prefix: true,
      decimals: 0,
      accent_color: 'var(--primary-color)',
      muted_color: 'var(--secondary-text-color)',
      ...config,
    };
    this._built = false;
    this._loadedKey = null;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) return;
    const key = this._hass.states[this._config.entity]?.last_changed;
    if (key !== this._loadedKey) {
      this._loadedKey = key;
      this._loadData();
    }
  }

  getCardSize() {
    return 4;
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card {
          padding: 16px 18px 18px;
          --accent: ${this._config.accent_color};
          --muted: ${this._config.muted_color};
        }
        .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .label { font-size:12px; font-weight:700; letter-spacing:.08em; color: var(--muted); text-transform:uppercase; }
        .chev {
          width:26px; height:26px; border-radius:50%; border:none; cursor:pointer;
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          color: var(--accent); display:flex; align-items:center; justify-content:center;
        }
        .statement { font-size:19px; font-weight:600; color: var(--primary-text-color); line-height:1.3; margin-bottom:14px; }
        .legend { display:flex; gap:22px; margin-bottom:8px; }
        .legend-item { display:flex; align-items:center; gap:6px; font-size:13px; color: var(--secondary-text-color); }
        .dot { width:9px; height:9px; border-radius:50%; }
        .dot.cur { background: var(--accent); }
        .dot.prev { background: var(--muted); opacity:.7; }
        .amt { font-size:20px; font-weight:700; font-variant-numeric: tabular-nums; }
        .amt.cur { color: var(--accent); }
        .amt.prev { color: var(--primary-text-color); }
        .chart-wrap { margin-top:6px; }
        svg { width:100%; height:130px; display:block; overflow:visible; }
        .axis { display:flex; justify-content:space-between; font-size:12px; color: var(--secondary-text-color); margin-top:4px; }
        .empty { font-size:13px; color: var(--secondary-text-color); padding: 10px 0; }
      </style>
      <ha-card>
        <div class="head">
          <div class="label">${this._esc(this._config.title)}</div>
          <button class="chev" aria-label="more info">
            <svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          </button>
        </div>
        <div class="statement" id="statement">Loading&hellip;</div>
        <div class="legend">
          <div class="legend-item"><span class="dot cur"></span><span id="cur-legend">This Month</span></div>
          <div class="legend-item"><span class="dot prev"></span><span id="prev-legend">Last Month</span></div>
        </div>
        <div class="legend" style="margin-top:-4px;">
          <div class="amt cur" id="cur-amt">&ndash;</div>
          <div class="amt prev" id="prev-amt">&ndash;</div>
        </div>
        <div class="chart-wrap" id="chart-wrap">
          <div class="empty">Waiting for data&hellip;</div>
        </div>
      </ha-card>
    `;
    this.shadowRoot.querySelector('.chev').addEventListener('click', () => this._moreInfo());
    this._built = true;
  }

  _moreInfo() {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: this._config.entity }, bubbles: true, composed: true }));
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _fmt(v) {
    if (v == null || Number.isNaN(v)) return '–';
    const n = Number(v).toLocaleString(undefined, { minimumFractionDigits: this._config.decimals, maximumFractionDigits: this._config.decimals });
    return this._config.value_prefix ? `${this._config.unit}${n}` : `${n}${this._config.unit}`;
  }

  async _loadData() {
    if (!this._hass) return;
    const entity = this._config.entity;
    const now = new Date();
    const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrev = startThis;
    try {
      const res = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: startPrev.toISOString(),
        end_time: now.toISOString(),
        statistic_ids: [entity],
        period: 'day',
      });
      const rows = (res && res[entity]) || [];
      const curRows = rows.filter((r) => new Date(r.start) >= startThis);
      const prevRows = rows.filter((r) => new Date(r.start) >= startPrev && new Date(r.start) < endPrev);
      this._curSeries = this._cumulative(curRows);
      this._prevSeries = this._cumulative(prevRows);
      this._daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      this._monthStart = startThis;
      this._error = rows.length === 0 ? 'no-stats' : null;
    } catch (e) {
      this._error = 'no-stats';
    }
    this._render();
  }

  _cumulative(rows) {
    let sum = 0;
    let prevAbs = null;
    return rows.map((r) => {
      let delta = 0;
      if (r.change != null) delta = r.change;
      else if (r.sum != null) {
        delta = prevAbs == null ? 0 : r.sum - prevAbs;
        prevAbs = r.sum;
      }
      sum += Math.max(delta || 0, 0);
      return sum;
    });
  }

  _render() {
    if (!this._built) return;
    const statementEl = this.shadowRoot.getElementById('statement');
    const curLegend = this.shadowRoot.getElementById('cur-legend');
    const prevLegend = this.shadowRoot.getElementById('prev-legend');
    const curAmtEl = this.shadowRoot.getElementById('cur-amt');
    const prevAmtEl = this.shadowRoot.getElementById('prev-amt');
    const wrap = this.shadowRoot.getElementById('chart-wrap');

    curLegend.textContent = this._config.cur_label || 'This Month';
    prevLegend.textContent = this._config.prev_label || 'Last Month';

    if (this._error || !this._curSeries) {
      statementEl.textContent = this._error === 'no-stats'
        ? 'No statistics available for this entity yet.'
        : 'Loading…';
      wrap.innerHTML = '<div class="empty">No chart data.</div>';
      return;
    }

    const cur = this._curSeries;
    const prev = this._prevSeries;
    const curTotal = cur[cur.length - 1] ?? 0;
    const prevAtSameDay = prev[cur.length - 1] ?? prev[prev.length - 1] ?? null;
    const prevTotal = prev[prev.length - 1] ?? 0;

    curAmtEl.textContent = this._fmt(curTotal);
    prevAmtEl.textContent = this._fmt(prevTotal);

    let pct = null;
    if (prevAtSameDay != null && prevAtSameDay > 0) {
      pct = Math.round(((curTotal - prevAtSameDay) / prevAtSameDay) * 100);
    }
    if (pct == null) {
      statementEl.textContent = `You've used ${this._fmt(curTotal)} so far this month.`;
    } else {
      const dir = pct >= 0 ? 'more' : 'less';
      statementEl.textContent = `You're using ${Math.abs(pct)}% ${dir} energy so far this month.`;
    }

    wrap.innerHTML = this._buildSvg(cur, prev);
  }

  _buildSvg(cur, prev) {
    const W = 300, H = 110, pad = 4;
    const days = this._daysInMonth || Math.max(cur.length, prev.length, 1);
    const maxVal = Math.max(1, ...cur, ...prev) * 1.12;
    const xFor = (i) => pad + (i / Math.max(days - 1, 1)) * (W - pad * 2);
    const yFor = (v) => H - pad - (v / maxVal) * (H - pad * 2);

    const path = (series) => series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');

    const prevPath = prev.length ? path(prev) : '';
    const curPath = cur.length ? path(cur) : '';
    const todayIdx = cur.length - 1;
    const todayX = xFor(todayIdx);
    const curDotY = cur.length ? yFor(cur[cur.length - 1]) : null;
    const prevAtToday = prev[todayIdx];
    const prevDotY = prevAtToday != null ? yFor(prevAtToday) : null;

    const startLabel = this._monthStart
      ? this._monthStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const endDate = this._monthStart ? new Date(this._monthStart.getFullYear(), this._monthStart.getMonth() + 1, 0) : null;
    const endLabel = endDate ? endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

    return `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="${todayX}" y1="0" x2="${todayX}" y2="${H - pad}" stroke="var(--divider-color, #ccc)" stroke-width="1" />
        ${prevPath ? `<path d="${prevPath}" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>` : ''}
        ${curPath ? `<path d="${curPath}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        <line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="var(--divider-color, #ccc)" stroke-width="1" />
        ${prevDotY != null ? `<circle cx="${todayX}" cy="${prevDotY}" r="5" fill="var(--muted)"/>` : ''}
        ${curDotY != null ? `<circle cx="${todayX}" cy="${curDotY}" r="6" fill="var(--accent)"/>` : ''}
      </svg>
      <div class="axis"><span>${this._esc(startLabel)}</span><span>${this._esc(endLabel)}</span></div>
    `;
  }
}

const SENSELIKE_USAGE_TREND_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  {
    name: 'entity',
    selector: {
      entity: {
        filter: [
          { domain: 'sensor', device_class: 'energy' },
          { domain: 'sensor', device_class: 'monetary' },
          { domain: 'sensor', device_class: 'power' },
        ],
      },
    },
  },
  { name: 'unit', selector: { text: {} } },
  { name: 'value_prefix', selector: { boolean: {} } },
  { name: 'decimals', selector: { number: { mode: 'box', min: 0, max: 4 } } },
  { name: 'cur_label', selector: { text: {} } },
  { name: 'prev_label', selector: { text: {} } },
  { name: 'accent_color', selector: { text: {} } },
  { name: 'muted_color', selector: { text: {} } },
];
const SENSELIKE_USAGE_TREND_LABELS = {
  title: 'Title',
  entity: 'Entity (needs long-term statistics)',
  unit: 'Unit',
  value_prefix: 'Unit before value ($10 vs 10kWh)',
  decimals: 'Decimals',
  cur_label: 'Current period label',
  prev_label: 'Previous period label',
  accent_color: 'Accent color (CSS value)',
  muted_color: 'Muted color (CSS value)',
};

class SenseLikeUsageTrendCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    if (!this._config) return;
    if (!this._form) {
      const form = document.createElement('ha-form');
      form.computeLabel = (s) => SENSELIKE_USAGE_TREND_LABELS[s.name] || s.name;
      form.addEventListener('value-changed', (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this._form = form;
      this.shadowRoot.appendChild(form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = SENSELIKE_USAGE_TREND_SCHEMA;
  }
}
customElements.define('senselike-usage-trend-card-editor', SenseLikeUsageTrendCardEditor);

customElements.define('senselike-usage-trend-card', SenseLikeUsageTrendCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'senselike-usage-trend-card',
  name: 'SenseLike Usage Trend',
  description: 'Monthly cumulative usage/cost vs. last month, Sense-app style.',
});
