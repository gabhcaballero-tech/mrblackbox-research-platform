# Test Strategy

## Objetivo

La estrategia de pruebas debe proteger las reglas de negocio antes de invertir en pantallas finales. Las reglas críticas deben poder probarse como funciones o servicios de dominio sin depender del navegador.

## Tipos De Prueba

### Unitarias

Prioridad alta para:

- Reglas de filtros.
- Terminación por respuesta única.
- Terminación por opción seleccionada en respuesta múltiple.
- Cálculo de puntajes.
- Clasificación NSE por rangos.
- Evaluación de cuotas por etapa.
- Advertencia de cuota llena sin bloqueo.
- Cálculo de actividades desde `applicationStartedAt`.
- Ventanas de disponibilidad configurables por estudio y vencimiento.
- Rotación de dos brazos.
- Asignación manual por código de rotación.
- Exclusión de asignación automática en V1.
- Asignación de producto a brazo izquierdo y derecho.
- Vencimiento de enlace 7 días después de la última actividad programada.
- Revocación inmediata del enlace anterior al regenerar.
- Aleatorización estable de atributos.
- Aleatorización compartida entre fragancias.
- Aleatorización independiente por fragancia.
- Agrupación de atributos por tamaño configurable.
- Exclusión de la pregunta final fuera de la aleatorización.
- Lógica condicional.
- Texto dinámico con respuestas previas.
- Validación de "Otro" con texto obligatorio cuando aplique.

### Integración

Prioridad alta para:

- Crear `ParticipantProfile` sin `studyId`.
- Crear `StudyParticipant` para una persona dentro de un estudio.
- Vincular token, screening, cuotas, rotación, actividades y respuestas a `StudyParticipant`.
- Publicar cuestionario y crear versión inmutable.
- Crear revisiones de biblioteca sin alterar cuestionarios publicados.
- Guardar avance y retomar actividad.
- Generar token de participante y resolverlo por hash.
- Regenerar y revocar token con auditoría.
- Separar `ParticipantProfile` de `ResearchResponse`.
- Registrar y corregir `applicationStartedAt` con auditoría.
- Crear actividades desde hora de aplicación y offsets.
- Vencer actividades fuera de ventana permitida.
- Reabrir actividad vencida con auditoría.
- Exportar CSV y XLSX.
- Exportar con versión, brazo, rotación y producto real según permisos.
- Exportar con PII para Admin y Supervisor cuando corresponda.
- Exportar anonimizado para Analista.
- Registrar auditoría en cambios relevantes.

### End-To-End

Flujos principales:

- Admin crea estudio comparativo de fragancias con zona horaria.
- Admin configura productos, brazo izquierdo/derecho y rotación.
- Admin configura cuestionarios, actividades de 15 min, 2 h, 4 h y 8 h, y publica versión.
- Encuestador aplica filtro, calcula NSE, recibe advertencia de cuota llena y continúa.
- Encuestador registra participante y participación en estudio.
- Encuestador asigna código de rotación y registra hora de aplicación.
- Encuestador aprueba participación y genera enlace.
- Supervisor regenera enlace y el anterior queda revocado.
- Participante entra con token, ve actividades y completa una disponible.
- Participante guarda avance, sale y retoma sin perder respuestas.
- Participante mantiene el mismo orden aleatorio de atributos al retomar.
- Participante evalúa ambas fragancias con el mismo orden de atributos cuando la configuración lo indique.
- Admin exporta filtros, seguimiento, cuotas, respuestas anchas, respuestas largas y metadatos de rotación, incluido producto real según permisos, en CSV/XLSX.
- Analista exporta datos anonimizados sin teléfono, correo, dirección ni otros datos personales identificables.

## Casos Críticos Del Modelo

### Separación Participante / Estudio

Debe probar:

- Una persona puede tener más de una participación.
- Cada participación tiene estado operativo propio.
- Tokens de una participación no abren otra.
- Respuestas de una participación no se mezclan con otra.
- Exportaciones unen PII solo si el rol lo permite.

### Rotación De Dos Brazos

Debe probar:

- Un código de rotación asigna producto al brazo izquierdo.
- Un código de rotación asigna producto al brazo derecho.
- El orden de aplicación se conserva.
- La etiqueta visible no revela la clave real.
- La clave real aparece solo para Admin en V1.
- Cambios de rotación quedan auditados.
- Encuestador puede registrar un código manual por carátula.
- Encuestador no puede alterar una rotación registrada.
- La asignación automática no aparece como flujo funcional en V1.

### Hora Ancla

Debe probar:

- Las actividades se calculan desde `applicationStartedAt`.
- Los offsets 15, 120, 240 y 480 minutos generan horarios correctos.
- La zona horaria IANA del estudio se respeta.
- Corregir la hora registra valor anterior, valor nuevo, usuario y motivo.
- Supervisor puede corregir la hora solo si ninguna actividad ha sido iniciada.
- Cuando Supervisor corrige la hora antes de iniciar actividades, las actividades pendientes se recalculan.
- Admin puede corregir la hora aunque existan actividades iniciadas o completadas.
- Actividades completadas no se sobrescriben silenciosamente.

### Enlaces De Participante

Debe probar:

- El token no contiene PII en la URL.
- El token dura hasta 7 días después de la última actividad programada.
- El enlace puede abrirse desde más de un dispositivo.
- Regenerar enlace revoca inmediatamente el enlace anterior.
- Un enlace revocado no permite acceso.

### Respuesta Múltiple Con Terminación

Dado que una pregunta permite varias opciones, una regla debe poder terminar si una opción específica está incluida, aunque existan otras respuestas seleccionadas.

### NSE

El cálculo debe probar:

- Suma de puntajes.
- Respuestas sin puntaje.
- Rangos límite.
- Valores faltantes.
- Clasificación final.

### Cuotas

Debe probar:

- Coincidencia por ciudad, edad, NSE u otra variable.
- Conteo por etapa: screening aprobado, participante asignado, primera medición completada o estudio completo.
- Conteo actual.
- Cuota llena.
- Advertencia mostrada.
- Continuación permitida aunque la cuota esté llena.

### Roles Y Permisos

Debe probar:

- Admin publica o retira cuestionarios.
- Admin modifica cuotas y rotaciones.
- Admin ve claves reales y PII.
- Supervisor corrige datos operativos.
- Supervisor regenera enlaces.
- Supervisor reabre actividades vencidas con auditoría.
- Supervisor no ve clave real de producto en V1 salvo decisión posterior.
- Encuestador aplica filtros, registra participantes, registra hora y consulta estatus operativo.
- Encuestador no publica cuestionarios, no modifica cuotas y no altera rotaciones.
- Analista no puede ver teléfono, correo, dirección ni otros datos personales identificables.

### Aleatorización De Atributos

Debe probar:

- El orden se genera una vez por participación, versión, bloque y contexto.
- El orden se guarda.
- El mismo participante obtiene el mismo orden al retomar.
- Participantes distintos pueden obtener órdenes distintos.
- El orden puede ser compartido entre ambas fragancias.
- El orden puede ser independiente por fragancia.
- Los grupos respetan el tamaño configurado.
- La instrucción se repite antes de cada grupo sin generar respuesta.
- La pregunta final queda fija, fuera de grupos y fuera de aleatorización.

### Cuestionarios Y Biblioteca Versionada

Debe probar:

- Un cuestionario publicado no cambia aunque el borrador se edite.
- Un cuestionario publicado no cambia aunque cambie una pregunta, escala, atributo o plantilla de biblioteca.
- Las respuestas apuntan a la versión usada.
- La exportación muestra versión.
- Retirar una versión queda auditado.

### Exportaciones

Debe probar:

- Exportación CSV.
- Exportación XLSX.
- Formato ancho.
- Formato largo.
- Base de filtros y resultado de screening.
- Seguimiento de participantes y actividades.
- Cuotas y alertas.
- Respuestas.
- Metadatos de rotación, brazo, producto real según permisos y versión de cuestionario.
- Admin y Supervisor pueden generar exportaciones con PII cuando corresponda.
- Analista solo recibe exportaciones anonimizadas.

## Datos De Prueba

Crear fixtures pequeñas y legibles:

- Estudio comparativo con dos fragancias.
- Brazos izquierdo y derecho.
- Códigos de rotación manual.
- Filtro con regla de terminación.
- Filtro con respuesta múltiple.
- NSE con tres rangos.
- Cuota por ciudad y NSE con etapa de conteo.
- Participante con dos participaciones en estudios distintos.
- Batería de 12 atributos agrupados de 5 en 5.
- Actividades a 15, 120, 240 y 480 minutos.
- Actividades futuras de video una vez al día durante tres días, solo como datos de modelo con consentimiento, revisión futura y retención futura.

## Criterio Mínimo Antes De UI Compleja

Antes de construir pantallas finales, deberían existir pruebas verdes para:

- Separación entre `ParticipantProfile` y `StudyParticipant`.
- Evaluación de filtros.
- Cálculo de NSE.
- Cuotas no bloqueantes por etapa.
- Rotación de dos brazos.
- Hora de aplicación y cálculo de actividades.
- Reglas de corrección de hora por Admin y Supervisor.
- Vencimiento y regeneración de enlaces.
- Aleatorización estable por contexto.
- Guardado y reanudación de respuestas.
- Versionado inmutable.
- Exportaciones CSV/XLSX con control de PII.
- Auditoría obligatoria.
