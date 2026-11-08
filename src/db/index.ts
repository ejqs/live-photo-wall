import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __lpwDb?: DB; __lpwSql?: postgres.Sql };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10) });
  globalForDb.__lpwSql = client;
  return drizzle(client, { schema });
}

/** Lazily created so `next build` works without a database. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    globalForDb.__lpwDb ??= create();
    const value = Reflect.get(globalForDb.__lpwDb, prop);
    return typeof value === "function" ? value.bind(globalForDb.__lpwDb) : value;
  },
});

export function rawSql(): postgres.Sql {
  globalForDb.__lpwDb ??= create();
  return globalForDb.__lpwSql!;
}

export { schema };
