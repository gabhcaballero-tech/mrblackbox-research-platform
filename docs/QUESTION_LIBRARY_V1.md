# Biblioteca reutilizable de screener V1

## Alcance

Esta fase agrega una biblioteca interna para que ADMIN pueda reutilizar contenido del Screener Builder.

Incluye:

- guardar una pregunta existente como elemento reutilizable;
- guardar un bloque seleccionado de preguntas;
- conservar opciones, acciones directas, validaciones, reglas relacionadas y NSE cuando aplique;
- buscar, previsualizar e insertar preguntas o bloques en un borrador de screener;
- crear copias independientes dentro del borrador destino;
- conservar historial de revisiones y trazabilidad de inserciones.

No incluye:

- editor independiente para crear preguntas desde cero en `/admin/library`;
- plantillas completas de screener;
- cambios a versiones publicadas;
- participantes, respuestas reales, cuotas, rotaciones, productos reales o datos operativos.

## Modelos

Se reutilizan `LibraryItem` y `LibraryItemRevision`.

La migración aditiva `20260623082108_add_screener_question_library` agrega:

- metadatos buscables en `LibraryItem`: descripción, categoría, etiquetas y alcance;
- estados de revisión en `LibraryItemRevision`: `ACTIVE`, `SUPERSEDED`, `RETIRED`;
- hash SHA-256 de contenido para revisiones nuevas;
- retiro lógico de revisiones;
- tabla `QuestionnaireDraftLibraryUse` para trazabilidad histórica de inserciones.

La migración fue creada de forma manual y no aplicada.

## Contrato

El contenido persistido en `LibraryItemRevision.contentJson` usa `screener-library.v1`.

Una pregunta guarda:

- pregunta;
- opciones;
- acciones directas por opción;
- validaciones;
- destino de datos;
- configuración de opción Otro.

Un bloque guarda:

- preguntas ordenadas;
- opciones y acciones directas;
- reglas relacionadas;
- NSE solo si todas sus preguntas de entrada están dentro del bloque.

El contenido se valida antes de crear una revisión. No se guardan respuestas, datos de participantes, nombres reales de producto, rotaciones, cuotas ni datos operativos reales.

## Versionado

Crear un elemento genera `revisionNumber = 1` con estado `ACTIVE`.

Crear una nueva revisión:

- conserva las revisiones anteriores;
- marca la revisión `ACTIVE` previa como `SUPERSEDED`;
- crea una nueva revisión `ACTIVE`;
- genera `contentHash` con SHA-256.

Retirar una revisión:

- cambia su estado a `RETIRED`;
- registra `retiredAt` y `retiredByUserId`;
- no borra contenido.

## Inserción

Insertar desde biblioteca:

- copia el contenido al `QuestionnaireDraft.definitionJson`;
- recalcula el orden de preguntas y reglas;
- remapea IDs técnicos cuando hay colisión;
- actualiza reglas y NSE con los IDs nuevos;
- registra `QuestionnaireDraftLibraryUse` con hash e `idMapJson`.

No se crea una dependencia viva entre biblioteca y borrador. Cambios futuros a la biblioteca no modifican borradores ya insertados ni versiones publicadas.

## Seguridad

Solo ADMIN puede guardar, listar, revisar, insertar o retirar revisiones.

La inserción exige que el estudio destino siga en `DRAFT`.

Los elementos `STUDY_SPECIFIC` se guardan por defecto con el estudio de origen. Los elementos `GENERIC` requieren confirmación visible de que no incluyen marcas, clientes, productos reales, cuotas ni criterios exclusivos de un estudio.

## Pruebas

Se agregaron pruebas unitarias sin conexión real para:

- guardar pregunta y bloque;
- rechazar reglas fuera del bloque;
- crear nuevas revisiones sin mutar contenido anterior;
- marcar revisiones anteriores como `SUPERSEDED`;
- retirar revisiones sin borrarlas;
- insertar copias independientes;
- remapear IDs y actualizar reglas;
- insertar o bloquear NSE según el destino;
- rechazar estudio no `DRAFT`;
- autorización ADMIN;
- búsqueda por nombre, categoría y etiquetas;
- advertencia para elementos específicos de otro estudio;
- validación contra contenido sensible u operativo.
