# Changelog

## [Unreleased]

### Fixed
- Usage trend card: "% more/less than last month" now compares against last month at the same day and hour, instead of against that whole day (it read too low, especially early in the month).

## [0.2.0] - 2026-11-04

### Added
- Cards now show a live preview in the Lovelace card picker.
- Cards define default grid sizing, so sections dashboards no longer warn that they don't support resizing.

### Fixed
- Power meter card: date and range tabs no longer wrap or overflow when the card is narrow.

## [0.1.1] - 2026-10-19

### Fixed
- `dist/senselike-cards.js` failed to load as a JavaScript module (duplicate top-level
  `resolveDeviceList`), so no cards registered. `dist/build.sh` now wraps each card file in its
  own block scope and syntax-checks the bundle as a module on every build.

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

### Changed
- Cards are now published as a single bundled `dist/senselike-cards.js` (concatenation of
  `www/senselike-cards/*.js`, regenerated via `dist/build.sh`), matching HACS's single-resource
  plugin structure. Manual installs now add one resource instead of five.

### Requirements
- Home Assistant 2024.6.0+
- Modern browser with CSS `color-mix()` support (Chrome/Edge 111+, Safari 16.2+)
- For usage/power-meter cards: entities with long-term statistics enabled
- For device-bubbles card: Logbook API access