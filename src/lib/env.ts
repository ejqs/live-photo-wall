/** Public base URL of the app, without a trailing slash. */
export function appUrl(): string {
  const url = process.env.BETTER_AUTH_URL || process.env.APP_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
