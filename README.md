# google-cal-lead-time

A Google Apps Script that watches one or more iCal feeds (for example, hockey league schedules) and adds a
**"🚗 Leave for …"** event to your Google Calendar before each game. Each block starts when you need
to leave home and ends when the game starts:

```
leave = game start − prep time − driving time (with predicted traffic)
```

It runs hourly on Google's servers, so you don't need your own server and your computer doesn't need
to be on. When a game moves, the lead-time event moves with it. When a game is cancelled or removed
from the feed, its lead-time event is deleted.

## How it works

1. Downloads each feed and finds games within the next `LOOKAHEAD_DAYS` that pass that feed's
   include and skip patterns.
2. Gets the street address from each event's `LOCATION`. For example,
   `Kraken Community Iceplex on Smartsheet Rink 2 10601 5th Ave NE Seattle WA 98125` becomes
   `10601 5th Ave NE Seattle WA 98125`.
3. Uses the built-in Apps Script Maps service to estimate the drive. It makes a first estimate,
   then asks again for the traffic predicted at that departure time.
4. Creates or updates one tagged event per game, ending at the game's start time.
5. Re-checks traffic for each game every `REFRESH_HOURS` (or sooner if the game changes). It stops
   updating an event once its departure time has passed.

## Install

No git or command line needed.

### 1. Add the code

1. Download **`Code.gs`** and **`Config.gs`** from the
   [latest release](https://github.com/andrewmacheret/google-cal-lead-time/releases/latest).
2. Go to <https://script.google.com>, click **New project**, and rename it to `google-cal-lead-time`.
3. Replace everything in the default `Code.gs` file with the contents of the downloaded `Code.gs`.
4. Click **+ → Script**, name it `Config`, and paste in the contents of `Config.gs`.
5. Optional: under **Project Settings** (gear icon), set **Time zone** to yours. This only affects
   times shown in the logs.

### 2. Configure

Edit the `Config` file. It defines one `SETTINGS` object:

```js
const SETTINGS = {
  FEEDS: [
    { URL: 'webcal://…', EXCLUDE_PATTERN: 'Drop-In' },
    { URL: 'webcal://…', INCLUDE_PATTERN: /monarchs|seals/i, ADJUSTMENT_MINUTES: -10 },
  ],
  HOME_ADDRESS: '123 Main St, Seattle, WA 98101',
  PREP_MINUTES: 30,
  // …
};
```

#### Feed settings (each entry in `FEEDS`)

| Key | Required | Example | Meaning |
| --- | --- | --- | --- |
| `URL` | ✅ | `'webcal://sportsix.sports-it.com/ical?cid=…&id=…&k=…'` | iCal feed (`webcal://` or `https://`) |
| `INCLUDE_PATTERN` | | `'Monarchs\|Seals'` or `/monarchs\|seals/i` | Only events whose title matches get a lead-time event. Blank or omitted means all. |
| `EXCLUDE_PATTERN` | | `'Drop-In'` | Events whose title matches are ignored. Applied after `INCLUDE_PATTERN`. |
| `ADJUSTMENT_MINUTES` | | `10` or `-15` | Added to `PREP_MINUTES` for this feed. Positive means leave earlier, negative means later. Omitted means `0`. |

Patterns given as strings are case-insensitive regexes. A total prep time below zero counts as zero,
so you never arrive after the start. If the same event (same UID) appears in more than one feed, it
gets one lead-time event, using the first feed in the list that includes it.

#### Global settings

| Key | Required | Example | Default |
| --- | --- | --- | --- |
| `HOME_ADDRESS` | ✅ | `'123 Main St, Seattle, WA 98101'` | |
| `PREP_MINUTES` | | `30`: time at the rink before the game starts | `30` |
| `CALENDAR_ID` | | `'abc123@group.calendar.google.com'` | `''` (primary calendar) |
| `REMINDER_MINUTES` | | `15`: popup this long before you need to leave; `null` for none | `15` |
| `LOOKAHEAD_DAYS` | | `21` | `21` |
| `REFRESH_HOURS` | | `12` | `12` |
| `ROUND_MINUTES` | | `5`: prep + drive is rounded up to a multiple of this (30 + 31 → 65 min) | `5` |
| `TITLE_TEMPLATE` | | `'🚗 Leave for {summary}'` | `'🚗 Leave for {summary}'` |
| `LOCATION_OVERRIDES` | | `{ 'Olympic View': '7012 220th St SW, Mountlake Terrace, WA' }` | `{}` |
| `TIMEZONE` | | `'America/Los_Angeles'`, for feed times without a time zone | feed's `X-WR-TIMEZONE` |

Misspelled or unknown keys cause an error, so a typo can't be silently ignored.

> **Tip:** Consider making a separate Google Calendar (for example, "Hockey travel") and putting its ID
> in `CALENDAR_ID`. You can find the ID under Google Calendar → Settings → *your calendar* →
> **Integrate calendar**. With a separate calendar, you can show, hide, or delete all lead-time
> events at once.

### 3. Preview, then turn it on

Save the project (**⌘S** or **Ctrl+S**), then:

1. In the function dropdown, choose **`previewLeadTimes`** → **Run**. The first time, Google asks you
   to authorize the script. Because this is your own unpublished script, you'll see *"Google hasn't
   verified this app"*. Click **Advanced → Go to google-cal-lead-time (unsafe)** → **Allow**. The script asks
   for Calendar access and permission to fetch the feed URL.
2. Open the **Execution log** to see the planned departure times. No events are created in this step.
3. Run **`installTrigger`**. This creates an hourly trigger and runs the first sync right away.

That's it. If a run fails (for example, an address Maps can't find), Google emails you a failure
summary.

## Updating

1. Download `Code.gs` from the
   [latest release](https://github.com/andrewmacheret/google-cal-lead-time/releases/latest).
2. Replace everything in your project's `Code` file with it. Leave `Config` as is, then save.

The hourly trigger uses the new code automatically. To apply it right away, run **`syncLeadTimes`**.
If a release adds new settings, they're optional. Compare your `Config` with that release's
`Config.gs` to see them.

## Other functions

| Function | What it does |
| --- | --- |
| `syncLeadTimes` | Runs a sync now. The hourly trigger calls this function. |
| `previewLeadTimes` | Shows what would be created or updated, without changing anything. |
| `installTrigger` | Creates the hourly trigger and runs a sync. Running it again won't create duplicate triggers. |
| `removeTrigger` | Stops the hourly sync. |
| `deleteAllLeadTimeEvents` | Deletes every upcoming event this script created. |

## Notes

- After you change `src/Config.js` and push, the affected upcoming events update on the next run.
- If a feed can't be downloaded, the other feeds still sync, but no lead-time events are deleted on
  that run. The script can't tell which games were removed from a feed it couldn't read.
- Lead-time events are identified by hidden tags, so you can rename or recolor the calendar freely.
  However, the next update overwrites any edits you make to an event's title, time, or description.
- The Apps Script Maps service has a daily quota. The script calls it about twice per game per
  `REFRESH_HOURS`, which is well under the limit for a typical schedule.
- If Maps picks the wrong place for a venue, add it to `LOCATION_OVERRIDES`.

## Development

The tests run the real source files against mocked Apps Script services. They use only built-in
Node features, so there's nothing to install.

```sh
npm test
```

### Deploying from source with clasp

```sh
cp Config.example.js src/Config.js   # then fill it in
npm install -g @google/clasp
clasp login                          # also turn on the Apps Script API at https://script.google.com/home/usersettings
clasp create --type standalone --title google-cal-lead-time --rootDir build
npm run deploy
```

`npm run deploy` runs the tests and bundles `src/` into `build/`, then runs `clasp push -f`. The
project ends up with the same two files as a release install: `Code`, which holds all the logic, and
`Config`, which is your `src/Config.js`. `clasp push -f` replaces all of the online code, so files
from older layouts are removed.

`src/Config.js` is gitignored because it holds your address and private feed keys.

To push to a project you already created, skip `clasp create`. Instead, copy the **Script ID** from
**Project Settings** and run `echo '{"scriptId":"YOUR_SCRIPT_ID","rootDir":"build"}' > .clasp.json`.
Don't use `clasp clone`, because it overwrites local files.

### Releasing

```sh
npm version minor        # or patch / major: bumps package.json, commits, and tags vX.Y.Z
git push --follow-tags
```

Pushing the tag runs the [Release workflow](.github/workflows/release.yml). It runs the tests, builds
`dist/Code.gs` and `dist/Config.gs` with `npm run build`, and publishes them as a GitHub Release.
