export * from "./actions";
export * from "./repository";
export * from "./service";
export * from "./validation";

export const studiesModule = {
  key: "studies",
  status: "ready",
  description: "Study draft administration, validation and persistence boundary."
} as const;
