import type { NavigoRotationWorkbookPreview } from "./repository";
import type { NavigoHutRotationWorkbookRowInput, NavigoRotationWorkbookRowInput } from "./rotation-workbook";

export type NavigoRotationWorkbookImportActionState = {
  filename: string | null;
  message: string | null;
  preview: NavigoRotationWorkbookPreview | null;
  hutRows: NavigoHutRotationWorkbookRowInput[];
  rows: NavigoRotationWorkbookRowInput[];
  status: "idle" | "error" | "success";
};

export const initialNavigoRotationWorkbookImportActionState: NavigoRotationWorkbookImportActionState = {
  filename: null,
  hutRows: [],
  message: null,
  preview: null,
  rows: [],
  status: "idle"
};
