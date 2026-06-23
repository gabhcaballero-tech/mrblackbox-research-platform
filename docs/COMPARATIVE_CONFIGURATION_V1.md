# Comparative Configuration V1

## Alcance

Esta fase agrega configuracion administrativa de productos, brazos y rotaciones manuales para estudios comparativos en `DRAFT`.

Incluye:

- ruta protegida `/admin/studies/[studyId]`;
- productos del estudio con nombre real visible solo para `ADMIN`;
- brazos canonicos de aplicacion;
- planes de rotacion manuales;
- vistas previas seguras futuras para campo y participante;
- validaciones de dominio y servicio sin conexion real a Supabase en pruebas.

No incluye participantes, filtros, cuotas, cuestionarios, enlaces, exportaciones, aplicacion de productos, asignacion automatica ni cambio de estado del estudio.

## Persistencia

No se creo migracion nueva.

Se usan modelos existentes:

- `StudyProduct`
- `StudyArm`
- `RotationPlan`
- `RotationPlanArm`

Campos usados:

- `StudyProduct.internalCode`: codigo seguro unico por estudio.
- `StudyProduct.displayLabel`: etiqueta ciega/no sensible.
- `StudyProduct.realName`: nombre real, visible solo para `ADMIN`.
- `StudyProduct.isSensitive`: se crea como `true` en V1.
- `StudyArm.code`: codigo canonico esperado por dominio.
- `StudyArm.label`: etiqueta operativa editable.
- `StudyArm.sortOrder`: orden estable del brazo.
- `RotationPlan.rotationCode`: codigo manual unico por estudio.
- `RotationPlan.assignmentModeAllowed`: se guarda como `MANUAL`.
- `RotationPlan.status`: `ACTIVE` o `INACTIVE` para retirar sin borrar.
- `RotationPlanArm.applicationOrder`: orden 1 o 2.
- `RotationPlanArm.participantVisibleLabel`: generado por servidor.

## Codigo canonico de brazos

Se conserva la convencion existente del modulo de dominio:

- `left`
- `right`

La interfaz muestra esos codigos como:

- Brazo izquierdo
- Brazo derecho

El brazo fisico no equivale al orden de aplicacion. El orden se define por cada rotacion.

## Validaciones

Productos:

- `internalCode`: obligatorio, uppercase, espacios y `_` a `-`, guiones repetidos colapsados, sin guiones al inicio/final, regex `^[A-Z0-9]+(?:-[A-Z0-9]+)*$`, longitud 2 a 32, unico por estudio.
- `displayLabel`: obligatorio, trim, espacios internos colapsados, longitud 1 a 80, unico por estudio a nivel de servicio y distinto de `realName` al comparar normalizado.
- `realName`: obligatorio, trim, espacios internos colapsados, longitud 1 a 160.
- `isSensitive`: `true` por defecto, sin opcion para volver visible el nombre real.

Brazos:

- solo codigos canonicos `left` y `right`;
- maximo dos brazos;
- etiqueta operativa editable;
- `sortOrder` estable derivado del brazo canonico;
- no se permite crear rotaciones hasta tener exactamente dos brazos canonicos.

Rotaciones:

- `rotationCode`: obligatorio, misma normalizacion que `Study.code`, longitud 2 a 32, unico por estudio.
- exactamente dos asignaciones;
- dos brazos distintos;
- dos productos distintos;
- ordenes 1 y 2, sin duplicados;
- productos y brazos deben pertenecer al estudio actual;
- etiquetas participante generadas por servidor:
  - orden 1: `Primera fragancia`
  - orden 2: `Segunda fragancia`
- crear/editar usa transaccion de repositorio;
- retirar usa `RotationPlan.status = INACTIVE`.

## Visibilidad

`ADMIN` puede ver:

- `rotationCode`;
- brazo;
- orden;
- `internalCode`;
- `displayLabel`;
- `realName`;
- estado de rotacion.

Campo futuro puede ver:

- `rotationCode`;
- codigo y etiqueta operativa de brazo;
- orden;
- `internalCode`;
- `displayLabel`;
- etiqueta participante.

Campo futuro nunca debe ver:

- `realName`;
- `isSensitive`;
- datos personales;
- claves reales adicionales.

Participante futuro puede ver solo:

- `Primera fragancia`;
- `Segunda fragancia`.

Participante futuro nunca debe ver:

- brazo fisico;
- `rotationCode`;
- `internalCode`;
- `displayLabel`;
- `realName`.

## Politica de edicion

Mientras el estudio esta en `DRAFT`:

- productos: crear, editar y eliminar solo si no tienen referencias;
- brazos: crear hasta dos, editar etiqueta y eliminar solo si no tienen referencias;
- rotaciones: crear, editar o retirar mediante `status`.

Cuando el estudio no esta en `DRAFT`:

- toda la pantalla queda en solo lectura;
- no se crean, editan, eliminan ni retiran configuraciones.

## Archivos principales

- `src/app/admin/studies/[studyId]/page.tsx`
- `src/app/admin/studies/[studyId]/_components/*`
- `src/modules/comparative-rotation/admin-validation.ts`
- `src/modules/comparative-rotation/admin-repository.ts`
- `src/modules/comparative-rotation/admin-service.ts`
- `src/modules/comparative-rotation/actions.ts`
- `src/modules/comparative-rotation/admin-config.test.ts`

## Pruebas

Se agregaron pruebas para:

- `ADMIN` autorizado y no `ADMIN` denegado;
- estudio inexistente;
- estudio no `DRAFT` rechaza mutaciones;
- producto valido;
- codigo interno duplicado;
- `displayLabel` duplicado;
- `realName` ausente en proyeccion segura;
- no permitir tercer brazo;
- rotacion sin exactamente dos brazos;
- rotacion valida;
- producto duplicado en rotacion;
- brazo duplicado;
- orden duplicado;
- producto o brazo de otro estudio;
- `rotationCode` duplicado;
- rotacion retirada fuera del checklist activo;
- participante solo recibe etiquetas primera/segunda fragancia.

## Pendiente

- Aplicar migraciones pendientes en entorno controlado.
- Crear configuracion real del estudio desde la UI con usuario `ADMIN` vinculado.
- Implementar cambio de estado de estudio en una fase posterior.
- Implementar campo real, participantes, cuestionarios, cuotas y exportaciones en fases separadas.
