# Data Model Proposal

## Enfoque

El modelo debe preservar estas ideas centrales:

- `ParticipantProfile` representa a una persona y no contiene `studyId`.
- `StudyParticipant` representa la participación de una persona en un estudio específico.
- Tokens, screening, cuotas, rotaciones, actividades, respuestas y exportaciones se vinculan a `StudyParticipant`.
- Datos personales y respuestas de investigación permanecen separados.
- Cuestionarios publicados son snapshots completos e inmutables.
- Las bibliotecas tienen revisiones para uso futuro, sin alterar publicaciones existentes.
- Cada asignación aleatoria que afecte la experiencia o la exportación queda guardada.
- Las actividades programadas cubren mediciones, video futuro y seguimiento interno.

Los nombres son propuestas de entidades, no una migración final.

## Entidades Principales

### User

Representa usuarios internos: administradores, supervisores, encuestadores y analistas.

Campos sugeridos:

- `id`
- `name`
- `email`
- `passwordHash`
- `role`
- `status`
- `createdAt`
- `updatedAt`

Roles V1:

- `admin`
- `supervisor`
- `interviewer`
- `analyst`

### Study

Representa un estudio de investigación.

Campos sugeridos:

- `id`
- `name`
- `description`
- `status`: draft, active, paused, archived
- `timeZoneIana`
- `startsAt`
- `endsAt`
- `createdByUserId`
- `createdAt`
- `updatedAt`

`timeZoneIana` debe ser obligatorio antes de activar el estudio. Las actividades se calculan usando esa zona horaria.

### StudyProduct

Representa productos o fragancias evaluadas dentro de un estudio.

Campos sugeridos:

- `id`
- `studyId`
- `internalCode`
- `displayLabel`
- `realName`
- `isSensitive`
- `createdAt`

`realName` y claves reales deben mostrarse solo a roles autorizados.

### StudyArm

Representa brazo izquierdo, brazo derecho u otra variante configurable.

Campos sugeridos:

- `id`
- `studyId`
- `code`: left, right
- `label`
- `sortOrder`

La primera versión debe usar dos brazos. El modelo permite agregar más brazos después.

### RotationPlan

Define una rotación posible para un estudio.

Campos sugeridos:

- `id`
- `studyId`
- `rotationCode`
- `name`
- `assignmentModeAllowed`: manual, automatic, both
- `status`
- `createdAt`

V1 implementa asignación manual mediante carátula o código de rotación. La asignación automática queda preparada para una fase futura, sin implementarse todavía.

### RotationPlanArm

Define qué producto va en cada brazo dentro de un plan de rotación.

Campos sugeridos:

- `id`
- `rotationPlanId`
- `studyArmId`
- `studyProductId`
- `applicationOrder`
- `participantVisibleLabel`

Ejemplo: brazo izquierdo con Fragancia A como "Primera fragancia" y brazo derecho con Fragancia B como "Segunda fragancia".

### ParticipantProfile

Guarda datos personales y operativos de la persona. No contiene `studyId`.

Campos sugeridos:

- `id`
- `externalReference`
- `name`
- `phone`
- `email`
- `address`
- `city`
- `age`
- `gender`
- `status`
- `createdByUserId`
- `createdAt`
- `updatedAt`

La definición final debe decidir qué campos personales son obligatorios y cuáles opcionales.

### StudyParticipant

Representa la participación de una persona en un estudio específico, desde screening hasta terminado.

Campos sugeridos:

- `id`
- `participantProfileId`
- `studyId`
- `operationalStatus`: created, screening_started, screening_passed, screening_terminated, assigned, in_progress, completed, withdrawn
- `screeningStatus`: not_started, started, passed, terminated, incomplete
- `applicationStartedAt`
- `applicationStartedAtRegisteredByUserId`
- `applicationStartedAtRegisteredAt`
- `applicationStartedAtCorrectedAt`
- `createdByUserId`
- `createdAt`
- `updatedAt`

Esta entidad reemplaza la idea de guardar `studyId` en `ParticipantProfile`. Todo lo específico del estudio debe apuntar aquí.

### ApplicationTimeEvent

Registra captura o corrección de la hora de aplicación.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `eventType`: registered, corrected
- `previousApplicationStartedAt`
- `newApplicationStartedAt`
- `timeZoneIana`
- `reason`
- `activityStateAtEvent`: none_started, some_started, completed_exists
- `createdByUserId`
- `createdAt`

Además de esta entidad, la corrección debe quedar en `AuditLog`.

Reglas V1:

- Si ninguna actividad ha sido iniciada, Supervisor puede corregir `applicationStartedAt` y se recalculan actividades pendientes.
- Si existe alguna actividad iniciada o completada, solo Admin puede corregir `applicationStartedAt`.
- Las respuestas ya capturadas nunca se modifican silenciosamente.

### ParticipantAccessToken

Guarda acceso del participante mediante token opaco para una participación específica.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `tokenHash`
- `status`: active, revoked, expired
- `expiresAt`
- `expiresAtPolicy`: seven_days_after_last_scheduled_activity
- `lastUsedAt`
- `createdByUserId`
- `createdAt`
- `revokedAt`
- `revokedByUserId`
- `revocationReason`: regenerated, manual, expired
- `replacedByTokenId`

La URL pública nunca debe incluir datos personales. El enlace puede abrirse desde más de un dispositivo. Regenerar o revocar enlace requiere auditoría. Al regenerar un enlace, el enlace anterior debe revocarse inmediatamente.

## Cuestionarios Y Biblioteca

### QuestionnaireDraft

Representa cuestionarios editables antes de publicar.

Campos sugeridos:

- `id`
- `studyId`
- `name`
- `purpose`: screener, measurement, followup, admin
- `definitionJson`
- `status`: draft, ready
- `createdByUserId`
- `updatedByUserId`
- `createdAt`
- `updatedAt`

### QuestionnaireVersion

Representa snapshot publicado e inmutable.

Campos sugeridos:

- `id`
- `questionnaireDraftId`
- `studyId`
- `versionNumber`
- `definitionJson`
- `definitionHash`
- `publishedByUserId`
- `publishedAt`
- `retiredByUserId`
- `retiredAt`
- `status`: active, retired

No debe modificarse después de publicar. Si hay cambios, se crea otra versión.

### LibraryItem

Representa una pregunta, opción, escala, atributo o plantilla reutilizable.

Campos sugeridos:

- `id`
- `type`: question, option_set, scale, attribute, matrix, block_template
- `name`
- `status`
- `createdByUserId`
- `createdAt`
- `updatedAt`

### LibraryItemRevision

Representa una revisión concreta de un elemento de biblioteca.

Campos sugeridos:

- `id`
- `libraryItemId`
- `revisionNumber`
- `contentJson`
- `createdByUserId`
- `createdAt`

Modificar una pregunta, escala, atributo o plantilla crea una nueva revisión. Un cuestionario publicado conserva su snapshot completo y no consulta revisiones vivas.

### QuestionnaireAttributeSet

Relaciona una versión de cuestionario con atributos seleccionados para una batería.

Campos sugeridos:

- `id`
- `questionnaireVersionId`
- `blockInstanceKey`
- `libraryItemRevisionId`
- `sortHint`
- `isRequired`

## Screening, NSE Y Cuotas

### ScreeningAttempt

Registra aplicación de filtros por encuestador.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `fieldUserId`
- `questionnaireVersionId`
- `status`: started, passed, terminated, incomplete
- `terminationReason`
- `nseScore`
- `nseClass`
- `startedAt`
- `completedAt`

### ScreeningAnswer

Guarda respuestas del filtro. Se mantiene separada del perfil personal.

Campos sugeridos:

- `id`
- `screeningAttemptId`
- `questionId`
- `answerJson`
- `createdAt`
- `updatedAt`

### QuotaDefinition

Define cuotas por variables configurables y por etapa de conteo.

Campos sugeridos:

- `id`
- `studyId`
- `name`
- `criteriaJson`
- `countingStage`: screening_passed, participant_assigned, first_measurement_completed, study_completed
- `targetCount`
- `warningThreshold`
- `status`
- `createdAt`
- `updatedAt`

La regla actual sigue siendo que una cuota llena genera aviso, pero no bloquea la entrevista.

### QuotaEvaluation

Registra resultado de evaluar cuotas para una participación.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `quotaDefinitionId`
- `matched`
- `countingStage`
- `currentCountAtEvaluation`
- `isFull`
- `warningShown`
- `evaluatedAt`

## Rotación Comparativa

### ParticipantRotationAssignment

Registra la rotación asignada a una participación.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `rotationPlanId`
- `rotationCode`
- `assignmentMode`: manual_cover_code, automatic
- `assignedByUserId`
- `assignedAt`
- `changedAt`

En V1, `assignmentMode` debe ser `manual_cover_code`. El valor `automatic` queda reservado para una fase futura. Debe auditar cambios de rotación.

### ParticipantArmAssignment

Registra producto, brazo, etiqueta y orden para una participación.

Campos sugeridos:

- `id`
- `participantRotationAssignmentId`
- `studyParticipantId`
- `studyArmId`
- `studyProductId`
- `applicationOrder`
- `participantVisibleLabel`
- `createdAt`

Las exportaciones deben incluir brazo, producto real, etiqueta visible, orden y código de rotación según permisos.

## Actividades Programadas

### ActivitySchedule

Define una actividad programada dentro del estudio.

Campos sugeridos:

- `id`
- `studyId`
- `type`: questionnaire_measurement, video_evidence, internal_followup
- `name`
- `anchorEvent`: application_started
- `offsetMinutes`
- `windowStartsMinutes`
- `windowEndsMinutes`
- `questionnaireVersionId`
- `recurrenceJson`
- `sortOrder`
- `status`

Para mediciones actuales, crear actividades de cuestionario a 15, 120, 240 y 480 minutos desde `applicationStartedAt`. Las ventanas permitidas se configuran por estudio mediante `windowStartsMinutes` y `windowEndsMinutes`; las tolerancias exactas no deben codificarse de forma fija.

Para video futuro, configurar actividades `video_evidence` una vez al día durante tres días. No implica implementar carga, cámara ni almacenamiento.

### ParticipantActivity

Representa una actividad programada para una participación.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `activityScheduleId`
- `scheduledAt`
- `availableFrom`
- `availableUntil`
- `status`: pending, available, started, incomplete, completed, expired, reopened
- `actualStartedAt`
- `actualCompletedAt`
- `lastSavedAt`
- `reopenedByUserId`
- `reopenedAt`
- `reopenReason`

Reabrir una actividad vencida requiere auditoría. En V1, Admin y Supervisor pueden reabrir actividades vencidas.

### ReminderLog

Registra recordatorios y seguimiento relacionados con una actividad.

Campos sugeridos:

- `id`
- `participantActivityId`
- `channel`
- `status`
- `scheduledFor`
- `sentAt`
- `metadataJson`

En esta fase no implica conectar correo, SMS, WhatsApp ni envíos automáticos.

## Respuestas Y Aleatorización

### ResearchResponse

Guarda respuestas de investigación por actividad.

Campos sugeridos:

- `id`
- `participantActivityId`
- `questionnaireVersionId`
- `questionId`
- `blockInstanceKey`
- `contextType`: none, product, arm
- `contextId`
- `answerJson`
- `validationStatus`
- `createdAt`
- `updatedAt`

### AttributeRandomizationConfig

Define cómo se aleatorizan atributos en un bloque de cuestionario.

Campos sugeridos:

- `id`
- `questionnaireVersionId`
- `blockInstanceKey`
- `shareOrderAcrossProducts`
- `groupSize`
- `finalQuestionEnabled`
- `finalQuestionText`

Recomendación inicial: `shareOrderAcrossProducts = true` para usar el mismo orden en ambas fragancias de un mismo participante.

### ParticipantAttributeOrder

Guarda el orden final de atributos para una participación, versión, bloque y contexto.

Campos sugeridos:

- `id`
- `studyParticipantId`
- `questionnaireVersionId`
- `blockInstanceKey`
- `contextType`: shared, product, arm
- `contextId`
- `seed`
- `orderedAttributeRevisionIds`
- `groupedAttributeRevisionIds`
- `createdAt`

La pregunta fija final "¿Hay algún otro atributo que describa esta fragancia?" queda fuera de esta aleatorización. Es Sí / No y abre texto obligatorio si se responde Sí.

## Video Futuro

### MediaEvidencePlaceholder

Contempla evidencia de video futura como actividad programada.

Campos sugeridos:

- `id`
- `participantActivityId`
- `type`: video
- `status`: expected, pending_upload, uploaded, rejected, deleted
- `privateStorageKey`
- `consentStatus`: not_requested, granted, denied, revoked
- `consentCapturedAt`
- `reviewStatus`: not_reviewed, pending, approved, rejected
- `reviewedByUserId`
- `reviewedAt`
- `capturedAt`
- `retentionUntil`
- `retentionPolicyStatus`: pending, scheduled, completed
- `metadataJson`

`privateStorageKey` queda nulo hasta implementar almacenamiento privado. Nunca debe haber URL pública persistida. En V1 solo se conserva el diseño de datos para consentimiento, revisión futura y retención futura; no se implementa toma ni carga de video.

## Exportaciones

### ExportJob

Registra una exportación solicitada.

Campos sugeridos:

- `id`
- `studyId`
- `requestedByUserId`
- `type`: screening_base, participant_tracking, quotas, responses_wide, responses_long, full_initial_package
- `format`: csv, xlsx
- `privacyMode`: pii_allowed, anonymized
- `includedPiiFields`
- `anonymizationRulesJson`
- `status`
- `createdAt`
- `completedAt`
- `metadataJson`

Exportaciones iniciales:

- Base de filtros y resultado de screening.
- Seguimiento de participantes y actividades.
- Cuotas y alertas.
- Respuestas en formato ancho.
- Respuestas en formato largo.
- Metadatos de rotación, brazo, producto real según permisos y versión de cuestionario.
- CSV y XLSX.
- Exportaciones con PII para Admin y Supervisor cuando corresponda.
- Exportaciones anonimizadas para Analista.

## Auditoría

### AuditLog

Registra cambios relevantes.

Campos sugeridos:

- `id`
- `actorUserId`
- `entityType`
- `entityId`
- `action`
- `beforeJson`
- `afterJson`
- `reason`
- `createdAt`

Debe cubrir obligatoriamente:

- Publicación o retiro de cuestionarios.
- Corrección de hora de aplicación.
- Modificación de participante.
- Regeneración o revocación de enlace.
- Reapertura manual de actividad vencida, incluida una medición vencida.
- Cambios de rotación.
- Cambios de cuotas.

## Relación Entre PII Y Respuestas

`ParticipantProfile` contiene datos personales. `StudyParticipant` contiene la participación operativa. `ScreeningAnswer` y `ResearchResponse` contienen respuestas. Las exportaciones deben unir estos datos solo cuando el rol tenga permiso y el caso de uso lo justifique.

## Datos JSON

`definitionJson`, `criteriaJson`, `recurrenceJson`, `answerJson` y `metadataJson` permiten flexibilidad, pero deben validarse con esquemas estrictos en la aplicación. No deben convertirse en un espacio sin reglas.
