import type { ScreenerAdminFieldErrors } from "./validation";

export type ScreenerDraftActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: ScreenerAdminFieldErrors;
};

export const initialScreenerDraftActionState: ScreenerDraftActionState = {
  status: "idle"
};
