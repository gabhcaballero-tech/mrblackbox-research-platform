export type HutQuestionType = "LONG_TEXT" | "MATRIX" | "RANKING" | "SCALE" | "SELECT" | "SHORT_TEXT";

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
  followUpPrompt?: string;
  label: string;
  terminates?: boolean;
  value: string;
};

export type HutInstructionDefinition = {
  text: string;
  title?: string;
  type: "BEFORE_QUESTION" | "INTERVIEWER_NOTE" | "ROTATION_RULE" | "SECTION" | "SONDEO";
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

export type HutQuestionTerminationRule = {
  action: "TERMINATE";
  answer?: string | string[];
  maxNumber?: number;
  minNumber?: number;
  missingRequiredOptionValues?: string[];
  reason: string;
};

export type HutQuestionSkipRule = {
  answer: string | string[];
  goTo: string;
};

export type HutBaseQuestionDefinition = {
  code: string;
  displayTemplate?: string;
  instructions?: HutInstructionDefinition[];
  label: string;
  references?: HutQuestionReference[];
  required: boolean;
  requiredForCltHut?: boolean;
  rotationPairGroup?: string;
  section: HutQuestionnaireSectionId;
  skipRules?: HutQuestionSkipRule[];
  terminationRules?: HutQuestionTerminationRule[];
  type: HutQuestionType;
  visibleIf?: HutVisibilityCondition[];
};

export type HutTextQuestionDefinition = HutBaseQuestionDefinition & {
  type: "LONG_TEXT" | "SHORT_TEXT";
};

export type HutSelectQuestionDefinition = HutBaseQuestionDefinition & {
  multiple?: boolean;
  options: HutQuestionOption[];
  requiredOptionValues?: string[];
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

export type HutRankingQuestionDefinition = HutBaseQuestionDefinition & {
  maxRank: number;
  options: HutQuestionOption[];
  type: "RANKING";
};

export type HutQuestionDefinition =
  | HutMatrixQuestionDefinition
  | HutRankingQuestionDefinition
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
  version: 5 | 6;
};

export type HutAnswerLookup = Record<string, unknown>;

export type HutDefinitionContext = {
  participantOrigin?: HutParticipantOrigin | null;
};

const directOnly: HutVisibilityCondition[] = [
  {
    questionCode: "HUT_PARTICIPO_CLT",
    source: "ANSWER",
    value: "2",
    when: "EQUALS"
  }
];

const yesNoOptions: HutQuestionOption[] = [
  { label: "Si", value: "1" },
  { label: "No", value: "2" }
];

const yesNoTerminateOptions: HutQuestionOption[] = [
  { label: "Si", value: "1" },
  { label: "No", terminates: true, value: "2" }
];

const agreement7Columns = [
  { label: "Totalmente en desacuerdo", value: 1 },
  { label: "Algo en desacuerdo", value: 2 },
  { label: "En desacuerdo", value: 3 },
  { label: "Ni de acuerdo, ni en desacuerdo", value: 4 },
  { label: "Algo de acuerdo", value: 5 },
  { label: "De acuerdo", value: 6 },
  { label: "Totalmente de acuerdo", value: 7 }
];

const yesNoColumns = [
  { label: "Si", value: 1 },
  { label: "No", value: 2 }
];

const likingScaleLabels = {
  1: "Le disgusto muchisimo",
  2: "Le disgusto mucho",
  3: "Le disgusto",
  4: "Ni le gusto, ni le disgusto",
  5: "Le gusto",
  6: "Le gusto mucho",
  7: "Le gusto muchisimo"
};

const intensityFitLabels = {
  1: "Mucho menos intensa de lo que me gusta",
  2: "Menos intensa de lo que me gusta",
  3: "Justo como me gusta",
  4: "Mas intensa de lo que me gusta",
  5: "Mucho mas intensa de lo que me gusta"
};

const perceivedIntensityLabels = {
  1: "Extremadamente debil",
  2: "Muy debil",
  3: "Algo debil",
  4: "Ni debil, ni fuerte",
  5: "Algo fuerte",
  6: "Muy fuerte",
  7: "Extremadamente fuerte"
};

const purchaseIntentLabels = {
  1: "Definitivamente NO lo compraria",
  2: "Probablemente NO lo compraria",
  3: "No estoy seguro si lo compraria o no",
  4: "Probablemente SI lo compraria",
  5: "Definitivamente SI lo compraria"
};

const expectationLabels = {
  1: "Muy por debajo de mis expectativas",
  2: "Por debajo de mis expectativas",
  3: "Cumple con mis expectativas",
  4: "Supero mis expectativas",
  5: "Supero ampliamente mis expectativas"
};

const satisfactionLabels = {
  1: "Extremadamente insatisfecho",
  2: "Muy insatisfecho",
  3: "Poco insatisfecho",
  4: "Poco satisfecho",
  5: "Satisfecho",
  6: "Muy satisfecho",
  7: "Extremadamente satisfecho"
};

const sprayAmountLabels = {
  1: "Mucho menor cantidad liberada de lo que me gusta",
  2: "Menor cantidad liberada de lo que me gusta",
  3: "Justo como me gusta",
  4: "Mayor cantidad liberada de lo que me gusta",
  5: "Mucho mayor cantidad liberada de lo que me gusta"
};

const firstPerfumeReference: HutQuestionReference = {
  label: "Producto 1",
  source: "HUT_EVA1"
};

const secondPerfumeReference: HutQuestionReference = {
  label: "Producto 2",
  source: "HUT_EVA2"
};

const clarifyInstruction: HutInstructionDefinition = {
  text: "ENTREVISTADOR CLARIFICAR.",
  title: "Sondeo",
  type: "SONDEO"
};

const insistNothingInstruction: HutInstructionDefinition = {
  text: "SI CONTESTO NADA EN LAS PREGUNTAS ABIERTAS, INSISTA: hay algo por minimo que le haya gustado o disgustado.",
  title: "Insistir si responde nada",
  type: "SONDEO"
};

const rotateQuestionPairInstruction: HutInstructionDefinition = {
  text: "ROTAR EL ORDEN DE ESTAS DOS PREGUNTAS.",
  title: "Regla de rotacion",
  type: "ROTATION_RULE"
};

const productAttributeRows = [
  { code: "AROMA_DURADERO", label: "Tiene un aroma duradero" },
  { code: "AROMA_AGRADABLE", label: "Tiene un aroma agradable" },
  { code: "ENVASE_COMODO", label: "Es comodo sostener y utilizar el envase mientras aplico la fragancia" },
  { code: "INTENSIDAD_ADECUADA", label: "Tiene la intensidad adecuada" },
  { code: "DIRECCION_FACIL", label: "Es facil dirigir la aplicacion hacia la zona deseada" },
  { code: "CANTIDAD_FACIL", label: "Es facil aplicar la cantidad adecuada de producto" },
  { code: "SEGURIDAD", label: "Me hace sentir seguro de mi mismo" },
  { code: "ME_HACE_SENTIR_FRESCO_POR_MAS_TIEMPO", label: "Me hace sentir fresco por mas tiempo" },
  { code: "REFLEJA_MI_PERSONALIDAD", label: "Refleja mi personalidad" },
  { code: "AROMA_UNICO", label: "Tiene un aroma unico/diferente" }
];

const atomizerRows = [
  { code: "FACIL_PRESIONAR", label: "Es facil de presionar" },
  { code: "APLICACION_UNIFORME", label: "Permite que el perfume se aplique de manera uniforme" },
  { code: "CANTIDAD_ADECUADA", label: "Libera la cantidad adecuada en cada disparo" },
  { code: "DISTRIBUYE_BIEN", label: "Distribuye bien la fragancia sobre la piel" },
  { code: "FUNCIONO_CORRECTAMENTE", label: "Funciono correctamente en todo momento" },
  { code: "RESISTENTE", label: "Es resistente" },
  { code: "CALIDAD", label: "Es de calidad" }
];

const atomizerIssueRows = [
  { code: "GOTEO", label: "Goteo" },
  { code: "SE_ATORO", label: "Se atoro" },
  { code: "DEMASIADA_FUERZA", label: "Requirio demasiada fuerza" },
  { code: "DEMASIADO_PRODUCTO", label: "Libero demasiado producto" },
  { code: "MUY_POCO_PRODUCTO", label: "Libero muy poco producto" },
  { code: "PULVERIZACION_IRREGULAR", label: "La pulverizacion fue irregular" }
];

const comparativeRows = [
  ...productAttributeRows,
  { code: "ATOMIZADOR_FACIL_PRESIONAR", label: "Es facil presionar el atomizador" },
  { code: "ATOMIZADOR_UNIFORME", label: "El atomizador permite que el perfume se aplique de manera uniforme" },
  { code: "ATOMIZADOR_CANTIDAD", label: "El atomizador libera la cantidad adecuada en cada disparo" },
  { code: "ATOMIZADOR_DISTRIBUYE", label: "El atomizador distribuye bien la fragancia sobre la piel" },
  { code: "ATOMIZADOR_FUNCIONO", label: "El atomizador funciono correctamente en todo momento" },
  { code: "ATOMIZADOR_RESISTENTE", label: "El atomizador es resistente" },
  { code: "ATOMIZADOR_CALIDAD", label: "El atomizador es de calidad" }
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
    code: "HUT_DG_COLONIA",
    label: "Colonia",
    required: false,
    section: "DATOS_GENERALES",
    type: "SHORT_TEXT"
  },
  {
    code: "HUT_DG_TELEFONO",
    label: "Telefono",
    required: false,
    section: "DATOS_GENERALES",
    type: "SHORT_TEXT"
  },
  {
    code: "HUT_DG_DIRECCION",
    label: "Direccion",
    required: false,
    section: "DATOS_GENERALES",
    type: "LONG_TEXT"
  },
  {
    code: "HUT_DG_EMAIL",
    label: "Email",
    required: false,
    section: "DATOS_GENERALES",
    type: "SHORT_TEXT"
  }
];

const filterQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_PARTICIPO_CLT",
    label: "Participo anteriormente en CLT?",
    options: yesNoOptions,
    required: true,
    section: "FILTROS",
    type: "SELECT",
    visibleIf: [
      {
        source: "PARTICIPANT_ORIGIN",
        value: "CLT_HUT",
        when: "NOT_EQUALS"
      }
    ]
  },
  {
    code: "HUT_F0_ACEPTA",
    label: "Buenos dias / tardes. Estamos realizando un estudio y nos gustaria hacerle unas preguntas. Acepta participar?",
    options: yesNoTerminateOptions,
    required: true,
    section: "FILTROS",
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F1_GENERO",
    label: "F1. Registrar genero",
    options: [
      { label: "Hombre", value: "1" },
      { label: "Mujer", terminates: true, value: "2" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "2",
        reason: "Genero fuera del perfil requerido"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F2_EDAD_EXACTA",
    label: "F2. Me podria decir cual es su edad exacta?",
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        maxNumber: 29,
        reason: "Edad fuera de rango"
      },
      {
        action: "TERMINATE",
        minNumber: 56,
        reason: "Edad fuera de rango"
      }
    ],
    type: "SHORT_TEXT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F2_RANGO_EDAD",
    label: "F2. Rango de edad",
    options: [
      { label: "29 anos o menos", terminates: true, value: "1" },
      { label: "30 a 45 anos", value: "2" },
      { label: "46 a 55 anos", value: "3" },
      { label: "+55 anos", terminates: true, value: "5" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: ["1", "5"],
        reason: "Edad fuera de rango"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F3_FAMILIA_TRABAJA",
    label: "F3. Alguien de su familia trabaja en alguno de estos lugares?",
    options: [
      { label: "Una empresa de publicidad", terminates: true, value: "1" },
      { label: "Una empresa de estudios de mercados", terminates: true, value: "2" },
      { label: "Medios de comunicacion (TV, radio, prensa)", terminates: true, value: "3" },
      { label: "Una empresa de relaciones publicas", terminates: true, value: "4" },
      { label: "Una empresa que fabrica o comercializa productos de cuidado personal", terminates: true, value: "5" },
      { label: "Ninguna de las anteriores", value: "6" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: ["1", "2", "3", "4", "5"],
        reason: "Familiar trabaja en industria relacionada"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F4_PARTICIPACION_RECIENTE",
    label: "F4. Usted o alguien de su familia ha participado en alguna encuesta en los ultimos tres meses?",
    options: [
      { label: "No", value: "1" },
      { label: "Si, de producto", terminates: true, value: "2" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "2",
        reason: "Participacion reciente en encuesta de producto"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F5_CONDICIONES_FISICAS",
    instructions: [{ text: "LEER LISTA", type: "BEFORE_QUESTION" }],
    label: "F5. Alguna de las siguientes condiciones fisicas aplica actualmente a usted?",
    multiple: true,
    options: [
      { label: "Resfriado/sinusitis/rinitis", terminates: true, value: "1" },
      { label: "Asma", terminates: true, value: "2" },
      { label: "Alergico o sensible / intolerante a fragancias", terminates: true, value: "3" },
      { label: "Ninguna de las anteriores", value: "4" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: ["1", "2", "3"],
        reason: "Condicion fisica incompatible con el estudio"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F6_PRODUCTOS_7_DIAS",
    instructions: [{ text: "MOSTRAR TARJETA", type: "BEFORE_QUESTION" }],
    label: "F6. Cuales de los siguientes productos ha utilizado durante los ultimos 7 dias para su cuidado personal?",
    multiple: true,
    options: [
      { label: "Shampoo", value: "1" },
      { label: "Crema para el cuerpo", value: "2" },
      { label: "Perfume/fragancia", value: "3" },
      { label: "Crema para la cara", value: "4" },
      { label: "Gel para el cabello", value: "5" },
      { label: "Jabon de tocador", value: "6" },
      { label: "Crema para afeitar", value: "7" }
    ],
    required: true,
    requiredForCltHut: true,
    requiredOptionValues: ["3"],
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        missingRequiredOptionValues: ["3"],
        reason: "No selecciono Perfume/fragancia"
      }
    ],
    type: "SELECT"
  },
  {
    code: "HUT_F7_DOMICILIO_PERMANENTE",
    label: "F7. Es este su domicilio permanente, vive aqui o esta de visita o de vacaciones?",
    options: [
      { label: "Si", value: "1" },
      { label: "No, esta de visita o de vacaciones", terminates: true, value: "2" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "2",
        reason: "No vive en domicilio permanente"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F8_DISPONIBLE_VISITAS",
    label: "F8. Estaria dispuesto a recibir 2 visitas mas en los proximos 6 dias en horario de 9:00 a 18:00 hrs.?",
    options: yesNoTerminateOptions,
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "2",
        reason: "No acepta las visitas requeridas"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F9_SALIR_CIUDAD",
    label: "F9. Piensa salir de la ciudad o cambiarse de casa en los proximos 6 dias?",
    options: [
      { label: "Si", terminates: true, value: "1" },
      { label: "No", value: "2" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "1",
        reason: "Planea salir de la ciudad o cambiar de domicilio"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F10_MARCAS_UTILIZA",
    label: "F10. Que marca(s) de perfume(s) utiliza?",
    required: true,
    section: "FILTROS",
    type: "LONG_TEXT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F11_MARCA_FRECUENTE",
    label: "F11. Que marca de perfume utiliza con mayor frecuencia?",
    required: true,
    section: "FILTROS",
    type: "SHORT_TEXT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F12_VARIANTE",
    label: "F12. De la marca que menciono, que variante o color utiliza?",
    required: true,
    section: "FILTROS",
    type: "SHORT_TEXT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F13_FRECUENCIA_SEMANAL",
    label: "F13. A la semana, con que frecuencia utiliza perfume?",
    options: [
      { label: "1 dia a la semana", terminates: true, value: "1" },
      { label: "2 dias a la semana", terminates: true, value: "2" },
      { label: "3 dias a la semana", value: "3" },
      { label: "4 dias a la semana", value: "4" },
      { label: "5 dias a la semana", value: "5" },
      { label: "6 dias a la semana", value: "6" },
      { label: "Los 7 dias de la semana/todos los dias", value: "7" },
      { followUpPrompt: "Cuantas veces?", label: "Mas de una vez al dia", value: "8" }
    ],
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: ["1", "2"],
        reason: "Frecuencia semanal insuficiente de uso de perfume"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F14_ULTIMA_COMPRA",
    label: "F14. Cuando fue la ultima vez que compro perfume de la marca mencionada en F11?",
    required: true,
    section: "FILTROS",
    type: "SHORT_TEXT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F15_NOTO_DIFERENCIA",
    label: "F15. Notaste alguna diferencia en tu perfume?",
    options: [
      { label: "Si", value: "1" },
      { label: "No", value: "2" }
    ],
    required: true,
    section: "FILTROS",
    skipRules: [
      {
        answer: "2",
        goTo: "HUT_F17_APLICACIONES_DIA"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F16_DIFERENCIA_NOTADA",
    instructions: [clarifyInstruction],
    label: "F16. Que diferencia notaste? Que mas? Algo mas?",
    required: true,
    section: "FILTROS",
    type: "LONG_TEXT",
    visibleIf: [
      ...directOnly,
      {
        questionCode: "HUT_F15_NOTO_DIFERENCIA",
        source: "ANSWER",
        value: "1",
        when: "EQUALS"
      }
    ]
  },
  {
    code: "HUT_F17_APLICACIONES_DIA",
    label: "F17. Cuantas veces al dia aplicas tu perfume?",
    options: [
      { label: "1 vez al dia", value: "1" },
      { label: "2 veces al dia", value: "2" },
      { label: "3 veces al dia", value: "3" },
      { label: "4 veces o mas al dia", value: "4" }
    ],
    required: true,
    section: "FILTROS",
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F18_MOMENTOS_APLICACION",
    label: "F18. En que momentos aplicas tu perfume?",
    multiple: true,
    options: [
      { label: "Al salir de banarme", value: "1" },
      { label: "Despues de vestirme", value: "2" },
      { label: "Antes de salir", value: "3" },
      { label: "Durante el dia", value: "4" },
      { label: "Por la manana", value: "5" },
      { label: "Al medio dia", value: "6" },
      { label: "Por la noche", value: "7" },
      { label: "Otro, especifique", value: "8" }
    ],
    required: true,
    section: "FILTROS",
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F19_MODO_APLICACION",
    label: "F19. Como aplicas tu perfume?",
    multiple: true,
    options: [
      { label: "Sobre la ropa", value: "1" },
      { label: "Directamente en la piel (cuello)", value: "2" },
      { label: "Directamente en los brazos", value: "3" },
      { label: "Una nube sobre el cuerpo", value: "4" },
      { label: "En las munecas", value: "5" },
      { label: "Otro, especifique", value: "6" }
    ],
    required: true,
    section: "FILTROS",
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F20_TIEMPO_USO_MARCA",
    instructions: [{ text: "MOSTRAR TARJETA", type: "BEFORE_QUESTION" }],
    label: "F20. Desde hace cuanto tiempo usa perfume de la marca mencionada en F11?",
    options: [
      { label: "Menos de 1 mes", terminates: true, value: "1" },
      { label: "Entre 1 - 2 meses", value: "2" },
      { label: "Entre 3 - 6 meses", value: "3" },
      { label: "Mas de 6 meses", value: "4" }
    ],
    required: true,
    requiredForCltHut: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "1",
        reason: "Usa la marca desde hace menos de 1 mes"
      }
    ],
    type: "SELECT"
  },
  {
    code: "HUT_F21_MOSTRAR_PERFUME",
    label: "F21. Me puede mostrar por favor el perfume que usa con mayor frecuencia de la marca mencionada en F11?",
    options: yesNoTerminateOptions,
    required: true,
    section: "FILTROS",
    terminationRules: [
      {
        action: "TERMINATE",
        answer: "2",
        reason: "No mostro el perfume requerido"
      }
    ],
    type: "SELECT",
    visibleIf: directOnly
  },
  {
    code: "HUT_F22_IMPORTANCIA_PERFUME",
    instructions: [{ text: "MOSTRAR TARJETA CIRCULAR. Registrar primer, segundo y tercer lugar.", type: "BEFORE_QUESTION" }],
    label: "F22. Cual es la caracteristica mas importante para usted cuando escoge un perfume? Y en segundo lugar? Y en tercer lugar?",
    maxRank: 3,
    options: [
      { label: "Que tenga una valvula/atomizador que aplique la cantidad adecuada", value: "1" },
      { label: "Que tenga un empaque practico", value: "2" },
      { label: "Que tenga un aroma agradable", value: "3" },
      { label: "Que tenga una intensidad adecuada", value: "4" },
      { label: "Que tenga larga duracion y no necesite volverse a aplicar", value: "5" },
      { label: "Que ofrezca una buena relacion calidad-precio", value: "6" },
      { label: "Que brinde confianza/seguridad", value: "7" },
      { label: "Que tenga una amplia gama de aromas", value: "8" },
      { label: "Sea facil de comprar", value: "9" },
      { label: "Sea de una marca reconocida", value: "10" },
      { label: "Tenga un empaque atractivo", value: "11" }
    ],
    required: true,
    requiredForCltHut: true,
    section: "FILTROS",
    type: "RANKING"
  }
];

const firstVisitQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_V1_ACEPTA_USAR_PRODUCTO",
    label: "Acepta usted usar el producto?",
    options: yesNoTerminateOptions,
    references: [firstPerfumeReference],
    required: true,
    section: "PRIMERA_VISITA",
    type: "SELECT"
  },
  {
    code: "HUT_V1_CONFIRMACION_ENTREGA",
    displayTemplate: "Producto 1 a entregar: HUT_EVA1",
    instructions: [{ text: "Verificar que la clave coincide con la rotacion asignada.", type: "BEFORE_QUESTION" }],
    label: "Registrar codigo de producto a entregar en primera visita",
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

function productEvaluationQuestions({
  suffix,
  section,
  productReference
}: {
  productReference: HutQuestionReference;
  section: "EVALUACION_PRIMER_PERFUME" | "EVALUACION_SEGUNDO_PERFUME";
  suffix: "A" | "B";
}): HutQuestionDefinition[] {
  const productLabel = suffix === "A" ? "primer perfume" : "segundo perfume";
  return [
    {
      code: `HUT_P1${suffix}_USO_PERFUME`,
      label: `P1${suffix.toLowerCase()}. Uso el perfume que le dejamos?`,
      options: [
        { label: "Si", value: "1" },
        { label: "No", terminates: true, value: "2" }
      ],
      references: [productReference],
      required: true,
      section,
      type: "SELECT"
    },
    {
      code: `HUT_P2${suffix}_RAZON_NO_USO`,
      instructions: [clarifyInstruction],
      label: `P2${suffix.toLowerCase()}. Por que razon no uso el perfume que le dejamos a prueba? Por que mas? Algo mas?`,
      required: true,
      section,
      type: "LONG_TEXT",
      visibleIf: [
        {
          questionCode: `HUT_P1${suffix}_USO_PERFUME`,
          source: "ANSWER",
          value: "2",
          when: "EQUALS"
        }
      ]
    },
    {
      code: `HUT_P3${suffix}_MOSTRO_ENVASE`,
      label: `P3${suffix.toLowerCase()}. Me podria mostrar el envase del perfume que le dejamos?`,
      options: [
        { label: "Mostro envase de perfume usado", value: "1" },
        { label: "No mostro", value: "2" }
      ],
      required: true,
      section,
      type: "SELECT"
    },
    {
      code: `HUT_P4${suffix}_HORAS_DIA`,
      label: `P4${suffix.toLowerCase()}. Durante un dia tipico, cuantas horas se dejo el perfume?`,
      required: true,
      section,
      type: "SHORT_TEXT"
    },
    {
      code: suffix === "A" ? "HUT_EVA1_GUSTO" : "HUT_EVA2_GUSTO",
      instructions: [{ text: "MOSTRAR Y LEER TARJETA", type: "BEFORE_QUESTION" }],
      label: `P5${suffix.toLowerCase()}. En general, que tanto le gusto el ${productLabel} que le dejamos a prueba hace 3 dias?`,
      labels: likingScaleLabels,
      max: 7,
      min: 1,
      references: [productReference],
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P6${suffix}_INTENSIDAD_FIT`,
      label: `P6${suffix.toLowerCase()}. Pensando en la intensidad de esta fragancia, usted diria que es...`,
      labels: intensityFitLabels,
      max: 5,
      min: 1,
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P7${suffix}_INTENSIDAD_PERCIBIDA`,
      label: `P7${suffix.toLowerCase()}. Pensando en la intensidad de esta fragancia, usted diria que es...`,
      labels: perceivedIntensityLabels,
      max: 7,
      min: 1,
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P8${suffix}_GUSTO_ABIERTO`,
      instructions: [rotateQuestionPairInstruction, clarifyInstruction],
      label: `P8${suffix.toLowerCase()}. Que fue lo que le gusto o lo que mas le gusto del perfume que uso durante los ultimos 3 dias? Que mas? Algo mas?`,
      required: true,
      rotationPairGroup: suffix === "A" ? "HUT_EVA1_LIKES_DISLIKES" : "HUT_EVA2_LIKES_DISLIKES",
      section,
      type: "LONG_TEXT"
    },
    {
      code: `HUT_P9${suffix}_DISGUSTO_ABIERTO`,
      instructions: [rotateQuestionPairInstruction, clarifyInstruction, insistNothingInstruction],
      label: `P9${suffix.toLowerCase()}. Que fue lo que no le gusto o lo que menos le gusto del perfume que uso durante los ultimos 3 dias? Que mas? Algo mas?`,
      required: true,
      rotationPairGroup: suffix === "A" ? "HUT_EVA1_LIKES_DISLIKES" : "HUT_EVA2_LIKES_DISLIKES",
      section,
      type: "LONG_TEXT"
    },
    {
      code: suffix === "A" ? "HUT_EVA1_ATRIBUTOS" : "HUT_EVA2_ATRIBUTOS",
      columns: agreement7Columns,
      instructions: [
        {
          text: "LEER Y ROTAR OPCIONES. MOSTRAR TARJETA.",
          title: "ROTAR ATRIBUTOS",
          type: "ROTATION_RULE"
        }
      ],
      label: `P10${suffix.toLowerCase()}. Que tan de acuerdo esta en que el perfume que probo...`,
      randomizeRows: true,
      required: true,
      rows: productAttributeRows,
      section,
      type: "MATRIX"
    },
    {
      code: `HUT_P11${suffix}_RETOCO`,
      label: `P11${suffix.toLowerCase()}. Retoco el perfume que le dejamos a prueba?`,
      options: [
        { followUpPrompt: "Por que retoco el perfume?", label: "Si", value: "1" },
        { followUpPrompt: "Por que no retoco el perfume que le dejamos a prueba?", label: "No", value: "2" }
      ],
      required: true,
      section,
      type: "SELECT"
    },
    {
      code: `HUT_P11${suffix}_RAZON_RETOQUE`,
      label: `P11${suffix.toLowerCase()}. Razon de retoque o no retoque`,
      required: true,
      section,
      type: "LONG_TEXT"
    },
    {
      code: `HUT_P12${suffix}_CARACTERISTICA_INCOMODA`,
      label: `P12${suffix.toLowerCase()}. El perfume presento alguna caracteristica incomoda?`,
      options: [
        { label: "Si", value: "1" },
        { label: "No", value: "2" }
      ],
      required: true,
      section,
      type: "SELECT"
    },
    {
      code: `HUT_P13${suffix}_CARACTERISTICA_INCOMODA_DETALLE`,
      instructions: [clarifyInstruction],
      label: `P13${suffix.toLowerCase()}. Que caracteristica incomoda presento? Que mas? Algo mas?`,
      required: true,
      section,
      type: "LONG_TEXT",
      visibleIf: [
        {
          questionCode: `HUT_P12${suffix}_CARACTERISTICA_INCOMODA`,
          source: "ANSWER",
          value: "1",
          when: "EQUALS"
        }
      ]
    },
    {
      code: `HUT_P14${suffix}_ATOMIZADOR_ATRIBUTOS`,
      columns: agreement7Columns,
      label: `P14${suffix.toLowerCase()}. Pensando en el atomizador/valvula de este perfume, que tan de acuerdo o en desacuerdo esta con que el atomizador...`,
      required: true,
      rows: atomizerRows,
      section,
      type: "MATRIX"
    },
    {
      code: `HUT_P15${suffix}_CANTIDAD_ATOMIZADOR`,
      label: `P15${suffix.toLowerCase()}. Pensando en la cantidad de fragancia liberada por el atomizador en cada disparo, usted diria que es...`,
      labels: sprayAmountLabels,
      max: 5,
      min: 1,
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P16${suffix}_INCONVENIENTES_ATOMIZADOR`,
      columns: yesNoColumns,
      label: `P16${suffix.toLowerCase()}. El atomizador de este perfume presento algunos de los siguientes inconvenientes?`,
      required: true,
      rows: atomizerIssueRows,
      section,
      type: "MATRIX"
    },
    {
      code: `HUT_P17${suffix}_GUSTO_ATOMIZADOR`,
      instructions: [rotateQuestionPairInstruction, clarifyInstruction],
      label: `P17${suffix.toLowerCase()}. Que fue lo que le gusto o lo que mas le gusto del atomizador/valvula de este perfume que uso? Que mas? Algo mas?`,
      required: true,
      rotationPairGroup: suffix === "A" ? "HUT_EVA1_ATOMIZER_LIKES_DISLIKES" : "HUT_EVA2_ATOMIZER_LIKES_DISLIKES",
      section,
      type: "LONG_TEXT"
    },
    {
      code: `HUT_P18${suffix}_DISGUSTO_ATOMIZADOR`,
      instructions: [rotateQuestionPairInstruction, clarifyInstruction, insistNothingInstruction],
      label: `P18${suffix.toLowerCase()}. Que fue lo que no le gusto o lo que menos le gusto del atomizador/valvula de este perfume que uso? Que mas? Algo mas?`,
      required: true,
      rotationPairGroup: suffix === "A" ? "HUT_EVA1_ATOMIZER_LIKES_DISLIKES" : "HUT_EVA2_ATOMIZER_LIKES_DISLIKES",
      section,
      type: "LONG_TEXT"
    },
    {
      code: `HUT_P19${suffix}_INTENCION_COMPRA`,
      instructions: [{ text: "MOSTRAR TARJETA", type: "BEFORE_QUESTION" }],
      label: `P19${suffix.toLowerCase()}. Que tan dispuesto estaria usted en comprar este perfume que probo?`,
      labels: purchaseIntentLabels,
      max: 5,
      min: 1,
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P19${suffix}_RAZONES_COMPRA`,
      label: `P19${suffix.toLowerCase()}b. Cuales son las razones por las que dice la respuesta anterior?`,
      required: true,
      section,
      type: "LONG_TEXT"
    },
    {
      code: `HUT_P21${suffix}_EXPECTATIVAS`,
      label: `P21${suffix.toLowerCase()}. Pensando en el producto que uso y las expectativas que tenia antes de usarlo, que tanto cumplio sus expectativas?`,
      labels: expectationLabels,
      max: 5,
      min: 1,
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P22${suffix}_RECOMENDACION`,
      instructions: [{ text: "MOSTRAR TABLETA. Recuerde que puede usar numeros intermedios.", type: "BEFORE_QUESTION" }],
      label: `P22${suffix.toLowerCase()}. Que tan probable es que recomiende este perfume?`,
      labels: {
        0: "Definitivamente no lo recomendaria",
        10: "Definitivamente si lo recomendaria"
      },
      max: 10,
      min: 0,
      required: true,
      section,
      type: "SCALE"
    },
    {
      code: `HUT_P23${suffix}_SATISFACCION`,
      instructions: [{ text: "LEER Y MOSTRAR TABLETA", type: "BEFORE_QUESTION" }],
      label: `P23${suffix.toLowerCase()}. Que tan satisfecho quedo con este perfume?`,
      labels: satisfactionLabels,
      max: 7,
      min: 1,
      required: true,
      section,
      type: "SCALE"
    }
  ];
}

const secondVisitQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_V2_CONFIRMACION_ENTREGA",
    displayTemplate: "Producto 2 a entregar: HUT_EVA2",
    instructions: [{ text: "Verificar que la clave coincide con la rotacion asignada.", type: "BEFORE_QUESTION" }],
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

const firstPerfumeEvaluationQuestions = productEvaluationQuestions({
  productReference: firstPerfumeReference,
  section: "EVALUACION_PRIMER_PERFUME",
  suffix: "A"
});

const secondPerfumeEvaluationQuestions = productEvaluationQuestions({
  productReference: secondPerfumeReference,
  section: "EVALUACION_SEGUNDO_PERFUME",
  suffix: "B"
});

const comparativeQuestions: HutQuestionDefinition[] = [
  {
    code: "HUT_P24_PREFERENCIA_GENERAL",
    instructions: [{ text: "NO LEER AMBOS Y NINGUNO.", type: "INTERVIEWER_NOTE" }],
    label: "P24. En general, cual de los dos perfumes prefiere?",
    options: [
      { label: "El primero", value: "1" },
      { label: "El segundo", value: "2" },
      { label: "Ambos", value: "3" },
      { label: "Ninguno", value: "4" }
    ],
    references: [firstPerfumeReference, secondPerfumeReference],
    required: true,
    section: "COMPARATIVA",
    type: "SELECT"
  },
  {
    code: "HUT_P25_COMPRA_PRIMERO",
    instructions: [{ text: "MOSTRAR TARJETA", type: "BEFORE_QUESTION" }],
    label: "P25. Que tan probable es que compre el primer perfume si reemplazara a su perfume regular?",
    labels: purchaseIntentLabels,
    max: 5,
    min: 1,
    references: [firstPerfumeReference],
    required: true,
    section: "COMPARATIVA",
    type: "SCALE"
  },
  {
    code: "HUT_P26_COMPRA_SEGUNDO",
    instructions: [{ text: "MOSTRAR TARJETA", type: "BEFORE_QUESTION" }],
    label: "P26. Que tan probable es que compre el segundo perfume si reemplazara a su perfume regular?",
    labels: purchaseIntentLabels,
    max: 5,
    min: 1,
    references: [secondPerfumeReference],
    required: true,
    section: "COMPARATIVA",
    type: "SCALE"
  },
  {
    code: "HUT_P27_COMPARATIVA_ATRIBUTOS",
    columns: [
      { label: "El primero", value: 1 },
      { label: "El segundo", value: 2 },
      { label: "Ambos", value: 3 },
      { label: "Ninguno", value: 4 }
    ],
    instructions: [{ text: "NO LEER AMBOS Y NINGUNO.", type: "INTERVIEWER_NOTE" }],
    label: "P27. Cual de los dos perfumes prefiere en cuanto a que...",
    randomizeRows: false,
    required: true,
    rows: comparativeRows,
    section: "COMPARATIVA",
    type: "MATRIX"
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
      description: "HUT directo aplica filtros completos. CLT + HUT aplica solo los filtros obligatorios marcados como requiredForCltHut.",
      id: "FILTROS",
      questions: filterQuestions,
      title: "Filtro de participante"
    },
    {
      id: "PRIMERA_VISITA",
      instructions: [
        {
          text: "Registrar entrega de perfume, confirmar clave de producto y entregar instrucciones de uso al participante.",
          title: "Entrega de perfume",
          type: "SECTION"
        }
      ],
      questions: firstVisitQuestions,
      title: "Entrega de perfume"
    },
    {
      id: "EVALUACION_PRIMER_PERFUME",
      instructions: [
        {
          text: "Verificar que la clave a evaluar coincide con la caratula de rotacion antes de iniciar.",
          title: "Verificacion de rotacion",
          type: "SECTION"
        }
      ],
      questions: firstPerfumeEvaluationQuestions,
      title: "Regreso 1 - Evaluacion primer perfume"
    },
    {
      id: "SEGUNDA_VISITA",
      instructions: [
        {
          text: "Confirmar uso del segundo perfume, solicitar muestra de envase y registrar validaciones necesarias antes de comparar.",
          title: "Regreso 2",
          type: "SECTION"
        }
      ],
      questions: secondVisitQuestions,
      title: "Regreso 2 - Confirmacion segundo perfume"
    },
    {
      id: "EVALUACION_SEGUNDO_PERFUME",
      instructions: [
        {
          text: "Verificar que la clave a evaluar coincide con la caratula de rotacion antes de iniciar.",
          title: "Verificacion de rotacion",
          type: "SECTION"
        }
      ],
      questions: secondPerfumeEvaluationQuestions,
      title: "Evaluacion segundo perfume (historica)"
    },
    {
      id: "COMPARATIVA",
      instructions: [
        {
          text: "Ahora que probo los dos perfumes, comparar ambos productos de acuerdo con la rotacion HUT EVA1/EVA2 asignada.",
          title: "Seccion IV - Evaluacion comparativa",
          type: "SECTION"
        }
      ],
      questions: comparativeQuestions,
      title: "Evaluacion comparativa (Regreso 2)"
    }
  ],
  version: 6
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
  const visibleQuestions = getHutQuestions(definition).filter((question) => isHutQuestionVisible(question, lookup, context));
  return applyHutSkipRules(visibleQuestions, lookup);
}

export function orderHutQuestionsForParticipant(
  questions: HutQuestionDefinition[],
  participantId: string | null | undefined
): HutQuestionDefinition[] {
  if (!participantId) {
    return questions;
  }

  const groups = new Map<string, HutQuestionDefinition[]>();
  for (const question of questions) {
    if (!question.rotationPairGroup) {
      continue;
    }

    groups.set(question.rotationPairGroup, [
      ...(groups.get(question.rotationPairGroup) ?? []),
      question
    ]);
  }

  if (groups.size === 0) {
    return questions;
  }

  const emittedGroups = new Set<string>();
  const orderedQuestions: HutQuestionDefinition[] = [];

  for (const question of questions) {
    const group = question.rotationPairGroup;
    if (!group) {
      orderedQuestions.push(question);
      continue;
    }

    if (emittedGroups.has(group)) {
      continue;
    }

    emittedGroups.add(group);
    const members = groups.get(group) ?? [question];
    orderedQuestions.push(...orderHutQuestionRotationGroup(members, participantId, group));
  }

  return orderedQuestions;
}

export function getHutQuestionPairRotationAudit({
  definition = getHutV5Definition(),
  participantId,
  questionCode
}: {
  definition?: HutDefinition;
  participantId: string | null | undefined;
  questionCode: string;
}): { group: string; order: string[] } | null {
  if (!participantId) {
    return null;
  }

  const question = getHutQuestions(definition).find((candidate) => candidate.code === questionCode);
  if (!question?.rotationPairGroup) {
    return null;
  }

  const groupQuestions = getHutQuestions(definition).filter((candidate) => candidate.rotationPairGroup === question.rotationPairGroup);
  if (groupQuestions.length <= 1) {
    return null;
  }

  return {
    group: question.rotationPairGroup,
    order: orderHutQuestionRotationGroup(groupQuestions, participantId, question.rotationPairGroup).map((candidate) => candidate.code)
  };
}

export function buildHutVisibilityLookup(
  answers: HutAnswerLookup = {},
  context: HutDefinitionContext = {}
): HutAnswerLookup {
  if (answers.HUT_PARTICIPO_CLT) {
    return answers;
  }

  if (context.participantOrigin === "CLT_HUT") {
    return { ...answers, HUT_PARTICIPO_CLT: "1" };
  }

  if (context.participantOrigin === "HUT_DIRECTO") {
    return { ...answers, HUT_PARTICIPO_CLT: "2" };
  }

  return answers;
}

function isHutQuestionVisible(
  question: HutQuestionDefinition,
  answers: HutAnswerLookup,
  context: HutDefinitionContext
): boolean {
  const isCltHut = context.participantOrigin === "CLT_HUT" || normalizeHutDefinitionCode(answers.HUT_PARTICIPO_CLT) === "1";
  if (isCltHut && question.section === "FILTROS") {
    return Boolean(question.requiredForCltHut);
  }

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

function applyHutSkipRules(questions: HutQuestionDefinition[], answers: HutAnswerLookup): HutQuestionDefinition[] {
  const skippedCodes = new Set<string>();

  for (const question of questions) {
    if (!question.skipRules?.length || !Object.prototype.hasOwnProperty.call(answers, question.code)) {
      continue;
    }

    const matchingRule = question.skipRules.find((rule) => compareVisibilityValue(answers[question.code], rule.answer, "EQUALS"));
    if (!matchingRule) {
      continue;
    }

    const currentIndex = questions.findIndex((candidate) => candidate.code === question.code);
    const targetIndex = questions.findIndex((candidate) => candidate.code === matchingRule.goTo);
    if (currentIndex < 0 || targetIndex <= currentIndex) {
      continue;
    }

    for (const skippedQuestion of questions.slice(currentIndex + 1, targetIndex)) {
      skippedCodes.add(skippedQuestion.code);
    }
  }

  return questions.filter((question) => !skippedCodes.has(question.code));
}

function orderHutQuestionRotationGroup(
  questions: HutQuestionDefinition[],
  participantId: string,
  group: string
): HutQuestionDefinition[] {
  return [...questions].sort((left, right) => {
    const leftHash = stableHutDefinitionHash(`${participantId}:${group}:${left.code}`);
    const rightHash = stableHutDefinitionHash(`${participantId}:${group}:${right.code}`);
    return leftHash - rightHash;
  });
}

function stableHutDefinitionHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function normalizeHutDefinitionCode(value: unknown): string {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (normalized === "SI" || normalized === "SÍ") {
    return "1";
  }

  if (normalized === "NO") {
    return "2";
  }

  return normalized;
}
