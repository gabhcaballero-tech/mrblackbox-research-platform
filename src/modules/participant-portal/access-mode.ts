export type ParticipantPortalAccessMode = "DIRECT" | "OTP";

const DIRECT_ACCESS_STUDY_CODES = new Set(["FMASCULINA-NAVIGO-2026"]);

export function getParticipantPortalAccessMode(studyCode: string): ParticipantPortalAccessMode {
  return DIRECT_ACCESS_STUDY_CODES.has(studyCode.toUpperCase()) ? "DIRECT" : "OTP";
}

export function allowsDirectParticipantAccess(studyCode: string): boolean {
  return getParticipantPortalAccessMode(studyCode) === "DIRECT";
}
