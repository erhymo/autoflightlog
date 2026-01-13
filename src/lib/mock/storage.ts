const DB_KEY = "pilotlog_db_v1";

type Db = {
  templates: Record<string, any>;
  views: Record<string, any>;
  entries: Record<string, any>;
  connectors: Record<string, any>;
  user: Record<string, any>;
  integrationRequests: Record<string, any>;
};

function defaultDb(): Db {
  return { templates: {}, views: {}, entries: {}, connectors: {}, user: {}, integrationRequests: {} };
}

export function loadDb(): Db {
  if (typeof window === "undefined") return defaultDb();
  const raw = localStorage.getItem(DB_KEY);
  return raw ? (JSON.parse(raw) as Db) : defaultDb();
}

export function saveDb(db: Db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function updateDb(mutator: (db: Db) => void) {
  const db = loadDb();
  mutator(db);
  saveDb(db);
}

