import { notFound } from "next/navigation";
import { buildHutAnswersTsv, createHutOperationsRepository } from "@/modules/hut-operations";
import { requireCapability } from "@/shared/auth/session";

export const dynamic = "force-dynamic";

type HutAnswersExportRouteContext = {
  params: Promise<{ studyId: string }>;
};

export async function GET(_request: Request, { params }: HutAnswersExportRouteContext) {
  const { studyId } = await params;
  await requireCapability("screening:review");
  const dashboard = await createHutOperationsRepository().getDashboard({ studyId });

  if (!dashboard) {
    notFound();
  }

  const exportResult = buildHutAnswersTsv({
    dashboard,
    details: dashboard.participants
  });

  return new Response(exportResult.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
      "Content-Type": exportResult.contentType
    },
    status: 200
  });
}
