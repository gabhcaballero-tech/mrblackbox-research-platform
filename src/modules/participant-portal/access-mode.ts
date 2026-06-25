import { DETERGENTS_STUDY_CODE, NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

export type ParticipantPortalAccessMode = "DIRECT" | "OTP";

const DIRECT_ACCESS_STUDY_CODES = new Set([NAVIGO_STUDY_CODE, DETERGENTS_STUDY_CODE]);

export function getParticipantPortalAccessMode(studyCode: string): ParticipantPortalAccessMode {
  return DIRECT_ACCESS_STUDY_CODES.has(studyCode.toUpperCase()) ? "DIRECT" : "OTP";
}

export function allowsDirectParticipantAccess(studyCode: string): boolean {
  return getParticipantPortalAccessMode(studyCode) === "DIRECT";
}
