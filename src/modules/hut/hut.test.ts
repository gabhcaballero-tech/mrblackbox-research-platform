import { describe, expect, it, vi } from "vitest";
import {
  applyHutMissedDay,
  applyHutVideoSubmission,
  buildHutTsv,
  createHutRepository,
  getHutCurrentAvailability,
  hutBlockDayAvailableAt,
  nextHutVideoSequence,
  parseHutParticipantImportText
} from ".";
import type { HutStorageClient } from "./storage";

describe("HUT module foundation", () => {
  it("keeps video sequence strict and does not skip after a missed day", () => {
    expect(nextHutVideoSequence(block({ submittedVideosCount: 1 }))).toBe(2);

    const missed = applyHutMissedDay(block({ missedDaysCount: 0, submittedVideosCount: 1 }));
    expect(missed.disqualified).toBe(false);
    expect(nextHutVideoSequence(block({ missedDaysCount: missed.missedDaysCount, submittedVideosCount: 1 }))).toBe(2);
  });

  it("allows one missed day per block and disqualifies on the second missed day", () => {
    const firstMiss = applyHutMissedDay(block({ missedDaysCount: 0 }));
    expect(firstMiss).toMatchObject({
      blockStatus: "IN_PROGRESS",
      disqualified: false,
      missedDaysCount: 1
    });

    const secondMiss = applyHutMissedDay(block({ missedDaysCount: 1 }));
    expect(secondMiss).toMatchObject({
      blockStatus: "DISQUALIFIED",
      disqualified: true,
      participantStatus: "DISQUALIFIED"
    });
  });

  it("moves a block to call pending after the third video", () => {
    const decision = applyHutVideoSubmission(block({ submittedVideosCount: 2 }));

    expect(decision).toMatchObject({
      blockStatus: "CALL_PENDING",
      participantStatus: "BLOCK_1_CALL_PENDING",
      submittedVideosCount: 3
    });
  });

  it("creates a HUT participant and link independent from Navigo", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const result = await repository.createParticipant({
      name: "Participante Uno",
      phone: "5512345678",
      recruiter: "Reclutadora",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.link : "").toContain("https://example.com/hut/p/");
    expect(prisma.state.participants[0]?.status).toBe("BLOCK_1_IN_PROGRESS");
    expect(prisma.state.participants[0]?.blocks).toHaveLength(2);
  });

  it("stores a registration reference selfie for a HUT participant", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Selfie",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const signed = await repository.requestReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: selfieMetadata(),
      participantId: participant?.id ?? "",
      storage,
      studyId: "study-hut"
    });
    expect(signed.ok).toBe(true);
    const confirmed = await repository.confirmReferenceSelfieUpload({
      actorUserId: "user-1",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      participantId: participant?.id ?? "",
      studyId: "study-hut"
    });

    expect(confirmed.ok).toBe(true);
    expect(participant?.referenceSelfie?.privateStorageKey).toContain("/reference-selfie/");
  });

  it("blocks video upload when registration selfie is missing", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Sin Selfie",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const result = await repository.requestVideoUpload({
      metadata: videoMetadata(),
      storage,
      token: prisma.state.participants[0]?.token ?? ""
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("registro aun no esta completo");
  });

  it("does not request selfie or upload before 5 a.m. in study timezone", () => {
    const availability = getHutCurrentAvailability({
      block: {
        ...block(),
        startDate: new Date("2026-07-01T06:00:00.000Z")
      },
      dailyChecks: [],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T10:59:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.available).toBe(false);
    expect(availability.reason).toBe("WAIT_UNTIL_5_AM");
  });

  it("asks for daily selfie after 5 a.m. when no verification exists", () => {
    const availability = getHutCurrentAvailability({
      block: {
        ...block(),
        startDate: new Date("2026-07-01T06:00:00.000Z")
      },
      dailyChecks: [],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T11:00:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.available).toBe(true);
    expect(availability.reason).toBe("AVAILABLE_FOR_SELFIE");
  });

  it("makes video 2 unavailable until 5 a.m. of the next day after video 1", () => {
    const nextAvailable = hutBlockDayAvailableAt({
      blockDayNumber: 2,
      startDate: new Date("2026-07-01T06:00:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });
    const availability = getHutCurrentAvailability({
      block: {
        ...block({ submittedVideosCount: 1 }),
        startDate: new Date("2026-07-01T06:00:00.000Z")
      },
      dailyChecks: [{ blockDayNumber: 1 }],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date(nextAvailable.getTime() - 60_000),
      timeZoneIana: "America/Mexico_City"
    });

    expect(availability.reason).toBe("WAIT_UNTIL_5_AM");
    expect(availability.expectedVideoSequence).toBe(2);
  });

  it("daily selfie matched allows the video upload", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Matched",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    participant!.referenceSelfie = referenceSelfie();
    const token = participant?.token ?? "";
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token });
    const verified = await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("MATCH", 0.62),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token
    });
    const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token });

    expect(verified.ok ? verified.data.status : "").toBe("MATCHED");
    expect(video.ok).toBe(true);
  });

  it("daily selfie failed blocks the video upload", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Fallo",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    participant!.referenceSelfie = referenceSelfie();
    const token = participant?.token ?? "";
    const signed = await repository.requestDailySelfieUpload({ metadata: selfieMetadata(), storage, token });
    await repository.confirmDailySelfieUpload({
      faceVerification: faceResult("NO_MATCH", 0.2),
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      token
    });
    const video = await repository.requestVideoUpload({ metadata: videoMetadata(), storage, token });

    expect(video.ok).toBe(false);
    expect(video.ok ? "" : video.message).toContain("No pudimos confirmar tu identidad");
  });

  it("uploads video 1, 2 and 3 and then enables phone evaluation", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const created = await repository.createParticipant({
      name: "Participante Uno",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const token = prisma.state.participants[0]?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    expect(prisma.state.participants[0]?.currentVideoSequence).toBe(2);
    await uploadNextVideo(repository, token, storage, prisma.state);
    expect(prisma.state.participants[0]?.currentVideoSequence).toBe(3);
    await uploadNextVideo(repository, token, storage, prisma.state);

    expect(created.ok).toBe(true);
    expect(prisma.state.participants[0]?.blocks[0]?.submittedVideosCount).toBe(3);
    expect(prisma.state.participants[0]?.blocks[0]?.status).toBe("CALL_PENDING");
    expect(prisma.state.participants[0]?.status).toBe("BLOCK_1_CALL_PENDING");
  });

  it("allows one omitted day and keeps the next upload as video 2", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Dos",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.markMissedDay({ participantId: participant?.id ?? "", reminderSent: true, studyId: "study-hut" });
    expect(participant?.currentVideoSequence).toBe(2);
    await uploadNextVideo(repository, token, storage, prisma.state);

    expect(participant?.blocks[0]?.missedDaysCount).toBe(1);
    expect(participant?.videoSubmissions[1]?.sequenceNumber).toBe(2);
  });

  it("disqualifies when a second day is omitted within the same block", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Tres",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.markMissedDay({ participantId: participant?.id ?? "", reminderSent: true, studyId: "study-hut" });
    await uploadNextVideo(repository, token, storage, prisma.state);
    const result = await repository.markMissedDay({ participantId: participant?.id ?? "", studyId: "study-hut" });

    expect(result.ok).toBe(true);
    expect(participant?.status).toBe("DISQUALIFIED");
    expect(participant?.blocks[0]?.status).toBe("DISQUALIFIED");
  });

  it("starts block 2 after evaluation 1 and gives it independent tolerance", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Cuatro",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.markMissedDay({ participantId: participant?.id ?? "", studyId: "study-hut" });
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant?.id ?? "", studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant?.id ?? "",
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await repository.markMissedDay({ participantId: participant?.id ?? "", studyId: "study-hut" });

    expect(participant?.blocks[0]?.missedDaysCount).toBe(1);
    expect(participant?.blocks[1]?.missedDaysCount).toBe(1);
    expect(participant?.status).toBe("BLOCK_2_IN_PROGRESS");
  });

  it("completes evaluation 2 and marks participation as completed", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Cinco",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0];
    const token = participant?.token ?? "";

    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant?.id ?? "", studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant?.id ?? "",
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await uploadNextVideo(repository, token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 2, participantId: participant?.id ?? "", studyId: "study-hut" });

    expect(participant?.status).toBe("COMPLETED");
  });

  it("exports HUT progress as clean TSV", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      email: "participante@example.com",
      name: "Participante con Ñ",
      phone: "5512345678",
      recruiter: "Reclutadora",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    const result = await repository.exportProgress({
      now: new Date("2026-07-01T00:00:00.000Z"),
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(result.ok ? result.data.filename : "").toBe("HUT-TEST_hut_avance_2026-07-01.tsv");
    expect(result.ok ? result.data.body : "").toContain("ID\tNombre\tCelular\tCorreo\tReclutador\tLink participante");
    expect(result.ok ? result.data.body : "").toContain("PARTICIPANTE CON Ñ");
  });

  it("parses participant import text and preserves tabular export columns", () => {
    const rows = parseHutParticipantImportText("nombre\tcelular\tcorreo\treclutador\nAna Ñ\t5512345678\tana@example.com\tGaby");
    const tsv = buildHutTsv([
      ["Nombre", "Notas"],
      [rows[0]?.name, "Texto con\t tab y\nsalto; conserva comas"]
    ]);

    expect(rows[0]).toMatchObject({ name: "ANA Ñ", phone: "5512345678", recruiter: "GABY" });
    expect(tsv.startsWith("\uFEFF")).toBe(true);
    expect(tsv).toContain("ANA Ñ\tTexto con tab y salto; conserva comas");
  });
});

function block(input: Partial<Parameters<typeof applyHutVideoSubmission>[0]> = {}) {
  return {
    blockNumber: 1 as const,
    maxMissedDaysAllowed: 1,
    missedDaysCount: 0,
    requiredVideos: 3,
    status: "IN_PROGRESS" as const,
    submittedVideosCount: 0,
    ...input
  };
}

async function uploadNextVideo(
  repository: ReturnType<typeof createHutRepository>,
  token: string,
  storage: HutStorageClient,
  state: { participants: FakeParticipant[] }
) {
  const participant = state.participants.find((item) => item.token === token);
  if (participant) {
    participant.referenceSelfie ??= referenceSelfie();
    const activeBlock = participant.blocks.find((item) => item.status === "IN_PROGRESS");
    const sequenceNumber = activeBlock ? activeBlock.submittedVideosCount + 1 : 1;
    participant.visualVerifications.unshift({
      attemptSelfieKey: `daily-${activeBlock?.blockNumber ?? 1}-${sequenceNumber}.jpg`,
      blockNumber: activeBlock?.blockNumber ?? 1,
      id: `verification-${participant.visualVerifications.length + 1}`,
      sequenceNumber,
      status: "MATCHED"
    });
  }
  const requested = await repository.requestVideoUpload({
    metadata: {
      mimeType: "video/mp4",
      originalFilename: "video.mp4",
      sizeBytes: 1024
    },
    storage,
    token
  });
  expect(requested.ok).toBe(true);

  const confirmed = await repository.confirmVideoUpload({
    metadata: {
      mimeType: "video/mp4",
      originalFilename: "video.mp4",
      privateStorageKey: requested.ok ? requested.data.privateStorageKey : "",
      sizeBytes: 1024,
      storageBucket: requested.ok ? requested.data.storageBucket : ""
    },
    token
  });

  expect(confirmed.ok).toBe(true);
}

function createFakeHutPrisma() {
  const state = {
    nextId: 1,
    participants: [] as FakeParticipant[],
    study: {
      code: "HUT-TEST",
      id: "study-hut",
      name: "Estudio HUT",
      status: "ACTIVE",
      timeZoneIana: "America/Mexico_City"
    }
  };

  type FakePrisma = {
    [key: string]: unknown;
    $connect: ReturnType<typeof vi.fn>;
    $disconnect: ReturnType<typeof vi.fn>;
    $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
    state: typeof state;
  };

  const prisma: FakePrisma = {
    state,
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    async $transaction<T>(callback: (tx: FakePrisma) => Promise<T>) {
      return callback(prisma);
    },
    study: {
      async findUnique(args: { where: { id: string } }) {
        return args.where.id === state.study.id ? state.study : null;
      }
    },
    hutParticipant: {
      async create(args: { data: Partial<FakeParticipant> }) {
        const participant: FakeParticipant = {
          blocks: [],
          callEvaluations: [],
          currentBlockNumber: Number(args.data.currentBlockNumber ?? 1),
          currentVideoSequence: Number(args.data.currentVideoSequence ?? 1),
          dailyChecks: [],
          email: (args.data.email as string | null) ?? null,
          id: `participant-${state.nextId++}`,
          name: String(args.data.name),
          phone: (args.data.phone as string | null) ?? null,
          recruiter: (args.data.recruiter as string | null) ?? null,
          referenceSelfie: null,
          startDate: (args.data.startDate as Date | null) ?? null,
          status: (args.data.status as FakeParticipant["status"]) ?? "NOT_STARTED",
          study: state.study,
          studyId: String(args.data.studyId),
          token: String(args.data.token),
          visualOverrideEnabled: false,
          visualOverrideReason: null,
          visualVerifications: [],
          videoSubmissions: []
        };
        state.participants.push(participant);
        return { id: participant.id };
      },
      async findFirst(args: { where: { OR?: Array<{ email?: string; phone?: string }>; studyId: string } }) {
        return (
          state.participants.find(
            (participant) =>
              participant.studyId === args.where.studyId &&
              args.where.OR?.some((condition) =>
                condition.email ? condition.email === participant.email : condition.phone === participant.phone
              )
          ) ?? null
        );
      },
      async findMany(args: { where: { studyId: string } }) {
        return state.participants.filter((participant) => participant.studyId === args.where.studyId);
      },
      async findUnique(args: { where: { id?: string; token?: string } }) {
        return state.participants.find((participant) => participant.id === args.where.id || participant.token === args.where.token) ?? null;
      },
      async update(args: { data: Partial<FakeParticipant>; where: { id: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.id);
        if (participant) {
          Object.assign(participant, args.data);
        }
        return participant;
      }
    },
    hutBlock: {
      async create(args: { data: Partial<FakeBlock> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const block: FakeBlock = {
          blockNumber: args.data.blockNumber as 1 | 2,
          disqualificationReason: null,
          id: `block-${state.nextId++}`,
          maxMissedDaysAllowed: Number(args.data.maxMissedDaysAllowed ?? 1),
          missedDaysCount: 0,
          requiredVideos: Number(args.data.requiredVideos ?? 3),
          startDate: (args.data.startDate as Date | null) ?? null,
          status: (args.data.status as FakeBlock["status"]) ?? "NOT_STARTED",
          submittedVideosCount: 0
        };
        participant?.blocks.push(block);
        return block;
      },
      async update(args: { data: Partial<FakeBlock>; where: { id: string } }) {
        const block = state.participants.flatMap((participant) => participant.blocks).find((item) => item.id === args.where.id);
        if (block) {
          Object.assign(block, args.data);
        }
        return block;
      }
    },
    hutReferenceSelfie: {
      async create(args: { data: Partial<FakeReferenceSelfie> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const selfie = {
          capturedAt: (args.data.capturedAt as Date) ?? new Date(),
          id: `reference-${state.nextId++}`,
          privateStorageKey: String(args.data.privateStorageKey),
          storageBucket: String(args.data.storageBucket)
        };
        if (participant) {
          participant.referenceSelfie = selfie;
        }
        return selfie;
      },
      async findFirst(args: { where: { participantId: string } }) {
        return state.participants.find((item) => item.id === args.where.participantId)?.referenceSelfie ?? null;
      },
      async update(args: { data: Partial<FakeReferenceSelfie>; where: { id: string } }) {
        const participant = state.participants.find((item) => item.referenceSelfie?.id === args.where.id);
        if (participant?.referenceSelfie) {
          Object.assign(participant.referenceSelfie, args.data);
        }
        return participant?.referenceSelfie ?? null;
      }
    },
    hutCallEvaluation: {
      async create(args: { data: Partial<FakeCall> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const call: FakeCall = {
          blockNumber: args.data.blockNumber as 1 | 2,
          completedAt: null,
          status: (args.data.status as FakeCall["status"]) ?? "PENDING"
        };
        participant?.callEvaluations.push(call);
        return call;
      },
      async update(args: { data: Partial<FakeCall>; where: { participantId_blockNumber: { blockNumber: number; participantId: string } } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId_blockNumber.participantId);
        const call = participant?.callEvaluations.find((item) => item.blockNumber === args.where.participantId_blockNumber.blockNumber);
        if (call) {
          Object.assign(call, args.data);
        }
        return call;
      }
    },
    hutDailyCheck: {
      async create(args: { data: FakeDailyCheck }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        participant?.dailyChecks.push(args.data);
        return args.data;
      }
    },
    hutVideoSubmission: {
      async create(args: { data: FakeVideo }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const video = { ...args.data, id: `video-${state.nextId++}` };
        participant?.videoSubmissions.push(video);
        return video;
      }
    },
    hutVisualVerification: {
      async create(args: { data: Partial<FakeVisualVerification> & { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const verification: FakeVisualVerification = {
          attemptSelfieKey: String(args.data.attemptSelfieKey),
          blockNumber: Number(args.data.blockNumber),
          id: `verification-${state.nextId++}`,
          sequenceNumber: Number(args.data.sequenceNumber),
          status: args.data.status as FakeVisualVerification["status"]
        };
        participant?.visualVerifications.unshift(verification);
        return verification;
      },
      async update(args: { data: { videoSubmissionId?: string }; where: { id: string } }) {
        const verification = state.participants.flatMap((item) => item.visualVerifications).find((item) => item.id === args.where.id);
        if (verification) {
          Object.assign(verification, args.data);
        }
        return verification;
      }
    }
  };

  const storage: HutStorageClient = {
    createSignedReadUrl: vi.fn(async () => "https://storage.example/reference-selfie.jpg"),
    createSignedUploadUrl: vi.fn(async (input) => ({
      signedUrl: `https://storage.example/${input.privateStorageKey}`,
      token: "signed-token"
    }))
  };

  return { prisma, storage };
}

type FakeParticipant = {
  blocks: FakeBlock[];
  callEvaluations: FakeCall[];
  currentBlockNumber: number;
  currentVideoSequence: number;
  dailyChecks: FakeDailyCheck[];
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
  recruiter: string | null;
  referenceSelfie: FakeReferenceSelfie | null;
  startDate: Date | null;
  status:
    | "NOT_STARTED"
    | "BLOCK_1_IN_PROGRESS"
    | "BLOCK_1_CALL_PENDING"
    | "BLOCK_2_IN_PROGRESS"
    | "BLOCK_2_CALL_PENDING"
    | "COMPLETED"
    | "DISQUALIFIED";
  study: {
    code: string;
    id: string;
    name: string;
    status: string;
    timeZoneIana: string;
  };
  studyId: string;
  token: string;
  visualOverrideEnabled: boolean;
  visualOverrideReason: string | null;
  visualVerifications: FakeVisualVerification[];
  videoSubmissions: Array<FakeVideo & { id?: string }>;
};

type FakeReferenceSelfie = {
  capturedAt: Date;
  id: string;
  privateStorageKey: string;
  storageBucket: string;
};

type FakeBlock = {
  blockNumber: 1 | 2;
  disqualificationReason: string | null;
  id: string;
  maxMissedDaysAllowed: number;
  missedDaysCount: number;
  requiredVideos: number;
  startDate: Date | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "CALL_PENDING" | "COMPLETED" | "DISQUALIFIED";
  submittedVideosCount: number;
};

type FakeCall = {
  blockNumber: 1 | 2;
  completedAt: Date | null;
  status: "PENDING" | "SCHEDULED" | "COMPLETED" | "NO_ANSWER" | "RESCHEDULE_NEEDED";
};

type FakeDailyCheck = {
  blockDayNumber: number;
  blockId: string;
  blockNumber: number;
  date: Date;
  expectedVideoSequence: number;
  participantId: string;
  reminderSentAt?: Date | null;
  status: string;
};

type FakeVideo = {
  blockId: string;
  blockNumber: number;
  extension: string;
  mimeType: string;
  originalFilename: string;
  participantId: string;
  privateStorageKey: string;
  sequenceNumber: number;
  sizeBytes: number;
  storageBucket: string;
};

type FakeVisualVerification = {
  attemptSelfieKey: string;
  blockNumber: number;
  id: string;
  sequenceNumber: number;
  status: "MATCHED" | "NOT_MATCHED" | "NOT_REQUIRED_BY_OVERRIDE" | "PENDING" | "PENDING_REVIEW" | "UNCERTAIN";
  videoSubmissionId?: string;
};

function videoMetadata() {
  return {
    mimeType: "video/mp4",
    originalFilename: "video.mp4",
    sizeBytes: 1024
  };
}

function selfieMetadata() {
  return {
    mimeType: "image/jpeg",
    originalFilename: "selfie.jpg",
    sizeBytes: 1024
  };
}

function referenceSelfie(): FakeReferenceSelfie {
  return {
    capturedAt: new Date("2026-07-01T12:00:00.000Z"),
    id: "reference-selfie",
    privateStorageKey: "studies/study-hut/hut-participants/participant-1/reference-selfie/base.jpg",
    storageBucket: "participant-evidence"
  };
}

function faceResult(status: "MATCH" | "NO_MATCH" | "UNCERTAIN", score: number) {
  return {
    evaluatedAt: new Date("2026-07-01T12:00:00.000Z").toISOString(),
    method: "@vladmandic/human:faceres+blazeface:v1",
    score,
    status
  };
}
