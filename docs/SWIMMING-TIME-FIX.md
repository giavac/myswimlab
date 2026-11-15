# v0.4.2: swimming time and average pace

## Root cause

FIT `session.total_timer_time` (field 8, scale 1000) includes explicit idle
lengths on some Garmin pool swims. v0.4.1 used this for the session's
`duration`, incorrectly labeling it "moving time". Average pace is
`duration * 100 / distance`, so pool sessions with rests looked slower.

## Resolution

- Pool session `duration`: sum `length.total_timer_time` for active lengths
  (`length_type != idle`), excluding rest records.
- `timerDuration`: retain FIT session's unmodified timer duration.
- `restDuration`: sum idle length durations.
- `durationBasis`: describe the source used, to avoid overclaiming precision.
- Open-water sessions: retain FIT timer duration, since no pool lengths exist.
- Keep the original ID calculation tied to FIT session timer duration so
  old annotations continue to match the same FIT file.
- As a fallback when length durations are missing, attempt the optional
  manufacturer-specific field 78 (historically called `total_swim_time`),
  then the session timer. Do not assume that field 78 is universally present.

## Verification

The correction is covered by automated tests using synthetic FIT records. No
private Garmin activity files or their derived session statistics are included.

## Out of scope

Historical JSON backups containing old normalized durations cannot be
automatically corrected unless the underlying FIT file is reimported.
FIT length recording errors or unrecognized drills are not corrected here.
