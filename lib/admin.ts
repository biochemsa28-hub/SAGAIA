// Owner-only access control for VYNAVO Nucleus (the admin command center).
// Set ADMIN_EMAILS in .env.local (comma-separated) to whitelist owner accounts.
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
