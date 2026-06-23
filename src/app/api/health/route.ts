import { NextResponse } from "next/server";
import { healthResponseSchema } from "@/shared/validation/health";

export async function GET() {
  const payload = healthResponseSchema.parse({
    status: "ok",
    service: "mrblackbox-research-platform",
    stage: "technical-foundation",
    timestamp: new Date().toISOString()
  });

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
