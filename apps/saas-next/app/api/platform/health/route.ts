import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    mode: "saas-multi-tenant",
    timestamp: new Date().toISOString()
  });
}
