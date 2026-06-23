# Architecture Proposal

## Resumen

La propuesta sigue siendo una aplicación web responsive como monolito modular con TypeScript estricto. La aplicación tendrá una sola base de código, una sola base de datos principal y módulos internos separados por dominio.

La corrección principal de esta revisión es que una persona no pertenece directamente a un estudio. `ParticipantProfile` representa a la persona; `StudyParticipant` representa su participación específica en un estudio. Tokens, screening, cuotas, rotaciones, actividades, respuestas y exportaciones deben colgar de `StudyParticipant`.

Recomendación técnica inicial:

- Framework web: Next.js con App Router.
- Lenguaje: TypeScript en modo estricto.
- UI: React con componentes compartidos y diseño responsive.
- Estilos: Tailwind CSS o una capa equivalente del sistema de diseño elegido.
- Base de datos: PostgreSQL.
- ORM: Prisma como opción inicial por claridad de esquema, migraciones y productividad.
- Validación: Zod o librería equivalente compartida entre cliente y servidor.
- Pruebas unitarias: Vitest.
- Pruebas end-to-end: Playwright.
- Jobs internos futuros: cola de trabajos para vencimientos, recordatorios y mantenimiento, solo cuando el producto lo necesite.
- Video futuro: almacenamiento privado compatible con objetos, sin URLs públicas y con acceso mediado por permisos.

No se debe instalar nada todavía. Estas tecnologías son una recomendación para aprobación.

## Principios

- Una sola aplicación, no microservicios.
- Separación por módulos de negocio, no por tipo técnico únicamente.
- `ParticipantProfile` no contiene `studyId`.
- `StudyParticipant` es la frontera operativa de una persona dentro de un estudio.
- Reglas críticas en servicios de dominio probables de probar sin UI.
- Cuestionarios publicados como snapshots completos e inmutables.
- Modificar bibliotecas no altera cuestionarios ya publicados.
- Datos personales separados de respuestas de investigación.
- Tokens de participante opacos, revocables y almacenados como hash.
- Rotaciones comparativas modeladas con entidades explícitas, no solo JSON genérico.
- Actividades programadas generales para cuestionarios, video futuro y seguimiento interno.
- Actividades de medición calculadas desde `applicationStartedAt`, registrado por encuestador.
- Zona horaria IANA definida a nivel estudio.
- Exportaciones reproducibles con versión, rotación, brazo, producto real según permisos y etapa operativa.
- Exportaciones V1 disponibles en CSV y XLSX.
- Errores, estados vacíos y carga tratados como parte de cada ruta.

## Módulos Propuestos

### Studies

Responsable de estudios, configuración general, zona horaria, productos, brazos, planes de rotación, ventanas y publicación.

### Participants

Responsable de perfiles personales, participaciones por estudio, estado operativo, separación de PII y vínculo con tokens, screening, actividades y respuestas.

### Participant Access

Responsable de generación, hash, revocación y regeneración de tokens opacos para una participación específica.

### Questionnaire Engine

Responsable de definiciones de cuestionarios, snapshots publicados, renderizado lógico, tipos de pregunta, validaciones, cálculos, condiciones, reglas de terminar y bloques repetibles.

### Question Library

Responsable de preguntas reutilizables, opciones, escalas, atributos, plantillas y revisiones futuras. Las revisiones de biblioteca nunca modifican versiones publicadas.

### Screening

Responsable de filtros, reglas de continuar/terminar, cálculo de NSE, clasificación por rangos, estatus del filtro y trazabilidad del encuestador.

### Quotas

Responsable de definición, conteo por etapa, evaluación y advertencias de cuotas. Una cuota llena genera aviso, pero no bloquea la entrevista.

### Comparative Rotation

Responsable de asignar y registrar código de rotación, brazo izquierdo, brazo derecho, producto por brazo, orden de aplicación, etiqueta visible y modo de asignación.

En V1 se implementa solo asignación manual mediante carátula o código de rotación registrado por el encuestador. La asignación automática queda preparada en arquitectura y modelo de datos, pero no se implementa todavía.

### Activities

Responsable de programar y ejecutar actividades por participación: mediciones con cuestionario, evidencia de video futura y recordatorios o seguimiento interno.

### Responses

Responsable de respuestas de investigación, avances guardados, validación contra snapshot publicado y exportación.

### Randomization

Responsable de aleatorización estable de productos, brazos y atributos. Para atributos debe guardar el orden por participación, versión de cuestionario, instancia de bloque y contexto comparativo.

### Exports

Responsable de preparar archivos exportables de filtros, screening, seguimiento, cuotas, respuestas anchas, respuestas largas, rotación, brazo, producto real según permisos y versión de cuestionario.

### Audit

Responsable de registrar cambios relevantes con actor, entidad, valores anteriores y posteriores.

### Future Media Evidence

Responsable futuro de metadatos de evidencia de video como actividad programada. En la primera implementación solo debe existir como diseño de datos, permisos, consentimiento, revisión futura y retención futura, sin carga, cámara ni almacenamiento.

## Estructura De Código Sugerida

```text
src/
  app/
    (admin)/
    (field)/
    p/
    api/
  modules/
    activities/
    audit/
    comparative-rotation/
    exports/
    participant-access/
    participants/
    question-library/
    questionnaire-engine/
    quotas/
    randomization/
    responses/
    screening/
    studies/
    media-evidence/
  shared/
    auth/
    db/
    errors/
    validation/
    ui/
```

La carpeta `app` define rutas y composición de UI. La carpeta `modules` contiene reglas de negocio, tipos, servicios y pruebas de cada dominio. La carpeta `shared` contiene infraestructura común sin depender de un módulo específico.

## Entidad Pivote De Participación

`StudyParticipant` debe ser la entidad operativa central:

- Une `ParticipantProfile` con `Study`.
- Guarda estado operativo dentro del estudio.
- Recibe el enlace único del participante.
- Recibe screening, cuotas, rotaciones, actividades, respuestas y exportaciones.
- Permite que una misma persona participe en más de un estudio sin mezclar datos operativos.

`ParticipantProfile` queda reservado para datos personales y deduplicación potencial.

## Rotación Comparativa

La primera versión debe resolver comparativas de dos fragancias y dos brazos, pero sin cerrar la puerta a más productos después.

El modelo recomendado usa:

- `RotationPlan`: define planes/códigos posibles para un estudio.
- `RotationPlanArm`: define, dentro del plan, qué producto va en cada brazo y en qué orden.
- `ParticipantRotationAssignment`: registra la rotación asignada a una participación.
- `ParticipantArmAssignment`: registra producto, brazo, etiqueta visible y orden de aplicación para esa participación.

La asignación debe guardar:

- Código de rotación.
- Producto asignado al brazo izquierdo.
- Producto asignado al brazo derecho.
- Orden de aplicación.
- Etiqueta visible para participante.
- Clave real visible solo a roles autorizados.
- Modo de asignación: manual mediante carátula/código de rotación en V1.
- Modo automático preparado para una fase futura.

## Actividades Programadas

Las mediciones y futuras evidencias no deben depender de una entidad limitada a "sesión". La propuesta usa:

- `ActivitySchedule`: definición de actividad dentro del estudio.
- `ParticipantActivity`: instancia programada para una participación.

Tipos iniciales:

- `questionnaire_measurement`: cuestionario o medición.
- `video_evidence`: evidencia de video futura.
- `internal_followup`: recordatorio o seguimiento interno.

Las mediciones actuales son actividades de cuestionario a 15, 120, 240 y 480 minutos desde la hora de aplicación. Las ventanas permitidas son configurables por estudio y no deben estar codificadas de forma fija. La evidencia futura serán videos de aplicación una vez al día durante tres días, sin implementar todavía cámara, carga ni almacenamiento.

## Hora Ancla De Medición

Las actividades de medición se calculan desde `applicationStartedAt`, registrada por el encuestador en la participación.

Reglas:

- `Study` define `timeZoneIana`.
- `StudyParticipant` guarda la hora de aplicación vigente.
- Se guarda quién registró la hora y cuándo.
- Antes de que alguna actividad sea iniciada, Supervisor puede corregir la hora y el sistema recalcula las actividades pendientes.
- Después de que una actividad sea iniciada o completada, solo Admin puede corregir la hora.
- Toda corrección debe auditar valor anterior, valor nuevo, motivo y usuario.
- Las respuestas ya capturadas nunca deben modificarse silenciosamente.

## Aleatorización De Atributos

El orden de atributos debe guardarse con una llave suficientemente específica:

- Participación del participante.
- Versión del cuestionario.
- Instancia del bloque.
- Contexto comparativo: producto o brazo.

La configuración del bloque debe permitir:

- Orden compartido entre ambas fragancias del mismo participante.
- Orden independiente por producto o fragancia.

Recomendación inicial: usar el mismo orden para ambas fragancias de un mismo participante, porque facilita la comparación individual. La opción debe quedar configurable.

La pregunta final fija "¿Hay algún otro atributo que describa esta fragancia?" queda fuera de la aleatorización, es Sí / No y abre texto obligatorio si se responde Sí.

## Motor De Cuestionarios

El motor debe tratar los cuestionarios publicados como snapshots inmutables. Al publicar, se crea una versión congelada con preguntas, opciones, escalas, atributos, reglas, cálculos, textos dinámicos, bloques repetibles y metadatos de validación.

Flujo recomendado:

1. El administrador edita un borrador.
2. El sistema valida estructura, referencias y reglas.
3. Al publicar, se crea `QuestionnaireVersion`.
4. Las entrevistas y respuestas apuntan siempre a esa versión.
5. Cambios posteriores generan una nueva versión, no modifican la publicada.

Las bibliotecas deben tener revisiones o versiones propias para uso futuro. Un cambio en una pregunta, escala, atributo o plantilla de biblioteca nunca debe alterar un cuestionario ya publicado.

## Tokens De Participante

Los enlaces de participante deben usar tokens opacos asociados a `StudyParticipant`:

- La URL contiene solo un token aleatorio.
- La base de datos guarda hash del token, no el token plano.
- El token dura hasta 7 días después de la última actividad programada.
- El enlace puede abrirse desde más de un dispositivo.
- El token se puede revocar o regenerar con auditoría.
- Al regenerar un enlace, el enlace anterior debe revocarse inmediatamente.
- El token no contiene nombre, correo, teléfono, ciudad, NSE ni identificadores legibles.
- La ruta participante resuelve permisos por token y participación específica.

## Exportaciones Iniciales

Las exportaciones iniciales deben incluir:

- Base de filtros y resultado de screening.
- Seguimiento de participantes y actividades de medición.
- Cuotas y alertas.
- Respuestas en formato ancho.
- Respuestas en formato largo.
- Metadatos de rotación, brazo, producto real según permisos y versión de cuestionario.
- Archivos CSV y XLSX.
- Exportaciones con PII para Admin y Supervisor cuando corresponda.
- Exportaciones anonimizadas para Analista.

## Permisos V1

- Admin publica o retira cuestionarios, modifica cuotas y rotaciones, ve claves reales de producto y PII, corrige hora de aplicación incluso si ya existen actividades iniciadas o respondidas, y reabre actividades vencidas con auditoría.
- Supervisor revisa filtros y avance, corrige datos operativos, regenera enlaces, reabre actividades con auditoría y corrige hora de aplicación solo cuando ninguna actividad del participante haya sido iniciada.
- Encuestador aplica filtros, registra participantes, registra hora de aplicación, consulta estatus operativo y registra rotación manual. No puede publicar cuestionarios, modificar cuotas ni alterar rotaciones.
- Analista exporta información anonimizada. No puede ver teléfono, correo, dirección ni otros datos personales identificables.

## Auditoría Obligatoria

Debe auditarse:

- Publicación o retiro de cuestionarios.
- Corrección de hora de aplicación.
- Modificación de participante.
- Regeneración o revocación de enlace.
- Reapertura manual de actividad vencida, incluida una medición vencida.
- Cambios de rotación.
- Cambios de cuotas.

## Estados Por Ruta

Cada ruta debe contemplar explícitamente:

- Cargando.
- Sin datos.
- Error recuperable.
- Error no autorizado.
- Recurso vencido o revocado.
- Guardado parcial.
- Validación fallida.

Esto evita pantallas en blanco y errores silenciosos.

## Sin Tabs Anidados Con Estado Compartido

Para flujos complejos conviene usar rutas, pasos o secciones independientes en lugar de tabs anidados que compartan estado accidentalmente. Cuando se usen tabs visuales, su estado debe estar aislado por ruta, identificador o componente controlado.

## Integraciones Externas

No se recomienda conectar servicios externos durante la primera implementación. Recordatorios automáticos, video, correo, SMS, WhatsApp o almacenamiento privado pueden diseñarse como puertos internos para conectar más adelante.
