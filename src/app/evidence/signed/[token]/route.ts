import { NextResponse } from "next/server";
import {
  createSupabaseEvidenceStorageClient,
  PARTICIPANT_EVIDENCE_BUCKET
} from "@/modules/participant-portal/evidence-storage";
import { createScreeningSupervisionRepository } from "@/modules/screening-supervision/repository";
import {
  resolveSignedEvidenceLinkSecret,
  verifySignedEvidenceToken
} from "@/modules/screening-supervision/signed-evidence-links";

export const dynamic = "force-dynamic";

type SignedEvidenceRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(_request: Request, { params }: SignedEvidenceRouteContext) {
  const { token } = await params;
  const verified = verifySignedEvidenceToken({
    secret: resolveSignedEvidenceLinkSecret(process.env),
    token
  });

  if (!verified.ok) {
    return NextResponse.json({ message: "El enlace de evidencia no es valido o ya expiro." }, { status: 404 });
  }

  const evidence = await createScreeningSupervisionRepository().getParticipantEvidenceForSignedLink(verified.evidenceId);

  if (!evidence || evidence.type !== "PERFUME_PHOTO") {
    return NextResponse.json({ message: "La evidencia no esta disponible." }, { status: 404 });
  }

  const signedUrl = await createSupabaseEvidenceStorageClient().createSignedReadUrl({
    bucket: evidence.storageBucket || PARTICIPANT_EVIDENCE_BUCKET,
    expiresInSeconds: 300,
    privateStorageKey: evidence.privateStorageKey
  });

  return NextResponse.redirect(signedUrl, { status: 302 });
}
