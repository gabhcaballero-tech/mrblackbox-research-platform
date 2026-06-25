export const NAVIGO_STUDY_CODE = "FMASCULINA-NAVIGO-2026";
export const DETERGENTS_STUDY_CODE = "DETERGENTES-ROPA-2026";

export type StudyOperationalMode = "COMPARATIVE_TWO_ARM" | "FILTER_ONLY";

export type StudyBehavior = {
  mode: StudyOperationalMode;
  requiresComparativeConfiguration: boolean;
  requiresFinalSelfie: boolean;
  requiresPerfumeEvidence: boolean;
  usesManualRotation: boolean;
};

const defaultBehavior: StudyBehavior = {
  mode: "COMPARATIVE_TWO_ARM",
  requiresComparativeConfiguration: true,
  requiresFinalSelfie: true,
  requiresPerfumeEvidence: true,
  usesManualRotation: true
};

const studyBehaviors = new Map<string, StudyBehavior>([
  [
    DETERGENTS_STUDY_CODE,
    {
      mode: "FILTER_ONLY",
      requiresComparativeConfiguration: false,
      requiresFinalSelfie: false,
      requiresPerfumeEvidence: false,
      usesManualRotation: false
    }
  ],
  [NAVIGO_STUDY_CODE, defaultBehavior]
]);

export function getStudyBehavior(studyCode: string): StudyBehavior {
  return studyBehaviors.get(studyCode.toUpperCase()) ?? defaultBehavior;
}

export function isFilterOnlyStudy(studyCode: string): boolean {
  return getStudyBehavior(studyCode).mode === "FILTER_ONLY";
}
