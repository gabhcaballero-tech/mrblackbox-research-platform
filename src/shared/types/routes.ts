export const APP_ROUTES = {
  home: "/",
  admin: "/admin",
  field: "/field",
  participantExample: "/p/demo-token"
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
