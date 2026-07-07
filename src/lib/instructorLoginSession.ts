const STORAGE_KEY = "asobilab_instructor_login_v1";

export type InstructorLoginSession = {
  email: string;
  phoneLast4: string;
};

export function readInstructorLoginSession(): InstructorLoginSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InstructorLoginSession;
    const email = parsed.email?.trim();
    const phoneLast4 = parsed.phoneLast4?.replace(/\D/g, "").slice(-4);
    if (!email || phoneLast4.length !== 4) return null;
    return { email, phoneLast4 };
  } catch {
    return null;
  }
}

export function writeInstructorLoginSession(session: InstructorLoginSession): void {
  if (typeof window === "undefined") return;
  const phoneLast4 = session.phoneLast4.replace(/\D/g, "").slice(-4);
  if (!session.email.trim() || phoneLast4.length !== 4) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      email: session.email.trim(),
      phoneLast4,
    })
  );
}

export function clearInstructorLoginSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
