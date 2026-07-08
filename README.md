# COD — Centro Operativo Documental (ISTHO S.A.S.)

Sistema hermano del CRM CenthriX: mismo lenguaje visual y convenciones
técnicas (ver `DESIGN_SYSTEM_CENTHRIX.md`), dominio propio de Compras,
Proveedores/Contratistas y Repositorio documental SGI.

## Documentación

- Diseño inicial (modelo de datos + estructura de carpetas):
  `docs/superpowers/specs/2026-07-02-cod-modelo-datos-estructura-design.md`
- Diseño del frontend (scaffold, auth, layout, Dashboard Inicio, Áreas):
  `docs/superpowers/specs/2026-07-06-cod-frontend-foundation-design.md`
- Diseño de la API de Documentos (documentos, carpetas, tipos de documento, subida de archivos, job diario): `docs/superpowers/specs/2026-07-07-cod-documentos-api-design.md`
- Diseño del frontend de Documentos (listado con filtros/paginación, creación con subida de archivo, detalle con edición e historial de versiones, gestión de carpetas): `docs/superpowers/specs/2026-07-07-cod-documentos-frontend-design.md`
- Diseño de creación de usuario al crear un Área (módulo de Usuarios CRUD, endpoint de Roles de solo lectura, asignación de líder): `docs/superpowers/specs/2026-07-08-cod-usuario-al-crear-area-design.md`
- Diseño de componentes portados del CRM Centhrix (DatePicker, FilterDropdown, AccionesDropdown) y de la pantalla de Gestión de carpetas: `docs/superpowers/specs/2026-07-08-cod-portar-componentes-crm-design.md`
- Integración futura con el CRM: `docs/architecture/crm-integration.md`

## Backend (`server/`)

```bash
cd server
npm install
cp .env.example .env   # completar JWT_SECRET, credenciales de MySQL, etc.
npm run migration:up   # o simplemente `npm start` — corre migraciones+seeds al arrancar
npm run dev
```

Tests (requieren MySQL local accesible, ver `server/.env.test`):

```bash
cd server
npm test
```

Archivos subidos por la API de Documentos se guardan localmente en `server/uploads/` (ignorado por git). Para forzar el recálculo diario de `estado` manualmente:

```bash
cd server
npm run job:recalcular-estados
```

Los módulos de Usuarios (`/usuarios`) y Roles de solo lectura (`/roles`) ya están implementados. Crear un Área acepta opcionalmente `liderUsuarioId` (usuario existente) o `nuevoUsuario` (crea el usuario y el área en una sola transacción).

## Frontend (`frontend/`)

```bash
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_URL si el backend no corre en localhost:5000
npm run dev
```

Tests:

```bash
cd frontend
npm test
```

El módulo Documentos (`/documentos`) ya está implementado: listado con filtros (área, carpeta, tipo, estado) y paginación, creación con subida de archivo, y detalle (`/documentos/:id`) con edición de metadata, historial de versiones, subida de nueva versión, y descarga de archivos.

El módulo de Usuarios (`Administración > Usuarios`) ya está implementado: listado, creación, edición (incluye reseteo de contraseña) y baja lógica. El modal "Crear área" permite asignar un líder creando un usuario nuevo inline o eligiendo uno existente.

`DatePicker`, `FilterDropdown`, y `AccionesDropdown` (portados del CRM Centhrix) ya están disponibles en `components/common/` e integrados en el listado de Documentos (filtros, toolbar, y fechas de vigencia). La gestión de carpetas se hizo pantalla propia (`/documentos/carpetas`), reemplazando el modal anterior.

### Convenciones de nombres (estado y variables)

- **Idioma:** nombres de estado, props y campos de dominio en español (`cargando`, `modalAbierto`, `usuarios`, `areaId`), consistente con el resto del código. Excepción deliberada: los campos de paginación (`page`, `limit`, `total`, `totalPages`) se dejan en inglés porque replican 1:1 el contrato del backend (mismos nombres en el query param y en el envelope de `paginated()` — ver `server/src/utils/responses.js`); traducirlos solo agregaría una capa de mapeo sin beneficio.
- **Booleanos:** adjetivo o gerundio en español, sin prefijo `is`/`es`/`tiene` (`cargando`, `enviando`, `modalAbierto`, `activo`). `useViewMode.js`'s `esVistaMovil` es una excepción heredada — no replicar ese prefijo en código nuevo.
- **Estados de error:** sufijo `Error` después del concepto (`archivoError`, `archivoVersionError`). `Login.jsx`'s `errorApi` es una excepción heredada (prefijo) — en código nuevo usar el sufijo.
- **Setters:** siempre `[x, setX]` con el mismo casing exacto del estado — ya se sigue así en todo el código, mantenerlo.
- **Parámetros de submit de formularios:** siempre `valores` (nunca `data`/`datos`/`values`) para el objeto que entrega `handleSubmit` — ya es 100% consistente, mantenerlo.

Estas reglas aplican a código nuevo; no se hizo un refactor retroactivo del código existente.
