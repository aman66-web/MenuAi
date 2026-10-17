import { execFileSync } from "node:child_process";

// A tiny stand-in for supabase-js that runs the queries the Community adapter makes (lib/store-supabase-community.ts) against a REAL Postgres through psql,
// as the service_role, so the adapter is tested against the real tables of supabase/migrations/20261016120000_community.sql: the columns, the constraints,
// the foreign keys, the cascade. It knows only the handful of builder calls the adapter uses; anything else throws, so it can't pass by accident.
// It translates the same filter syntax PostgREST reads (.or("and(a.eq.1,b.eq.2),and(...)")). Used by tests/communityAdapter.test.ts, which is skipped
// unless COMMUNITY_TEST_PG points at a scratch database.

export interface PgTarget {
  host: string;
  port: string;
  db: string;
  user: string;
}

/** "127.0.0.1:54329/scratch" or "user@127.0.0.1:54329/scratch". */
export function parseTarget(spec: string): PgTarget {
  const m = spec.match(/^(?:([a-z_]+)@)?([^:/]+):(\d+)\/([a-z_0-9]+)$/);
  if (!m) throw new Error(`COMMUNITY_TEST_PG should look like host:port/database, got ${spec}`);
  return { user: m[1] ?? "postgres", host: m[2]!, port: m[3]!, db: m[4]! };
}

export function runSql(target: PgTarget, sql: string): { out: string; error: { code: string; message: string; details: string | null } | null } {
  try {
    const out = execFileSync(
      "psql",
      ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.db, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", sql],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { out: out.trim(), error: null };
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? e);
    const head = stderr.match(/ERROR:\s+(\w{5}):\s+(.*)/);
    const detail = stderr.match(/DETAIL:\s+(.*)/);
    if (!head) throw e;
    return { out: "", error: { code: head[1]!, message: head[2]!, details: detail?.[1] ?? null } };
  }
}

const OPS: Record<string, string> = { eq: "=", gt: ">", gte: ">=", lt: "<" };
const ident = (c: string): string => {
  if (!/^[a-z_]+$/.test(c)) throw new Error(`odd column name ${c}`);
  return `"${c}"`;
};
const lit = (v: unknown): string => {
  if (v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  throw new Error(`odd value ${String(v)}`);
};

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function orItem(s: string): string {
  const group = s.match(/^and\(([\s\S]*)\)$/);
  if (group) return `(${splitTop(group[1]!).map(orItem).join(" and ")})`;
  const leaf = s.match(/^([a-z_]+)\.(eq|gt|gte|lt)\.([0-9a-fA-F-]+)$/);
  if (!leaf) throw new Error(`filter this stand-in does not understand: ${s}`);
  return `${ident(leaf[1]!)} ${OPS[leaf[2]!]} ${lit(leaf[3])}`;
}

type Result = { data: unknown; error: { code?: string; message: string; details?: string | null } | null; count: number | null };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private values: Record<string, unknown> = {};
  private where: string[] = [];
  private orderSql: string | null = null;
  private max: number | null = null;
  private wantCount = false;
  private head = false;
  private one: "single" | "maybe" | null = null;

  constructor(private target: PgTarget, private table: string) {
    ident(table);
  }

  select(columns: string, opts?: { count?: "exact"; head?: boolean }) {
    if (this.op === "select") {
      this.columns = columns;
      this.wantCount = opts?.count === "exact";
      this.head = opts?.head === true;
    } else this.returning = columns;
    return this;
  }
  insert(values: Record<string, unknown>) { this.op = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>) { this.op = "update"; this.values = values; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, v: unknown) { this.where.push(`${ident(col)} = ${lit(v)}`); return this; }
  gt(col: string, v: unknown) { this.where.push(`${ident(col)} > ${lit(v)}`); return this; }
  gte(col: string, v: unknown) { this.where.push(`${ident(col)} >= ${lit(v)}`); return this; }
  lt(col: string, v: unknown) { this.where.push(`${ident(col)} < ${lit(v)}`); return this; }
  neq(col: string, v: unknown) { this.where.push(`${ident(col)} <> ${lit(v)}`); return this; }
  is(col: string, v: null) { if (v !== null) throw new Error("is() only with null"); this.where.push(`${ident(col)} is null`); return this; }
  in(col: string, vs: unknown[]) { this.where.push(`${ident(col)} in (${vs.map(lit).join(", ")})`); return this; }
  or(filters: string) { this.where.push(`(${splitTop(filters).map(orItem).join(" or ")})`); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderSql = `${ident(col)} ${opts?.ascending === false ? "desc" : "asc"}`; return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }

  private sql(): string {
    const ret = (this.returning ?? "id").split(",").map((c) => c.trim()).map(ident).join(", ");
    const where = this.where.length ? ` where ${this.where.join(" and ")}` : "";
    const t = `public.${ident(this.table)}`;
    if (this.op === "select") {
      if (this.head && this.wantCount) return `select count(*) from ${t}${where}`;
      const cols = this.columns.split(",").map((c) => c.trim()).map(ident).join(", ");
      const q = `select ${cols} from ${t}${where}${this.orderSql ? ` order by ${this.orderSql}` : ""}${this.max !== null ? ` limit ${this.max}` : ""}`;
      return `select coalesce(json_agg(q), '[]'::json) from (${q}) q`;
    }
    const wrap = (stmt: string) => `with r as (${stmt}) select coalesce(json_agg(r), '[]'::json) from r`;
    if (this.op === "insert") {
      const keys = Object.keys(this.values);
      return wrap(`insert into ${t} (${keys.map(ident).join(", ")}) values (${keys.map((k) => lit(this.values[k])).join(", ")}) returning ${ret}`);
    }
    if (this.op === "update") {
      return wrap(`update ${t} set ${Object.entries(this.values).map(([k, v]) => `${ident(k)} = ${lit(v)}`).join(", ")}${where} returning ${ret}`);
    }
    return wrap(`delete from ${t}${where} returning ${ret}`);
  }

  private async run(): Promise<Result> {
    const { out, error } = runSql(this.target, `set role service_role; ${this.sql()}`);
    if (error) return { data: null, error, count: null };
    if (this.head && this.wantCount) return { data: null, error: null, count: Number(out) };
    let rows = JSON.parse(out) as unknown[];
    // an insert/update/delete only returns rows when .select() was chained; the adapter only reads them then
    if (this.op !== "select" && this.returning === null) rows = [];
    if (this.one) {
      if (rows.length > 1 || (this.one === "single" && rows.length === 0)) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, count: null };
      return { data: rows[0] ?? null, error: null, count: null };
    }
    return { data: rows, error: null, count: null };
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/** The bit of SupabaseClient the adapter uses. */
export function fakeSupabaseOverPsql(target: PgTarget) {
  return { from: (table: string) => new Query(target, table) };
}
