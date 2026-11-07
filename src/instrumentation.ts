/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  try {
    const { staleCleanup } = await import("@/lib/exports");
    await staleCleanup();
  } catch (e) {
    console.error("startup cleanup failed", e);
  }
}
