import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { exportScreeningPerfumeParticipantsForStudy } from "@/modules/screening-supervision/perfume-export";
import { createScreeningSupervisionRepository } from "@/modules/screening-supervision/repository";
import { requireCapability } from "@/shared/auth/session";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";

export const dynamic = "force-dynamic";

type PerfumeExportRouteContext = {
  params: Promise<{
    studyId: string;
  }>;
};

export async function GET(request: Request, { params }: PerfumeExportRouteContext) {
  const { studyId } = await params;
  const actor = await requireCapability("screening:review");
  const result = await exportScreeningPerfumeParticipantsForStudy({
    actor,
    repository: createScreeningSupervisionRepository(),
    requestOrigin: resolveRequestOrigin(request.headers),
    studyId
  });

  if (!result.ok) {
    if (result.code === "STUDY_NOT_FOUND") {
      notFound();
    }

    return NextResponse.json({ message: result.message }, { status: result.code === "UNAUTHORIZED" ? 403 : 400 });
  }

  return new Response(result.data.fileContent, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "Content-Type": result.data.contentType
    },
    status: 200
  });
}
