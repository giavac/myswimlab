# Length quality filtering (v0.1.0)

## Aim

A malformed watch start/stop can produce a spurious 25 m personal best.
Treat suspicious lengths as **data-quality annotations**: keep the raw FIT
records, but prevent an obvious artifact from driving analytics.

## Conservative automatic rule

`src/analytics/length-quality.js` assesses each pool session independently.
A length is flagged if, given at least eight usable reference lengths:

- its duration per meter is less than 60% of the session median; **and**
- its stroke count is less than 65% of the median stroke count.

Both conditions must hold. This avoids automatically rejecting a legitimately
fast 25 m effort with a normal number of strokes. A valid fast drill may still
satisfy both conditions, so users can override any flag.

In the reported Garmin activity from 11 November 2026, record #17 was
13.249 seconds with four strokes, while the session medians were approximately
29.2 seconds and 13 strokes. The algorithm flags just this length in that
activity. **The personal FIT file is not included in this repository.**

## Effects

- **Raw totals** (FIT distance, swim time, rest, elapsed) stay unchanged in
  the source data. Displayed distance omits flagged lengths and swim time is
  retained. Distance already omitted by the watch is credited toward the correction.
- Excluded lengths contribute time and zero distance to a continuous best effort.
  Recorded rests and gaps in the source length indices still break an effort.
- Per-length pace and stroke charts, stroke statistics, interval totals, and
  weekly volumes use the corrected data.
- The table highlights excluded rows. **Keep** overrides an automatic flag,
  **Exclude** flags another length manually, and **Reset** removes the override.
- Manual decisions are indexed by original `sequence`, persist with
  annotations in IndexedDB, and are exported/restored in JSON backups.

## Limitations

- The rule is deliberately conservative and **does not identify all errors**.
  It cannot confirm whether a fast length was genuine, and requires reliable
  per-length stroke counts for automatic classification.
- For coached sets mixing drills, strokes, fins and sprint intervals, session
  medians may not fully represent each workload. Better set segmentation is
  a possible future improvement.
