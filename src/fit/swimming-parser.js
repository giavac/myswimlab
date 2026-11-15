/**
 * Translate the FIT messages into MySwimLab's device-independent SwimSession.
 * See docs/data-model.md for the complete shape and units.
 */
import { decodeMessages, fieldValue, fitDate, isNumber, scaledValue } from './decoder.js';

const GLOBAL_SESSION = 18;
const GLOBAL_RECORD = 20;
const GLOBAL_LENGTH = 101;
const SPORT_SWIMMING = 5;
const SUB_SPORT_POOL = 17;
const SUB_SPORT_OPEN_WATER = 18;

function convertLength(message, poolMeters, sequence) {
  const fields = message.fields;
  const isRest = fieldValue(fields, 12) === 0;

  return {
    index: fieldValue(fields, 254),
    sequence,
    start: fitDate(fieldValue(fields, 2)),
    end: fitDate(fieldValue(fields, 253)),
    duration: scaledValue(fieldValue(fields, 4), 1000)
      ?? scaledValue(fieldValue(fields, 3), 1000),
    elapsed: scaledValue(fieldValue(fields, 3), 1000),
    strokes: fieldValue(fields, 5),
    cadence: fieldValue(fields, 9),
    stroke: fieldValue(fields, 7),
    speed: scaledValue(fieldValue(fields, 6), 1000),
    isRest,
    distance: isRest ? 0 : poolMeters
  };
}

function sessionTitle(filename) {
  const title = filename.replace(/\.fit$/i, '').replace(/[_-]/g, ' ');
  return /^\d+\s*activity$/i.test(title) ? 'Swimming session' : title;
}

/**
 * @param {ArrayBuffer} buffer - A raw FIT file.
 * @param {string} filename - Original file name (used for display only).
 * @returns {object} A normalized SwimSession.
 */
export function parseFit(buffer, filename = 'Garmin swim', options = {}) {
  const messages = decodeMessages(buffer);
  const sessionMessages = messages.filter(message => message.global === GLOBAL_SESSION);
  const lengthMessages = messages.filter(message => message.global === GLOBAL_LENGTH);
  const recordMessages = messages.filter(message => message.global === GLOBAL_RECORD);

  const swimmingSessions = sessionMessages.filter(message =>
    fieldValue(message.fields, 5) === SPORT_SWIMMING);
  if (swimmingSessions.length > 1) {
    // Do not merge several workouts' lengths into one misleading activity.
    throw new Error('Multi-session FIT files are not yet supported.');
  }
  const session = swimmingSessions[0] ?? sessionMessages[0];

  if (!session && lengthMessages.length === 0) {
    throw new Error('This FIT file does not contain a swimming session.');
  }

  const fields = session?.fields ?? {};
  const sport = fieldValue(fields, 5);
  if (session && isNumber(sport) && sport !== SPORT_SWIMMING) {
    throw new Error('This FIT file contains a non-swimming activity.');
  }

  // FIT pool_length is ALWAYS hundredths of a meter, even for a yard pool.
  // pool_length_unit controls the display unit only (0=m, 1=yd).
  const poolMeters = scaledValue(fieldValue(fields, 44), 100) || 25;
  const poolUnit = fieldValue(fields, 46) === 1 ? 'yd' : 'm';
  const lengths = lengthMessages.map((message, index) => convertLength(message, poolMeters, index));
  const activeLengths = lengths.filter(length => !length.isRest);

  let distance = scaledValue(fieldValue(fields, 9), 100);
  if (!isNumber(distance) || distance <= 0) {
    distance = activeLengths.reduce((total, length) => total + length.distance, 0);
  }

  const subSport = fieldValue(fields, 6);
  const swimType = subSport === SUB_SPORT_POOL ? 'pool'
    : subSport === SUB_SPORT_OPEN_WATER ? 'open-water'
    : lengths.length > 0 ? 'pool' : 'open-water';

  // A pool session's FIT total_timer_time can include rests between sets.
  // The actual swimming time is the sum of ACTIVE length durations, not that
  // session timer. Garmin records rest periods as idle length messages.
  const timerDuration = scaledValue(fieldValue(fields, 8), 1000);
  const activeDuration = activeLengths.reduce((total, length) =>
    total + (isNumber(length.duration) && length.duration > 0 ? length.duration : 0), 0);
  const restDuration = lengths.reduce((total, length) =>
    total + (length.isRest && isNumber(length.duration) && length.duration > 0
      ? length.duration : 0), 0);

  // Some Garmin Swim files also contain a nonstandard session field 78
  // (total_swim_time). Use it only if active length durations are unavailable.
  const swimTimeField = scaledValue(fieldValue(fields, 78), 1000);
  let duration = timerDuration;
  let durationBasis = 'timer';
  if (swimType === 'pool' && activeDuration > 0) {
    duration = activeDuration;
    durationBasis = 'active-lengths';
  } else if (swimType === 'pool' && isNumber(swimTimeField) && swimTimeField > 0) {
    duration = swimTimeField;
    durationBasis = 'session-swim-time';
  }
  if (!isNumber(duration) || duration <= 0) {
    duration = activeDuration;
    durationBasis = 'active-lengths';
  }

  const elapsed = scaledValue(fieldValue(fields, 7), 1000) || timerDuration || duration;
  const start = fitDate(fieldValue(fields, 2))
    ?? lengths.find(length => length.start)?.start
    ?? fitDate(fieldValue(recordMessages[0]?.fields, 253))
    ?? options.fallbackDate
    ?? '1989-12-31T00:00:00.000Z';

  return {
    id: options.fileHash && !fitDate(fieldValue(fields, 2)) &&
      !lengths.some(length => length.start) && !fitDate(fieldValue(recordMessages[0]?.fields, 253))
      ? `fit-sha256-${options.fileHash}`
      // Keep v0.4.1 IDs stable so existing local annotations are still found.
      : `fit-${start}-${Math.round(distance)}-${(timerDuration || duration).toFixed(1)}`,
    date: start,
    title: sessionTitle(filename),
    filename,
    source: 'FIT',
    sport: swimType,
    poolMeters: swimType === 'pool' ? poolMeters : null,
    poolUnit: swimType === 'pool' ? poolUnit : null,
    distance: Math.round(distance * 100) / 100,
    duration: Number(duration.toFixed(3)), // Rest-excluded swimming time for pool sessions.
    timerDuration: isNumber(timerDuration) ? Number(timerDuration.toFixed(3)) : null,
    restDuration: swimType === 'pool' ? Number(restDuration.toFixed(3)) : null,
    durationBasis,
    elapsed: Number(elapsed.toFixed(3)),
    averageHR: isNumber(fieldValue(fields, 16)) ? fieldValue(fields, 16) : null,
    lengths,
    notes: '',
    equipment: [],
    importedAt: new Date().toISOString()
  };
}
