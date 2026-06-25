import { calculateParticipantActivities, type ActivitySchedule as BaseActivitySchedule } from "@/modules/activities";
import { resolveNavigoTimeZone, type NavigoActivityCode } from "./definition";
import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";

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
