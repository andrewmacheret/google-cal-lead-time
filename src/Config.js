/**
 * Settings are read from Script Properties (Project Settings → Script properties)
 * so that personal values like your address and feed keys never live in source.
 *
 * Feeds are configured as groups of properties sharing a suffix, e.g.
 *   FEED_URL_1, INCLUDE_PATTERN_1, SKIP_PATTERN_1, ADJUSTMENT_MINUTES_1
 *   FEED_URL_2, ...
 * An unsuffixed FEED_URL (with INCLUDE_PATTERN, SKIP_PATTERN, ADJUSTMENT_MINUTES) also works.
 *
 * Everything else is global; anything not set falls back to these defaults.
 */
const DEFAULTS = {
  // Required: where you drive from.
  HOME_ADDRESS: '',
  // Minutes needed at the venue before the event starts (e.g. getting dressed).
  PREP_MINUTES: '30',
  // Calendar to write lead-time events to. Blank = your primary calendar.
  CALENDAR_ID: '',
  // Only create lead-time events for games this many days ahead (limits Maps calls).
  LOOKAHEAD_DAYS: '21',
  // Re-check traffic for an unchanged game at most this often.
  REFRESH_HOURS: '12',
  // Round the departure time down to a multiple of this many minutes.
  ROUND_MINUTES: '5',
  // Popup reminder this many minutes before you need to leave. Blank = none.
  REMINDER_MINUTES: '15',
  // Title of the lead-time event. {summary} is replaced with the game title.
  TITLE_TEMPLATE: '🚗 Leave for {summary}',
  // Used for feed times that have no time zone; defaults to each feed's X-WR-TIMEZONE.
  TIMEZONE: '',
  // Optional JSON object mapping a substring of LOCATION to an address to drive to,
  // e.g. {"Olympic View Arena": "7012 220th St SW, Mountlake Terrace, WA 98043"}.
  LOCATION_OVERRIDES: '{}',
};

const FEED_PROPERTY = /^(FEED_URL|INCLUDE_PATTERN|SKIP_PATTERN|ADJUSTMENT_MINUTES)(_\w+)?$/;

function loadConfig_(props) {
  const raw = Object.assign({}, DEFAULTS, props || {});
  const number = (key, value, opts) => {
    const text = String(value).trim();
    if (text === '') return null;
    const n = Number(text);
    if (!Number.isInteger(n) || (!opts.allowNegative && n < 0)) {
      throw new Error(`Setting ${key} must be a ${opts.allowNegative ? '' : 'non-negative '}whole number, got "${value}"`);
    }
    return n;
  };
  const int = (key) => number(key, raw[key], {});
  const regex = (key, value) => {
    const text = String(value).trim();
    if (!text) return null;
    try {
      return new RegExp(text, 'i');
    } catch (err) {
      throw new Error(`Setting ${key} is not a valid regular expression: ${err.message}`);
    }
  };

  const config = {
    feeds: loadFeeds_(props || {}, number, regex),
    homeAddress: String(raw.HOME_ADDRESS).trim(),
    prepMinutes: int('PREP_MINUTES') || 0,
    calendarId: String(raw.CALENDAR_ID).trim(),
    lookaheadDays: int('LOOKAHEAD_DAYS') || 21,
    refreshHours: int('REFRESH_HOURS') || 12,
    roundMinutes: int('ROUND_MINUTES') || 1,
    reminderMinutes: int('REMINDER_MINUTES'),
    titleTemplate: String(raw.TITLE_TEMPLATE),
    timezone: String(raw.TIMEZONE).trim(),
    locationOverrides: JSON.parse(String(raw.LOCATION_OVERRIDES).trim() || '{}'),
  };

  if (!config.homeAddress) throw new Error('Missing HOME_ADDRESS script property.');
  return config;
}

function loadFeeds_(props, number, regex) {
  const groups = {};
  for (const key of Object.keys(props)) {
    const m = FEED_PROPERTY.exec(key);
    if (!m) continue;
    const suffix = m[2] || '';
    (groups[suffix] = groups[suffix] || {})[m[1]] = props[key];
  }

  const suffixes = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const feeds = [];
  for (const suffix of suffixes) {
    const group = groups[suffix];
    const name = `FEED_URL${suffix}`;
    const url = String(group.FEED_URL || '').trim();
    if (!url) {
      const orphans = Object.keys(group).map((k) => k + suffix).join(', ');
      throw new Error(`${orphans} set but ${name} is missing.`);
    }
    feeds.push({
      name,
      url: url.replace(/^webcals?:\/\//i, 'https://'),
      includePattern: regex(`INCLUDE_PATTERN${suffix}`, group.INCLUDE_PATTERN || ''),
      skipPattern: regex(`SKIP_PATTERN${suffix}`, group.SKIP_PATTERN || ''),
      adjustmentMinutes: number(`ADJUSTMENT_MINUTES${suffix}`, group.ADJUSTMENT_MINUTES || '', { allowNegative: true }) || 0,
    });
  }
  if (!feeds.length) throw new Error('Missing FEED_URL script property (or FEED_URL_1, FEED_URL_2, ...).');
  return feeds;
}
