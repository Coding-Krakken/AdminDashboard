import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  deleteIntelligenceAlertPolicy,
  listIntelligenceAlertPolicies,
  recordAdminAuditEvent,
  upsertIntelligenceAlertPolicy
} from "@/platform/runtime";

async function upsertPolicy(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      expectedVersion?: number;
    };
    const policy = await upsertIntelligenceAlertPolicy(body, {
      request,
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined
    });

    await recordAdminAuditEvent({
      request,
      action: "intelligence.policy.upsert",
      entity: "intelligence-policy",
      entityId: policy.id,
      metadata: {
        enabled: policy.enabled,
        severities: policy.severities,
        retryLimit: policy.retryLimit,
        webhookUrl: policy.webhookUrl
      }
    });

    return NextResponse.json(policy);
  } catch (error) {
    if (
      error instanceof Error &&
      typeof error.message === "string" &&
      error.message.startsWith("policy-version-conflict:")
    ) {
      const currentVersion = Number.parseInt(error.message.split(":")[1] ?? "0", 10);
      return NextResponse.json(
        {
          error: "Policy version conflict.",
          code: "policy-version-conflict",
          currentVersion: Number.isFinite(currentVersion) ? currentVersion : 0
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown intelligence policy upsert error."
      },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "intelligence:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const policies = await listIntelligenceAlertPolicies({ request });
    return NextResponse.json({ policies });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown intelligence policy list error."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return upsertPolicy(request);
}

export async function PUT(request: Request) {
  return upsertPolicy(request);
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
      policyId?: string;
      expectedVersion?: number;
    };
    if (!body.policyId) {
      return NextResponse.json({ error: "Missing policyId." }, { status: 400 });
    }

    await deleteIntelligenceAlertPolicy(body.policyId, {
      request,
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined
    });
    await recordAdminAuditEvent({
      request,
      action: "intelligence.policy.delete",
      entity: "intelligence-policy",
      entityId: body.policyId
    });

    return NextResponse.json({ deleted: true, policyId: body.policyId });
  } catch (error) {
    if (
      error instanceof Error &&
      typeof error.message === "string" &&
      error.message.startsWith("policy-version-conflict:")
    ) {
      const currentVersion = Number.parseInt(error.message.split(":")[1] ?? "0", 10);
      return NextResponse.json(
        {
          error: "Policy version conflict.",
          code: "policy-version-conflict",
          currentVersion: Number.isFinite(currentVersion) ? currentVersion : 0
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown intelligence policy delete error."
      },
      { status: 400 }
    );
  }
}
