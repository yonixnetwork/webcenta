import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { buildPoolConfig } from "./db-config";
import { plainValue, searchDocument, SEARCH_SOURCE_FIELDS, touchesSearchFields, type SearchSource } from "./search/document";

/**
 * Single Prisma client per process, created lazily on first use (so `next build`
 * never needs database credentials). MySQL / MariaDB via the official MariaDB
 * driver adapter (it supports both engines). Connection details come from
 * DATABASE_URL (see src/server/db-config.ts).
 */
function createClient(): PrismaClient {
  const e = env();
  const { pool } = buildPoolConfig(e);
  const base = new PrismaClient({
    adapter: new PrismaMariaDb(pool),
    log: e.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return extendClient(base);
}

type Data = Record<string, unknown>;
const withDoc = (d: Data) => ({ ...d, ...searchDocument(d as unknown as SearchSource) });

/** Integrity rule errors (rules a CHECK constraint cannot express on MySQL/MariaDB). */
export class IntegrityError extends Error {}

const present = (v: unknown) => plainValue(v) !== null && plainValue(v) !== undefined;
/** GeoRestriction targets exactly one of a listing or a category. */
function assertOneGeoTarget(d: Data) {
  const listing = present(d.listingId) || present(d.listing);
  const category = present(d.categoryId) || present(d.category);
  if (listing === category) throw new IntegrityError("A geo restriction must target exactly one listing or one category.");
}
/** A category is never its own parent. */
function assertNotOwnParent(id: unknown, d: Data) {
  const parent = plainValue(d.parentId) ?? (d.parent as { connect?: { id?: string } } | undefined)?.connect?.id;
  if (id && parent && parent === id) throw new IntegrityError("A category cannot be its own parent.");
}

/**
 * Prisma client extension that implements, in application code, rules the
 * database cannot express:
 *  - Listing.searchText / searchTrigrams (derived FULLTEXT columns) stay in sync;
 *  - GeoRestriction has exactly one target; a Category is not its own parent
 *    (MySQL and MariaDB forbid CHECK constraints on foreign-key columns).
 *
 * Keeps Listing.searchText / searchTrigrams in sync with the content columns.
 * Creates compute them from the data being written. Updates that touch content
 * read the current row (a plain, non-locking read, so it can never deadlock
 * with an open transaction), overlay the new values and write everything in
 * the same statement. The hourly maintenance job reconciles anything missed.
 */
export function extendClient(base: PrismaClient): PrismaClient {
  const current = async (where: unknown): Promise<Data> =>
    ((await base.listing.findUnique({
      where: where as never,
      select: Object.fromEntries(SEARCH_SOURCE_FIELDS.map((f) => [f, true])) as never,
    })) ?? {}) as Data;
  const merged = async (where: unknown, data: Data): Promise<Data> => {
    const now = await current(where);
    const next: Data = { ...now };
    for (const f of SEARCH_SOURCE_FIELDS) if (f in data) next[f] = plainValue(data[f]);
    return { ...data, ...searchDocument(next as unknown as SearchSource) };
  };
  return base.$extends({
    query: {
      listing: {
        async create({ args, query }) {
          return query({ ...args, data: withDoc(args.data as Data) as never });
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          return query({ ...args, data: rows.map((r) => withDoc(r as Data)) as never });
        },
        async update({ args, query }) {
          if (!touchesSearchFields(args.data as Data)) return query(args);
          return query({ ...args, data: (await merged(args.where, args.data as Data)) as never });
        },
        async upsert({ args, query }) {
          const update = touchesSearchFields(args.update as Data) ? await merged(args.where, args.update as Data) : args.update;
          return query({ ...args, create: withDoc(args.create as Data) as never, update: update as never });
        },
        async updateMany({ args, query }) {
          if (touchesSearchFields(args.data as Data)) {
            throw new Error("Listing content must be changed with listing.update (keeps search columns in sync).");
          }
          return query(args);
        },
      },
      geoRestriction: {
        async create({ args, query }) {
          assertOneGeoTarget(args.data as Data);
          return query(args);
        },
        async createMany({ args, query }) {
          for (const r of Array.isArray(args.data) ? args.data : [args.data]) assertOneGeoTarget(r as Data);
          return query(args);
        },
        async upsert({ args, query }) {
          assertOneGeoTarget(args.create as Data);
          return query(args);
        },
        async update({ args, query }) {
          const d = args.data as Data;
          if (["listingId", "categoryId", "listing", "category"].some((k) => k in d)) {
            const now = (await base.geoRestriction.findUnique({ where: args.where, select: { listingId: true, categoryId: true } })) ?? {};
            assertOneGeoTarget({ ...now, ...d });
          }
          return query(args);
        },
      },
      category: {
        async create({ args, query }) {
          assertNotOwnParent((args.data as Data).id, args.data as Data);
          return query(args);
        },
        async update({ args, query }) {
          assertNotOwnParent((args.where as Data).id, args.data as Data);
          return query(args);
        },
        async upsert({ args, query }) {
          assertNotOwnParent((args.where as Data).id, args.update as Data);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

const g = globalThis as unknown as { __webcentaPrisma?: PrismaClient };

function client(): PrismaClient {
  g.__webcentaPrisma ??= createClient();
  return g.__webcentaPrisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
