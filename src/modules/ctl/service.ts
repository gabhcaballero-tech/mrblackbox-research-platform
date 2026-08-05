import { getCtlDefinition, type CtlDefinition } from "./definition";

export type CtlActor = {
  id: string;
  role: "ADMIN" | "ANALYST" | "INTERVIEWER" | "SUPERVISOR";
  status: "ACTIVE" | "INACTIVE";
};

export type CtlSessionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type CtlAnswerInput = Record<string, FormDataEntryValue | null | undefined>;

export type CtlAnswerDraft = {
  answerValue: unknown;
  questionCode: string;
};

export function normalizeCtlCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function normalizeCtlText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Control}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

export function doReferenceCodesMatch(
  expectedCodes: Array<{ code: string; slot: number }>,
  submittedCodes: string[]
): boolean {
  const expected = [...expectedCodes]
    .sort((left, right) => left.slot - right.slot)
    .map((code) => normalizeCtlCode(code.code));
  const submitted = submittedCodes.map(normalizeCtlCode);

  return expected.length === 3 && expected.every((code, index) => code === submitted[index]);
}

export function parseCtlAnswers(
  input: CtlAnswerInput,
  definition: CtlDefinition = getCtlDefinition()
):
  | {
      answers: CtlAnswerDraft[];
      ok: true;
    }
  | {
      message: string;
      missingQuestionCodes: string[];
      ok: false;
    } {
  const answers: CtlAnswerDraft[] = [];
  const missingQuestionCodes: string[] = [];

  for (const question of definition.questions) {
    const rawValue = input[question.code];
    const normalized =
      question.type === "SELECT" ? normalizeCtlCode(rawValue) : normalizeCtlText(rawValue);

    if (question.required && !normalized) {
      missingQuestionCodes.push(question.code);
      continue;
    }

    if (!normalized) {
      continue;
    }

    answers.push({
      answerValue: normalized,
      questionCode: question.code
    });
  }

  if (missingQuestionCodes.length > 0) {
    return {
      message: "Responde las preguntas obligatorias antes de continuar.",
      missingQuestionCodes,
      ok: false
    };
  }

  return {
    answers,
    ok: true
  };
}

export function canAccessCtl(actor: CtlActor): boolean {
  return actor.status === "ACTIVE" && actor.role !== "ANALYST";
}

export function ctlStatusLabel(status: CtlSessionStatus | null | undefined): string {
  switch (status) {
    case "CANCELLED":
      return "Cancelado";
    case "COMPLETED":
      return "Completado";
    case "IN_PROGRESS":
      return "En captura";
    case "PENDING":
      return "Pendiente";
    default:
      return "Sin CTL";
  }
}
