import { NAVIGO_ACTIVITY_CODES, createNavigoScheduleSeeds } from "@/modules/navigo-app";

export type SimulationClock = {
  applicationStart: Date;
  now: () => Date;
};

export type SimulationActivitySchedulePreview = {
  activityCode: (typeof NAVIGO_ACTIVITY_CODES)[number];
  expectedAt: Date;
  offsetMinutes: number;
};

export function createFixedSimulationClock(applicationStart: Date): SimulationClock {
  const fixed = new Date(applicationStart);

  return {
    applicationStart: fixed,
    now: () => new Date(fixed)
  };
}

export function createDefaultNavigoHommeSimulationClock(): SimulationClock {
  return createFixedSimulationClock(new Date("2026-08-07T14:00:00.000Z"));
}

export function previewNavigoActivitySchedule(clock: SimulationClock): SimulationActivitySchedulePreview[] {
  return createNavigoScheduleSeeds("simulation-questionnaire-version").map((seed) => ({
    activityCode: seed.code,
    expectedAt: new Date(clock.applicationStart.getTime() + seed.offsetMinutes * 60_000),
    offsetMinutes: seed.offsetMinutes
  }));
}
