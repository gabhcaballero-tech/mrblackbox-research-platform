export type AppArea = "admin" | "field" | "participant";

export type AreaDefinition = {
  key: AppArea;
  label: string;
  description: string;
};
