import type { AreaDefinition } from "@/shared/types/areas";

export const AREA_DEFINITIONS: AreaDefinition[] = [
  {
    key: "admin",
    label: "Administracion",
    description: "Base para operar estudios y revisar actividad futura."
  },
  {
    key: "field",
    label: "Campo / encuestadores",
    description: "Base para flujos operativos de campo."
  },
  {
    key: "participant",
    label: "Participante",
    description: "Base para experiencias por enlace."
  }
];
