export type CtlQuestionType = "LONG_TEXT" | "MATRIX" | "SCALE" | "SELECT" | "SHORT_TEXT";

export type CtlQuestionOption = {
  label: string;
  value: string;
};

export type CtlBaseQuestionDefinition = {
  code: string;
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
  questions: CtlQuestionDefinition[];
  title: string;
};

export type CtlDefinition = {
  sections: CtlSectionDefinition[];
  version: 2;
};

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
  { code: "ARTIFICIAL", label: "Artificial" },
  { code: "AUDAZ", label: "Audaz" },
  { code: "MISTERIOSA", label: "Misteriosa" }
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

const preferenceOptions: CtlQuestionOption[] = [
  { label: "La primera", value: "1" },
  { label: "La segunda", value: "2" },
  { label: "Ambas", value: "3" },
  { label: "Ninguna", value: "4" }
];

const preferenceWithArmsOptions: CtlQuestionOption[] = [
  { label: "La primera (izquierda)", value: "1" },
  { label: "La segunda (derecha)", value: "2" },
  { label: "Ambas", value: "3" },
  { label: "Ninguna", value: "4" }
];

const nseLevelOptions: CtlQuestionOption[] = [
  { label: "A/B", value: "AB" },
  { label: "C+", value: "C_PLUS" },
  { label: "C Típico", value: "C_TIPICO" },
  { label: "C-", value: "C_MINUS" },
  { label: "D+", value: "D_PLUS" },
  { label: "D", value: "D" },
  { label: "E", value: "E" }
];

function makeFragranceQuestions(suffix: "M1" | "M2", labelSuffix: string): CtlQuestionDefinition[] {
  return [
    {
      code: `P5A_GUSTO_${suffix}`,
      label: `P5${suffix === "M1" ? "a" : "b"}. Por favor huela su antebrazo y díganos ¿Qué tanto le gusta la fragancia que le hemos aplicado, usted diría que...?`,
      labels: likingScaleLabels,
      max: 7,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P6A_INTENSIDAD_PREFERIDA_${suffix}`,
      label: `P6${suffix === "M1" ? "a" : "b"}. ¿Pensando en la intensidad de esta fragancia usted diría que es...?`,
      labels: preferredIntensityScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P7A_INTENSIDAD_PERCIBIDA_${suffix}`,
      label: `P7${suffix === "M1" ? "a" : "b"}. Pensando en la intensidad de esta fragancia, ¿usted diría que es...?`,
      labels: perceivedIntensityScaleLabels,
      max: 7,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P8A_ATRIBUTOS_${suffix}`,
      columns: agreementColumns,
      label: `P8${suffix === "M1" ? "a" : "b"}. Le voy a leer una lista de atributos que pueden ser usados para DESCRIBIR una fragancia. Para cada uno, por favor dígame ¿En qué medida está de acuerdo con que este atributo aplica para esta fragancia de perfume? (${labelSuffix})`,
      required: true,
      rows: fragranceAttributeRows,
      type: "MATRIX"
    },
    {
      code: `P9A_AROMA_${suffix}`,
      columns: yesNoColumns,
      label: `P9${suffix === "M1" ? "a" : "b"}. Voy a leer una lista de atributos sobre el aroma de la fragancia que acaba de probar. Por favor dígame si cada uno de estos atributos aplica o no para esta fragancia. (${labelSuffix})`,
      required: true,
      rows: aromaAttributeRows,
      type: "MATRIX"
    },
    {
      code: `P10A_INTENCION_COMPRA_${suffix}`,
      label: `P10${suffix === "M1" ? "a" : "b"}. Si este producto estuviera a la venta en donde habitualmente compra sus fragancias, ¿Qué tan probable es que usted compre esta fragancia? Diría que...`,
      labels: purchaseIntentScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P11A_COMPARACION_MARCA_USUAL_${suffix}`,
      label: `P11${suffix === "M1" ? "a" : "b"}. Pensando en la fragancia que acaba de conocer, ¿usted diría que ésta es...?`,
      labels: usualBrandComparisonScaleLabels,
      max: 5,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P12A_INTENCION_CAMBIO_${suffix}`,
      label: `P12${suffix === "M1" ? "a" : "b"}. Pensando en la fragancia que acaba de conocer, ¿cuál de las siguientes opciones describe mejor su intención de cambio?`,
      labels: switchingIntentScaleLabels,
      max: 3,
      min: 1,
      required: true,
      type: "SCALE"
    },
    {
      code: `P13A_DURACION_${suffix}`,
      label: `P13${suffix === "M1" ? "a" : "b"}. Pensando en la duración de la fragancia, ¿usted diría que ésta durará...?`,
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
      id: "TRIANGULAR_1",
      questions: [
        {
          code: "P1_TRIANGULAR_1",
          label: "P1. Ahora, le pediremos que por favor huela estas tres tiras con fragancia, una de ellas es diferente, por favor, indíquenos: ¿Cuál de ellas es diferente a las otras 2?",
          options: [
            { label: "K-247 (A)", value: "1" },
            { label: "O-472 (A)", value: "2" },
            { label: "C-583 (B)", value: "3" },
            { label: "G-835 (B)", value: "4" },
            { label: "H-358 (B)", value: "5" },
            { label: "Z-724 (A)", value: "6" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P2_TRIANGULAR_1_RESULTADO",
          label: "P2. Con base en la siguiente tarjeta dígame ¿Qué le parece la fragancia?",
          options: sameDifferentOptions,
          required: true,
          type: "SELECT"
        }
      ],
      title: "Sección II - Triangular 1"
    },
    {
      id: "TRIANGULAR_2",
      questions: [
        {
          code: "P3_TRIANGULAR_2",
          label: "P3. Ahora, le pediremos que por favor huela estas tres tiras con fragancia, una de ellas es diferente, por favor, indíquenos: ¿Cuál de ellas es diferente a las otras 2?",
          options: [
            { label: "G-853 (B)", value: "7" },
            { label: "H-358 (B)", value: "8" },
            { label: "Z-742 (A)", value: "9" },
            { label: "K-247 (A)", value: "10" },
            { label: "O-472 (A)", value: "11" },
            { label: "C-583 (B)", value: "12" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "P4_TRIANGULAR_2_RESULTADO",
          label: "P4. Con base en la siguiente tarjeta dígamos ¿Qué le parece la fragancia?",
          options: sameDifferentOptions,
          required: true,
          type: "SELECT"
        }
      ],
      title: "Sección II - Triangular 2"
    },
    {
      description: "Evaluación de la primera fragancia aplicada en el antebrazo izquierdo.",
      id: "FRAGRANCIA_1",
      questions: makeFragranceQuestions("M1", "primera fragancia"),
      title: "Sección III - Evaluación de primera fragancia"
    },
    {
      description: "Evaluación de la segunda fragancia aplicada en el antebrazo derecho.",
      id: "FRAGRANCIA_2",
      questions: makeFragranceQuestions("M2", "segunda fragancia"),
      title: "Sección IV - Evaluación de segunda fragancia"
    },
    {
      description: "Comparativa a 15 minutos entre ambas fragancias.",
      id: "COMPARATIVA",
      questions: [
        {
          code: "P14_PREFERENCIA",
          label: "P14. ¿Cuál de las dos fragancias prefiere?",
          options: preferenceWithArmsOptions,
          required: true,
          type: "SELECT"
        },
        {
          code: "P14A_RAZONES_PREFERENCIA",
          label: "P14a. ¿Cuáles son las razones por las que prefiere la fragancia que prefirió en P14?",
          required: true,
          type: "LONG_TEXT"
        },
        {
          code: "P15_PREFERENCIA_INTENSIDAD",
          label: "P15. Pensando en la intensidad del aroma de estas fragancias, ¿cuál de las dos prefiere en intensidad?",
          options: preferenceOptions,
          required: true,
          type: "SELECT"
        },
        {
          code: "P16_INTENSIDAD_PRIMERA",
          label: "P16. Pensando en la intensidad la PRIMERA fragancia (BRAZO IZQUIERDO), ¿Diría que es...?",
          labels: perceivedIntensityScaleLabels,
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        },
        {
          code: "P17_INTENSIDAD_SEGUNDA",
          label: "P17. Pensando en la intensidad la SEGUNDA fragancia (BRAZO DERECHO), ¿Diría que es...?",
          labels: perceivedIntensityScaleLabels,
          max: 7,
          min: 1,
          required: true,
          type: "SCALE"
        },
        {
          code: "P18_MAYOR_DURACION",
          label: "P18. ¿Cuál de las dos fragancias considera que tiene mayor duración?",
          options: preferenceOptions,
          required: true,
          type: "SELECT"
        },
        {
          code: "P19_PREFERENCIA_CAMBIO",
          label: "P19. Si decidieras cambiar tu fragancia de uso habitual, ¿Por cuál de estas dos fragancias preferirías cambiarla?",
          options: preferenceOptions,
          required: true,
          type: "SELECT"
        },
        {
          code: "P20_ADECUADA_JAFRA",
          label: "P20. ¿Cuál de las dos fragancias es más adecuada para la marca Jafra?",
          options: preferenceOptions,
          required: true,
          type: "SELECT"
        }
      ],
      title: "Sección V - Comparativa"
    },
    {
      id: "DEMOGRAFICOS",
      questions: [
        {
          code: "D1_ESCOLARIDAD_JEFE",
          label: "D1. Pensando en el jefe o jefa de hogar, ¿cuál fue el último año de estudios que aprobó en la escuela?",
          options: [
            { label: "Sin instrucción / Preescolar", value: "0" },
            { label: "Primaria incompleta", value: "1" },
            { label: "Primaria completa", value: "2" },
            { label: "Secundaria incompleta", value: "3" },
            { label: "Secundaria completa", value: "4" },
            { label: "Preparatoria incompleta", value: "5" },
            { label: "Preparatoria completa", value: "6" },
            { label: "Licenciatura incompleta", value: "7" },
            { label: "Licenciatura completa", value: "8" },
            { label: "Posgrado", value: "9" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "D2_BANOS_COMPLETOS",
          label: "D2. ¿Cuántos baños completos con regadera y W.C. hay en esta vivienda?",
          options: [
            { label: "Ningún baño completo", value: "0" },
            { label: "1 baño completo", value: "1" },
            { label: "2 o más baños completos", value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "D3_AUTOS",
          label: "D3. ¿Cuántos automóviles para su uso particular tienen en su hogar, sin contar taxis?",
          options: [
            { label: "0 autos", value: "0" },
            { label: "1 auto", value: "1" },
            { label: "2 o más autos", value: "2" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "D4_INTERNET",
          label: "D4. Sin tomar en cuenta la conexión móvil que pudiera tener desde algún celular ¿este hogar cuenta con internet?",
          options: [
            { label: "No tiene", value: "0" },
            { label: "Sí tiene", value: "1" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "D5_TRABAJADORES",
          label: "D5. De todas las personas de más de 14 años que viven en el hogar, ¿cuántas trabajaron en el último mes?",
          options: [
            { label: "Ninguna", value: "0" },
            { label: "1 persona", value: "1" },
            { label: "2 personas", value: "2" },
            { label: "3 personas", value: "3" },
            { label: "4 o más personas", value: "4" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "D6_CUARTOS_DORMIR",
          label: "D6. En esta vivienda, ¿cuántos cuartos se usan para dormir, sin contar pasillos ni baños?",
          options: [
            { label: "0 no tiene", value: "0" },
            { label: "1 cuarto", value: "1" },
            { label: "2 cuartos", value: "2" },
            { label: "3 cuartos", value: "3" },
            { label: "4 o más cuartos", value: "4" }
          ],
          required: true,
          type: "SELECT"
        },
        {
          code: "D7_PUNTAJE_NSE",
          label: "Registrar puntaje total NSE de acuerdo a D1-D6.",
          required: true,
          type: "SHORT_TEXT"
        },
        {
          code: "D8_NSE_REGISTRADO",
          label: "Registrar NSE de acuerdo a puntaje.",
          options: nseLevelOptions,
          required: true,
          type: "SELECT"
        }
      ],
      title: "Demográficos"
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
