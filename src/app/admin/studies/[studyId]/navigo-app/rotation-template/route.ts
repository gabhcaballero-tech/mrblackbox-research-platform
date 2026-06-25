import { NextResponse } from "next/server";
import { createNavigoRotationTemplateTsv } from "@/modules/navigo-app";
import { requireCapability } from "@/shared/auth/session";

type RotationTemplateRouteProps = {
  params: Promise<{
    studyId: string;
  }>;
};

export async function GET(_request: Request, { params }: RotationTemplateRouteProps) {
  await requireCapability("rotation:register");
  const { studyId } = await params;
  const body = `\uFEFF${createNavigoRotationTemplateTsv()}`;

  return new NextResponse(body, {
    headers: {
      "Content-Disposition": `attachment; filename="navigo_rotacion_${studyId}.tsv"`,
      "Content-Type": "text/tab-separated-values; charset=utf-8"
    },
    status: 200
  });
}
