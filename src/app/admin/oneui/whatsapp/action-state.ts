export type OneuiWhatsAppReplyActionState = {
  error: string | null;
  ok: boolean;
};

export const initialOneuiWhatsAppReplyActionState: OneuiWhatsAppReplyActionState = {
  error: null,
  ok: false
};

export type OneuiWhatsAppParticipantSupportActionState = {
  error: string | null;
  hutUrl: string | null;
  message: string | null;
  navigoUrl: string | null;
  ok: boolean;
  phone: string | null;
  templateName: string | null;
  whatsappStatus: string | null;
};

export const initialOneuiWhatsAppParticipantSupportActionState: OneuiWhatsAppParticipantSupportActionState = {
  error: null,
  hutUrl: null,
  message: null,
  navigoUrl: null,
  ok: false,
  phone: null,
  templateName: null,
  whatsappStatus: null
};
