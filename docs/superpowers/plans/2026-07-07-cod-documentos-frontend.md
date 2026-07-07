# COD Documentos Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real Documentos frontend module (listado, creación, edición, historial de versiones, descarga, gestión de carpetas) that consumes the already-merged Documentos/Carpetas/TiposDocumento HTTP API, replacing the `ProximamentePage` placeholder at `/documentos`.

**Architecture:** Follow the Áreas module pattern exactly (imperative `useEffect` fetch, `useViewMode` for lista/tarjetas, `StatusChip`, `react-hook-form` + `Modal` for forms, `useSnackbar` for feedback). Add one genuinely new piece of infrastructure this module needs that Áreas didn't: a `Pagination` component (first screen to consume the `pagination` envelope field) and a `validarArchivo` util (client-side mirror of the backend's file-type/size rules). `DocumentoDetalle` is the project's first parameterized route (`/documentos/:id`).

**Tech Stack:** React 19, react-router-dom 7, react-hook-form 7, axios (via the existing `apiClient` singleton), notistack, Vitest + Testing Library + axios-mock-adapter for tests.

## Global Constraints

- Every new page/component follows the exact file-per-responsibility layout already used by Áreas: `pages/<modulo>/`, `api/<entidad>.service.js`, `components/common/<Componente>/<Componente>.jsx`.
- API services are plain functions exported as a default object (`export default { listar, crear, ... }`), never a class — matches `area.service.js`.
- `apiClient`'s response interceptor already unwraps `response.data` to the backend's envelope body — for **non-paginated** endpoints a service returns `response.data` (the inner `data` field). For **paginated** endpoints (`documentoService.listar`), the service must return `{ data: response.data, pagination: response.pagination }` — the `pagination` field is a sibling of `data` in the raw backend envelope, not nested inside it.
- Permission gating uses `tienePermiso('documentos', accion)` from `useAuth()` for every action button, with the exact action name from the backend route table: `ver`, `crear`, `editar`, `eliminar`, `aprobar_version` (subir nueva versión), `exportar` (ambas descargas). Never gate an action button with `isAdmin` in this module.
- File upload fields always use the exact FormData key `archivo` (the backend's `multer.single('archivo')` expects this key name).
- `responsableUsuarioId` is NOT part of any form in this phase (no `/usuarios` endpoint exists yet to build a picker) — omit it entirely from create/edit payloads.
- `carpetaId`/`tipoDocumentoId`/`areaId` in Documento rows are raw foreign keys — the backend never expands them. Any screen showing a document must resolve names client-side from separately-loaded catalogs (`/areas`, `/tipos-documento`, `/carpetas?areaId=`), never assume embedded names.
- `DocumentoDetalle` (`/documentos/:id`) is reachable directly by URL and must load its own catalogs on mount — it must never assume `DocumentosListado`'s state exists.
- File downloads use `apiClient.get(url, { responseType: 'blob' })` + `URL.createObjectURL` + a temporary `<a download>` click — never a bare `<a href>` to the backend (the `Authorization` header is required and isn't sent by a plain anchor).
- Dates in forms use native `<input type="date">` (values are `YYYY-MM-DD` strings, matching the backend's `DATEONLY` fields directly — no date library needed).
- Test convention: Vitest + `@testing-library/react` + `@testing-library/user-event`; page/component tests `vi.mock` the relevant `api/*.service` modules and `../../context/AuthContext`'s `useAuth`; service tests use `axios-mock-adapter` against the real `apiClient` (see `area.service.test.js` for the exact pattern — `new MockAdapter(apiClient)` in `beforeEach`, `mock.restore()` in `afterEach`).
- Every new component/page ships with its `.test.jsx`/`.test.js` sibling in the same commit — no task is "done" without its tests passing.

---

### Task 1: Client-side file validation util

**Files:**
- Create: `frontend/src/utils/validarArchivo.js`
- Test: `frontend/src/utils/validarArchivo.test.js`

**Interfaces:**
- Produces: `validarArchivo(file)` → `string | null`. Returns an error message string if the file fails type or size validation, `null` if it's valid. Consumed by Task 5 (crear documento) and Task 8 (subir nueva versión).
- Produces: exported constants `TIPOS_PERMITIDOS` (Set of MIME type strings) and `TAMANO_MAXIMO_BYTES` (number) for use in `<input accept="...">` construction by consuming tasks.

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/utils/validarArchivo.test.js
import { validarArchivo, TIPOS_PERMITIDOS, TAMANO_MAXIMO_BYTES } from './validarArchivo';

function crearArchivo({ type = 'application/pdf', size = 1024 } = {}) {
  const archivo = new File(['contenido'], 'documento.pdf', { type });
  Object.defineProperty(archivo, 'size', { value: size });
  return archivo;
}

describe('validarArchivo', () => {
  it('returns null for a valid PDF under the size limit', () => {
    expect(validarArchivo(crearArchivo({ type: 'application/pdf', size: 1024 }))).toBeNull();
  });

  it('accepts every mimetype in TIPOS_PERMITIDOS', () => {
    for (const type of TIPOS_PERMITIDOS) {
      expect(validarArchivo(crearArchivo({ type, size: 1024 }))).toBeNull();
    }
  });

  it('rejects an unsupported mimetype', () => {
    expect(validarArchivo(crearArchivo({ type: 'application/zip' }))).toBe('Tipo de archivo no permitido');
  });

  it('rejects a file over 20MB', () => {
    expect(validarArchivo(crearArchivo({ size: TAMANO_MAXIMO_BYTES + 1 }))).toBe('El archivo excede el tamaño máximo de 20MB');
  });

  it('accepts a file exactly at the 20MB limit', () => {
    expect(validarArchivo(crearArchivo({ size: TAMANO_MAXIMO_BYTES }))).toBeNull();
  });

  it('returns an error when no file is provided', () => {
    expect(validarArchivo(null)).toBe('El archivo es obligatorio');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- validarArchivo`
Expected: FAIL with "Failed to resolve import './validarArchivo'" (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```js
// frontend/src/utils/validarArchivo.js
export const TIPOS_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
]);

export const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024;

export function validarArchivo(file) {
  if (!file) return 'El archivo es obligatorio';
  if (!TIPOS_PERMITIDOS.has(file.type)) return 'Tipo de archivo no permitido';
  if (file.size > TAMANO_MAXIMO_BYTES) return 'El archivo excede el tamaño máximo de 20MB';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- validarArchivo`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/validarArchivo.js frontend/src/utils/validarArchivo.test.js
git commit -m "feat(frontend): add client-side file validation util for Documentos"
```

---

### Task 2: API services (documento, carpeta, tipoDocumento)

**Files:**
- Create: `frontend/src/api/documento.service.js`
- Create: `frontend/src/api/documento.service.test.js`
- Create: `frontend/src/api/carpeta.service.js`
- Create: `frontend/src/api/carpeta.service.test.js`
- Create: `frontend/src/api/tipoDocumento.service.js`
- Create: `frontend/src/api/tipoDocumento.service.test.js`

**Interfaces:**
- Consumes: `apiClient` default export from `frontend/src/api/client.js` (its response interceptor already returns `response.data`, i.e. the backend envelope body `{success, data, message, errors, code[, pagination]}`).
- Produces (consumed by Tasks 4-8):
  - `documentoService.listar(filtros)` → `Promise<{ data: Documento[], pagination: {page, limit, total, totalPages} }>`. `filtros` is `{areaId?, carpetaId?, tipoDocumentoId?, estado?, page?, limit?}`.
  - `documentoService.obtener(id)` → `Promise<Documento>`
  - `documentoService.crear(formData)` → `Promise<Documento>` (POST multipart)
  - `documentoService.editar(id, cambios)` → `Promise<Documento>` (PUT JSON)
  - `documentoService.eliminar(id)` → `Promise<null>`
  - `documentoService.listarVersiones(id)` → `Promise<DocumentoVersionHistorial[]>`
  - `documentoService.subirVersion(id, formData)` → `Promise<Documento>` (POST multipart)
  - `documentoService.descargar(id)` → `Promise<void>` (triggers browser download as a side effect)
  - `documentoService.descargarVersion(id, versionId)` → `Promise<void>` (triggers browser download as a side effect)
  - `carpetaService.listar(areaId)` → `Promise<Carpeta[]>` (tree-shaped, each node has `subcarpetas`)
  - `carpetaService.crear({areaId, nombre, carpetaPadreId})` → `Promise<Carpeta>`
  - `tipoDocumentoService.listar()` → `Promise<TipoDocumento[]>`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/api/documento.service.test.js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import documentoService from './documento.service';

describe('documento.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns data and pagination as siblings', async () => {
    mock.onGet('/documentos').reply(200, {
      success: true,
      data: [{ id: 1, nombre: 'Manual RH' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const resultado = await documentoService.listar({ areaId: 3 });
    expect(resultado).toEqual({
      data: [{ id: 1, nombre: 'Manual RH' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(mock.history.get[0].params).toEqual({ areaId: 3 });
  });

  it('obtener returns a single documento', async () => {
    mock.onGet('/documentos/5').reply(200, { success: true, data: { id: 5, nombre: 'Política SST' } });
    const documento = await documentoService.obtener(5);
    expect(documento).toEqual({ id: 5, nombre: 'Política SST' });
  });

  it('crear posts the given FormData and returns the created documento', async () => {
    const formData = new FormData();
    formData.append('nombre', 'Manual RH');
    mock.onPost('/documentos').reply(201, { success: true, data: { id: 1, nombre: 'Manual RH' } });
    const documento = await documentoService.crear(formData);
    expect(documento).toEqual({ id: 1, nombre: 'Manual RH' });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('editar PUTs the changes and returns the updated documento', async () => {
    mock.onPut('/documentos/1').reply(200, { success: true, data: { id: 1, nombre: 'Manual RH v2' } });
    const documento = await documentoService.editar(1, { nombre: 'Manual RH v2' });
    expect(documento).toEqual({ id: 1, nombre: 'Manual RH v2' });
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ nombre: 'Manual RH v2' });
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/documentos/1').reply(200, { success: true, data: null, message: 'Documento eliminado' });
    const resultado = await documentoService.eliminar(1);
    expect(resultado).toBeNull();
  });

  it('listarVersiones returns the version history array', async () => {
    mock.onGet('/documentos/1/versiones').reply(200, { success: true, data: [{ id: 9, version: 'v1' }] });
    const versiones = await documentoService.listarVersiones(1);
    expect(versiones).toEqual([{ id: 9, version: 'v1' }]);
  });

  it('subirVersion posts the given FormData to the versiones endpoint', async () => {
    const formData = new FormData();
    formData.append('version', 'v2');
    mock.onPost('/documentos/1/versiones').reply(200, { success: true, data: { id: 1, version: 'v2' } });
    const documento = await documentoService.subirVersion(1, formData);
    expect(documento).toEqual({ id: 1, version: 'v2' });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('descargar fetches the file as a blob and triggers a download', async () => {
    const blob = new Blob(['contenido'], { type: 'application/pdf' });
    mock.onGet('/documentos/1/descargar').reply(200, blob);

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const click = vi.fn();
    const anchorOriginal = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = anchorOriginal(tag);
      if (tag === 'a') el.click = click;
      return el;
    });

    await documentoService.descargar(1);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    document.createElement.mockRestore();
  });
});
```

```js
// frontend/src/api/carpeta.service.test.js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import carpetaService from './carpeta.service';

describe('carpeta.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar requests carpetas for the given area and returns the tree', async () => {
    mock.onGet('/carpetas').reply(200, { success: true, data: [{ id: 1, nombre: 'RRHH', subcarpetas: [] }] });
    const carpetas = await carpetaService.listar(3);
    expect(carpetas).toEqual([{ id: 1, nombre: 'RRHH', subcarpetas: [] }]);
    expect(mock.history.get[0].params).toEqual({ areaId: 3 });
  });

  it('crear posts the new carpeta and returns it', async () => {
    mock.onPost('/carpetas').reply(201, { success: true, data: { id: 2, nombre: 'Contratos' } });
    const carpeta = await carpetaService.crear({ areaId: 3, nombre: 'Contratos', carpetaPadreId: null });
    expect(carpeta).toEqual({ id: 2, nombre: 'Contratos' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ areaId: 3, nombre: 'Contratos', carpetaPadreId: null });
  });
});
```

```js
// frontend/src/api/tipoDocumento.service.test.js
import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import tipoDocumentoService from './tipoDocumento.service';

describe('tipoDocumento.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the tipos array', async () => {
    mock.onGet('/tipos-documento').reply(200, { success: true, data: [{ id: 1, nombre: 'Manual' }] });
    const tipos = await tipoDocumentoService.listar();
    expect(tipos).toEqual([{ id: 1, nombre: 'Manual' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- documento.service carpeta.service tipoDocumento.service`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Write the implementations**

```js
// frontend/src/api/documento.service.js
import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/documentos', { params: filtros });
  return { data: response.data, pagination: response.pagination };
}

async function obtener(id) {
  const response = await apiClient.get(`/documentos/${id}`);
  return response.data;
}

async function crear(formData) {
  const response = await apiClient.post('/documentos', formData);
  return response.data;
}

async function editar(id, cambios) {
  const response = await apiClient.put(`/documentos/${id}`, cambios);
  return response.data;
}

async function eliminar(id) {
  const response = await apiClient.delete(`/documentos/${id}`);
  return response.data;
}

async function listarVersiones(id) {
  const response = await apiClient.get(`/documentos/${id}/versiones`);
  return response.data;
}

async function subirVersion(id, formData) {
  const response = await apiClient.post(`/documentos/${id}/versiones`, formData);
  return response.data;
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

async function descargar(id) {
  const blob = await apiClient.get(`/documentos/${id}/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `documento-${id}`);
}

async function descargarVersion(id, versionId) {
  const blob = await apiClient.get(`/documentos/${id}/versiones/${versionId}/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `documento-${id}-version-${versionId}`);
}

export default { listar, obtener, crear, editar, eliminar, listarVersiones, subirVersion, descargar, descargarVersion };
```

```js
// frontend/src/api/carpeta.service.js
import apiClient from './client';

async function listar(areaId) {
  const response = await apiClient.get('/carpetas', { params: { areaId } });
  return response.data;
}

async function crear({ areaId, nombre, carpetaPadreId }) {
  const response = await apiClient.post('/carpetas', { areaId, nombre, carpetaPadreId: carpetaPadreId ?? null });
  return response.data;
}

export default { listar, crear };
```

```js
// frontend/src/api/tipoDocumento.service.js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/tipos-documento');
  return response.data;
}

export default { listar };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- documento.service carpeta.service tipoDocumento.service`
Expected: PASS (all tests)

**Note on `descargar`'s responseType:blob interceptor behavior:** `apiClient`'s response interceptor does `response => response.data` unconditionally (see `client.js:40`), so with `responseType: 'blob'` the resolved value of `apiClient.get(...)` is already the `Blob` itself (axios puts the blob in `response.data` when `responseType: 'blob'` is set, and the interceptor unwraps it) — this is why `descargar`/`descargarVersion` treat the awaited value directly as a blob rather than reaching into `.data`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/documento.service.js frontend/src/api/documento.service.test.js frontend/src/api/carpeta.service.js frontend/src/api/carpeta.service.test.js frontend/src/api/tipoDocumento.service.js frontend/src/api/tipoDocumento.service.test.js
git commit -m "feat(frontend): add API services for Documentos, Carpetas, and Tipos de Documento"
```

---

### Task 3: Pagination component

**Files:**
- Create: `frontend/src/components/common/Pagination/Pagination.jsx`
- Test: `frontend/src/components/common/Pagination/Pagination.test.jsx`

**Interfaces:**
- Consumes: nothing project-specific (pure presentational component).
- Produces: `<Pagination pagination={{page, limit, total, totalPages}} onPageChange={(nuevaPagina) => void} />`. Renders nothing (`null`) when `pagination.totalPages <= 1`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/common/Pagination/Pagination.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(<Pagination pagination={{ page: 1, limit: 20, total: 5, totalPages: 1 }} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current page and total pages', () => {
    render(<Pagination pagination={{ page: 2, limit: 20, total: 45, totalPages: 3 }} onPageChange={() => {}} />);
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
  });

  it('disables "Anterior" on the first page', () => {
    render(<Pagination pagination={{ page: 1, limit: 20, total: 45, totalPages: 3 }} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('disables "Siguiente" on the last page', () => {
    render(<Pagination pagination={{ page: 3, limit: 20, total: 45, totalPages: 3 }} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('calls onPageChange with page + 1 when "Siguiente" is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination pagination={{ page: 1, limit: 20, total: 45, totalPages: 3 }} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with page - 1 when "Anterior" is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination pagination={{ page: 2, limit: 20, total: 45, totalPages: 3 }} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Pagination`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/components/common/Pagination/Pagination.jsx
import PropTypes from 'prop-types';
import Button from '../Button/Button';

export default function Pagination({ pagination, onPageChange }) {
  const { page, totalPages } = pagination;

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-slate-500 dark:text-slate-400">
        Página {page} de {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Siguiente
      </Button>
    </div>
  );
}

Pagination.propTypes = {
  pagination: PropTypes.shape({
    page: PropTypes.number.isRequired,
    limit: PropTypes.number.isRequired,
    total: PropTypes.number.isRequired,
    totalPages: PropTypes.number.isRequired,
  }).isRequired,
  onPageChange: PropTypes.func.isRequired,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Pagination`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Pagination/Pagination.jsx frontend/src/components/common/Pagination/Pagination.test.jsx
git commit -m "feat(frontend): add Pagination component"
```

---

### Task 4: DocumentosListado — read-only list with filters, pagination, and name resolution

**Files:**
- Create: `frontend/src/pages/documentos/DocumentosListado.jsx`
- Create: `frontend/src/pages/documentos/DocumentosListado.test.jsx`
- Modify: `frontend/src/App.jsx:39-46` (replace the `ProximamentePage` placeholder with `DocumentosListado`)

**Interfaces:**
- Consumes: `documentoService.listar(filtros)`, `carpetaService.listar(areaId)` (flattened, see below), `tipoDocumentoService.listar()`, `areaService.listar()` (already exists), `useViewMode`, `useAuth().tienePermiso`, `StatusChip`, `DataTable`, `ViewToggle`, `EmptyState`, `Pagination` (Task 3).
- Produces: default export `DocumentosListado` (no props). Also produces and exports a helper `aplanarCarpetas(arbol)` → flat `[{id, nombre, areaId}]` array (recursively walks `subcarpetas`) — reused as-is by Task 5 (carpeta select in the create form) and Task 6 (`CarpetasModal`). Exported as a named export from the same file so later tasks can `import { aplanarCarpetas } from './DocumentosListado'`.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/documentos/DocumentosListado.test.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import DocumentosListado from './DocumentosListado';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/documento.service');
vi.mock('../../api/carpeta.service');
vi.mock('../../api/tipoDocumento.service');
vi.mock('../../api/area.service');
vi.mock('../../context/AuthContext');

const AREAS = [{ id: 1, nombre: 'RRHH', codigo: 'RRHH' }];
const TIPOS = [{ id: 1, nombre: 'Manual' }];
const CARPETAS_ARBOL = [{ id: 10, nombre: 'Contratos', areaId: 1, carpetaPadreId: null, subcarpetas: [] }];
const DOCUMENTOS = [{ id: 1, nombre: 'Manual RH', codigo: 'RH-001', areaId: 1, carpetaId: 10, tipoDocumentoId: 1, estado: 'vigente' }];
const PAGINACION = { page: 1, limit: 20, total: 1, totalPages: 1 };

function renderPagina() {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <DocumentosListado />
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('DocumentosListado', () => {
  beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1280;
    useAuth.mockReturnValue({ tienePermiso: () => false });
    areaService.listar.mockResolvedValue(AREAS);
    tipoDocumentoService.listar.mockResolvedValue(TIPOS);
    carpetaService.listar.mockResolvedValue(CARPETAS_ARBOL);
    documentoService.listar.mockResolvedValue({ data: DOCUMENTOS, pagination: PAGINACION });
  });

  it('renders the empty state when there are no documentos', async () => {
    documentoService.listar.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    renderPagina();
    expect(await screen.findByText('Sin documentos todavía')).toBeInTheDocument();
  });

  it('resolves área, carpeta, and tipo names in the table instead of raw ids', async () => {
    renderPagina();
    await screen.findByText('Manual RH');

    // Carpeta names only resolve once a área filter is active — the catalog is loaded
    // per-area (see the Global Constraints), not for every área a mixed page might contain.
    await userEvent.selectOptions(screen.getByLabelText('Área'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));

    const fila = (await screen.findByText('Manual RH')).closest('tr');
    expect(within(fila).getByText('RRHH')).toBeInTheDocument();
    expect(within(fila).getByText('Contratos')).toBeInTheDocument();
    expect(within(fila).getByText('Manual')).toBeInTheDocument();
  });

  it('shows the estado StatusChip for each documento', async () => {
    renderPagina();
    const fila = (await screen.findByText('Manual RH')).closest('tr');
    expect(within(fila).getByText('vigente')).toBeInTheDocument();
  });

  it('hides "Crear documento" and "Gestionar carpetas" without the crear permission', async () => {
    renderPagina();
    await screen.findByText('Manual RH');
    expect(screen.queryByRole('button', { name: /crear documento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gestionar carpetas/i })).not.toBeInTheDocument();
  });

  it('shows "Crear documento" and "Gestionar carpetas" with the crear permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    renderPagina();
    await screen.findByText('Manual RH');
    expect(screen.getByRole('button', { name: /crear documento/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gestionar carpetas/i })).toBeInTheDocument();
  });

  it('re-fetches with the estado filter when it changes', async () => {
    renderPagina();
    await screen.findByText('Manual RH');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'vencido');
    await waitFor(() => expect(documentoService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'vencido', page: 1 })));
  });

  it('re-fetches carpetas for the chosen área and resets the carpeta filter', async () => {
    renderPagina();
    await screen.findByText('Manual RH');
    await userEvent.selectOptions(screen.getByLabelText('Área'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenLastCalledWith(1));
  });

  it('requests the next page when Pagination fires onPageChange', async () => {
    documentoService.listar.mockResolvedValue({
      data: DOCUMENTOS,
      pagination: { page: 1, limit: 20, total: 40, totalPages: 2 },
    });
    renderPagina();
    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(documentoService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('shows an error and an empty state when loading fails', async () => {
    documentoService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('Sin documentos todavía')).toBeInTheDocument();
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- DocumentosListado`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/pages/documentos/DocumentosListado.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { FileText } from 'lucide-react';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import Button from '../../components/common/Button/Button';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import Pagination from '../../components/common/Pagination/Pagination';

const ESTADOS = ['vigente', 'por_vencer', 'vencido', 'sin_vigencia'];

export function aplanarCarpetas(arbol, prefijo = '') {
  return arbol.flatMap((carpeta) => {
    const ruta = prefijo ? `${prefijo} / ${carpeta.nombre}` : carpeta.nombre;
    return [{ id: carpeta.id, nombre: carpeta.nombre, ruta, areaId: carpeta.areaId }, ...aplanarCarpetas(carpeta.subcarpetas || [], ruta)];
  });
}

function DocumentoCard({ documento, nombresPorId, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{documento.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{documento.codigo}</p>
        </div>
        <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
        {nombresPorId.areas[documento.areaId]} / {nombresPorId.carpetas[documento.carpetaId]} · {nombresPorId.tipos[documento.tipoDocumentoId]}
      </p>
      <StatusChip status={documento.estado} />
    </div>
  );
}

export default function DocumentosListado() {
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_documentos');

  const [areas, setAreas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [paginacion, setPaginacion] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [cargando, setCargando] = useState(true);
  const [carpetasModalAbierto, setCarpetasModalAbierto] = useState(false);
  const [crearModalAbierto, setCrearModalAbierto] = useState(false);
  const [filtros, setFiltros] = useState({ areaId: '', carpetaId: '', tipoDocumentoId: '', estado: '', page: 1 });

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [areasData, tiposData] = await Promise.all([areaService.listar(), tipoDocumentoService.listar()]);
        setAreas(areasData);
        setTipos(tiposData);
      } catch {
        setAreas([]);
        setTipos([]);
      }
    }
    cargarCatalogos();
  }, []);

  useEffect(() => {
    async function cargarCarpetas() {
      if (!filtros.areaId) {
        setCarpetas([]);
        return;
      }
      try {
        const arbol = await carpetaService.listar(Number(filtros.areaId));
        setCarpetas(aplanarCarpetas(arbol));
      } catch {
        setCarpetas([]);
      }
    }
    cargarCarpetas();
  }, [filtros.areaId]);

  async function cargarDocumentos() {
    setCargando(true);
    try {
      const { data, pagination } = await documentoService.listar({
        areaId: filtros.areaId || undefined,
        carpetaId: filtros.carpetaId || undefined,
        tipoDocumentoId: filtros.tipoDocumentoId || undefined,
        estado: filtros.estado || undefined,
        page: filtros.page,
      });
      setDocumentos(data);
      setPaginacion(pagination);
    } catch (error) {
      setDocumentos([]);
      setPaginacion({ page: 1, limit: 20, total: 0, totalPages: 0 });
      enqueueSnackbar(error?.message || 'No se pudieron cargar los documentos', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: valor,
      ...(campo === 'areaId' ? { carpetaId: '' } : {}),
      page: 1,
    }));
  }

  const nombresPorId = {
    areas: Object.fromEntries(areas.map((a) => [a.id, a.nombre])),
    carpetas: Object.fromEntries(carpetas.map((c) => [c.id, c.ruta])),
    tipos: Object.fromEntries(tipos.map((t) => [t.id, t.nombre])),
  };

  const columnas = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'codigo', label: 'Código' },
    { key: 'areaId', label: 'Área', render: (valor) => nombresPorId.areas[valor] || valor },
    { key: 'carpetaId', label: 'Carpeta', render: (valor) => nombresPorId.carpetas[valor] || valor },
    { key: 'tipoDocumentoId', label: 'Tipo', render: (valor) => nombresPorId.tipos[valor] || valor },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Documentos</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('documentos', 'crear') && (
            <>
              <Button variant="outline" onClick={() => setCarpetasModalAbierto(true)}>
                Gestionar carpetas
              </Button>
              <Button onClick={() => setCrearModalAbierto(true)}>Crear documento</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div>
          <label htmlFor="filtro-area" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Área
          </label>
          <select
            id="filtro-area"
            value={filtros.areaId}
            onChange={(e) => actualizarFiltro('areaId', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Todas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-carpeta" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Carpeta
          </label>
          <select
            id="filtro-carpeta"
            value={filtros.carpetaId}
            disabled={!filtros.areaId}
            onChange={(e) => actualizarFiltro('carpetaId', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
          >
            <option value="">Todas</option>
            {carpetas.map((carpeta) => (
              <option key={carpeta.id} value={carpeta.id}>
                {carpeta.ruta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-tipo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Tipo
          </label>
          <select
            id="filtro-tipo"
            value={filtros.tipoDocumentoId}
            onChange={(e) => actualizarFiltro('tipoDocumentoId', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Todos</option>
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-estado" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Estado
          </label>
          <select
            id="filtro-estado"
            value={filtros.estado}
            onChange={(e) => actualizarFiltro('estado', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!cargando && documentos.length === 0 && (
        <EmptyState icon={FileText} title="Sin documentos todavía" description="Crea el primer documento para empezar a organizar el centro documental." />
      )}

      {documentos.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={documentos} loading={cargando} emptyMessage="Sin documentos todavía" onRowClick={(row) => navigate(`/documentos/${row.id}`)} />
      )}

      {documentos.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documentos.map((documento) => (
            <DocumentoCard key={documento.id} documento={documento} nombresPorId={nombresPorId} onClick={() => navigate(`/documentos/${documento.id}`)} />
          ))}
        </div>
      )}

      <Pagination pagination={paginacion} onPageChange={(page) => setFiltros((prev) => ({ ...prev, page }))} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- DocumentosListado`
Expected: PASS (9 tests)

- [ ] **Step 5: Wire the route in `App.jsx`**

```jsx
// frontend/src/App.jsx — replace lines 39-46
                <Route
                  path="/documentos"
                  element={
                    <PermissionRoute modulo="documentos" accion="ver">
                      <DocumentosListado />
                    </PermissionRoute>
                  }
                />
```

Also replace the import on line 11:

```jsx
import DocumentosListado from './pages/documentos/DocumentosListado';
```

(Remove the now-unused `ProximamentePage` import only if no other route still uses it — `/solicitudes`, `/proveedores`, `/formularios`, `/reportes`, and `/administracion` still do, so keep the import.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/documentos/DocumentosListado.jsx frontend/src/pages/documentos/DocumentosListado.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add Documentos listing with filters, pagination, and name resolution"
```

---

### Task 5: Crear documento (modal with file upload)

**Files:**
- Modify: `frontend/src/pages/documentos/DocumentosListado.jsx` (add the create modal)
- Modify: `frontend/src/pages/documentos/DocumentosListado.test.jsx` (add creation tests)

**Interfaces:**
- Consumes: `documentoService.crear(formData)` (Task 2), `validarArchivo` + `TIPOS_PERMITIDOS` (Task 1), `carpetaService.listar` (already wired in Task 4), `aplanarCarpetas` (Task 4, same file).
- Produces: nothing new consumed by later tasks — this closes out `DocumentosListado`.

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/pages/documentos/DocumentosListado.test.jsx` (inside the existing `describe` block, after the last `it`):

```jsx
  it('creates a documento with the uploaded file and reloads the list', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    documentoService.crear.mockResolvedValue({ id: 2, nombre: 'Política SST' });
    renderPagina();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('button', { name: /crear documento/i }));

    await userEvent.selectOptions(screen.getByLabelText('Área *'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));
    await userEvent.selectOptions(screen.getByLabelText('Carpeta *'), '10');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de documento *'), '1');
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Política SST');

    const archivo = new File(['contenido'], 'politica.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo *'), archivo);

    documentoService.listar.mockResolvedValue({
      data: [...DOCUMENTOS, { id: 2, nombre: 'Política SST', areaId: 1, carpetaId: 10, tipoDocumentoId: 1, estado: 'sin_vigencia' }],
      pagination: PAGINACION,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(documentoService.crear).toHaveBeenCalled());
    const formDataEnviado = documentoService.crear.mock.calls[0][0];
    expect(formDataEnviado.get('nombre')).toBe('Política SST');
    expect(formDataEnviado.get('areaId')).toBe('1');
    expect(formDataEnviado.get('carpetaId')).toBe('10');
    expect(formDataEnviado.get('tipoDocumentoId')).toBe('1');
    expect(formDataEnviado.get('archivo')).toBe(archivo);
    expect(await screen.findByText('Documento creado exitosamente')).toBeInTheDocument();
  });

  it('rejects an invalid file before submitting', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    renderPagina();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('button', { name: /crear documento/i }));
    await userEvent.selectOptions(screen.getByLabelText('Área *'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Carpeta *'), '10');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de documento *'), '1');
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Política SST');

    const archivoInvalido = new File(['contenido'], 'virus.exe', { type: 'application/x-msdownload' });
    await userEvent.upload(screen.getByLabelText('Archivo *'), archivoInvalido);
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Tipo de archivo no permitido')).toBeInTheDocument();
    expect(documentoService.crear).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- DocumentosListado`
Expected: FAIL — no "Crear documento" modal exists yet

- [ ] **Step 3: Implement the create modal**

Add these imports to the top of `frontend/src/pages/documentos/DocumentosListado.jsx`:

```jsx
import { useForm } from 'react-hook-form';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';
```

Add `TIPOS_PERMITIDOS_ACCEPT` above the `DocumentosListado` function:

```jsx
const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');
```

Inside the `DocumentosListado` function, add state and form handling (after the existing `filtros` state):

```jsx
  const [archivoError, setArchivoError] = useState(null);
  const {
    register: registerCrear,
    handleSubmit: handleSubmitCrear,
    reset: resetCrear,
    watch: watchCrear,
    formState: { errors: erroresCrear },
  } = useForm();

  const areaSeleccionadaCrear = watchCrear('areaId');
  const carpetasDelAreaCrear = carpetas.filter((c) => String(c.areaId) === String(areaSeleccionadaCrear));

  async function onCrearDocumento(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoError(errorArchivo);
      return;
    }
    setArchivoError(null);

    const formData = new FormData();
    formData.append('nombre', valores.nombre);
    formData.append('areaId', valores.areaId);
    formData.append('carpetaId', valores.carpetaId);
    formData.append('tipoDocumentoId', valores.tipoDocumentoId);
    if (valores.codigo) formData.append('codigo', valores.codigo);
    if (valores.vigenciaDesde) formData.append('vigenciaDesde', valores.vigenciaDesde);
    if (valores.vigenciaHasta) formData.append('vigenciaHasta', valores.vigenciaHasta);
    if (valores.diasAlertaVencimiento) formData.append('diasAlertaVencimiento', valores.diasAlertaVencimiento);
    formData.append('archivo', archivo);

    try {
      await documentoService.crear(formData);
      enqueueSnackbar('Documento creado exitosamente', { variant: 'success' });
      resetCrear();
      setArchivoError(null);
      setCrearModalAbierto(false);
      await cargarDocumentos();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el documento', { variant: 'error' });
    }
  }
```

Note: this reuses the same `carpetas`/`filtros.areaId` state that drives the listado's Carpeta filter (Task 4) — selecting an área in the create form triggers the same `useEffect` (keyed on `filtros.areaId`) only if the form writes into `filtros.areaId`. Since the create form must stay independent of the list's active filter, it does **not** write into `filtros`; instead it loads carpetas for its own selection separately. Replace the `carpetasDelAreaCrear` line above with a dedicated effect instead of filtering the filter-carpetas:

```jsx
  const [carpetasCrear, setCarpetasCrear] = useState([]);

  useEffect(() => {
    async function cargar() {
      if (!areaSeleccionadaCrear) {
        setCarpetasCrear([]);
        return;
      }
      try {
        const arbol = await carpetaService.listar(Number(areaSeleccionadaCrear));
        setCarpetasCrear(aplanarCarpetas(arbol));
      } catch {
        setCarpetasCrear([]);
      }
    }
    cargar();
  }, [areaSeleccionadaCrear]);
```

(Delete the `carpetasDelAreaCrear` filter line — use `carpetasCrear` in the JSX below instead.)

Add the modal JSX right after the closing `<Pagination .../>` tag, before the final `</div>`:

```jsx
      <Modal
        isOpen={crearModalAbierto}
        onClose={() => {
          setCrearModalAbierto(false);
          resetCrear();
          setArchivoError(null);
        }}
        title="Crear documento"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCrearModalAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitCrear(onCrearDocumento)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label htmlFor="crear-areaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Área *
            </label>
            <select id="crear-areaId" className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm" {...registerCrear('areaId', { required: true })}>
              <option value="">Selecciona un área</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="crear-carpetaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Carpeta *
            </label>
            <select
              id="crear-carpetaId"
              disabled={!areaSeleccionadaCrear}
              className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
              {...registerCrear('carpetaId', { required: true })}
            >
              <option value="">Selecciona una carpeta</option>
              {carpetasCrear.map((carpeta) => (
                <option key={carpeta.id} value={carpeta.id}>
                  {carpeta.ruta}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="crear-tipoDocumentoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo de documento *
            </label>
            <select id="crear-tipoDocumentoId" className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm" {...registerCrear('tipoDocumentoId', { required: true })}>
              <option value="">Selecciona un tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <Input label="Nombre *" error={erroresCrear.nombre?.message} {...registerCrear('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Código" {...registerCrear('codigo')} />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Vigencia desde" type="date" {...registerCrear('vigenciaDesde')} />
            <Input label="Vigencia hasta" type="date" {...registerCrear('vigenciaHasta')} />
          </div>

          <Input label="Días de alerta de vencimiento" type="number" {...registerCrear('diasAlertaVencimiento')} />

          <div>
            <label htmlFor="crear-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Archivo *
            </label>
            <input id="crear-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerCrear('archivo', { required: true })} />
            {archivoError && (
              <p role="alert" className="text-xs text-red-500 mt-1">
                {archivoError}
              </p>
            )}
          </div>
        </form>
      </Modal>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- DocumentosListado`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/documentos/DocumentosListado.jsx frontend/src/pages/documentos/DocumentosListado.test.jsx
git commit -m "feat(frontend): add document creation modal with file upload"
```

---

### Task 6: CarpetasModal (gestionar carpetas)

**Files:**
- Create: `frontend/src/pages/documentos/CarpetasModal.jsx`
- Create: `frontend/src/pages/documentos/CarpetasModal.test.jsx`
- Modify: `frontend/src/pages/documentos/DocumentosListado.jsx` (render `CarpetasModal` from the "Gestionar carpetas" button)
- Modify: `frontend/src/pages/documentos/DocumentosListado.test.jsx` (mock `CarpetasModal` opening, add one integration test)

**Interfaces:**
- Consumes: `carpetaService.listar(areaId)`, `carpetaService.crear(...)` (Task 2), `aplanarCarpetas` (Task 4, imported from `./DocumentosListado`), `areaService.listar()`.
- Produces: default export `CarpetasModal({ isOpen, onClose, areas })` — self-contained, owns its own área selection state and its own carpetas fetch (independent of `DocumentosListado`'s filter state, per the Global Constraint that catalogs are loaded where they're used).

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/documentos/CarpetasModal.test.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import CarpetasModal from './CarpetasModal';
import carpetaService from '../../api/carpeta.service';

vi.mock('../../api/carpeta.service');

const AREAS = [
  { id: 1, nombre: 'RRHH' },
  { id: 2, nombre: 'Financiera' },
];

function renderModal(props = {}) {
  return render(
    <SnackbarProvider>
      <CarpetasModal isOpen areas={AREAS} onClose={() => {}} {...props} />
    </SnackbarProvider>
  );
}

describe('CarpetasModal', () => {
  it('loads carpetas for the first selected area and shows their computed path', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [{ id: 11, nombre: 'Nómina', carpetaPadreId: 10, areaId: 1, subcarpetas: [] }] }]);
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));

    // Scoped to the <ul> — the carpeta-padre <select> below renders the same names as options.
    const lista = screen.getByRole('list');
    expect(await within(lista).findByText('Contratos')).toBeInTheDocument();
    expect(within(lista).getByText('Contratos / Nómina')).toBeInTheDocument();
  });

  it('creates a carpeta under the selected parent and reloads the list', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] }]);
    carpetaService.crear.mockResolvedValue({ id: 12, nombre: 'Políticas' });
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await within(screen.getByRole('list')).findByText('Contratos');

    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Políticas');
    await userEvent.selectOptions(screen.getByLabelText('Carpeta padre (opcional)'), '10');

    carpetaService.listar.mockResolvedValue([
      { id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [{ id: 12, nombre: 'Políticas', carpetaPadreId: 10, areaId: 1, subcarpetas: [] }] },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    await waitFor(() => expect(carpetaService.crear).toHaveBeenCalledWith({ areaId: 1, nombre: 'Políticas', carpetaPadreId: '10' }));
    expect(await screen.findByText('Carpeta creada exitosamente')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getByText('Contratos / Políticas')).toBeInTheDocument();
  });

  it('shows an error when creation fails', async () => {
    carpetaService.listar.mockResolvedValue([]);
    carpetaService.crear.mockRejectedValue(new Error('El nombre ya existe en esta área'));
    renderModal();

    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Contratos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(await screen.findByText('El nombre ya existe en esta área')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- CarpetasModal`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/pages/documentos/CarpetasModal.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import PropTypes from 'prop-types';
import carpetaService from '../../api/carpeta.service';
import { aplanarCarpetas } from './DocumentosListado';
import Modal from '../../components/common/Modal/Modal';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';

export default function CarpetasModal({ isOpen, onClose, areas }) {
  const { enqueueSnackbar } = useSnackbar();
  const [areaId, setAreaId] = useState('');
  const [carpetas, setCarpetas] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarCarpetas(area) {
    if (!area) {
      setCarpetas([]);
      return;
    }
    try {
      const arbol = await carpetaService.listar(Number(area));
      setCarpetas(aplanarCarpetas(arbol));
    } catch {
      setCarpetas([]);
    }
  }

  useEffect(() => {
    cargarCarpetas(areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  async function onCrearCarpeta({ nombre, carpetaPadreId }) {
    try {
      await carpetaService.crear({ areaId: Number(areaId), nombre, carpetaPadreId: carpetaPadreId || null });
      enqueueSnackbar('Carpeta creada exitosamente', { variant: 'success' });
      reset();
      await cargarCarpetas(areaId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la carpeta', { variant: 'error' });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestionar carpetas">
      <div className="space-y-4">
        <div>
          <label htmlFor="carpetas-modal-area" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Área de las carpetas
          </label>
          <select
            id="carpetas-modal-area"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Selecciona un área</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        {areaId && (
          <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
            {carpetas.length === 0 && <li className="text-slate-400 dark:text-slate-500">Sin carpetas todavía en esta área.</li>}
            {carpetas.map((carpeta) => (
              <li key={carpeta.id}>{carpeta.ruta}</li>
            ))}
          </ul>
        )}

        {areaId && (
          <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            <Input label="Nombre de la nueva carpeta" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />

            <div>
              <label htmlFor="carpetas-modal-padre" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Carpeta padre (opcional)
              </label>
              <select id="carpetas-modal-padre" className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm" {...register('carpetaPadreId')}>
                <option value="">Ninguna (carpeta raíz)</option>
                {carpetas.map((carpeta) => (
                  <option key={carpeta.id} value={carpeta.id}>
                    {carpeta.ruta}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleSubmit(onCrearCarpeta)}>Crear carpeta</Button>
          </form>
        )}
      </div>
    </Modal>
  );
}

CarpetasModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  areas: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number.isRequired, nombre: PropTypes.string.isRequired })).isRequired,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- CarpetasModal`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into `DocumentosListado`**

Add the import at the top of `frontend/src/pages/documentos/DocumentosListado.jsx`:

```jsx
import CarpetasModal from './CarpetasModal';
```

Add the render right after the closing `</Modal>` tag of the create-documento modal, before the final `</div>`:

```jsx
      <CarpetasModal isOpen={carpetasModalAbierto} onClose={() => setCarpetasModalAbierto(false)} areas={areas} />
```

Add one integration test to `frontend/src/pages/documentos/DocumentosListado.test.jsx` (append inside the `describe` block), mocking `carpetaService.crear` since `CarpetasModal` is rendered live (not mocked) here:

```jsx
  it('opens "Gestionar carpetas" and creates a carpeta from the listado toolbar', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    carpetaService.crear.mockResolvedValue({ id: 20, nombre: 'Nueva' });
    renderPagina();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('button', { name: /gestionar carpetas/i }));
    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await within(screen.getByRole('list')).findByText('Contratos');

    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    await waitFor(() => expect(carpetaService.crear).toHaveBeenCalledWith({ areaId: 1, nombre: 'Nueva', carpetaPadreId: null }));
  });
```

- [ ] **Step 6: Run the full DocumentosListado + CarpetasModal suites**

Run: `cd frontend && npm test -- DocumentosListado CarpetasModal`
Expected: PASS (12 + 3 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/documentos/CarpetasModal.jsx frontend/src/pages/documentos/CarpetasModal.test.jsx frontend/src/pages/documentos/DocumentosListado.jsx frontend/src/pages/documentos/DocumentosListado.test.jsx
git commit -m "feat(frontend): add CarpetasModal for managing carpetas from the Documentos toolbar"
```

---

### Task 7: DocumentoDetalle — detail tab (view, edit, delete, download current version)

**Files:**
- Create: `frontend/src/pages/documentos/DocumentoDetalle.jsx`
- Create: `frontend/src/pages/documentos/DocumentoDetalle.test.jsx`
- Modify: `frontend/src/App.jsx` (add the `/documentos/:id` route)

**Interfaces:**
- Consumes: `documentoService.obtener/editar/eliminar/descargar` (Task 2), `carpetaService.listar` + `aplanarCarpetas` (Tasks 2/4), `tipoDocumentoService.listar` (Task 2), `areaService.listar` (existing), `useAuth().tienePermiso`, `StatusChip`, `useParams`/`useNavigate` from `react-router-dom`.
- Produces: default export `DocumentoDetalle` (no props, reads `id` from the route via `useParams`). This task builds the "Detalle" tab only; Task 8 adds the "Historial de versiones" tab to the same file.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/documentos/DocumentoDetalle.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DocumentoDetalle from './DocumentoDetalle';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/documento.service');
vi.mock('../../api/carpeta.service');
vi.mock('../../api/tipoDocumento.service');
vi.mock('../../api/area.service');
vi.mock('../../context/AuthContext');

const DOCUMENTO = {
  id: 1,
  nombre: 'Manual RH',
  codigo: 'RH-001',
  areaId: 1,
  carpetaId: 10,
  tipoDocumentoId: 1,
  estado: 'vigente',
  vigenciaDesde: '2026-01-01',
  vigenciaHasta: '2026-12-31',
  diasAlertaVencimiento: 30,
};

function renderDetalle() {
  return render(
    <MemoryRouter initialEntries={['/documentos/1']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/documentos/:id" element={<DocumentoDetalle />} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('DocumentoDetalle', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    documentoService.obtener.mockResolvedValue(DOCUMENTO);
    documentoService.listarVersiones.mockResolvedValue([]);
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'RRHH' }]);
    tipoDocumentoService.listar.mockResolvedValue([{ id: 1, nombre: 'Manual' }]);
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] }]);
  });

  it('loads its own catalogs independently and shows the documento header', async () => {
    renderDetalle();
    expect(await screen.findByText('Manual RH')).toBeInTheDocument();
    expect(documentoService.obtener).toHaveBeenCalledWith('1');
    expect(areaService.listar).toHaveBeenCalled();
    expect(tipoDocumentoService.listar).toHaveBeenCalled();
    expect(carpetaService.listar).toHaveBeenCalledWith(1);
    expect(screen.getByText('vigente')).toBeInTheDocument();
  });

  it('hides edit and delete controls without the corresponding permissions', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    renderDetalle();
    await screen.findByText('Manual RH');
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('edits metadata and refreshes the detail in place', async () => {
    renderDetalle();
    await screen.findByText('Manual RH');

    const nombreInput = screen.getByLabelText('Nombre *');
    await userEvent.clear(nombreInput);
    await userEvent.type(nombreInput, 'Manual RH actualizado');

    documentoService.editar.mockResolvedValue({ ...DOCUMENTO, nombre: 'Manual RH actualizado' });
    documentoService.obtener.mockResolvedValue({ ...DOCUMENTO, nombre: 'Manual RH actualizado' });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(documentoService.editar).toHaveBeenCalledWith('1', expect.objectContaining({ nombre: 'Manual RH actualizado', carpetaId: 10, tipoDocumentoId: 1 }))
    );
    expect(await screen.findByText('Documento actualizado')).toBeInTheDocument();
  });

  it('deletes the documento after confirmation and navigates back', async () => {
    documentoService.eliminar.mockResolvedValue(null);
    window.confirm = vi.fn(() => true);
    renderDetalle();
    await screen.findByText('Manual RH');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(documentoService.eliminar).toHaveBeenCalledWith('1'));
  });

  it('does not delete when the confirmation is dismissed', async () => {
    window.confirm = vi.fn(() => false);
    renderDetalle();
    await screen.findByText('Manual RH');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(documentoService.eliminar).not.toHaveBeenCalled();
  });

  it('downloads the current version when clicking "Descargar versión vigente"', async () => {
    documentoService.descargar.mockResolvedValue();
    renderDetalle();
    await screen.findByText('Manual RH');

    await userEvent.click(screen.getByRole('button', { name: 'Descargar versión vigente' }));
    await waitFor(() => expect(documentoService.descargar).toHaveBeenCalledWith('1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- DocumentoDetalle`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/pages/documentos/DocumentoDetalle.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, Download } from 'lucide-react';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import areaService from '../../api/area.service';
import { aplanarCarpetas } from './DocumentosListado';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import StatusChip from '../../components/common/StatusChip/StatusChip';

export default function DocumentoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [documento, setDocumento] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarDocumento() {
    setCargando(true);
    try {
      const data = await documentoService.obtener(id);
      setDocumento(data);
      reset({
        nombre: data.nombre,
        codigo: data.codigo || '',
        tipoDocumentoId: String(data.tipoDocumentoId),
        carpetaId: String(data.carpetaId),
        vigenciaDesde: data.vigenciaDesde || '',
        vigenciaHasta: data.vigenciaHasta || '',
        diasAlertaVencimiento: data.diasAlertaVencimiento || '',
      });
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar el documento', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDocumento();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const tiposData = await tipoDocumentoService.listar();
        setTipos(tiposData);
      } catch {
        setTipos([]);
      }
    }
    cargarCatalogos();
  }, []);

  useEffect(() => {
    async function cargarCarpetasDelArea() {
      if (!documento?.areaId) return;
      try {
        const arbol = await carpetaService.listar(documento.areaId);
        setCarpetas(aplanarCarpetas(arbol));
      } catch {
        setCarpetas([]);
      }
    }
    cargarCarpetasDelArea();
  }, [documento?.areaId]);

  useEffect(() => {
    async function cargarNombreArea() {
      await areaService.listar();
    }
    cargarNombreArea();
  }, []);

  async function onGuardar(valores) {
    try {
      await documentoService.editar(id, {
        nombre: valores.nombre,
        codigo: valores.codigo || null,
        tipoDocumentoId: Number(valores.tipoDocumentoId),
        carpetaId: Number(valores.carpetaId),
        vigenciaDesde: valores.vigenciaDesde || null,
        vigenciaHasta: valores.vigenciaHasta || null,
        diasAlertaVencimiento: valores.diasAlertaVencimiento ? Number(valores.diasAlertaVencimiento) : null,
      });
      enqueueSnackbar('Documento actualizado', { variant: 'success' });
      await cargarDocumento();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo actualizar el documento', { variant: 'error' });
    }
  }

  async function onEliminar() {
    if (!window.confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    try {
      await documentoService.eliminar(id);
      enqueueSnackbar('Documento eliminado', { variant: 'success' });
      navigate('/documentos');
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo eliminar el documento', { variant: 'error' });
    }
  }

  async function onDescargar() {
    try {
      await documentoService.descargar(id);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar el documento', { variant: 'error' });
    }
  }

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;
  if (!documento) return null;

  return (
    <div>
      <button
        onClick={() => navigate('/documentos')}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{documento.nombre}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">{documento.codigo}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip status={documento.estado} />
          {tienePermiso('documentos', 'exportar') && (
            <Button variant="outline" icon={Download} onClick={onDescargar}>
              Descargar versión vigente
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <form className="space-y-4">
          <Input label="Nombre *" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} disabled={!tienePermiso('documentos', 'editar')} />
          <Input label="Código" {...register('codigo')} disabled={!tienePermiso('documentos', 'editar')} />

          <div>
            <label htmlFor="detalle-tipoDocumentoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo de documento
            </label>
            <select
              id="detalle-tipoDocumentoId"
              disabled={!tienePermiso('documentos', 'editar')}
              className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
              {...register('tipoDocumentoId')}
            >
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="detalle-carpetaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Carpeta
            </label>
            <select
              id="detalle-carpetaId"
              disabled={!tienePermiso('documentos', 'editar')}
              className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
              {...register('carpetaId')}
            >
              {carpetas.map((carpeta) => (
                <option key={carpeta.id} value={carpeta.id}>
                  {carpeta.ruta}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Vigencia desde" type="date" {...register('vigenciaDesde')} disabled={!tienePermiso('documentos', 'editar')} />
            <Input label="Vigencia hasta" type="date" {...register('vigenciaHasta')} disabled={!tienePermiso('documentos', 'editar')} />
          </div>

          <Input label="Días de alerta de vencimiento" type="number" {...register('diasAlertaVencimiento')} disabled={!tienePermiso('documentos', 'editar')} />

          <div className="flex items-center gap-3 pt-2">
            {tienePermiso('documentos', 'editar') && <Button onClick={handleSubmit(onGuardar)}>Guardar cambios</Button>}
            {tienePermiso('documentos', 'eliminar') && (
              <Button variant="danger" onClick={onEliminar}>
                Eliminar
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- DocumentoDetalle`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire the route in `App.jsx`**

Add the import (with the other page imports):

```jsx
import DocumentoDetalle from './pages/documentos/DocumentoDetalle';
```

Add the route right after the `/documentos` route:

```jsx
                <Route
                  path="/documentos/:id"
                  element={
                    <PermissionRoute modulo="documentos" accion="ver">
                      <DocumentoDetalle />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/documentos/DocumentoDetalle.jsx frontend/src/pages/documentos/DocumentoDetalle.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add DocumentoDetalle with edit, delete, and current-version download"
```

---

### Task 8: DocumentoDetalle — historial de versiones tab

**Files:**
- Modify: `frontend/src/pages/documentos/DocumentoDetalle.jsx` (add the versions tab)
- Modify: `frontend/src/pages/documentos/DocumentoDetalle.test.jsx` (add versions tests)

**Interfaces:**
- Consumes: `documentoService.listarVersiones/subirVersion/descargarVersion` (Task 2, already imported), `validarArchivo` + `TIPOS_PERMITIDOS` (Task 1).
- Produces: nothing new consumed by later tasks — this closes out `DocumentoDetalle`.

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/pages/documentos/DocumentoDetalle.test.jsx` (inside the existing `describe` block):

```jsx
  it('shows the version history and downloads a historical version', async () => {
    documentoService.listarVersiones.mockResolvedValue([{ id: 5, version: 'v1', createdAt: '2026-01-01T00:00:00.000Z' }]);
    documentoService.descargarVersion.mockResolvedValue();
    renderDetalle();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('tab', { name: 'Historial de versiones' }));

    expect(await screen.findByText('v1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar v1' }));
    await waitFor(() => expect(documentoService.descargarVersion).toHaveBeenCalledWith('1', 5));
  });

  it('uploads a new version and refreshes the document and history', async () => {
    documentoService.listarVersiones.mockResolvedValue([]);
    documentoService.subirVersion.mockResolvedValue({ ...DOCUMENTO, version: 'v2' });
    renderDetalle();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('tab', { name: 'Historial de versiones' }));

    await userEvent.type(screen.getByLabelText('Nueva versión *'), 'v2');
    const archivo = new File(['contenido'], 'v2.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo *'), archivo);

    documentoService.listarVersiones.mockResolvedValue([{ id: 6, version: 'v1', createdAt: '2026-01-01T00:00:00.000Z' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Subir nueva versión' }));

    await waitFor(() => expect(documentoService.subirVersion).toHaveBeenCalled());
    const formDataEnviado = documentoService.subirVersion.mock.calls[0][1];
    expect(formDataEnviado.get('version')).toBe('v2');
    expect(formDataEnviado.get('archivo')).toBe(archivo);
  });

  it('hides "Subir nueva versión" without the aprobar_version permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => accion !== 'aprobar_version' });
    documentoService.listarVersiones.mockResolvedValue([]);
    renderDetalle();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('tab', { name: 'Historial de versiones' }));
    expect(screen.queryByRole('button', { name: 'Subir nueva versión' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- DocumentoDetalle`
Expected: FAIL — no tabs/versions UI exists yet

- [ ] **Step 3: Implement the versions tab**

Add these imports to the top of `frontend/src/pages/documentos/DocumentoDetalle.jsx`:

```jsx
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';
```

Add `TIPOS_PERMITIDOS_ACCEPT` above the `DocumentoDetalle` function:

```jsx
const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');
```

Add state, the versions loader, and a separate form for uploading a new version (inside the `DocumentoDetalle` function, after the existing `register`/`handleSubmit`/`reset` destructure for metadata editing):

```jsx
  const [tabActiva, setTabActiva] = useState('detalle');
  const [versiones, setVersiones] = useState([]);
  const [archivoVersionError, setArchivoVersionError] = useState(null);
  const {
    register: registerVersion,
    handleSubmit: handleSubmitVersion,
    reset: resetVersion,
  } = useForm();

  async function cargarVersiones() {
    try {
      const data = await documentoService.listarVersiones(id);
      setVersiones(data);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar el historial de versiones', { variant: 'error' });
    }
  }

  useEffect(() => {
    cargarVersiones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSubirVersion(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoVersionError(errorArchivo);
      return;
    }
    setArchivoVersionError(null);

    const formData = new FormData();
    formData.append('version', valores.version);
    if (valores.vigenciaDesde) formData.append('vigenciaDesde', valores.vigenciaDesde);
    if (valores.vigenciaHasta) formData.append('vigenciaHasta', valores.vigenciaHasta);
    formData.append('archivo', archivo);

    try {
      await documentoService.subirVersion(id, formData);
      enqueueSnackbar('Nueva versión subida', { variant: 'success' });
      resetVersion();
      setArchivoVersionError(null);
      await Promise.all([cargarDocumento(), cargarVersiones()]);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo subir la nueva versión', { variant: 'error' });
    }
  }

  async function onDescargarVersion(versionId) {
    try {
      await documentoService.descargarVersion(id, versionId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar la versión', { variant: 'error' });
    }
  }
```

Replace the single `<div className="bg-white ...">` block that wraps the metadata `<form>` with a tabbed container. Find this in the file (from Task 7):

```jsx
      <div className="bg-white dark:bg-centhrix-card rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
        <form className="space-y-4">
          {/* ...metadata fields... */}
        </form>
      </div>
```

Replace it with:

```jsx
      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div role="tablist" aria-label="Secciones del documento" className="flex border-b border-gray-100 dark:border-slate-700">
          <button
            role="tab"
            aria-selected={tabActiva === 'detalle'}
            onClick={() => setTabActiva('detalle')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'detalle' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Detalle
          </button>
          <button
            role="tab"
            aria-selected={tabActiva === 'historial'}
            onClick={() => setTabActiva('historial')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'historial' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Historial de versiones
          </button>
        </div>

        <div className="p-6">
          {tabActiva === 'detalle' && (
            <form className="space-y-4">
              <Input label="Nombre *" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} disabled={!tienePermiso('documentos', 'editar')} />
              <Input label="Código" {...register('codigo')} disabled={!tienePermiso('documentos', 'editar')} />

              <div>
                <label htmlFor="detalle-tipoDocumentoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Tipo de documento
                </label>
                <select
                  id="detalle-tipoDocumentoId"
                  disabled={!tienePermiso('documentos', 'editar')}
                  className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
                  {...register('tipoDocumentoId')}
                >
                  {tipos.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="detalle-carpetaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Carpeta
                </label>
                <select
                  id="detalle-carpetaId"
                  disabled={!tienePermiso('documentos', 'editar')}
                  className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
                  {...register('carpetaId')}
                >
                  {carpetas.map((carpeta) => (
                    <option key={carpeta.id} value={carpeta.id}>
                      {carpeta.ruta}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Vigencia desde" type="date" {...register('vigenciaDesde')} disabled={!tienePermiso('documentos', 'editar')} />
                <Input label="Vigencia hasta" type="date" {...register('vigenciaHasta')} disabled={!tienePermiso('documentos', 'editar')} />
              </div>

              <Input label="Días de alerta de vencimiento" type="number" {...register('diasAlertaVencimiento')} disabled={!tienePermiso('documentos', 'editar')} />

              <div className="flex items-center gap-3 pt-2">
                {tienePermiso('documentos', 'editar') && <Button onClick={handleSubmit(onGuardar)}>Guardar cambios</Button>}
                {tienePermiso('documentos', 'eliminar') && (
                  <Button variant="danger" onClick={onEliminar}>
                    Eliminar
                  </Button>
                )}
              </div>
            </form>
          )}

          {tabActiva === 'historial' && (
            <div className="space-y-6">
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {versiones.length === 0 && <li className="py-4 text-sm text-slate-400 dark:text-slate-500">Sin versiones anteriores.</li>}
                {versiones.map((version) => (
                  <li key={version.id} className="py-3 flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">{version.version}</span>
                    {tienePermiso('documentos', 'exportar') && (
                      <Button variant="outline" size="sm" onClick={() => onDescargarVersion(version.id)}>
                        Descargar {version.version}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              {tienePermiso('documentos', 'aprobar_version') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <Input label="Nueva versión *" placeholder="v2" {...registerVersion('version', { required: true })} />

                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Vigencia desde" type="date" {...registerVersion('vigenciaDesde')} />
                    <Input label="Vigencia hasta" type="date" {...registerVersion('vigenciaHasta')} />
                  </div>

                  <div>
                    <label htmlFor="version-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo *
                    </label>
                    <input id="version-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerVersion('archivo', { required: true })} />
                    {archivoVersionError && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoVersionError}
                      </p>
                    )}
                  </div>

                  <Button onClick={handleSubmitVersion(onSubirVersion)}>Subir nueva versión</Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
```

Note: the metadata `<form>` from Task 7 moves inside `{tabActiva === 'detalle' && (...)}` verbatim — no changes to its fields or the `onGuardar`/`onEliminar` buttons, which stay inside that same form block.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- DocumentoDetalle`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/documentos/DocumentoDetalle.jsx frontend/src/pages/documentos/DocumentoDetalle.test.jsx
git commit -m "feat(frontend): add version history tab with upload and download"
```

---

### Task 9: Documentation and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — final task.

- [ ] **Step 1: Update the README**

In the `## Documentación` section (around line 13), add a new bullet right after the Documentos API design spec line:

```markdown
- Diseño del frontend de Documentos (listado con filtros/paginación, creación con subida de archivo, detalle con edición e historial de versiones, gestión de carpetas): `docs/superpowers/specs/2026-07-07-cod-documentos-frontend-design.md`
```

In the `## Frontend (\`frontend/\`)` section (around line 40), add a short note after the existing `npm test` block:

```markdown

El módulo Documentos (`/documentos`) ya está implementado: listado con filtros (área, carpeta, tipo, estado) y paginación, creación con subida de archivo, y detalle (`/documentos/:id`) con edición de metadata, historial de versiones, subida de nueva versión, y descarga de archivos.
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS — all tests green, including every test added in Tasks 1-8

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the Documentos frontend module"
```

---

## Not covered by this plan (deliberately, per the design spec)

- Visual folder-tree navigation (flat filtered list only; tree navigation is future work).
- A real `responsableUsuarioId` picker (no `/usuarios` endpoint exists yet).
- Editing/deleting Carpetas or Tipos de Documento via the UI (the backend doesn't expose those operations either).
- Any change to `server/`.
