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
- Diseño de la vista de carpetas estilo Google Drive (navegación por tarjetas, migas de pan, y detalle de carpeta): `docs/superpowers/specs/2026-07-08-cod-carpetas-vista-drive-design.md`
- Diseño del Detalle de Área (info del área, líder resuelto, conteo de carpetas/documentos, navegación cruzada): `docs/superpowers/specs/2026-07-09-cod-detalle-area-design.md`
- Diseño del módulo de Proveedores y Contratistas (CRUD, expediente documental con checklist de requisitos, subida/descarga de documentos): `docs/superpowers/specs/2026-07-09-cod-proveedores-design.md`
- Diseño de la aprobación de proveedores y creación de su carpeta en Documentos: `docs/superpowers/specs/2026-07-09-cod-proveedores-aprobacion-carpeta-design.md`
- Diseño de la pantalla de Logs del servidor (tráfico HTTP y errores no controlados, purga diaria a los 14 días, solo admin): `docs/superpowers/specs/2026-07-09-cod-logs-servidor-design.md`
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

La gestión de carpetas (`/documentos/carpetas`) es una vista de tarjetas navegable estilo Google Drive: se entra a una carpeta haciendo clic en su tarjeta, una miga de pan permite volver a cualquier nivel superior, un botón de información abre el detalle de una carpeta (ruta, fecha de creación, cantidad de subcarpetas, y acceso directo a sus documentos), y "Nueva carpeta" crea una carpeta con la carpeta padre implícita según el nivel donde se esté parado.

El detalle de un área (`/areas/:id`, accesible desde `AreasListado`) muestra su información (nombre, código, salud documental, líder resuelto), y dos accesos directos con conteo: "Ver carpetas" (`/documentos/carpetas?areaId=`) y "Ver documentos" (`/documentos?areaId=`, con desglose por estado). Es de solo lectura — no permite editar ni dar de baja el área.

El módulo de Proveedores y Contratistas (`/proveedores`) ya está implementado: listado con filtros (estado, tipo, criticidad), creación (con selección del área solicitante), y detalle (`/proveedores/:id`) con edición inline, baja lógica, y expediente documental — un checklist de los requisitos aplicables según la criticidad del proveedor (Cámara de Comercio, RUT, Certificado SST, Certificado SARLAFT, Póliza de responsabilidad civil), y subida/descarga/eliminación de los documentos que los cubren, con cálculo automático de vigencia (vigente/por vencer/vencido, umbral fijo de 30 días). Mientras el proveedor está `en_evaluacion`, se puede Aprobar (crea su carpeta en el área solicitante dentro del módulo Documentos, con una subcarpeta a su nombre bajo una carpeta raíz "Proveedores", y refleja ahí — una sola vez — cada documento ya subido al expediente) o Rechazar (con motivo).

`Administración > Logs del servidor` (`/administracion/logs`, solo rol `admin`) muestra el tráfico HTTP y los errores no controlados del backend, paginado y filtrable por nivel (info/warn/error), método, rango de fechas y texto libre. Los registros se purgan automáticamente a los 14 días (`npm run job:purgar-logs` para forzarlo manualmente).

**Limitación conocida:** el nombre del líder solo se resuelve para usuarios con permiso `usuarios:ver` (hoy, solo `admin`) — `GET /usuarios/:id` está gateado por ese permiso, y los roles que acceden a `/areas/:id` (`financiera`, `lider_area`, `solicitante`, todos con `areas:ver`) no lo tienen. Para el resto de roles, la sección de líder muestra "Sin líder asignado" aunque sí haya uno asignado. Fast-follow pendiente: resolver el nombre del líder directamente en `GET /areas/:id` (backend) en vez de depender de `usuarioService.obtener`.

### Convenciones de nombres (estado y variables)

- **Idioma:** nombres de estado, props y campos de dominio en español (`cargando`, `modalAbierto`, `usuarios`, `areaId`), consistente con el resto del código. Excepción deliberada: los campos de paginación (`page`, `limit`, `total`, `totalPages`) se dejan en inglés porque replican 1:1 el contrato del backend (mismos nombres en el query param y en el envelope de `paginated()` — ver `server/src/utils/responses.js`); traducirlos solo agregaría una capa de mapeo sin beneficio.
- **Booleanos:** adjetivo o gerundio en español, sin prefijo `is`/`es`/`tiene` (`cargando`, `enviando`, `modalAbierto`, `activo`). `useViewMode.js`'s `esVistaMovil` es una excepción heredada — no replicar ese prefijo en código nuevo.
- **Estados de error:** sufijo `Error` después del concepto (`archivoError`, `archivoVersionError`). `Login.jsx`'s `errorApi` es una excepción heredada (prefijo) — en código nuevo usar el sufijo.
- **Setters:** siempre `[x, setX]` con el mismo casing exacto del estado — ya se sigue así en todo el código, mantenerlo.
- **Parámetros de submit de formularios:** siempre `valores` (nunca `data`/`datos`/`values`) para el objeto que entrega `handleSubmit` — ya es 100% consistente, mantenerlo.

Estas reglas aplican a código nuevo; no se hizo un refactor retroactivo del código existente.
