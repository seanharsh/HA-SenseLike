// Sense-style live "Meter" card — power over time with MIN/HR/DAY/WK/MO range tabs.
// type: custom:senselike-power-meter-card
const RANGES = {
  min: { label: 'MIN', mode: 'raw', ms: 60 * 60 * 1000 },
  hr: { label: 'HR', mode: 'raw', ms: 24 * 60 * 60 * 1000 },
  day: { label: 'DAY', mode: 'stats', period: 'hour', ms: 30 * 24 * 60 * 60 * 1000 },
  wk: { label: 'WK', mode: 'stats', period: 'week', ms: 26 * 7 * 24 * 60 * 60 * 1000 },
  mo: { label: 'MO', mode: 'stats', period: 'month', ms: 366 * 24 * 60 * 60 * 1000 },
};

class SenseLikePowerMeterCard extends HTMLElement {
  static getStubConfig() {
    return { title: 'Meter', entity: 'sensor.house_power', price_per_kwh: 0.14 };
  }

  static getConfigElement() {
    return document.createElement('senselike-power-meter-card-editor');
  }

  setConfig(config) {
    if (!config.entity) throw new Error('senselike-power-meter-card: "entity" is required');
    this._config = {
      title: 'Meter',
      price_per_kwh: 0.14,
      accent_color: 'var(--primary-color)',
      muted_color: 'var(--secondary-text-color)',
      ...config,
    };
    this._range = 'min';
    this._build();
    this._loadData();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._renderHeader();
    if (first) this._loadData();
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
          padding: 14px 18px 12px;
          --accent: ${this._config.accent_color};
          --muted: ${this._config.muted_color};
        }
        .head { display:flex; align-items:baseline; justify-content:flex-end; gap:6px; margin-bottom:6px; }
        .watts { font-size:26px; font-weight:800; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
        .cost { font-size:13px; color: var(--secondary-text-color); }
        .chart-wrap { position:relative; }
        svg { width:100%; height:190px; display:block; overflow:visible; }
        .empty { font-size:13px; color: var(--secondary-text-color); padding: 40px 0; text-align:center; }
        .date-row { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
        .date { font-size:12px; color: var(--secondary-text-color); }
        .tabs { display:flex; gap:4px; }
        .tab {
          border:none; background:transparent; font-size:12px; font-weight:700; letter-spacing:.03em;
          color: var(--secondary-text-color); padding:4px 8px; border-radius:6px; cursor:pointer;
        }
        .tab.active { color: var(--accent); border-bottom:2px solid var(--accent); }
        .badge { position:absolute; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; color:white; white-space:nowrap; transform:translate(-50%,-100%); }
        .badge.pos { background: var(--accent); }
        .badge.neg { background: var(--muted); }
      </style>
      <ha-card>
        <div class="head">
          <ha-icon icon="mdi:power-plug" style="color:var(--accent); --mdc-icon-size:18px;"></ha-icon>
          <span class="watts" id="watts">–</span>
          <span class="cost" id="cost"></span>
        </div>
        <div class="chart-wrap" id="chart-wrap"><div class="empty">Loading&hellip;</div></div>
        <div class="date-row">
          <span class="date" id="date"></span>
          <div class="tabs" id="tabs">
            ${Object.entries(RANGES).map(([k, r]) => `<button class="tab${k === 'min' ? ' active' : ''}" data-range="${k}">${r.label}</button>`).join('')}
          </div>
        </div>
      </ha-card>
    `;
    this.shadowRoot.getElementById('tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      this._range = btn.dataset.range;
      this.shadowRoot.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
      this._loadData();
    });
    this._built = true;
  }

  _renderHeader() {
    if (!this._built || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const wattsEl = this.shadowRoot.getElementById('watts');
    const costEl = this.shadowRoot.getElementById('cost');
    if (!st || st.state === 'unavailable' || st.state === 'unknown') {
      wattsEl.textContent = '–';
      costEl.textContent = '';
      return;
    }
    const w = Number(st.state);
    wattsEl.textContent = `${Math.round(w).toLocaleString()}W`;
    let price = this._config.price_per_kwh;
    if (this._config.price_entity && this._hass.states[this._config.price_entity]) {
      const p = Number(this._hass.states[this._config.price_entity].state);
      if (!Number.isNaN(p)) price = p;
    }
    const perHr = (w / 1000) * price;
    // Sub-dollar rates read better as cents (e.g. "72¢/hr"); once the hourly
    // cost crosses $1 that flips to an unwieldy 3+ digit cents figure, so
    // switch to dollars-and-cents ("$1.24/hr") instead. Branch on the
    // already-rounded cents value so a rate like $0.996/hr (which rounds to
    // 100¢) doesn't display as "100¢/hr" instead of "$1.00/hr".
    const cents = Math.round(perHr * 100);
    costEl.textContent = cents >= 100 ? `$${(cents / 100).toFixed(2)}/hr` : `${cents}¢/hr`;
  }

  async _loadData() {
    if (!this._hass) return;
    const rangeDef = RANGES[this._range];
    const end = new Date();
    const start = new Date(end.getTime() - rangeDef.ms);
    let series = [];
    try {
      if (rangeDef.mode === 'raw') {
        const path = `history/period/${start.toISOString()}?filter_entity_id=${this._config.entity}&minimal_response=true&no_attributes=true&end_time=${end.toISOString()}`;
        const res = await this._hass.callApi('GET', path);
        const rows = (res && res[0]) || [];
        series = rows
          .map((r) => ({ t: new Date(r.last_changed), v: Number(r.state) }))
          .filter((p) => !Number.isNaN(p.v));
      } else {
        const res = await this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          statistic_ids: [this._config.entity],
          period: rangeDef.period,
        });
        const rows = (res && res[this._config.entity]) || [];
        series = rows.map((r) => ({ t: new Date(r.start), v: r.mean != null ? r.mean : r.state }));
      }
    } catch (e) {
      series = [];
    }
    this._series = series;
    this._rangeStart = start;
    this._rangeEnd = end;
    this._renderChart();
    this._renderDate();
  }

  _renderDate() {
    const dateEl = this.shadowRoot.getElementById('date');
    if (!this._rangeEnd) return;
    dateEl.textContent = this._rangeEnd.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  _renderChart() {
    const wrap = this.shadowRoot.getElementById('chart-wrap');
    const series = this._series || [];
    if (series.length < 2) {
      wrap.innerHTML = '<div class="empty">No data for this range.</div>';
      return;
    }
    const W = 320, H = 180, pad = 2;
    const vals = series.map((p) => p.v);
    const maxVal = Math.max(...vals) * 1.15 || 1;
    const t0 = this._rangeStart.getTime();
    const t1 = this._rangeEnd.getTime();
    const xFor = (t) => pad + ((t - t0) / (t1 - t0)) * (W - pad * 2);
    const yFor = (v) => H - pad - (Math.max(0, v) / maxVal) * (H - pad * 2);

    const linePts = series.map((p) => `${xFor(p.t.getTime()).toFixed(1)},${yFor(p.v).toFixed(1)}`);
    const linePath = `M${linePts.join(' L')}`;
    const areaPath = `M${xFor(series[0].t.getTime()).toFixed(1)},${H - pad} L${linePts.join(' L')} L${xFor(series[series.length - 1].t.getTime()).toFixed(1)},${H - pad} Z`;

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    let maxIdx = 0, minIdx = 0;
    series.forEach((p, i) => {
      if (p.v > series[maxIdx].v) maxIdx = i;
      if (p.v < series[minIdx].v) minIdx = i;
    });
    const badges = [];
    if (series[maxIdx].v > mean) {
      badges.push({ x: xFor(series[maxIdx].t.getTime()), y: yFor(series[maxIdx].v), cls: 'pos', text: `+${Math.round(series[maxIdx].v - mean)}W` });
    }
    if (series[minIdx].v < mean) {
      badges.push({ x: xFor(series[minIdx].t.getTime()), y: yFor(series[minIdx].v), cls: 'neg', text: `${Math.round(series[minIdx].v - mean)}W` });
    }

    const gradId = `grad-${Math.random().toString(36).slice(2, 8)}`;
    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.03"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
        <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="${(W - pad).toFixed(1)}" y1="0" x2="${(W - pad).toFixed(1)}" y2="${H - pad}" stroke="var(--accent)" stroke-width="1" opacity="0.5"/>
        <line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="var(--divider-color, #ccc)" stroke-width="1"/>
      </svg>
      ${badges.map((b) => `<div class="badge ${b.cls}" style="left:${((b.x / W) * 100).toFixed(1)}%; top:${((b.y / H) * 100).toFixed(1)}%;">${b.text}</div>`).join('')}
    `;
  }
}

const SENSELIKE_METER_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'power' }] } } },
  { name: 'price_per_kwh', selector: { number: { mode: 'box', step: 0.01, min: 0 } } },
  { name: 'price_entity', selector: { entity: { filter: [{ domain: 'sensor' }] } } },
  { name: 'accent_color', selector: { text: {} } },
  { name: 'muted_color', selector: { text: {} } },
];
const SENSELIKE_METER_LABELS = {
  title: 'Title',
  entity: 'Entity (instantaneous power, W)',
  price_per_kwh: 'Price per kWh',
  price_entity: 'Price entity (optional, overrides fixed price)',
  accent_color: 'Accent color (CSS value)',
  muted_color: 'Muted color (CSS value)',
};

class SenseLikePowerMeterCardEditor extends HTMLElement {
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
      form.computeLabel = (s) => SENSELIKE_METER_LABELS[s.name] || s.name;
      form.addEventListener('value-changed', (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this._form = form;
      this.shadowRoot.appendChild(form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = SENSELIKE_METER_SCHEMA;
  }
}
customElements.define('senselike-power-meter-card-editor', SenseLikePowerMeterCardEditor);

customElements.define('senselike-power-meter-card', SenseLikePowerMeterCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'senselike-power-meter-card',
  name: 'SenseLike Power Meter',
  description: 'Live power over time with MIN/HR/DAY/WK/MO range tabs, Sense-app style.',
});
