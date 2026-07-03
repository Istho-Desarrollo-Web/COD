# Integración futura COD ↔ CRM CenthriX

> Estado: diseño únicamente — no implementado. Ver sección 6 del spec
> `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`.

## Contrato propuesto

- **Cliente HTTP interno en COD:** `server/src/services/crmClient.js` (a crear),
  análogo a `wmsSyncService.js` del CRM — un módulo con funciones `getProveedor(id)`,
  `getOperaciones(filtros)` que llaman al CRM vía `fetch`/`axios`.
- **Autenticación:** header `x-api-key`, mismo patrón que `powerbiAuth.js` del CRM
  (comparación SHA-256 contra un valor almacenado, sin JWT de usuario).
- **Endpoints a construir en el CRM (fuera de alcance de este repo):**
  - `GET /api/v1/integraciones/cod/proveedores`
  - `GET /api/v1/integraciones/cod/operaciones`
- **Modo de sincronización:** PULL bajo demanda — COD consulta al CRM cuando el
  usuario lo necesita (p. ej. al crear un `Proveedor` para sugerir datos ya
  existentes en el CRM, o para reportes cruzados). Sin sincronización
  automática (push/pull programado) en esta fase.
- **Manejo de fallos:** si el CRM no responde, COD debe degradar con
  gracefulmente (mostrar el formulario vacío, sin bloquear la creación local) —
  la integración es un enriquecimiento opcional, nunca una dependencia dura.

## Próximos pasos (no incluidos en este plan)

1. Definir y documentar el contrato exacto de request/response de cada endpoint.
2. Implementar los endpoints en el CRM protegidos por `x-api-key`.
3. Implementar `crmClient.js` en COD con timeout corto (ej. 3s) y manejo de error silencioso.
