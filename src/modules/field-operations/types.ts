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
  participants: CltOperationsDetail[];
  selectedStudyId: string | null;
  studies: FieldOperationsStudy[];
};
