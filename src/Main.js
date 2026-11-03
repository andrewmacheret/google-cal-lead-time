/**
 * Public entry points. Run these from the Apps Script editor's function dropdown.
 */

/** Sync once now. This is what the hourly trigger calls. */
function syncLeadTimes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    console.log('Another sync is already running; skipping.');
    return;
  }
  try {
    const result = runSync_(readConfig_(), {});
    for (const plan of result.plans) console.log(describePlanForLog_(plan));
    console.log(
      `Created ${result.created}, updated ${result.updated}, unchanged ${result.unchanged}, ` +
        `deleted ${result.deleted}, skipped ${result.skipped}.`,
    );
    if (result.errors.length) throw new Error(`Some events failed:\n${result.errors.join('\n')}`);
  } finally {
    lock.releaseLock();
  }
}

/** Show what would be created without touching your calendar. */
function previewLeadTimes() {
  const result = runSync_(readConfig_(), { dryRun: true });
  if (!result.plans.length) console.log('Nothing to create or update.');
  for (const plan of result.plans) console.log(describePlanForLog_(plan));
  for (const err of result.errors) console.error(err);
}

/** Run hourly from now on (safe to run again), and sync immediately. */
function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger('syncLeadTimes').timeBased().everyHours(1).create();
  console.log('Installed hourly trigger.');
  syncLeadTimes();
}

/** Stop the hourly sync. Existing lead-time events are left alone. */
function removeTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'syncLeadTimes') ScriptApp.deleteTrigger(trigger);
  }
}

/** Delete every upcoming lead-time event this script created. */
function deleteAllLeadTimeEvents() {
  const config = readConfig_();
  const now = new Date();
  const events = getCalendar_(config.calendarId)
    .getEvents(now, new Date(now.getTime() + 400 * DAY_MS))
    .filter((ev) => ev.getTag(TAG_UID));
  events.forEach((ev) => ev.deleteEvent());
  console.log(`Deleted ${events.length} lead-time events.`);
}

function readConfig_() {
  return loadConfig_(PropertiesService.getScriptProperties().getProperties());
}

function describePlanForLog_(plan) {
  return `${plan.departure.toString()} → ${plan.title} (${plan.driveMinutes} min drive to ${plan.address})`;
}
