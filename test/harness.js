const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.ics'), 'utf8');

class FakeEvent {
  constructor(calendar, title, start, end, opts) {
    Object.assign(this, { calendar, title, start, end, tags: {}, reminders: ['default'] });
    this.location = (opts && opts.location) || '';
    this.description = (opts && opts.description) || '';
  }
  getTag(k) { return this.tags[k] === undefined ? null : this.tags[k]; }
  setTag(k, v) { this.tags[k] = v; return this; }
  getStartTime() { return this.start; }
  getEndTime() { return this.end; }
  setTime(s, e) { this.start = s; this.end = e; return this; }
  setTitle(t) { this.title = t; return this; }
  setLocation(l) { this.location = l; return this; }
  setDescription(d) { this.description = d; return this; }
  removeAllReminders() { this.reminders = []; return this; }
  addPopupReminder(m) { this.reminders.push(m); return this; }
  deleteEvent() { this.calendar.events = this.calendar.events.filter((e) => e !== this); }
}

class FakeCalendar {
  constructor() { this.events = []; }
  createEvent(title, start, end, opts) {
    const ev = new FakeEvent(this, title, start, end, opts);
    this.events.push(ev);
    return ev;
  }
  getEvents(start, end) { return this.events.filter((e) => e.start < end && e.end > start); }
}

/**
 * Loads src/*.js into a sandbox with fake Apps Script services.
 * `driveMinutes(departAt)` controls the fake Directions result.
 */
function load(opts = {}) {
  const calendar = opts.calendar || new FakeCalendar();
  const state = { feed: opts.feed || FIXTURE, feedStatus: 200, feeds: {}, fetchedUrls: [], mapsCalls: [], calendar };
  const driveMinutes = opts.driveMinutes || ((departAt) => (departAt ? 23 : 18));

  const Maps = {
    DirectionFinder: { Mode: { DRIVING: 'driving' } },
    newDirectionFinder() {
      const q = {};
      const finder = {
        setOrigin(o) { q.origin = o; return finder; },
        setDestination(d) { q.destination = d; return finder; },
        setMode(m) { q.mode = m; return finder; },
        setDepart(d) { q.depart = d; return finder; },
        getDirections() {
          state.mapsCalls.push(q);
          const seconds = driveMinutes(q.depart || null, q) * 60;
          const leg = { duration: { value: seconds - 120 } };
          if (q.depart) leg.duration_in_traffic = { value: seconds };
          else leg.duration.value = seconds;
          return { status: 'OK', routes: [{ legs: [leg] }] };
        },
      };
      return finder;
    },
  };

  const context = vm.createContext({
    console,
    Intl,
    Maps,
    UrlFetchApp: {
      fetch(url) {
        state.fetchedUrls.push(url);
        const feed = state.feeds[url] || { text: state.feed, status: state.feedStatus };
        return { getResponseCode: () => feed.status || 200, getContentText: () => feed.text };
      },
    },
    CalendarApp: {
      getDefaultCalendar: () => calendar,
      getCalendarById: (id) => (id === 'known@group.calendar.google.com' ? calendar : null),
    },
  });
  for (const file of ['ConfigLoader.js', 'Ical.js', 'Sync.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), context, { filename: file });
  }
  return { gs: context, state, calendar };
}

module.exports = { load, FakeCalendar, FIXTURE };
