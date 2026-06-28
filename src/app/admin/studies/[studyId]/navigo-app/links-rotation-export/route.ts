import { headers } from "next/headers";
import { createNavigoAppRepository } from "@/modules/navigo-app";
import { requireCapability } from "@/shared/auth/session";
import { resolveRequestOrigin } from "@/shared/utils/request-origin";

export const dynamic = "force-dynamic";

type NavigoLinksRotationExportRouteProps = {
  params: Promise<{
    studyId: string;
  }>;
};

export async function GET(_request: Request, { params }: NavigoLinksRotationExportRouteProps) {
  const { studyId } = await params;
  await requireCapability("screening:review");
  const result = await createNavigoAppRepository().exportLinksAndRotation({
    requestOrigin: resolveRequestOrigin(await headers()),
    studyId
  });

  if (!result.ok) {
    return Response.json({ message: result.message }, { status: 400 });
  }

  return new Response(result.data.body, {
    headers: {
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "Content-Type": "text/tab-separated-values; charset=utf-8"
    }
  });
}
