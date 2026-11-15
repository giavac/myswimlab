/**
 * Browser-only persistence. Imported FIT records are NOT a startup data source.
 * A saved annotation stores the FULL normalized session object, including
 * individual lengths, in IndexedDB. Cached sessions are never loaded as the
 * app's startup history; they are consulted only for annotation recovery.
 */
const DATABASE_NAME = 'myswimlab-local-v1'; // Keep name for v0.3.1 compatibility
const DATABASE_VERSION = 2;
const SESSION_STORE = 'sessions';
const CONFIG_STORE = 'configuration';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(CONFIG_STORE)) {
        database.createObjectStore(CONFIG_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(storeName, mode, makeRequest) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = makeRequest(tx.objectStore(storeName));
    let result;

    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => { database.close(); resolve(result); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => { database.close(); reject(tx.error); };
  });
}

export const loadAnnotations = () => transaction(SESSION_STORE, 'readonly', store => store.getAll());
export const saveAnnotations = session => transaction(SESSION_STORE, 'readwrite', store => store.put(session));

/** Commit a complete restore in one IndexedDB transaction (all or nothing). */
export async function saveAnnotationsBatch(sessions) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SESSION_STORE, 'readwrite');
    const store = tx.objectStore(SESSION_STORE);
    for (const session of sessions) store.put(session);
    tx.oncomplete = () => { database.close(); resolve(); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => { database.close(); reject(tx.error); };
  });
}
export const deleteAnnotations = id => transaction(SESSION_STORE, 'readwrite', store => store.delete(id));
export const clearAnnotations = () => transaction(SESSION_STORE, 'readwrite', store => store.clear());

export const loadFolderHandle = () => transaction(CONFIG_STORE, 'readonly', store => store.get('fit-folder'));
export const saveFolderHandle = handle => transaction(CONFIG_STORE, 'readwrite', store => store.put(handle, 'fit-folder'));
export const forgetFolderHandle = () => transaction(CONFIG_STORE, 'readwrite', store => store.delete('fit-folder'));
