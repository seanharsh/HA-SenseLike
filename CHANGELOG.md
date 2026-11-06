# Changelog

## [Unreleased]

### Fixed
- Usage trend card: "% more/less than last month" now compares against last month at the same day and hour, instead of against that whole day (it read too low, especially early in the month).
- Usage trend card: days where a cost or net-energy statistic went down (negative prices, export credits) are no longer counted as zero, so month totals match; the chart scales below zero when needed.
- Device bubbles card: new `price_entity` option prices each hour of today at that hour's actual price, so the headline cost is right for time-of-use, dynamic and tiered tariffs (a fixed `rate` is only correct for a flat tariff).
- Power meter card: while power is negative (exporting to the grid), the cost rate uses the new `export_price_per_kwh` / `export_price_entity` instead of the import price, and is hidden if no export price is set. Negative amounts show as `-12¢/hr` / `-$1.04/hr`.
- Power meter card: the +/- badges are measured against the time-weighted average power, so sensors that only report on change no longer skew them.
- Goals card: the NOW marker and "trending to" projection use the real length of the day, week or month, so DST days (23/25 h) and the months around them are no longer off.
- Device bubbles card: the "more/less than on recent <weekday>s" line compares against the same point in the day on those days, instead of counting their whole current hour.
- Power meter card: the WK and MO ranges start on a Monday / the 1st of a month, so the first point is a whole week or month instead of a partial one.

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