# lead-time

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

### 1. Create the Apps Script project

**Option A: copy and paste**

1. Go to <https://script.google.com> → **New project**. Rename it to `lead-time`.
2. For each file in `src/` (`Config.js`, `Ical.js`, `Sync.js`, `Main.js`), click **+ → Script**, name
   it without the `.js` extension, and paste in the contents. Delete the default `Code.gs`.
3. Click **Project Settings** (gear icon), enable **Show "appsscript.json" manifest file in editor**,
   then replace that file's contents with `src/appsscript.json`. Set its `timeZone` to yours.

**Option B: [clasp](https://github.com/google/clasp)**

```sh
npm install -g @google/clasp
clasp login                       # also enable the API at https://script.google.com/home/usersettings
clasp create --type standalone --title lead-time --rootDir src
clasp push
```

### 2. Configure

In the script editor, open **Project Settings → Script properties → Add script property**.

#### Feeds

Each feed is a group of properties that share a numeric suffix (`_1`, `_2`, …). Add as many groups
as you need:

| Property | Required | Example | Meaning |
| --- | --- | --- | --- |
| `FEED_URL_1` | ✅ | `webcal://sportsix.sports-it.com/ical?cid=…&id=…&k=…` | iCal feed (`webcal://` or `https://`) |
| `INCLUDE_PATTERN_1` | | `Monarchs\|Seals` | Regex. Only events whose title matches get a lead-time event. Blank means all. |
| `SKIP_PATTERN_1` | | `Drop-In` | Regex. Events whose title matches are ignored. Applied after `INCLUDE_PATTERN`. |
| `ADJUSTMENT_MINUTES_1` | | `10` or `-15` | Added to `PREP_MINUTES` for this feed. Positive means leave earlier, negative means later. Blank means `0`. |

Patterns are case-insensitive. A total prep time below zero counts as zero, so you never arrive after
the start. If the same event (same UID) appears in more than one feed, it gets one lead-time event,
using the lowest-numbered feed that includes it. For a single feed, you can also leave off the
suffix (`FEED_URL`, `INCLUDE_PATTERN`, …).

#### Everything else

| Property | Required | Example | Default |
| --- | --- | --- | --- |
| `HOME_ADDRESS` | ✅ | `123 Main St, Seattle, WA 98101` | |
| `PREP_MINUTES` | | `30`: time at the rink before the game starts | `30` |
| `CALENDAR_ID` | | `abc123@group.calendar.google.com` | primary calendar |
| `REMINDER_MINUTES` | | `15`: popup this long before you need to leave; blank for none | `15` |
| `LOOKAHEAD_DAYS` | | `21` | `21` |
| `REFRESH_HOURS` | | `12` | `12` |
| `ROUND_MINUTES` | | `5`: the departure time is rounded down to a multiple of this | `5` |
| `TITLE_TEMPLATE` | | `🚗 Leave for {summary}` | `🚗 Leave for {summary}` |
| `LOCATION_OVERRIDES` | | `{"Olympic View": "7012 220th St SW, Mountlake Terrace, WA"}` | `{}` |
| `TIMEZONE` | | `America/Los_Angeles`, for feed times without a time zone | feed's `X-WR-TIMEZONE` |

Settings are stored as script properties instead of in the code, so your address and private feed
keys never end up in git.

> **Tip:** Consider making a separate Google Calendar (for example, "Hockey travel") and putting its ID
> in `CALENDAR_ID`. You can find the ID under Google Calendar → Settings → *your calendar* →
> **Integrate calendar**. With a separate calendar, you can show, hide, or delete all lead-time
> events at once.

### 3. Preview, then turn it on

1. In the function dropdown, choose **`previewLeadTimes`** → **Run**. The first time, Google asks you
   to authorize the script. Because this is your own unpublished script, you'll see *"Google hasn't
   verified this app"*. Click **Advanced → Go to lead-time (unsafe)** → **Allow**. The script asks
   for Calendar access and permission to fetch the feed URL.
2. Open the **Execution log** to see the planned departure times. No events are created in this step.
3. Run **`installTrigger`**. This creates an hourly trigger and runs the first sync right away.

That's it. If a run fails (for example, an address Maps can't find), Google emails you a failure
summary.

## Other functions

| Function | What it does |
| --- | --- |
| `syncLeadTimes` | Runs a sync now. The hourly trigger calls this function. |
| `previewLeadTimes` | Shows what would be created or updated, without changing anything. |
| `installTrigger` | Creates the hourly trigger and runs a sync. Running it again won't create duplicate triggers. |
| `removeTrigger` | Stops the hourly sync. |
| `deleteAllLeadTimeEvents` | Deletes every upcoming event this script created. |

## Notes

- Changing a setting (for example, `PREP_MINUTES` or `ADJUSTMENT_MINUTES_2`) updates the affected
  upcoming events on the next run.
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
