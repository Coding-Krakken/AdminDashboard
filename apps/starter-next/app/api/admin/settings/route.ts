import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  listModuleSettings,
  patchModuleSettings,
  recordAdminAuditEvent,
  resetModuleSettings,
  updateModuleSettings
} from "@/platform/runtime";

function parseExpectedVersion(
  request: Request,
  bodyExpectedVersion: unknown
): number | undefined {
  const headerRaw = request.headers.get("x-settings-expected-version");
  const candidate = headerRaw ?? bodyExpectedVersion;

  if (candidate === null || candidate === undefined || candidate === "") {
    return undefined;
  }

  const parsed =
    typeof candidate === "number"
      ? candidate
      : Number.parseInt(String(candidate), 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseConflictVersion(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (!error.message.startsWith("settings-version-conflict:")) {
    return null;
  }

  const raw = error.message.slice("settings-version-conflict:".length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const settings = await listModuleSettings({ request });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown settings read error."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      moduleId?: string;
      values?: unknown;
      expectedVersion?: number;
    };

    if (!body.moduleId) {
      return NextResponse.json(
        { error: "Missing moduleId in request body." },
        { status: 400 }
      );
    }

    const previous = (await listModuleSettings({ request })).find(
      (snapshot) => snapshot.moduleId === body.moduleId
    );
    const previousValues = previous?.values;
    const expectedVersion = parseExpectedVersion(request, body.expectedVersion);

    const updated = await updateModuleSettings(body.moduleId, body.values ?? {}, {
      request,
      expectedVersion
    });
    await recordAdminAuditEvent({
      request,
      action: "settings.update",
      entity: "module-settings",
      entityId: body.moduleId,
      metadata: {
        scope: "collection",
        changedKeys: Object.keys(
          (updated.values && typeof updated.values === "object"
            ? updated.values
            : {}) as Record<string, unknown>
        ),
        expectedVersion: expectedVersion ?? previous?.version ?? 0,
        version: updated.version,
        before: previousValues ?? null,
        after: updated.values ?? null
      }
    });
    return NextResponse.json(updated);
  } catch (error) {
    const conflictVersion = parseConflictVersion(error);
    if (conflictVersion !== null) {
      return NextResponse.json(
        {
          error: "Settings version conflict.",
          currentVersion: conflictVersion
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown settings update error."
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      moduleId?: string;
      values?: unknown;
      expectedVersion?: number;
    };

    if (!body.moduleId) {
      return NextResponse.json(
        { error: "Missing moduleId in request body." },
        { status: 400 }
      );
    }

    const previous = (await listModuleSettings({ request })).find(
      (snapshot) => snapshot.moduleId === body.moduleId
    );
    const previousValues = previous?.values;
    const expectedVersion = parseExpectedVersion(request, body.expectedVersion);

    const updated = await patchModuleSettings(body.moduleId, body.values ?? {}, {
      request,
      expectedVersion
    });

    const previousRecord =
      previousValues && typeof previousValues === "object"
        ? (previousValues as Record<string, unknown>)
        : {};
    const nextRecord =
      updated.values && typeof updated.values === "object"
        ? (updated.values as Record<string, unknown>)
        : {};
    const changedKeys = Array.from(
      new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)])
    ).filter((key) => previousRecord[key] !== nextRecord[key]);

    await recordAdminAuditEvent({
      request,
      action: "settings.patch",
      entity: "module-settings",
      entityId: body.moduleId,
      metadata: {
        scope: "collection",
        changedKeys,
        expectedVersion: expectedVersion ?? previous?.version ?? 0,
        version: updated.version,
        before: previousValues ?? null,
        after: updated.values ?? null
      }
    });
    return NextResponse.json(updated);
  } catch (error) {
    const conflictVersion = parseConflictVersion(error);
    if (conflictVersion !== null) {
      return NextResponse.json(
        {
          error: "Settings version conflict.",
          currentVersion: conflictVersion
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown settings patch error."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      moduleId?: string;
      expectedVersion?: number;
    };

    if (!body.moduleId) {
      return NextResponse.json(
        { error: "Missing moduleId in request body." },
        { status: 400 }
      );
    }

    const previous = (await listModuleSettings({ request })).find(
      (snapshot) => snapshot.moduleId === body.moduleId
    );
    const previousValues = previous?.values;
    const expectedVersion = parseExpectedVersion(request, body.expectedVersion);

    const updated = await resetModuleSettings(body.moduleId, {
      request,
      expectedVersion
    });

    const previousRecord =
      previousValues && typeof previousValues === "object"
        ? (previousValues as Record<string, unknown>)
        : {};
    const nextRecord =
      updated.values && typeof updated.values === "object"
        ? (updated.values as Record<string, unknown>)
        : {};
    const changedKeys = Array.from(
      new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)])
    ).filter((key) => previousRecord[key] !== nextRecord[key]);

    await recordAdminAuditEvent({
      request,
      action: "settings.reset",
      entity: "module-settings",
      entityId: body.moduleId,
      metadata: {
        scope: "collection",
        changedKeys,
        expectedVersion: expectedVersion ?? previous?.version ?? 0,
        version: updated.version,
        before: previousValues ?? null,
        after: updated.values ?? null
      }
    });
    return NextResponse.json(updated);
  } catch (error) {
    const conflictVersion = parseConflictVersion(error);
    if (conflictVersion !== null) {
      return NextResponse.json(
        {
          error: "Settings version conflict.",
          currentVersion: conflictVersion
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown settings reset error."
      },
      { status: 400 }
    );
  }
}
