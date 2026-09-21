// Sense-style "Today" event timeline — real device on/off events sourced from
// binary_sensor/switch siblings (via the HA device registry) or synthesized from
// power-sensor history when no on/off entity exists.
// type: custom:senselike-timeline-card

// Expands the hand-picked `config.devices` list with every power sensor
// whose entity (or owning device) sits in one of `config.areas` or carries
// one of `config.labels` — so a whole room, or every device tagged e.g.
// "always-on", can be added in one shot instead of listing entities one by
// one. An entity's own area/labels win; when it has none it inherits its
// device's, matching how HA's own area/label pages resolve membership.
function resolveDeviceList(hass, config) {
  const explicit = config.devices || [];
  const areas = config.areas || [];
  const labels = config.labels || [];
  if (!areas.length && !labels.length) return explicit;

  const entities = hass.entities || {};
  const devices = hass.devices || {};
  const seen = new Set(explicit.map((d) => d.entity));
  const extra = [];

  Object.keys(entities).forEach((entityId) => {
    if (seen.has(entityId) || !entityId.startsWith('sensor.')) return;
    const st = hass.states[entityId];
    if (!st || st.attributes.device_class !== 'power') return;

    const reg = entities[entityId];
    const dev = reg.device_id ? devices[reg.device_id] : null;
    const areaId = reg.area_id || (dev && dev.area_id);
    const entityLabels = reg.labels || [];
    const deviceLabels = (dev && dev.labels) || [];

    const areaMatch = areaId && areas.includes(areaId);
    const labelMatch = labels.some((l) => entityLabels.includes(l) || deviceLabels.includes(l));
    if (!areaMatch && !labelMatch) return;

    seen.add(entityId);
    extra.push({ entity: entityId, name: st.attributes.friendly_name || entityId });
  });

  return explicit.concat(extra);
}

class SenseLikeTimelineCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: 'Today',
      max_events: 12,
      devices: [
        { entity: 'sensor.fridge_power', name: 'Fridge' },
        { entity: 'sensor.server_rack_power', name: 'Server Rack' },
        { entity: 'sensor.always_on_power', name: 'Always On' },
      ],
    };
  }

  static getConfigElement() {
    return document.createElement('senselike-timeline-card-editor');
  }

  setConfig(config) {
    const hasDevices = Array.isArray(config.devices) && config.devices.length;
    const hasAreas = Array.isArray(config.areas) && config.areas.length;
    const hasLabels = Array.isArray(config.labels) && config.labels.length;
    if (!hasDevices && !hasAreas && !hasLabels) {
      throw new Error('senselike-timeline-card: at least one of "devices", "areas", or "labels" is required');
    }
    this._config = {
      title: 'Today',
      max_events: 12,
      devices: [],
      accent_color: 'var(--primary-color)',
      muted_color: 'var(--secondary-text-color)',
      ...config,
    };
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._loadTimeline();
    }
  }

  getCardSize() {
    return 4;
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding: 16px 18px 18px; --accent: ${this._config.accent_color}; --muted: ${this._config.muted_color}; }
        .timeline-label { font-size: calc(12px * var(--ha-font-size-scale, 1)); font-weight:700; letter-spacing:.08em; color: var(--muted); text-transform:uppercase; margin-bottom:12px; }
        .empty { font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); padding: 30px 0; text-align:center; }
        .tl-item { display:flex; align-items:center; gap:10px; margin-bottom:8px; animation: senselike-fade-in .4s ease both; }
        @keyframes senselike-fade-in {
          from { opacity:0; transform: translateY(6px); }
          to { opacity:1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tl-item { animation:none !important; }
        }
        .tl-time { width:52px; flex-shrink:0; font-size: calc(11px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); text-align:right; }
        .tl-row {
          flex:1; display:flex; align-items:center; gap:10px; background: var(--secondary-background-color, rgba(127,127,127,.08));
          border-radius:10px; padding:8px 12px;
        }
        .tl-icon { width:26px; height:26px; border-radius:50%; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .tl-text { font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--primary-text-color); }
      </style>
      <ha-card>
        <div class="timeline-label">${this._esc(this._config.title)}</div>
        <div id="timeline-items"><div class="empty">Loading events&hellip;</div></div>
      </ha-card>
    `;
    this._built = true;
    if (!this._refreshTimer) {
      this._refreshTimer = setInterval(() => this._loadTimeline(), 30000);
    }
  }

  disconnectedCallback() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // Finds a companion on/off entity for a power/energy sensor via the HA device
  // registry — a binary_sensor (Sense-style) or switch (smart-plug-style) living
  // on the same device. HA's logbook only records discrete state changes, so a
  // continuous power sensor by itself never produces events; its sibling on/off
  // entity does.
  _resolveEventEntity(powerEntity) {
    const entities = this._hass.entities;
    const devices = this._hass.devices;
    if (!entities || !devices) return null;
    const reg = entities[powerEntity];
    if (!reg || !reg.device_id) return null;
    const siblings = Object.values(entities).filter((e) => e.device_id === reg.device_id);
    const binarySensor = siblings.find((e) => e.entity_id.startsWith('binary_sensor.'));
    if (binarySensor) return binarySensor.entity_id;
    const sw = siblings.find((e) => e.entity_id.startsWith('switch.'));
    if (sw) return sw.entity_id;
    return null;
  }

  async _loadTimeline() {
    if (!this._built || !this._hass) return;
    const container = this.shadowRoot.getElementById('timeline-items');
    if (!container) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();

    const explicitIds = this._config.timeline_entities && this._config.timeline_entities.length
      ? this._config.timeline_entities
      : null;

    let logbookIds = [];
    const synthDevices = [];
    if (explicitIds) {
      logbookIds = explicitIds;
    } else {
      resolveDeviceList(this._hass, this._config).forEach((d) => {
        const resolved = d.binary_entity || this._resolveEventEntity(d.entity);
        if (resolved) logbookIds.push(resolved);
        else synthDevices.push(d);
      });
    }

    try {
      const events = [];
      if (logbookIds.length) {
        const path = `logbook/${start.toISOString()}?end_time=${end.toISOString()}&entity=${logbookIds.join(',')}`;
        const res = await this._hass.callApi('GET', path);
        (res || []).forEach((r) => {
          let message = r.message || '';
          if (!message && r.state) message = r.state === 'on' ? 'turned on' : r.state === 'off' ? 'turned off' : '';
          events.push({ when: new Date(r.when || r.last_changed).getTime(), name: r.name || r.entity_id || '', message });
        });
      }
      if (synthDevices.length) {
        // No real on/off entity exists for these — synthesize turned-on/turned-off
        // events from the power sensor's own history by watching for it to cross
        // a wattage threshold, the same signal Sense uses internally.
        const ids = synthDevices.map((d) => d.entity);
        const path = `history/period/${start.toISOString()}?filter_entity_id=${ids.join(',')}&end_time=${end.toISOString()}&minimal_response`;
        const res = await this._hass.callApi('GET', path);
        (res || []).forEach((series, i) => {
          const device = synthDevices[i];
          if (!device) return;
          const threshold = device.on_threshold != null && device.on_threshold !== '' ? Number(device.on_threshold) : 5;
          let prevOn = null;
          (series || []).forEach((st) => {
            const val = Number(st.state);
            if (Number.isNaN(val)) return;
            const isOn = val >= threshold;
            if (prevOn !== null && isOn !== prevOn) {
              events.push({ when: new Date(st.last_changed).getTime(), name: device.name || device.entity, message: isOn ? 'turned on' : 'turned off' });
            }
            prevOn = isOn;
          });
        });
      }

      events.sort((a, b) => b.when - a.when);
      const rows = events.slice(0, this._config.max_events || 12);
      if (!rows.length) {
        container.innerHTML = '<div class="empty">No events yet today.</div>';
        return;
      }
      container.innerHTML = rows
        .map((r, i) => {
          const time = new Date(r.when).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          const msg = r.message ? `${this._esc(r.name || '')} ${this._esc(r.message)}` : this._esc(r.name || '');
          return `
            <div class="tl-item" style="animation-delay:${i * 40}ms;">
              <div class="tl-time">${time}</div>
              <div class="tl-row">
                <div class="tl-icon"><ha-icon icon="mdi:power-socket" style="--mdc-icon-size: calc(14px * var(--ha-font-size-scale, 1));"></ha-icon></div>
                <div class="tl-text">${msg}</div>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (e) {
      container.innerHTML = '<div class="empty">Timeline unavailable.</div>';
    }
  }
}

const SENSELIKE_TIMELINE_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'areas', selector: { area: { multiple: true } } },
  { name: 'labels', selector: { label: { multiple: true } } },
  { name: 'max_events', selector: { number: { mode: 'box', min: 1 } } },
  { name: 'accent_color', selector: { text: {} } },
  { name: 'muted_color', selector: { text: {} } },
];
const SENSELIKE_TIMELINE_LABELS = {
  title: 'Title',
  areas: 'Include devices from areas (optional)',
  labels: 'Include devices with labels (optional)',
  max_events: 'Max events shown',
  accent_color: 'Accent color (CSS value)',
  muted_color: 'Muted color (CSS value)',
};

class SenseLikeTimelineCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { title: 'Today', devices: [], ...config };
    if (!this._built) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    this.shadowRoot?.querySelectorAll('ha-selector').forEach((el) => { el.hass = hass; });
  }

  connectedCallback() {
    if (!this._built) this._render();
  }

  _fireChange() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _createTextField(label, value, onInput) {
    const el = document.createElement('ha-selector');
    el.hass = this._hass;
    el.label = label;
    el.selector = { text: {} };
    el.value = value ?? '';
    el.style.display = 'block';
    el.addEventListener('value-changed', (ev) => onInput(ev.detail.value));
    return el;
  }

  _createNumberField(label, value, onInput) {
    const el = document.createElement('ha-selector');
    el.hass = this._hass;
    el.label = label;
    el.selector = { number: { mode: 'box' } };
    el.value = value ?? '';
    el.style.display = 'block';
    el.addEventListener('value-changed', (ev) => onInput(ev.detail.value));
    return el;
  }

  _createEntitySelector(label, value, onChange, filter) {
    const el = document.createElement('ha-selector');
    el.hass = this._hass;
    el.label = label;
    el.selector = filter ? { entity: { filter } } : { entity: {} };
    el.value = value || '';
    el.style.display = 'block';
    el.addEventListener('value-changed', (ev) => onChange(ev.detail.value));
    return el;
  }

  _updateDevice(index, key, value) {
    const devices = this._config.devices.slice();
    devices[index] = { ...devices[index], [key]: value };
    this._config = { ...this._config, devices };
    this._fireChange();
  }

  _renderDevicesList() {
    const container = this.shadowRoot.getElementById('devices');
    container.innerHTML = '';
    this._config.devices.forEach((device, i) => {
      const row = document.createElement('div');
      row.className = 'device-row';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove device';
      removeBtn.addEventListener('click', () => {
        const devices = this._config.devices.slice();
        devices.splice(i, 1);
        this._config = { ...this._config, devices };
        this._fireChange();
        this._renderDevicesList();
      });
      row.appendChild(removeBtn);

      const r1 = document.createElement('div');
      r1.className = 'row';
      r1.appendChild(this._createEntitySelector('Entity (power)', device.entity, (v) => this._updateDevice(i, 'entity', v), [{ domain: 'sensor', device_class: 'power' }]));
      r1.appendChild(this._createTextField('Display name', device.name, (v) => this._updateDevice(i, 'name', v)));
      row.appendChild(r1);

      const r2 = document.createElement('div');
      r2.className = 'row';
      r2.appendChild(this._createEntitySelector('Event entity override (optional)', device.binary_entity, (v) => this._updateDevice(i, 'binary_entity', v), [{ domain: 'binary_sensor' }, { domain: 'switch' }]));
      r2.appendChild(this._createNumberField('On threshold in W (if no event entity)', device.on_threshold, (v) => this._updateDevice(i, 'on_threshold', v)));
      row.appendChild(r2);

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
        .device-row { border:1px solid var(--divider-color); border-radius:8px; padding:16px 12px 4px; position:relative; }
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
        <div id="form-wrap"></div>
        <div class="section-label">Devices</div>
        <div id="devices"></div>
        <button class="add-btn" id="add-device">+ Add device</button>
      </div>
    `;
    const formWrap = this.shadowRoot.getElementById('form-wrap');
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config;
    form.schema = SENSELIKE_TIMELINE_SCHEMA;
    form.computeLabel = (s) => SENSELIKE_TIMELINE_LABELS[s.name] || s.name;
    form.addEventListener('value-changed', (ev) => {
      this._config = { ...this._config, ...ev.detail.value };
      this._fireChange();
    });
    this._form = form;
    formWrap.appendChild(form);

    this._renderDevicesList();
    this.shadowRoot.getElementById('add-device').addEventListener('click', () => {
      const devices = this._config.devices.slice();
      devices.push({ entity: '', name: '' });
      this._config = { ...this._config, devices };
      this._fireChange();
      this._renderDevicesList();
    });
    this._built = true;
  }
}
customElements.define('senselike-timeline-card-editor', SenseLikeTimelineCardEditor);

customElements.define('senselike-timeline-card', SenseLikeTimelineCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'senselike-timeline-card',
  name: 'SenseLike Timeline',
  description: 'Today\'s device on/off event timeline, Sense-app style.',
});
