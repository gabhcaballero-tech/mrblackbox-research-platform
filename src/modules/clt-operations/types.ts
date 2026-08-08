export type CltOperationsStudy = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string;
};

export type CltOperationsActivitySummary = {
  availableFrom: Date;
  code: string;
  completedAt: Date | null;
  evidenceCount: number;
  id: string;
  name: string;
  scheduledAt: Date;
  status: string;
};

export type CltOperationsReminderSummary = {
  activityCode: string;
  id: string;
  sentAt: Date | null;
  status: string;
};

export type CltOperationsWhatsAppSummary = {
  lastMessageAt: Date | null;
  lastStatus: string | null;
  messageCount: number;
  templateNames: string[];
};

export type CltOperationsRotationSummary = {
  arms: Array<{
    armCode: string;
    armLabel: string;
    productCode: string;
    productLabel: string;
    order: number;
    visibleLabel: string;
  }>;
  firstSampleKey: string | null;
  rotationCode: string | null;
  secondSampleKey: string | null;
};

export type CltOperationsHutSummary = {
  applicationPhotoCount: number;
  currentSection: string | null;
  folio: string | null;
  id: string | null;
  origin: string | null;
  protocolVersion: string | null;
  questionnaireStatus: string | null;
  status: string | null;
};

export type CltOperationsListItem = {
  answeredCount: number;
  cltCompletedAt: Date | null;
  cltProgressLabel: string;
  cltStartedAt: Date | null;
  cltStatus: string;
  folio: string;
  hut: CltOperationsHutSummary;
  id: string;
  interviewer: string | null;
  navigoActivities: CltOperationsActivitySummary[];
  navigoLinkToken: string | null;
  participantId: string;
  participantName: string;
  questionCount: number;
  t0: Date | null;
  whatsapp: CltOperationsWhatsAppSummary;
};

export type CltOperationsAnswerGroup = {
  answers: Array<{
    code: string;
    label: string;
    value: string;
  }>;
  sectionId: string;
  sectionTitle: string;
};

export type CltOperationsDetail = CltOperationsListItem & {
  answerGroups: CltOperationsAnswerGroup[];
  phaseProgress: Array<{
    completedAt: Date | null;
    phase: string;
    status: string;
    validatedAt: Date | null;
  }>;
  reminders: CltOperationsReminderSummary[];
  rotation: CltOperationsRotationSummary;
};

export type CltOperationsDashboard = {
  detail: CltOperationsDetail | null;
  participants: CltOperationsDetail[];
  study: CltOperationsStudy;
};

export type CltOperationsExport = {
  body: string;
  contentType: string;
  filename: string;
  rowCount: number;
};
