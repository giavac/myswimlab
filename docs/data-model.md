# Interoperable session data model

The `parseFit(arrayBuffer, filename)` function produces one plain JavaScript
object. Analytics functions accept this object directly; they do **not** need
FIT bytes, device-specific profile fields, or access to the browser.

```js
{
  id: 'fit-2026-11-04T08:30:00.000Z-100-94.0',
  date: '2026-11-04T08:30:00.000Z',  // ISO-8601 UTC
  title: 'Swimming session',
  filename: 'swim.fit',
  source: 'FIT',
  sport: 'pool',                       // 'pool' | 'open-water'
  poolMeters: 25,                     // meters, or null for open water
  poolUnit: 'm',                      // 'm' or 'yd' for pool sessions
  distance: 100,                      // meters
  duration: 94,                       // moving time, seconds
  timerDuration: 94,                // FIT timer time; may include rest
  restDuration: 0,                  // recorded pool rest time, seconds
  durationBasis: 'active-lengths',  // how swimming duration was obtained
  elapsed: 104,                       // elapsed time, seconds
  averageHR: 126,                     // bpm or null
  lengths: [
    {
      sequence: 0,                   // order in source file
      index: 0,                      // FIT message index or null
      start: '2026-11-04T08:30:00.000Z',
      end: null,
      duration: 23,                  // seconds
      elapsed: 23,                   // seconds
      distance: 25,                  // meters; 0 for rest
      isRest: false,
      strokes: 20,                   // count or null
      stroke: null,                  // FIT swimming stroke code or null
      cadence: null,                 // strokes/min or null
      speed: null                    // meters/second or null
    }
  ],
  notes: '',                         // user annotation
  equipment: [],                     // user annotation
  lengthOverrides: { '16': 'keep' },   // optional manual decisions, indexed by sequence
  importedAt: '2026-11-10T17:00:00.000Z'
}
```

## Invariants and interpretation

- All distances (including yard-pool lengths) are in **meters** and all times in **seconds**. `poolUnit` only controls display and separates yard/meter best-effort categories.
- `session.distance` retains centimeter precision for yard pools; never round to whole meters for calculations.
- Session ISO timestamps are UTC; user-facing dates and calendar-week groupings use the browser's local timezone.
- Pool lengths are ordered, with `sequence` beginning at zero. Rest markers
  have `isRest: true` and `distance: 0`.
- Missing FIT values are represented as `null`, not guessed, except the
  existing historical fallback of a 25 m pool when no pool size is recorded.
- Session `duration` represents **swimming time**, excluding explicit rest-length records for pool sessions. Its primary source is the sum of active length durations. If no usable lengths are present, a vendor-specific swim-time field may be used; otherwise the timer duration is the fallback.
- `timerDuration` preserves the raw FIT session timer (which may include rests). `restDuration` is the sum of recorded idle lengths; `elapsed` includes pauses. `durationBasis` describes the selected time source (`active-lengths`, `session-swim-time`, or `timer`).
- Session IDs continue to use the original FIT timer duration for backward compatibility with previously saved annotations. Time values in old JSON backups are not automatically recalculated; reimport their original FIT files for corrected swimming time.
- A best continuous effort cannot pass through a rest length or a gap in the
  source length indices. Excluded lengths inside an otherwise continuous effort
  contribute time and zero distance. Full bouts also include flagged time at
  the start and end of the bout.
- The importer produces one session from a FIT file. Files containing more than
  one swimming session are rejected with an explicit message (rather than
  silently merging lengths). Multi-sport activities are not fully supported.
- The importer uses an SHA-256 file ID when no usable FIT timestamp exists,
  and uses the file modification time only as the fallback display date.

## Extending the system

For another device/file format, create a separate adapter returning this
same object shape. The best-efforts and training trends modules should not
need to change.


## Quality controls

`lengthOverrides` is an optional plain object keyed by the original source
record's `sequence` as a decimal string. Each decision is `keep` or `exclude`.
Missing keys mean "follow the automatic conservative detector". These
annotations never alter the individual FIT length values or the session's
recorded distance or duration. See `src/analytics/length-quality.js`.

Displayed distance and aggregate volume remove excluded lengths. If the FIT
total is already below the sum of recorded lengths, that difference is
credited toward the correction to avoid double subtraction. Swim time, FIT timer time, and elapsed time retain their original values. Raw session objects and their IDs are
preserved in storage and backups.
