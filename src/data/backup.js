/** Analytics and views read these length fields without further checks. */
function validLength(length) {
  return length !== null && typeof length === 'object' && !Array.isArray(length) &&
    typeof length.isRest === 'boolean' &&
    Number.isFinite(length.distance) && length.distance >= 0 &&
    (length.duration === null || Number.isFinite(length.duration));
}

/** Validation before any write. Backups are untrusted JSON from the user's disk. */
export function validateBackup(value) {
  if (!value || value.format !== 'myswimlab' || !Array.isArray(value.sessions)) {
    throw new Error('Not a MySwimLab backup.');
  }
  const ids = new Set();
  for (const [index, session] of value.sessions.entries()) {
    const validDate = typeof session?.date === 'string' &&
      Number.isFinite(Date.parse(session.date));
    const valid = typeof session?.id === 'string' && session.id.length > 0 &&
      validDate && Array.isArray(session.lengths) && session.lengths.every(validLength) &&
      [undefined, null, 'm', 'yd'].includes(session.poolUnit) &&
      Number.isFinite(session.distance) && session.distance >= 0 &&
      Number.isFinite(session.duration) && session.duration >= 0 &&
      typeof session.sport === 'string' &&
      (session.notes === undefined || typeof session.notes === 'string') &&
      (session.lengthOverrides === undefined || (session.lengthOverrides !== null &&
        typeof session.lengthOverrides === 'object' && !Array.isArray(session.lengthOverrides) &&
        Object.entries(session.lengthOverrides).every(([key, decision]) =>
          /^(0|[1-9]\d*)$/.test(key) && ['keep', 'exclude'].includes(decision)))) &&
      (session.equipment === undefined ||
       Array.isArray(session.equipment) && session.equipment.every(e => typeof e === 'string'));
    if (!valid) throw new Error(`Invalid session entry at position ${index + 1}.`);
    if (ids.has(session.id)) throw new Error(`Duplicate session ID at position ${index + 1}.`);
    ids.add(session.id);
  }
  return value.sessions;
}
