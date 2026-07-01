import { describe, expect, it, vi } from "vitest";
import {
  applyHutMissedDay,
  applyHutVideoSubmission,
  buildHutTsv,
  createHutRepository,
  getHutCurrentAvailability,
  hutBlockDayAvailableAt,
  nextHutVideoSequence,
  parseHutParticipantImportText,
  parseHutRegistrationSlotImportText
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

  it("creates a HUT registration folio with rotation and registration link", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    const result = await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-001",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.link : "").toContain("https://example.com/hut/register/");
    expect(prisma.state.registrationSlots[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-001",
      secondFragranceRightArm: "FRAGANCIA B",
      status: "AVAILABLE"
    });
  });

  it("registers a participant from folio link and stores reference selfie", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-002",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });
    const registered = await repository.completeRegistration({
      email: "ana@example.com",
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana Participante",
      phone: "55 1234 5678",
      recruiter: "Gaby",
      requestOrigin: "https://example.com",
      token
    });

    expect(registered.ok).toBe(true);
    expect(prisma.state.registrationSlots[0]?.status).toBe("REGISTERED");
    expect(prisma.state.participants[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-002",
      name: "ANA PARTICIPANTE",
      phone: "5512345678",
      secondFragranceRightArm: "FRAGANCIA B",
      status: "BLOCK_1_IN_PROGRESS"
    });
    expect(prisma.state.participants[0]?.referenceSelfie?.privateStorageKey).toContain("/hut-registration-slots/");
    expect(registered.ok ? registered.data.participantLink : "").toContain("/hut/p/");
  });

  it("does not allow registering the same HUT folio twice", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-003",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });
    await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      token
    });
    const second = await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Otra Persona",
      phone: "5587654321",
      requestOrigin: "https://example.com",
      token
    });

    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.message).toBe("Este folio ya fue registrado.");
    expect(prisma.state.participants).toHaveLength(1);
  });

  it("assigns an available HUT slot to an admin-created participant", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Admin",
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-010",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    const slot = prisma.state.registrationSlots[0]!;
    const assigned = await repository.assignParticipantRotation({
      participantId: participant.id,
      slotId: slot.id,
      studyId: "study-hut"
    });

    expect(assigned.ok).toBe(true);
    expect(participant).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-010",
      secondFragranceRightArm: "FRAGANCIA B"
    });
    expect(slot).toMatchObject({
      participantId: participant.id,
      status: "REGISTERED"
    });
  });

  it("creates an admin participant directly with an available HUT slot", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-014",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const slot = prisma.state.registrationSlots[0]!;
    const created = await repository.createParticipant({
      name: "Participante Con Slot",
      requestOrigin: "https://example.com",
      slotId: slot.id,
      studyId: "study-hut"
    });

    expect(created.ok).toBe(true);
    expect(prisma.state.participants[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-014",
      secondFragranceRightArm: "FRAGANCIA B"
    });
    expect(slot).toMatchObject({
      participantId: prisma.state.participants[0]?.id,
      status: "REGISTERED"
    });
  });

  it("blocks assigning a slot already assigned to another participant", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({ name: "Uno", requestOrigin: "https://example.com", studyId: "study-hut" });
    await repository.createParticipant({ name: "Dos", requestOrigin: "https://example.com", studyId: "study-hut" });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-011",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const slot = prisma.state.registrationSlots[0]!;
    await repository.assignParticipantRotation({
      participantId: prisma.state.participants[0]!.id,
      slotId: slot.id,
      studyId: "study-hut"
    });
    const second = await repository.assignParticipantRotation({
      participantId: prisma.state.participants[1]!.id,
      slotId: slot.id,
      studyId: "study-hut"
    });

    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.message).toBe("Este folio ya fue registrado.");
  });

  it("shows participant portal link when a HUT registration slot was assigned from admin", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({ name: "Uno", requestOrigin: "https://example.com", studyId: "study-hut" });
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-015",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    await repository.assignParticipantRotation({
      participantId: prisma.state.participants[0]?.id ?? "",
      slotId: prisma.state.registrationSlots[0]?.id ?? "",
      studyId: "study-hut"
    });
    const view = await repository.getRegistrationView(
      prisma.state.registrationSlots[0]?.registrationToken ?? "",
      "https://example.com"
    );

    expect(view.ok).toBe(true);
    expect(view.ok ? view.data.status : "").toBe("REGISTERED");
    expect(view.ok ? view.data.participantLink : "").toContain("https://example.com/hut/p/");
  });

  it("does not allow duplicate manual HUT folio in the same study", async () => {
    const { prisma } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-012",
      name: "Uno",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const duplicate = await repository.createParticipant({
      firstFragranceLeftArm: "Fragancia C",
      folio: "HUT-012",
      name: "Dos",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia D",
      studyId: "study-hut"
    });

    expect(duplicate.ok).toBe(false);
    expect(duplicate.ok ? "" : duplicate.message).toBe("Ya existe un participante HUT con ese folio.");
    expect(prisma.state.participants).toHaveLength(1);
  });

  it("deletes a HUT participant with related records and releases its slot", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-013",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    const token = prisma.state.registrationSlots[0]?.registrationToken ?? "";
    const signed = await repository.requestRegistrationSelfieUpload({ metadata: selfieMetadata(), storage, token });
    await repository.completeRegistration({
      metadata: {
        ...selfieMetadata(),
        privateStorageKey: signed.ok ? signed.data.privateStorageKey : "",
        storageBucket: signed.ok ? signed.data.storageBucket : ""
      },
      name: "Ana",
      phone: "5512345678",
      requestOrigin: "https://example.com",
      token
    });
    const participant = prisma.state.participants[0]!;
    participant.visualVerifications.push({
      attemptSelfieKey: "daily.jpg",
      blockNumber: 1,
      id: "verification-extra",
      sequenceNumber: 1,
      status: "MATCHED"
    });
    participant.videoSubmissions.push({
      blockId: participant.blocks[0]!.id,
      blockNumber: 1,
      extension: "mp4",
      mimeType: "video/mp4",
      originalFilename: "video.mp4",
      participantId: participant.id,
      privateStorageKey: "video.mp4",
      sequenceNumber: 1,
      sizeBytes: 1024,
      storageBucket: "participant-evidence"
    });
    participant.dailyChecks.push({
      blockDayNumber: 1,
      blockId: participant.blocks[0]!.id,
      blockNumber: 1,
      date: new Date(),
      expectedVideoSequence: 1,
      participantId: participant.id,
      status: "COMPLETED"
    });
    const deleted = await repository.deleteParticipant({
      confirmation: "ELIMINAR PARTICIPANTE HUT",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(deleted.ok).toBe(true);
    expect(prisma.state.participants).toHaveLength(0);
    expect(prisma.state.registrationSlots[0]).toMatchObject({
      participantId: null,
      registeredAt: null,
      status: "AVAILABLE"
    });
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

  it("test mode ignores the 5 a.m. availability wait without affecting normal participants", () => {
    const blockInput = {
      ...block({ submittedVideosCount: 1 }),
      startDate: new Date("2026-07-01T06:00:00.000Z")
    };
    const normalAvailability = getHutCurrentAvailability({
      block: blockInput,
      dailyChecks: [{ blockDayNumber: 1 }],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T11:30:00.000Z"),
      timeZoneIana: "America/Mexico_City"
    });
    const testModeAvailability = getHutCurrentAvailability({
      block: blockInput,
      dailyChecks: [{ blockDayNumber: 1 }],
      hasReferenceSelfie: true,
      hasVisualOverride: false,
      now: new Date("2026-07-01T11:30:00.000Z"),
      testMode: true,
      timeZoneIana: "America/Mexico_City"
    });

    expect(normalAvailability.reason).toBe("WAIT_UNTIL_5_AM");
    expect(testModeAvailability.reason).toBe("AVAILABLE_FOR_SELFIE");
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

  it("persists participant test mode and allows consecutive uploads without calendar waits", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Prueba",
      requestOrigin: "https://example.com",
      startDate: new Date("2026-07-01T06:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    const enabled = await repository.setTestMode({
      enabled: true,
      participantId: participant.id,
      studyId: "study-hut"
    });

    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    expect(enabled.ok).toBe(true);
    expect(participant.testMode).toBe(true);
    expect(participant.videoSubmissions).toHaveLength(2);
    expect(participant.currentVideoSequence).toBe(3);
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

  it("shows submitted videos in the admin dashboard with signed links", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Video",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    const dashboard = await repository.getAdminDashboard({
      requestOrigin: "https://example.com",
      storage,
      studyId: "study-hut"
    });

    expect(dashboard?.participants[0]?.block1?.videos).toHaveLength(3);
    expect(dashboard?.participants[0]?.block1?.videos[0]).toMatchObject({
      sequenceNumber: 1,
      signedUrl: expect.stringContaining("https://storage.example/")
    });
    expect(dashboard?.participants[0]?.block1?.videos[1]).toMatchObject({
      sequenceNumber: 2,
      signedUrl: null
    });
  });

  it("resets a reference selfie without deleting the HUT participant", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Selfie",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    participant.referenceSelfie = referenceSelfie();
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    const reset = await repository.resetReferenceSelfie({
      confirmation: "ELIMINAR SELFIE DE REGISTRO",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(reset.ok).toBe(true);
    expect(prisma.state.participants).toHaveLength(1);
    expect(participant.referenceSelfie).toBeNull();
    expect(participant.visualVerifications).toHaveLength(0);
  });

  it("resets a submitted video and recalculates the next expected sequence", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Reset",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;

    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    const reset = await repository.resetVideoSubmission({
      blockNumber: 1,
      confirmation: "RESTABLECER VIDEO 2",
      participantId: participant.id,
      sequenceNumber: 2,
      studyId: "study-hut"
    });

    expect(reset.ok).toBe(true);
    expect(participant.videoSubmissions.map((video) => video.sequenceNumber)).toEqual([1]);
    expect(participant.visualVerifications.map((verification) => verification.sequenceNumber)).toEqual([1]);
    expect(participant.blocks[0]?.submittedVideosCount).toBe(1);
    expect(participant.currentVideoSequence).toBe(2);
  });

  it("requires special confirmation when resetting a video after call evaluation was completed", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Evaluado",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant.id, studyId: "study-hut" });

    const blocked = await repository.resetVideoSubmission({
      blockNumber: 1,
      confirmation: "RESTABLECER VIDEO 3",
      participantId: participant.id,
      sequenceNumber: 3,
      studyId: "study-hut"
    });
    const allowed = await repository.resetVideoSubmission({
      blockNumber: 1,
      confirmation: "RESTABLECER VIDEO 3 CON EVALUACION",
      participantId: participant.id,
      sequenceNumber: 3,
      studyId: "study-hut"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toContain("evaluacion 1 ya esta completada");
    expect(allowed.ok).toBe(true);
    expect(participant.videoSubmissions.map((video) => video.sequenceNumber)).toEqual([1, 2]);
    expect(participant.callEvaluations[0]?.status).toBe("PENDING");
    expect(participant.blocks[0]?.status).toBe("IN_PROGRESS");
  });

  it("blocks resetting evaluation 1 when block 2 has progress unless special confirmation is provided", async () => {
    const { prisma, storage } = createFakeHutPrisma();
    const repository = createHutRepository(prisma as never);
    await repository.createParticipant({
      name: "Participante Bloque 2",
      requestOrigin: "https://example.com",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      studyId: "study-hut"
    });
    const participant = prisma.state.participants[0]!;
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await uploadNextVideo(repository, participant.token, storage, prisma.state);
    await repository.completeCallEvaluation({ blockNumber: 1, participantId: participant.id, studyId: "study-hut" });
    await repository.startBlock({
      blockNumber: 2,
      participantId: participant.id,
      startDate: new Date("2020-01-05T00:00:00.000Z"),
      studyId: "study-hut"
    });
    await uploadNextVideo(repository, participant.token, storage, prisma.state);

    const blocked = await repository.resetCallEvaluation({
      blockNumber: 1,
      confirmation: "RESTABLECER EVALUACION 1",
      participantId: participant.id,
      studyId: "study-hut"
    });
    const allowed = await repository.resetCallEvaluation({
      blockNumber: 1,
      confirmation: "RESTABLECER EVALUACION 1 CON BLOQUE 2",
      participantId: participant.id,
      studyId: "study-hut"
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.message).toContain("El bloque 2 ya tiene avance");
    expect(allowed.ok).toBe(true);
    expect(participant.callEvaluations[0]?.status).toBe("PENDING");
    expect(participant.status).toBe("BLOCK_1_CALL_PENDING");
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
    await repository.createRegistrationSlot({
      firstFragranceLeftArm: "Fragancia A",
      folio: "HUT-004",
      requestOrigin: "https://example.com",
      secondFragranceRightArm: "Fragancia B",
      studyId: "study-hut"
    });
    await repository.assignParticipantRotation({
      participantId: prisma.state.participants[0]?.id ?? "",
      slotId: prisma.state.registrationSlots[0]?.id ?? "",
      studyId: "study-hut"
    });

    const result = await repository.exportProgress({
      now: new Date("2026-07-01T00:00:00.000Z"),
      requestOrigin: "https://example.com",
      studyId: "study-hut"
    });

    expect(result.ok ? result.data.filename : "").toBe("HUT-TEST_hut_avance_2026-07-01.tsv");
    expect(result.ok ? result.data.body : "").toContain("ID\tFolio\tNombre\tCelular\tCorreo\tReclutador");
    expect(result.ok ? result.data.body : "").toContain("PARTICIPANTE CON Ñ");
    expect(result.ok ? result.data.body : "").toContain("Folio\tLink de registro\tLink participante\tEstado");
    expect(result.ok ? result.data.body : "").toContain("HUT-004\thttps://example.com/hut/register/");
    expect(result.ok ? result.data.body : "").toContain("https://example.com/hut/p/");
    expect(result.ok ? result.data.body : "").toContain("FRAGANCIA A\tFRAGANCIA B");
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

  it("parses HUT registration folios with rotation", () => {
    const rows = parseHutRegistrationSlotImportText(
      "folio\tprimera fragancia / brazo izquierdo\tsegunda fragancia / brazo derecho\nHUT-005\tFragancia A\tFragancia B"
    );

    expect(rows[0]).toMatchObject({
      firstFragranceLeftArm: "FRAGANCIA A",
      folio: "HUT-005",
      secondFragranceRightArm: "FRAGANCIA B"
    });
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
    registrationSlots: [] as FakeRegistrationSlot[],
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
          firstFragranceLeftArm: (args.data.firstFragranceLeftArm as string | null) ?? null,
          folio: (args.data.folio as string | null) ?? null,
          id: `participant-${state.nextId++}`,
          name: String(args.data.name),
          phone: (args.data.phone as string | null) ?? null,
          recruiter: (args.data.recruiter as string | null) ?? null,
          referenceSelfie: null,
          registrationSlot: null,
          secondFragranceRightArm: (args.data.secondFragranceRightArm as string | null) ?? null,
          startDate: (args.data.startDate as Date | null) ?? null,
          status: (args.data.status as FakeParticipant["status"]) ?? "NOT_STARTED",
          study: state.study,
          studyId: String(args.data.studyId),
          testMode: Boolean(args.data.testMode ?? false),
          token: String(args.data.token),
          visualOverrideEnabled: false,
          visualOverrideReason: null,
          visualVerifications: [],
          videoSubmissions: []
        };
        state.participants.push(participant);
        return { id: participant.id };
      },
      async findFirst(args: { where: { OR?: Array<{ email?: string; phone?: string }>; folio?: string; studyId: string } }) {
        if (args.where.folio) {
          return (
            state.participants.find(
              (participant) => participant.studyId === args.where.studyId && participant.folio === args.where.folio
            ) ?? null
          );
        }
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
      },
      async delete(args: { where: { id: string } }) {
        const index = state.participants.findIndex((item) => item.id === args.where.id);
        if (index >= 0) {
          const [deleted] = state.participants.splice(index, 1);
          return deleted;
        }
        return null;
      }
    },
    hutRegistrationSlot: {
      async create(args: { data: Partial<FakeRegistrationSlot> }) {
        const slot: FakeRegistrationSlot = {
          firstFragranceLeftArm: String(args.data.firstFragranceLeftArm),
          folio: String(args.data.folio),
          id: `slot-${state.nextId++}`,
          participantId: null,
          registeredAt: null,
          registrationToken: String(args.data.registrationToken),
          secondFragranceRightArm: String(args.data.secondFragranceRightArm),
          status: (args.data.status as FakeRegistrationSlot["status"]) ?? "AVAILABLE",
          study: state.study,
          studyId: String(args.data.studyId)
        };
        state.registrationSlots.push(slot);
        return { id: slot.id };
      },
      async findFirst(args: { where: { folio?: string; studyId: string } }) {
        const slot =
          state.registrationSlots.find((item) => item.studyId === args.where.studyId && item.folio === args.where.folio) ?? null;
        return slot ? slotWithParticipant(slot, state.participants) : null;
      },
      async findMany(args: { where: { studyId: string } }) {
        return state.registrationSlots
          .filter((slot) => slot.studyId === args.where.studyId)
          .map((slot) => slotWithParticipant(slot, state.participants));
      },
      async findUnique(args: { where: { registrationToken?: string } }) {
        const slot =
          state.registrationSlots.find(
            (item) =>
              (args.where.registrationToken && item.registrationToken === args.where.registrationToken) ||
              ("id" in args.where && item.id === (args.where as { id?: string }).id)
          ) ?? null;
        return slot ? slotWithParticipant(slot, state.participants) : null;
      },
      async update(args: { data: Partial<FakeRegistrationSlot>; where: { id: string } }) {
        const slot = state.registrationSlots.find((item) => item.id === args.where.id);
        if (slot) {
          Object.assign(slot, args.data);
          const participant = state.participants.find((item) => item.id === slot.participantId);
          if (participant) {
            participant.registrationSlot = slot;
          }
        }
        return slot ? slotWithParticipant(slot, state.participants) : null;
      },
      async updateMany(args: { data: Partial<FakeRegistrationSlot>; where: { participantId: string } }) {
        const slots = state.registrationSlots.filter((item) => item.participantId === args.where.participantId);
        slots.forEach((slot) => Object.assign(slot, args.data));
        return { count: slots.length };
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
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const count = participant?.blocks.length ?? 0;
        if (participant) {
          participant.blocks = [];
        }
        return { count };
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
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const count = participant?.referenceSelfie ? 1 : 0;
        if (participant) {
          participant.referenceSelfie = null;
        }
        return { count };
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
      },
      async deleteMany(args: { where: { participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const count = participant?.callEvaluations.length ?? 0;
        if (participant) {
          participant.callEvaluations = [];
        }
        return { count };
      }
    },
    hutDailyCheck: {
      async create(args: { data: FakeDailyCheck }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        participant?.dailyChecks.push(args.data);
        return args.data;
      },
      async deleteMany(args: { where: { blockId?: string; expectedVideoSequence?: { gte: number }; participantId: string } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.dailyChecks.length ?? 0;
        if (participant) {
          participant.dailyChecks = participant.dailyChecks.filter((check) => {
            if (args.where.blockId && check.blockId !== args.where.blockId) {
              return true;
            }
            if (args.where.expectedVideoSequence && check.expectedVideoSequence < args.where.expectedVideoSequence.gte) {
              return true;
            }
            return false;
          });
        }
        return { count: before - (participant?.dailyChecks.length ?? 0) };
      }
    },
    hutVideoSubmission: {
      async create(args: { data: FakeVideo }) {
        const participant = state.participants.find((item) => item.id === args.data.participantId);
        const video = { ...args.data, id: `video-${state.nextId++}` };
        participant?.videoSubmissions.push(video);
        return video;
      },
      async deleteMany(args: { where: { blockNumber?: number; participantId: string; sequenceNumber?: { gte: number } } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.videoSubmissions.length ?? 0;
        if (participant) {
          participant.videoSubmissions = participant.videoSubmissions.filter((video) => {
            if (args.where.blockNumber && video.blockNumber !== args.where.blockNumber) {
              return true;
            }
            if (args.where.sequenceNumber && video.sequenceNumber < args.where.sequenceNumber.gte) {
              return true;
            }
            return false;
          });
        }
        return { count: before - (participant?.videoSubmissions.length ?? 0) };
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
      },
      async deleteMany(args: { where: { blockNumber?: number; participantId: string; sequenceNumber?: { gte: number } } }) {
        const participant = state.participants.find((item) => item.id === args.where.participantId);
        const before = participant?.visualVerifications.length ?? 0;
        if (participant) {
          participant.visualVerifications = participant.visualVerifications.filter((verification) => {
            if (args.where.blockNumber && verification.blockNumber !== args.where.blockNumber) {
              return true;
            }
            if (args.where.sequenceNumber && verification.sequenceNumber < args.where.sequenceNumber.gte) {
              return true;
            }
            return false;
          });
        }
        return { count: before - (participant?.visualVerifications.length ?? 0) };
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
  firstFragranceLeftArm: string | null;
  folio: string | null;
  id: string;
  name: string;
  phone: string | null;
  recruiter: string | null;
  referenceSelfie: FakeReferenceSelfie | null;
  registrationSlot: FakeRegistrationSlot | null;
  secondFragranceRightArm: string | null;
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
  testMode: boolean;
  token: string;
  visualOverrideEnabled: boolean;
  visualOverrideReason: string | null;
  visualVerifications: FakeVisualVerification[];
  videoSubmissions: Array<FakeVideo & { id?: string }>;
};

type FakeRegistrationSlot = {
  firstFragranceLeftArm: string;
  folio: string;
  id: string;
  participantId: string | null;
  registeredAt: Date | null;
  registrationToken: string;
  secondFragranceRightArm: string;
  status: "AVAILABLE" | "CANCELLED" | "REGISTERED";
  study: {
    code: string;
    id: string;
    name: string;
    status: string;
    timeZoneIana: string;
  };
  studyId: string;
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

function slotWithParticipant(slot: FakeRegistrationSlot, participants: FakeParticipant[]) {
  const participant = participants.find((item) => item.id === slot.participantId) ?? null;

  return {
    ...slot,
    participant: participant
        ? {
            email: participant.email,
            id: participant.id,
            name: participant.name,
            phone: participant.phone,
            referenceSelfie: participant.referenceSelfie,
            token: participant.token
          }
        : null
  };
}
