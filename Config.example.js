/**
 * Copy this file to src/Config.js and fill it in:
 *
 *   cp Config.example.js src/Config.js
 *
 * src/Config.js is gitignored (it holds your address and private feed keys) but is
 * still pushed to Apps Script by clasp.
 */
const SETTINGS = {
  // One entry per iCal feed. Only URL is required.
  FEEDS: [
    {
      // webcal:// or https://
      URL: 'webcal://example.com/ical?id=123&k=SECRET',
      // Only events whose title matches get a lead-time event. Blank/omitted = all.
      // A string (matched case-insensitively) or a regex literal like /monarchs|seals/i.
      INCLUDE_PATTERN: '',
      // Events whose title matches are ignored. Applied after INCLUDE_PATTERN.
      EXCLUDE_PATTERN: 'Drop-In',
      // Added to PREP_MINUTES for this feed: positive = leave earlier, negative = later.
      ADJUSTMENT_MINUTES: 0,
    },
    // { URL: 'webcal://...', ADJUSTMENT_MINUTES: -10 },
  ],

  // Where you drive from.
  HOME_ADDRESS: '123 Main St, Seattle, WA 98101',
  // Minutes needed at the venue before the event starts (e.g. getting dressed).
  PREP_MINUTES: 30,
  // Calendar to write lead-time events to. '' = your primary calendar.
  CALENDAR_ID: '',
  // Popup reminder this many minutes before you need to leave. null = none.
  REMINDER_MINUTES: 15,
  // Only create lead-time events for games this many days ahead (limits Maps calls).
  LOOKAHEAD_DAYS: 21,
  // Re-check traffic for an unchanged game at most this often.
  REFRESH_HOURS: 12,
  // Round the total lead time (prep + drive) up to a multiple of this many minutes.
  ROUND_MINUTES: 5,
  // Title of the lead-time event. {summary} is replaced with the game title.
  TITLE_TEMPLATE: '🚗 Leave for {summary}',
  // Time zone for feed times that have none. '' = each feed's X-WR-TIMEZONE.
  TIMEZONE: '',
  // Substring of an event's LOCATION → address to drive to, if Maps picks the wrong place.
  LOCATION_OVERRIDES: {
    // 'Olympic View Arena': '7012 220th St SW, Mountlake Terrace, WA 98043',
  },
};
