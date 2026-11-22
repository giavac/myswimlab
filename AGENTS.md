# MySwimLab

- Keep the app local-first and dependency-free. Use native ES modules, HTML,
  CSS, and browser APIs.
- Keep FIT decoding and normalization in `src/fit/`, analytics in
  `src/analytics/`, imports and persistence in `src/data/`, and rendering
  in `src/ui/`. Follow the session model in `docs/data-model.md`.
- Store distances in meters and times in seconds. Preserve stable session
  IDs and recorded totals when changing timing or length-quality logic.
- Run `npm test` with Node.js 20 or newer. Use synthetic FIT fixtures and
  keep personal activity files and backups out of the repository.
- Serve the modular app with `python3 -m http.server 8000`. Regenerate the
  standalone HTML with `python3 scripts/build_preview.py`. Edit the source
  files and update the generator's module list when adding a module.
