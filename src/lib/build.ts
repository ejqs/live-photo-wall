/** Set at build time in next.config.ts and inlined into both server and client code. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
