export function fieldAttemptStatusLabel(status: string): string {
  switch (status) {
    case "PASSED":
      return "Intento elegible";
    case "TERMINATED":
      return "Intento terminado";
    case "PENDING_REVIEW":
      return "Intento pendiente de revisión";
    case "INCOMPLETE":
      return "Intento incompleto";
    case "STARTED":
      return "Intento iniciado";
    default:
      return `Intento ${status}`;
  }
}
