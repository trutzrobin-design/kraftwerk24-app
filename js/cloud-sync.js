/*
 * KRAFTWERK 24 – Cloud adapter seam
 * Version 1.0 is local-only. No provider, account, credentials or endpoint is configured.
 * A future backend adapter must implement:
 *   pushState(state) -> Promise<{ ok: boolean }>
 *   pullState()      -> Promise<state | null>
 * Do not put secrets or private API keys in this browser-side file.
 */
let adapter = null;

export function registerCloudAdapter(nextAdapter) {
  if (!nextAdapter || typeof nextAdapter.pushState !== "function" || typeof nextAdapter.pullState !== "function") {
    throw new Error("Cloud adapter must implement pushState and pullState.");
  }
  adapter = nextAdapter;
}

export function getCloudSyncStatus() {
  return adapter
    ? { configured: true, label: "Cloud-Adapter registriert; Synchronisierung muss noch explizit gestartet werden." }
    : { configured: false, label: "Cloud-Anbindung vorbereitet, aber noch nicht konfiguriert." };
}

export async function pushCloudState(state) {
  if (!adapter) return { ok: false, reason: "not-configured" };
  return adapter.pushState(state);
}

export async function pullCloudState() {
  if (!adapter) return null;
  return adapter.pullState();
}
