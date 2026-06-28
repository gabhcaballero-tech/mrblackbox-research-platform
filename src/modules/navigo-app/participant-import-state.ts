import type { NavigoParticipantImportPreview } from "./repository";
import type { NavigoParticipantImportRowInput } from "./service";

export type NavigoParticipantImportActionState = {
  message: string | null;
  preview: NavigoParticipantImportPreview | null;
  rows: NavigoParticipantImportRowInput[];
  status: "idle" | "error" | "success";
};

export const initialNavigoParticipantImportActionState: NavigoParticipantImportActionState = {
  message: null,
  preview: null,
  rows: [],
  status: "idle"
};
