# Open Decisions

Este documento conserva solo decisiones que siguen pendientes antes o durante la implementación. Las decisiones aprobadas para V1 están registradas en `docs/DECISIONS_V1.md`.

## Decisiones Resueltas Para V1

- Roles V1: Admin, Supervisor, Encuestador, Analista y Participante.
- Admin publica o retira cuestionarios.
- Admin modifica cuotas y rotaciones.
- Admin ve claves reales de producto y datos personales.
- Admin puede corregir hora de aplicación aunque ya existan actividades iniciadas o respondidas.
- Admin puede reabrir actividades vencidas con auditoría.
- Supervisor revisa filtros y avance de participantes.
- Supervisor corrige datos operativos.
- Supervisor puede regenerar enlaces.
- Supervisor puede reabrir actividades con auditoría.
- Supervisor corrige hora de aplicación solo si ninguna actividad fue iniciada.
- Encuestador aplica filtros, registra participantes, registra hora de aplicación, consulta estatus operativo y registra código de rotación manual.
- Encuestador no publica cuestionarios, no modifica cuotas y no altera rotaciones.
- Analista exporta solo información anonimizada y no ve datos personales identificables.
- Rotación V1: asignación manual mediante carátula o código registrado por el encuestador.
- Asignación automática queda preparada en arquitectura y modelo, pero no se implementa en V1.
- Ventanas de medición configurables por estudio.
- Mediciones iniciales: 15 minutos, 2 horas, 4 horas y 8 horas.
- `applicationStartedAt` es la hora ancla.
- Antes de iniciar actividades, Supervisor puede corregir `applicationStartedAt` y se recalculan actividades pendientes.
- Después de iniciar o completar una actividad, solo Admin puede corregir `applicationStartedAt`.
- Las respuestas capturadas nunca se modifican silenciosamente.
- Enlaces únicos sin contraseña.
- Enlaces válidos hasta 7 días después de la última actividad programada.
- Enlaces permitidos desde más de un dispositivo.
- Al regenerar enlace, el anterior se revoca inmediatamente.
- URL del participante sin datos personales.
- Exportaciones V1 en CSV y XLSX.
- Exportaciones V1 en formato ancho y largo.
- Exportaciones V1 incluyen filtros, screening, seguimiento, cuotas, alertas, respuestas, rotación, brazo, producto real según permisos y versión de cuestionario.
- Admin y Supervisor pueden generar exportaciones con PII cuando corresponda.
- Analista solo exporta información anonimizada.
- Video no se implementa en V1.
- El modelo conserva diseño para actividades de video una vez al día durante tres días, evidencia privada, consentimiento, revisión futura y retención futura.

## Producto Y Operación

1. ¿Qué datos operativos puede corregir Supervisor exactamente, además de enlaces, hora de aplicación bajo condición y reapertura de actividades?
2. ¿Qué campos personales son obligatorios para registrar un participante?
3. ¿Se necesita importar participantes desde archivo en la primera implementación o solo crearlos manualmente?
4. ¿Qué datos personales pueden exportar Admin y Supervisor "cuando corresponda" y bajo qué justificación operativa?

## Cuestionarios Y Biblioteca

1. ¿Qué tipos de matriz se necesitan primero: una escala por atributo, múltiples columnas, ranking u otra variante?
2. ¿Los cálculos deben poder usar solo respuestas del mismo cuestionario o también respuestas de filtros y actividades anteriores?
3. ¿El texto dinámico puede insertar respuestas de actividades previas o solo del cuestionario actual?
4. Cuando Admin retira una versión publicada, ¿debe impedir solo nuevas respuestas o también ocultarla de operación normal?
5. ¿Qué nivel de editor inicial es suficiente: formularios estructurados y plantillas, o una interfaz visual más amplia?

## Estudios Comparativos

1. ¿Cómo se definirán los códigos de rotación iniciales para dos fragancias y dos brazos?
2. ¿La etiqueta visible será siempre "Primera fragancia" y "Segunda fragancia" o debe ser configurable por estudio?
3. Si un encuestador registra un código de rotación equivocado, ¿solo Admin puede corregirlo o Supervisor puede solicitar corrección para aprobación?

## Actividades Y Tiempo

1. ¿Qué tolerancia exacta tendrá cada medición por estudio?
2. Si se corrige `applicationStartedAt`, ¿qué debe pasar con actividades incompletas pero ya iniciadas cuando la corrección la hace Admin?
3. ¿Qué debe ocurrir con una actividad vencida cuando se reabre: conserva hora original, genera una nueva ventana o registra ambas?
4. ¿Los recordatorios serán solo registro interno al inicio o se necesita una cola interna sin envío externo?
5. ¿Un estudio podrá operar en varias zonas horarias o se obliga una sola zona IANA por estudio?

## Aleatorización De Atributos

1. ¿Se aprueba como default usar el mismo orden de atributos para ambas fragancias de un mismo participante?
2. ¿Qué tamaño de grupo debe usarse por defecto, por ejemplo 5 atributos por bloque?
3. ¿Debe permitirse fijar algunos atributos fuera de la aleatorización además de la pregunta final?
4. ¿El orden debe regenerarse si se agrega una nueva versión de cuestionario o mantenerse por participación anterior?

## Participante Y Seguridad

1. ¿Debe limitarse el enlace por IP, dispositivo o navegador, aunque V1 permita múltiples dispositivos?
2. ¿Se requiere registro de uso del token por dispositivo o solo `lastUsedAt`?
3. ¿Qué nivel de anonimización exacto se requiere para exportaciones de Analista?

## Exportaciones

1. ¿Qué columnas exactas debe tener la base de filtros y resultado de screening?
2. ¿Qué columnas exactas debe tener el seguimiento de participantes y actividades?
3. ¿Qué estructura de columnas se usará para respuestas anchas?
4. ¿Qué estructura de columnas se usará para respuestas largas?
5. ¿Qué campos deben excluirse siempre de exportaciones anonimizadas?
6. ¿Supervisor puede exportar producto real o ese dato queda reservado a Admin aunque Supervisor pueda exportar PII cuando corresponda?

## Datos Y Stack Técnico

1. ¿Se aprueba formalmente Next.js + TypeScript estricto + PostgreSQL + Prisma como stack base, manteniendo la propuesta actual sin cambios?
2. ¿Se usará Tailwind CSS y una biblioteca de componentes o se prefiere diseño propio?
3. ¿Dónde vivirá la base de datos en desarrollo y producción?
4. ¿Hay requisitos de hosting, nube o región de datos?
5. ¿Existe una política interna de respaldo, retención o eliminación de datos?

## Video Futuro

1. ¿La evidencia de video será obligatoria para todos los participantes o solo ciertos estudios?
2. ¿La retención futura empieza al subir el video, al completar la actividad o al terminar el estudio?
3. ¿Quién podrá ver evidencia de video?
4. ¿Qué texto o flujo de consentimiento se requerirá antes de grabar o subir video?
5. ¿Se necesitará transcodificación, revisión manual o solo almacenamiento privado temporal?
