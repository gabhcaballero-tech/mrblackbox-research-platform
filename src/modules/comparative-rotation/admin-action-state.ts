import type { ComparativeAdminFieldErrors } from "./admin-validation";

export type ComparativeActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: ComparativeAdminFieldErrors;
};

export const initialComparativeActionState: ComparativeActionState = {
  status: "idle"
};
