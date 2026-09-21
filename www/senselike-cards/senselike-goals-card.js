// Sense-style "Goals" card — progress bars with a "NOW" time marker and trend projection.
// type: custom:senselike-goals-card
class SenseLikeGoalsCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: 'Goals',
      goals: [
        { section: 'Today', name: 'Usage', icon: 'mdi:power-plug', entity: 'sensor.energy_today', target: 30, period: 'day', unit: 'kWh' },
        { section: 'This month', name: 'Usage', icon: 'mdi:power-plug', entity: 'sensor.energy_month', target: 1500, period: 'month', unit: 'kWh' },
        { name: 'Always On', icon: 'mdi:sync', entity: 'sensor.always_on_month', target: 550, period: 'month', unit: 'kWh' },
      ],
    };
  }

  static getConfigElement() {
    return document.createElement('senselike-goals-card-editor');
  }

  setConfig(config) {
    if (!Array.isArray(config.goals) || !config.goals.length) {
      throw new Error('senselike-goals-card: "goals" array is required');
    }
    this._config = {
      title: 'Goals',
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
    return Math.max(3, Math.ceil(this._config.goals.length * 1.2) + 1);
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
        .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
        .label { font-size: calc(12px * var(--ha-font-size-scale, 1)); font-weight:700; letter-spacing:.08em; color: var(--muted); text-transform:uppercase; }
        .chev {
          width:26px; height:26px; border-radius:50%; border:none; cursor:pointer;
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          color: var(--accent); display:flex; align-items:center; justify-content:center;
        }
        .section-title { font-size: calc(15px * var(--ha-font-size-scale, 1)); font-weight:600; color: var(--primary-text-color); margin: 14px 0 10px; border-bottom: 1px solid var(--divider-color); padding-bottom:6px; }
        .goal { display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; }
        .icon-wrap {
          width:30px; height:30px; border-radius:50%; flex-shrink:0; margin-top:2px;
          background: color-mix(in srgb, var(--accent) 16%, transparent);
          display:flex; align-items:center; justify-content:center; color: var(--accent);
        }
        .goal-body { flex:1; min-width:0; }
        .bar-row { position:relative; height:30px; }
        .now-mark { position:absolute; top:-14px; height:44px; width:1px; background: var(--divider-color, #999); }
        .now-label { position:absolute; top:-28px; font-size: calc(10px * var(--ha-font-size-scale, 1)); font-weight:700; color: var(--secondary-text-color); transform: translateX(-50%); white-space:nowrap; }
        .track { position:absolute; top:6px; left:0; right:0; height:18px; border-radius:9px; background: color-mix(in srgb, var(--muted) 22%, transparent); overflow:hidden; }
        .fill { height:100%; border-radius:9px; background: var(--accent); display:flex; align-items:center; padding-left:10px; box-sizing:border-box; white-space:nowrap; overflow:hidden; }
        .fill span { font-size: calc(12px * var(--ha-font-size-scale, 1)); font-weight:700; color: white; }
        .meta-row { display:flex; justify-content:space-between; margin-top:5px; font-size: calc(12px * var(--ha-font-size-scale, 1)); }
        .meta-left { color: var(--secondary-text-color); }
        .meta-right { color: var(--accent); font-weight:600; }
      </style>
      <ha-card>
        <div class="head">
          <div class="label">${this._esc(this._config.title)}</div>
          <button class="chev" aria-label="more info">
            <svg width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          </button>
        </div>
        <div id="goals"></div>
      </ha-card>
    `;
    this._built = true;
  }

  _periodFraction(period) {
    const now = new Date();
    if (period === 'day') {
      return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
    }
    if (period === 'week') {
      const day = (now.getDay() + 6) % 7; // Mon=0
      return (day * 86400 + now.getHours() * 3600 + now.getMinutes() * 60) / (7 * 86400);
    }
    // month (default)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return (now.getDate() - 1 + now.getHours() / 24) / daysInMonth;
  }

  _render() {
    if (!this._built || !this._hass) return;
    const goalsEl = this.shadowRoot.getElementById('goals');
    let html = '';
    let lastSection = null;

    this._config.goals.forEach((goal) => {
      if (goal.section && goal.section !== lastSection) {
        html += `<div class="section-title">${this._esc(goal.section)}</div>`;
        lastSection = goal.section;
      }
      const st = this._hass.states[goal.entity];
      const current = st ? Number(st.state) : null;
      const target = Number(goal.target);
      const unit = goal.unit || 'kWh';
      const icon = goal.icon || 'mdi:flash';
      const frac = this._periodFraction(goal.period || 'month');
      const fillPct = current != null && target > 0 ? Math.min(100, (current / target) * 100) : 0;
      const trending = current != null && frac > 0.02 ? current / frac : current;

      html += `
        <div class="goal">
          <div class="icon-wrap"><ha-icon icon="${this._esc(icon)}" style="--mdc-icon-size: calc(16px * var(--ha-font-size-scale, 1));"></ha-icon></div>
          <div class="goal-body">
            <div class="bar-row">
              <div class="now-mark" style="left:${(frac * 100).toFixed(2)}%;"></div>
              <div class="now-label" style="left:${(frac * 100).toFixed(2)}%;">NOW</div>
              <div class="track">
                <div class="fill" style="width:${fillPct.toFixed(1)}%;">
                  <span>${current != null ? this._fmt(current) : '–'} of ${this._fmt(target)} ${this._esc(unit)}</span>
                </div>
              </div>
            </div>
            <div class="meta-row">
              <span class="meta-left">${this._esc(goal.name || 'Usage')} &lt; ${this._fmt(target)} ${this._esc(unit)}</span>
              <span class="meta-right">${trending != null ? `trending to ${this._fmt(trending)} ${this._esc(unit)}` : ''}</span>
            </div>
          </div>
        </div>
      `;
    });

    goalsEl.innerHTML = html;
  }

  _fmt(v) {
    if (v == null || Number.isNaN(v)) return '–';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 1 : 0 });
  }
}

class SenseLikeGoalsCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { title: 'Goals', goals: [], ...config };
    if (!this._built) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll('ha-selector').forEach((el) => { el.hass = hass; });
  }

  connectedCallback() {
    if (!this._built) this._render();
  }

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _fireChange() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _createTextField(label, value, onInput, type) {
    const el = document.createElement('ha-selector');
    el.hass = this._hass;
    el.label = label;
    el.selector = type === 'number' ? { number: { mode: 'box' } } : { text: {} };
    el.value = value ?? (type === 'number' ? 0 : '');
    el.style.display = 'block';
    el.addEventListener('value-changed', (ev) => onInput(ev.detail.value));
    return el;
  }

  _createEntitySelector(label, value, onChange) {
    const el = document.createElement('ha-selector');
    el.hass = this._hass;
    el.label = label;
    el.selector = { entity: { filter: [{ domain: 'sensor', device_class: 'energy' }] } };
    el.value = value || '';
    el.style.display = 'block';
    el.addEventListener('value-changed', (ev) => onChange(ev.detail.value));
    return el;
  }

  _createSelect(label, value, options, onChange) {
    const el = document.createElement('ha-selector');
    el.hass = this._hass;
    el.label = label;
    el.selector = { select: { mode: 'dropdown', options } };
    el.value = value || options[0].value;
    el.style.display = 'block';
    el.addEventListener('value-changed', (ev) => onChange(ev.detail.value));
    return el;
  }

  _updateGoal(index, key, value) {
    const goals = this._config.goals.slice();
    goals[index] = { ...goals[index], [key]: value };
    this._config = { ...this._config, goals };
    this._fireChange();
  }

  _renderGoalsList() {
    const container = this.shadowRoot.getElementById('goals');
    container.innerHTML = '';
    this._config.goals.forEach((goal, i) => {
      const row = document.createElement('div');
      row.className = 'goal-row';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove goal';
      removeBtn.addEventListener('click', () => {
        const goals = this._config.goals.slice();
        goals.splice(i, 1);
        this._config = { ...this._config, goals };
        this._fireChange();
        this._renderGoalsList();
      });
      row.appendChild(removeBtn);

      const r1 = document.createElement('div');
      r1.className = 'row';
      r1.appendChild(this._createTextField('Section (optional header)', goal.section, (v) => this._updateGoal(i, 'section', v)));
      r1.appendChild(this._createTextField('Name', goal.name, (v) => this._updateGoal(i, 'name', v)));
      row.appendChild(r1);

      const r2 = document.createElement('div');
      r2.className = 'row';
      r2.appendChild(this._createEntitySelector('Entity (cumulative usage)', goal.entity, (v) => this._updateGoal(i, 'entity', v)));
      row.appendChild(r2);

      const r3 = document.createElement('div');
      r3.className = 'row';
      r3.appendChild(this._createTextField('Target', goal.target, (v) => this._updateGoal(i, 'target', Number(v) || 0), 'number'));
      r3.appendChild(this._createTextField('Unit', goal.unit, (v) => this._updateGoal(i, 'unit', v)));
      row.appendChild(r3);

      const r4 = document.createElement('div');
      r4.className = 'row';
      r4.appendChild(this._createSelect('Period', goal.period || 'month', [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ], (v) => this._updateGoal(i, 'period', v)));
      r4.appendChild(this._createTextField('Icon (mdi:...)', goal.icon, (v) => this._updateGoal(i, 'icon', v)));
      row.appendChild(r4);

      container.appendChild(row);
    });
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    if (!this._config) return;
    this.shadowRoot.innerHTML = `
      <style>
        .wrap { display:flex; flex-direction:column; gap:16px; padding:8px 0; }
        .row { display:flex; gap:8px; margin-bottom:8px; }
        .row > * { flex:1; min-width:0; }
        .goal-row { border:1px solid var(--divider-color); border-radius:8px; padding:16px 12px 4px; position:relative; }
        .remove-btn {
          position:absolute; top:8px; right:8px; cursor:pointer; color: var(--secondary-text-color);
          background:none; border:none; font-size: calc(14px * var(--ha-font-size-scale, 1)); line-height:1;
        }
        .section-label { font-size: calc(14px * var(--ha-font-size-scale, 1)); font-weight:600; color: var(--primary-text-color); margin-top:8px; }
        .add-btn {
          align-self:flex-start; border:1px solid var(--primary-color); color: var(--primary-color);
          background:none; border-radius:6px; padding:8px 14px; cursor:pointer; font-size: calc(14px * var(--ha-font-size-scale, 1));
        }
      </style>
      <div class="wrap">
        <div id="basic"></div>
        <div class="section-label">Goals</div>
        <div id="goals"></div>
        <button class="add-btn" id="add-goal">+ Add goal</button>
      </div>
    `;
    const basic = this.shadowRoot.getElementById('basic');
    basic.appendChild(this._createTextField('Title', this._config.title, (v) => { this._config = { ...this._config, title: v }; this._fireChange(); }));
    basic.appendChild(this._createTextField('Accent color (CSS value)', this._config.accent_color, (v) => { this._config = { ...this._config, accent_color: v }; this._fireChange(); }));
    basic.appendChild(this._createTextField('Muted color (CSS value)', this._config.muted_color, (v) => { this._config = { ...this._config, muted_color: v }; this._fireChange(); }));
    this._renderGoalsList();
    this.shadowRoot.getElementById('add-goal').addEventListener('click', () => {
      const goals = this._config.goals.slice();
      goals.push({ name: 'Usage', icon: 'mdi:flash', entity: '', target: 100, period: 'month', unit: 'kWh' });
      this._config = { ...this._config, goals };
      this._fireChange();
      this._renderGoalsList();
    });
    this._built = true;
  }
}
customElements.define('senselike-goals-card-editor', SenseLikeGoalsCardEditor);

customElements.define('senselike-goals-card', SenseLikeGoalsCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'senselike-goals-card',
  name: 'SenseLike Goals',
  description: 'Usage goal progress bars with a "NOW" time marker and trend projection, Sense-app style.',
});
