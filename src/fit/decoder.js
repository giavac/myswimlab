/**
 * Minimal FIT binary decoder. This module knows nothing about swimming or the UI.
 *
 * Output: [{ global: FIT global message number, fields: { fieldNumber: value } }]
 * Unsupported developer fields are skipped rather than guessed.
 */

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);

// The low five bits of a FIT base-type byte describe the scalar type.
const TYPE_SIZES = {
  0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1,
  8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8
};

export function fieldValue(fields, number) {
  return fields?.[number] ?? null;
}

export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function scaledValue(value, divisor) {
  return isNumber(value) ? value / divisor : null;
}

export function fitDate(timestamp) {
  return isNumber(timestamp)
    ? new Date(FIT_EPOCH_MS + timestamp * 1000).toISOString()
    : null;
}

/** FIT invalid sentinels depend on the base type, not only its width. */
function readScalar(view, position, type, littleEndian) {
  const readUnsigned64 = () => view.getBigUint64(position, littleEndian);
  const readSigned64 = () => view.getBigInt64(position, littleEndian);
  let value;

  switch (type) {
    case 0: case 2: case 10: case 13: value = view.getUint8(position); break;
    case 1: value = view.getInt8(position); break;
    case 3: value = view.getInt16(position, littleEndian); break;
    case 4: case 11: value = view.getUint16(position, littleEndian); break;
    case 5: value = view.getInt32(position, littleEndian); break;
    case 6: case 12: value = view.getUint32(position, littleEndian); break;
    case 8: value = view.getFloat32(position, littleEndian); break;
    case 9: value = view.getFloat64(position, littleEndian); break;
    case 14: value = readSigned64(); break;
    case 15: case 16: value = readUnsigned64(); break;
    default: return null;
  }

  // 'z' unsigned types reserve ZERO as invalid; enum and byte reserve MAX.
  const invalid = {
    0: 255, 1: 127, 2: 255, 3: 32767, 4: 65535,
    5: 2147483647, 6: 4294967295, 10: 0, 11: 0, 12: 0,
    13: 255, 14: 9223372036854775807n,
    15: 18446744073709551615n, 16: 0n
  };
  if (value === invalid[type]) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  // Keep 64-bit integers exact. Larger values remain bigint, not rounded floats.
  if (value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)) return Number(value);
  return value;
}

function readField(view, position, size, baseType, littleEndian) {
  const type = baseType & 31;

  if (type === 7) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + position, size);
    return new TextDecoder().decode(bytes).replace(/\0.*$/, '').trim();
  }

  const scalarSize = TYPE_SIZES[type];
  if (!scalarSize || size % scalarSize !== 0) return null;

  if (size === scalarSize) {
    return readScalar(view, position, type, littleEndian);
  }

  const values = [];
  for (let offset = 0; offset < size; offset += scalarSize) {
    values.push(readScalar(view, position + offset, type, littleEndian));
  }
  return values;
}

/** Decode FIT global messages from an ArrayBuffer. */
export function decodeMessages(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 16) throw new Error('File too short for a FIT activity.');

  const headerSize = view.getUint8(0);
  const signature = String.fromCharCode(...new Uint8Array(buffer, 8, 4));
  if (![12, 14].includes(headerSize) || signature !== '.FIT') {
    throw new Error('Not a valid FIT file header. Export a Garmin .fit activity.');
  }

  const messageEnd = headerSize + view.getUint32(4, true);
  if (messageEnd > view.byteLength) throw new Error('Truncated FIT file.');

  const definitions = new Map();
  const messages = [];
  let cursor = headerSize;
  let lastTimestamp = null;

  function ensureBytes(count, description) {
    if (cursor + count > messageEnd) throw new Error(`Truncated ${description}.`);
  }

  while (cursor < messageEnd) {
    const header = view.getUint8(cursor++);
    const compressed = (header & 0x80) !== 0;
    const localNumber = compressed ? (header >> 5) & 3 : header & 15;
    const definitionMessage = !compressed && (header & 0x40) !== 0;

    if (definitionMessage) {
      ensureBytes(5, 'FIT definition');
      cursor += 1; // reserved byte
      const littleEndian = view.getUint8(cursor++) === 0;
      const globalNumber = view.getUint16(cursor, littleEndian);
      cursor += 2;

      const fieldCount = view.getUint8(cursor++);
      const fields = [];
      for (let index = 0; index < fieldCount; index++) {
        ensureBytes(3, 'FIT field definition');
        fields.push({
          number: view.getUint8(cursor++),
          size: view.getUint8(cursor++),
          baseType: view.getUint8(cursor++)
        });
      }

      const developerFields = [];
      if ((header & 0x20) !== 0) {
        ensureBytes(1, 'FIT developer field count');
        const count = view.getUint8(cursor++);
        for (let index = 0; index < count; index++) {
          ensureBytes(3, 'FIT developer field definition');
          developerFields.push({
            number: view.getUint8(cursor++),
            size: view.getUint8(cursor++),
            developer: view.getUint8(cursor++)
          });
        }
      }

      definitions.set(localNumber, { globalNumber, littleEndian, fields, developerFields });
      continue;
    }

    const definition = definitions.get(localNumber);
    if (!definition) throw new Error('FIT data references a missing definition.');

    const values = {};
    for (const field of definition.fields) {
      // The compressed timestamp header replaces field 253; it has no payload bytes.
      if (compressed && field.number === 253) continue;
      ensureBytes(field.size, 'FIT data');
      values[field.number] = readField(view, cursor, field.size, field.baseType, definition.littleEndian);
      cursor += field.size;
    }
    for (const field of definition.developerFields) {
      ensureBytes(field.size, 'FIT developer data');
      cursor += field.size;
    }

    if (compressed && isNumber(lastTimestamp)) {
      const offset = header & 31;
      let timestamp = lastTimestamp - (lastTimestamp % 32) + offset;
      if (timestamp < lastTimestamp) timestamp += 32;
      values[253] ??= timestamp;
    }
    if (isNumber(values[253])) lastTimestamp = values[253];

    messages.push({ global: definition.globalNumber, fields: values });
  }

  return messages;
}
