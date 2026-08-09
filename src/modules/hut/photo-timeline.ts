import type { HutPhase } from "./phase-codes";

export type HutPhotoTimelinePhoto = {
  capturedAt: Date;
  capturedLocalDate?: string | null;
  phase?: HutPhase | null;
  productCode: string | null;
  source: "DAILY_ENTRY" | "PHASE_EVIDENCE";
  useDayNumber?: number | null;
};

export type HutPhotoTimelineSlot = {
  availableDate: string | null;
  dayLabel: string;
  evidence: HutPhotoTimelinePhoto | null;
  id: string;
  interviewerTask: string | null;
  isCapturableWithCurrentModel: boolean;
  note: string;
  participantTask: string | null;
  productCode: string | null;
  sourcePhase: HutPhase | null;
  status: "COMPLETED" | "CURRENT" | "PROGRAMMED";
  title: string;
};

export type HutPhotoTimelineInput = {
  applicationEvidence?: Array<{
    capturedAt: Date;
    phase: HutPhase;
    productCode: string | null;
  }>;
  availablePhase?: HutPhase | null;
  currentPhase?: HutPhase | null;
  dailyEntries?: Array<{
    capturedAt: Date;
    capturedLocalDate?: string | null;
    productCode: string | null;
    useDayNumber?: number | null;
  }>;
  nextAvailableAt?: Date | null;
  rotation: {
    eva1: string | null;
    eva2: string | null;
  };
};

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
  const dailyByUseDay = new Map(
    dailyEntries
      .filter((entry) => typeof entry.useDayNumber === "number")
      .map((entry) => [
        entry.useDayNumber,
        {
          ...entry,
          phase: null,
          source: "DAILY_ENTRY" as const
        }
      ])
  );
  const activePhase = input.currentPhase ?? input.availablePhase ?? null;
  const nextAvailableDate = input.nextAvailableAt?.toLocaleDateString("es-MX") ?? null;

  return [
    buildTimelineSlot({
      activePhase,
      dayLabel: "Entrega",
      evidence: phaseEvidence.get("COLOCACION") ?? null,
      id: "DELIVERY",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "La evidencia historica COLOCACION se muestra como entrega del producto.",
      participantTask: "Foto entrega",
      productCode: phaseEvidence.get("COLOCACION")?.productCode ?? input.rotation.eva1,
      sourcePhase: "COLOCACION",
      title: "Entrega del producto"
    }),
    buildTimelineSlot({
      activePhase,
      dayLabel: "Colocacion",
      evidence: null,
      id: "PLACEMENT",
      interviewerTask: null,
      isCapturableWithCurrentModel: false,
      note: "Entrega y colocacion son actividades independientes; falta una fase separada en el modelo actual.",
      participantTask: "Foto colocacion",
      productCode: input.rotation.eva1,
      sourcePhase: null,
      title: "Colocacion"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Producto 1 - Dia 1",
      evidence: dailyByUseDay.get(1) ?? null,
      id: "PRODUCT_1_DAY_1",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "Foto diaria del primer producto.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(1)?.productCode ?? input.rotation.eva1,
      sourcePhase: null,
      title: "Foto diaria"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Producto 1 - Dia 2",
      evidence: dailyByUseDay.get(2) ?? null,
      id: "PRODUCT_1_DAY_2",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "Foto diaria del primer producto.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(2)?.productCode ?? input.rotation.eva1,
      sourcePhase: null,
      title: "Foto diaria"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Producto 1 - Dia 3 manana",
      evidence: phaseEvidence.get("REGRESO_1") ?? dailyByUseDay.get(3) ?? null,
      id: "PRODUCT_1_DAY_3_MORNING",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "La evidencia historica REGRESO_1 se muestra como foto de la manana previa a Evaluacion 1.",
      participantTask: "Foto manana",
      productCode: phaseEvidence.get("REGRESO_1")?.productCode ?? dailyByUseDay.get(3)?.productCode ?? input.rotation.eva1,
      sourcePhase: "REGRESO_1",
      title: "Foto diaria"
    }),
    buildTimelineSlot({
      activePhase,
      dayLabel: "Producto 1 - Dia 3 tarde",
      evidence: null,
      id: "PRODUCT_1_EVALUATION_1",
      interviewerTask: "Evaluacion 1",
      isCapturableWithCurrentModel: false,
      note: "Visita del encuestador; no se muestra en el portal participante.",
      participantTask: null,
      productCode: input.rotation.eva1,
      sourcePhase: null,
      title: "Evaluacion 1"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Producto 2 - Dia 1",
      evidence: dailyByUseDay.get(4) ?? null,
      id: "PRODUCT_2_DAY_1",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "Foto diaria del segundo producto.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(4)?.productCode ?? input.rotation.eva2,
      sourcePhase: null,
      title: "Foto diaria"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Producto 2 - Dia 2",
      evidence: dailyByUseDay.get(5) ?? null,
      id: "PRODUCT_2_DAY_2",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "Foto diaria del segundo producto.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(5)?.productCode ?? input.rotation.eva2,
      sourcePhase: null,
      title: "Foto diaria"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Producto 2 - Dia 3 manana",
      evidence: phaseEvidence.get("REGRESO_2") ?? dailyByUseDay.get(6) ?? null,
      id: "PRODUCT_2_DAY_3_MORNING",
      interviewerTask: null,
      isCapturableWithCurrentModel: true,
      note: "La evidencia historica REGRESO_2 se muestra como foto de la manana previa a Evaluacion 2.",
      participantTask: "Foto manana",
      productCode: phaseEvidence.get("REGRESO_2")?.productCode ?? dailyByUseDay.get(6)?.productCode ?? input.rotation.eva2,
      sourcePhase: "REGRESO_2",
      title: "Foto diaria"
    }),
    buildTimelineSlot({
      activePhase,
      dayLabel: "Producto 2 - Dia 3 tarde",
      evidence: null,
      id: "PRODUCT_2_EVALUATION_2",
      interviewerTask: "Evaluacion 2",
      isCapturableWithCurrentModel: false,
      note: "Visita del encuestador; no se muestra en el portal participante.",
      participantTask: null,
      productCode: input.rotation.eva2,
      sourcePhase: null,
      title: "Evaluacion 2"
    })
  ];
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
    PLACEMENT: "Colocacion",
    PRODUCT_1_DAY_1: "Producto 1 - Dia 1",
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
    COLOCACION: "Entrega",
    REGRESO_1: "Producto 1 - Dia 3 manana",
    REGRESO_2: "Producto 2 - Dia 3 manana"
  };

  return phase ? labels[phase] ?? phase : "Sin fase";
}

export function resolveHutPhotoTimelineUseDayLabel(useDayNumber: number | null | undefined): string {
  const labels: Record<number, string> = {
    1: "Producto 1 - Dia 1",
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
    1: "Entrega",
    2: "Evaluacion 1",
    3: "Evaluacion 2"
  };

  return typeof slot === "number" ? labels[slot] ?? `Slot ${slot}` : "Slot no asignado";
}

function buildTimelineSlot(input: {
  activePhase: HutPhase | null;
  availableDate?: string | null;
  dayLabel: string;
  evidence: HutPhotoTimelinePhoto | null;
  id: string;
  interviewerTask: string | null;
  isCapturableWithCurrentModel: boolean;
  note: string;
  participantTask: string | null;
  productCode: string | null;
  sourcePhase: HutPhase | null;
  title: string;
}): HutPhotoTimelineSlot {
  return {
    availableDate: input.availableDate ?? null,
    dayLabel: input.dayLabel,
    evidence: input.evidence,
    id: input.id,
    interviewerTask: input.interviewerTask,
    isCapturableWithCurrentModel: input.isCapturableWithCurrentModel,
    note: input.note,
    participantTask: input.participantTask,
    productCode: input.productCode,
    sourcePhase: input.sourcePhase,
    status: input.evidence ? "COMPLETED" : input.sourcePhase && input.activePhase === input.sourcePhase ? "CURRENT" : "PROGRAMMED",
    title: input.title
  };
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
