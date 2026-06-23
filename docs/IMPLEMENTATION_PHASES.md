# Implementation Phases

## Fase 0: Aprobación De Base

Objetivo: cerrar decisiones de arquitectura antes de escribir la aplicación.

Entregables:

- Revisar estos documentos.
- Confirmar stack técnico.
- Usar roles y permisos V1 aprobados: Admin, Supervisor, Encuestador, Analista y Participante.
- Confirmar modelo de datos inicial.
- Usar política aprobada de tokens: 7 días después de la última actividad programada, multidispositivo y revocación inmediata al regenerar.
- Mantener diseño de video futuro sin implementación de cámara, carga ni almacenamiento.
- Definir tolerancias exactas de ventanas de medición por estudio.

## Primera Implementación End-To-End

La primera implementación debe resolver de punta a punta un estudio comparativo de fragancias con dos productos y dos brazos.

Debe incluir:

- Filtro interno aplicado por encuestador.
- Cálculo de NSE.
- Cuotas con advertencia no bloqueante.
- Registro de participantes y participaciones por estudio.
- Rotación de dos brazos.
- Asignación manual por carátula/código de rotación.
- Base de arquitectura y modelo para asignación automática futura, sin implementarla todavía.
- Enlace único sin contraseña.
- Enlace válido hasta 7 días después de la última actividad programada.
- Hora de aplicación registrada por encuestador.
- Actividades de medición a 15 minutos, 2 horas, 4 horas y 8 horas.
- Ventanas configurables por estudio.
- Batería de atributos aleatoria persistente.
- Opción de usar el mismo orden de atributos para ambas fragancias.
- Seguimiento de cumplimiento.
- Exportaciones iniciales en CSV y XLSX.

No debe incluir todavía:

- Editor visual completamente libre.
- Drag and drop complejo.
- Scripting arbitrario.
- Envío automático de mensajes.
- Cámara.
- Carga o almacenamiento de video.
- Integración con WhatsApp, correo o SMS.
- Asignación automática de rotación.

## Fase 1: Esqueleto Técnico

Objetivo: crear la base de la aplicación sin funcionalidades finales completas.

Entregables:

- Proyecto TypeScript estricto.
- Estructura de monolito modular.
- Configuración de lint, formato y pruebas.
- Layouts base para admin, field y participante.
- Manejo base de errores, loading y estados vacíos.
- Base de validación compartida cliente/servidor.
- Rutas separadas para administración, campo y participante.

## Fase 2: Modelo Y Persistencia

Objetivo: crear el modelo mínimo para estudios, usuarios internos, perfiles personales, participaciones por estudio, cuestionarios versionados y actividades.

Entregables:

- Esquema de base de datos inicial.
- Migraciones.
- Repositorios o servicios de persistencia.
- Seeds de desarrollo.
- `ParticipantProfile` sin `studyId`.
- `StudyParticipant` como entidad operativa central.
- Separación PII/respuestas.
- Zona horaria IANA por estudio.
- Hora de aplicación por participación.
- Audit log para entidades críticas.

## Fase 3: Motor De Cuestionarios Y Biblioteca Versionada

Objetivo: implementar reglas centrales sin depender de pantallas finales.

Entregables:

- Tipos de pregunta principales.
- Definición JSON validada.
- Evaluación condicional.
- Reglas de terminar.
- Cálculos.
- Texto dinámico.
- Publicación inmutable.
- Revisiones de biblioteca para preguntas, escalas, atributos y plantillas.
- Snapshot completo en cada `QuestionnaireVersion`.
- Pruebas unitarias del motor.

## Fase 4: Filtros, NSE Y Cuotas

Objetivo: soportar operación de campo con reglas configurables para el estudio comparativo inicial.

Entregables:

- Aplicación de filtros.
- Terminación automática.
- Cálculo NSE.
- Clasificación por rangos.
- Definición de cuotas por etapa.
- Evaluación de cuotas.
- Advertencias no bloqueantes.
- Registro de encuestador, fecha, hora y estatus.
- Auditoría de cambios de cuotas.

## Fase 5: Participantes, Tokens Y Actividades

Objetivo: permitir acceso seguro del participante y actividades programadas desde la hora de aplicación.

Entregables:

- Generación de token opaco por `StudyParticipant`.
- Hash, revocación y regeneración de token.
- Auditoría de revocación y regeneración.
- Revocación inmediata del enlace anterior al regenerar uno nuevo.
- Vencimiento hasta 7 días después de la última actividad programada.
- Uso desde más de un dispositivo.
- Registro de `applicationStartedAt` por encuestador.
- Corrección de hora de aplicación con reglas V1 y auditoría.
- Cálculo de actividades a 15, 120, 240 y 480 minutos.
- Estados de actividad.
- Ventanas de disponibilidad configurables por estudio.
- Reapertura manual de actividad vencida con auditoría.
- Guardado y reanudación de avances.

## Fase 6: Rotación Comparativa Y Aleatorización

Objetivo: soportar productos, brazos, rotación y atributos aleatorizados.

Entregables:

- Productos con clave real protegida.
- Brazo izquierdo y derecho.
- Planes y códigos de rotación.
- Asignación manual mediante carátula/código.
- Base para asignación automática futura sin implementación V1.
- `ParticipantRotationAssignment`.
- `ParticipantArmAssignment`.
- Etiquetas visibles para participante.
- Orden de aplicación.
- Cambios de rotación auditados.
- Batería de atributos reutilizable.
- Orden de atributos persistente por participación, versión, bloque y contexto.
- Configuración de orden compartido o independiente por fragancia.
- Pregunta final fija fuera de aleatorización.

## Fase 7: Exportaciones Y Reportes Operativos

Objetivo: habilitar seguimiento y salida de datos inicial.

Entregables:

- Base de filtros y resultado de screening.
- Seguimiento de participantes y actividades.
- Cuotas y alertas.
- Respuestas.
- Respuestas en formato ancho.
- Respuestas en formato largo.
- Metadatos de rotación, brazo, producto real según permisos y versión de cuestionario.
- CSV y XLSX.
- Exportación con PII para Admin y Supervisor cuando corresponda.
- Exportación anonimizada para Analista.
- Revisión de privacidad y PII.
- Respeto de permisos para claves reales de producto.

## Fase 8: End-To-End Y Endurecimiento

Objetivo: validar flujos completos y preparar una primera versión utilizable.

Entregables:

- Pruebas end-to-end principales.
- Revisión de estados vacíos, carga y errores.
- Revisión de permisos por ruta.
- Revisión de auditoría.
- Revisión de exportaciones.
- Revisión de separación PII/respuestas.
- Revisión de retomar avances y conservar aleatorización.
- Revisión de anonimización para rol Analista.

## Fase Futura: Video

Objetivo: implementar evidencia de video cuando el modelo base esté estable.

Entregables futuros:

- Actividades de video una vez al día durante tres días.
- Cámara o carga de video, según decisión futura.
- Almacenamiento privado.
- Consentimiento.
- Revisión futura.
- Retención por tres días.
- Políticas de acceso.
- Sin URLs públicas persistentes.
- Auditoría de acceso.

Esta fase no debe implementarse todavía.
