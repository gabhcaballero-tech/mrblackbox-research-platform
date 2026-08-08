import { createCltOperationsRepository } from "@/modules/clt-operations";
import { hashCtlInterviewerCode, normalizeCtlCode } from "@/modules/ctl/service";
import { createPrismaClient, type PrismaClientLike } from "@/shared/db/client";
import type {
  FieldOperationsDashboard,
  FieldOperationsInterviewerCode,
  FieldOperationsStudy
} from "./types";

type Delegate = {
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
};

type FieldOperationsPrismaClient = PrismaClientLike & {
  ctlInterviewerCode: Delegate;
  study: Delegate;
};

export type FieldOperationsRepository = {
  getDashboard: (input: {
    actorName: string;
    actorRole: "ADMIN" | "ANALYST" | "INTERVIEWER" | "SUPERVISOR";
    detailSessionId?: string | null;
    interviewerCode?: string | null;
    interviewerCodeId?: string | null;
    interviewerUserId: string;
    mode?: "ADMIN" | "INTERVIEWER_CODE";
    studyId?: string | null;
  }) => Promise<FieldOperationsDashboard>;
};

export function createFieldOperationsRepository(
  prismaClient?: FieldOperationsPrismaClient
): FieldOperationsRepository {
  async function getPrisma() {
    return prismaClient ?? ((await createPrismaClient()) as FieldOperationsPrismaClient);
  }

  return {
    async getDashboard(input) {
      const prisma = await getPrisma();
      const isAdminMode = input.actorRole === "ADMIN" && input.mode === "ADMIN";
      const codeAccess = !isAdminMode
        ? await resolveInterviewerCodeAccess(prisma, input.interviewerCode)
        : null;
      if (!isAdminMode && !codeAccess?.ok) {
        return {
          actorName: input.actorName,
          detail: null,
          interviewerCodes: [],
          participants: [],
          selectedStudyId: null,
          studies: [],
          viewer: {
            error: codeAccess?.message ?? null,
            mode: "CODE_REQUIRED"
          }
        };
      }

      const studies = isAdminMode
        ? await listAdminStudies(prisma)
        : codeAccess?.ok
          ? [codeAccess.interviewerCode.study]
          : [];
      const selectedStudyId = input.studyId && studies.some((study) => study.id === input.studyId)
        ? input.studyId
        : studies[0]?.id ?? null;
      const interviewerCodes = selectedStudyId ? await listStudyInterviewerCodes(prisma, selectedStudyId) : [];
      const selectedAdminInterviewerCodeId = isAdminMode && input.interviewerCodeId
        && interviewerCodes.some((code) => code.id === input.interviewerCodeId)
        ? input.interviewerCodeId
        : null;
      const dashboard = selectedStudyId
        ? await createCltOperationsRepository(prisma as never).getDashboard({
            ctlInterviewerCodeId: isAdminMode ? selectedAdminInterviewerCodeId : codeAccess?.ok ? codeAccess.interviewerCode.id : null,
            detailSessionId: input.detailSessionId,
            interviewerUserId: null,
            studyId: selectedStudyId
          })
        : null;

      return {
        actorName: input.actorName,
        detail: dashboard?.detail ?? null,
        interviewerCodes,
        participants: dashboard?.participants ?? [],
        selectedStudyId,
        studies,
        viewer: isAdminMode
          ? {
              filterInterviewerCodeId: selectedAdminInterviewerCodeId,
              mode: "ADMIN"
            }
          : {
              code: codeAccess?.ok ? codeAccess.code : "",
              id: codeAccess?.ok ? codeAccess.interviewerCode.id : "",
              label: codeAccess?.ok ? codeAccess.interviewerCode.label : "",
              mode: "INTERVIEWER_CODE"
            }
      };
    }
  };
}

type FieldOperationsInterviewerCodeRecord = {
  expiresAt: Date | null;
  id: string;
  label: string;
  status: string;
  study: FieldOperationsStudy;
  studyId: string;
};

async function resolveInterviewerCodeAccess(
  prisma: FieldOperationsPrismaClient,
  codeValue: string | null | undefined
): Promise<
  | {
      code: string;
      interviewerCode: FieldOperationsInterviewerCodeRecord;
      ok: true;
    }
  | {
      message: string | null;
      ok: false;
    }
> {
  const code = normalizeCtlCode(codeValue);
  if (!code) {
    return { message: null, ok: false };
  }

  const interviewerCode = await prisma.ctlInterviewerCode.findFirst?.({
    select: {
      expiresAt: true,
      id: true,
      label: true,
      status: true,
      study: {
        select: {
          code: true,
          id: true,
          name: true,
          timeZoneIana: true
        }
      },
      studyId: true
    },
    where: {
      codeHash: hashCtlInterviewerCode(code)
    }
  }) as FieldOperationsInterviewerCodeRecord | null;

  if (!interviewerCode || !isUsableInterviewerCode(interviewerCode, new Date())) {
    return { message: "El código de encuestador no es válido.", ok: false };
  }

  return {
    code,
    interviewerCode,
    ok: true
  };
}

async function listAdminStudies(prisma: FieldOperationsPrismaClient): Promise<FieldOperationsStudy[]> {
  const studies = await prisma.study.findMany?.({
    orderBy: { name: "asc" },
    select: {
      code: true,
      id: true,
      name: true,
      timeZoneIana: true
    },
    where: {
      ctlSessions: {
        some: {
          studyParticipant: {
            qaParticipantRun: { is: null }
          }
        }
      }
    }
  }) as FieldOperationsStudy[] | undefined;

  return studies ?? [];
}

async function listStudyInterviewerCodes(
  prisma: FieldOperationsPrismaClient,
  studyId: string
): Promise<FieldOperationsInterviewerCode[]> {
  const codes = await prisma.ctlInterviewerCode.findMany?.({
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      status: true
    },
    where: { studyId }
  }) as FieldOperationsInterviewerCode[] | undefined;

  return codes ?? [];
}

function isUsableInterviewerCode(
  interviewerCode: Pick<FieldOperationsInterviewerCodeRecord, "expiresAt" | "status">,
  now: Date
): boolean {
  if (interviewerCode.status !== "ACTIVE") {
    return false;
  }

  return !interviewerCode.expiresAt || interviewerCode.expiresAt.getTime() > now.getTime();
}
