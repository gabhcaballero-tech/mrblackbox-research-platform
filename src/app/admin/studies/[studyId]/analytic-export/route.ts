import { notFound } from "next/navigation";
import { buildFinalAnalyticExport } from "@/modules/exports";
import { requireCapability } from "@/shared/auth/session";

export const dynamic = "force-dynamic";

type AnalyticExportRouteContext = {
  params: Promise<{ studyId: string }>;
};

export async function GET(_request: Request, { params }: AnalyticExportRouteContext) {
  const { studyId } = await params;
  await requireCapability("screening:review");

  try {
    const exportResult = await buildFinalAnalyticExport({ studyId });

    return new Response(exportResult.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
        "Content-Type": exportResult.contentType
      },
      status: 200
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STUDY_NOT_FOUND") {
      notFound();
    }

    throw error;
  }
}
