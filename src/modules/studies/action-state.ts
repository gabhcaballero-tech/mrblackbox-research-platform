import type { StudyAdminFieldErrors } from "./validation";

export type StudyActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: StudyAdminFieldErrors;
};

export const initialStudyActionState: StudyActionState = {
  status: "idle"
};
