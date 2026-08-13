import { createPrismaClient } from "@/shared/db/client";
import { calculateParticipantOperationalReadiness } from "./service";
import type { ParticipantOperationalReadiness, ParticipantReadinessInput } from "./types";

type ParticipantReadinessPrisma = {
  studyParticipant: {
    findUnique: (args: unknown) => Promise<ParticipantReadinessInput | null>;
  };
};

const participantReadinessSelect = {
  accessTokens: {
    select: {
      expiresAt: true,
      status: true
    }
  },
  activities: {
    select: {
      activitySchedule: {
        select: {
          code: true
        }
      },
      status: true
    }
  },
  applicationStartedAt: true,
  ctlSessions: {
    select: {
      status: true
    }
  },
  ctlTriangularRotationAssignment: {
    select: {
      id: true
    }
  },
  hutParticipant: {
    select: {
      applicationEvidence: {
        select: {
          phase: true
        }
      },
      applicationPhotoEntries: {
        select: {
          useDayNumber: true
        }
      },
      email: true,
      firstFragranceLeftArm: true,
      folio: true,
      id: true,
      name: true,
      origin: true,
      phaseCodes: {
        select: {
          phase: true,
          status: true
        }
      },
      phone: true,
      protocolVersion: true,
      questionnaireAttempt: {
        select: {
          status: true,
          visits: {
            select: {
              section: true,
              status: true
            }
          }
        }
      },
      secondFragranceRightArm: true,
      status: true,
      studyParticipantId: true
    }
  },
  id: true,
  operationalStatus: true,
  participantConfirmation: {
    select: {
      referenceCodes: {
        select: {
          slot: true
        }
      },
      screeningAttempt: {
        select: {
          status: true
        }
      }
    }
  },
  participantScreeningReviews: {
    orderBy: {
      reviewedAt: "desc"
    },
    select: {
      status: true
    },
    take: 1
  },
  rotationAssignment: {
    select: {
      arms: {
        select: {
          applicationOrder: true,
          studyProduct: {
            select: {
              internalCode: true
            }
          }
        }
      }
    }
  },
  screeningStatus: true
} as const;

export async function getParticipantOperationalReadiness(
  participantId: string
): Promise<ParticipantOperationalReadiness | null> {
  const prisma = (await createPrismaClient()) as unknown as ParticipantReadinessPrisma;
  const participant = await prisma.studyParticipant.findUnique({
    select: participantReadinessSelect,
    where: { id: participantId }
  });

  if (!participant) {
    return null;
  }

  return calculateParticipantOperationalReadiness(participant);
}

export function getParticipantOperationalReadinessSelect() {
  return participantReadinessSelect;
}
