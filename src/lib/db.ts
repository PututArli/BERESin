import postgres from "postgres";

declare global {
  var __beresinSqlClient: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  if (!global.__beresinSqlClient) {
    global.__beresinSqlClient = postgres(url, {
      ssl: "require",
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return global.__beresinSqlClient;
}
