# Changelog

## [Unreleased]

## [0.1.0] - 2026-09-20

### Added
- Initial release of SenseLike custom Lovelace cards
- `senselike-usage-trend-card`: Dashboard → Usage card (monthly cumulative comparison)
- `senselike-goals-card`: Dashboard → Goals card (progress bars with trend projection)
- `senselike-power-meter-card`: Meter tab card (live power area chart with time ranges)
- `senselike-device-bubbles-card`: Now tab card (device bubble chart + timeline)
- Support for any power/energy entity (Sense integration, MQTT, statistics-backed sensors)
- Themeable accent and muted colors (defaults to HA primary color)
- No HACS dependencies required
- Example dashboard configuration included

### Requirements
- Home Assistant 2024.6.0+
- Modern browser with CSS `color-mix()` support (Chrome/Edge 111+, Safari 16.2+)
- For usage/power-meter cards: entities with long-term statistics enabled
- For device-bubbles card: Logbook API access