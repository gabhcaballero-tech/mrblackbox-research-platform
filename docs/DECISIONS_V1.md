# Decisions V1

Este documento registra decisiones aprobadas para la versión 1. Complementa la propuesta de arquitectura y modelo de datos sin cambiar el stack técnico ya propuesto.

## Roles Y Permisos

### Admin

- Publica o retira cuestionarios.
- Modifica cuotas y rotaciones.
- Ve claves reales de producto y datos personales.
- Puede corregir hora de aplicación cuando ya existan actividades iniciadas o respondidas.
- Puede reabrir actividades vencidas, siempre con auditoría.
- Puede generar exportaciones con PII cuando corresponda.

### Supervisor

- Revisa filtros y avance de participantes.
- Corrige datos operativos.
- Puede regenerar enlaces de participantes.
- Puede reabrir actividades vencidas con auditoría.
- Puede corregir hora de aplicación solo cuando ninguna actividad del participante haya sido iniciada.
- Puede generar exportaciones con PII cuando corresponda.

### Encuestador

- Aplica filtros.
- Registra participantes.
- Registra hora de aplicación.
- Consulta el estatus operativo necesario.
- Registra el código de rotación manual por carátula.
- No puede publicar cuestionarios.
- No puede modificar cuotas.
- No puede alterar rotaciones después de registrarlas.

### Analista

- Exporta información anonimizada.
- No puede ver teléfono, correo, dirección ni otros datos personales identificables.

## Rotación Inicial

La primera versión usará asignación manual mediante carátula o código de rotación registrado por el encuestador.

La asignación automática debe quedar preparada a nivel arquitectura y modelo de datos, pero no se implementará todavía.

## Ventanas De Medición

Las ventanas permitidas serán configurables por estudio y no estarán codificadas de forma fija.

El estudio actual requiere mediciones a:

- 15 minutos.
- 2 horas.
- 4 horas.
- 8 horas.

Las tolerancias exactas se definirán posteriormente por estudio.

## Corrección De Hora De Aplicación

La hora ancla será `applicationStartedAt`.

- Antes de que alguna actividad sea iniciada, Supervisor puede corregirla y el sistema recalcula las actividades pendientes.
- Después de que una actividad sea iniciada o completada, solo Admin puede corregirla.
- Toda corrección debe mantener historial y auditoría.
- Las respuestas ya capturadas nunca deben modificarse silenciosamente.

## Enlaces De Participante

- Son enlaces únicos sin contraseña.
- Deben durar hasta 7 días después de la última actividad programada.
- Pueden abrirse desde más de un dispositivo.
- Al regenerar un enlace, el enlace anterior debe revocarse inmediatamente.
- No deben contener datos personales en la URL.

## Exportaciones Iniciales

La primera versión debe ofrecer exportación en CSV y XLSX.

Debe soportar:

- Formato ancho.
- Formato largo.
- Base de filtros y resultado de screening.
- Seguimiento de participantes y actividades.
- Cuotas y alertas.
- Respuestas.
- Metadatos de rotación.
- Brazo.
- Producto real según permisos.
- Versión de cuestionario.

Admin y Supervisor pueden generar exportaciones con PII cuando corresponda. Analista solo puede exportar información anonimizada.

## Video Futuro

La toma y carga de video no se implementará en la primera versión.

Solo debe conservarse el diseño de datos para:

- Actividades de video una vez al día durante tres días.
- Evidencia privada.
- Consentimiento.
- Revisión futura.
- Retención futura.
