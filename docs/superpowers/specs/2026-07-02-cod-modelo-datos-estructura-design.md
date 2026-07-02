# COD (Centro Operativo Documental) — Diseño inicial: estructura de carpetas y modelo de datos

**Fecha:** 2026-07-02
**Estado:** Aprobado por el usuario, pendiente de implementación.
**Alcance de este documento:** solo diseño (estructura de carpetas + modelo de datos + roles + contrato de layout/auditoría/integración). No incluye implementación de pantallas de detalle.

## Contexto

COD es un sistema hermano del CRM CenthriX (ISTHO S.A.S.): mismo lenguaje visual y mismas convenciones técnicas (`DESIGN_SYSTEM_CENTHRIX.md` es la fuente de verdad para tokens, componentes y patrones de backend/frontend), pero con un dominio propio centrado en centralizar procesos hoy dispersos en correo/WhatsApp — empezando por Compras, Proveedores/Contratistas y Repositorio documental SGI.

### Estructura de módulos (fijada de antemano)

1. Login
2. Inicio — dashboard adaptado por rol
3. Áreas — tarjetas por área con indicador de salud documental
4. Detalle de área — solo consulta/navegación (carpetas, formularios, solicitudes de esa área); no vive lógica de aprobación aquí
5. Documentos — carpetas por área, versión/vigencia/estado por documento
6. Solicitudes — módulo propio y transversal: solicitud → cotización(es) → aprobación por nivel → confirmación/orden formal
7. Proveedores y contratistas — expediente digital único, requisitos por criticidad, evaluación anual
8. Formularios — catálogo de plantillas; "iniciar" crea una instancia en Solicitudes
9. Reportes — por área
10. Administración — Usuarios, Roles, Matriz de accesos, Sesiones, Logs

## Decisiones de diseño (confirmadas con el usuario)

| Decisión | Elegida | Alternativas descartadas |
|---|---|---|
| Niveles de aprobación de Solicitudes | Tabla configurable `NivelAprobacion` (rango de monto + tipo + rol aprobador), editable desde Administración sin tocar código | Enum fijo hardcodeado; montos ya definidos por ISTHO |
| Ventana de alerta "por vencer" | Configurable por `TipoDocumento` (`dias_alerta_vencimiento_default`, override opcional en `Documento`) | Valor fijo global; configurable por área |
| Fórmula de salud documental | Simple: vigentes / (vigentes + por_vencer + vencidos) × 100 | Ponderada por criticidad del documento |
| Requisitos por criticidad de Proveedores | Checklist configurable (`RequisitoProveedor`), cargada por seed inicial y editable desde Administración | Lista ya definida por ISTHO; 3 niveles fijos en código |
| Carpetas de Documentos | Tabla `Carpeta` jerárquica (soporta subcarpetas vía `carpeta_padre_id`) | Campo de texto/ruta simple en `Documento` |
| Versionado de Documentos | Tabla `DocumentoVersionHistorial` — se conserva el archivo de cada versión anterior | Solo número de versión informativo, sin archivo histórico |
| Nombre de carpetas raíz del monorepo | `server/` y `frontend/` (igual al CRM) | `backend/` y `frontend/` |

## 1. Estructura de carpetas (monorepo)

Réplica exacta del patrón del CRM: mismos nombres de carpeta, mismos alias de Vite, misma ubicación de `Auditoria.js`, `responses.js`, middlewares.

```
COD/
├── server/
│   ├── src/
│   │   ├── config/            # database.js
│   │   ├── controllers/
│   │   ├── middlewares/       # auth.js, roles.js, rateLimiter.js, errorHandler.js, comprimir.js
│   │   ├── models/            # incl. Auditoria.js
│   │   ├── migrations/        # Umzug — YYYYMMDDHHMMSS-descripcion-kebab.js
│   │   ├── routes/            # index.js + un archivo por dominio
│   │   ├── scripts/           # seedRolesPermisos.js, seedModulosCod.js,
│   │   │                      # seedNivelesAprobacion.js, seedRequisitosProveedor.js,
│   │   │                      # seedTiposDocumento.js
│   │   ├── services/
│   │   └── utils/             # responses.js, helpers.js
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── api/                # @api — client.js + *.service.js
│   │   ├── assets/             # @assets
│   │   ├── components/
│   │   │   ├── auth/           # PrivateRoute, PermissionRoute, AdminRoute
│   │   │   ├── common/         # copiado íntegro del CRM (Button, Modal, DataTable, KpiCard, FilterDropdown, DatePicker, Input, EmptyState, StatusChip, AccionesDropdown...)
│   │   │   └── layout/         # FloatingHeader, Sidebar, ProtectedLayout
│   │   ├── context/            # @context — AuthContext, ThemeContext, NotificacionesContext
│   │   ├── hooks/               # @hooks
│   │   ├── pages/                # @pages — subcarpeta por módulo:
│   │   │                         #   inicio/ areas/ documentos/ solicitudes/
│   │   │                         #   proveedores/ formularios/ reportes/ administracion/
│   │   ├── styles/                # @styles
│   │   ├── utils/                   # @utils — chartColors.js, formatDate.js
│   │   └── main.jsx
│   ├── tailwind.config.js         # mismos tokens centhrix-* — sin paleta nueva
│   └── vite.config.js
├── docs/
│   └── architecture/
│       └── crm-integration.md     # contrato de integración futura (sección 6)
├── README.md
└── DESIGN_SYSTEM_CENTHRIX.md
```

**Renombres de marca respecto al CRM:**
- `TOKEN_KEY` → `cod_token`, `REFRESH_TOKEN_KEY` → `cod_refresh_token`
- `VITE_APP_NAME` → `COD`
- Bucket S3 propio: `istho-cod-files`
- Prefijo de `localStorage` de tour: `cod_tour_*`

## 2. Modelo de datos

### Area
```
id, nombre, codigo (FIN/OPS/SGI/TI...), lider_usuario_id (FK Usuario),
salud_documental_pct (cacheado, recalculado en cada write de Documento),
activo, created_at, updated_at
```

### Carpeta
Jerárquica, por área — soporta navegación tipo árbol y subcarpetas.
```
id, area_id (FK Area), nombre, carpeta_padre_id (FK Carpeta, nullable), orden, activo
```

### TipoDocumento
Catálogo que habilita la ventana de alerta configurable por tipo.
```
id, nombre, dias_alerta_vencimiento_default, activo
```

### Documento
```
id, area_id (FK Area), carpeta_id (FK Carpeta), tipo_documento_id (FK TipoDocumento),
nombre, codigo (ej. GC-FT-04 si aplica), version (etiqueta de la versión actual),
vigencia_desde (DATEONLY), vigencia_hasta (DATEONLY, nullable si no aplica),
dias_alerta_vencimiento (override opcional; si es null hereda de TipoDocumento),
estado (vigente | por_vencer | vencido | sin_vigencia
        — columna derivada, recalculada por job diario + al guardar),
s3_key, responsable_usuario_id (FK Usuario), activo, created_at, updated_at
```

### DocumentoVersionHistorial
Se crea automáticamente cuando `Documento` recibe una nueva versión — conserva el archivo y metadatos de la versión reemplazada.
```
id, documento_id (FK Documento), version, s3_key,
vigencia_desde, vigencia_hasta, subido_por_usuario_id (FK Usuario), created_at
```

### PlantillaFormulario
Catálogo de plantillas únicamente. Nunca guarda estado de aprobación — eso vive en `Solicitud`.
```
id, codigo (ej. GC-FT-04, unique), nombre, area_id (FK Area), version,
s3_key, activo, created_at, updated_at
```

### TipoSolicitud
Catálogo (ej. compra, contratación_servicio).
```
id, nombre, activo
```

### NivelAprobacion
Tabla configurable — define qué rol aprueba según rango de monto y tipo de solicitud.
```
id, tipo_solicitud_id (FK TipoSolicitud), monto_desde, monto_hasta (nullable = sin techo),
rol_aprobador, orden (para escalonamiento multinivel), activo
```

### Solicitud
Módulo transversal — no anidado en área. El botón "iniciar" de una `PlantillaFormulario` crea una instancia aquí.
```
id, codigo (ej. SOL-2026-0001), tipo_solicitud_id (FK TipoSolicitud),
area_solicitante_id (FK Area), plantilla_origen_id (FK PlantillaFormulario, nullable),
solicitante_usuario_id (FK Usuario), descripcion,
monto_estimado (nullable hasta tener cotizaciones),
nivel_aprobacion_id (FK NivelAprobacion, resuelto al fijar el monto),
estado (borrador | cotizando | en_aprobacion | aprobada | rechazada |
        confirmada | cerrada | cancelada),
orden_formal_numero, orden_formal_s3_key (nullable), created_at, updated_at
```

### Cotizacion
```
id, solicitud_id (FK Solicitud), proveedor_id (FK Proveedor, nullable),
monto, s3_key, seleccionada (bool), observaciones, created_at
```

### SolicitudAprobacion
Cadena de aprobación de negocio — separada de `Auditoria` (que es el log técnico/de seguridad de todo write). Esta tabla reconstruye el timeline de aprobación en la UI.
```
id, solicitud_id (FK Solicitud), nivel_aprobacion_id (FK NivelAprobacion),
aprobador_usuario_id (FK Usuario), estado (pendiente | aprobado | rechazado),
comentario, orden, fecha_resolucion
```

### Proveedor
Expediente digital único por proveedor/contratista.
```
id, tipo (proveedor | contratista), documento_identificacion, razon_social,
criticidad (alta | media | baja), categoria, responsable_usuario_id (FK Usuario),
estado (activo | inactivo | en_evaluacion | suspendido),
fecha_ultima_evaluacion, fecha_proxima_evaluacion, created_at, updated_at
```

### RequisitoProveedor
Checklist configurable de requisitos por nivel de criticidad (legal, SST, SARLAFT, calidad).
```
id, nombre (ej. "Certificado SARLAFT"), criticidad_minima (alta | media | baja),
obligatorio (bool), vigencia_aplica (bool), activo
```

### ProveedorDocumento
El expediente en sí: documentos del proveedor, mapeados opcionalmente a un requisito del catálogo.
```
id, proveedor_id (FK Proveedor), requisito_id (FK RequisitoProveedor, nullable si es libre),
s3_key, vigencia_desde, vigencia_hasta, estado (vigente | por_vencer | vencido),
version, created_at, updated_at
```

### EvaluacionProveedor
Evaluación anual con recordatorio automático (basado en `fecha_proxima_evaluacion` de `Proveedor`).
```
id, proveedor_id (FK Proveedor), periodo (año), fecha_programada,
fecha_realizada (nullable), responsable_usuario_id (FK Usuario),
puntaje, estado (pendiente | en_proceso | completada | vencida), observaciones
```

### Matriz de accesos
Mismo formato de permisos granulares del CRM: `Rol`, `Permiso` (catálogo módulo/acción), `RolPermiso` (join). Catálogo de módulos y acciones para COD:

```js
{
  inicio:          ['ver'],
  areas:           ['ver'],
  area_detalle:    ['ver'],
  documentos:      ['ver', 'crear', 'editar', 'eliminar', 'aprobar_version', 'exportar'],
  solicitudes:     ['ver', 'crear', 'comentar', 'cotizar', 'aprobar', 'confirmar', 'exportar'],
  proveedores:     ['ver', 'crear', 'editar', 'eliminar', 'evaluar', 'exportar'],
  formularios:     ['ver', 'crear', 'editar', 'eliminar'],
  reportes:        ['ver', 'exportar'],
  usuarios:        ['ver', 'crear', 'editar', 'eliminar'],
  roles:           ['ver', 'crear', 'editar', 'eliminar'],
  matriz_accesos:  ['ver', 'editar'],
  sesiones:        ['ver', 'cerrar'],
  auditoria:       ['ver'],
  perfil:          ['ver', 'cambiar_password'],
}
```

## 3. Roles iniciales

| Rol | Nivel jerárquico | Alcance |
|---|---|---|
| `admin` | 100 | Acceso total |
| `financiera` | 80 | Aprueba solicitudes (niveles altos), hereda la gestión de compras |
| `lider_area` | 60 | Gestiona documentos/formularios/solicitudes de su área; aprueba niveles bajos de su área |
| `operaciones` | 50 | Crea/valida proveedores de transporte |
| `solicitante` | 30 | Cualquier área — inicia solicitudes, consulta documentos |
| `auditor` | 20 | Solo lectura + módulo Auditoría/Logs |

Cache de permisos TTL 60s (`cargarCachePermisos()` / `invalidarCachePermisos()`) se copia sin cambios del CRM.

## 4. Layout base del frontend

- **Sidebar:** los 10 módulos definidos (`inicio, areas, documentos, solicitudes, proveedores, formularios, reportes, administracion`). `area_detalle` no es un ítem de sidebar — se navega desde una tarjeta de `Areas`.
- **Header:** `FloatingHeader` reutilizado con atajos `G + letra` análogos a los del CRM.
- **Dashboard Inicio:** adaptado por rol vía `hasPermission()` / helpers de `req.user` — no es un dashboard genérico. KPIs: pendientes de aprobación (financiera/líder de área), alertas de vigencia documental (documentos por vencer), % de documentos al día (global o por área según el rol).
- Tokens de color/tipografía: los mismos `centhrix-*` documentados en `DESIGN_SYSTEM_CENTHRIX.md` — sin paleta nueva.

## 5. Auditoría obligatoria

`Auditoria.registrar()` se copia tal cual del CRM (mismo modelo, mismos parámetros: `tabla`, `registro_id`, `accion`, `usuario_id`, `usuario_nombre`, `datos_anteriores`, `datos_nuevos`, `ip_address`, `user_agent`, `descripcion`). Se invoca en todo controller de escritura de: `Area`, `Carpeta`, `Documento`, `PlantillaFormulario`, `Solicitud`, `Cotizacion`, `SolicitudAprobacion`, `Proveedor`, `ProveedorDocumento`, `EvaluacionProveedor`, `Usuario`, `Rol`, `RolPermiso`.

Un fallo en el registro de auditoría no interrumpe la operación principal (mismo comportamiento del CRM).

## 6. Punto de integración futura con el CRM (solo diseño — no implementar aún)

Documentado en `docs/architecture/crm-integration.md`:

- Cliente HTTP interno `crmClient.js` en COD, análogo a `wmsSyncService.js` del CRM.
- Autenticación: header `x-api-key`, mismo patrón que `powerbiAuth.js`.
- Endpoints propuestos en el CRM (a construir en una fase futura, no ahora): `/api/v1/integraciones/cod/proveedores`, `/api/v1/integraciones/cod/operaciones`.
- Modo: PULL bajo demanda — COD consulta al CRM al crear/consultar un `Proveedor` o para reportes cruzados. Sin sincronización automática (push/pull programado) en esta fase.

## Fuera de alcance de este documento

- Implementación de pantallas de detalle de cada módulo.
- Definición final de montos exactos para `NivelAprobacion` (se cargan por seed inicial editable, sin valores de negocio reales todavía).
- Lista final de `RequisitoProveedor` por criticidad (seed inicial editable, pendiente de validación con SGI/SST/Legal de ISTHO).
- Construcción del cliente `crmClient.js` y las rutas de integración en el CRM.
