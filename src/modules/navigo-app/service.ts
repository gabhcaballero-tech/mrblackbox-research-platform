import { calculateParticipantActivities, type ActivitySchedule as BaseActivitySchedule } from "@/modules/activities";
import {
  NAVIGO_ACTIVITY_CODES,
  createNavigoMeasurementDefinition,
  resolveNavigoTimeZone,
  type NavigoActivityCode,
  type NavigoMeasurementDefinition
} from "./definition";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import type { QuestionnaireQuestion } from "@/modules/questionnaire-engine";

export type NavigoParticipantStatus = "APPROVED" | "CONFIRMED" | "PENDING" | "REJECTED" | "TERMINATED";

export type NavigoScheduleRecord = {
  code: NavigoActivityCode;
  id: string;
  offsetMinutes: number;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED" | "INACTIVE";
  type: "INTERNAL_FOLLOWUP" | "QUESTIONNAIRE_MEASUREMENT";
  windowEndsMinutes: number;
  windowStartsMinutes: number;
};

export type NavigoActivityRecord = {
  activityScheduleId: string;
  actualCompletedAt?: Date | null;
  actualStartedAt?: Date | null;
  availableFrom: Date;
  availableUntil: Date;
  code?: NavigoActivityCode | null;
  id?: string;
  occurrenceKey: string;
  scheduledAt: Date;
  status: "AVAILABLE" | "COMPLETED" | "EXPIRED" | "INCOMPLETE" | "PENDING" | "REOPENED" | "STARTED";
};

export type NavigoParticipantRecord = {
  applicationStartedAt: Date | null;
  id: string;
  reviewStatus: NavigoParticipantStatus;
  studyCode: string;
  timeZoneIana?: string | null;
};

export type NavigoPreparedActivity = {
  activityScheduleId: string;
  availableFrom: Date;
  availableUntil: Date;
  code: NavigoActivityCode;
  occurrenceKey: "DEFAULT";
  scheduledAt: Date;
  status: "AVAILABLE" | "EXPIRED" | "PENDING";
  studyParticipantId: string;
};

export type PrepareNavigoActivitiesResult =
  | {
      message: string;
      ok: false;
      reason:
        | "APPLICATION_TIME_REQUIRED"
        | "NOT_CONFIRMED"
        | "NOT_NAVIGO"
        | "NO_SCHEDULES";
    }
  | {
      created: NavigoPreparedActivity[];
      ok: true;
      retained: NavigoActivityRecord[];
      timeZoneIana: string;
      updated: Array<
        Pick<NavigoPreparedActivity, "activityScheduleId" | "availableFrom" | "availableUntil" | "scheduledAt" | "status">
      >;
    };

export type NavigoActivityAvailability =
  | {
      canCapture: false;
      label:
        | "Aun no disponible"
        | "Completado"
        | "Fuera de ventana"
        | "No iniciado"
        | "Pendiente";
      reason:
        | "AFTER_WINDOW"
        | "ALREADY_COMPLETED"
        | "BEFORE_WINDOW"
        | "NO_T0"
        | "PREVIOUS_REQUIRED"
        | "T0_SLOT";
    }
  | {
      canCapture: true;
      label: "Disponible" | "Proxima a vencer";
      reason: "AVAILABLE" | "DUE_SOON";
    };

export type NavigoActivityTimelineItem = NavigoActivityRecord & {
  availability: NavigoActivityAvailability;
  code: NavigoActivityCode;
};

export type NavigoAnswerInput = Record<string, FormDataEntryValue | FormDataEntryValue[] | null | undefined>;

export type NavigoRotationReadinessInput = {
  applicationKitCode?: string | null;
  approvalComplete: boolean;
  folioComplete: boolean;
  leftArmComplete: boolean;
  rightArmComplete: boolean;
};

export type NavigoRotationChecklist = {
  applicationKit: "complete" | "pending";
  approval: "complete" | "pending";
  folio: "complete" | "pending";
  leftArm: "complete" | "pending";
  rightArm: "complete" | "pending";
};

export type NavigoAnswerValidationResult =
  | {
      answers: Array<{
        answerJson: unknown;
        questionId: string;
      }>;
      ok: true;
    }
  | {
      message: string;
      missingQuestionIds: string[];
      ok: false;
    };

export function prepareNavigoParticipantActivities({
  existingActivities,
  now = new Date(),
  participant,
  schedules
}: {
  existingActivities: NavigoActivityRecord[];
  now?: Date;
  participant: NavigoParticipantRecord;
  schedules: NavigoScheduleRecord[];
}): PrepareNavigoActivitiesResult {
  if (participant.studyCode.toUpperCase() !== NAVIGO_STUDY_CODE) {
    return {
      message: "Solo el estudio Navigo puede preparar actividades de la app.",
      ok: false,
      reason: "NOT_NAVIGO"
    };
  }

  if (participant.reviewStatus !== "APPROVED" && participant.reviewStatus !== "CONFIRMED") {
    return {
      message: "Solo participantes confirmados o aprobados pueden recibir actividades de la app.",
      ok: false,
      reason: "NOT_CONFIRMED"
    };
  }

  if (!participant.applicationStartedAt) {
    return {
      message: "Se requiere applicationStartedAt para preparar las actividades.",
      ok: false,
      reason: "APPLICATION_TIME_REQUIRED"
    };
  }

  const activeSchedules = schedules
    .filter((schedule) => schedule.status === "ACTIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (activeSchedules.length === 0) {
    return {
      message: "No existen schedules activos para Navigo.",
      ok: false,
      reason: "NO_SCHEDULES"
    };
  }

  const calculated = calculateParticipantActivities(
    participant.applicationStartedAt,
    activeSchedules.map(toBaseActivitySchedule),
    now
  );
  const byScheduleId = new Map(existingActivities.map((activity) => [activity.activityScheduleId, activity]));
  const codeByScheduleId = new Map(activeSchedules.map((schedule) => [schedule.id, schedule.code]));
  const created: NavigoPreparedActivity[] = [];
  const updated: Array<
    Pick<NavigoPreparedActivity, "activityScheduleId" | "availableFrom" | "availableUntil" | "scheduledAt" | "status">
  > = [];
  const retained: NavigoActivityRecord[] = [];

  for (const activity of calculated) {
    const existing = byScheduleId.get(activity.activityScheduleId);

    if (!existing) {
      created.push({
        activityScheduleId: activity.activityScheduleId,
        availableFrom: activity.availableFrom,
        availableUntil: activity.availableUntil,
        code: codeByScheduleId.get(activity.activityScheduleId) ?? "T2_HORAS",
        occurrenceKey: "DEFAULT",
        scheduledAt: activity.scheduledAt,
        status: toPersistenceStatus(activity.status),
        studyParticipantId: participant.id
      });
      continue;
    }

    if (canRescheduleExistingActivity(existing)) {
      updated.push({
        activityScheduleId: existing.activityScheduleId,
        availableFrom: activity.availableFrom,
        availableUntil: activity.availableUntil,
        scheduledAt: activity.scheduledAt,
        status: toPersistenceStatus(activity.status)
      });
      continue;
    }

    retained.push(existing);
  }

  return {
    created,
    ok: true,
    retained,
    timeZoneIana: resolveNavigoTimeZone(participant.timeZoneIana),
    updated
  };
}

export function buildNavigoActivityTimeline({
  activities,
  now = new Date()
}: {
  activities: NavigoActivityRecord[];
  now?: Date;
}): NavigoActivityTimelineItem[] {
  const byCode = new Map<NavigoActivityCode, NavigoActivityRecord>();

  for (const activity of activities) {
    const code = activity.code;
    if (code && NAVIGO_ACTIVITY_CODES.includes(code)) {
      byCode.set(code, activity);
    }
  }

  const timeline: NavigoActivityTimelineItem[] = [];

  for (const code of NAVIGO_ACTIVITY_CODES) {
    const activity = byCode.get(code);
    if (!activity) {
      continue;
    }

    timeline.push({
      ...activity,
      availability: getNavigoActivityAvailability({
        activity: { ...activity, code },
        now,
        previousActivities: timeline
      }),
      code
    });
  }

  return timeline;
}

export function getNextNavigoActivity(
  timeline: NavigoActivityTimelineItem[]
): NavigoActivityTimelineItem | null {
  return (
    timeline.find((activity) => activity.code !== "T0_SALON" && activity.status !== "COMPLETED") ??
    timeline.find((activity) => activity.code !== "T0_SALON") ??
    null
  );
}

export function validateNavigoMeasurementAnswers({
  definition = createNavigoMeasurementDefinition(),
  input
}: {
  definition?: NavigoMeasurementDefinition;
  input: NavigoAnswerInput;
}): NavigoAnswerValidationResult {
  const answers: Array<{ answerJson: unknown; questionId: string }> = [];
  const missingQuestionIds: string[] = [];

  for (const question of definition.questions) {
    const raw = input[question.id];
    const parsed = parseNavigoAnswer(question, raw);

    if (parsed === null) {
      if (question.required) {
        missingQuestionIds.push(question.id);
      }
      continue;
    }

    answers.push({
      answerJson: parsed,
      questionId: question.id
    });
  }

  if (missingQuestionIds.length > 0 || answers.length !== definition.questions.length) {
    return {
      message: "Completa todas las respuestas AP1 a AP7 para registrar la evaluacion.",
      missingQuestionIds,
      ok: false
    };
  }

  return {
    answers,
    ok: true
  };
}

export function navigoActivityLabel(code: NavigoActivityCode): string {
  switch (code) {
    case "T0_SALON":
      return "T0 en salon";
    case "T2_HORAS":
      return "Evaluacion 2 horas";
    case "T4_HORAS":
      return "Evaluacion 4 horas";
    case "T8_HORAS":
      return "Evaluacion 8 horas";
  }
}

export function normalizeNavigoRotationCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function buildNavigoRotationChecklist(input: NavigoRotationReadinessInput): NavigoRotationChecklist {
  return {
    applicationKit: input.applicationKitCode?.trim() ? "complete" : "pending",
    approval: input.approvalComplete ? "complete" : "pending",
    folio: input.folioComplete ? "complete" : "pending",
    leftArm: input.leftArmComplete ? "complete" : "pending",
    rightArm: input.rightArmComplete ? "complete" : "pending"
  };
}

export function buildNavigoStartT0PendingMessage(input: NavigoRotationReadinessInput): string | null {
  const pending: string[] = [];

  if (!input.approvalComplete) {
    pending.push("aprobacion del participante");
  }
  if (!input.folioComplete) {
    pending.push("folio");
  }
  if (!input.leftArmComplete) {
    pending.push("asignar brazo izquierdo");
  }
  if (!input.rightArmComplete) {
    pending.push("asignar brazo derecho");
  }

  return pending.length > 0 ? `Pendiente para iniciar T0: ${pending.join(", ")}.` : null;
}

function getNavigoActivityAvailability({
  activity,
  now,
  previousActivities
}: {
  activity: NavigoActivityRecord & { code: NavigoActivityCode };
  now: Date;
  previousActivities: NavigoActivityTimelineItem[];
}): NavigoActivityAvailability {
  if (activity.code === "T0_SALON") {
    if (activity.status === "COMPLETED") {
      return {
        canCapture: false,
        label: "Completado",
        reason: "ALREADY_COMPLETED"
      };
    }

    return {
      canCapture: false,
      label: "No iniciado",
      reason: "T0_SLOT"
    };
  }

  if (activity.status === "COMPLETED") {
    return {
      canCapture: false,
      label: "Completado",
      reason: "ALREADY_COMPLETED"
    };
  }

  const previousMeasurement = [...previousActivities]
    .reverse()
    .find((candidate) => candidate.code !== "T0_SALON");

  if (previousMeasurement && previousMeasurement.status !== "COMPLETED") {
    return {
      canCapture: false,
      label: "Pendiente",
      reason: "PREVIOUS_REQUIRED"
    };
  }

  if (now.getTime() < activity.availableFrom.getTime()) {
    return {
      canCapture: false,
      label: "Aun no disponible",
      reason: "BEFORE_WINDOW"
    };
  }

  if (now.getTime() > activity.availableUntil.getTime()) {
    return {
      canCapture: false,
      label: "Fuera de ventana",
      reason: "AFTER_WINDOW"
    };
  }

  const minutesUntilClose = (activity.availableUntil.getTime() - now.getTime()) / 60000;

  return {
    canCapture: true,
    label: minutesUntilClose <= 60 ? "Proxima a vencer" : "Disponible",
    reason: minutesUntilClose <= 60 ? "DUE_SOON" : "AVAILABLE"
  };
}

function parseNavigoAnswer(question: QuestionnaireQuestion, raw: FormDataEntryValue | FormDataEntryValue[] | null | undefined) {
  if (question.type === "single_choice") {
    const value = singleValue(raw);
    if (!value || !question.options.some((option) => option.value === value)) {
      return null;
    }

    return {
      value
    };
  }

  if (question.type === "scale") {
    const value = singleValue(raw);
    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric < question.min || numeric > question.max) {
      return null;
    }

    return {
      value: numeric
    };
  }

  return null;
}

function singleValue(raw: FormDataEntryValue | FormDataEntryValue[] | null | undefined): string {
  if (Array.isArray(raw)) {
    return String(raw[0] ?? "").trim();
  }

  return String(raw ?? "").trim();
}

function canRescheduleExistingActivity(activity: NavigoActivityRecord): boolean {
  if (activity.actualStartedAt || activity.actualCompletedAt) {
    return false;
  }

  return activity.status === "PENDING" || activity.status === "AVAILABLE" || activity.status === "EXPIRED";
}

function toBaseActivitySchedule(schedule: NavigoScheduleRecord): BaseActivitySchedule {
  return {
    anchorEvent: "application_started",
    code: schedule.code,
    id: schedule.id,
    name: schedule.code,
    offsetMinutes: schedule.offsetMinutes,
    sortOrder: schedule.sortOrder,
    status: schedule.status === "ACTIVE" ? "active" : "inactive",
    type: schedule.type === "INTERNAL_FOLLOWUP" ? "internal_followup" : "questionnaire_measurement",
    windowEndsMinutes: schedule.windowEndsMinutes,
    windowStartsMinutes: schedule.windowStartsMinutes
  };
}

function toPersistenceStatus(
  status: "available" | "completed" | "expired" | "incomplete" | "pending" | "started"
): NavigoPreparedActivity["status"] {
  if (status === "available") {
    return "AVAILABLE";
  }

  if (status === "expired") {
    return "EXPIRED";
  }

  if (status === "started" || status === "incomplete" || status === "completed") {
    return "AVAILABLE";
  }

  return "PENDING";
}
