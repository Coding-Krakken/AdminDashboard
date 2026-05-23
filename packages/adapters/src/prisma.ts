import type { AuditAdapter, AuditEvent, DataAdapter } from "./index";

type PrismaDelegate = {
  findMany?: (args?: Record<string, unknown>) => Promise<unknown>;
  findUnique?: (args?: Record<string, unknown>) => Promise<unknown>;
  create?: (args?: Record<string, unknown>) => Promise<unknown>;
  update?: (args?: Record<string, unknown>) => Promise<unknown>;
  upsert?: (args?: Record<string, unknown>) => Promise<unknown>;
  delete?: (args?: Record<string, unknown>) => Promise<unknown>;
};

export interface PrismaLikeClient {
  [delegate: string]: PrismaDelegate | unknown;
}

const parseKey = (key: string): { model: string; operation: string } => {
  const [model, operation = "findMany"] = key.split(":");
  if (!model) {
    throw new Error(`Invalid adapter key '${key}'. Use 'model:operation'.`);
  }

  return { model, operation };
};

export function createPrismaDataAdapter(client: PrismaLikeClient): DataAdapter {
  return {
    async query<T>(key: string, params?: Record<string, unknown>): Promise<T> {
      const { model, operation } = parseKey(key);
      const delegate = client[model] as PrismaDelegate | undefined;
      const fn = delegate?.[operation as keyof PrismaDelegate];

      if (typeof fn !== "function") {
        throw new Error(
          `Prisma delegate '${model}.${operation}' is not available on the provided client.`
        );
      }

      return (await fn(params)) as T;
    },
    async mutate<T>(key: string, payload?: unknown): Promise<T> {
      const { model, operation } = parseKey(key);
      const delegate = client[model] as PrismaDelegate | undefined;
      const fn = delegate?.[operation as keyof PrismaDelegate];

      if (typeof fn !== "function") {
        throw new Error(
          `Prisma delegate '${model}.${operation}' is not available on the provided client.`
        );
      }

      return (await fn(payload as Record<string, unknown> | undefined)) as T;
    }
  };
}

export interface PrismaAuditOptions {
  modelKey?: string;
}

export interface PrismaKeyValueDataOptions {
  modelKey?: string;
  keyField?: string;
  tenantField?: string;
  valueField?: string;
  tenantId?: string;
}

export function createPrismaKeyValueDataAdapter(
  client: PrismaLikeClient,
  options: PrismaKeyValueDataOptions = {}
): DataAdapter {
  const modelKey = options.modelKey ?? "runtimeState";
  const keyField = options.keyField ?? "key";
  const tenantField = options.tenantField ?? "tenantId";
  const valueField = options.valueField ?? "value";
  const defaultTenantId = options.tenantId ?? "default-tenant";

  return {
    async query<T>(key: string, params?: Record<string, unknown>): Promise<T> {
      const delegate = client[modelKey] as PrismaDelegate | undefined;
      const findUnique = delegate?.findUnique;

      if (typeof findUnique !== "function") {
        throw new Error(
          `Prisma key-value model '${modelKey}.findUnique' is not available on the provided client.`
        );
      }

      const tenantId =
        typeof params?.tenantId === "string" ? params.tenantId : defaultTenantId;

      const record = (await findUnique({
        where: {
          [`${tenantField}_${keyField}`]: {
            [tenantField]: tenantId,
            [keyField]: key
          }
        }
      })) as Record<string, unknown> | null;

      if (!record) {
        return undefined as T;
      }

      return record[valueField] as T;
    },
    async mutate<T>(key: string, payload?: unknown): Promise<T> {
      const delegate = client[modelKey] as PrismaDelegate | undefined;
      const upsert = delegate?.upsert;

      if (typeof upsert !== "function") {
        throw new Error(
          `Prisma key-value model '${modelKey}.upsert' is not available on the provided client.`
        );
      }

      const record = (payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const tenantId =
        typeof record.tenantId === "string" ? record.tenantId : defaultTenantId;

      const persisted = (await upsert({
        where: {
          [`${tenantField}_${keyField}`]: {
            [tenantField]: tenantId,
            [keyField]: key
          }
        },
        create: {
          [tenantField]: tenantId,
          [keyField]: key,
          [valueField]: payload ?? null
        },
        update: {
          [valueField]: payload ?? null
        }
      })) as Record<string, unknown>;

      return persisted[valueField] as T;
    }
  };
}

export function createPrismaAuditAdapter(
  client: PrismaLikeClient,
  options: PrismaAuditOptions = {}
): AuditAdapter {
  const modelKey = options.modelKey ?? "auditEvent";

  return {
    async record(event: AuditEvent): Promise<void> {
      const delegate = client[modelKey] as PrismaDelegate | undefined;
      const create = delegate?.create;

      if (typeof create !== "function") {
        throw new Error(
          `Prisma audit model '${modelKey}.create' is not available on the provided client.`
        );
      }

      await create({ data: event });
    }
  };
}
