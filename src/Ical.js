/**
 * Minimal iCalendar (RFC 5545) parsing: just enough for VEVENTs from typical
 * league/rink scheduling feeds.
 */
function parseIcal_(text, fallbackTimezone) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let calendarTimezone = '';
  const rawEvents = [];
  let current = null;

  for (const line of lines) {
    if (!line) continue;
    const prop = parseContentLine_(line);
    if (!prop) continue;

    if (prop.name === 'BEGIN' && prop.value === 'VEVENT') {
      current = {};
    } else if (prop.name === 'END' && prop.value === 'VEVENT') {
      if (current) rawEvents.push(current);
      current = null;
    } else if (current) {
      if (!(prop.name in current)) current[prop.name] = prop;
    } else if (prop.name === 'X-WR-TIMEZONE') {
      calendarTimezone = prop.value.trim();
    }
  }

  const timezone = fallbackTimezone || calendarTimezone || 'UTC';
  const events = [];
  for (const raw of rawEvents) {
    if (!raw.UID || !raw.DTSTART) continue;
    const start = parseIcalDate_(raw.DTSTART, timezone);
    if (!start) continue; // all-day or unparseable
    let end = raw.DTEND ? parseIcalDate_(raw.DTEND, timezone) : null;
    if (!end || end <= start) end = new Date(start.getTime());
    events.push({
      uid: raw.UID.value.trim(),
      summary: unescapeText_(raw.SUMMARY ? raw.SUMMARY.value : '').trim(),
      location: unescapeText_(raw.LOCATION ? raw.LOCATION.value : '').replace(/\s+/g, ' ').trim(),
      status: raw.STATUS ? raw.STATUS.value.trim().toUpperCase() : '',
      start,
      end,
    });
  }
  return { timezone, events };
}

function parseContentLine_(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      const head = line.slice(0, i).split(';');
      const params = {};
      for (const p of head.slice(1)) {
        const eq = p.indexOf('=');
        if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
      }
      return { name: head[0].toUpperCase(), params, value: line.slice(i + 1) };
    }
  }
  return null;
}

function unescapeText_(value) {
  return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Returns a Date, or null for all-day (DATE) values. */
function parseIcalDate_(prop, defaultTimezone) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(prop.value.trim());
  if (!m || prop.params.VALUE === 'DATE') return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (m[7] === 'Z') return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return zonedTimeToDate_(y, mo, d, h, mi, s, prop.params.TZID || defaultTimezone);
}

/** Converts a wall-clock time in an IANA time zone to an absolute Date. */
function zonedTimeToDate_(y, mo, d, h, mi, s, timezone) {
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const firstOffset = timezoneOffsetMs_(new Date(wallAsUtc), timezone);
  let t = wallAsUtc - firstOffset;
  const secondOffset = timezoneOffsetMs_(new Date(t), timezone);
  if (secondOffset !== firstOffset) t = wallAsUtc - secondOffset;
  return new Date(t);
}

function timezoneOffsetMs_(date, timezone) {
  if (typeof Utilities !== 'undefined') {
    const z = Utilities.formatDate(date, timezone, 'Z'); // e.g. "-0700"
    const sign = z[0] === '-' ? -1 : 1;
    return sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60000;
  }
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).forEach((p) => { parts[p.type] = Number(p.value); });
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Pulls a drivable street address out of a LOCATION string such as
 * "Kraken Community Iceplex on Smartsheet Rink 2 - B 10601 5th Ave NE Seattle WA 98125".
 * The street number is taken to be the first number followed by a street-name-like
 * token (not another bare number or a dash), so "Rink 2" isn't mistaken for it.
 */
function extractAddress_(location, overrides) {
  for (const key of Object.keys(overrides || {})) {
    if (location.toLowerCase().includes(key.toLowerCase())) return overrides[key];
  }
  const tokens = location.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (/^\d+[A-Za-z]?$/.test(tokens[i]) && /^[A-Za-z0-9]/.test(tokens[i + 1]) && !/^\d+$/.test(tokens[i + 1])) {
      return tokens.slice(i).join(' ');
    }
  }
  return location;
}
