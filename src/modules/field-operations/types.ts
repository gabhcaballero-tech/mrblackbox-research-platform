import type { CltOperationsDetail } from "@/modules/clt-operations";

export type FieldOperationsStudy = {
  code: string;
  id: string;
  name: string;
  timeZoneIana: string;
};

export type FieldOperationsDashboard = {
  actorName: string;
  detail: CltOperationsDetail | null;
  interviewerCodes: FieldOperationsInterviewerCode[];
  participants: CltOperationsDetail[];
  selectedStudyId: string | null;
  studies: FieldOperationsStudy[];
  viewer:
    | {
        code: string;
        id: string;
        label: string;
        mode: "INTERVIEWER_CODE";
      }
    | {
        code: string;
        id: string;
        label: string;
        mode: "SUPERVISOR_CODE";
      }
    | {
        filterInterviewerCodeId: string | null;
        mode: "ADMIN";
      }
    | {
        error: string | null;
        mode: "CODE_REQUIRED";
      };
};

export type FieldOperationsInterviewerCode = {
  id: string;
  label: string;
  status: string;
};
