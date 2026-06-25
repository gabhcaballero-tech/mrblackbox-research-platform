import {
  hashScreenerDefinition,
  validateScreenerDefinitionForPublication,
  type NseScoreTable,
  type ScreenerCondition,
  type ScreenerDefinition,
  type ScreenerOption,
  type ScreenerOptionAction,
  type ScreenerQuestion
} from "@/modules/screener";
import { DETERGENT_RECRUITER_QUESTION_ID } from "@/modules/screener/study-overrides";
import { DETERGENTS_STUDY_CODE } from "./study-behavior";

export const DETERGENTS_STUDY_NAME = "Detergentes y cuidado de la ropa — CDMX/GDL";
export const DETERGENTS_STUDY_TIME_ZONE = "America/Mexico_City";
export const DETERGENTS_SCREENER_TITLE = "Filtro detergentes y cuidado de la ropa";
export const DETERGENTS_PRIVACY_NOTICE_VERSION = "detergentes-ropa-2026-v1";
export const DETERGENTS_PORTAL_FOLIO_PREFIX = "DET";

const NO_USA_DETERGENTE_CONDITION: ScreenerCondition = {
  questionId: "F10_PRODUCTOS_USO_FRECUENTE",
  type: "NONE_SELECTED",
  values: ["DETERGENTE_LIQUIDO", "DETERGENTE_POLVO"]
};

export function createDetergentsScreenerDefinition(): ScreenerDefinition {
  return validateScreenerDefinitionForPublication({
    description:
      "Filtro autoaplicable de reclutamiento para detergentes y productos de cuidado de la ropa.",
    nse: createDetergentsNse(),
    purpose: "SCREENER",
    questions: [
      shortTextQuestion({
        id: DETERGENT_RECRUITER_QUESTION_ID,
        order: 1,
        text: "Escribe el nombre de tu reclutador o reclutadora."
      }),
      singleChoiceQuestion({
        id: "F1_CIUDAD",
        order: 2,
        options: [
          continueOption("CDMX", "CDMX", 1),
          continueOption("GDL", "GDL", 2),
          terminateOption(
            "OTRA_CIUDAD",
            "Otra ciudad",
            3,
            "CIUDAD_NO_ELEGIBLE",
            "El estudio solo contempla CDMX y GDL."
          )
        ],
        text: "¿En qué ciudad resides actualmente?"
      }),
      singleChoiceQuestion({
        id: "F2_GENERO",
        order: 3,
        options: [
          continueOption("MUJER", "Mujer", 1),
          terminateOption(
            "HOMBRE",
            "Hombre",
            2,
            "GENERO_NO_ELEGIBLE",
            "El estudio está dirigido a mujeres."
          ),
          terminateOption(
            "OTRO",
            "Otro",
            3,
            "GENERO_NO_ELEGIBLE",
            "El estudio está dirigido a mujeres."
          ),
          terminateOption(
            "PREFIERO_NO_RESPONDER",
            "Prefiero no responder",
            4,
            "GENERO_NO_ELEGIBLE",
            "El estudio está dirigido a mujeres."
          )
        ],
        text: "¿Con cuál género te identificas?"
      }),
      singleChoiceQuestion({
        id: "F3_RANGO_EDAD",
        order: 4,
        options: [
          terminateOption(
            "MENOS_18",
            "Menos de 18 años",
            1,
            "EDAD_MENOR_18",
            "La edad debe estar entre 18 y 55 años."
          ),
          continueOption("18_25", "18 a 25 años", 2),
          continueOption("26_35", "26 a 35 años", 3),
          continueOption("36_45", "36 a 45 años", 4),
          continueOption("46_55", "46 a 55 años", 5),
          terminateOption(
            "MAYOR_55",
            "Mayor de 55 años",
            6,
            "EDAD_MAYOR_55",
            "La edad debe estar entre 18 y 55 años."
          )
        ],
        text: "¿En cuál de los siguientes rangos de edad te encuentras?"
      }),
      integerQuestion({
        id: "F4_EDAD_EXACTA",
        order: 5,
        text: "¿Podrías decirnos tu edad exacta?",
        validation: { max: 120, min: 0 }
      }),
      multipleChoiceQuestion({
        id: "F5_ACTIVIDADES_SENSIBLES",
        order: 6,
        options: [
          terminateOption(
            "PUBLICIDAD_MEDIOS",
            "Publicidad, medios de comunicación o periodismo",
            1,
            "EXCLUSION_LABORAL",
            "Tiene relación con actividades sensibles para el estudio."
          ),
          terminateOption(
            "INVESTIGACION_MERCADOS",
            "Investigación de mercados",
            2,
            "EXCLUSION_LABORAL",
            "Tiene relación con actividades sensibles para el estudio."
          ),
          terminateOption(
            "ASEO_HOGAR",
            "Fabricación o comercialización de productos para el aseo del hogar",
            3,
            "EXCLUSION_LABORAL",
            "Tiene relación con actividades sensibles para el estudio."
          ),
          terminateOption(
            "LAVADO_ROPA",
            "Fabricación o comercialización de productos para lavado o cuidado de la ropa",
            4,
            "EXCLUSION_LABORAL",
            "Tiene relación con actividades sensibles para el estudio."
          ),
          continueOption("NINGUNA", "Ninguna de las anteriores", 5)
        ],
        text:
          "¿Tú, alguien de tu familia o amigos cercanos trabaja en alguno de los siguientes lugares o actividades?"
      }),
      singleChoiceQuestion({
        id: "F6_PARTICIPACION_PREVIA",
        order: 7,
        options: [
          terminateOption(
            "SI",
            "Sí",
            1,
            "PARTICIPACION_RECIENTE",
            "Participó recientemente en estudios relacionados con cuidado o limpieza de la ropa."
          ),
          continueOption("NO", "No", 2)
        ],
        text:
          "¿Has respondido alguna encuesta o estudio sobre productos del cuidado o limpieza de la ropa en los últimos 6 meses?"
      }),
      singleChoiceQuestion({
        id: "F7_MIEMBROS_HOGAR",
        order: 8,
        options: [
          terminateOption(
            "UNA_DOS_PERSONAS",
            "Una o dos personas",
            1,
            "HOGAR_NO_ELEGIBLE",
            "El hogar debe estar conformado por tres o más personas."
          ),
          continueOption("TRES_O_MAS", "Tres o más personas", 2)
        ],
        text: "Contándote a ti misma, ¿cuántas personas conforman tu hogar?"
      }),
      singleChoiceQuestion({
        id: "F8_RESPONSABLE_COMPRAS",
        order: 9,
        options: [
          continueOption("YO_PERSONALMENTE", "Sí, yo personalmente", 1),
          continueOption("COMPARTIDO", "Lo comparto con otra persona", 2),
          terminateOption(
            "OTRA_PERSONA",
            "No, otra persona se encarga",
            3,
            "NO_RESPONSABLE_COMPRAS",
            "La participante no participa en las compras del supermercado."
          )
        ],
        text:
          "¿Eres tú la persona en tu hogar que se encarga principalmente de hacer las compras del supermercado?"
      }),
      singleChoiceQuestion({
        id: "F9_RESPONSABLE_LAVADO",
        order: 10,
        options: [
          continueOption("YO_PRINCIPALMENTE", "Sí, yo principalmente", 1),
          continueOption("COMPARTIDO", "Lo comparto con otra persona", 2),
          terminateOption(
            "OTRA_PERSONA",
            "No, otra persona se encarga",
            3,
            "NO_RESPONSABLE_LAVADO",
            "La participante no participa en el lavado o cuidado de la ropa."
          )
        ],
        text:
          "¿Eres tú la persona que se encarga principalmente del lavado o cuidado de la ropa en tu hogar?"
      }),
      multipleChoiceQuestion({
        id: "F10_PRODUCTOS_USO_FRECUENTE",
        order: 11,
        options: [
          continueOption("DETERGENTE_LIQUIDO", "Detergente líquido", 1),
          continueOption("DETERGENTE_POLVO", "Detergente en polvo", 2),
          continueOption("JABON_BARRA", "Jabón de lavandería en barra", 3),
          continueOption("SUAVIZANTE", "Suavizante de ropa", 4),
          continueOption("BLANQUEADOR_CLORO", "Blanqueador / cloro", 5),
          continueOption("QUITAMANCHAS", "Quitamanchas", 6),
          continueOption("AROMATIZANTE_ROPA", "Aromatizante / perfume para ropa", 7),
          otherOption("OTRO_PRODUCTO", "Otro producto para lavado o cuidado de ropa", 8),
          continueOption("NINGUNO", "Ninguno de los anteriores", 9)
        ],
        text:
          "De los siguientes productos, ¿cuáles utilizas en tu hogar para el lavado o cuidado de la ropa por lo menos 3 veces a la semana?"
      }),
      singleChoiceQuestion({
        id: "F11_TIPO_DETERGENTE",
        order: 12,
        options: [
          continueOption("LIQUIDO", "Detergente líquido", 1),
          continueOption("POLVO", "Detergente en polvo", 2),
          continueOption("AMBOS_POR_IGUAL", "Uso ambos por igual", 3)
        ],
        text: "¿Qué tipo de detergente utilizas con mayor frecuencia?",
        visibilityCondition: {
          questionId: "F10_PRODUCTOS_USO_FRECUENTE",
          type: "ANY_SELECTED",
          values: ["DETERGENTE_LIQUIDO", "DETERGENTE_POLVO"]
        }
      }),
      shortTextQuestion({
        id: "F12_MARCA_DETERGENTE",
        order: 13,
        text: "¿Cuál es la marca del detergente que utilizas con mayor frecuencia?"
      }),
      shortTextQuestion({
        helpText: "Regular, color, ropa oscura, antibacterial, con aroma, con suavizante, otra.",
        id: "F13_VARIANTE_DETERGENTE",
        order: 14,
        text:
          "¿Cuál es la variante, presentación o tipo del detergente que utilizas con mayor frecuencia?"
      }),
      multipleChoiceQuestion({
        id: "F14_PRODUCTOS_ADICIONALES_ROPA",
        order: 15,
        options: [
          continueOption("SUAVIZANTE", "Suavizante de ropa", 1),
          continueOption("BLANQUEADOR_CLORO", "Blanqueador / cloro", 2),
          continueOption("QUITAMANCHAS", "Quitamanchas", 3),
          continueOption("JABON_BARRA", "Jabón de lavandería en barra", 4),
          continueOption("AROMATIZANTE_ROPA", "Aromatizante / perfume para ropa", 5),
          continueOption("NINGUNO", "Ninguno de los anteriores", 6)
        ],
        text:
          "Además del detergente, ¿cuáles de estos productos utilizas para el cuidado o lavado de la ropa?"
      }),
      ...createNseQuestions()
    ],
    rules: [
      {
        condition: {
          max: 17,
          questionId: "F4_EDAD_EXACTA",
          type: "NUMBER_RANGE"
        },
        id: "EDAD_MENOR_18_EXACTA",
        order: 1,
        outcome: {
          code: "EDAD_NO_ELEGIBLE",
          reason: "La edad exacta está fuera del rango permitido.",
          type: "TERMINATE"
        }
      },
      {
        condition: {
          min: 56,
          questionId: "F4_EDAD_EXACTA",
          type: "NUMBER_RANGE"
        },
        id: "EDAD_MAYOR_55_EXACTA",
        order: 2,
        outcome: {
          code: "EDAD_NO_ELEGIBLE",
          reason: "La edad exacta está fuera del rango permitido.",
          type: "TERMINATE"
        }
      },
      {
        condition: NO_USA_DETERGENTE_CONDITION,
        id: "NO_USA_DETERGENTE_FRECUENTE",
        order: 3,
        outcome: {
          code: "NO_USA_DETERGENTE",
          reason: "No usa detergente líquido ni detergente en polvo con la frecuencia requerida.",
          type: "TERMINATE"
        }
      },
      {
        condition: {
          conditions: [
            {
              questionId: "F11_TIPO_DETERGENTE",
              type: "ANSWER_EQUALS",
              value: "LIQUIDO"
            },
            {
              questionId: "F10_PRODUCTOS_USO_FRECUENTE",
              type: "NONE_SELECTED",
              values: ["DETERGENTE_LIQUIDO"]
            }
          ],
          type: "ALL"
        },
        id: "TIPO_LIQUIDO_INCONSISTENTE",
        order: 4,
        outcome: {
          code: "TIPO_DETERGENTE_INCONSISTENTE",
          reason: "El tipo de detergente declarado no coincide con los productos seleccionados.",
          type: "TERMINATE"
        }
      },
      {
        condition: {
          conditions: [
            {
              questionId: "F11_TIPO_DETERGENTE",
              type: "ANSWER_EQUALS",
              value: "POLVO"
            },
            {
              questionId: "F10_PRODUCTOS_USO_FRECUENTE",
              type: "NONE_SELECTED",
              values: ["DETERGENTE_POLVO"]
            }
          ],
          type: "ALL"
        },
        id: "TIPO_POLVO_INCONSISTENTE",
        order: 5,
        outcome: {
          code: "TIPO_DETERGENTE_INCONSISTENTE",
          reason: "El tipo de detergente declarado no coincide con los productos seleccionados.",
          type: "TERMINATE"
        }
      },
      {
        condition: {
          conditions: [
            {
              questionId: "F11_TIPO_DETERGENTE",
              type: "ANSWER_EQUALS",
              value: "AMBOS_POR_IGUAL"
            },
            {
              conditions: [
                {
                  questionId: "F10_PRODUCTOS_USO_FRECUENTE",
                  type: "NONE_SELECTED",
                  values: ["DETERGENTE_LIQUIDO"]
                },
                {
                  questionId: "F10_PRODUCTOS_USO_FRECUENTE",
                  type: "NONE_SELECTED",
                  values: ["DETERGENTE_POLVO"]
                }
              ],
              type: "ANY"
            }
          ],
          type: "ALL"
        },
        id: "TIPO_AMBOS_INCONSISTENTE",
        order: 6,
        outcome: {
          code: "TIPO_DETERGENTE_INCONSISTENTE",
          reason: "El tipo de detergente declarado no coincide con los productos seleccionados.",
          type: "TERMINATE"
        }
      }
    ],
    schemaVersion: "screening.v1",
    title: DETERGENTS_SCREENER_TITLE
  });
}

export function getDetergentsScreenerHash(): string {
  return hashScreenerDefinition(createDetergentsScreenerDefinition());
}

function createNseQuestions(): ScreenerQuestion[] {
  return [
    nseQuestion({
      id: "NSE_D1_CUARTOS",
      options: [
        scoreOption("1_4", "1 a 4 cuartos", 1),
        scoreOption("5_6", "5 a 6 cuartos", 2),
        scoreOption("7_MAS", "7 o más cuartos", 3)
      ],
      order: 16,
      text:
        "Sin incluir baños, medios baños, pasillos, patios y zotehuelas, ¿cuál es el total de cuartos, piezas o habitaciones con que cuenta tu hogar?"
    }),
    nseQuestion({
      id: "NSE_D2_BANOS",
      options: [
        scoreOption("NINGUNO", "Ninguno", 1),
        scoreOption("UNO", "1", 2),
        scoreOption("DOS", "2", 3),
        scoreOption("TRES", "3", 4),
        scoreOption("CUATRO_MAS", "4 o más", 5)
      ],
      order: 17,
      text:
        "¿Cuántos baños completos con regadera y W.C. hay para uso exclusivo de los integrantes de tu hogar?"
    }),
    nseQuestion({
      id: "NSE_D3_REGADERA",
      options: [scoreOption("NO_TIENE", "No tiene", 1), scoreOption("SI_TIENE", "Sí tiene", 2)],
      order: 18,
      text: "¿Tu hogar cuenta con regadera funcionando en alguno de los baños?"
    }),
    nseQuestion({
      id: "NSE_D4_FOCOS",
      options: [
        scoreOption("0_5", "0 a 5 focos", 1),
        scoreOption("6_10", "6 a 10 focos", 2),
        scoreOption("11_15", "11 a 15 focos", 3),
        scoreOption("16_20", "16 a 20 focos", 4),
        scoreOption("21_MAS", "21 o más focos", 5)
      ],
      order: 19,
      text:
        "Contando todos los focos que utilizas para iluminar tu hogar, incluyendo los de techos, paredes y lámparas de buró o piso, ¿cuántos focos tiene tu vivienda?"
    }),
    nseQuestion({
      id: "NSE_D5_PISO",
      options: [
        scoreOption("TIERRA_CEMENTO", "Tierra o cemento firme", 1),
        scoreOption("OTRO_MATERIAL", "Otro tipo de material o acabado", 2)
      ],
      order: 20,
      text: "¿El piso de tu hogar es predominantemente de tierra, de cemento o de algún otro tipo de acabado?"
    }),
    nseQuestion({
      id: "NSE_D6_AUTOS",
      options: [
        scoreOption("CERO", "0", 1),
        scoreOption("UNO", "1", 2),
        scoreOption("DOS", "2", 3),
        scoreOption("TRES_MAS", "3 o más", 4)
      ],
      order: 21,
      text: "¿Cuántos automóviles propios, excluyendo taxis, tienen en tu hogar?"
    }),
    nseQuestion({
      id: "NSE_D7_ESTUFA",
      options: [scoreOption("NO_TIENE", "No tiene", 1), scoreOption("SI_TIENE", "Sí tiene", 2)],
      order: 22,
      text: "¿En tu hogar cuentan con estufa de gas o eléctrica?"
    }),
    nseQuestion({
      id: "NSE_D8_ESCOLARIDAD",
      options: [
        scoreOption("NO_ESTUDIO", "No estudió", 1),
        scoreOption("PRIMARIA_INCOMPLETA", "Primaria incompleta", 2),
        scoreOption("PRIMARIA_COMPLETA", "Primaria completa", 3),
        scoreOption("SECUNDARIA_INCOMPLETA", "Secundaria incompleta", 4),
        scoreOption("SECUNDARIA_COMPLETA", "Secundaria completa", 5),
        scoreOption("CARRERA_COMERCIAL", "Carrera comercial", 6),
        scoreOption("CARRERA_TECNICA", "Carrera técnica", 7),
        scoreOption("PREPARATORIA_INCOMPLETA", "Preparatoria incompleta", 8),
        scoreOption("PREPARATORIA_COMPLETA", "Preparatoria completa", 9),
        scoreOption("LICENCIATURA_INCOMPLETA", "Licenciatura incompleta", 10),
        scoreOption("LICENCIATURA_COMPLETA", "Licenciatura completa", 11),
        scoreOption("DIPLOMADO_MAESTRIA", "Diplomado o maestría", 12),
        scoreOption("DOCTORADO", "Doctorado", 13),
        scoreOption("NO_CONTESTO", "No contestó", 14)
      ],
      order: 23,
      text:
        "Pensando en la persona que aporta la mayor parte del ingreso en este hogar, ¿cuál fue el último año de estudios que completó?"
    })
  ];
}

function createDetergentsNse(): NseScoreTable {
  return {
    code: "NSE_AMAI_8X7",
    inputs: [
      {
        missingScore: 0,
        questionId: "NSE_D1_CUARTOS",
        scoreByAnswer: { "1_4": 0, "5_6": 8, "7_MAS": 14 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D2_BANOS",
        scoreByAnswer: { CUATRO_MAS: 52, DOS: 36, NINGUNO: 0, TRES: 36, UNO: 16 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D3_REGADERA",
        scoreByAnswer: { NO_TIENE: 0, SI_TIENE: 10 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D4_FOCOS",
        scoreByAnswer: { "0_5": 0, "6_10": 15, "11_15": 27, "16_20": 32, "21_MAS": 46 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D5_PISO",
        scoreByAnswer: { OTRO_MATERIAL: 11, TIERRA_CEMENTO: 0 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D6_AUTOS",
        scoreByAnswer: { CERO: 0, DOS: 41, TRES_MAS: 58, UNO: 32 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D7_ESTUFA",
        scoreByAnswer: { NO_TIENE: 0, SI_TIENE: 20 }
      },
      {
        missingScore: 0,
        questionId: "NSE_D8_ESCOLARIDAD",
        scoreByAnswer: {
          CARRERA_COMERCIAL: 38,
          CARRERA_TECNICA: 38,
          DIPLOMADO_MAESTRIA: 72,
          DOCTORADO: 72,
          LICENCIATURA_COMPLETA: 52,
          LICENCIATURA_INCOMPLETA: 52,
          NO_CONTESTO: 0,
          NO_ESTUDIO: 0,
          PREPARATORIA_COMPLETA: 38,
          PREPARATORIA_INCOMPLETA: 38,
          PRIMARIA_COMPLETA: 22,
          PRIMARIA_INCOMPLETA: 0,
          SECUNDARIA_COMPLETA: 22,
          SECUNDARIA_INCOMPLETA: 22
        }
      }
    ],
    label: "NSE AMAI 8x7",
    ranges: [
      { code: "INFERIOR", eligible: false, label: "Inferior", max: 32, min: 0 },
      { code: "D", eligible: false, label: "D", max: 79, min: 33 },
      { code: "D_PLUS", eligible: false, label: "D+", max: 104, min: 80 },
      { code: "C_MINUS", eligible: true, label: "C-", max: 127, min: 105 },
      { code: "C", eligible: true, label: "C típico", max: 154, min: 128 },
      { code: "C_PLUS", eligible: true, label: "C+", max: 192, min: 155 },
      { code: "A_B", eligible: false, label: "A/B", max: 300, min: 193 }
    ],
    terminationCode: "NSE_NO_ELEGIBLE",
    terminationReason: "El nivel socioeconómico no corresponde al perfil requerido.",
    type: "score_table"
  };
}

function singleChoiceQuestion({
  id,
  options,
  order,
  text,
  visibilityCondition
}: {
  id: string;
  options: ScreenerOption[];
  order: number;
  text: string;
  visibilityCondition?: ScreenerCondition;
}): ScreenerQuestion {
  return {
    dataDestination: "SCREENING",
    id,
    options,
    order,
    required: true,
    text,
    type: "SINGLE_CHOICE",
    validation: {},
    visibilityCondition
  };
}

function multipleChoiceQuestion({
  id,
  options,
  order,
  text
}: {
  id: string;
  options: ScreenerOption[];
  order: number;
  text: string;
}): ScreenerQuestion {
  return {
    dataDestination: "SCREENING",
    id,
    options,
    order,
    required: true,
    text,
    type: "MULTIPLE_CHOICE",
    validation: { minSelections: 1 }
  };
}

function integerQuestion({
  id,
  order,
  text,
  validation
}: {
  id: string;
  order: number;
  text: string;
  validation?: ScreenerQuestion["validation"];
}): ScreenerQuestion {
  return {
    dataDestination: "SCREENING",
    id,
    order,
    required: true,
    text,
    type: "INTEGER",
    validation: validation ?? {}
  };
}

function shortTextQuestion({
  helpText,
  id,
  order,
  text
}: {
  helpText?: string;
  id: string;
  order: number;
  text: string;
}): ScreenerQuestion {
  return {
    dataDestination: "SCREENING",
    helpText,
    id,
    order,
    required: true,
    text,
    type: "SHORT_TEXT",
    validation: { maxLength: 120, minLength: 1 }
  };
}

function nseQuestion({
  id,
  options,
  order,
  text
}: {
  id: string;
  options: ScreenerOption[];
  order: number;
  text: string;
}): ScreenerQuestion {
  return singleChoiceQuestion({ id, options, order, text });
}

function continueOption(value: string, label: string, order: number): ScreenerOption {
  return buildOption(value, label, order, [{ type: "CONTINUE" }]);
}

function scoreOption(value: string, label: string, order: number): ScreenerOption {
  return buildOption(value, label, order, []);
}

function otherOption(value: string, label: string, order: number): ScreenerOption {
  return {
    ...buildOption(value, label, order, []),
    isOther: true,
    otherTextMaxLength: 120,
    otherTextRequired: true
  };
}

function terminateOption(
  value: string,
  label: string,
  order: number,
  code: string,
  reason: string
): ScreenerOption {
  return buildOption(value, label, order, [{ code, reason, type: "TERMINATE" }]);
}

function buildOption(
  value: string,
  label: string,
  order: number,
  actions: ScreenerOptionAction[]
): ScreenerOption {
  return {
    actions,
    isOther: false,
    label,
    order,
    otherTextRequired: false,
    value
  };
}

export const DETERGENTS_TEMPLATE_SUMMARY = {
  code: DETERGENTS_STUDY_CODE,
  filterOnly: true,
  requiresEvidence: false,
  requiresManualRotation: false,
  requiresSelfie: false
} as const;
