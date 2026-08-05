import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ─── Who is making this request? ─────────────────────────────────────────────
// Two callers reach the production routes:
//   1. A browser with a NextAuth session — the normal case.
//   2. The job worker, which has no cookie because the user closed the tab hours
//      ago. It authenticates with a shared secret and states which user the work
//      belongs to.
//
// The secret is a real key: whoever holds it can act as ANY user. So it fails
// closed — no INTERNAL_JOB_SECRET in the environment means internal auth simply
// does not exist and only sessions work. Compared in constant time so a caller
// can't discover it byte by byte.

const HEADER = "x-vynavo-internal";

export function internalSecret(): string | null {
  const s = process.env.INTERNAL_JOB_SECRET ?? "";
  return s.length >= 16 ? s : null;   // too short to be a secret → treat as unset
}

function secretMatches(provided: string | null): boolean {
  const expected = internalSecret();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;   // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

export function internalHeaders(): Record<string, string> {
  const s = internalSecret();
  return s ? { [HEADER]: s } : {};
}

// Returns the acting user id, or null when the caller is not authenticated.
// `body` is the already-parsed request body — internal callers pass `user_id`
// there; it is IGNORED unless the secret checks out, so a browser can never
// impersonate someone by adding the field.
export async function resolveRequestUserId(
  req: NextRequest,
  body?: unknown,
): Promise<string | null> {
  if (secretMatches(req.headers.get(HEADER))) {
    const claimed = (body as Record<string, unknown> | undefined)?.["user_id"];
    if (typeof claimed === "string" && claimed.length > 0) return claimed;
  }
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}
