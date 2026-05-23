import type { Permission, Role } from "@universal-admin/core";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  tenantId?: string;
  permissions: Permission[];
}

export interface AuthAdapter {
  getCurrentUser(): Promise<AuthUser | null>;
}

export interface DataAdapter {
  query<T>(key: string, params?: Record<string, unknown>): Promise<T>;
  mutate<T>(key: string, payload?: unknown): Promise<T>;
}

export interface RealtimeAdapter {
  subscribe(
    channel: string,
    onMessage: (message: unknown) => void
  ): () => void;
}

export interface AuditEvent {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditAdapter {
  record(event: AuditEvent): Promise<void>;
}

export function createMemoryAuthAdapter(initialUser: AuthUser | null): AuthAdapter {
  let user = initialUser;

  return {
    async getCurrentUser() {
      return user;
    }
  };
}

export function createMemoryDataAdapter(
  seed: Record<string, unknown> = {}
): DataAdapter {
  const db = new Map<string, unknown>(Object.entries(seed));

  return {
    async query<T>(key: string): Promise<T> {
      return db.get(key) as T;
    },
    async mutate<T>(key: string, payload?: unknown): Promise<T> {
      db.set(key, payload);
      return (payload ?? null) as T;
    }
  };
}

export function createPollingRealtimeAdapter(options: {
  intervalMs?: number;
  messageFactory?: (channel: string) => unknown;
} = {}): RealtimeAdapter {
  const intervalMs = options.intervalMs ?? 15000;

  return {
    subscribe(channel: string, onMessage: (message: unknown) => void) {
      const interval = setInterval(() => {
        onMessage(
          options.messageFactory?.(channel) ?? {
            channel,
            type: "heartbeat",
            at: new Date().toISOString()
          }
        );
      }, intervalMs);

      return () => clearInterval(interval);
    }
  };
}

export function createMemoryAuditAdapter(initialEvents: AuditEvent[] = []): AuditAdapter & {
  getEvents: () => AuditEvent[];
} {
  const events = [...initialEvents];

  return {
    async record(event: AuditEvent): Promise<void> {
      events.push(event);
    },
    getEvents: () => [...events]
  };
}

type JsonRecord = Record<string, unknown>;

async function readJsonFile(filePath: string): Promise<JsonRecord> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return {};
  }
}

async function writeJsonFile(filePath: string, data: JsonRecord): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

const fileMutationLocks = new Map<string, Promise<void>>();

async function awaitPendingMutation(filePath: string): Promise<void> {
  const pending = fileMutationLocks.get(filePath);
  if (!pending) {
    return;
  }

  await pending;
}

async function withFileMutationLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = fileMutationLocks.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  fileMutationLocks.set(
    filePath,
    next.then(
      () => undefined,
      () => undefined
    )
  );

  return next;
}

export function createFileDataAdapter(filePath: string): DataAdapter {
  return {
    async query<T>(key: string): Promise<T> {
      await awaitPendingMutation(filePath);
      const data = await readJsonFile(filePath);
      return data[key] as T;
    },
    async mutate<T>(key: string, payload?: unknown): Promise<T> {
      return withFileMutationLock(filePath, async () => {
        const data = await readJsonFile(filePath);
        data[key] = payload ?? null;
        await writeJsonFile(filePath, data);
        return data[key] as T;
      });
    }
  };
}

export function createFileAuditAdapter(filePath: string): AuditAdapter & {
  getEvents: () => Promise<AuditEvent[]>;
} {
  return {
    async record(event: AuditEvent): Promise<void> {
      await withFileMutationLock(filePath, async () => {
        const data = await readJsonFile(filePath);
        const current = Array.isArray(data.events) ? data.events : [];
        current.push(event);
        data.events = current;
        await writeJsonFile(filePath, data);
      });
    },
    async getEvents(): Promise<AuditEvent[]> {
      await awaitPendingMutation(filePath);
      const data = await readJsonFile(filePath);
      return (Array.isArray(data.events) ? data.events : []) as AuditEvent[];
    }
  };
}

export * from "./prisma";
export * from "./auth-providers";
export * from "./auth-detector";
export * from "./environment";
