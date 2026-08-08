import { createOneuiWhatsAppRepository, sendNavigoConfirmationWhatsApp } from "@/modules/oneui-whatsapp";
import { isQaStudyParticipant } from "@/modules/qa-participants/guards";

export type NavigoConfirmationWhatsAppInput = {
  attemptId: string;
  confirmation: {
    folio: string;
    referenceCodes: Array<{ code: string; slot: number }>;
  } | null;
  participant: {
    name: string;
    phone: string | null;
  };
  sourceLabel: string;
  studyId: string;
  studyParticipantId: string;
};

export async function sendNavigoConfirmationWhatsAppBestEffort({
  attemptId,
  confirmation,
  participant,
  sourceLabel,
  studyId,
  studyParticipantId
}: NavigoConfirmationWhatsAppInput): Promise<void> {
  try {
    if (!confirmation) {
      console.error(`${sourceLabel} navigo whatsapp skipped or failed`, {
        attemptId,
        code: "MISSING_CONFIRMATION",
        step: "send_confirmation_template"
      });
      return;
    }
    if (await isQaStudyParticipant(studyParticipantId)) {
      console.error(`${sourceLabel} navigo whatsapp skipped or failed`, {
        attemptId,
        code: "QA_PARTICIPANT",
        step: "send_confirmation_template"
      });
      return;
    }

    const whatsappRepository = createOneuiWhatsAppRepository();
    const existingMessage = await whatsappRepository.findLatestOutboundTemplateMessage({
      linkedParticipantId: studyParticipantId,
      linkedStudyId: studyId,
      sourceModule: "NAVIGO"
    });
    const result = await sendNavigoConfirmationWhatsApp({
      codes: confirmation.referenceCodes,
      existingMessage,
      folio: confirmation.folio,
      participantId: studyParticipantId,
      participantName: participant.name,
      phone: participant.phone,
      repository: whatsappRepository,
      studyId
    });

    if (!result.ok) {
      console.error(`${sourceLabel} navigo whatsapp skipped or failed`, {
        attemptId,
        code: result.code,
        step: "send_confirmation_template"
      });
    }
  } catch (error) {
    console.error(`${sourceLabel} navigo whatsapp failed`, {
      attemptId,
      code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      step: "send_confirmation_template"
    });
  }
}
