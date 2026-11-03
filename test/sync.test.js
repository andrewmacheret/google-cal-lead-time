const test = require('node:test');
const assert = require('node:assert/strict');
const { load, FIXTURE } = require('./harness');

const NOW = new Date('2026-10-20T12:00:00Z');
const PROPS = { FEED_URL: 'webcal://example.com/ical?k=1', HOME_ADDRESS: '1 Home St, Seattle WA' };

function setup(extraProps = {}, opts = {}) {
  const env = load(opts);
  const base = Object.keys(extraProps).some((k) => /^FEED_URL_/.test(k)) ? { HOME_ADDRESS: PROPS.HOME_ADDRESS } : PROPS;
  const config = env.gs.loadConfig_({ ...base, ...extraProps });
  const run = (o = {}) => env.gs.runSync_(config, { now: o.now || NOW, dryRun: o.dryRun });
  return { ...env, config, run };
}
const byUid = (calendar) => Object.fromEntries(calendar.events.map((e) => [e.getTag('leadTimeUid'), e]));

test('config converts webcal and requires feed + home', () => {
  const { gs } = load();
  assert.equal(gs.loadConfig_(PROPS).feeds[0].url, 'https://example.com/ical?k=1');
  assert.throws(() => gs.loadConfig_({ HOME_ADDRESS: 'x' }), /FEED_URL/);
  assert.throws(() => gs.loadConfig_({ FEED_URL: 'x' }), /HOME_ADDRESS/);
  assert.throws(() => gs.loadConfig_({ ...PROPS, PREP_MINUTES: 'abc' }), /PREP_MINUTES/);
});

test('creates one lead-time event per upcoming game, ending at game start', () => {
  const { run, calendar, state } = setup();
  const result = run();
  assert.deepEqual(state.fetchedUrls, ['https://example.com/ical?k=1']);
  assert.deepEqual([result.created, result.errors.length], [3, 0]);

  const events = byUid(calendar);
  // 1002 is beyond the 21-day lookahead, 1005 is all-day, 1006 is cancelled.
  assert.deepEqual(Object.keys(events).sort(), ['1001@test', '1003@test', '1004@test']);

  const ev = events['1001@test'];
  // 20:55 start - 30 prep = 20:25 arrive; 23 min traffic → 20:02, rounded down → 20:00 PDT.
  assert.equal(ev.start.toISOString(), '2026-10-22T03:00:00.000Z');
  assert.equal(ev.end.toISOString(), '2026-10-22T03:55:00.000Z');
  assert.equal(ev.title, '🚗 Leave for Monarchs 5 vs Black Katz');
  assert.equal(ev.location, '10601 5th Ave NE Seattle WA 98125');
  assert.match(ev.description, /Leave by 8:00 PM \(~23 min drive\) to arrive by 8:25 PM, 30 min before the 8:55 PM start/);
  assert.deepEqual(ev.reminders, [15]);

  const trafficCall = state.mapsCalls.find((c) => c.depart && c.destination === ev.location);
  assert.equal(trafficCall.origin, '1 Home St, Seattle WA');
  assert.equal(trafficCall.depart.toISOString(), '2026-10-22T03:07:00.000Z'); // first guess used 18 min
});

test('second run is a no-op without Maps calls', () => {
  const { run, state } = setup();
  run();
  const calls = state.mapsCalls.length;
  const result = run({ now: new Date(NOW.getTime() + 3600e3) });
  assert.deepEqual([result.created, result.updated, result.unchanged, result.deleted], [0, 0, 3, 0]);
  assert.equal(state.mapsCalls.length, calls);
});

test('refreshes traffic after REFRESH_HOURS', () => {
  let traffic = 23;
  const { run, calendar } = setup({ REFRESH_HOURS: '6' }, { driveMinutes: (d) => (d ? traffic : 18) });
  run();
  traffic = 41;
  const result = run({ now: new Date(NOW.getTime() + 7 * 3600e3) });
  assert.equal(result.updated, 3);
  assert.equal(byUid(calendar)['1001@test'].start.toISOString(), '2026-10-22T02:40:00.000Z'); // 20:25 - 41 → 19:44 → 19:40
});

test('updates when a game moves and deletes when it disappears or is cancelled', () => {
  const { run, calendar, state } = setup();
  run();
  const original = byUid(calendar)['1001@test'];
  state.feed = state.feed
    .replace('DTSTART:20261021T205500', 'DTSTART:20261021T215500')
    .replace('UID:1004@test', 'UID:1004@test\nSTATUS:CANCELLED')
    .replace(/BEGIN:VEVENT\nDTSTART:20261022T191500Z[\s\S]*?END:VEVENT\n/, '');
  const result = run({ now: new Date(NOW.getTime() + 60e3) });
  assert.deepEqual([result.updated, result.deleted], [1, 2]);
  const events = byUid(calendar);
  assert.deepEqual(Object.keys(events), ['1001@test']);
  assert.equal(events['1001@test'], original); // updated in place
  assert.equal(events['1001@test'].start.toISOString(), '2026-10-22T04:00:00.000Z');
});

test('removes duplicate lead-time events for the same game', () => {
  const { run, calendar } = setup();
  run();
  const dup = calendar.createEvent('dup', new Date('2026-10-22T03:00:00Z'), new Date('2026-10-22T03:55:00Z'));
  dup.setTag('leadTimeUid', '1001@test');
  const result = run();
  assert.equal(result.deleted, 1);
  assert.equal(calendar.events.length, 3);
});

test('leaves past and in-progress lead-time events alone', () => {
  const { run, calendar, state } = setup();
  run();
  const ev = byUid(calendar)['1001@test'];
  const computedAt = ev.getTag('leadTimeComputedAt');
  // 20:10 PDT: already past the 20:00 departure, before the 20:55 start, refresh window elapsed.
  run({ now: new Date('2026-10-22T03:10:00Z') });
  assert.equal(ev.start.toISOString(), '2026-10-22T03:00:00.000Z');
  assert.equal(ev.getTag('leadTimeComputedAt'), computedAt);
  // After the game starts it is history: removing the game from the feed must not delete it.
  state.feed = state.feed.replace('UID:1001@test', 'UID:gone@test');
  run({ now: new Date('2026-10-22T04:00:00Z') });
  assert.ok(calendar.events.includes(ev));
});

test('unsuffixed SKIP_PATTERN / INCLUDE_PATTERN apply to FEED_URL', () => {
  let { run, calendar } = setup({ SKIP_PATTERN: 'drop-in' });
  assert.equal(run().skipped, 1);
  assert.ok(!byUid(calendar)['1003@test']);
  ({ run, calendar } = setup({ INCLUDE_PATTERN: 'drop-in' }));
  assert.equal(run().skipped, 2);
  assert.deepEqual(Object.keys(byUid(calendar)), ['1003@test']);
});

test('dry run changes nothing', () => {
  const { run, calendar } = setup();
  const result = run({ dryRun: true });
  assert.equal(result.plans.length, 3);
  assert.equal(calendar.events.length, 0);
});

test('a broken feed throws before touching the calendar', () => {
  const { run, calendar, state } = setup();
  run();
  state.feed = '<html>maintenance</html>';
  assert.throws(() => run(), /iCalendar/);
  state.feedStatus = 500;
  assert.throws(() => run(), /HTTP 500/);
  assert.equal(calendar.events.length, 3);
});

test('a Maps failure for one game is reported without blocking the others', () => {
  const { run, calendar } = setup({}, { driveMinutes: (d, q) => { if (q.destination.includes('Kent')) throw new Error('NOT_FOUND'); return 20; } });
  const result = run();
  assert.equal(result.created, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Flying Monkeys.*NOT_FOUND/);
  assert.equal(calendar.events.length, 2);
});

test('writes to a specific calendar when CALENDAR_ID is set', () => {
  const { run } = setup({ CALENDAR_ID: 'missing@group.calendar.google.com' });
  assert.throws(() => run(), /Calendar not found/);
});

test('config groups numbered feed properties and validates them', () => {
  const { gs } = load();
  const { feeds } = gs.loadConfig_({
    HOME_ADDRESS: 'x',
    FEED_URL_10: 'https://ten', ADJUSTMENT_MINUTES_10: '-15',
    FEED_URL_2: 'webcal://two', INCLUDE_PATTERN_2: 'monarchs|seals', SKIP_PATTERN_2: 'drop-in', ADJUSTMENT_MINUTES_2: '+10',
    FEED_URL: 'https://plain',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(feeds.map((f) => [f.name, f.url, f.adjustmentMinutes]))), [
    ['FEED_URL', 'https://plain', 0],
    ['FEED_URL_2', 'https://two', 10],
    ['FEED_URL_10', 'https://ten', -15],
  ]);
  assert.ok(feeds[1].includePattern.test('Seattle Seals vs X'));
  assert.ok(feeds[1].skipPattern.test('Novice Drop-In Goalie'));
  assert.equal(feeds[0].includePattern, null);

  const base = { HOME_ADDRESS: 'x', FEED_URL_1: 'https://one' };
  assert.throws(() => gs.loadConfig_({ ...base, SKIP_PATTERN_3: 'x' }), /SKIP_PATTERN_3 set but FEED_URL_3 is missing/);
  assert.throws(() => gs.loadConfig_({ ...base, ADJUSTMENT_MINUTES_1: '5.5' }), /ADJUSTMENT_MINUTES_1 must be a whole number/);
  assert.throws(() => gs.loadConfig_({ ...base, INCLUDE_PATTERN_1: '(' }), /INCLUDE_PATTERN_1 is not a valid regular expression/);
  assert.equal(gs.loadConfig_({ ...base, ADJUSTMENT_MINUTES_1: ' ' }).feeds[0].adjustmentMinutes, 0);
});

const TWO_FEEDS = { HOME_ADDRESS: '1 Home St', FEED_URL_1: 'https://one', FEED_URL_2: 'https://two' };
const OTHER_FEED = FIXTURE.replace(/UID:(\d+)@test/g, 'UID:$1@other');

test('merges multiple feeds with per-feed include, skip and adjustment', () => {
  const { run, calendar, state } = setup({
    ...TWO_FEEDS,
    INCLUDE_PATTERN_1: 'monarchs|goalie', SKIP_PATTERN_1: 'drop-in', ADJUSTMENT_MINUTES_1: '10',
    ADJUSTMENT_MINUTES_2: '-20',
  });
  state.feeds = { 'https://one': { text: FIXTURE }, 'https://two': { text: OTHER_FEED } };
  const result = run();
  // Feed 1 keeps only "Monarchs" (goalie matches include but also skip). Feed 2 keeps all 3.
  assert.deepEqual([result.created, result.skipped, result.errors.length], [4, 2, 0]);
  const events = byUid(calendar);
  assert.deepEqual(Object.keys(events).sort(), ['1001@other', '1001@test', '1003@other', '1004@other']);
  // 20:55 start: feed 1 prep 30+10=40 → arrive 20:15, -23 → 19:52 → 19:50 PDT.
  assert.equal(events['1001@test'].start.toISOString(), '2026-10-22T02:50:00.000Z');
  assert.match(events['1001@test'].description, /40 min before the 8:55 PM start/);
  // Feed 2 prep 30-20=10 → arrive 20:45, -23 → 20:22 → 20:20 PDT.
  assert.equal(events['1001@other'].start.toISOString(), '2026-10-22T03:20:00.000Z');
});

test('changing an adjustment updates existing events on the next run', () => {
  const { gs, calendar, state } = setup();
  state.feeds = { 'https://one': { text: FIXTURE } };
  const props = { HOME_ADDRESS: '1 Home St', FEED_URL_1: 'https://one' };
  gs.runSync_(gs.loadConfig_(props), { now: NOW });
  const result = gs.runSync_(gs.loadConfig_({ ...props, ADJUSTMENT_MINUTES_1: '15' }), { now: NOW });
  assert.equal(result.updated, 3);
  assert.equal(byUid(calendar)['1001@test'].start.toISOString(), '2026-10-22T02:45:00.000Z');
});

test('adjustment cannot push arrival after the start', () => {
  const { run, calendar, state } = setup({ ...TWO_FEEDS, ADJUSTMENT_MINUTES_1: '-90' });
  state.feeds = { 'https://one': { text: FIXTURE }, 'https://two': { text: 'BEGIN:VCALENDAR\nEND:VCALENDAR' } };
  run();
  // prep clamps to 0 → arrive 20:55, -23 → 20:32 → 20:30 PDT.
  assert.equal(byUid(calendar)['1001@test'].start.toISOString(), '2026-10-22T03:30:00.000Z');
});

test('an event present in two feeds gets one lead-time event, from the first feed', () => {
  const { run, calendar, state } = setup({ ...TWO_FEEDS, ADJUSTMENT_MINUTES_2: '30' });
  state.feeds = { 'https://one': { text: FIXTURE }, 'https://two': { text: FIXTURE } };
  run();
  assert.equal(calendar.events.length, 3);
  assert.equal(byUid(calendar)['1001@test'].start.toISOString(), '2026-10-22T03:00:00.000Z');
});

test('one broken feed does not block others and deletes nothing', () => {
  const { run, calendar, state } = setup(TWO_FEEDS);
  state.feeds = { 'https://one': { text: FIXTURE }, 'https://two': { text: OTHER_FEED } };
  run();
  assert.equal(calendar.events.length, 6);
  // Feed 2 goes down and feed 1 drops a game: keep everything, report the error.
  state.feeds['https://two'] = { text: 'oops', status: 503 };
  state.feeds['https://one'].text = FIXTURE.replace('UID:1004@test', 'UID:1004-moved@test');
  const result = run();
  assert.equal(result.deleted, 0);
  assert.equal(result.created, 1);
  assert.match(result.errors.join(), /FEED_URL_2: Feed request failed with HTTP 503/);
  assert.equal(calendar.events.length, 7);
  // Once it recovers, the stale event is cleaned up.
  state.feeds['https://two'] = { text: OTHER_FEED };
  assert.equal(run().deleted, 1);
});
