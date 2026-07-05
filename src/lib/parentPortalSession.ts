const STORAGE_KEY = "asobilab_parent_portal_v1";

export type ParentPortalSession = {
  portalId: string;
  birthday: string;
};

export function readParentPortalSession(): ParentPortalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParentPortalSession;
    if (!parsed.portalId?.trim() || !parsed.birthday?.trim()) return null;
    return { portalId: parsed.portalId.trim(), birthday: parsed.birthday.trim() };
  } catch {
    return null;
  }
}

export function writeParentPortalSession(session: ParentPortalSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      portalId: session.portalId.trim(),
      birthday: session.birthday.trim(),
    })
  );
}

export function clearParentPortalSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function applyUrlWithSession(session: ParentPortalSession): string {
  const params = new URLSearchParams({
    portal_id: session.portalId,
    birthday: session.birthday,
  });
  return `/apply?${params.toString()}`;
}
