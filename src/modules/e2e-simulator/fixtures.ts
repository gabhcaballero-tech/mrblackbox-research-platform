import { NAVIGO_STUDY_CODE } from "@/modules/study-templates/study-behavior";
import type { NavigoHommeSimulationFixtures } from "./types";

export const NAVIGO_HOMME_SIMULATION_STUDY_CODE = NAVIGO_STUDY_CODE;
export const NAVIGO_HOMME_SIMULATION_FOLIO = "SIM-NAV-001";

export const NAVIGO_HOMME_SIMULATION_FIXTURES: NavigoHommeSimulationFixtures = {
  participant: {
    email: "sim-nav-001@example.invalid",
    externalReference: NAVIGO_HOMME_SIMULATION_FOLIO,
    name: "SIM NAVIGO HOMME 001",
    phone: "+520000000001",
    screeningAnswers: {}
  },
  rotations: {
    ctl: {
      folio: NAVIGO_HOMME_SIMULATION_FOLIO,
      primeraFragancia: "247",
      segundaFragancia: "583",
      triangular1Pr1: "247",
      triangular1Pr2: "583",
      triangular1Pr3: "912",
      triangular1Verify: "583",
      triangular2Pr1: "583",
      triangular2Pr2: "247",
      triangular2Pr3: "912",
      triangular2Verify: "247"
    },
    hut: {
      folio: NAVIGO_HOMME_SIMULATION_FOLIO,
      hutEva1: "247",
      hutEva2: "583"
    }
  }
};

export function createNavigoHommeSimulationFixtures(): NavigoHommeSimulationFixtures {
  return {
    participant: {
      ...NAVIGO_HOMME_SIMULATION_FIXTURES.participant,
      screeningAnswers: {
        ...NAVIGO_HOMME_SIMULATION_FIXTURES.participant.screeningAnswers
      }
    },
    rotations: {
      ctl: {
        ...NAVIGO_HOMME_SIMULATION_FIXTURES.rotations.ctl
      },
      hut: {
        ...NAVIGO_HOMME_SIMULATION_FIXTURES.rotations.hut
      }
    }
  };
}
