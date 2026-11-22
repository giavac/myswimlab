/**
 * Application controller: connect browser events, file imports, state, and views.
 *
 * This is intentionally the only module that coordinates all four layers.
 * FIT decoder, analytics, and file importer never import anything from the UI.
 */
import { state, replaceSessions } from './state.js';
import { parseFitFiles } from './data/fit-import.js';
import { validateBackup } from './data/backup.js';
import {
  loadAnnotations, saveAnnotations, saveAnnotationsBatch, clearAnnotations
} from './data/storage.js';
import { query } from './ui/shared.js';
import { render, toast, downloadJson } from './ui/render.js';

let importGeneration = 0;

function notifyFailures(failures) {
  if (failures.length) {
    console.warn('FIT files skipped:', failures);
    alert(`Some files could not be read:\n${failures.join('\n')}`);
  }
}

async function restoreAnnotations(sessions) {
  try {
    const stored = new Map((await loadAnnotations()).map(session => [session.id, session]));
    for (const session of sessions) {
      const old = stored.get(session.id);
      if (old) {
        session.notes = old.notes || '';
        session.equipment = old.equipment || [];
        session.lengthOverrides = old.lengthOverrides || {};
      }
    }
  } catch (error) {
    console.warn('Saved annotations unavailable:', error);
  }
}

async function importFiles(files) {
  if (!files.length) return;
  const generation = ++importGeneration;
  const { sessions, failures } = await parseFitFiles(files);
  await restoreAnnotations(sessions);
  if (generation !== importGeneration) return;

  const combined = [...state.sessions];
  const existing = new Set(combined.map(session => session.id));
  for (const session of sessions) {
    if (!existing.has(session.id)) combined.push(session);
  }

  replaceSessions(combined);
  render();
  toast(`Showing ${combined.length} manually imported FIT session(s).`);
  notifyFailures(failures);
}

async function saveSessionNotes(id) {
  const session = state.sessions.find(item => item.id === id);
  if (!session) return;

  session.notes = query('#notes').value;
  session.equipment = query('#equipment').value.split(',').map(value => value.trim()).filter(Boolean);
  state.drafts.delete(id);
  try {
    await saveAnnotations(session);
    toast('Annotations saved in this browser.');
  } catch (error) {
    alert(`Unable to store annotations: ${error.message}`);
  }
}

async function clearSavedNotes() {
  await clearAnnotations();
  state.drafts.clear();
  for (const session of state.sessions) {
    session.notes = '';
    session.equipment = [];
    session.lengthOverrides = {};
  }
  render();
  toast('Saved annotations and length decisions cleared.');
}

async function restoreBackup(file) {
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());
    const sessions = validateBackup(backup); // All entries are checked before writes.
    await saveAnnotationsBatch(sessions);     // One transaction, all or nothing.
    importGeneration++;
    state.drafts.clear();
    replaceSessions(sessions);
    render();
    toast(`Restored ${sessions.length} session(s).`);
  } catch (error) {
    alert(`Could not restore backup: ${error.message}`);
  }
}

/** Save a user's explicit decision without ever modifying the source FIT file. */
async function changeLengthQuality(sequence, decision) {
  const session = state.sessions.find(item => item.id === state.selectedSessionId);
  if (!session || !Number.isInteger(sequence) || !['keep', 'exclude', 'reset'].includes(decision)) return;
  if (!session.lengths.some((length, index) =>
    (Number.isInteger(length.sequence) ? length.sequence : index) === sequence && !length.isRest)) return;

  const previous = { ...(session.lengthOverrides || {}) };
  const updated = { ...previous };
  if (decision === 'reset') delete updated[String(sequence)];
  else updated[String(sequence)] = decision;
  session.lengthOverrides = updated;

  try {
    await saveAnnotations(session);
    render();
    toast('Length quality decision saved locally. FIT file unchanged.');
  } catch (error) {
    session.lengthOverrides = previous;
    render();
    alert(`Could not save length quality decision: ${error.message}`);
  }
}

/** All actions use event delegation, so rerendering does not lose listeners. */
async function onClick(event) {
  const element = event.target.closest('button, tr[data-select]');
  if (!element) return;
  const data = element.dataset;

  if (data.page) {
    state.page = data.page;
    render();
  } else if (data.openSession || data.select) {
    state.selectedSessionId = data.openSession || data.select;
    state.page = 'session-detail';
    render();
  } else if (data.jumpLength !== undefined) {
    query(`#length-${Number(data.jumpLength)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (data.qualitySequence !== undefined) {
    await changeLengthQuality(Number(data.qualitySequence), data.qualityDecision);
  } else if (data.period) {
    state.period = data.period;
    render();
  } else if (data.upload) {
    query('#fileInput').click();
  } else if (data.save) {
    await saveSessionNotes(data.save);
  } else if (data.delete) {
    if (confirm('Remove this session from the current view? Saved notes will be kept.')) {
      state.sessions = state.sessions.filter(session => session.id !== data.delete);
      state.drafts.delete(data.delete);
      state.selectedSessionId = null;
      state.page = 'sessions';
      render();
      toast('Session removed from view. Saved annotations are unchanged.');
    }
  } else if (data.clear) {
    if (confirm('Clear stored notes, equipment and length-quality decisions? FIT files on disk will not be deleted.')) {
      try { await clearSavedNotes(); }
      catch (error) { alert(`Unable to clear notes: ${error.message}`); }
    }
  } else if (data.export) {
    downloadJson('myswimlab-backup.json', {
      format: 'myswimlab', version: 2,
      exportedAt: new Date().toISOString(), sessions: state.sessions
    });
  } else if (data.restore) {
    query('#backupInput').click();
  }
}

function onInput(event) {
  if (!['notes', 'equipment'].includes(event.target.id)) return;
  const id = state.selectedSessionId;
  if (!id) return;
  const existing = state.drafts.get(id) || {
    notes: state.sessions.find(session => session.id === id)?.notes || '',
    equipment: (state.sessions.find(session => session.id === id)?.equipment || []).join(', ')
  };
  existing[event.target.id] = event.target.value;
  state.drafts.set(id, existing);
}

async function onChange(event) {
  const input = event.target;
  try {
    if (input.id === 'fileInput') await importFiles([...input.files]);
    if (input.id === 'backupInput') await restoreBackup(input.files[0]);
  } catch (error) {
    alert(`Unable to read selected files: ${error.message}`);
  } finally {
    if (['fileInput', 'backupInput'].includes(input.id)) input.value = '';
  }
}

window.addEventListener('click', onClick);
window.addEventListener('change', onChange);
window.addEventListener('input', onInput);
render();
