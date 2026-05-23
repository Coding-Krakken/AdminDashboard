import { describe, expect, it } from "vitest";
import {
  createPrismaDataAdapter,
  createPrismaKeyValueDataAdapter,
  type PrismaLikeClient
} from "../prisma";

describe("prisma adapters", () => {
  it("routes model operations through generic prisma data adapter", async () => {
    const client: PrismaLikeClient = {
      users: {
        findMany: async (args?: Record<string, unknown>) => [
          { id: "u1", ...(args ?? {}) }
        ]
      }
    };

    const adapter = createPrismaDataAdapter(client);
    const rows = await adapter.query<Array<{ id: string }>>("users:findMany", {
      take: 1
    });

    expect(rows[0].id).toBe("u1");
  });

  it("persists tenant-scoped key values with prisma upsert/findUnique", async () => {
    const db = new Map<string, unknown>();

    const client: PrismaLikeClient = {
      runtimeState: {
        findUnique: async (args?: Record<string, unknown>) => {
          const where = args?.where as Record<string, unknown>;
          const compound = where.tenantId_key as Record<string, unknown>;
          const storageKey = `${compound.tenantId}:${compound.key}`;
          const value = db.get(storageKey);
          if (value === undefined) {
            return null;
          }

          return {
            tenantId: compound.tenantId,
            key: compound.key,
            value
          };
        },
        upsert: async (args?: Record<string, unknown>) => {
          const where = args?.where as Record<string, unknown>;
          const compound = where.tenantId_key as Record<string, unknown>;
          const create = args?.create as Record<string, unknown>;
          const update = args?.update as Record<string, unknown>;
          const storageKey = `${compound.tenantId}:${compound.key}`;

          if (db.has(storageKey)) {
            db.set(storageKey, update.value);
          } else {
            db.set(storageKey, create.value);
          }

          return {
            tenantId: compound.tenantId,
            key: compound.key,
            value: db.get(storageKey)
          };
        }
      }
    };

    const adapter = createPrismaKeyValueDataAdapter(client, {
      modelKey: "runtimeState"
    });

    await adapter.mutate("runtime:moduleSettings", {
      tenantId: "tenant-a",
      inventory: { enabled: true }
    });

    await adapter.mutate("runtime:moduleSettings", {
      tenantId: "tenant-b",
      inventory: { enabled: false }
    });

    const tenantA = await adapter.query<Record<string, unknown>>(
      "runtime:moduleSettings",
      {
        tenantId: "tenant-a"
      }
    );

    const tenantB = await adapter.query<Record<string, unknown>>(
      "runtime:moduleSettings",
      {
        tenantId: "tenant-b"
      }
    );

    expect((tenantA.inventory as Record<string, unknown>).enabled).toBe(true);
    expect((tenantB.inventory as Record<string, unknown>).enabled).toBe(false);
  });
});
