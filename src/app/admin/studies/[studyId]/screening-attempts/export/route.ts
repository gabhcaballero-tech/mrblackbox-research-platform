import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { createScreeningSupervisionRepository } from "@/modules/screening-supervision/repository";
import { exportScreeningAttemptsCsvForStudy } from "@/modules/screening-supervision/export";
import { requireCapability } from "@/shared/auth/session";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{
    studyId: string;
  }>;
};

export async function GET(request: Request, { params }: ExportRouteContext) {
  const { studyId } = await params;
  const actor = await requireCapability("screening:review");
  const filters = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = await exportScreeningAttemptsCsvForStudy({
    actor,
    filters,
    repository: createScreeningSupervisionRepository(),
    studyId
  });

  if (!result.ok) {
    if (result.code === "STUDY_NOT_FOUND") {
      notFound();
    }

    return NextResponse.json({ message: result.message }, { status: result.code === "UNAUTHORIZED" ? 403 : 400 });
  }

  return new Response(result.data.csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "Content-Type": result.data.contentType
    },
    status: 200
  });
}
