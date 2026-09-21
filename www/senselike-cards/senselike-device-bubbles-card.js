// Sense-style "Now" card — circle-packed device power bubbles.
// type: custom:senselike-device-bubbles-card
function packCircles(items, width, height) {
  const n = items.length;
  items.forEach((it, i) => {
    const angle = i * 2.399963;
    const radius = 6 * Math.sqrt(i + 1);
    it.x = radius * Math.cos(angle);
    it.y = radius * Math.sin(angle);
  });
  // Relax with collision-avoidance + gentle pull toward the origin, but no hard
  // boundary clamp — clamping mid-relaxation fights collision-avoidance and forces
  // real overlaps whenever the natural layout doesn't fit the box. Instead we let
  // circles settle freely, then uniformly scale+translate the whole result to fit
  // (a similarity transform, so touching-not-overlapping is preserved exactly).
  //
  // The origin-pull is biased per axis toward the container's own aspect ratio.
  // Without this, the cluster relaxes into a roughly circular blob regardless of
  // the box's shape, so a wide box's final fit-scale ends up limited by height
  // (the blob touches top/bottom first) while wasting the side margins — smaller
  // bubbles and smaller text than the box could actually support. Biasing the
  // pull to (loosely) match the box's aspect ratio makes the natural cluster
  // shape closer to it, so both dimensions hit their limit together and the
  // fit-scale — and every bubble's final radius — comes out larger.
  const aspect = Math.max(0.4, Math.min(2.5, width / height));
  const bias = Math.sqrt(aspect);
  const decayX = 1 - (1 - 0.988) / bias;
  const decayY = 1 - (1 - 0.988) * bias;
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = items[i], b = items[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minDist = a.r + b.r + 3;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          dx /= dist; dy /= dist;
          a.x -= dx * overlap; a.y -= dy * overlap;
          b.x += dx * overlap; b.y += dy * overlap;
        }
      }
    }
    items.forEach((it) => {
      it.x *= decayX;
      it.y *= decayY;
    });
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  items.forEach((it) => {
    minX = Math.min(minX, it.x - it.r);
    maxX = Math.max(maxX, it.x + it.r);
    minY = Math.min(minY, it.y - it.r);
    maxY = Math.max(maxY, it.y + it.r);
  });
  const pad = 4;
  const layoutW = Math.max(maxX - minX, 1);
  const layoutH = Math.max(maxY - minY, 1);
  const scale = Math.min((width - pad * 2) / layoutW, (height - pad * 2) / layoutH);
  const layoutCx = (minX + maxX) / 2, layoutCy = (minY + maxY) / 2;
  const cx = width / 2, cy = height / 2;
  items.forEach((it) => {
    it.x = cx + (it.x - layoutCx) * scale;
    it.y = cy + (it.y - layoutCy) * scale;
    it.r = it.r * scale;
  });
  return items;
}

// A fixed rate in the card config wins; otherwise fall back to the whole-home
// utility cost/usage sensors (if the utility integration has populated them).
// Shared by the bubbles card (headline cost) and the cost dialog.
function resolveRate(hass, config) {
  if (config.rate != null && config.rate !== '') {
    const r = Number(config.rate);
    if (!Number.isNaN(r) && r > 0) return r;
  }
  const cost = hass.states['sensor.typical_monthly_electric_cost'];
  const usage = hass.states['sensor.typical_monthly_electric_usage'];
  if (cost && usage) {
    const c = Number(cost.state), u = Number(usage.state);
    // A cost of exactly 0 usually means the utility integration hasn't
    // populated a real bill yet, not that electricity is free — treat it
    // the same as "no rate" rather than showing misleading $0.00 figures.
    if (u > 0 && c > 0 && !Number.isNaN(c)) return c / u;
  }
  return null;
}

// Devices only carry a power (watts) entity, but hourly cost needs an energy
// (kWh) statistic. Sense's device sensors live on the same HA device, so find
// the daily-energy sibling via the device registry, same pattern as the
// timeline card's on/off lookup.
function resolveEnergyEntity(hass, powerEntity) {
  const entities = hass.entities;
  const reg = entities && entities[powerEntity];
  if (!reg || !reg.device_id) return null;
  const siblings = Object.values(entities).filter((e) => e.device_id === reg.device_id);
  const daily = siblings.find((e) => e.entity_id.endsWith('_daily_energy'));
  return daily ? daily.entity_id : null;
}

// recorder/statistics_during_period returns a running cumulative sum per hour
// bucket (handles counter resets internally); the per-hour usage is the delta
// between consecutive buckets. Callers must fetch one extra "lead-in" bucket
// before the first hour they care about (query start_time - 1h) — without a
// real prior sum to diff against, the first hour's usage is unknowable and
// would otherwise have to be silently dropped rather than guessed at.
function toHourlyKwh(arr) {
  const hours = new Array(24).fill(0);
  if (!arr || arr.length < 2) return hours;
  for (let i = 1; i < arr.length; i++) {
    const hourIdx = new Date(arr[i].start).getHours();
    const delta = arr[i].sum - arr[i - 1].sum;
    hours[hourIdx] = Math.max(0, delta);
  }
  return hours;
}

// Dispatched from elements that may be detached from the dashboard's own DOM
// subtree (e.g. the expand dialog, appended to document.body) — bubbling
// alone can't reach HA's more-info listener in that case since it's
// registered on the <home-assistant> element itself, which isn't
// necessarily an ancestor of a body-appended node. Dispatching directly ON
// that element sidesteps the bubbling path entirely (target-phase listeners
// always fire on their own target), so this works regardless of where the
// click originated.
function fireMoreInfo(entityId) {
  const target = document.querySelector('home-assistant') || document.body;
  target.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

function computeBubbleItems(hass, config) {
  return resolveDeviceList(hass, config)
    .map((d) => {
      const st = hass.states[d.entity];
      const v = st ? Number(st.state) : 0;
      const unit = (st && st.attributes.unit_of_measurement) || 'W';
      return { name: d.name || (st && st.attributes.friendly_name) || d.entity, value: Number.isNaN(v) ? 0 : v, unit, entity: d.entity, isAlwaysOn: /always\s*on/i.test(d.name || '') };
    })
    .filter((d) => d.value > 0);
}

// Shared circle-pack render/update logic used by both the card's inline
// bubble view and the full-screen expand dialog, so the expand view is a
// true zoom-in rather than a second implementation that can drift out of
// sync. packCircles scales the whole cluster to fill whatever `wrap` size
// it's given, so passing the same minR/maxR into a much bigger container
// (the expand dialog) already produces proportionally bigger bubbles.
//
// `requestRerender` is called after a bubble click toggles the enlarged
// state (and again when its 3s timer lapses) so the caller re-runs its own
// render pass — items must be recomputed and re-packed, not just restyled,
// for the "make room" effect below.
function renderBubblesInto(wrap, items, bubbleEls, sizing, requestRerender) {
  const { minR, maxR } = sizing;
  if (!items.length) {
    wrap.innerHTML = '<div class="empty">No device usage right now.</div>';
    bubbleEls.clear();
    return;
  }
  if (wrap.querySelector('.empty')) wrap.innerHTML = '';

  const wrapRect = wrap.getBoundingClientRect();
  const W = wrapRect.width || 320, H = wrapRect.height || 270;
  const fontScale = parseFloat(getComputedStyle(wrap).getPropertyValue('--ha-font-size-scale')) || 1;
  // The card overlays a live-wattage readout in the bottom-right corner (and,
  // on the small inline card, an expand button in the bottom-left) — reserve a
  // strip along the bottom of the *packing* box so no bubble ever lands under
  // either one. CSS padding can't do this: percentages on an absolutely
  // positioned child resolve against the containing block's padding box, which
  // padding is itself part of, so bubbles would still happily render inside a
  // padding-bottom area. Passing a shorter height into packCircles keeps the
  // cluster itself out of that zone, while positions are still converted to
  // percentages of the real (taller) box below, so the reserved strip actually
  // stays empty on screen.
  const bottomReserve = 32 * fontScale;
  const packH = Math.max(H - bottomReserve, 40);
  const maxVal = Math.max(...items.map((i) => i.value));
  items.forEach((it) => {
    it.r = minR + (maxR - minR) * Math.sqrt(it.value / maxVal);
    // Boost the clicked bubble's radius *before* packing (not just a CSS
    // scale applied after the fact) so collision-avoidance genuinely shoves
    // its neighbors aside to make room — the same "expand in place" behavior
    // the real Sense app uses. The final uniform fit-to-container scale in
    // packCircles then naturally shrinks the rest of the cluster slightly
    // to compensate, for free.
    if (wrap._enlargedEntity === it.entity) it.r *= 1.35;
  });
  packCircles(items, W, packH);

  const seen = new Set();
  items.forEach((it) => {
    seen.add(it.entity);
    let el = bubbleEls.get(it.entity);
    const isNew = !el;
    if (isNew) {
      el = document.createElement('div');
      el.className = 'bubble entering';
      el.innerHTML = '<div class="label"><span class="name"></span><span class="watts"></span></div>';
      el.addEventListener('click', () => {
        clearTimeout(wrap._enlargeTimer);
        if (wrap._enlargedEntity === it.entity) {
          // Already enlarged from a prior click — a second click on the same
          // bubble means "tell me more" rather than "shrink it back down".
          wrap._enlargedEntity = null;
          requestRerender();
          fireMoreInfo(it.entity);
        } else {
          wrap._enlargedEntity = it.entity;
          wrap._enlargeTimer = setTimeout(() => {
            wrap._enlargedEntity = null;
            requestRerender();
          }, 3000);
          requestRerender();
        }
      });
      wrap.appendChild(el);
      bubbleEls.set(it.entity, el);
    }
    const nameEl = el.querySelector('.name');
    const wattsEl = el.querySelector('.watts');
    const roundedVal = Math.round(it.value);
    const prevVal = el.dataset.lastValue != null ? Number(el.dataset.lastValue) : null;
    nameEl.textContent = it.name;
    wattsEl.textContent = `${roundedVal} ${it.unit}`;
    // it.r is the real, container-scaled pixel radius (packCircles scales the
    // whole cluster to fill whatever box it's given), so font size is mostly a
    // pure proportion of it — but the card and dialog share the same minR/maxR,
    // so a small legibility floor doesn't break proportionality between them,
    // it just keeps the smallest (lowest-wattage) bubbles' text from shrinking
    // past readable. Scaled by the theme's font-size preference like everything else.
    const labelPx = Math.max(it.r / 5.5, 10) * fontScale;
    el.querySelector('.label').style.fontSize = `${labelPx.toFixed(2)}px`;
    // Ellipsis (see .label .name/.watts) handles horizontal overflow; this
    // handles vertical overflow by dropping the wattage line entirely once
    // the bubble is too small to hold both lines without them colliding or
    // spilling past the circle — better than two half-clipped lines of text.
    const availableHeight = it.r * 2 - 12; // minus the label's 6px top+bottom-equivalent padding
    const twoLineHeight = labelPx * 1.15 + 2 + labelPx * 0.85 * 1.15;
    wattsEl.style.display = availableHeight < twoLineHeight ? 'none' : '';
    el.style.left = `${((it.x / W) * 100).toFixed(2)}%`;
    el.style.top = `${((it.y / H) * 100).toFixed(2)}%`;
    el.style.width = `${((it.r * 2 / W) * 100).toFixed(2)}%`;
    el.style.paddingTop = `${((it.r * 2 / W) * 100).toFixed(2)}%`;
    el.style.background = it.isAlwaysOn ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 78%, var(--other))';
    el.classList.toggle('enlarged', wrap._enlargedEntity === it.entity);
    if (isNew) {
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
    } else if (prevVal != null && Math.abs(prevVal - roundedVal) >= 1) {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }
    el.dataset.lastValue = String(roundedVal);
  });
  for (const [entity, el] of bubbleEls) {
    if (!seen.has(entity)) {
      el.remove();
      bubbleEls.delete(entity);
    }
  }
}

// Full-screen cost comparison dialog opened from the bubbles card's chevron —
// mirrors the real Sense app's "today vs typical [weekday]" drill-down: hourly
// bars (today's actual cost for hours already elapsed, historical average for
// the rest of the day) plus a per-device cost breakdown.
class SenseLikeCostDialog extends HTMLElement {
  static show(hass, config) {
    let dialog = document.body.querySelector('senselike-cost-dialog');
    if (!dialog) {
      dialog = document.createElement('senselike-cost-dialog');
      document.body.appendChild(dialog);
    }
    dialog.open(hass, config);
  }

  async open(hass, config) {
    this._hass = hass;
    this._config = config;
    this._data = null;
    this._render();
    await this._load();
    this._render();
  }

  close() {
    this.remove();
  }

  async _load() {
    const hass = this._hass;
    this._rate = resolveRate(hass, this._config);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const currentHour = now.getHours();

    const devices = resolveDeviceList(hass, this._config)
      .map((d) => ({ name: d.name || d.entity, energyEntity: resolveEnergyEntity(hass, d.entity) }))
      .filter((d) => d.energyEntity);

    if (!devices.length) {
      this._data = { unavailable: true };
      return;
    }

    const ids = devices.map((d) => d.energyEntity);

    try {
      const todayStats = await hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(todayStart.getTime() - 3600000).toISOString(),
        end_time: now.toISOString(),
        statistic_ids: ids,
        period: 'hour',
        types: ['sum'],
      });

      // Probe how far back history actually goes so "Last N <weekday>s" reflects
      // reality instead of assuming a full 4 weeks are available.
      const earliestProbe = await hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(0).toISOString(),
        end_time: todayStart.toISOString(),
        statistic_ids: [ids[0]],
        period: 'day',
        types: ['sum'],
      });
      const earliest = earliestProbe[ids[0]] && earliestProbe[ids[0]].length ? new Date(earliestProbe[ids[0]][0].start) : todayStart;

      const pastDays = [];
      for (let w = 1; w <= 8 && pastDays.length < 4; w++) {
        const dayStart = new Date(todayStart);
        dayStart.setDate(dayStart.getDate() - 7 * w);
        if (dayStart < earliest) break;
        pastDays.push(dayStart);
      }

      const pastStatsByDay = [];
      for (const dayStart of pastDays) {
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const stats = await hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: new Date(dayStart.getTime() - 3600000).toISOString(),
          end_time: dayEnd.toISOString(),
          statistic_ids: ids,
          period: 'hour',
          types: ['sum'],
        });
        pastStatsByDay.push(stats);
      }

      const todayByDevice = devices.map((d) => toHourlyKwh(todayStats[d.energyEntity]));
      const pastByDevice = devices.map((d) => {
        const hourSums = new Array(24).fill(0);
        pastStatsByDay.forEach((dayStats) => {
          toHourlyKwh(dayStats[d.energyEntity]).forEach((v, h) => { hourSums[h] += v; });
        });
        const dayCount = pastStatsByDay.length;
        return hourSums.map((v) => (dayCount ? v / dayCount : 0));
      });

      const hourlyBars = [];
      for (let h = 0; h < 24; h++) {
        const isToday = h <= currentHour;
        let kwh = 0;
        for (let di = 0; di < devices.length; di++) {
          kwh += isToday ? todayByDevice[di][h] : pastByDevice[di][h];
        }
        hourlyBars.push({ hour: h, kwh, isToday });
      }

      const deviceTotals = devices.map((d, di) => ({
        name: d.name,
        todayKwh: todayByDevice[di].reduce((a, b) => a + b, 0),
        pastKwh: pastByDevice[di].reduce((a, b) => a + b, 0),
      }));
      deviceTotals.sort((a, b) => b.todayKwh - a.todayKwh);

      this._data = {
        hourlyBars,
        deviceTotals,
        todayTotalKwh: deviceTotals.reduce((a, dv) => a + dv.todayKwh, 0),
        pastTotalKwh: deviceTotals.reduce((a, dv) => a + dv.pastKwh, 0),
        pastDayCount: pastDays.length,
      };
    } catch (e) {
      this._data = { error: true };
    }
  }

  _fmtCost(kwh) {
    if (this._rate == null) return '–';
    return `$${(kwh * this._rate).toFixed(2)}`;
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const config = this._config || {};
    const accent = config.accent_color || 'var(--primary-color)';
    const muted = config.muted_color || 'var(--secondary-text-color)';
    // Deliberately not tied to the bubbles' other_color (which defaults to a
    // blue and would be nearly indistinguishable from accent here) — the
    // today-vs-historical bars need a genuinely contrasting hue, like the
    // blue/orange split in the real Sense app.
    const history = config.history_color || '#d9822b';
    const d = this._data;

    let body = '<div class="empty">Loading&hellip;</div>';
    if (d && d.error) body = '<div class="empty">Cost data unavailable.</div>';
    else if (d && d.unavailable) body = '<div class="empty">No devices have an energy sensor to compare.</div>';
    else if (d) {
      const todayLabel = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
      const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });
      // A brand-new install has no same-weekday history yet — "Last 0
      // Thursdays — $0.00" reads as a real (zero-cost) data point rather
      // than "not enough history", so say so explicitly instead.
      const pastLabel = d.pastDayCount === 0
        ? 'No history yet'
        : `Last ${d.pastDayCount} ${weekday}${d.pastDayCount === 1 ? '' : 's'}`;
      const maxKwh = Math.max(0.01, ...d.hourlyBars.map((b) => b.kwh));
      const barsHtml = d.hourlyBars
        .map((b) => {
          const pct = Math.max(2, (b.kwh / maxKwh) * 100);
          return `<div class="bar ${b.isToday ? 'today' : 'past'}" style="height:${pct.toFixed(1)}%" title="${b.hour}:00 — ${this._fmtCost(b.kwh)}"></div>`;
        })
        .join('');
      const deviceListHtml = d.deviceTotals
        .map((dt) => `
          <div class="device-row">
            <div class="device-icon"><ha-icon icon="mdi:power-socket"></ha-icon></div>
            <div class="device-name">${escHtml(dt.name)}</div>
            <div class="device-past">${this._fmtCost(dt.pastKwh)}</div>
            <div class="device-today">${this._fmtCost(dt.todayKwh)}</div>
          </div>
        `)
        .join('');
      const rateHint = this._rate == null
        ? '<div class="rate-hint">Set a "rate" ($/kWh) in the card settings to show costs — your utility sensors don’t have a rate yet.</div>'
        : '';
      body = `
        <div class="compare-header">
          <div class="compare-col">
            <div class="compare-label">${escHtml(pastLabel)}</div>
            <div class="compare-amt muted">${this._fmtCost(d.pastTotalKwh)}</div>
          </div>
          <div class="compare-col right">
            <div class="compare-label">${escHtml(todayLabel)}</div>
            <div class="compare-amt accent">${this._fmtCost(d.todayTotalKwh)}</div>
          </div>
        </div>
        <div class="bars-wrap">${barsHtml}</div>
        <div class="device-list">${deviceListHtml}</div>
        ${rateHint}
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        .overlay {
          position: fixed; inset: 0; z-index: 1000; overflow-y: auto; box-sizing: border-box;
          padding: 16px 20px 40px; background: var(--card-background-color, #10182b); color: var(--primary-text-color);
          --accent: ${accent}; --muted: ${muted}; --history: ${history};
        }
        .header { display:flex; align-items:center; margin-bottom:20px; }
        .back-btn {
          width:34px; height:34px; border-radius:50%; border:none; background: rgba(127,127,127,.18); color: inherit;
          display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;
        }
        .compare-header { display:flex; justify-content:space-between; margin-bottom:24px; }
        .compare-col.right { text-align:right; }
        .compare-label { font-size: calc(13px * var(--ha-font-size-scale, 1)); font-weight:600; color: var(--secondary-text-color); margin-bottom:4px; }
        .compare-amt { font-size: calc(28px * var(--ha-font-size-scale, 1)); font-weight:700; }
        .compare-amt.muted { color: var(--secondary-text-color); }
        .compare-amt.accent { color: var(--accent); }
        .bars-wrap {
          display:flex; align-items:flex-end; gap:3px; height:160px; margin-bottom:24px;
          border-bottom:1px solid var(--divider-color, rgba(127,127,127,.2)); padding-bottom:2px;
        }
        .bar { flex:1; border-radius:3px 3px 0 0; min-height:2px; }
        .bar.today { background: var(--accent); }
        .bar.past { background: var(--history); opacity:.85; }
        .device-list { display:flex; flex-direction:column; gap:10px; }
        .device-row { display:flex; align-items:center; gap:12px; background: var(--secondary-background-color, rgba(127,127,127,.08)); border-radius:14px; padding:12px 16px; }
        .device-icon { width:32px; height:32px; border-radius:50%; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .device-name { flex:1; font-size: calc(15px * var(--ha-font-size-scale, 1)); font-weight:600; }
        .device-past { font-size: calc(14px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); width:60px; text-align:right; }
        .device-today { font-size: calc(14px * var(--ha-font-size-scale, 1)); font-weight:700; color: var(--accent); width:60px; text-align:right; }
        .empty { text-align:center; padding:80px 0; color: var(--secondary-text-color); }
        .rate-hint { text-align:center; font-size: calc(12px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); margin-top:16px; }
      </style>
      <div class="overlay">
        <div class="header">
          <button class="back-btn" id="close-btn" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
          </button>
        </div>
        ${body}
      </div>
    `;
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => this.close());
  }
}
customElements.define('senselike-cost-dialog', SenseLikeCostDialog);

// Full-screen "zoom in" on the bubble-pack view, opened from the bubbles
// card's expand button — same renderBubblesInto/packCircles logic as the
// card, just given a much bigger container so the circles pack out larger.
// Detached from the dashboard's own hass update cycle (it lives on
// document.body), so it re-pulls hass from the <home-assistant> root on
// every refresh tick instead of relying on a `set hass` call from the card.
class SenseLikeBubblesExpandDialog extends HTMLElement {
  static show(hass, config, card) {
    let dialog = document.body.querySelector('senselike-bubbles-expand-dialog');
    if (!dialog) {
      dialog = document.createElement('senselike-bubbles-expand-dialog');
      document.body.appendChild(dialog);
    }
    dialog.open(hass, config, card);
  }

  // `card` is the originating SenseLikeDeviceBubblesCard instance — its
  // headline cost and compare-text are mirrored into this dialog on every
  // tick rather than re-derived here, so the fullscreen view can't drift out
  // of sync with the card (the cost computation involves several recorder
  // API calls in the card's own _loadStats(), which we don't want to run a
  // second time just for this view).
  open(hass, config, card) {
    this._hass = hass;
    this._config = config;
    this._card = card;
    this._bubbleEls = new Map();
    this._buildShell();
    this._renderBubbles();
    if (!this._timer) {
      this._timer = setInterval(() => this._renderBubbles(), 3000);
    }
  }

  close() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    clearTimeout(this.shadowRoot?.getElementById('bubble-wrap')?._enlargeTimer);
    this.remove();
  }

  _buildShell() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const config = this._config;
    const accent = config.accent_color || 'var(--primary-color)';
    const other = config.other_color || 'var(--info-color, #039be5)';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        .overlay {
          position: fixed; inset: 0; z-index: 1000; box-sizing: border-box;
          padding: 16px 20px 24px; background: var(--card-background-color, #10182b); color: var(--primary-text-color);
          display:flex; flex-direction:column;
          --accent: ${accent}; --other: ${other};
        }
        .header { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-shrink:0; }
        .back-btn {
          width:34px; height:34px; border-radius:50%; border:none; background: rgba(127,127,127,.18); color: inherit;
          display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; flex-shrink:0;
        }
        .header-text { flex:1; min-width:0; }
        /* Fullscreen has far more room than the card, so these scale with the
           viewport (vmin, so portrait and landscape both stay sane) instead
           of sitting at the same fixed size the small card uses — clamped so
           a tiny phone and a huge wall display both stay readable. */
        .headline { font-size: calc(clamp(20px, 4vmin, 44px) * var(--ha-font-size-scale, 1)); font-weight:600; }
        .headline .amt { color: var(--accent); }
        .compare-text { font-size: calc(clamp(13px, 2.2vmin, 24px) * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); margin-top:2px; }
        .bubble-wrap { position:relative; flex:1; min-height:0; }
        .live-readout { position:absolute; right:4px; bottom:0; display:flex; align-items:center; gap:6px; font-size: calc(clamp(14px, 2.4vmin, 28px) * var(--ha-font-size-scale, 1)); font-weight:700; color: var(--primary-text-color); }
        .live-readout .pulse-icon { animation: senselike-pulse 1.8s ease-in-out infinite; --mdc-icon-size: 1.1em; }
        @keyframes senselike-pulse {
          0%, 100% { opacity:.55; transform:scale(.85); }
          50% { opacity:1; transform:scale(1.15); }
        }
        .bubble {
          position:absolute; border-radius:50%; display:flex; align-items:center; justify-content:center;
          text-align:center; color:white; font-weight:700; padding:6px; box-sizing:border-box;
          line-height:1.15; overflow:hidden; cursor:pointer;
          transform: translate(-50%,-50%) scale(1);
          opacity: 1;
          transition: left .6s cubic-bezier(.34,1.56,.64,1), top .6s cubic-bezier(.34,1.56,.64,1),
                      width .6s cubic-bezier(.34,1.56,.64,1), padding-top .6s cubic-bezier(.34,1.56,.64,1),
                      background .4s ease, opacity .4s ease, transform .5s cubic-bezier(.34,1.56,.64,1);
        }
        .bubble.entering { opacity:0; transform: translate(-50%,-50%) scale(.3); }
        .bubble.enlarged { z-index:5; }
        .bubble .label {
          position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
          width:100%; text-align:center; box-sizing:border-box; padding:0 6px;
          display:flex; flex-direction:column; align-items:center; gap:2px;
        }
        .bubble .label .name {
          display:block; width:100%; line-height:1.15;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .bubble .label .watts {
          display:block; width:100%; font-weight:800; opacity:.9; font-size:0.85em;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .bubble.pulse { animation: senselike-bubble-pulse .5s ease; }
        @keyframes senselike-bubble-pulse {
          0% { filter:brightness(1); }
          40% { filter:brightness(1.35); }
          100% { filter:brightness(1); }
        }
        .empty { text-align:center; padding:80px 0; color: var(--secondary-text-color); }
        @media (prefers-reduced-motion: reduce) {
          .bubble, .live-readout .pulse-icon { transition:none !important; animation:none !important; }
        }
      </style>
      <div class="overlay">
        <div class="header">
          <button class="back-btn" id="close-btn" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
          </button>
          <div class="header-text">
            <div class="headline"><span>You've used <span class="amt" id="cost">–</span> so far today.</span></div>
            <div class="compare-text" id="compare-text"></div>
          </div>
        </div>
        <div class="bubble-wrap" id="bubble-wrap"></div>
      </div>
    `;
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => this.close());
  }

  _renderBubbles() {
    const ha = document.querySelector('home-assistant');
    if (ha && ha.hass) this._hass = ha.hass;
    if (!this._hass) return;

    const cardRoot = this._card && this._card.shadowRoot;
    const costEl = this.shadowRoot.getElementById('cost');
    const compareEl = this.shadowRoot.getElementById('compare-text');
    if (costEl) costEl.textContent = (cardRoot && cardRoot.getElementById('cost')?.textContent) || '–';
    if (compareEl) compareEl.innerHTML = (cardRoot && cardRoot.getElementById('compare-text')?.innerHTML) || '';

    const wrap = this.shadowRoot.getElementById('bubble-wrap');
    const items = computeBubbleItems(this._hass, this._config);
    renderBubblesInto(wrap, items, this._bubbleEls, { minR: 34, maxR: 95 }, () => this._renderBubbles());

    if (this._config.current_power_entity) {
      const st = this._hass.states[this._config.current_power_entity];
      let liveEl = wrap.querySelector('.live-readout');
      if (st && !Number.isNaN(Number(st.state))) {
        if (!liveEl) {
          liveEl = document.createElement('div');
          liveEl.className = 'live-readout';
          liveEl.innerHTML = '<ha-icon class="pulse-icon" icon="mdi:pulse" style="color:var(--accent);"></ha-icon><span class="live-value"></span>';
          wrap.appendChild(liveEl);
        }
        liveEl.querySelector('.live-value').textContent = `${Math.round(Number(st.state)).toLocaleString()} W`;
      } else if (liveEl) {
        liveEl.remove();
      }
    }
  }
}
customElements.define('senselike-bubbles-expand-dialog', SenseLikeBubblesExpandDialog);

class SenseLikeDeviceBubblesCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: 'Now',
      cost_entity: 'sensor.energy_cost_today',
      current_power_entity: 'sensor.house_power',
      devices: [
        { entity: 'sensor.fridge_power', name: 'Fridge' },
        { entity: 'sensor.server_rack_power', name: 'Server Rack' },
        { entity: 'sensor.always_on_power', name: 'Always On' },
      ],
    };
  }

  static getConfigElement() {
    return document.createElement('senselike-device-bubbles-card-editor');
  }

  setConfig(config) {
    const hasDevices = Array.isArray(config.devices) && config.devices.length;
    const hasAreas = Array.isArray(config.areas) && config.areas.length;
    const hasLabels = Array.isArray(config.labels) && config.labels.length;
    if (!hasDevices && !hasAreas && !hasLabels) {
      throw new Error('senselike-device-bubbles-card: at least one of "devices", "areas", or "labels" is required');
    }
    this._config = {
      title: 'Now',
      devices: [],
      accent_color: 'var(--primary-color)',
      muted_color: 'var(--secondary-text-color)',
      other_color: 'var(--info-color, #039be5)',
      ...config,
    };
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._renderBubbles();
    if (!this._statsLoaded) {
      this._statsLoaded = true;
      this._loadStats();
    }
  }

  getCardSize() {
    return 5;
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card {
          padding: 16px 18px 14px;
          --accent: ${this._config.accent_color};
          --muted: ${this._config.muted_color};
          --other: ${this._config.other_color};
        }
        .headline { display:flex; align-items:center; gap:8px; font-size: calc(20px * var(--ha-font-size-scale, 1)); font-weight:600; color: var(--primary-text-color); }
        .headline .amt { color: var(--accent); }
        .arrow {
          width:22px; height:22px; border-radius:50%; border:1.5px solid var(--primary-text-color);
          color: var(--primary-text-color);
          display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;
        }
        .info-row { display:flex; align-items:center; gap:8px; margin-top:6px; }
        .compare-text { font-size: calc(14px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); }
        .bubble-wrap { position:relative; margin-top:12px; height:330px; }
        .bubble {
          position:absolute; border-radius:50%; display:flex; align-items:center; justify-content:center;
          text-align:center; color:white; font-weight:700; padding:6px; box-sizing:border-box;
          line-height:1.15; overflow:hidden; cursor:pointer;
          transform: translate(-50%,-50%) scale(1);
          opacity: 1;
          transition: left .6s cubic-bezier(.34,1.56,.64,1), top .6s cubic-bezier(.34,1.56,.64,1),
                      width .6s cubic-bezier(.34,1.56,.64,1), padding-top .6s cubic-bezier(.34,1.56,.64,1),
                      background .4s ease, opacity .4s ease, transform .5s cubic-bezier(.34,1.56,.64,1);
        }
        .bubble.entering { opacity:0; transform: translate(-50%,-50%) scale(.3); }
        .bubble.enlarged { z-index:5; }
        .bubble .label {
          position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
          width:100%; text-align:center; box-sizing:border-box; padding:0 6px;
          display:flex; flex-direction:column; align-items:center; gap:2px;
        }
        .bubble .label .name {
          display:block; width:100%; line-height:1.15;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .bubble .label .watts {
          display:block; width:100%; font-weight:800; opacity:.9; font-size:0.85em;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .bubble.pulse { animation: senselike-bubble-pulse .5s ease; }
        @keyframes senselike-bubble-pulse {
          0% { filter:brightness(1); }
          40% { filter:brightness(1.35); }
          100% { filter:brightness(1); }
        }
        .live-readout { position:absolute; right:4px; bottom:0; display:flex; align-items:center; gap:6px; font-size: calc(14px * var(--ha-font-size-scale, 1)); font-weight:700; color: var(--primary-text-color); }
        .live-readout .pulse-icon { animation: senselike-pulse 1.8s ease-in-out infinite; }
        @keyframes senselike-pulse {
          0%, 100% { opacity:.55; transform:scale(.85); }
          50% { opacity:1; transform:scale(1.15); }
        }
        .empty { font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); padding: 30px 0; text-align:center; }
        .expand-btn { position:absolute; left:4px; bottom:0; background: var(--card-background-color, rgba(0,0,0,.4)); }
        @media (prefers-reduced-motion: reduce) {
          .bubble, .live-readout .pulse-icon { transition:none !important; animation:none !important; }
        }
      </style>
      <ha-card>
        <div class="headline">
          <span>You've used <span class="amt" id="cost">–</span> so far today.</span>
        </div>
        <div class="info-row">
          <div class="arrow" id="more-info-btn" aria-label="Cost breakdown" title="Cost breakdown">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </div>
          <div class="compare-text" id="compare-text"></div>
        </div>
        <div class="bubble-wrap" id="bubble-wrap"><div class="empty">Loading&hellip;</div></div>
      </ha-card>
    `;
    this.shadowRoot.getElementById('more-info-btn').addEventListener('click', () => {
      SenseLikeCostDialog.show(this._hass, this._config);
    });
    this._built = true;
    if (!this._refreshTimer) {
      this._refreshTimer = setInterval(() => this._renderBubbles(), 3000);
    }
    if (!this._statsTimer) {
      // Historical-comparison stats change slowly — refresh every 5 minutes
      // rather than on the 3s bubble-refresh cadence.
      this._statsTimer = setInterval(() => this._loadStats(), 300000);
    }
  }

  disconnectedCallback() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._statsTimer) {
      clearInterval(this._statsTimer);
      this._statsTimer = null;
    }
    clearTimeout(this.shadowRoot?.getElementById('bubble-wrap')?._enlargeTimer);
    cancelAnimationFrame(this._costAnimFrame);
  }

  // Computes today's cost-so-far (used as the headline figure when no explicit
  // cost_entity is configured) and a same-weekday comparison, mirroring the
  // real Sense app's "This is about the same as on recent Thursdays" line —
  // both from actual device energy history rather than a static string.
  async _loadStats() {
    const hass = this._hass;
    if (!hass) return;
    const rate = resolveRate(hass, this._config);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const currentHour = now.getHours();

    const ids = resolveDeviceList(hass, this._config).map((d) => resolveEnergyEntity(hass, d.entity)).filter(Boolean);
    if (!ids.length) return;

    try {
      // Each `_daily_energy` sensor is a `total_increasing` counter that already
      // resets at midnight, so its live state IS today's running total — sum
      // that directly rather than asking the recorder for today's statistics.
      // The recorder only finalizes a day's long-term statistics once that day
      // is over, so `statistics_during_period` for the still-in-progress today
      // comes back empty (verified: 6 days of history, 0 for today) — using it
      // here would silently read as 0 kWh, and therefore $0.00, all day long.
      let todayKwh = 0;
      ids.forEach((id) => {
        const st = hass.states[id];
        const v = st ? Number(st.state) : NaN;
        if (!Number.isNaN(v)) todayKwh += v;
      });

      if (!this._config.cost_entity && rate != null) {
        this._animateCost(todayKwh * rate);
      }

      if (!this._config.compare_text) {
        const earliestProbe = await hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: new Date(0).toISOString(),
          end_time: todayStart.toISOString(),
          statistic_ids: [ids[0]],
          period: 'day',
          types: ['sum'],
        });
        const earliest = earliestProbe[ids[0]] && earliestProbe[ids[0]].length ? new Date(earliestProbe[ids[0]][0].start) : todayStart;

        const pastDays = [];
        for (let w = 1; w <= 8 && pastDays.length < 4; w++) {
          const dayStart = new Date(todayStart);
          dayStart.setDate(dayStart.getDate() - 7 * w);
          if (dayStart < earliest) break;
          pastDays.push(dayStart);
        }

        if (pastDays.length) {
          let pastKwh = 0;
          for (const dayStart of pastDays) {
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);
            const stats = await hass.callWS({
              type: 'recorder/statistics_during_period',
              start_time: new Date(dayStart.getTime() - 3600000).toISOString(),
              end_time: dayEnd.toISOString(),
              statistic_ids: ids,
              period: 'hour',
              types: ['sum'],
            });
            ids.forEach((id) => {
              toHourlyKwh(stats[id]).forEach((v, h) => { if (h <= currentHour) pastKwh += v; });
            });
          }
          const pastAvg = pastKwh / pastDays.length;
          if (pastAvg > 0) {
            const diffPct = (todayKwh - pastAvg) / pastAvg;
            const phrase = diffPct > 0.1 ? 'more than' : diffPct < -0.1 ? 'less than' : 'about the same as';
            const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
            this._autoCompareHtml = `This is <b>${phrase}</b> on recent ${escHtml(weekday)}s.`;
            const compareEl = this.shadowRoot.getElementById('compare-text');
            if (compareEl) compareEl.innerHTML = this._autoCompareHtml;
          }
        }
      }
    } catch (e) {
      // Leave whatever was last successfully computed (or the empty default)
      // rather than showing an error in place of the headline.
    }
  }

  _renderBubbles() {
    if (!this._built || !this._hass) return;

    if (this._config.cost_entity) {
      const st = this._hass.states[this._config.cost_entity];
      const newCost = st && !Number.isNaN(Number(st.state)) ? Number(st.state) : null;
      this._animateCost(newCost);
    }
    if (this._config.compare_text) {
      this.shadowRoot.getElementById('compare-text').textContent = this._config.compare_text;
    } else if (this._autoCompareHtml) {
      this.shadowRoot.getElementById('compare-text').innerHTML = this._autoCompareHtml;
    }

    const wrap = this.shadowRoot.getElementById('bubble-wrap');
    const items = computeBubbleItems(this._hass, this._config);
    if (!this._bubbleEls) this._bubbleEls = new Map();
    renderBubblesInto(wrap, items, this._bubbleEls, { minR: 34, maxR: 95 }, () => this._renderBubbles());
    if (!items.length) return;

    if (this._config.current_power_entity) {
      const st = this._hass.states[this._config.current_power_entity];
      let liveEl = wrap.querySelector('.live-readout');
      if (st && !Number.isNaN(Number(st.state))) {
        if (!liveEl) {
          liveEl = document.createElement('div');
          liveEl.className = 'live-readout';
          liveEl.innerHTML = '<ha-icon class="pulse-icon" icon="mdi:pulse" style="color:var(--accent); --mdc-icon-size: calc(16px * var(--ha-font-size-scale, 1));"></ha-icon><span class="live-value"></span>';
          wrap.appendChild(liveEl);
        }
        liveEl.querySelector('.live-value').textContent = `${Math.round(Number(st.state)).toLocaleString()} W`;
      } else if (liveEl) {
        liveEl.remove();
      }
    }

    if (!wrap.querySelector('.expand-btn')) {
      const expandBtn = document.createElement('div');
      expandBtn.className = 'arrow expand-btn';
      expandBtn.setAttribute('aria-label', 'Expand bubbles');
      expandBtn.title = 'Expand';
      expandBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/>
          <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
      `;
      expandBtn.addEventListener('click', () => {
        SenseLikeBubblesExpandDialog.show(this._hass, this._config, this);
      });
      wrap.appendChild(expandBtn);
    }
  }

  _animateCost(newValue) {
    const costEl = this.shadowRoot.getElementById('cost');
    cancelAnimationFrame(this._costAnimFrame);
    if (newValue == null) {
      costEl.textContent = '–';
      this._lastCost = null;
      return;
    }
    const from = this._lastCost != null ? this._lastCost : newValue;
    this._lastCost = newValue;
    if (from === newValue) {
      costEl.textContent = `$${newValue.toFixed(2)}`;
      return;
    }
    const start = performance.now();
    const duration = 500;
    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (newValue - from) * eased;
      costEl.textContent = `$${val.toFixed(2)}`;
      if (t < 1) this._costAnimFrame = requestAnimationFrame(animate);
    };
    this._costAnimFrame = requestAnimationFrame(animate);
  }
}

const SENSELIKE_BUBBLES_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'areas', selector: { area: { multiple: true } } },
  { name: 'labels', selector: { label: { multiple: true } } },
  { name: 'cost_entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'monetary' }] } } },
  { name: 'current_power_entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'power' }] } } },
  { name: 'compare_text', selector: { text: {} } },
  { name: 'rate', selector: { number: { mode: 'box', step: 0.001 } } },
  { name: 'accent_color', selector: { text: {} } },
  { name: 'muted_color', selector: { text: {} } },
  { name: 'other_color', selector: { text: {} } },
];
const SENSELIKE_BUBBLES_LABELS = {
  title: 'Title',
  areas: 'Include devices from areas (optional)',
  labels: 'Include devices with labels (optional)',
  cost_entity: 'Cost entity (optional)',
  current_power_entity: 'Live power entity (optional)',
  compare_text: 'Compare text (optional)',
  rate: 'Electricity rate in $/kWh (optional — falls back to utility sensors)',
  accent_color: 'Accent color (CSS value)',
  muted_color: 'Muted color (CSS value)',
  other_color: 'Secondary bubble color (CSS value)',
};

class SenseLikeDeviceBubblesCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { title: 'Now', devices: [], ...config };
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
    form.schema = SENSELIKE_BUBBLES_SCHEMA;
    form.computeLabel = (s) => SENSELIKE_BUBBLES_LABELS[s.name] || s.name;
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
customElements.define('senselike-device-bubbles-card-editor', SenseLikeDeviceBubblesCardEditor);

customElements.define('senselike-device-bubbles-card', SenseLikeDeviceBubblesCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'senselike-device-bubbles-card',
  name: 'SenseLike Device Bubbles',
  description: 'Circle-packed device power bubble chart, Sense-app style.',
});
