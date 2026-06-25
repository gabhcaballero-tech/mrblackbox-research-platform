import { NextResponse } from "next/server";
import { requireCapability } from "@/shared/auth/session";
import { loadDetergentsStudyTemplateForAdmin } from "@/modules/study-templates/detergents-loader";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await requireCapability("admin:access");
  const result = await loadDetergentsStudyTemplateForAdmin({ actor: admin });

  if (!result.ok) {
    return NextResponse.json(
      {
        message: result.message,
        ok: false
      },
      { status: result.code === "UNAUTHORIZED" ? 403 : 500 }
    );
  }

  return NextResponse.json({
    data: result.data,
    ok: true
  });
}
