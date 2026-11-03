const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Tags stored on each lead-time event so later runs can find and update it.
const TAG_UID = 'leadTimeUid';
const TAG_SIGNATURE = 'leadTimeSignature';
const TAG_COMPUTED_AT = 'leadTimeComputedAt';

/**
 * Creates, updates, or deletes lead-time events so each upcoming game in the feed
 * has exactly one event that starts when you need to leave and ends at game start.
 */
function runSync_(config, options) {
  const now = (options && options.now) || new Date();
  const dryRun = !!(options && options.dryRun);
  const result = { created: 0, updated: 0, unchanged: 0, deleted: 0, skipped: 0, plans: [], errors: [] };

  const horizon = new Date(now.getTime() + config.lookaheadDays * DAY_MS);
  const games = [];
  const seen = {};
  let failedFeeds = 0;
  for (const feed of config.feeds) {
    let parsed;
    try {
      parsed = parseIcal_(fetchFeed_(feed.url), config.timezone);
    } catch (err) {
      failedFeeds++;
      result.errors.push(`${feed.name}: ${err.message}`);
      continue;
    }
    for (const game of parsed.events) {
      if (game.status === 'CANCELLED' || game.start <= now || game.start > horizon) continue;
      if (seen[game.uid]) continue; // same event in several feeds: first feed wins
      if ((feed.includePattern && !feed.includePattern.test(game.summary)) ||
          (feed.skipPattern && feed.skipPattern.test(game.summary))) {
        result.skipped++;
        continue;
      }
      seen[game.uid] = true;
      games.push({ game, feed, timezone: parsed.timezone });
    }
  }
  if (failedFeeds === config.feeds.length) throw new Error(result.errors.join('\n'));

  const calendar = getCalendar_(config.calendarId);
  const byUid = {};
  const managed = calendar
    .getEvents(new Date(now.getTime() - DAY_MS), new Date(horizon.getTime() + DAY_MS))
    .filter((ev) => ev.getTag(TAG_UID) && ev.getEndTime() > now);
  for (const ev of managed) {
    const uid = ev.getTag(TAG_UID);
    if (byUid[uid]) {
      if (!dryRun) ev.deleteEvent();
      result.deleted++;
    } else {
      byUid[uid] = ev;
    }
  }

  const wanted = {};
  for (const { game, feed, timezone } of games) {
    wanted[game.uid] = true;
    try {
      syncGame_(game, feed, byUid[game.uid], calendar, config, timezone, now, dryRun, result);
    } catch (err) {
      result.errors.push(`${game.summary} (${game.start.toISOString()}): ${err.message}`);
    }
  }

  // If any feed couldn't be read, we can't tell which games were removed, so delete nothing.
  if (failedFeeds) return result;
  for (const uid of Object.keys(byUid)) {
    if (wanted[uid]) continue;
    if (!dryRun) byUid[uid].deleteEvent();
    result.deleted++;
  }
  return result;
}

function syncGame_(game, feed, existing, calendar, config, timezone, now, dryRun, result) {
  const address = extractAddress_(game.location, config.locationOverrides);
  const title = config.titleTemplate.replace('{summary}', game.summary);
  const prepMinutes = Math.max(0, config.prepMinutes + feed.adjustmentMinutes);
  const signature = hashString_(
    [game.start.getTime(), game.summary, address, config.homeAddress, prepMinutes, config.roundMinutes, title].join('|'),
  );

  if (existing && existing.getTag(TAG_SIGNATURE) === signature) {
    const age = now.getTime() - Number(existing.getTag(TAG_COMPUTED_AT) || 0);
    const alreadyLeaving = existing.getStartTime() <= now;
    if (alreadyLeaving || age < config.refreshHours * HOUR_MS) {
      result.unchanged++;
      return;
    }
  }

  const plan = planDeparture_(game, address, prepMinutes, config, now);
  const description = describePlan_(game, plan, timezone);
  result.plans.push({ title, departure: plan.departure, gameStart: game.start, driveMinutes: plan.driveMinutes, address });
  if (dryRun) return;

  let ev = existing;
  if (ev) {
    ev.setTime(plan.departure, game.start);
    ev.setTitle(title);
    ev.setLocation(address);
    ev.setDescription(description);
    result.updated++;
  } else {
    ev = calendar.createEvent(title, plan.departure, game.start, { location: address, description });
    ev.removeAllReminders();
    if (config.reminderMinutes !== null) ev.addPopupReminder(config.reminderMinutes);
    ev.setTag(TAG_UID, game.uid);
    result.created++;
  }
  ev.setTag(TAG_SIGNATURE, signature);
  ev.setTag(TAG_COMPUTED_AT, String(now.getTime()));
}

/**
 * Works backwards from game start: arrive `prepMinutes` early (PREP_MINUTES plus the
 * feed's ADJUSTMENT_MINUTES), and leave early enough to cover the drive. The drive is
 * first estimated without a departure time, then re-estimated with traffic predicted
 * for the resulting departure time.
 */
function planDeparture_(game, address, prepMinutes, config, now) {
  const arriveBy = new Date(game.start.getTime() - prepMinutes * MINUTE_MS);
  let driveSeconds = estimateDriveSeconds_(config.homeAddress, address, null);
  const firstGuess = new Date(arriveBy.getTime() - driveSeconds * 1000);
  if (firstGuess > now) driveSeconds = estimateDriveSeconds_(config.homeAddress, address, firstGuess);

  const roundMs = config.roundMinutes * MINUTE_MS;
  let departure = new Date(Math.floor((arriveBy.getTime() - driveSeconds * 1000) / roundMs) * roundMs);
  if (departure >= game.start) departure = new Date(game.start.getTime() - roundMs);
  return { departure, arriveBy, prepMinutes, driveMinutes: Math.ceil(driveSeconds / 60) };
}

function estimateDriveSeconds_(origin, destination, departAt) {
  const finder = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING);
  if (departAt) finder.setDepart(departAt);
  const response = finder.getDirections();
  if (!response || response.status !== 'OK' || !response.routes || !response.routes.length) {
    throw new Error(`Directions lookup failed (${response && response.status}) to "${destination}"`);
  }
  return response.routes[0].legs.reduce((sum, leg) => sum + (leg.duration_in_traffic || leg.duration).value, 0);
}

function describePlan_(game, plan, timezone) {
  const t = (d) => formatTime_(d, timezone);
  return [
    `Leave by ${t(plan.departure)} (~${plan.driveMinutes} min drive) to arrive by ${t(plan.arriveBy)}, ` +
      `${plan.prepMinutes} min before the ${t(game.start)} start.`,
    '',
    `Event: ${game.summary}`,
    `Where: ${game.location}`,
    '',
    'Created by lead-time. Manual edits will be overwritten.',
  ].join('\n');
}

function formatTime_(date, timezone) {
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(date, timezone, 'h:mm a');
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(date);
}

function fetchFeed_(url) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code !== 200) throw new Error(`Feed request failed with HTTP ${code}`);
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('Feed did not return an iCalendar document');
  return text;
}

function getCalendar_(calendarId) {
  if (!calendarId) return CalendarApp.getDefaultCalendar();
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw new Error(`Calendar not found: ${calendarId}`);
  return calendar;
}

function hashString_(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
