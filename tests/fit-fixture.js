/** Synthetic FIT binary builder for tests. No real athlete data is included. */

const sessionFields = [
  [5, 1, 2],     // sport
  [6, 1, 2],     // sub_sport
  [44, 4, 6],    // pool length in hundredths of a meter
  [46, 1, 2],    // pool unit
  [9, 4, 6],     // total distance in centimeters
  [8, 4, 6],     // timer duration in milliseconds (includes recorded rests)
  [78, 4, 6],    // Garmin swim time field in milliseconds, where available
  [7, 4, 6],     // elapsed duration in milliseconds
  [2, 4, 6],     // start timestamp
  [16, 1, 2]     // average heart rate
];

const lengthFields = [
  [4, 4, 6],     // duration in milliseconds
  [3, 4, 6],     // elapsed in milliseconds
  [5, 2, 4],     // number of strokes
  [7, 1, 0],     // swim stroke enum
  [12, 1, 2],    // length type: active=1, rest=0
  [254, 2, 4],   // message index
  [2, 4, 6]      // start timestamp
];

function definition(local, global, fields) {
  const header = Buffer.from([0x40 | local, 0, 0, global & 255, global >> 8, fields.length]);
  return Buffer.concat([header, ...fields.map(field => Buffer.from(field))]);
}

function dataRecord(local, fields, values) {
  const valuesBuffer = fields.map(([number, size]) => {
    const buffer = Buffer.alloc(size);
    if (size === 1) buffer.writeUInt8(values[number]);
    else if (size === 2) buffer.writeUInt16LE(values[number]);
    else if (size === 4) buffer.writeUInt32LE(values[number]);
    return buffer;
  });
  return Buffer.concat([Buffer.from([local]), ...valuesBuffer]);
}

/**
 * @param {object} options
 * @param {number[]} options.durations - One duration in seconds per active pool length.
 * @param {number[]} options.restAfter - Indices at which to insert an explicit rest marker.
 * @param {number} options.subSport - FIT sub_sport 17=pool, 18=open water.
 */
export function makeFit({
  durations = [23, 24, 22, 25], restAfter = [], subSport = 17,
  sport = 5, poolMeters = 25, poolUnit = 0, additionalSession = false,
  omitTimestamps = false, omitSwimTime = false, restSeconds = 10, strokes = [], strokeTypes = []
} = {}) {
  const sessionLayout = sessionFields.filter(([number]) =>
    !(omitTimestamps && number === 2) && !(omitSwimTime && number === 78));
  const lengthLayout = omitTimestamps ? lengthFields.filter(([number]) => number !== 2) : lengthFields;
  const timestamp = Math.floor(Date.UTC(2026, 10, 4, 8, 30) / 1000) - 631065600;
  const duration = durations.reduce((a, b) => a + b, 0);
  const timerDuration = duration + restAfter.length * restSeconds;
  const data = [
    definition(0, 18, sessionLayout),
    dataRecord(0, sessionLayout, {
      5: sport, 6: subSport, 44: Math.round(poolMeters * 100), 46: poolUnit,
      9: durations.length * poolMeters * 100,
      8: timerDuration * 1000, 78: duration * 1000,
      7: (timerDuration + 10) * 1000,
      2: timestamp, 16: 126
    }),
    definition(1, 101, lengthLayout)
  ];

  let elapsed = 0;
  let index = 0;
  for (let i = 0; i < durations.length; i++) {
    data.push(dataRecord(1, lengthLayout, {
      4: durations[i] * 1000, 3: durations[i] * 1000,
      5: strokes[i] ?? 20 + i, 7: strokeTypes[i] ?? 255, 12: 1, 254: index++, 2: timestamp + elapsed
    }));
    elapsed += durations[i];
    if (restAfter.includes(i)) {
      data.push(dataRecord(1, lengthLayout, {
        4: restSeconds * 1000, 3: restSeconds * 1000, 5: 0, 7: 255, 12: 0,
        254: index++, 2: timestamp + elapsed
      }));
      elapsed += restSeconds;
    }
  }

  if (additionalSession) {
    data.push(definition(0, 18, sessionLayout));
    data.push(dataRecord(0, sessionLayout, {
      5: sport, 6: subSport, 44: Math.round(poolMeters * 100), 46: poolUnit,
      9: durations.length * poolMeters * 100,
      8: timerDuration * 1000, 78: duration * 1000,
      7: (timerDuration + 10) * 1000,
      2: timestamp + 1000, 16: 126
    }));
  }
  const payload = Buffer.concat(data);
  const header = Buffer.alloc(14);
  header.writeUInt8(14, 0);
  header.writeUInt8(0x10, 1);
  header.writeUInt32LE(payload.length, 4);
  header.write('.FIT', 8, 'ascii');
  return Buffer.concat([header, payload, Buffer.alloc(2)]);
}
