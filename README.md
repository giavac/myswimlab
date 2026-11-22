# MySwimLab

**Local-first swimming analytics for Garmin FIT activities.** MySwimLab is a browser-based tool for exploring pool and open-water swim sessions, reviewing recorded lengths and pace, and identifying possible recording outliers. It has no account, backend, telemetry or runtime dependencies.

> **Status:** v0.1.0 is an early open-source release. FIT parsing and outlier detection are experimental; verify results against the original activity.

## Features

- Import multiple Garmin swimming FIT files at once.
- Browse sessions and inspect pace, distance, stroke metrics, charts and best recorded efforts.
- Distinguish swimming time from recorded rest time for pool activities.
- Flag suspicious lengths conservatively, with manual **Exclude**, **Keep**, and **Reset** overrides. Recorded FIT files and session totals are never modified.
- Save annotations and export/restore JSON backups in the browser.
- Keep meter- and yard-pool best efforts separate.

## Getting started

Clone the repository and serve the project directory using any static HTTP server:

```sh
git clone https://github.com/giavac/myswimlab.git
cd myswimlab
python3 -m http.server 8000
```

Alternatively, download and open **`dist/myswimlab-standalone.html`** directly in a modern browser. This single-file build is generated from the same sources for use without a local HTTP server. Browser storage behavior varies by browser and origin; use the local HTTP server for the most predictable experience.

The dashboard starts empty. Use **Import FIT files** to select activities. Select them again after reloading the page. No personal FIT files or example user activities are distributed with this repository.

## Privacy and data storage

FIT data is parsed locally in your browser and **is not uploaded to a MySwimLab server**. No account, analytics tracker, or external API is required. Annotations and full session objects associated with saved annotations or restored backups may be stored in browser IndexedDB. Imported activity history is not automatically restored from those stored objects at startup. Use Settings to clear stored annotations. Exported JSON backups contain activity data and should be treated as private.

You can select up to 300 FIT files per import. Multiple imports add sessions to the current view.

## Development

The application uses native ES modules, HTML, CSS, browser APIs, and no third-party packages. Node.js 20+ is required **only** for tests:

```sh
npm test
```

Tests use Node's built-in test runner and synthetic FIT fixtures; no personal training files are needed.

To regenerate the standalone HTML with Python 3 (standard library only):

```sh
python3 scripts/build_preview.py
```

Edit `src/`, `index.html`, and `styles.css`, not generated files in `dist/`.

### Repository layout

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Modular application entry point and styles |
| `src/fit/` | FIT decoding and swimming normalization |
| `src/analytics/` | Metrics, best efforts and length-quality rules |
| `src/data/` | File imports, backups and browser persistence |
| `src/ui/`, `src/state.js`, `src/main.js` | Views, state and app lifecycle |
| `tests/` | Automated tests with synthetic FIT fixtures |
| `scripts/` | Standalone HTML generator |
| `dist/` | Generated single-file application |
| `docs/` | Technical documentation |

See [the data model](docs/data-model.md) and [outlier filtering notes](docs/OUTLIER-FILTER.md) for implementation details.

## Known limitations

- The FIT parser is a deliberately limited implementation; FIT CRC is not validated and not all Garmin devices or recording variations are supported.
- FIT files containing multiple swimming sessions are rejected rather than combined.
- Swimming-time calculations depend on recorded active length messages; some devices and drills may produce inaccurate data.
- The automatic outlier rule needs sufficient lengths and stroke data, and may miss errors or flag legitimate efforts. Manual overrides are available.
- Results are informational and not medical or professional coaching advice.

Issues and contributions are welcome. Please use synthetic or anonymized examples in public bug reports; **never attach personal FIT files or exported backups without considering their sensitive metadata**.

## License

Released under the [MIT License](LICENSE). Copyright © 2026 Giacomo Vacca.
