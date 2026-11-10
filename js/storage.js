const DB_NAME = "kraftwerk24-local";
const DB_VERSION = 1;
const STORE = "app";

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB wird von diesem Browser nicht unterstützt."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Datenbank konnte nicht geöffnet werden."));
  });
}

export async function loadState() {
  try {
    const db = await openDB();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get("main");
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch (error) {
    console.warn("IndexedDB nicht verfügbar:", error);
    try {
      const raw = localStorage.getItem("kraftwerk24-fallback");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

export async function saveState(data) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id: "main", data });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Speichern abgebrochen."));
    });
    db.close();
    return true;
  } catch (error) {
    console.warn("IndexedDB-Speicherung fehlgeschlagen:", error);
    try {
      localStorage.setItem("kraftwerk24-fallback", JSON.stringify(data));
      return true;
    } catch (fallbackError) {
      console.error(fallbackError);
      return false;
    }
  }
}
