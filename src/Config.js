/**
 * Settings are read from Script Properties (Project Settings → Script properties)
 * so that personal values like your address and feed key never live in source.
 * Anything not set there falls back to these defaults.
 */
const DEFAULTS = {
  // Required: iCal feed URL (webcal:// or https://).
  FEED_URL: '',
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
  // Optional regex; events whose title matches are ignored (e.g. "Drop-In").
  SKIP_PATTERN: '',
  // Used for feed times that have no time zone; defaults to the feed's X-WR-TIMEZONE.
  TIMEZONE: '',
  // Optional JSON object mapping a substring of LOCATION to an address to drive to,
  // e.g. {"Olympic View Arena": "7012 220th St SW, Mountlake Terrace, WA 98043"}.
  LOCATION_OVERRIDES: '{}',
};

function loadConfig_(props) {
  const raw = Object.assign({}, DEFAULTS, props || {});
  const int = (key) => {
    const value = String(raw[key]).trim();
    if (value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Setting ${key} must be a non-negative number, got "${raw[key]}"`);
    return n;
  };

  const config = {
    feedUrl: String(raw.FEED_URL).trim().replace(/^webcals?:\/\//i, 'https://'),
    homeAddress: String(raw.HOME_ADDRESS).trim(),
    prepMinutes: int('PREP_MINUTES') || 0,
    calendarId: String(raw.CALENDAR_ID).trim(),
    lookaheadDays: int('LOOKAHEAD_DAYS') || 21,
    refreshHours: int('REFRESH_HOURS') || 12,
    roundMinutes: int('ROUND_MINUTES') || 1,
    reminderMinutes: int('REMINDER_MINUTES'),
    titleTemplate: String(raw.TITLE_TEMPLATE),
    skipPattern: String(raw.SKIP_PATTERN).trim() ? new RegExp(raw.SKIP_PATTERN, 'i') : null,
    timezone: String(raw.TIMEZONE).trim(),
    locationOverrides: JSON.parse(String(raw.LOCATION_OVERRIDES).trim() || '{}'),
  };

  if (!config.feedUrl) throw new Error('Missing FEED_URL script property.');
  if (!config.homeAddress) throw new Error('Missing HOME_ADDRESS script property.');
  return config;
}
