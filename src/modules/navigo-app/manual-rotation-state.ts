export type NavigoManualRotationActionState = {
  message: string | null;
  status: "idle" | "error" | "success";
};

export const initialNavigoManualRotationActionState: NavigoManualRotationActionState = {
  message: null,
  status: "idle"
};
