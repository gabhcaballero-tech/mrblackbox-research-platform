import { describe, expect, it } from "vitest";
import {
  createCtlPublicSessionToken,
  readCtlPublicSessionToken
} from "./public-session";

describe("ctl public session", () => {
  it("creates a signed CTL interviewer session scoped to one study", () => {
    const token = createCtlPublicSessionToken({
      ctlInterviewerCodeId: "ctl-code-1",
      now: new Date("2026-08-05T12:00:00.000Z"),
      secret: "test-secret",
      studyCode: "FMASCULINA-NAVIGO-2026"
    });

    expect(readCtlPublicSessionToken({
      now: new Date("2026-08-05T12:01:00.000Z"),
      secret: "test-secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token
    })).toMatchObject({
      ctlInterviewerCodeId: "ctl-code-1",
      studyCode: "FMASCULINA-NAVIGO-2026"
    });
    expect(readCtlPublicSessionToken({
      now: new Date("2026-08-05T12:01:00.000Z"),
      secret: "test-secret",
      studyCode: "OTRO-ESTUDIO",
      token
    })).toBeNull();
    expect(readCtlPublicSessionToken({
      now: new Date("2026-08-06T01:00:01.000Z"),
      secret: "test-secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token
    })).toBeNull();
    expect(readCtlPublicSessionToken({
      now: new Date("2026-08-05T12:01:00.000Z"),
      secret: "test-secret",
      studyCode: "FMASCULINA-NAVIGO-2026",
      token: `${token}tampered`
    })).toBeNull();
  });
});
