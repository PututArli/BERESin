import postgres from "postgres";

declare global {
  var __beresinSqlClient: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  const url = (process.env.DATABASE_URL ?? "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
  if (!url) return null;

  if (!global.__beresinSqlClient) {
    try {
      // Disable prepared statements so Supabase Transaction Pooler (:6543 on Vercel IPv4) works without statement cache errors.
      global.__beresinSqlClient = postgres(url, {
        ssl: "require",
        prepare: false,
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
      });
    } catch {
      return null;
    }
  }
  return global.__beresinSqlClient;
}
