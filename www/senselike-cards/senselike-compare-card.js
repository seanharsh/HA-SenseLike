// Sense-style "Compare" card — where you sit vs. low/mid/high usage buckets.
// type: custom:senselike-compare-card
class SenseLikeCompareCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: 'Compare',
      entity: 'sensor.average_power',
      unit: 'W',
      low_threshold: 990,
      high_threshold: 2000,
      sample_size: 60,
      sample_label: 'neighboring homes',
      days: 30,
    };
  }

  static getConfigElement() {
    return document.createElement('senselike-compare-card-editor');
  }

  setConfig(config) {
    if (!config.entity) throw new Error('senselike-compare-card: "entity" is required');
    this._config = {
      title: 'Compare',
      unit: 'W',
      low_threshold: 990,
      high_threshold: 2000,
      sample_size: 60,
      sample_label: 'neighboring homes',
      days: 30,
      accent_color: 'var(--primary-color)',
      muted_color: 'var(--secondary-text-color)',
      ...config,
    };
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
        .statement { font-size:19px; font-weight:600; color: var(--primary-text-color); line-height:1.3; margin-bottom:18px; }
        .you { text-align:right; font-weight:800; font-size:16px; font-variant-numeric: tabular-nums; margin-bottom:4px; }
        .you .sub { display:block; font-size:11px; font-weight:600; letter-spacing:.05em; color: var(--secondary-text-color); }
        .bars { display:flex; gap:6px; align-items:flex-end; height:34px; }
        .bar { flex:1; height:100%; border-radius:17px; background: color-mix(in srgb, var(--muted) 30%, transparent); }
        .bar.active { background: var(--accent); }
        .bucket-labels { display:flex; gap:6px; margin-top:6px; }
        .bucket-labels span { flex:1; text-align:center; font-size:12px; color: var(--secondary-text-color); }
        .footnote { margin-top:14px; font-size:12.5px; color: var(--secondary-text-color); line-height:1.4; }
      </style>
      <ha-card>
        <div class="head">
          <div class="label">${this._esc(this._config.title)}</div>
          <button class="chev" aria-label="more info">
            <svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          </button>
        </div>
        <div class="statement" id="statement">Loading&hellip;</div>
        <div class="you" id="you-wrap" style="display:none;">
          <span id="you-val">–</span>
          <span class="sub">YOU</span>
        </div>
        <div class="bars">
          <div class="bar" id="bar-low"></div>
          <div class="bar" id="bar-mid"></div>
          <div class="bar" id="bar-high"></div>
        </div>
        <div class="bucket-labels">
          <span>&lt; ${this._config.low_threshold}</span>
          <span>${this._config.low_threshold} - ${this._config.high_threshold}${this._config.unit}</span>
          <span>&gt; ${this._config.high_threshold}</span>
        </div>
        <div class="footnote" id="footnote"></div>
      </ha-card>
    `;
    this.shadowRoot.querySelector('.chev').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: this._config.entity }, bubbles: true, composed: true }));
    });
    this._built = true;
  }

  _render() {
    if (!this._built || !this._hass) return;
    const st = this._hass.states[this._config.entity];
    const statementEl = this.shadowRoot.getElementById('statement');
    const footnote = this.shadowRoot.getElementById('footnote');
    const youWrap = this.shadowRoot.getElementById('you-wrap');
    const youVal = this.shadowRoot.getElementById('you-val');
    const bars = {
      low: this.shadowRoot.getElementById('bar-low'),
      mid: this.shadowRoot.getElementById('bar-mid'),
      high: this.shadowRoot.getElementById('bar-high'),
    };

    if (!st || st.state === 'unavailable' || st.state === 'unknown') {
      statementEl.textContent = 'No comparison data available.';
      footnote.textContent = '';
      youWrap.style.display = 'none';
      Object.values(bars).forEach((b) => b.classList.remove('active'));
      return;
    }

    const value = Number(st.state);
    const { low_threshold: lo, high_threshold: hi, unit } = this._config;
    let bucket = 'mid';
    if (value < lo) bucket = 'low';
    else if (value > hi) bucket = 'high';
    Object.entries(bars).forEach(([k, el]) => el.classList.toggle('active', k === bucket));

    youWrap.style.display = 'block';
    youVal.textContent = `${Math.round(value).toLocaleString()}${unit}`;

    let percentileText = '';
    const pctEntity = this._config.percentile_entity;
    if (pctEntity && this._hass.states[pctEntity]) {
      const pct = Number(this._hass.states[pctEntity].state);
      if (!Number.isNaN(pct)) {
        percentileText = `Your average use is higher than ${Math.round(pct)}% of ${this._config.sample_label}.`;
      }
    }
    if (!percentileText) {
      const words = { low: 'lower than most', mid: 'about average compared to', high: 'higher than most' };
      percentileText = `Your average use is ${words[bucket]} ${this._config.sample_label}.`;
    }
    statementEl.textContent = percentileText;

    footnote.textContent = `Compared to ${this._config.sample_size} ${this._config.sample_label} over the last ${this._config.days} days.`;
  }
}

const SENSELIKE_COMPARE_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'power' }] } } },
  { name: 'unit', selector: { text: {} } },
  { name: 'low_threshold', selector: { number: { mode: 'box' } } },
  { name: 'high_threshold', selector: { number: { mode: 'box' } } },
  { name: 'sample_size', selector: { number: { mode: 'box', min: 0 } } },
  { name: 'sample_label', selector: { text: {} } },
  { name: 'days', selector: { number: { mode: 'box', min: 1 } } },
  { name: 'percentile_entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'accent_color', selector: { text: {} } },
  { name: 'muted_color', selector: { text: {} } },
];
const SENSELIKE_COMPARE_LABELS = {
  title: 'Title',
  entity: 'Entity (average power)',
  unit: 'Unit',
  low_threshold: 'Low threshold',
  high_threshold: 'High threshold',
  sample_size: 'Sample size',
  sample_label: 'Sample label',
  days: 'Days compared',
  percentile_entity: 'Percentile entity (optional)',
  accent_color: 'Accent color (CSS value)',
  muted_color: 'Muted color (CSS value)',
};

class SenseLikeCompareCardEditor extends HTMLElement {
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
      form.computeLabel = (s) => SENSELIKE_COMPARE_LABELS[s.name] || s.name;
      form.addEventListener('value-changed', (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this._form = form;
      this.shadowRoot.appendChild(form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = SENSELIKE_COMPARE_SCHEMA;
  }
}
customElements.define('senselike-compare-card-editor', SenseLikeCompareCardEditor);

customElements.define('senselike-compare-card', SenseLikeCompareCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'senselike-compare-card',
  name: 'SenseLike Compare',
  description: 'Compare your average usage to a low/mid/high bucket, Sense-app style.',
});
