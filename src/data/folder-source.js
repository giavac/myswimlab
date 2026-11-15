/**
 * Read FIT files from browser File objects or a selected directory handle.
 * No DOM manipulation, storage access, or global UI state in this module.
 */
import { parseFit } from '../fit/swimming-parser.js';

const MAX_FILES = 300;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Enumerate a directory recursively using the standard File System Access API.
 * @returns {Promise<Array<{handle: FileSystemFileHandle, path: string}>>}
 */
export async function listFitEntries(directory, prefix = '') {
  const files = [];

  for await (const entry of directory.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      files.push(...await listFitEntries(entry, path));
    } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.fit')) {
      files.push({ handle: entry, path });
    }

    if (files.length > MAX_FILES) {
      throw new Error(`Folder contains over ${MAX_FILES} FIT files. Choose a smaller folder.`);
    }
  }

  return files;
}

/**
 * @param {Array<{file: File, path: string}>} entries
 * @returns {Promise<{sessions: object[], failures: string[], ignored: number}>}
 */
export async function parseFitFiles(entries) {
  const candidates = entries.filter(entry => entry.file.name.toLowerCase().endsWith('.fit'));
  if (candidates.length > MAX_FILES) {
    throw new Error(`Selection contains over ${MAX_FILES} FIT files. Choose fewer files.`);
  }
  const sessions = [];
  const failures = [];
  const seen = new Set();
  let ignored = 0;

  for (const { file, path } of candidates) {
    if (file.size > MAX_FILE_BYTES) {
      failures.push(`${path}: exceeds 25 MB`);
      continue;
    }

    try {
      const buffer = await file.arrayBuffer();
      // Hash only files without any FIT activity timestamp, for a stable ID.
      // A per-file SHA-256 also allows future importers to identify duplicates.
      const hashBytes = await crypto.subtle.digest('SHA-256', buffer);
      const fileHash = [...new Uint8Array(hashBytes)]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackDate = Number.isFinite(file.lastModified) && file.lastModified > 0
        ? new Date(file.lastModified).toISOString()
        : '1989-12-31T00:00:00.000Z';
      const session = parseFit(buffer, file.name, { fileHash, fallbackDate });
      session.filename = path;
      if (seen.has(session.id)) continue;
      seen.add(session.id);
      sessions.push(session);
    } catch (error) {
      const expected = /non-swimming activity|does not contain a swimming session/i;
      if (expected.test(error.message)) ignored++;
      else failures.push(`${path}: ${error.message}`);
    }
  }

  return { sessions, failures, ignored };
}

export async function readFitFolder(directory) {
  const entries = await listFitEntries(directory);
  const files = [];
  for (const entry of entries) {
    files.push({ file: await entry.handle.getFile(), path: entry.path });
  }
  return parseFitFiles(files);
}

export function entriesFromFiles(files, useRelativePaths = false) {
  return Array.from(files, file => ({
    file,
    path: useRelativePaths ? file.webkitRelativePath || file.name : file.name
  }));
}
