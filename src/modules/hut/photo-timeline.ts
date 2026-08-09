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
      dayLabel: "Dia 0",
      evidence: phaseEvidence.get("COLOCACION") ?? null,
      id: "DAY_0_DELIVERY",
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
      dayLabel: "Dia 1",
      evidence: phaseEvidence.get("REGRESO_1") ?? null,
      id: "DAY_1_APPLICATION_EVALUATION_1",
      interviewerTask: "Evaluacion 1",
      isCapturableWithCurrentModel: true,
      note: "Con el modelo actual, este slot usa la fase REGRESO_1.",
      participantTask: "Foto aplicacion",
      productCode: phaseEvidence.get("REGRESO_1")?.productCode ?? input.rotation.eva2,
      sourcePhase: "REGRESO_1",
      title: "Aplicacion / Evaluacion 1"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Dia 2",
      evidence: dailyByUseDay.get(2) ?? null,
      id: "DAY_2_FOLLOW_UP",
      interviewerTask: null,
      isCapturableWithCurrentModel: false,
      note: "No hay fase HUT dedicada para este dia; se muestra como actividad programada.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(2)?.productCode ?? input.rotation.eva2,
      sourcePhase: null,
      title: "Seguimiento HUT"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Dia 3",
      evidence: dailyByUseDay.get(3) ?? null,
      id: "DAY_3_FOLLOW_UP",
      interviewerTask: null,
      isCapturableWithCurrentModel: false,
      note: "No hay fase HUT dedicada para este dia; se muestra como actividad programada.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(3)?.productCode ?? input.rotation.eva2,
      sourcePhase: null,
      title: "Seguimiento HUT"
    }),
    buildTimelineSlot({
      activePhase,
      availableDate: nextAvailableDate,
      dayLabel: "Dia 4",
      evidence: dailyByUseDay.get(4) ?? null,
      id: "DAY_4_FOLLOW_UP",
      interviewerTask: null,
      isCapturableWithCurrentModel: false,
      note: "No hay fase HUT dedicada para este dia; se muestra como actividad programada.",
      participantTask: "Foto",
      productCode: dailyByUseDay.get(4)?.productCode ?? input.rotation.eva2,
      sourcePhase: null,
      title: "Seguimiento HUT"
    }),
    buildTimelineSlot({
      activePhase,
      dayLabel: "Dia 5",
      evidence: phaseEvidence.get("REGRESO_2") ?? null,
      id: "DAY_5_EVALUATION_2",
      interviewerTask: "Evaluacion 2",
      isCapturableWithCurrentModel: true,
      note: "Con el modelo actual, este slot usa la fase REGRESO_2.",
      participantTask: "Foto",
      productCode: phaseEvidence.get("REGRESO_2")?.productCode ?? input.rotation.eva2,
      sourcePhase: "REGRESO_2",
      title: "Evaluacion 2"
    }),
    buildTimelineSlot({
      activePhase,
      dayLabel: "Dia 7",
      evidence: null,
      id: "DAY_7_FINAL_RETURN",
      interviewerTask: null,
      isCapturableWithCurrentModel: false,
      note: "Hito informativo; no hay evidencia fotografica asociada en el modelo actual.",
      participantTask: null,
      productCode: null,
      sourcePhase: null,
      title: "Regreso final"
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
  const shortTitles: Record<string, string> = {
    DAY_0_DELIVERY: "Entrega",
    DAY_1_APPLICATION_EVALUATION_1: "Aplicacion",
    DAY_2_FOLLOW_UP: "Seguimiento",
    DAY_3_FOLLOW_UP: "Seguimiento",
    DAY_4_FOLLOW_UP: "Seguimiento",
    DAY_5_EVALUATION_2: "Evaluacion 2",
    DAY_7_FINAL_RETURN: "Regreso final"
  };

  return `${slot.dayLabel} ${shortTitles[slot.id] ?? slot.title}`;
}

export function resolveHutPhotoTimelinePhaseLabel(phase: string | null | undefined): string {
  const labels: Record<string, string> = {
    COLOCACION: "Dia 0 Entrega",
    REGRESO_1: "Dia 1 Aplicacion",
    REGRESO_2: "Dia 5 Evaluacion 2"
  };

  return phase ? labels[phase] ?? phase : "Sin fase";
}

export function resolveHutPhotoTimelineUseDayLabel(useDayNumber: number | null | undefined): string {
  const labels: Record<number, string> = {
    1: "Dia 0 Entrega",
    2: "Dia 2 Seguimiento",
    3: "Dia 3 Seguimiento",
    4: "Dia 4 Seguimiento",
    5: "Dia 5 Evaluacion 2"
  };

  return typeof useDayNumber === "number" ? labels[useDayNumber] ?? `Dia ${useDayNumber}` : "Dia no asignado";
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
