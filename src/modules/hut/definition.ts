export type HutQuestionType = "LONG_TEXT" | "MATRIX" | "SCALE" | "SELECT" | "SHORT_TEXT";

export type HutParticipantOrigin = "CLT_HUT" | "HUT_DIRECTO";

export type HutQuestionnaireSectionId =
  | "COMPARATIVA"
  | "DATOS_GENERALES"
  | "EVALUACION_PRIMER_PERFUME"
  | "EVALUACION_SEGUNDO_PERFUME"
  | "FILTROS"
  | "PRIMERA_VISITA"
  | "SEGUNDA_VISITA";

export type HutQuestionOption = {
  label: string;
  terminates?: boolean;
  value: string;
};

export type HutInstructionDefinition = {
  text: string;
  title?: string;
  type: "BEFORE_QUESTION" | "INTERVIEWER_NOTE" | "SECTION";
};

export type HutVisibilityCondition =
  | {
      questionCode: string;
      source: "ANSWER";
      value: string | string[];
      when: "EQUALS" | "NOT_EQUALS";
    }
  | {
      source: "PARTICIPANT_ORIGIN";
      value: HutParticipantOrigin | HutParticipantOrigin[];
      when: "EQUALS" | "NOT_EQUALS";
    };

export type HutQuestionReference = {
  label: string;
  source: string;
};

export type HutBaseQuestionDefinition = {
  code: string;
  displayTemplate?: string;
  instructions?: HutInstructionDefinition[];
  label: string;
  references?: HutQuestionReference[];
  required: boolean;
  section: HutQuestionnaireSectionId;
  type: HutQuestionType;
  visibleIf?: HutVisibilityCondition[];
};

export type HutTextQuestionDefinition = HutBaseQuestionDefinition & {
  type: "LONG_TEXT" | "SHORT_TEXT";
};

export type HutSelectQuestionDefinition = HutBaseQuestionDefinition & {
  options: HutQuestionOption[];
  type: "SELECT";
};

export type HutScaleQuestionDefinition = HutBaseQuestionDefinition & {
  labels?: Record<number, string>;
  max: number;
  min: number;
  type: "SCALE";
};

export type HutMatrixQuestionDefinition = HutBaseQuestionDefinition & {
  columns: Array<{ label: string; value: string | number }>;
  randomizeRows?: boolean;
  rows: Array<{ code: string; label: string }>;
  type: "MATRIX";
};

export type HutQuestionDefinition =
  | HutMatrixQuestionDefinition
  | HutScaleQuestionDefinition
  | HutSelectQuestionDefinition
  | HutTextQuestionDefinition;

export type HutSectionDefinition = {
  description?: string;
  id: HutQuestionnaireSectionId;
  instructions?: HutInstructionDefinition[];
  questions: HutQuestionDefinition[];
  title: string;
};

export type HutDefinition = {
  protocolVersion: "APPLICATION_PHOTO";
  sections: HutSectionDefinition[];
  version: 5;
};

export type HutAnswerLookup = Record<string, unknown>;

export type HutDefinitionContext = {
  participantOrigin?: HutParticipantOrigin | null;
};

const yesNoOptions: HutQuestionOption[] = [
  { label: "Si", value: "SI" },
  { label: "No", value: "NO" }
];

const agreementColumns = [
  { label: "Totalmente en desacuerdo", value: 1 },
  { label: "En desacuerdo", value: 2 },
  { label: "Ni de acuerdo, ni en desacuerdo", value: 3 },
  { label: "De acuerdo", value: 4 },
  { label: "Totalmente de acuerdo", value: 5 }
];

const likingScaleLabels = {
  1: "Me disgusta muchisimo",
  2: "Me disgusta mucho",
  3: "Me disgusta",
  4: "Ni me gusta, ni me disgusta",
  5: "Me gusta",
  6: "Me gusta mucho",
  7: "Me gusta muchisimo"
};

const firstPerfumeReference: HutQuestionReference = {
  label: "Primer perfume HUT",
  source: "HUT_EVA1"
};

const secondPerfumeReference: HutQuestionReference = {
  label: "Segundo perfume HUT",
  source: "HUT_EVA2"
};

const repeatedFilterVisibility: HutVisibilityCondition[] = [
  {
    questionCode: "HUT_PARTICIPO_CLT",
    source: "ANSWER",
    value: "NO",
    when: "EQUALS"
  }
];

const generalDataQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_DG_NOMBRE",
    displayTemplate: "Nombre del participante: {{PARTICIPANT_NAME}}",
    label: "Nombre del participante",
    required: true,
    section: "DATOS_GENERALES",
    type: "SHORT_TEXT"
  },
  {
    code: "HUT_DG_FOLIO",
    displayTemplate: "Folio: {{FOLIO}}",
    label: "Folio",
    required: true,
    section: "DATOS_GENERALES",
    type: "SHORT_TEXT"
  },
  {
    code: "HUT_DG_FECHA",
    displayTemplate: "Fecha: {{TODAY}}",
    label: "Fecha de entrevista",
    required: false,
    section: "DATOS_GENERALES",
    type: "SHORT_TEXT"
  }
];

const filterQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_PARTICIPO_CLT",
    label: "¿Participo anteriormente en CLT?",
    options: yesNoOptions,
    required: true,
    section: "FILTROS",
    type: "SELECT"
  },
  {
    code: "HUT_F1_GENERO",
    label: "Genero",
    options: [
      { label: "Hombre", value: "HOMBRE" },
      { label: "Mujer", value: "MUJER" }
    ],
    required: true,
    section: "FILTROS",
    type: "SELECT",
    visibleIf: repeatedFilterVisibility
  },
  {
    code: "HUT_F2_EDAD",
    label: "Edad",
    required: true,
    section: "FILTROS",
    type: "SHORT_TEXT",
    visibleIf: repeatedFilterVisibility
  },
  {
    code: "HUT_F3_USO_PERFUME",
    label: "Marca de perfume que utiliza actualmente",
    required: true,
    section: "FILTROS",
    type: "SHORT_TEXT",
    visibleIf: repeatedFilterVisibility
  }
];

const firstVisitQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_V1_CONFIRMACION_ENTREGA",
    label: "Confirmar entrega del primer perfume",
    options: yesNoOptions,
    references: [firstPerfumeReference],
    required: true,
    section: "PRIMERA_VISITA",
    type: "SELECT"
  },
  {
    code: "HUT_V1_OBSERVACIONES",
    label: "Observaciones de primera visita",
    required: false,
    section: "PRIMERA_VISITA",
    type: "LONG_TEXT"
  }
];

const firstPerfumeEvaluationQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_EVA1_GUSTO",
    label: "¿Que tanto le gusto el primer perfume?",
    labels: likingScaleLabels,
    max: 7,
    min: 1,
    references: [firstPerfumeReference],
    required: true,
    section: "EVALUACION_PRIMER_PERFUME",
    type: "SCALE"
  },
  {
    code: "HUT_EVA1_ATRIBUTOS",
    columns: agreementColumns,
    label: "Atributos del primer perfume",
    randomizeRows: true,
    required: true,
    rows: [
      { code: "AGRADABLE", label: "Agradable" },
      { code: "DURADERO", label: "Duradero" },
      { code: "ADECUADO_PARA_MI", label: "Adecuado para mi" }
    ],
    section: "EVALUACION_PRIMER_PERFUME",
    type: "MATRIX"
  }
];

const secondVisitQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_V2_CONFIRMACION_ENTREGA",
    label: "Confirmar entrega del segundo perfume",
    options: yesNoOptions,
    references: [secondPerfumeReference],
    required: true,
    section: "SEGUNDA_VISITA",
    type: "SELECT"
  },
  {
    code: "HUT_V2_OBSERVACIONES",
    label: "Observaciones de segunda visita",
    required: false,
    section: "SEGUNDA_VISITA",
    type: "LONG_TEXT"
  }
];

const secondPerfumeEvaluationQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_EVA2_GUSTO",
    label: "¿Que tanto le gusto el segundo perfume?",
    labels: likingScaleLabels,
    max: 7,
    min: 1,
    references: [secondPerfumeReference],
    required: true,
    section: "EVALUACION_SEGUNDO_PERFUME",
    type: "SCALE"
  },
  {
    code: "HUT_EVA2_ATRIBUTOS",
    columns: agreementColumns,
    label: "Atributos del segundo perfume",
    randomizeRows: true,
    required: true,
    rows: [
      { code: "AGRADABLE", label: "Agradable" },
      { code: "DURADERO", label: "Duradero" },
      { code: "ADECUADO_PARA_MI", label: "Adecuado para mi" }
    ],
    section: "EVALUACION_SEGUNDO_PERFUME",
    type: "MATRIX"
  }
];

const comparativeQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_COMP_PREFERENCIA",
    label: "¿Cual de los dos perfumes prefiere?",
    options: [
      { label: "Primer perfume", value: "EVA1" },
      { label: "Segundo perfume", value: "EVA2" },
      { label: "Ambos", value: "AMBOS" },
      { label: "Ninguno", value: "NINGUNO" }
    ],
    references: [firstPerfumeReference, secondPerfumeReference],
    required: true,
    section: "COMPARATIVA",
    type: "SELECT"
  },
  {
    code: "HUT_COMP_RAZONES",
    label: "Razones de preferencia",
    required: true,
    section: "COMPARATIVA",
    type: "LONG_TEXT"
  }
];

export const HUT_V5_DEFINITION: HutDefinition = {
  protocolVersion: "APPLICATION_PHOTO",
  sections: [
    {
      id: "DATOS_GENERALES",
      questions: generalDataQuestions,
      title: "Datos generales"
    },
    {
      description: "Las preguntas repetidas pueden omitirse cuando el participante viene de CLT y existe informacion equivalente.",
      id: "FILTROS",
      questions: filterQuestions,
      title: "Filtros"
    },
    {
      id: "PRIMERA_VISITA",
      instructions: [
        {
          text: "Esta seccion pertenece al cuestionario HUT v5 y no reemplaza la fase operativa COLOCACION.",
          title: "Nota operativa",
          type: "SECTION"
        }
      ],
      questions: firstVisitQuestions,
      title: "Primera visita"
    },
    {
      id: "EVALUACION_PRIMER_PERFUME",
      questions: firstPerfumeEvaluationQuestions,
      title: "Evaluacion primer perfume"
    },
    {
      id: "SEGUNDA_VISITA",
      instructions: [
        {
          text: "Esta seccion pertenece al cuestionario HUT v5 y no reemplaza la fase operativa REGRESO_1.",
          title: "Nota operativa",
          type: "SECTION"
        }
      ],
      questions: secondVisitQuestions,
      title: "Segunda visita"
    },
    {
      id: "EVALUACION_SEGUNDO_PERFUME",
      questions: secondPerfumeEvaluationQuestions,
      title: "Evaluacion segundo perfume"
    },
    {
      id: "COMPARATIVA",
      instructions: [
        {
          text: "Comparar ambos perfumes de acuerdo con la rotacion HUT EVA1/EVA2 asignada.",
          title: "Nota operativa",
          type: "SECTION"
        }
      ],
      questions: comparativeQuestions,
      title: "Comparativa"
    }
  ],
  version: 5
};

export function getHutV5Definition(): HutDefinition {
  return HUT_V5_DEFINITION;
}

export function getHutQuestions(definition: HutDefinition = getHutV5Definition()): HutQuestionDefinition[] {
  return definition.sections.flatMap((section) => section.questions);
}

export function getHutQuestionsBySection(
  section: HutQuestionnaireSectionId,
  definition: HutDefinition = getHutV5Definition()
): HutQuestionDefinition[] {
  return getHutQuestions(definition).filter((question) => question.section === section);
}

export function getHutApplicableQuestions({
  answers = {},
  context = {},
  definition = getHutV5Definition()
}: {
  answers?: HutAnswerLookup;
  context?: HutDefinitionContext;
  definition?: HutDefinition;
} = {}): HutQuestionDefinition[] {
  const lookup = buildHutVisibilityLookup(answers, context);
  return getHutQuestions(definition).filter((question) => isHutQuestionVisible(question, lookup, context));
}

export function buildHutVisibilityLookup(
  answers: HutAnswerLookup = {},
  context: HutDefinitionContext = {}
): HutAnswerLookup {
  if (answers.HUT_PARTICIPO_CLT) {
    return answers;
  }

  if (context.participantOrigin === "CLT_HUT") {
    return { ...answers, HUT_PARTICIPO_CLT: "SI" };
  }

  if (context.participantOrigin === "HUT_DIRECTO") {
    return { ...answers, HUT_PARTICIPO_CLT: "NO" };
  }

  return answers;
}

function isHutQuestionVisible(
  question: HutQuestionDefinition,
  answers: HutAnswerLookup,
  context: HutDefinitionContext
): boolean {
  if (!question.visibleIf || question.visibleIf.length === 0) {
    return true;
  }

  return question.visibleIf.every((condition) => {
    if (condition.source === "PARTICIPANT_ORIGIN") {
      return compareVisibilityValue(context.participantOrigin ?? "", condition.value, condition.when);
    }

    return compareVisibilityValue(answers[condition.questionCode], condition.value, condition.when);
  });
}

function compareVisibilityValue(
  actual: unknown,
  expected: string | string[] | HutParticipantOrigin | HutParticipantOrigin[],
  operator: "EQUALS" | "NOT_EQUALS"
): boolean {
  const normalizedActual = normalizeHutDefinitionCode(actual);
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  const matches = expectedValues.some((value) => normalizeHutDefinitionCode(value) === normalizedActual);

  return operator === "EQUALS" ? matches : !matches;
}

function normalizeHutDefinitionCode(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, "")
    .toUpperCase();
}
