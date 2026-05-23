import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  getModuleSettings,
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

interface RouteContext {
  params: Promise<{ moduleId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const { moduleId } = await context.params;

  const authz = await authorizeAdminApiRequest({
    request: _,
    action: "settings:module:read",
    moduleId
  });
  if (!authz.ok) {
    return authz.response;
  }

  const snapshot = await getModuleSettings(moduleId, { request: _ });

  if (!snapshot) {
    return NextResponse.json(
      { error: `Unknown module settings for '${moduleId}'.` },
      { status: 404 }
    );
  }

  return NextResponse.json(snapshot);
}

export async function POST(request: Request, context: RouteContext) {
  const { moduleId } = await context.params;

  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:module:write",
    moduleId
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      values?: unknown;
      expectedVersion?: number;
    };
    const previous = await getModuleSettings(moduleId, { request });
    const previousValues = previous?.values;
    const expectedVersion = parseExpectedVersion(request, body.expectedVersion);

    const values = await updateModuleSettings(moduleId, body.values ?? {}, {
      request,
      expectedVersion
    });
    await recordAdminAuditEvent({
      request,
      action: "settings.update",
      entity: "module-settings",
      entityId: moduleId,
      metadata: {
        scope: "module",
        changedKeys: Object.keys(
          (values.values && typeof values.values === "object"
            ? values.values
            : {}) as Record<string, unknown>
        ),
        expectedVersion: expectedVersion ?? previous?.version ?? 0,
        version: values.version,
        before: previousValues ?? null,
        after: values.values ?? null
      }
    });
    return NextResponse.json(values);
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
            : "Unknown module settings update error."
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { moduleId } = await context.params;

  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:module:write",
    moduleId
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      values?: unknown;
      expectedVersion?: number;
    };
    const previous = await getModuleSettings(moduleId, { request });
    const previousValues = previous?.values;
    const expectedVersion = parseExpectedVersion(request, body.expectedVersion);

    const values = await patchModuleSettings(moduleId, body.values ?? {}, {
      request,
      expectedVersion
    });

    const previousRecord =
      previousValues && typeof previousValues === "object"
        ? (previousValues as Record<string, unknown>)
        : {};
    const nextRecord =
      values.values && typeof values.values === "object"
        ? (values.values as Record<string, unknown>)
        : {};
    const changedKeys = Array.from(
      new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)])
    ).filter((key) => previousRecord[key] !== nextRecord[key]);

    await recordAdminAuditEvent({
      request,
      action: "settings.patch",
      entity: "module-settings",
      entityId: moduleId,
      metadata: {
        scope: "module",
        changedKeys,
        expectedVersion: expectedVersion ?? previous?.version ?? 0,
        version: values.version,
        before: previousValues ?? null,
        after: values.values ?? null
      }
    });
    return NextResponse.json(values);
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
            : "Unknown module settings patch error."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const { moduleId } = await context.params;

  const authz = await authorizeAdminApiRequest({
    request: _,
    action: "settings:module:write",
    moduleId
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const previous = await getModuleSettings(moduleId, { request: _ });
    const previousValues = previous?.values;
    let expectedVersion: number | undefined;
    try {
      const body = (await _.json()) as { expectedVersion?: number };
      expectedVersion = parseExpectedVersion(_, body.expectedVersion);
    } catch {
      expectedVersion = parseExpectedVersion(_, undefined);
    }

    const values = await resetModuleSettings(moduleId, {
      request: _,
      expectedVersion
    });

    const previousRecord =
      previousValues && typeof previousValues === "object"
        ? (previousValues as Record<string, unknown>)
        : {};
    const nextRecord =
      values.values && typeof values.values === "object"
        ? (values.values as Record<string, unknown>)
        : {};
    const changedKeys = Array.from(
      new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)])
    ).filter((key) => previousRecord[key] !== nextRecord[key]);

    await recordAdminAuditEvent({
      request: _,
      action: "settings.reset",
      entity: "module-settings",
      entityId: moduleId,
      metadata: {
        scope: "module",
        changedKeys,
        expectedVersion: expectedVersion ?? previous?.version ?? 0,
        version: values.version,
        before: previousValues ?? null,
        after: values.values ?? null
      }
    });

    return NextResponse.json(values);
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
            : "Unknown module settings reset error."
      },
      { status: 400 }
    );
  }
}
