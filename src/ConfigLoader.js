/**
 * Validates SETTINGS (defined in Config.js) and normalizes it for the sync code.
 */
const SETTING_DEFAULTS = {
  FEEDS: [],
  HOME_ADDRESS: '',
  PREP_MINUTES: 30,
  CALENDAR_ID: '',
  LOOKAHEAD_DAYS: 21,
  REFRESH_HOURS: 12,
  ROUND_MINUTES: 5,
  REMINDER_MINUTES: 15,
  TITLE_TEMPLATE: '🚗 Leave for {summary}',
  TIMEZONE: '',
  LOCATION_OVERRIDES: {},
};
const FEED_KEYS = ['URL', 'INCLUDE_PATTERN', 'EXCLUDE_PATTERN', 'ADJUSTMENT_MINUTES'];

function loadConfig_(settings) {
  const raw = Object.assign({}, SETTING_DEFAULTS, settings || {});
  for (const key of Object.keys(settings || {})) {
    if (!(key in SETTING_DEFAULTS)) throw new Error(`Unknown setting ${key}.`);
  }

  const config = {
    feeds: loadFeeds_(raw.FEEDS),
    homeAddress: text_(raw.HOME_ADDRESS),
    prepMinutes: wholeNumber_('PREP_MINUTES', raw.PREP_MINUTES, false) || 0,
    calendarId: text_(raw.CALENDAR_ID),
    lookaheadDays: wholeNumber_('LOOKAHEAD_DAYS', raw.LOOKAHEAD_DAYS, false) || 21,
    refreshHours: wholeNumber_('REFRESH_HOURS', raw.REFRESH_HOURS, false) || 12,
    roundMinutes: wholeNumber_('ROUND_MINUTES', raw.ROUND_MINUTES, false) || 1,
    reminderMinutes: wholeNumber_('REMINDER_MINUTES', raw.REMINDER_MINUTES, false),
    titleTemplate: String(raw.TITLE_TEMPLATE),
    timezone: text_(raw.TIMEZONE),
    locationOverrides: raw.LOCATION_OVERRIDES || {},
  };

  if (!config.homeAddress) throw new Error('Set HOME_ADDRESS in Config.js.');
  if (typeof config.locationOverrides !== 'object' || Array.isArray(config.locationOverrides)) {
    throw new Error('LOCATION_OVERRIDES must be an object like {"Venue name": "street address"}.');
  }
  return config;
}

function loadFeeds_(feeds) {
  if (!Array.isArray(feeds) || !feeds.length) throw new Error('Add at least one feed to FEEDS in Config.js.');
  return feeds.map((feed, i) => {
    const name = `FEEDS[${i}]`;
    if (!feed || typeof feed !== 'object') throw new Error(`${name} must be an object like { URL: '...' }.`);
    for (const key of Object.keys(feed)) {
      if (!FEED_KEYS.includes(key)) throw new Error(`Unknown setting ${name}.${key}; expected one of ${FEED_KEYS.join(', ')}.`);
    }
    const url = text_(feed.URL);
    if (!url) throw new Error(`${name}.URL is missing.`);
    return {
      name,
      url: url.replace(/^webcals?:\/\//i, 'https://'),
      includePattern: pattern_(`${name}.INCLUDE_PATTERN`, feed.INCLUDE_PATTERN),
      excludePattern: pattern_(`${name}.EXCLUDE_PATTERN`, feed.EXCLUDE_PATTERN),
      adjustmentMinutes: wholeNumber_(`${name}.ADJUSTMENT_MINUTES`, feed.ADJUSTMENT_MINUTES, true) || 0,
    };
  });
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Accepts a number or numeric string; blank/null/undefined means "not set" (null). */
function wholeNumber_(key, value, allowNegative) {
  const s = text_(value);
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || (!allowNegative && n < 0)) {
    throw new Error(`${key} must be a ${allowNegative ? '' : 'non-negative '}whole number, got ${JSON.stringify(value)}.`);
  }
  return n;
}

/** Accepts a RegExp or a string (matched case-insensitively); blank means "not set". */
function pattern_(key, value) {
  if (value instanceof RegExp || Object.prototype.toString.call(value) === '[object RegExp]') return value;
  const s = text_(value);
  if (!s) return null;
  try {
    return new RegExp(s, 'i');
  } catch (err) {
    throw new Error(`${key} is not a valid regular expression: ${err.message}`);
  }
}
