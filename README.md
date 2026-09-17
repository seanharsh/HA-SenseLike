# SenseLike — Sense-style Lovelace cards for Home Assistant

Five custom Lovelace cards that mimic the look and feel of the Sense energy
app, built from scratch (no HACS dependencies). Each card is a standalone
web component and works with **any** power/energy entity — the official
Sense integration, MQTT sensors, or anything else that shows up in
Home Assistant.

By default every card uses Home Assistant's own theme blue
(`var(--primary-color)`) as the "current / you" accent instead of Sense's
orange, with a muted secondary tone for comparison/background data. Both
are overridable per-card.

> These cards use the CSS `color-mix()` function for tinted backgrounds,
> which needs a fairly current browser/WebView (Chrome/Edge 111+, Safari
> 16.2+). This covers all current HA companion apps and browsers as of 2026.

## Cards

| File | `type:` | Mimics |
|---|---|---|
| `senselike-usage-trend-card.js` | `custom:senselike-usage-trend-card` | Dashboard → **Usage**: this month vs. last month cumulative cost/energy line chart |
| `senselike-compare-card.js` | `custom:senselike-compare-card` | Dashboard → **Compare**: low/mid/high usage bucket bar vs. your average |
| `senselike-goals-card.js` | `custom:senselike-goals-card` | Dashboard → **Goals**: progress bars with a "NOW" time marker and trend projection |
| `senselike-power-meter-card.js` | `custom:senselike-power-meter-card` | **Meter** tab: live power area chart with MIN/HR/DAY/WK/MO range tabs |
| `senselike-device-bubbles-card.js` | `custom:senselike-device-bubbles-card` | **Now** tab: circle-packed device bubble chart + today's event timeline |

## Install

1. Copy the `www/senselike-cards/` folder into your Home Assistant `config/www/` directory (so files live at `config/www/senselike-cards/*.js`).
2. In **Settings → Dashboards → Resources**, add each file as a **JavaScript Module**:
   - `/local/senselike-cards/senselike-usage-trend-card.js`
   - `/local/senselike-cards/senselike-compare-card.js`
   - `/local/senselike-cards/senselike-goals-card.js`
   - `/local/senselike-cards/senselike-power-meter-card.js`
   - `/local/senselike-cards/senselike-device-bubbles-card.js`
3. Add cards to a dashboard in YAML mode (see `example-dashboard.yaml`), or via the card picker (each card registers itself under "Custom: SenseLike …").

Notes:
- `senselike-usage-trend-card` and the DAY/WK/MO tabs of `senselike-power-meter-card` read from Home Assistant's **long-term statistics** (`recorder/statistics_during_period`), so the source entity needs a numeric `state_class` (`total_increasing`/`total`/`measurement`) with statistics enabled — true for essentially any Energy-dashboard-compatible sensor (Sense, MQTT with a `state_class`, utility meters, etc.).
- `senselike-device-bubbles-card`'s timeline uses the Logbook API for the configured device entities.
- No visual (GUI) config editor is included — configure cards in YAML mode.

## Configuration reference

### `senselike-usage-trend-card`
```yaml
type: custom:senselike-usage-trend-card
title: Usage
entity: sensor.home_energy_cost   # cumulative cost or energy sensor with long-term statistics
unit: "$"
decimals: 0
accent_color: var(--primary-color)     # optional
muted_color: var(--secondary-text-color) # optional
```

### `senselike-compare-card`
```yaml
type: custom:senselike-compare-card
title: Compare
entity: sensor.average_power
unit: W
low_threshold: 990
high_threshold: 2000
sample_size: 60
sample_label: neighboring homes
days: 30
percentile_entity: sensor.sense_percentile  # optional 0-100 value
```

### `senselike-goals-card`
```yaml
type: custom:senselike-goals-card
title: Goals
goals:
  - section: Today          # optional section header, printed once per new value
    name: Usage
    icon: mdi:power-plug
    entity: sensor.energy_today   # cumulative kWh in the period
    target: 30
    unit: kWh
    period: day              # day | week | month
```

### `senselike-power-meter-card`
```yaml
type: custom:senselike-power-meter-card
title: Meter
entity: sensor.house_power        # instantaneous power (W)
price_per_kwh: 0.14
price_entity: sensor.electricity_price  # optional, overrides price_per_kwh
```

### `senselike-device-bubbles-card`
```yaml
type: custom:senselike-device-bubbles-card
title: Now
cost_entity: sensor.energy_cost_today
current_power_entity: sensor.house_power
compare_text: This is a bit more than on recent Tuesdays.
show_timeline: true
timeline_entities: []   # optional; defaults to the devices list
devices:
  - entity: sensor.fridge_power
    name: Fridge
```

See `example-dashboard.yaml` for a full three-view dashboard (Now / Dashboard / Meter) wiring all five cards together.
