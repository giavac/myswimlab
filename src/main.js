/**
 * Application controller: connect browser events, file sources, state, and views.
 *
 * This is intentionally the only module that coordinates all four layers.
 * FIT decoder, analytics, and folder reader never import anything from the UI.
 */
import { state, replaceSessions } from './state.js';
import { readFitFolder, parseFitFiles, entriesFromFiles } from './data/folder-source.js';
import { validateBackup } from './data/backup.js';
import {
  loadAnnotations, saveAnnotations, saveAnnotationsBatch, clearAnnotations,
  loadFolderHandle, saveFolderHandle, forgetFolderHandle
} from './data/storage.js';
import { query } from './ui/shared.js';
import { render, toast, downloadJson } from './ui/render.js';

let scanGeneration = 0;

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

/** Each rescan fully replaces visible sessions; an empty folder clears the UI. */
async function scanFolder(handle = state.folderHandle) {
  if (!handle) return;
  // Guard is established BEFORE awaiting permission or directory reads.
  const generation = ++scanGeneration;
  if (typeof handle.queryPermission === 'function') {
    const permission = await handle.queryPermission({ mode: 'read' });
    if (generation !== scanGeneration) return;
    if (permission !== 'granted') {
      replaceSessions([], 'folder');
      state.folderStatus = 'permission';
      render();
      return;
    }
  }

  replaceSessions([], 'folder');
  state.folderStatus = 'scanning';
  render();

  try {
    const { sessions, ignored, failures } = await readFitFolder(handle);
    await restoreAnnotations(sessions);

    if (generation !== scanGeneration) return; // Ignore a stale background completion.
    replaceSessions(sessions, 'folder');
    state.folderStatus = 'ready';
    render();
    toast(`Folder scanned: ${sessions.length} swimming session(s)${ignored ? `, ${ignored} non-swimming file(s) ignored` : ''}${failures.length ? `, ${failures.length} unreadable file(s)` : ''}.`);
    if (failures.length) console.warn('FIT files skipped:', failures);
  } catch (error) {
    if (generation !== scanGeneration) return;
    replaceSessions([], 'folder');
    state.folderStatus = 'error';
    render();
    alert(`Unable to read the chosen FIT folder: ${error.message}`);
  }
}

async function chooseFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    // Browser fallback: user must reselect the folder next time.
    query('#folderInput').click();
    return;
  }

  try {
    // Picker must be requested directly from a real user click.
    const handle = await window.showDirectoryPicker({ id: 'myswimlab-fit-folder', mode: 'read' });
    state.folderHandle = handle;
    state.folderName = handle.name;
    try {
      await saveFolderHandle(handle);
    } catch (error) {
      console.warn('Folder cannot be remembered:', error);
      toast('Folder can be read, but you may need to select it next time.');
    }
    await scanFolder(handle);
  } catch (error) {
    if (error.name !== 'AbortError') alert(`Could not choose FIT folder: ${error.message}`);
  }
}

async function refreshFolder() {
  const handle = state.folderHandle;
  if (!handle) return chooseFolder();
  const generation = ++scanGeneration;

  try {
    const permission = typeof handle.queryPermission === 'function'
      ? await handle.queryPermission({ mode: 'read' }) : 'granted';
    if (permission !== 'granted') {
      const renewed = typeof handle.requestPermission === 'function'
        ? await handle.requestPermission({ mode: 'read' }) : 'denied';
      if (generation !== scanGeneration) return;
      if (renewed !== 'granted') {
        replaceSessions([], 'folder');
        state.folderStatus = 'permission';
        render();
        return;
      }
    }
    if (generation !== scanGeneration) return;
    await scanFolder(handle);
  } catch (error) {
    if (generation === scanGeneration) alert(`Cannot access FIT folder: ${error.message}`);
  }
}

async function forgetFolder() {
  try {
    await forgetFolderHandle();
  } catch (error) {
    console.warn('Could not forget stored folder:', error);
  }
  scanGeneration++;
  state.folderHandle = null;
  state.folderName = '';
  state.folderStatus = 'unselected';
  replaceSessions([], 'folder');
  render();
  toast('Folder forgotten. No FIT files were deleted.');
}

async function importFiles(files) {
  if (!files.length) return;
  const generation = ++scanGeneration;
  const { sessions, failures } = await parseFitFiles(entriesFromFiles(files));
  if (generation !== scanGeneration) return;
  await restoreAnnotations(sessions);

  const combined = state.sourceMode === 'manual' ? [...state.sessions] : [];
  const existing = new Set(combined.map(session => session.id));
  for (const session of sessions) {
    if (!existing.has(session.id)) combined.push(session);
  }

  replaceSessions(combined, 'manual');
  render();
  toast(`Showing ${combined.length} manually imported FIT session(s).`);
  notifyFailures(failures);
}

async function importTemporaryFolder(files) {
  const generation = ++scanGeneration;
  const { sessions, failures } = await parseFitFiles(entriesFromFiles(files, true));
  if (generation !== scanGeneration) return;
  await restoreAnnotations(sessions);
  state.folderHandle = null;
  state.folderName = files[0]?.webkitRelativePath?.split('/')[0] || 'Selected folder';
  state.folderStatus = 'temporary';
  replaceSessions(sessions, 'folder');
  render();
  toast(`${sessions.length} swimming session(s) loaded. This browser requires reselecting the folder next time.`);
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
    if (backup.format !== 'myswimlab' || !Array.isArray(backup.sessions)) {
      throw new Error('Not a MySwimLab backup');
    }
    const sessions = validateBackup(backup); // All entries are checked before writes.
    await saveAnnotationsBatch(sessions);     // One transaction, all or nothing.
    scanGeneration++;
    state.drafts.clear();
    replaceSessions(sessions, 'manual');
    render();
    toast(`Restored ${sessions.length} session(s) into the manual view.`);
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
  } else if (data.folderSelect) {
    await chooseFolder();
  } else if (data.folderRefresh) {
    await refreshFolder();
  } else if (data.folderForget) {
    if (confirm('Forget the selected folder? This will not delete any files.')) await forgetFolder();
  } else if (data.upload) {
    query('#fileInput').click();
  } else if (data.save) {
    await saveSessionNotes(data.save);
  } else if (data.delete && state.sourceMode === 'manual') {
    if (confirm('Remove this manually imported session from the current view? Saved notes will be kept.')) {
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
    if (input.id === 'folderInput') await importTemporaryFolder([...input.files]);
    if (input.id === 'backupInput') await restoreBackup(input.files[0]);
  } catch (error) {
    alert(`Unable to read selected files: ${error.message}`);
  } finally {
    if (['fileInput', 'folderInput', 'backupInput'].includes(input.id)) input.value = '';
  }
}

async function boot() {
  // Never load demo sessions or cached activity history automatically.
  render();
  try {
    const handle = await loadFolderHandle();
    if (handle) {
      state.folderHandle = handle;
      state.folderName = handle.name;
      await scanFolder(handle);
    }
  } catch (error) {
    console.warn('Cannot restore saved FIT folder:', error);
    state.folderStatus = 'unselected';
    render();
  }
}

window.addEventListener('click', onClick);
window.addEventListener('change', onChange);
window.addEventListener('input', onInput);
boot();
