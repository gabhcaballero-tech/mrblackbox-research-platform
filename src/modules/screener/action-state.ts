export type ScreenerActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message: string;
  status: "idle" | "success" | "error";
};

export const initialScreenerActionState: ScreenerActionState = {
  message: "",
  status: "idle"
};
