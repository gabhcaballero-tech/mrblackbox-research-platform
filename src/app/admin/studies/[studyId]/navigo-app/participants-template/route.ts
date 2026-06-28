import { createNavigoParticipantImportTemplateTsv } from "@/modules/navigo-app";

type ParticipantsTemplateRouteProps = {
  params: Promise<{
    studyId: string;
  }>;
};

export async function GET(_request: Request, { params }: ParticipantsTemplateRouteProps) {
  await params;
  const body = `\uFEFF${createNavigoParticipantImportTemplateTsv()}`;

  return new Response(body, {
    headers: {
      "Content-Disposition": 'attachment; filename="navigo_participantes_template.tsv"',
      "Content-Type": "text/tab-separated-values; charset=utf-8"
    }
  });
}
