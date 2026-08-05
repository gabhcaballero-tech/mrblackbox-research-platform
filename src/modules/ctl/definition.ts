export type CtlQuestionType = "LONG_TEXT" | "SELECT" | "SHORT_TEXT";

export type CtlQuestionOption = {
  label: string;
  value: string;
};

export type CtlQuestionDefinition = {
  code: string;
  label: string;
  options?: CtlQuestionOption[];
  required: boolean;
  section: string;
  type: CtlQuestionType;
};

export type CtlDefinition = {
  version: 1;
  questions: CtlQuestionDefinition[];
};

export const CTL_DEFINITION: CtlDefinition = {
  questions: [
    {
      code: "P1_TRIANGULAR_1",
      label: "Codigo triangular 1 observado",
      required: true,
      section: "Validacion presencial",
      type: "SHORT_TEXT"
    },
    {
      code: "P2_TRIANGULAR_2",
      label: "Codigo triangular 2 observado",
      required: true,
      section: "Validacion presencial",
      type: "SHORT_TEXT"
    },
    {
      code: "P5_GUSTO",
      label: "Gusto general de la primera muestra",
      options: [
        { label: "Me disgusta mucho", value: "1" },
        { label: "Me disgusta", value: "2" },
        { label: "Ni me gusta ni me disgusta", value: "3" },
        { label: "Me gusta", value: "4" },
        { label: "Me gusta mucho", value: "5" }
      ],
      required: true,
      section: "Evaluacion",
      type: "SELECT"
    },
    {
      code: "OBSERVACIONES_CTL",
      label: "Observaciones del encuestador",
      required: false,
      section: "Cierre",
      type: "LONG_TEXT"
    }
  ],
  version: 1
};

export function getCtlDefinition(): CtlDefinition {
  return CTL_DEFINITION;
}
