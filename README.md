# SenseLike Cards for Home Assistant

Lovelace dashboard cards styled after the Sense energy monitoring app. Track home energy use,
live power (W), kWh usage and cost, device-level consumption, usage goals and on/off activity,
all on your Home Assistant dashboard, from the Sense integration or any power/energy sensor.

- **Theme-aware** — uses your Home Assistant theme colors (customizable per-card)
- **Works with anything** — Sense integration, MQTT sensors, utility meters, or any Home Assistant entity
- **Modern browser** — requires CSS `color-mix()` support (Chrome/Edge 111+, Safari 16.2+, all current HA apps)

## Cards at a Glance

### Device Bubbles — `senselike-device-bubbles-card`
Circle-packed bubble chart showing power consumption per device, with today's activity timeline. Perfect for understanding which devices are using the most energy right now.

![Device Bubbles Card](docs/card-1-device-bubbles.png)

### Power Meter — `senselike-power-meter-card`
Live instantaneous power display with area chart. Switch between MIN/HR/DAY/WK/MO views to see power trends at different timescales, with automatic cost calculation.

![Power Meter Card](docs/card-2-power-meter.png)

### Goals — `senselike-goals-card`
Progress bars for energy targets (daily, weekly, monthly). Shows current usage, target goal, and trend projection to help you stay on track.

![Goals Card](docs/card-3-goals.png)

### Usage Trend — `senselike-usage-trend-card`
Compare this month vs. last month cumulative energy or cost with a line chart. See at a glance whether you're using more or less than last month.

![Usage Trend Card](docs/card-4-usage-trend.png)

### Timeline — `senselike-timeline-card`
Chronological event log showing device on/off events throughout the day. Understand exactly when devices turned on and off and track patterns in your home's activity.

![Timeline Card](docs/card-5-timeline.png)

## Finding the cards

| You're looking for | Search for | Card |
|---|---|---|
| What's using power right now, per device | "SenseLike Device Bubbles", "bubbles" | `senselike-device-bubbles-card` |
| Live watts and cost over time | "SenseLike Power Meter", "meter" | `senselike-power-meter-card` |
| Daily/monthly energy targets | "SenseLike Goals", "goals" | `senselike-goals-card` |
| This month vs. last month | "SenseLike Usage Trend", "usage" | `senselike-usage-trend-card` |
| Device on/off history | "SenseLike Timeline", "timeline" | `senselike-timeline-card` |

- **In HACS:** search for "SenseLike".
- **In the dashboard editor:** **Edit dashboard → Add card → By card**, then type "SenseLike"
  in the **Search cards** box. The cards appear under custom/community cards with a live
  preview and a visual editor, so no YAML is needed.

## Installation

### Via HACS (recommended)

1. Open **HACS** from the Home Assistant sidebar
2. Search for "SenseLike" and select **SenseLike Cards**, then **Download**
   - If it doesn't show up in search, open the ⋮ menu → **Custom repositories**, add
     `https://github.com/seanharsh/HA-SenseLike` with type **Dashboard**, then search again
3. Restart Home Assistant (or reload the browser) so the dashboard resource is picked up
4. Add a card: **Edit dashboard → Add card → By card → search "SenseLike"**

### Manual

1. Copy `dist/senselike-cards.js` into your Home Assistant `config/www/` directory
2. In **Settings → Dashboards → Resources**, add as **JavaScript Module**:
   - `/local/senselike-cards.js`
3. Add cards from **Edit dashboard → Add card → By card → search "SenseLike"**, or in YAML
   (see `example-dashboard.yaml`)

## Requirements

- **Home Assistant** 2024.6.0+
- **Browser/WebView** supporting CSS `color-mix()` (Chrome/Edge 111+, Safari 16.2+, all current HA apps)
- **For trend/meter cards**: entities with [long-term statistics](https://www.home-assistant.io/docs/energy/statistics/) enabled
- **For device timeline**: [Logbook](https://www.home-assistant.io/integrations/logbook/) integration enabled

## Quick Config Examples

**Device Bubbles** — show what's using power right now:
```yaml
type: custom:senselike-device-bubbles-card
title: Now
cost_entity: sensor.energy_cost_today
current_power_entity: sensor.house_power
devices:
  - entity: sensor.fridge_power
    name: Fridge
  - entity: sensor.hvac_power
    name: HVAC
```

**Power Meter** — live power + cost tracking:
```yaml
type: custom:senselike-power-meter-card
title: Meter
entity: sensor.house_power      # instantaneous power (W)
price_per_kwh: 0.14
```

**Goals** — track usage targets:
```yaml
type: custom:senselike-goals-card
title: Goals
goals:
  - name: Daily Usage
    entity: sensor.energy_today
    target: 30
    unit: kWh
    period: day
```

**Usage Trend** — month-over-month comparison:
```yaml
type: custom:senselike-usage-trend-card
title: Usage
entity: sensor.home_energy_cost  # with long-term statistics
unit: "$"
decimals: 0
```

See [`example-dashboard.yaml`](example-dashboard.yaml) for a complete working example.
