export type CtlQuestionType = "LONG_TEXT" | "MATRIX" | "SCALE" | "SELECT" | "SHORT_TEXT";

export type CtlQuestionOption = {
  label: string;
  skipTo?: string;
  terminates?: boolean;
  value: string;
};

export type CtlInstructionDefinition = {
  text: string;
  title?: string;
  type: "BEFORE_QUESTION" | "INTERVIEWER_NOTE" | "SECTION";
};

export type CtlBaseQuestionDefinition = {
  code: string;
  displayTemplate?: string;
  instructions?: CtlInstructionDefinition[];
  label: string;
  required: boolean;
  type: CtlQuestionType;
};

export type CtlTextQuestionDefinition = CtlBaseQuestionDefinition & {
  type: "LONG_TEXT" | "SHORT_TEXT";
};

export type CtlSelectQuestionDefinition = CtlBaseQuestionDefinition & {
  options: CtlQuestionOption[];
  type: "SELECT";
};

export type CtlScaleQuestionDefinition = CtlBaseQuestionDefinition & {
  labels?: Record<number, string>;
  max: number;
  min: number;
  type: "SCALE";
};

export type CtlMatrixQuestionDefinition = CtlBaseQuestionDefinition & {
  columns: Array<{ label: string; value: string | number }>;
  randomizeRows?: boolean;
  rows: Array<{ code: string; label: string }>;
  type: "MATRIX";
};

export type CtlQuestionDefinition =
  | CtlMatrixQuestionDefinition
  | CtlScaleQuestionDefinition
  | CtlSelectQuestionDefinition
  | CtlTextQuestionDefinition;

export type CtlSectionDefinition = {
  description?: string;
  id: string;
  instructions?: CtlInstructionDefinition[];
  questions: CtlQuestionDefinition[];
  title: string;
};

export type CtlDefinition = {
  sections: CtlSectionDefinition[];
  version: 2;
};

export type CtlAnswerLookup = Record<string, unknown>;

const sameDifferentOptions: CtlQuestionOption[] = [
  { label: "Es una fragancia diferente", value: "1" },
  { label: "Es la misma fragancia, pero huele menos", value: "2" },
  { label: "Es la misma fragancia, pero huele más", value: "3" }
];

const likingScaleLabels = {
  1: "Le disgusta muchísimo",
  2: "Le disgusta mucho",
  3: "Le disgusta",
  4: "Ni le gusta, ni le disgusta",
  5: "Le gusta",
  6: "Le gusta mucho",
  7: "Le gusta muchísimo"
};

const preferredIntensityScaleLabels = {
  1: "Mucho menos intensa de lo que me gusta",
  2: "Menos intensa de lo que me gusta",
  3: "Justo como me gusta",
  4: "Más intensa de lo que me gusta",
  5: "Mucho más intensa de lo que me gusta"
};

const perceivedIntensityScaleLabels = {
  1: "Extremadamente débil",
  2: "Muy débil",
  3: "Algo débil",
  4: "Ni débil, ni fuerte",
  5: "Algo fuerte",
  6: "Muy fuerte",
  7: "Extremadamente fuerte"
};

const purchaseIntentScaleLabels = {
  1: "Definitivamente no la compraría",
  2: "Posiblemente no la compraría",
  3: "No estoy seguro si la compraría o no",
  4: "Posiblemente la compraría",
  5: "Definitivamente sí la compraría"
};

const usualBrandComparisonScaleLabels = {
  1: "Mucho peor que mi marca usual",
  2: "Peor que mi marca usual",
  3: "Igual a mi marca usual",
  4: "Mejor que mi marca usual",
  5: "Mucho mejor que mi marca usual"
};

const switchingIntentScaleLabels = {
  1: "No cambiaría la fragancia que uso por ésta que acabo de conocer",
  2: "Alternaría ambas fragancias",
  3: "Cambiaría la fragancia que uso por ésta que acabo de conocer"
};

const durationScaleLabels = {
  1: "Menos de 4 hrs.",
  2: "De 4 a 6 hrs.",
  3: "De 6 a 8 hrs.",
  4: "De 8 a 10 hrs.",
  5: "Más de 10 hrs."
};

const agreementColumns = [
  { label: "Totalmente en desacuerdo", value: 1 },
  { label: "En desacuerdo", value: 2 },
  { label: "Ni de acuerdo, ni en desacuerdo", value: 3 },
  { label: "De acuerdo", value: 4 },
  { label: "Totalmente de acuerdo", value: 5 }
];

const yesNoColumns = [
  { label: "Sí", value: 1 },
  { label: "No", value: 0 }
];

const fragranceAttributeRows = [
  { code: "LIMPIA", label: "Limpia" },
  { code: "MASCULINA", label: "Masculina" },
  { code: "FRESCA", label: "Fresca" },
  { code: "SEDUCTORA", label: "Para seducir/Seductora" },
  { code: "ATEMPORAL", label: "Atemporal" },
  { code: "ATRACTIVA", label: "Atractiva" },
  { code: "ALTA_CALIDAD", label: "Alta calidad" },
  { code: "INNOVADORA", label: "Innovadora" },
  { code: "ENERGIZANTE", label: "Energizante" },
  { code: "TIENE_CARACTER", label: "Tiene carácter" },
  { code: "PARA_ALGUIEN_COMO_YO", label: "Para alguien como yo" },
  { code: "VERSATIL", label: "Versátil" },
  { code: "ADICTIVA", label: "Adictiva" },
  { code: "LLAMATIVA", label: "Es llamativa / Me hace notar" },
  { code: "ME_HACE_SENTIR_SEGURO", label: "Me hace sentir seguro" },
  { code: "MODERNA", label: "Moderna" },
  { code: "ME_TRANSMITE_LIBERTAD", label: "Me transmite libertad" },
  { code: "ME_HACE_SENTIR_COMODO", label: "Me hace sentir cómodo" },
  { code: "ELEGANTE", label: "Elegante" },
  { code: "ARTIFICIAL", label: "Artificial" }
];

const aromaAttributeRows = [
  { code: "FLORAL", label: "Floral" },
  { code: "FRUTAL", label: "Frutal" },
  { code: "DULCE", label: "Dulce" },
  { code: "ATALCADA", label: "Atalcada" },
  { code: "CITRICA", label: "Cítrica" },
  { code: "AMADERADA_MADEROSA", label: "Amaderada/Maderosa" },
  { code: "JUGOSA", label: "Jugosa" },
  { code: "EMPALAGOSA", label: "Empalagosa" },
  { code: "ESPECIADA", label: "Especiada" },
  { code: "HERBAL", label: "Herbal" },
  { code: "LAVANDA", label: "Lavanda" },
  { code: "MARINA", label: "Marina" },
  { code: "ALCOHOL", label: "Alcohol" }
];

const sampleCodeQuestions: CtlQuestionDefinition[] = [
  {
    code: "CODIGO_FISICO_1",
    instructions: [
      {
        text: "Registra el codigo fisico observado en campo. Estos codigos no son requisito para tomar el folio.",
        title: "INSTRUCCION",
        type: "BEFORE_QUESTION"
      }
    ],
    label: "Codigo fisico 1",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "CODIGO_FISICO_2",
    label: "Codigo fisico 2",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "CODIGO_FISICO_3",
    label: "Codigo fisico 3",
    required: true,
    type: "SHORT_TEXT"
  }
];

const generalDataQuestions: CtlQuestionDefinition[] = [
  {
    code: "DG_NOMBRE",
    displayTemplate: "Nombre del participante: {{PARTICIPANT_NAME}}",
    label: "Nombre",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_DIRECCION",
    label: "Direccion",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_COLONIA",
    label: "Colonia",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_MUNICIPIO",
    label: "Municipio",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_TELEFONO",
    label: "Telefono",
    required: true,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_FECHA",
    displayTemplate: "Fecha de entrevista: {{TODAY}}",
    label: "Fecha",
    required: false,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_HORA_INICIO",
    displayTemplate: "Hora inicio CTL: {{CTL_STARTED_AT}}",
    label: "Hora inicio",
    required: false,
    type: "SHORT_TEXT"
  },
  {
    code: "DG_HORA_TERMINO",
    displayTemplate: "Hora termino CTL: {{CTL_COMPLETED_AT}}",
    label: "Hora termino",
    required: false,
    type: "SHORT_TEXT"
  }
];

const demographicQuestions: CtlQuestionDefinition[] = [
  {
    code: "D1_OCUPACION",
    label: "Ocupacion",
    required: false,
    type: "SHORT_TEXT"
  },
  {
    code: "D2_ESCOLARIDAD",
    label: "Escolaridad",
    required: false,
    type: "SHORT_TEXT"
  },
  {
    code: "D3_ESTADO_CIVIL",
    label: "Estado civil",
    required: false,
    type: "SHORT_TEXT"
  },
  {
    code: "D4_OBSERVACIONES",
    label: "Observaciones demograficas o complementos no capturados en screening",
    required: false,
    type: "LONG_TEXT"
  }
];

function makeFragranceQuestions(suffix: "A" | "B", labelSuffix: string): CtlQuestionDefinition[] {
  const letter = suffix.toLowerCase();

  return [
    {
      code: `P5${suffix}`,
      label: `P5${letter}. Por favor huela su antebrazo y díganos ¿Qué tanto le gusta la fragancia que le hemos aplicado, usted diría que...? (RU)`,
      labels: likingScaleLabels,
      max: 7,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P6${suffix}`,
      label: `P6${letter}. ¿Pensando en la intensidad de esta fragancia usted diría que es…? (RU)`,
      labels: preferredIntensityScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P7${suffix}`,
      label: `P7${letter}. Pensando en la intensidad de esta fragancia, ¿usted diría que es…..?`,
      labels: perceivedIntensityScaleLabels,
      max: 7,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P8${suffix}`,
      columns: agreementColumns,
      instructions: [
        {
          text: "Lee cada atributo en el orden mostrado en pantalla. El orden puede variar por participante y se mantiene durante toda la entrevista.",
          title: "NOTA PARA ENCUESTADOR",
          type: "INTERVIEWER_NOTE"
        }
      ],
      label: `P8${letter}. Le voy a leer una lista de atributos que pueden ser usados para DESCRIBIR una fragancia. Para cada uno, por favor dígame ¿En qué medida está de acuerdo con que este atributo aplica para esta fragancia de perfume? (RU) (${labelSuffix})`,
      randomizeRows: true,
      required: true,
      rows: fragranceAttributeRows,
      type: "MATRIX"
    },
    {
      code: `P9${suffix}`,
      columns: yesNoColumns,
      label: `P9${letter}. Voy a leer una lista de atributos sobre el aroma de la fragancia que acaba de probar. Por favor dígame si cada uno de estos atributos aplica o no para esta fragancia. (RU) (${labelSuffix})`,
      randomizeRows: true,
      required: true,
      rows: aromaAttributeRows,
      type: "MATRIX"
    },
    {
      code: `P10${suffix}`,
      label: `P10${letter}. Si este producto estuviera a la venta en donde habitualmente compra sus fragancias, ¿Qué tan probable es que usted compre esta fragancia? Diría que… (RU)`,
      labels: purchaseIntentScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P11${suffix}`,
      label: `P11${letter}. Pensando en la fragancia que acaba de conocer, ¿usted diría que ésta es…? (RU)`,
      labels: usualBrandComparisonScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P12${suffix}`,
      label: `P12${letter}. Pensando en la fragancia que acaba de conocer, ¿cuál de las siguientes opciones describe mejor su intención de cambio? (RU)`,
      labels: switchingIntentScaleLabels,
      max: 3,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P13${suffix}`,
      label: `P13${letter}. Pensando en la duración de la fragancia, ¿usted diría que ésta durará…? (RU)`,
      labels: durationScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    }
  ];
}

export const CTL_DEFINITION: CtlDefinition = {
  sections: [
    {
      id: "CODIGOS_FISICOS",
      instructions: [
        {
          text: "Captura los codigos fisicos de las muestras antes de iniciar la entrevista. Si el participante ya fue tomado por el encuestador, estos codigos no bloquean la sesion CTL.",
          title: "INSTRUCCION",
          type: "SECTION"
        }
      ],
      questions: sampleCodeQuestions,
      title: "CODIGOS FISICOS DE MUESTRAS"
    },
    {
      id: "FILTROS",
      questions: [
        {
          code: "F0",
          label: "F0. Buenos días / tardes. Mi nombre es __________ y trabajo para________, una empresa de investigación de mercados. Estamos realizando un estudio y nos gustaría hacerle unas preguntas. ¿Acepta participar?",
          options: [
            { label: "Si", value: "1" },
            { label: "No", terminates: true, value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F1",
          label: "F1. REGISTRAR GÉNERO",
          options: [
            { label: "Hombre", value: "1" },
            { label: "Mujer", terminates: true, value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F2",
          label: "F2. ¿Me podría decir cuál es su edad exacta?",
          options: [
            { label: "29 años o menos", terminates: true, value: "1" },
            { label: "30 a 45 años", value: "2" },
            { label: "46 a 55 años", value: "3" },
            { label: "55 años o más", terminates: true, value: "4" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F3",
          label: "F3. ¿Alguien de su familia trabaja en alguno de estos lugares...?",
          options: [
            { label: "Una empresa de publicidad", terminates: true, value: "1" },
            { label: "Agencia de estudios de mercados", terminates: true, value: "2" },
            { label: "Medios de comunicación (TV, radio, prensa…)", terminates: true, value: "3" },
            { label: "Una empresa de relaciones públicas", terminates: true, value: "4" },
            { label: "Una empresa que fabrica o comercializa productos de cuidado personal", terminates: true, value: "5" },
            { label: "Una empresa que fabrica fragancias", terminates: true, value: "6" },
            { label: "Ninguna de las anteriores", value: "7" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F4",
          label: "F4. ¿Usted o alguien de su familia ha participado en alguna encuesta (diferente a temas de política) en los últimos tres meses?",
          options: [
            { label: "No", value: "1" },
            { label: "Si, de producto", terminates: true, value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F5",
          label: "F5. ¿Podría decirme si alguna de las siguientes condiciones físicas aplica actualmente a usted? (LEER LISTA)",
          options: [
            { label: "Resfriado / sinusitis / Rinitis", terminates: true, value: "1" },
            { label: "Asma", terminates: true, value: "2" },
            { label: "Alérgico o sensible / intolerante a fragancias o sabores", terminates: true, value: "3" },
            { label: "Usando una fragancia en este momento", terminates: true, value: "5" },
            { label: "Fumador", terminates: true, value: "6" },
            { label: "Ninguna de las anteriores", value: "7" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F6",
          label: "F6. ¿Qué marca(s) de perfume(s) utiliza? (RM)",
          required: true,
          type: "SHORT_TEXT"
        },
        {
          code: "F7",
          label: "F7. ¿Qué marca de perfume utiliza con mayor frecuencia? (RU)",
          required: true,
          type: "SHORT_TEXT"
        },
        {
          code: "F8",
          label: "F8. De la marca que mencionó ¿qué VARIANTE (color) utiliza? (RM)",
          required: true,
          type: "SHORT_TEXT"
        },
        {
          code: "F9",
          label: "F9. Pensando en el uso de su perfume. A la semana ¿Con qué frecuencia utiliza perfume?",
          options: [
            { label: "1 día a la semana", terminates: true, value: "1" },
            { label: "2 días a la semana", terminates: true, value: "2" },
            { label: "3 días a la semana", value: "3" },
            { label: "4 días a la semana", value: "4" },
            { label: "5 días a la semana", value: "5" },
            { label: "6 días a la semana", value: "6" },
            { label: "Los 7 días de la semana/todos los días", value: "7" },
            { label: "Más de una vez al día", value: "8" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F10",
          label: "F10. ¿Cuándo fue la última vez que compró perfume de la marca (TRASPASAR MARCA DE P7)?",
          required: true,
          type: "SHORT_TEXT"
        },
        {
          code: "F11",
          label: "F11. ¿Notaste alguna diferencia en tu perfume?",
          options: [
            { label: "Si", value: "1" },
            { label: "No", skipTo: "F12", value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F11A",
          label: "F11a. ¿Qué diferencia (s) notaste?",
          required: true,
          type: "LONG_TEXT"
        },
        {
          code: "F12",
          label: "F12. ¿Cuántas veces al día aplicas tu perfume?",
          options: [
            { label: "1 vez al día", value: "1" },
            { label: "2 veces al día", value: "2" },
            { label: "3 veces al día", value: "3" },
            { label: "4 veces o más al día", value: "4" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F13",
          label: "F13 ¿En qué momentos aplicas tu perfume?",
          options: [
            { label: "Al salir de bañarme", value: "1" },
            { label: "Después de vestirme", value: "2" },
            { label: "Antes de salir", value: "3" },
            { label: "Durante el día", value: "4" },
            { label: "Por la mañana", value: "5" },
            { label: "Al medio día", value: "6" },
            { label: "Por la noche", value: "7" },
            { label: "Otro (Especifique)", value: "8" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "F14",
          label: "F14. ¿Cómo aplicas tu perfume?",
          options: [
            { label: "Sobre la ropa", value: "1" },
            { label: "Directamente en la piel (cuello)", value: "2" },
            { label: "Directamente en los brazos", value: "3" },
            { label: "Una nube sobre el cuerpo", value: "4" },
            { label: "En las muñecas", value: "5" },
            { label: "Otro (Especifique)", value: "6" }
          ],
          required: true,
          type: "SELECT"
        }
      ],
      title: "SECCIÓN I - FILTROS"
    },
    {
      id: "TRIANGULAR_1",
      questions: [
        {
          code: "P1",
          label: "P1. Ahora, le pediremos que por favor huela estas tres tiras con fragancia, una de ellas es diferente, por favor, indíquenos: ¿Cuál de ellas es diferente a las otras 2?",
          options: [
            { label: "K-247", value: "1" },
            { label: "O-472", value: "2" },
            { label: "C-583", value: "3" },
            { label: "G-835", value: "4" },
            { label: "H-358", value: "5" },
            { label: "Z-724", value: "6" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P2",
          label: "P2. Con base en la siguiente tarjeta dígame ¿Qué le parece la fragancia…..? (MOSTRAR Y LEER TARJETA) (RU)",
          options: sameDifferentOptions,
          required: true,
          type: "SELECT"
        }
      ],
      title: "SECCIÓN II - TRIANGULAR - 1"
    },
    {
      id: "TRIANGULAR_2",
      questions: [
        {
          code: "P3",
          label: "P3. Ahora, le pediremos que por favor huela estas tres tiras con fragancia, una de ellas es diferente, por favor, indíquenos: ¿Cuál de ellas es diferente a las otras 2?",
          options: [
            { label: "G-853", value: "7" },
            { label: "H-358", value: "8" },
            { label: "Z-742", value: "9" },
            { label: "K-247", value: "10" },
            { label: "O-472", value: "11" },
            { label: "C-583", value: "12" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P4",
          label: "P4. Con base en la siguiente tarjeta dígamos ¿Qué le parece la fragancia…..? (MOSTRAR Y LEER TARJETA) (RU)",
          options: sameDifferentOptions,
          required: true,
          type: "SELECT"
        }
      ],
      title: "SECCIÓN II - TRIANGULAR - 2"
    },
    {
      description: "POR FAVOR, HUELA SU ANTEBRAZO. ENSEGUIDA LE APLICAREMOS EN SU ANTEBRAZO IZQUIERDO UNA FRAGANCIA Y LE HAREMOS UNAS PREGUNTAS.",
      id: "FRAGRANCIA_1",
      questions: makeFragranceQuestions("A", "primera fragancia"),
      title: "SECCIÓN III - EVALUACIÓN DE PRIMERA FRAGANCIA"
    },
    {
      description: "POR FAVOR, HUELA SU ANTEBRAZO. ENSEGUIDA LE APLICAREMOS EN SU ANTEBRAZO DERECHO UNA FRAGANCIA Y LE HAREMOS UNAS PREGUNTAS.",
      id: "FRAGRANCIA_2",
      questions: makeFragranceQuestions("B", "segunda fragancia"),
      title: "SECCIÓN IV - EVALUACIÓN DE SEGUNDA FRAGANCIA"
    }
    // La SECCION V - COMPARATIVA (P14-P20) pertenece al flujo Navigo posterior, no al CTL presencial.
    ,
    {
      id: "DATOS_GENERALES",
      instructions: [
        {
          text: "Complementa datos operativos de la entrevista. Si un dato ya viene del screening, confirmalo y completa lo faltante.",
          title: "INSTRUCCION",
          type: "SECTION"
        }
      ],
      questions: generalDataQuestions,
      title: "DATOS GENERALES"
    },
    {
      id: "DEMOGRAFICOS",
      instructions: [
        {
          text: "No repitas informacion ya capturada en screening salvo que necesite correccion o complemento. El NSE se conserva desde screening.",
          title: "NOTA PARA ENCUESTADOR",
          type: "SECTION"
        }
      ],
      questions: demographicQuestions,
      title: "DEMOGRAFICOS"
    }
  ],
  version: 2
};

export function getCtlDefinition(): CtlDefinition {
  return CTL_DEFINITION;
}

export function getCtlQuestions(definition: CtlDefinition = getCtlDefinition()): CtlQuestionDefinition[] {
  return definition.sections.flatMap((section) => section.questions);
}

export function getCtlApplicableQuestions(
  definition: CtlDefinition = getCtlDefinition(),
  answers: CtlAnswerLookup = {}
): CtlQuestionDefinition[] {
  const questions = getCtlQuestions(definition);
  const indexByCode = new Map(questions.map((question, index) => [question.code, index]));
  const applicable: CtlQuestionDefinition[] = [];
  let index = 0;

  while (index < questions.length) {
    const question = questions[index]!;
    applicable.push(question);

    if (question.type !== "SELECT") {
      index += 1;
      continue;
    }

    const answerValue = normalizeDefinitionAnswer(answers[question.code]);
    const selected = question.options.find((option) => normalizeDefinitionAnswer(option.value) === answerValue);
    const nextIndex = selected?.skipTo ? indexByCode.get(selected.skipTo) : undefined;

    if (nextIndex !== undefined && nextIndex > index) {
      index = nextIndex;
      continue;
    }

    index += 1;
  }

  return applicable;
}

function normalizeDefinitionAnswer(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, "")
    .toUpperCase();
}
