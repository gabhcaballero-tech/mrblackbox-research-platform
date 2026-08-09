import type { HutPhase } from "./phase-codes";

export const HUT_PHOTO_TIME_ZONE = "America/Mexico_City";

export type HutPhotoTimelinePhoto = {
  capturedAt: Date;
  capturedLocalDate?: string | null;
  phase?: HutPhase | null;
  productCode: string | null;
  source: "DAILY_ENTRY" | "PHASE_EVIDENCE";
  useDayNumber?: number | null;
};

export type HutPhotoTimelineSlotStatus = "BLOCKED" | "COMPLETED" | "AVAILABLE" | "PROGRAMMED";

export type HutPhotoTimelineSlot = {
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
    productCode: string | null;
  }>;
  availableSlotId?: HutPhotoTimelineSlotId | null;
  currentPhase?: HutPhase | null;
  dailyEntries?: Array<{
    capturedAt: Date;
    capturedLocalDate?: string | null;
    productCode: string | null;
    useDayNumber?: number | null;
  }>;
  nextAvailableAt?: Date | null;
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
    note: "Colocacion y primera aplicacion del Producto 1. La evidencia historica COLOCACION se muestra aqui.",
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
  const dailyEntries = dedupeDailyEntries(input.dailyEntries ?? [], phaseEvidence);
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
  const nextAvailableDate = input.nextAvailableAt ? formatHutTimelineDate(input.nextAvailableAt) : null;
  const preliminarySlots = HUT_PHOTO_TIMELINE_DEFINITIONS.map((definition) => {
    const evidence = resolveEvidenceForDefinition(definition, phaseEvidence, dailyByUseDay);
    return buildTimelineSlot({
      availableDate: nextAvailableDate,
      definition,
      evidence,
      productCode: resolveProductCode(definition, input.rotation)
    });
  });
  const firstMissingCapturable = preliminarySlots.find((slot) => slot.participantTask && !slot.evidence);
  const availableSlotId = explicitAvailableSlotId ?? firstMissingCapturable?.id ?? null;
  let blockedByPrevious = false;

  return preliminarySlots.map((slot) => {
    if (slot.evidence) {
      return { ...slot, status: "COMPLETED" };
    }
    if (!slot.participantTask) {
      return { ...slot, status: "PROGRAMMED" };
    }
    if (input.testMode) {
      return { ...slot, status: "AVAILABLE" };
    }
    if (blockedByPrevious) {
      return { ...slot, status: "BLOCKED" };
    }
    if (slot.id === availableSlotId) {
      blockedByPrevious = true;
      return { ...slot, status: "AVAILABLE" };
    }

    blockedByPrevious = true;
    return { ...slot, status: "BLOCKED" };
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

export function formatHutTimelineDate(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    timeZone: HUT_PHOTO_TIME_ZONE,
    year: "numeric"
  }).format(date);
}

function buildTimelineSlot(input: {
  availableDate: string | null;
  definition: HutPhotoTimelineSlotDefinition;
  evidence: HutPhotoTimelinePhoto | null;
  productCode: string | null;
}): HutPhotoTimelineSlot {
  return {
    availableDate: input.availableDate,
    dayLabel: input.definition.dayLabel,
    evidence: input.evidence,
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

function resolveEvidenceForDefinition(
  definition: HutPhotoTimelineSlotDefinition,
  phaseEvidence: Map<HutPhase, HutPhotoTimelinePhoto>,
  dailyByUseDay: Map<number, HutPhotoTimelinePhoto>
): HutPhotoTimelinePhoto | null {
  if (definition.sourcePhase === "COLOCACION") {
    return phaseEvidence.get("COLOCACION") ?? dailyByUseDay.get(1) ?? null;
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
  phaseEvidence: Map<HutPhase, HutPhotoTimelinePhoto>
) {
  return entries.filter((entry) => {
    for (const evidence of phaseEvidence.values()) {
      if (entry.capturedAt.getTime() === evidence.capturedAt.getTime() && entry.productCode === evidence.productCode) {
        return false;
      }
    }
    return true;
  });
}
