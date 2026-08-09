import type { HutPhase } from "./phase-codes";
import { formatDateMexicoCity, formatDateTimeMexicoCity } from "@/shared/utils/date-format";

export const HUT_PHOTO_TIME_ZONE = "America/Mexico_City";

export type HutPhotoTimelinePhoto = {
  capturedAt: Date;
  capturedLocalDate?: string | null;
  phase?: HutPhase | null;
  privateStorageKey?: string | null;
  productCode: string | null;
  source: "DAILY_ENTRY" | "PHASE_EVIDENCE";
  useDayNumber?: number | null;
};

export type HutPhotoTimelineSlotStatus = "BLOCKED" | "COMPLETED" | "AVAILABLE" | "PROGRAMMED";

export type HutPhotoTimelineSlot = {
  availableAt: Date | null;
  availableDate: string | null;
  dayLabel: string;
  evidence: HutPhotoTimelinePhoto | null;
  id: HutPhotoTimelineSlotId;
  interviewerTask: string | null;
  isCapturableWithCurrentModel: boolean;
  note: string;
  participantTask: string | null;
  productCode: string | null;
  sourcePhase: HutPhase | null;
  status: HutPhotoTimelineSlotStatus;
  title: string;
  useDayNumber: number | null;
};

export type HutPhotoTimelineSlotId =
  | "DELIVERY"
  | "PRODUCT_1_DAY_1"
  | "PRODUCT_1_DAY_2"
  | "PRODUCT_1_DAY_3_MORNING"
  | "PRODUCT_1_EVALUATION_1"
  | "PRODUCT_2_DAY_1"
  | "PRODUCT_2_DAY_2"
  | "PRODUCT_2_DAY_3_MORNING"
  | "PRODUCT_2_EVALUATION_2";

export type HutPhotoTimelineInput = {
  applicationEvidence?: Array<{
    capturedAt: Date;
    phase: HutPhase;
    privateStorageKey?: string | null;
    productCode: string | null;
  }>;
  availableSlotId?: HutPhotoTimelineSlotId | null;
  currentPhase?: HutPhase | null;
  dailyEntries?: Array<{
    capturedAt: Date;
    capturedLocalDate?: string | null;
    privateStorageKey?: string | null;
    productCode: string | null;
    useDayNumber?: number | null;
  }>;
  legacyMirroredPlacementPhoto?: boolean;
  nextAvailableAt?: Date | null;
  photoCaptureBlocked?: boolean;
  now?: Date;
  rotation: {
    eva1: string | null;
    eva2: string | null;
  };
  testMode?: boolean;
};

export type HutPhotoTimelineSlotDefinition = {
  dayLabel: string;
  id: HutPhotoTimelineSlotId;
  interviewerTask: string | null;
  note: string;
  participantTask: string | null;
  product: "EVA1" | "EVA2" | null;
  sourcePhase: HutPhase | null;
  title: string;
  useDayNumber: number | null;
};

export const HUT_PHOTO_TIMELINE_DEFINITIONS: HutPhotoTimelineSlotDefinition[] = [
  {
    dayLabel: "Entrega",
    id: "DELIVERY",
    interviewerTask: null,
    note: "Foto de recepcion del producto.",
    participantTask: "Foto entrega",
    product: null,
    sourcePhase: null,
    title: "Entrega del producto",
    useDayNumber: 0
  },
  {
    dayLabel: "Producto 1 - Dia 1",
    id: "PRODUCT_1_DAY_1",
    interviewerTask: null,
    note: "Colocacion y primera aplicacion del Producto 1. La evidencia historica COLOCACION se conserva y se presenta segun exista entrega separada.",
    participantTask: "Foto colocacion / aplicacion",
    product: "EVA1",
    sourcePhase: "COLOCACION",
    title: "Colocacion / aplicacion del producto 1",
    useDayNumber: 1
  },
  {
    dayLabel: "Producto 1 - Dia 2",
    id: "PRODUCT_1_DAY_2",
    interviewerTask: null,
    note: "Seguimiento fotografico del Producto 1.",
    participantTask: "Foto seguimiento",
    product: "EVA1",
    sourcePhase: null,
    title: "Seguimiento producto 1",
    useDayNumber: 2
  },
  {
    dayLabel: "Producto 1 - Dia 3 manana",
    id: "PRODUCT_1_DAY_3_MORNING",
    interviewerTask: null,
    note: "Foto de la manana previa a la Evaluacion 1.",
    participantTask: "Foto seguimiento",
    product: "EVA1",
    sourcePhase: null,
    title: "Seguimiento producto 1",
    useDayNumber: 3
  },
  {
    dayLabel: "Producto 1 - Dia 3 tarde",
    id: "PRODUCT_1_EVALUATION_1",
    interviewerTask: "Evaluacion 1",
    note: "Visita del encuestador posterior al ciclo fotografico del Producto 1.",
    participantTask: null,
    product: "EVA1",
    sourcePhase: "REGRESO_1",
    title: "Evaluacion 1",
    useDayNumber: null
  },
  {
    dayLabel: "Producto 2 - Dia 1",
    id: "PRODUCT_2_DAY_1",
    interviewerTask: null,
    note: "Aplicacion del Producto 2.",
    participantTask: "Foto aplicacion",
    product: "EVA2",
    sourcePhase: null,
    title: "Aplicacion producto 2",
    useDayNumber: 4
  },
  {
    dayLabel: "Producto 2 - Dia 2",
    id: "PRODUCT_2_DAY_2",
    interviewerTask: null,
    note: "Seguimiento fotografico del Producto 2.",
    participantTask: "Foto seguimiento",
    product: "EVA2",
    sourcePhase: null,
    title: "Seguimiento producto 2",
    useDayNumber: 5
  },
  {
    dayLabel: "Producto 2 - Dia 3 manana",
    id: "PRODUCT_2_DAY_3_MORNING",
    interviewerTask: null,
    note: "Foto de la manana previa a la Evaluacion 2.",
    participantTask: "Foto seguimiento",
    product: "EVA2",
    sourcePhase: null,
    title: "Seguimiento producto 2",
    useDayNumber: 6
  },
  {
    dayLabel: "Producto 2 - Dia 3 tarde",
    id: "PRODUCT_2_EVALUATION_2",
    interviewerTask: "Evaluacion 2",
    note: "Visita del encuestador posterior al ciclo fotografico del Producto 2.",
    participantTask: null,
    product: "EVA2",
    sourcePhase: "REGRESO_2",
    title: "Evaluacion 2",
    useDayNumber: null
  }
];

export function buildHutPhotoTimeline(input: HutPhotoTimelineInput): HutPhotoTimelineSlot[] {
  const phaseEvidence = new Map(
    (input.applicationEvidence ?? []).map((evidence) => [
      evidence.phase,
      {
        ...evidence,
        source: "PHASE_EVIDENCE" as const,
        useDayNumber: null
      }
    ])
  );
  const rawDailyByUseDay = new Map<number, HutPhotoTimelinePhoto>();
  for (const entry of input.dailyEntries ?? []) {
    if (typeof entry.useDayNumber !== "number") {
      continue;
    }
    rawDailyByUseDay.set(entry.useDayNumber, {
      ...entry,
      phase: null,
      source: "DAILY_ENTRY" as const
    });
  }
  const legacyMirroredPlacementPhoto = input.legacyMirroredPlacementPhoto ?? isLegacyMirroredPlacementPhoto({
    colocacionEvidence: phaseEvidence.get("COLOCACION") ?? null,
    day1Entry: rawDailyByUseDay.get(1) ?? null,
    deliveryEntry: rawDailyByUseDay.get(0) ?? null
  });
  const dailyEntries = dedupeDailyEntries(input.dailyEntries ?? [], phaseEvidence, legacyMirroredPlacementPhoto);
  const dailyByUseDay = new Map<number, HutPhotoTimelinePhoto>();
  for (const entry of dailyEntries) {
    if (typeof entry.useDayNumber !== "number") {
      continue;
    }
    dailyByUseDay.set(entry.useDayNumber, {
      ...entry,
      phase: null,
      source: "DAILY_ENTRY" as const
    });
  }
  const explicitAvailableSlotId = input.availableSlotId ?? null;
  const preliminarySlots = HUT_PHOTO_TIMELINE_DEFINITIONS.map((definition) => {
    const evidence = resolveEvidenceForDefinition(definition, phaseEvidence, dailyByUseDay, legacyMirroredPlacementPhoto);
    return buildTimelineSlot({
      availableAt: null,
      definition,
      evidence,
      productCode: resolveProductCode(definition, input.rotation)
    });
  });
  const scheduledAvailability = buildScheduledAvailability(preliminarySlots);
  const firstMissingCapturable = preliminarySlots.find((slot) => slot.participantTask && !slot.evidence);
  const explicitAvailableSlot = explicitAvailableSlotId
    ? preliminarySlots.find((slot) => slot.id === explicitAvailableSlotId) ?? null
    : null;
  const availableSlotId = explicitAvailableSlot?.evidence
    ? firstMissingCapturable?.id ?? null
    : explicitAvailableSlotId ?? firstMissingCapturable?.id ?? null;
  let blockedByPrevious = false;
  const now = input.now ?? new Date();

  return preliminarySlots.map((slot) => {
    const availableAt = scheduledAvailability.get(slot.id) ?? input.nextAvailableAt ?? null;
    const slotWithAvailability = {
      ...slot,
      availableAt,
      availableDate: availableAt ? formatHutTimelineDateTime(availableAt) : null
    };

    if (slotWithAvailability.evidence) {
      return { ...slotWithAvailability, status: "COMPLETED" };
    }
    if (!slotWithAvailability.participantTask) {
      return { ...slotWithAvailability, status: "PROGRAMMED" };
    }
    if (input.photoCaptureBlocked) {
      return { ...slotWithAvailability, status: "BLOCKED" };
    }
    if (input.testMode) {
      return { ...slotWithAvailability, status: "AVAILABLE" };
    }
    if (blockedByPrevious) {
      return { ...slotWithAvailability, status: "BLOCKED" };
    }
    if (slotWithAvailability.id === availableSlotId) {
      blockedByPrevious = true;
      if (availableAt && now.getTime() < availableAt.getTime()) {
        return { ...slotWithAvailability, status: "PROGRAMMED" };
      }
      return { ...slotWithAvailability, status: "AVAILABLE" };
    }

    blockedByPrevious = true;
    return { ...slotWithAvailability, status: "BLOCKED" };
  });
}

export function resolveHutOperationalStatusLabel(status: string): string {
  const legacyCallPending = new Set(["BLOCK_1_CALL_PENDING", "BLOCK_2_CALL_PENDING"]);
  if (legacyCallPending.has(status)) {
    return "En seguimiento";
  }

  const labels: Record<string, string> = {
    BLOCK_1_IN_PROGRESS: "En seguimiento",
    BLOCK_2_IN_PROGRESS: "En seguimiento",
    COMPLETED: "Completado",
    DISQUALIFIED: "No apto",
    IN_PROGRESS: "En seguimiento",
    NOT_STARTED: "No iniciado"
  };
  return labels[status] ?? status;
}

export function formatHutPhotoTimelineSlotTitle(slot: Pick<HutPhotoTimelineSlot, "dayLabel" | "id" | "title">): string {
  const titles: Record<string, string> = {
    DELIVERY: "Entrega del producto",
    PRODUCT_1_DAY_1: "Producto 1 - Dia 1 (Colocacion)",
    PRODUCT_1_DAY_2: "Producto 1 - Dia 2",
    PRODUCT_1_DAY_3_MORNING: "Producto 1 - Dia 3 manana",
    PRODUCT_1_EVALUATION_1: "Producto 1 - Dia 3 tarde - Evaluacion 1",
    PRODUCT_2_DAY_1: "Producto 2 - Dia 1",
    PRODUCT_2_DAY_2: "Producto 2 - Dia 2",
    PRODUCT_2_DAY_3_MORNING: "Producto 2 - Dia 3 manana",
    PRODUCT_2_EVALUATION_2: "Producto 2 - Dia 3 tarde - Evaluacion 2"
  };

  return titles[slot.id] ?? `${slot.dayLabel} ${slot.title}`;
}

export function resolveHutPhotoTimelinePhaseLabel(phase: string | null | undefined): string {
  const labels: Record<string, string> = {
    COLOCACION: "Producto 1 - Dia 1 (Colocacion)",
    REGRESO_1: "Evaluacion 1 - registro historico",
    REGRESO_2: "Evaluacion 2 - registro historico"
  };

  return phase ? labels[phase] ?? phase : "Sin fase";
}

export function resolveHutPhotoTimelineUseDayLabel(useDayNumber: number | null | undefined): string {
  const labels: Record<number, string> = {
    0: "Entrega del producto",
    1: "Producto 1 - Dia 1 (Colocacion)",
    2: "Producto 1 - Dia 2",
    3: "Producto 1 - Dia 3 manana",
    4: "Producto 2 - Dia 1",
    5: "Producto 2 - Dia 2",
    6: "Producto 2 - Dia 3 manana"
  };

  return typeof useDayNumber === "number" ? labels[useDayNumber] ?? `Dia ${useDayNumber}` : "Dia no asignado";
}

export function resolveHutPhotoTimelinePhotoLabel(
  photo: {
    capturedAt: Date;
    phase?: string | null;
    source: "DAILY_ENTRY" | "PHASE_EVIDENCE";
    useDayNumber?: number | null;
  },
  timeline: Array<Pick<HutPhotoTimelineSlot, "dayLabel" | "evidence" | "id" | "title">> = []
): string {
  const matchingSlot = timeline.find((slot) => slot.evidence && sameTimelinePhoto(slot.evidence, photo));
  if (matchingSlot) {
    return formatHutPhotoTimelineSlotTitle(matchingSlot);
  }

  return photo.source === "PHASE_EVIDENCE"
    ? resolveHutPhotoTimelinePhaseLabel(photo.phase)
    : resolveHutPhotoTimelineUseDayLabel(photo.useDayNumber);
}

export function resolveHutPhaseCodeSlotTimelineLabel(slot: number | null | undefined): string {
  const labels: Record<number, string> = {
    1: "Colocacion / Producto 1 Dia 1",
    2: "Evaluacion 1",
    3: "Evaluacion 2"
  };

  return typeof slot === "number" ? labels[slot] ?? `Slot ${slot}` : "Slot no asignado";
}

export function getHutPhotoTimelineSlotDefinition(slotId: string | null | undefined): HutPhotoTimelineSlotDefinition | null {
  return HUT_PHOTO_TIMELINE_DEFINITIONS.find((definition) => definition.id === slotId) ?? null;
}

export function getNextHutPhotoTimelineSlot(input: HutPhotoTimelineInput): HutPhotoTimelineSlot | null {
  return buildHutPhotoTimeline(input).find((slot) => slot.participantTask && slot.status === "AVAILABLE") ?? null;
}

export function getNextPendingHutPhotoTimelineSlot(input: HutPhotoTimelineInput): HutPhotoTimelineSlot | null {
  return buildHutPhotoTimeline(input).find((slot) => slot.participantTask && !slot.evidence) ?? null;
}

export function formatHutTimelineDate(date: Date): string {
  return formatDateMexicoCity(date);
}

export function formatHutTimelineDateTime(date: Date): string {
  return formatDateTimeMexicoCity(date);
}

export function isLegacyMirroredPlacementPhoto(input: {
  colocacionEvidence?: {
    capturedAt: Date;
    phase?: HutPhase | null;
    privateStorageKey?: string | null;
    productCode: string | null;
  } | null;
  day1Entry?: {
    capturedAt: Date;
    privateStorageKey?: string | null;
    productCode: string | null;
    useDayNumber?: number | null;
  } | null;
  deliveryEntry?: {
    useDayNumber?: number | null;
  } | null;
}): boolean {
  const evidence = input.colocacionEvidence ?? null;
  const day1Entry = input.day1Entry ?? null;
  if (!evidence || !day1Entry || input.deliveryEntry) {
    return false;
  }
  if (evidence.phase !== "COLOCACION" || day1Entry.useDayNumber !== 1) {
    return false;
  }
  if (!evidence.privateStorageKey || !day1Entry.privateStorageKey) {
    return false;
  }

  return evidence.privateStorageKey === day1Entry.privateStorageKey
    && evidence.capturedAt.getTime() === day1Entry.capturedAt.getTime()
    && evidence.productCode === day1Entry.productCode;
}

function buildTimelineSlot(input: {
  availableAt: Date | null;
  definition: HutPhotoTimelineSlotDefinition;
  evidence: HutPhotoTimelinePhoto | null;
  productCode: string | null;
}): HutPhotoTimelineSlot {
  return {
    availableAt: input.availableAt,
    availableDate: input.availableAt ? formatHutTimelineDateTime(input.availableAt) : null,
    dayLabel: input.definition.dayLabel,
    evidence: sanitizeTimelinePhoto(input.evidence),
    id: input.definition.id,
    interviewerTask: input.definition.interviewerTask,
    isCapturableWithCurrentModel: Boolean(input.definition.participantTask),
    note: input.definition.note,
    participantTask: input.definition.participantTask,
    productCode: input.evidence?.productCode ?? input.productCode,
    sourcePhase: input.definition.sourcePhase,
    status: input.evidence ? "COMPLETED" : "PROGRAMMED",
    title: input.definition.title,
    useDayNumber: input.definition.useDayNumber
  };
}

function buildScheduledAvailability(slots: HutPhotoTimelineSlot[]): Map<HutPhotoTimelineSlotId, Date> {
  const dependencies: Partial<Record<HutPhotoTimelineSlotId, HutPhotoTimelineSlotId>> = {
    PRODUCT_1_DAY_2: "PRODUCT_1_DAY_1",
    PRODUCT_1_DAY_3_MORNING: "PRODUCT_1_DAY_2",
    PRODUCT_2_DAY_2: "PRODUCT_2_DAY_1",
    PRODUCT_2_DAY_3_MORNING: "PRODUCT_2_DAY_2"
  };
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const availability = new Map<HutPhotoTimelineSlotId, Date>();

  for (const [slotId, previousSlotId] of Object.entries(dependencies) as Array<[HutPhotoTimelineSlotId, HutPhotoTimelineSlotId]>) {
    const previousEvidence = byId.get(previousSlotId)?.evidence ?? null;
    if (!previousEvidence) {
      continue;
    }
    availability.set(slotId, nextPhotoCaptureAvailableAt(previousEvidence.capturedAt));
  }

  return availability;
}

function nextPhotoCaptureAvailableAt(previousCapturedAt: Date): Date {
  const previousLocalDate = mexicoCityLocalDateKey(previousCapturedAt);
  const nextLocalDate = offsetLocalDateKey(previousLocalDate, 1);

  return mexicoCityLocalDateTimeToUtc(nextLocalDate, 4, 0);
}

function mexicoCityLocalDateKey(date: Date): string {
  const parts = mexicoCityDateParts(date);

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function mexicoCityDateParts(date: Date): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: HUT_PHOTO_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    second: value("second"),
    year: value("year")
  };
}

function mexicoCityLocalDateTimeToUtc(dateKey: string, hour: number, minute: number): Date {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(targetUtc);

  for (let index = 0; index < 3; index += 1) {
    const parts = mexicoCityDateParts(candidate);
    const candidateLocalAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate = new Date(candidate.getTime() + (targetUtc - candidateLocalAsUtc));
  }

  return candidate;
}

function offsetLocalDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function sanitizeTimelinePhoto(photo: HutPhotoTimelinePhoto | null): HutPhotoTimelinePhoto | null {
  if (!photo) {
    return null;
  }
  const safePhoto = { ...photo };
  delete safePhoto.privateStorageKey;
  return safePhoto;
}

function resolveEvidenceForDefinition(
  definition: HutPhotoTimelineSlotDefinition,
  phaseEvidence: Map<HutPhase, HutPhotoTimelinePhoto>,
  dailyByUseDay: Map<number, HutPhotoTimelinePhoto>,
  legacyMirroredPlacementPhoto: boolean
): HutPhotoTimelinePhoto | null {
  const colocacionEvidence = phaseEvidence.get("COLOCACION") ?? null;
  const deliveryEvidence = dailyByUseDay.get(0) ?? null;

  if (definition.id === "DELIVERY") {
    return deliveryEvidence ?? colocacionEvidence;
  }
  if (definition.sourcePhase === "COLOCACION") {
    if (legacyMirroredPlacementPhoto) {
      return dailyByUseDay.get(1) ?? null;
    }
    return deliveryEvidence ? colocacionEvidence ?? dailyByUseDay.get(1) ?? null : dailyByUseDay.get(1) ?? null;
  }
  if (typeof definition.useDayNumber === "number") {
    return dailyByUseDay.get(definition.useDayNumber) ?? null;
  }

  return null;
}

function resolveProductCode(
  definition: HutPhotoTimelineSlotDefinition,
  rotation: HutPhotoTimelineInput["rotation"]
): string | null {
  if (definition.product === "EVA1") {
    return rotation.eva1;
  }
  if (definition.product === "EVA2") {
    return rotation.eva2;
  }

  return null;
}

function dedupeDailyEntries(
  entries: NonNullable<HutPhotoTimelineInput["dailyEntries"]>,
  phaseEvidence: Map<HutPhase, HutPhotoTimelinePhoto>,
  legacyMirroredPlacementPhoto: boolean
) {
  return entries.filter((entry) => {
    if (legacyMirroredPlacementPhoto && entry.useDayNumber === 1) {
      const colocacionEvidence = phaseEvidence.get("COLOCACION") ?? null;
      if (colocacionEvidence && entry.capturedAt.getTime() === colocacionEvidence.capturedAt.getTime() && entry.productCode === colocacionEvidence.productCode) {
        return false;
      }
    }
    for (const evidence of phaseEvidence.values()) {
      const sameStoredFile = !entry.privateStorageKey || !evidence.privateStorageKey || entry.privateStorageKey === evidence.privateStorageKey;
      if (sameStoredFile && entry.capturedAt.getTime() === evidence.capturedAt.getTime() && entry.productCode === evidence.productCode) {
        return false;
      }
    }
    return true;
  });
}

function sameTimelinePhoto(
  timelinePhoto: HutPhotoTimelinePhoto,
  photo: {
    capturedAt: Date;
    phase?: string | null;
    source: "DAILY_ENTRY" | "PHASE_EVIDENCE";
    useDayNumber?: number | null;
  }
): boolean {
  if (timelinePhoto.source !== photo.source || timelinePhoto.capturedAt.getTime() !== photo.capturedAt.getTime()) {
    return false;
  }
  if (photo.source === "PHASE_EVIDENCE") {
    return timelinePhoto.phase === photo.phase;
  }

  return timelinePhoto.useDayNumber === photo.useDayNumber;
}
