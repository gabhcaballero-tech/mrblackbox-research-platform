import type {
  NavigoHommePrecheckReport,
  SimulationCheck,
  SimulationCheckStatus,
  SimulationReportSection
} from "./types";

const statusRank: Record<SimulationCheckStatus, number> = {
  OK: 0,
  PENDING: 1,
  BLOCKED: 2
};

export function summarizeSimulationChecks(checks: SimulationCheck[]): SimulationCheckStatus {
  return checks.reduce<SimulationCheckStatus>(
    (current, check) => (statusRank[check.status] > statusRank[current] ? check.status : current),
    "OK"
  );
}

export function createSimulationReportSection(
  title: string,
  checks: SimulationCheck[]
): SimulationReportSection {
  return {
    checks,
    status: summarizeSimulationChecks(checks),
    title
  };
}

export function summarizeSimulationSections(sections: SimulationReportSection[]): SimulationCheckStatus {
  return sections.reduce<SimulationCheckStatus>(
    (current, section) => (statusRank[section.status] > statusRank[current] ? section.status : current),
    "OK"
  );
}

export function formatSimulationPrecheckReport(report: NavigoHommePrecheckReport): string {
  const lines = [
    "SIMULACION PRECHECK",
    "",
    `Estudio: ${report.studyCode}`,
    `Modo seguro: ${report.simulationMode ? "SI" : "NO"}`,
    `Estado general: ${formatStatus(report.status)}`,
    ""
  ];

  for (const section of report.sections) {
    lines.push(`${section.title}:`);
    lines.push(formatStatus(section.status));

    for (const check of section.checks) {
      lines.push(`- ${check.label}: ${formatStatus(check.status)}${check.detail ? ` (${check.detail})` : ""}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatStatus(status: SimulationCheckStatus): string {
  switch (status) {
    case "BLOCKED":
      return "BLOQUEADO";
    case "PENDING":
      return "PENDIENTE";
    case "OK":
      return "OK";
  }
}
