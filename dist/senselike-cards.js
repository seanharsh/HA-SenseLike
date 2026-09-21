// Bundled build of www/senselike-cards/*.js — regenerate with dist/build.sh before tagging a release.

// ---- www/senselike-cards/senselike-device-bubbles-card.js ----
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

// ---- www/senselike-cards/senselike-power-meter-card.js ----
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
        .watts { font-size: calc(26px * var(--ha-font-size-scale, 1)); font-weight:800; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
        .cost { font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); }
        .chart-wrap { position:relative; }
        svg { width:100%; height:190px; display:block; overflow:visible; }
        .empty { font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); padding: 40px 0; text-align:center; }
        .date-row { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
        .date { font-size: calc(12px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); }
        .tabs { display:flex; gap:4px; }
        .tab {
          border:none; background:transparent; font-size: calc(12px * var(--ha-font-size-scale, 1)); font-weight:700; letter-spacing:.03em;
          color: var(--secondary-text-color); padding:4px 8px; border-radius:6px; cursor:pointer;
        }
        .tab.active { color: var(--accent); border-bottom:2px solid var(--accent); }
        .badge { position:absolute; font-size: calc(10px * var(--ha-font-size-scale, 1)); font-weight:700; padding:2px 6px; border-radius:10px; color:white; white-space:nowrap; transform:translate(-50%,-100%); }
        .badge.pos { background: var(--accent); }
        .badge.neg { background: var(--muted); }
      </style>
      <ha-card>
        <div class="head">
          <ha-icon icon="mdi:power-plug" style="color:var(--accent); --mdc-icon-size: calc(18px * var(--ha-font-size-scale, 1));"></ha-icon>
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

// ---- www/senselike-cards/senselike-goals-card.js ----
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

// ---- www/senselike-cards/senselike-usage-trend-card.js ----
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
        .label { font-size: calc(12px * var(--ha-font-size-scale, 1)); font-weight:700; letter-spacing:.08em; color: var(--muted); text-transform:uppercase; }
        .chev {
          width:26px; height:26px; border-radius:50%; border:none; cursor:pointer;
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          color: var(--accent); display:flex; align-items:center; justify-content:center;
        }
        .statement { font-size: calc(19px * var(--ha-font-size-scale, 1)); font-weight:600; color: var(--primary-text-color); line-height:1.3; margin-bottom:14px; }
        .legend { display:flex; gap:22px; margin-bottom:8px; }
        .legend-item { display:flex; align-items:center; gap:6px; font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); }
        .dot { width:9px; height:9px; border-radius:50%; }
        .dot.cur { background: var(--accent); }
        .dot.prev { background: var(--muted); opacity:.7; }
        .amt { font-size: calc(20px * var(--ha-font-size-scale, 1)); font-weight:700; font-variant-numeric: tabular-nums; }
        .amt.cur { color: var(--accent); }
        .amt.prev { color: var(--primary-text-color); }
        .chart-wrap { margin-top:6px; }
        svg { width:100%; height:130px; display:block; overflow:visible; }
        .axis { display:flex; justify-content:space-between; font-size: calc(12px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); margin-top:4px; }
        .empty { font-size: calc(13px * var(--ha-font-size-scale, 1)); color: var(--secondary-text-color); padding: 10px 0; }
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

// ---- www/senselike-cards/senselike-timeline-card.js ----
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
