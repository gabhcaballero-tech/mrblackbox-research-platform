# Routes And Roles

## Roles V1

### Admin

Puede configurar estudios, cuestionarios, bibliotecas, reglas, cuotas, rotaciones, usuarios internos, auditoría y exportaciones completas.

Permisos aprobados:

- Publica o retira cuestionarios.
- Modifica cuotas y rotaciones.
- Ve claves reales de producto y datos personales.
- Puede corregir hora de aplicación cuando ya existan actividades iniciadas o respondidas.
- Puede reabrir actividades vencidas, siempre con auditoría.
- Puede generar exportaciones con PII cuando corresponda.

### Supervisor

Puede revisar la operación del estudio y corregir datos operativos.

Permisos aprobados:

- Revisa filtros y avance de participantes.
- Corrige datos operativos.
- Puede regenerar enlaces de participantes.
- Puede reabrir actividades con auditoría.
- Puede corregir hora de aplicación solo cuando ninguna actividad del participante haya sido iniciada.
- Puede generar exportaciones con PII cuando corresponda.

### Encuestador

Puede ejecutar el flujo de campo.

Permisos aprobados:

- Aplica filtros.
- Registra participantes.
- Registra hora de aplicación.
- Consulta el estatus operativo necesario.
- Registra el código de rotación manual por carátula.
- No puede publicar cuestionarios.
- No puede modificar cuotas.
- No puede alterar rotaciones después de registrarlas.

### Analista

Puede consultar y exportar información anonimizada.

Permisos aprobados:

- Exporta información anonimizada.
- No puede ver teléfono, correo, dirección ni otros datos personales identificables.

### Participante

Accede solo mediante token opaco asociado a una participación específica. Puede ver y responder sus actividades disponibles.

## Matriz De Permisos

| Capacidad | Admin | Supervisor | Encuestador | Analista | Participante |
| --- | --- | --- | --- | --- | --- |
| Crear estudios | Sí | No | No | No | No |
| Editar estudios | Sí | No | No | No | No |
| Publicar o retirar cuestionarios | Sí | No | No | No | No |
| Administrar bibliotecas | Sí | No | No | No | No |
| Configurar cuotas | Sí | No | No | No | No |
| Cambiar cuotas | Sí | No | No | No | No |
| Aplicar filtros | No | Revisar | Sí | No | No |
| Crear perfiles de participante | Sí | Sí | Sí | No | No |
| Crear participación en estudio | Sí | Sí | Sí | No | No |
| Corregir datos operativos | Sí | Sí | No | No | No |
| Registrar hora de aplicación | Sí | Sí | Sí | No | No |
| Corregir hora sin actividades iniciadas | Sí | Sí | No | No | No |
| Corregir hora con actividades iniciadas o respondidas | Sí | No | No | No | No |
| Generar enlace participante | Sí | Sí | Sí, tras aprobar | No | No |
| Regenerar enlace participante | Sí | Sí | No | No | No |
| Revocar enlace participante | Sí | Sí | No | No | No |
| Registrar rotación manual | Sí | Sí | Sí | No | No |
| Modificar rotación registrada | Sí | No | No | No | No |
| Ver clave real de producto | Sí | No | No | No | No |
| Ver etiqueta visible de producto | Sí | Sí | Sí | Sí | Sí |
| Reabrir actividad vencida | Sí | Sí | No | No | No |
| Exportar con PII | Sí | Sí | No | No | No |
| Exportar anonimizado | Sí | Sí | No | Sí | No |
| Responder actividades | No | No | No | No | Sí |

## Rutas Propuestas

### Administración

```text
/admin
/admin/studies
/admin/studies/new
/admin/studies/:studyId
/admin/studies/:studyId/settings
/admin/studies/:studyId/products
/admin/studies/:studyId/arms
/admin/studies/:studyId/rotations
/admin/studies/:studyId/questionnaires
/admin/studies/:studyId/questionnaires/:questionnaireId
/admin/studies/:studyId/questionnaires/:questionnaireId/versions
/admin/studies/:studyId/quotas
/admin/studies/:studyId/activity-schedules
/admin/studies/:studyId/participants
/admin/studies/:studyId/participants/:studyParticipantId
/admin/studies/:studyId/progress
/admin/studies/:studyId/exports
/admin/library/questions
/admin/library/attributes
/admin/library/options
/admin/library/scales
/admin/library/templates
/admin/audit
/admin/users
```

Cada ruta debe tener estados explícitos de carga, vacío y error.

### Campo

```text
/field
/field/studies
/field/studies/:studyId
/field/studies/:studyId/screening/new
/field/screening/:attemptId
/field/study-participants/:studyParticipantId
/field/study-participants/:studyParticipantId/application-time
/field/study-participants/:studyParticipantId/rotation
/field/study-participants/:studyParticipantId/link
/field/progress
```

La ruta de screening debe registrar encuestador, fecha, hora, estatus del filtro, reglas ejecutadas y advertencias de cuota.

La ruta de hora de aplicación registra `applicationStartedAt`. Si ninguna actividad ha sido iniciada, Supervisor puede corregirla y se recalculan actividades pendientes. Si ya existe una actividad iniciada o completada, solo Admin puede corregirla.

La ruta de rotación permite a Encuestador registrar el código manual por carátula. Alterar una rotación registrada queda restringido a Admin y debe auditarse.

### Participante

```text
/p/:token
/p/:token/activities
/p/:token/activities/:participantActivityId
/p/:token/activities/:participantActivityId/resume
/p/:token/expired
/p/:token/revoked
```

El token no debe contener PII ni identificadores legibles. Las rutas deben manejar token inválido, vencido o revocado sin exponer información sensible.

### API Interna

```text
/api/admin/*
/api/field/*
/api/participant/*
```

Las rutas API deben validar entrada en servidor aunque exista validación de cliente.

## Consideraciones De Navegación

- Evitar tabs anidados con estado compartido en configuraciones complejas.
- Preferir pasos, subrutas o paneles independientes para estudios, cuestionarios, productos, brazos, rotaciones, cuotas, actividades y exportaciones.
- Mantener rutas separadas para administración, campo y participante.
- No reutilizar componentes con permisos implícitos; los permisos deben evaluarse en servidor.

## Datos Sensibles Por Rol

La clave real del producto o fragancia debe ocultarse a Supervisor, Encuestador, Analista y Participante salvo que una decisión posterior amplíe el permiso. En V1, el permiso explícito aprobado para ver claves reales corresponde a Admin.

Admin y Supervisor pueden generar exportaciones con PII cuando corresponda. Analista solo puede exportar información anonimizada y no debe ver teléfono, correo, dirección ni otros datos personales identificables.

Los tokens se resuelven contra una participación específica; el participante no debe poder inferir otros estudios, productos reales ni perfiles personales desde la URL.
