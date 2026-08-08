import { notFound } from "next/navigation";
import { buildCltOperationsTsv, createCltOperationsRepository } from "@/modules/clt-operations";
import { requireCapability } from "@/shared/auth/session";

export const dynamic = "force-dynamic";

type CltOperationsExportRouteContext = {
  params: Promise<{ studyId: string }>;
};

export async function GET(_request: Request, { params }: CltOperationsExportRouteContext) {
  const { studyId } = await params;
  await requireCapability("screening:review");
  const dashboard = await createCltOperationsRepository().getDashboard({ studyId });

  if (!dashboard) {
    notFound();
  }

  const exportResult = buildCltOperationsTsv({ dashboard });

  return new Response(exportResult.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
      "Content-Type": exportResult.contentType
    },
    status: 200
  });
}
