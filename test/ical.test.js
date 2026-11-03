const test = require('node:test');
const assert = require('node:assert/strict');
const { load, FIXTURE } = require('./harness');

const { gs } = load();

test('parses events, honoring floating, UTC, TZID times and skipping all-day', () => {
  const { timezone, events } = gs.parseIcal_(FIXTURE, '');
  assert.equal(timezone, 'America/Los_Angeles');
  const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
  assert.deepEqual(Object.keys(byUid).sort(), ['1001@test', '1002@test', '1003@test', '1004@test', '1006@test']);
  assert.equal(byUid['1001@test'].start.toISOString(), '2026-10-22T03:55:00.000Z'); // PDT
  assert.equal(byUid['1001@test'].end.toISOString(), '2026-10-22T05:10:00.000Z');
  assert.equal(byUid['1002@test'].start.toISOString(), '2026-12-11T03:00:00.000Z'); // PST
  assert.equal(byUid['1003@test'].start.toISOString(), '2026-10-22T19:15:00.000Z');
  assert.equal(byUid['1004@test'].start.toISOString(), '2026-10-24T00:00:00.000Z'); // EDT
  assert.equal(byUid['1006@test'].status, 'CANCELLED');
});

test('unfolds lines, unescapes text and collapses whitespace', () => {
  const e = gs.parseIcal_(FIXTURE, '').events.find((x) => x.uid === '1002@test');
  assert.equal(e.summary, 'Seals vs Trash Pandas, Garbage Legacy');
  assert.equal(e.location, 'Kraken Leagues on Olympic View Arena 7012 220th St SW Mountlake Terrace WA 98043');
});

test('extracts street addresses from venue-prefixed locations', () => {
  const cases = {
    'Kraken Community Iceplex on Smartsheet Rink 2 10601 5th Ave NE Seattle WA 98125': '10601 5th Ave NE Seattle WA 98125',
    'Kraken Community Iceplex on Smartsheet Rink 2 - C 10601 5th Ave NE Seattle WA 98125': '10601 5th Ave NE Seattle WA 98125',
    'Kraken Community Iceplex on VMFH Rink 3 10601 5th Ave NE Seattle WA 98125': '10601 5th Ave NE Seattle WA 98125',
    'Kraken Leagues on Kent Valley Ice Centre 6015 S 240th St Kent WA 98032': '6015 S 240th St Kent WA 98032',
    'Kraken Leagues on Olympic View Arena 7012 220th St SW Mountlake Terrace WA 98043': '7012 220th St SW Mountlake Terrace WA 98043',
    'Kraken Leagues on accesso Showare center 625 W James St Kent WA 98032': '625 W James St Kent WA 98032',
    'Kraken Leagues on Lynnwood Ice Center 19803 68th Ave W Lynnwood WA 98036': '19803 68th Ave W Lynnwood WA 98036',
    'Kraken Leagues on Everett Community Ice 2000 Hewitt Ave Everett WA 98201': '2000 Hewitt Ave Everett WA 98201',
    'Some Park': 'Some Park',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(gs.extractAddress_(input, {}), expected, input);
});

test('location overrides win, case-insensitively', () => {
  assert.equal(gs.extractAddress_('Kraken Leagues on Olympic View Arena 7012 ...', { 'olympic view': 'OVA' }), 'OVA');
});
