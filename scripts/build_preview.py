#!/usr/bin/env python3
"""Build a double-clickable standalone HTML application from native ES modules.

Uses only Python's standard library. This is a convenience artifact, not the
source of truth. Edit src/*.js and styles.css, not dist/.

Modules are ordered explicitly and currently have no default exports or
re-exports. An error is raised if this simple bundler encounters unsupported
import/export syntax. A module-aware build step would be needed if the project
eventually adopts a more elaborate module graph.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'src/fit/decoder.js',
    'src/fit/swimming-parser.js',
    'src/analytics/length-quality.js',
    'src/analytics/best-efforts.js',
    'src/analytics/metrics.js',
    'src/analytics/intervals.js',
    'src/data/fit-import.js',
    'src/data/backup.js',
    'src/data/storage.js',
    'src/state.js',
    'src/ui/shared.js',
    'src/ui/charts.js',
    'src/ui/components.js',
    'src/ui/overview.js',
    'src/ui/session-detail.js',
    'src/ui/sessions-list.js',
    'src/ui/other-pages.js',
    'src/ui/layout.js',
    'src/ui/render.js',
    'src/main.js',
]

IMPORT = re.compile(r'^import\s+[\s\S]*?\s+from\s+[\x27\x22][^\x27\x22]+[\x27\x22];\s*', re.MULTILINE)
EXPORT = re.compile(r'^export\s+(?=(function|const|class|async|let)\b)', re.MULTILINE)

snippets = []
for filename in FILES:
    source = (ROOT / filename).read_text(encoding='utf-8')
    source = IMPORT.sub('', source)
    source = EXPORT.sub('', source)
    if re.search(r'^\s*(?:import|export)\s', source, re.MULTILINE):
        raise ValueError(f'Unsupported module declaration in {filename}')
    snippets.append(f'\n// ===== {filename} =====\n{source}\n')

styles = (ROOT / 'styles.css').read_text(encoding='utf-8')
script = '\n'.join(snippets)
if '</script' in script.lower() or '</style' in styles.lower():
    raise ValueError('Embedded script/style contains a closing HTML tag')

preview = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MySwimLab v0.1.0</title>
  <style>\n{styles}\n</style>
</head>
<body>
  <div id="app"></div>
  <script>\n{script}\n</script>
</body>
</html>
'''

output = ROOT / 'dist/myswimlab-standalone.html'
output.write_text(preview, encoding='utf-8')
print(f'Wrote {output} ({output.stat().st_size} bytes)')
