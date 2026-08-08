import { notFound } from "next/navigation";
import { buildCltAnswersTsv, createCltOperationsRepository } from "@/modules/clt-operations";
import { requireCapability } from "@/shared/auth/session";

export const dynamic = "force-dynamic";

type CltAnswersExportRouteContext = {
  params: Promise<{ studyId: string }>;
};

export async function GET(_request: Request, { params }: CltAnswersExportRouteContext) {
  const { studyId } = await params;
  await requireCapability("screening:review");
  const dashboard = await createCltOperationsRepository().getDashboard({ studyId });

  if (!dashboard) {
    notFound();
  }

  const exportResult = buildCltAnswersTsv({
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
