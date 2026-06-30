import type { NavigoParticipantImportPreview } from "./repository";
import type { NavigoParticipantImportRowInput } from "./service";

export type NavigoParticipantImportActionState = {
  applyErrors: Array<{
    folio: string;
    message: string;
    rowNumber: number;
    step: string;
  }>;
  message: string | null;
  preview: NavigoParticipantImportPreview | null;
  rows: NavigoParticipantImportRowInput[];
  status: "idle" | "error" | "success";
};

export const initialNavigoParticipantImportActionState: NavigoParticipantImportActionState = {
  applyErrors: [],
  message: null,
  preview: null,
  rows: [],
  status: "idle"
};
