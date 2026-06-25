import type { NavigoRotationImportPreview } from "./repository";
import type { NavigoRotationImportRowInput } from "./service";

export type NavigoRotationImportActionState = {
  message: string | null;
  preview: NavigoRotationImportPreview | null;
  rows: NavigoRotationImportRowInput[];
  status: "idle" | "error" | "success";
};

export const initialNavigoRotationImportActionState: NavigoRotationImportActionState = {
  message: null,
  preview: null,
  rows: [],
  status: "idle"
};
