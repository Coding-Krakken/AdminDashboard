import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFileAuditAdapter, createFileDataAdapter } from "../index";

describe("file adapters", () => {
  it("persists data adapter mutations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "admin-data-"));
    try {
      const filePath = join(dir, "data.json");
      const adapter = createFileDataAdapter(filePath);

      await adapter.mutate("runtime:lastContext", { role: "owner" });
      const value = await adapter.query<{ role: string }>("runtime:lastContext");

      expect(value.role).toBe("owner");
      const raw = await readFile(filePath, "utf8");
      expect(raw).toContain("runtime:lastContext");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists audit events to file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "admin-audit-"));
    try {
      const filePath = join(dir, "audit.json");
      const adapter = createFileAuditAdapter(filePath);

      await adapter.record({
        actorId: "u1",
        action: "settings.update",
        entity: "module",
        entityId: "billing"
      });

      const events = await adapter.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("settings.update");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
