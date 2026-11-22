/**
 * Read FIT files from browser File objects.
 * No DOM manipulation, storage access, or global UI state in this module.
 */
import { parseFit } from '../fit/swimming-parser.js';

const MAX_FILES = 300;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * @param {File[]} files
 * @returns {Promise<{sessions: object[], failures: string[], ignored: number}>}
 */
export async function parseFitFiles(files) {
  const candidates = files.filter(file => file.name.toLowerCase().endsWith('.fit'));
  if (candidates.length > MAX_FILES) {
    throw new Error(`Selection contains over ${MAX_FILES} FIT files. Choose fewer files.`);
  }
  const sessions = [];
  const failures = [];
  const seen = new Set();
  let ignored = 0;

  for (const file of candidates) {
    if (file.size > MAX_FILE_BYTES) {
      failures.push(`${file.name}: exceeds 25 MB`);
      continue;
    }

    try {
      const buffer = await file.arrayBuffer();
      // Hash every file. parseFit uses the hash as the ID only when the file has
      // no FIT activity timestamp. A per-file SHA-256 also allows future
      // importers to identify duplicates.
      const hashBytes = await crypto.subtle.digest('SHA-256', buffer);
      const fileHash = [...new Uint8Array(hashBytes)]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackDate = Number.isFinite(file.lastModified) && file.lastModified > 0
        ? new Date(file.lastModified).toISOString()
        : '1989-12-31T00:00:00.000Z';
      const session = parseFit(buffer, file.name, { fileHash, fallbackDate });
      if (seen.has(session.id)) continue;
      seen.add(session.id);
      sessions.push(session);
    } catch (error) {
      const expected = /non-swimming activity|does not contain a swimming session/i;
      if (expected.test(error.message)) ignored++;
      else failures.push(`${file.name}: ${error.message}`);
    }
  }

  return { sessions, failures, ignored };
}
