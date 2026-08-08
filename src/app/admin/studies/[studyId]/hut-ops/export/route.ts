import { notFound } from "next/navigation";
import { buildHutOperationsTsv, createHutOperationsRepository } from "@/modules/hut-operations";
import { requireCapability } from "@/shared/auth/session";

export const dynamic = "force-dynamic";

type HutOperationsExportRouteContext = {
  params: Promise<{ studyId: string }>;
};

export async function GET(_request: Request, { params }: HutOperationsExportRouteContext) {
  const { studyId } = await params;
  await requireCapability("screening:review");
  const dashboard = await createHutOperationsRepository().getDashboard({ studyId });

  if (!dashboard) {
    notFound();
  }

  const exportResult = buildHutOperationsTsv({ dashboard });

  return new Response(exportResult.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
      "Content-Type": exportResult.contentType
    },
    status: 200
  });
}
