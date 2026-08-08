export type HutOperationsStudy = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string;
};

export type HutOperationsPhaseCodeSummary = {
  expiresAt: Date | null;
  phase: string;
  sentAt: Date | null;
  slot: number;
  status: string;
  usedAt: Date | null;
  validatedAt: Date | null;
};

export type HutOperationsVisitSummary = {
  completedAt: Date | null;
  section: string;
  startedAt: Date | null;
  status: string;
};

export type HutOperationsPhotoSummary = {
  capturedAt: Date;
  capturedLocalDate: string;
  productCode: string | null;
  useDayNumber: number;
};

export type HutOperationsRotationSummary = {
  hutEva1: string | null;
  hutEva2: string | null;
  navigoRotationCode: string | null;
};

export type HutOperationsNavigoSummary = {
  activeTokenId: string | null;
  rotation: HutOperationsRotationSummary;
};

export type HutOperationsParticipantSummary = {
  email: string | null;
  name: string;
  phone: string | null;
};

export type HutOperationsTimelineItem = {
  at: Date;
  label: string;
};

export type HutOperationsAnswerGroup = {
  answers: Array<{
    code: string;
    label: string;
    value: string;
  }>;
  sectionId: string;
  sectionTitle: string;
};

export type HutOperationsListItem = {
  currentPhase: string;
  hutFolio: string;
  id: string;
  lastActivityAt: Date | null;
  navFolio: string | null;
  origin: string;
  participant: HutOperationsParticipantSummary;
  photoCount: number;
  protocolVersion: string;
  questionnaireProgressLabel: string;
  questionnaireStatus: string | null;
};

export type HutOperationsDetail = HutOperationsListItem & {
  answerGroups: HutOperationsAnswerGroup[];
  navigo: HutOperationsNavigoSummary;
  phaseCodes: HutOperationsPhaseCodeSummary[];
  photos: HutOperationsPhotoSummary[];
  rotation: HutOperationsRotationSummary;
  timeline: HutOperationsTimelineItem[];
  visits: HutOperationsVisitSummary[];
};

export type HutOperationsDashboard = {
  detail: HutOperationsDetail | null;
  participants: HutOperationsDetail[];
  study: HutOperationsStudy;
};

export type HutOperationsExport = {
  body: string;
  contentType: string;
  filename: string;
  rowCount: number;
};
