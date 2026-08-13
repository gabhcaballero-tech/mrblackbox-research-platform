import { NAVIGO_ACTIVITY_CODES } from "@/modules/navigo-app/definition";
import type {
  ParticipantCurrentStage,
  ParticipantDeclaredOperationalState,
  ParticipantOperationalEvidence,
  ParticipantOperationalReadiness,
  ParticipantOperationalStage,
  ParticipantProtocolType,
  ParticipantReadinessHutParticipant,
  ParticipantReadinessInput,
  ParticipantReadinessReason,
  ParticipantStageReadiness
} from "./types";

const HUT_COMPLETION_SECTIONS = new Set(["REGRESO_2", "COMPARATIVA"]);

export function calculateParticipantOperationalReadiness(
  input: ParticipantReadinessInput
): ParticipantOperationalReadiness {
  const protocolType = resolveProtocolType(input);
  const declaredState = buildDeclaredState(input);
  const operationalEvidence = buildOperationalEvidence(input);
  const screening = buildScreeningReadiness(operationalEvidence);
  const clt = buildCltReadiness(input, protocolType, screening.ready || screening.completed);
  const navigo = buildNavigoReadiness(input, protocolType, clt.completed);
  const hut = buildHutReadiness(
    input,
    protocolType,
    screening.completed || screening.ready,
    clt.completed,
    navigo.ready || navigo.completed
  );
  const stages = { clt, hut, navigo, screening };
  const blockingReasons = Object.values(stages).flatMap((stage) => stage.blockingReasons);
  const warnings = [
    ...Object.values(stages).flatMap((stage) => stage.warnings),
    ...buildStaleAggregatedStatusWarnings({ declaredState, operationalEvidence }),
    ...buildLegacyWarnings(input)
  ];

  return {
    blockingReasons,
    currentStage: resolveCurrentStage({ clt, hut, navigo, protocolType, screening }),
    declaredState,
    nextAllowedStage: resolveNextAllowedStage({ clt, hut, navigo, protocolType, screening }),
    operationalEvidence,
    participantId: input.id,
    protocolType,
    stages,
    warnings
  };
}

function resolveProtocolType(input: ParticipantReadinessInput): ParticipantProtocolType {
  if (input.hutParticipant?.origin === "HUT_DIRECTO") {
    return "HUT_DIRECTO";
  }

  return "CLT_NAVIGO_HUT";
}

function buildDeclaredState(input: ParticipantReadinessInput): ParticipantDeclaredOperationalState {
  return {
    operationalStatus: input.operationalStatus ?? null,
    screeningStatus: input.screeningStatus ?? null
  };
}

function buildOperationalEvidence(input: ParticipantReadinessInput): ParticipantOperationalEvidence {
  const confirmation = input.participantConfirmation ?? null;
  const referenceCodeSlots = (confirmation?.referenceCodes ?? []).map((code) => code.slot).sort((left, right) => left - right);
  const referenceSlotSet = new Set(referenceCodeSlots);
  const hut = input.hutParticipant ?? null;

  return {
    activeTokenExists: hasActiveToken(input),
    cltCompleted: hasCompletedCtlSession(input),
    confirmationExists: Boolean(confirmation),
    currentNavigoActivitiesExist: hasCurrentNavigoActivities(input),
    hasAllReferenceCodes: [1, 2, 3].every((slot) => referenceSlotSet.has(slot)),
    hutCompleted: Boolean(hut && isHutCompleted(hut)),
    hutExists: Boolean(hut),
    hutRotationComplete: Boolean(hut?.firstFragranceLeftArm && hut.secondFragranceRightArm),
    hutStarted: Boolean(hut && (hut.status !== "NOT_STARTED" || hut.applicationPhotoEntries?.length || hut.applicationEvidence?.length)),
    navigoActivitiesCompleted: hasCompletedNavigoActivities(input),
    navigoRotationComplete: hasCompleteNavigoRotation(input),
    participantExists: Boolean(input.id),
    referenceCodeSlots,
    screeningAttemptPassed: confirmation?.screeningAttempt?.status === "PASSED",
    screeningReviewApproved: input.participantScreeningReviews?.some((review) => review.status === "APPROVED") ?? false,
    screeningPassedByEvidence: Boolean(
      confirmation && (confirmation.screeningAttempt?.status === "PASSED" || input.participantScreeningReviews?.some((review) => review.status === "APPROVED"))
    ),
    t0Exists: Boolean(input.applicationStartedAt),
    triangularRotationExists: Boolean(input.ctlTriangularRotationAssignment)
  };
}

function buildScreeningReadiness(evidence: ParticipantOperationalEvidence): ParticipantStageReadiness {
  const reasons: ParticipantReadinessReason[] = [];

  if (!evidence.participantExists) {
    reasons.push(reason("SCREENING", "PARTICIPANT_MISSING", "Falta identidad operativa del participante."));
  }
  if (!evidence.confirmationExists) {
    reasons.push(reason("SCREENING", "CONFIRMATION_MISSING", "Falta ParticipantConfirmation."));
  }
  if (!evidence.screeningPassedByEvidence) {
    reasons.push(reason("SCREENING", "SCREENING_EVIDENCE_NOT_PASSED", "No existe evidencia operativa de screening aprobado."));
  }
  for (const slot of [1, 2, 3]) {
    if (!evidence.referenceCodeSlots.includes(slot)) {
      reasons.push(reason("SCREENING", `REFERENCE_CODE_SLOT_${slot}_MISSING`, `Falta ParticipantReferenceCode slot ${slot}.`));
    }
  }

  return stage({
    applicable: true,
    completed: reasons.length === 0,
    ready: reasons.length === 0,
    reasons
  });
}

function buildStaleAggregatedStatusWarnings({
  declaredState,
  operationalEvidence
}: {
  declaredState: ParticipantDeclaredOperationalState;
  operationalEvidence: ParticipantOperationalEvidence;
}): ParticipantReadinessReason[] {
  const hasAdvancedOperationalEvidence = Boolean(
    operationalEvidence.cltCompleted ||
      operationalEvidence.t0Exists ||
      operationalEvidence.activeTokenExists ||
      operationalEvidence.currentNavigoActivitiesExist ||
      operationalEvidence.hutStarted ||
      operationalEvidence.hutCompleted
  );
  const screeningStatusStale = operationalEvidence.screeningPassedByEvidence && declaredState.screeningStatus !== "PASSED";
  const operationalStatusStale = Boolean(
    hasAdvancedOperationalEvidence &&
      declaredState.operationalStatus &&
      !["IN_PROGRESS", "COMPLETED"].includes(declaredState.operationalStatus)
  );

  if (!screeningStatusStale && !operationalStatusStale) {
    return [];
  }

  return [
    reason(
      "SCREENING",
      "STALE_AGGREGATED_STATUS",
      `Estado agregado posiblemente desactualizado: screeningStatus=${declaredState.screeningStatus ?? "null"}, operationalStatus=${declaredState.operationalStatus ?? "null"}.`
    )
  ];
}

function buildCltReadiness(
  input: ParticipantReadinessInput,
  protocolType: ParticipantProtocolType,
  screeningReady: boolean
): ParticipantStageReadiness {
  if (protocolType === "HUT_DIRECTO") {
    return notApplicable();
  }

  const completed = hasCompletedCtlSession(input);
  const reasons: ParticipantReadinessReason[] = [];

  if (!screeningReady) {
    reasons.push(reason("CLT", "SCREENING_NOT_READY", "Screening aun no esta listo."));
  }
  if (!hasCompleteNavigoRotation(input)) {
    reasons.push(reason("CLT", "ROTATION_INCOMPLETE", "Falta rotacion Navigo completa."));
  }
  if (!input.ctlTriangularRotationAssignment) {
    reasons.push(reason("CLT", "TRIANGULAR_ROTATION_MISSING", "Falta rotacion triangular CTL."));
  }

  return stage({
    applicable: true,
    completed,
    ready: !completed && reasons.length === 0,
    reasons: completed ? [] : reasons
  });
}

function buildNavigoReadiness(
  input: ParticipantReadinessInput,
  protocolType: ParticipantProtocolType,
  cltCompleted: boolean
): ParticipantStageReadiness {
  if (protocolType === "HUT_DIRECTO") {
    return notApplicable();
  }

  const reasons: ParticipantReadinessReason[] = [];
  if (!cltCompleted) {
    reasons.push(reason("NAVIGO", "CLT_NOT_COMPLETED", "CTL aun no esta completado."));
  }
  if (!input.applicationStartedAt) {
    reasons.push(reason("NAVIGO", "T0_MISSING", "Falta T0/applicationStartedAt."));
  }
  if (!hasCompleteNavigoRotation(input)) {
    reasons.push(reason("NAVIGO", "ROTATION_INCOMPLETE", "Falta rotacion Navigo completa."));
  }
  if (!hasActiveToken(input)) {
    reasons.push(reason("NAVIGO", "ACTIVE_TOKEN_MISSING", "Falta ParticipantAccessToken activo."));
  }
  if (!hasCurrentNavigoActivities(input)) {
    reasons.push(reason("NAVIGO", "ACTIVITIES_MISSING", "Faltan actividades Navigo T3/T4.5/T6."));
  }

  const completed = hasCompletedNavigoActivities(input);
  return stage({
    applicable: true,
    completed,
    ready: !completed && reasons.length === 0,
    reasons: completed ? [] : reasons
  });
}

function buildHutReadiness(
  input: ParticipantReadinessInput,
  protocolType: ParticipantProtocolType,
  screeningReady: boolean,
  cltCompleted: boolean,
  navigoReady: boolean
): ParticipantStageReadiness {
  const reasons: ParticipantReadinessReason[] = [];
  const warnings: ParticipantReadinessReason[] = [];
  const hut = input.hutParticipant ?? null;

  if (!screeningReady) {
    reasons.push(reason("HUT", "SCREENING_NOT_READY", "Screening aun no esta listo."));
  }
  if (protocolType === "CLT_NAVIGO_HUT" && !cltCompleted) {
    reasons.push(reason("HUT", "CLT_NOT_COMPLETED", "CTL aun no esta completado."));
  }
  if (protocolType === "CLT_NAVIGO_HUT" && !navigoReady) {
    reasons.push(reason("HUT", "NAVIGO_NOT_READY", "Navigo aun no esta listo dentro del flujo maestro."));
  }
  if (!hut) {
    reasons.push(reason("HUT", "HUT_PARTICIPANT_MISSING", "Falta HutParticipant."));
  } else {
    if (isReservedHutWithoutOperationalIdentity(hut)) {
      reasons.push(reason("HUT", "RESERVED_WITHOUT_OPERATIONAL_IDENTITY", "HUT reservado sin identidad operativa."));
    }
    if (hut.protocolVersion !== "APPLICATION_PHOTO") {
      warnings.push(reason("HUT", "LEGACY_HUT_PROTOCOL", "El HUT usa protocolo legacy."));
    }
    if (!hut.firstFragranceLeftArm || !hut.secondFragranceRightArm) {
      reasons.push(reason("HUT", "HUT_ROTATION_INCOMPLETE", "Falta rotacion EVA1/EVA2 HUT."));
    }
    if (hut.status === "DISQUALIFIED") {
      reasons.push(reason("HUT", "HUT_DISQUALIFIED", "Participante HUT descalificado."));
    }
  }

  const completed = Boolean(hut && isHutCompleted(hut));
  return stage({
    applicable: true,
    completed,
    ready: !completed && reasons.length === 0,
    reasons: completed ? [] : reasons,
    warnings
  });
}

function buildLegacyWarnings(input: ParticipantReadinessInput): ParticipantReadinessReason[] {
  const phaseCodes = input.hutParticipant?.phaseCodes ?? [];
  const warnings: ParticipantReadinessReason[] = [];
  const usedLegacy = phaseCodes.filter((code) => ["USED", "VALIDATED"].includes(code.status));

  if (usedLegacy.length > 0) {
    warnings.push(
      reason("HUT", "LEGACY_HUT_PHASE_CODES_USED", "Existen HutParticipantPhaseCode historicos USED/VALIDATED.")
    );
  }
  if (phaseCodes.some((code) => code.phase === "REGRESO_2")) {
    warnings.push(reason("HUT", "LEGACY_REGRESO_2_CODE", "REGRESO_2 conserva codigo historico/legacy."));
  }

  return warnings;
}

function hasCompleteNavigoRotation(input: ParticipantReadinessInput): boolean {
  const arms = input.rotationAssignment?.arms ?? [];
  return Boolean(
    arms.find((arm) => arm.applicationOrder === 1)?.studyProduct?.internalCode &&
      arms.find((arm) => arm.applicationOrder === 2)?.studyProduct?.internalCode
  );
}

function hasCompletedCtlSession(input: ParticipantReadinessInput): boolean {
  return Boolean(input.ctlSessions?.some((session) => session.status === "COMPLETED"));
}

function hasActiveToken(input: ParticipantReadinessInput): boolean {
  const now = Date.now();
  return Boolean(
    input.accessTokens?.some((token) =>
      token.status === "ACTIVE" && (!token.expiresAt || token.expiresAt.getTime() > now)
    )
  );
}

function hasCurrentNavigoActivities(input: ParticipantReadinessInput): boolean {
  const codes = new Set(
    (input.activities ?? [])
      .map((activity) => activity.activitySchedule?.code)
      .filter((code): code is string => Boolean(code))
  );

  return NAVIGO_ACTIVITY_CODES.every((code) => codes.has(code));
}

function hasCompletedNavigoActivities(input: ParticipantReadinessInput): boolean {
  const byCode = new Map(
    (input.activities ?? [])
      .map((activity) => [activity.activitySchedule?.code ?? "", activity.status])
  );

  return NAVIGO_ACTIVITY_CODES.every((code) => byCode.get(code) === "COMPLETED");
}

function isReservedHutWithoutOperationalIdentity(hut: ParticipantReadinessHutParticipant): boolean {
  return hut.origin === "HUT_DIRECTO" &&
    !hut.studyParticipantId &&
    !normalizeText(hut.phone) &&
    !normalizeText(hut.email) &&
    /^HUT-\d+$/i.test(normalizeText(hut.name));
}

function isHutCompleted(hut: ParticipantReadinessHutParticipant): boolean {
  if (hut.status === "COMPLETED") {
    return true;
  }

  const attempt = hut.questionnaireAttempt;
  return Boolean(
    attempt?.status === "COMPLETED" &&
      attempt.visits?.some((visit) => HUT_COMPLETION_SECTIONS.has(visit.section) && visit.status === "COMPLETED")
  );
}

function resolveCurrentStage(input: {
  clt: ParticipantStageReadiness;
  hut: ParticipantStageReadiness;
  navigo: ParticipantStageReadiness;
  protocolType: ParticipantProtocolType;
  screening: ParticipantStageReadiness;
}): ParticipantCurrentStage {
  if (!input.screening.completed) {
    return input.screening.blockingReasons.some((item) => item.code === "PARTICIPANT_MISSING")
      ? "NO_IDENTITY"
      : "SCREENING_PENDING";
  }
  if (input.hut.completed) {
    return "HUT_COMPLETED";
  }
  if (input.protocolType === "HUT_DIRECTO") {
    return "SCREENING_COMPLETED";
  }
  if (input.hut.ready) {
    return "HUT_READY";
  }
  if (input.navigo.ready || input.navigo.completed) {
    return "NAVIGO_READY";
  }
  if (input.clt.completed) {
    return "CLT_COMPLETED";
  }
  if (input.clt.ready) {
    return "CLT_READY";
  }
  return "SCREENING_COMPLETED";
}

function resolveNextAllowedStage(input: {
  clt: ParticipantStageReadiness;
  hut: ParticipantStageReadiness;
  navigo: ParticipantStageReadiness;
  protocolType: ParticipantProtocolType;
  screening: ParticipantStageReadiness;
}): ParticipantOperationalStage | null {
  if (!input.screening.completed) {
    return "SCREENING";
  }
  if (input.protocolType === "HUT_DIRECTO") {
    return input.hut.completed ? null : "HUT";
  }
  if (!input.clt.completed) {
    return "CLT";
  }
  if (!input.navigo.completed) {
    return "NAVIGO";
  }
  if (!input.hut.completed) {
    return "HUT";
  }
  return null;
}

function stage(input: {
  applicable: boolean;
  completed: boolean;
  ready: boolean;
  reasons: ParticipantReadinessReason[];
  warnings?: ParticipantReadinessReason[];
}): ParticipantStageReadiness {
  return {
    applicable: input.applicable,
    blockingReasons: input.reasons,
    completed: input.completed,
    ready: input.ready,
    status: input.completed ? "COMPLETED" : input.ready ? "READY" : input.reasons.length > 0 ? "BLOCKED" : "PENDING",
    warnings: input.warnings ?? []
  };
}

function notApplicable(): ParticipantStageReadiness {
  return {
    applicable: false,
    blockingReasons: [],
    completed: false,
    ready: false,
    status: "NOT_APPLICABLE",
    warnings: []
  };
}

function reason(
  stageName: ParticipantOperationalStage,
  code: string,
  message: string
): ParticipantReadinessReason {
  return { code, message, stage: stageName };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}
