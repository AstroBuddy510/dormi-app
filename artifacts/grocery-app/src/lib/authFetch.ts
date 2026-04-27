/**
 * Wrapper around `fetch` that auto-attaches the JWT bearer token from the
 * Zustand auth store (persisted in localStorage as `grocerease-auth`).
 *
 * Use for any agent/admin/accountant/rider-side fetch hitting an API path
 * that's gated by the `authenticate` middleware. Without this wrapper the
 * request returns 401 → response body is `{error}` (an object) → callers
 * doing `.filter`/`.reduce`/`.map` on the result throw and crash the page.
 */
function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("grocerease-auth");
    if (!raw) return {};
    const token = JSON.parse(raw)?.state?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Returns a JSON body or [] / {} fallback if the response isn't a valid array/object. */
export async function authFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  // We deliberately don't throw on non-2xx — many existing call sites
  // expect to read whatever the server returned. The defensive
  // Array.isArray()/typeof checks at call sites guard against shape drift.
  return (await r.json().catch(() => null)) as T;
}

/** Convenience: returns [] if the response isn't an array. Use for list endpoints. */
export async function authFetchArray<T = any>(path: string, init?: RequestInit): Promise<T[]> {
  const v = await authFetch<unknown>(path, init);
  return Array.isArray(v) ? (v as T[]) : [];
}
