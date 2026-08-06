import { cookies } from "next/headers";
import { createCtlRepository, type CtlRepository } from "@/modules/ctl/repository";
import {
  ctlPublicSessionCookieName,
  readCtlPublicSessionToken
} from "@/modules/ctl/public-session";
import type { CtlPublicInterviewerActor } from "@/modules/ctl/service";

export async function getPublicCtlInterviewerActor({
  repository = createCtlRepository(),
  studyCode
}: {
  repository?: CtlRepository;
  studyCode: string;
}): Promise<CtlPublicInterviewerActor | null> {
  const secret = getCtlPublicSessionSecret();

  if (!secret) {
    return null;
  }

  const cookieStore = await cookies();
  const session = readCtlPublicSessionToken({
    secret,
    studyCode,
    token: cookieStore.get(ctlPublicSessionCookieName(studyCode))?.value
  });

  if (!session) {
    return null;
  }

  return repository.getPublicInterviewerActor({
    ctlInterviewerCodeId: session.ctlInterviewerCodeId,
    studyCode
  });
}

export function getCtlPublicSessionSecret(): string | null {
  return process.env.CTL_PUBLIC_SESSION_SECRET ?? process.env.PARTICIPANT_PORTAL_HASH_SECRET ?? null;
}
