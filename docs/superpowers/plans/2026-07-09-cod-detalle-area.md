# Detalle de Área Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only `/areas/:id` "Detalle de Área" page (info, líder resuelto,
conteo de carpetas, conteo de documentos por estado, con navegación cruzada a
Documentos/Carpetas ya filtradas), y hacer que `AreasListado.jsx` navegue a ella.

**Architecture:** Nueva página `frontend/src/pages/areas/AreaDetalle.jsx` en la ruta
`/areas/:id`, cargando 4 fuentes de datos independientes (área, líder, conteo de
carpetas, conteo de documentos) con manejo de error propio por bloque —solo la carga
del área misma bloquea el render. `AreasListado.jsx` gana navegación (tarjetas y filas
clickeables). `CarpetasGestion.jsx` gana lectura de `areaId` desde la URL (mismo
patrón `useSearchParams` que ya usa `DocumentosListado.jsx`). Cero cambios de backend:
`GET /areas/:id` ya existe: solo falta el wrapper `areaService.obtener(id)` en el
frontend.

**Tech Stack:** React 19, Vite 7, Tailwind v4, react-router-dom v7 (`useParams`,
`useSearchParams`), Vitest + Testing Library.

## Global Constraints

- Cero cambios de backend: `Area.js`, `area.controller.js`, `area.routes.js` quedan
  exactamente igual.
- Alcance de solo lectura: no se agrega edición ni baja lógica del área desde esta
  pantalla (requeriría un endpoint `PUT /areas/:id` que no existe hoy).
- Sin secciones de Formularios/Solicitudes — esos módulos no existen todavía en COD.
- Sin listas embebidas de carpetas/documentos — solo conteos + botones de acceso
  directo a las pantallas ya existentes (`/documentos/carpetas?areaId=<id>`,
  `/documentos?areaId=<id>`).
- Cada fuente de datos de apoyo (líder, conteo de carpetas, conteo de documentos) se
  carga en su propio `try/catch` independiente y silencioso — un fallo en una no
  bloquea a las demás ni al resto de la página. Solo el fallo al cargar el área misma
  muestra un estado de error (con enlace de vuelta a `/areas`).
- Testing convention: Vitest + Testing Library, `describe`/`it` en inglés,
  `vi.mock(...)` para los servicios, `MemoryRouter` con `Routes`/`Route` para las
  pruebas de navegación.
- Cada archivo nuevo se entrega con su test en el mismo commit.

---

### Task 1: `areaService.obtener` + página `AreaDetalle.jsx`

**Files:**
- Modify: `frontend/src/api/area.service.js`
- Create: `frontend/src/pages/areas/AreaDetalle.jsx`
- Create: `frontend/src/pages/areas/AreaDetalle.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `aplanarCarpetas` (ya exportado desde
  `frontend/src/pages/documentos/DocumentosListado.jsx`); `carpetaService.listar(areaId)`,
  `documentoService.listar({areaId, estado?, limit})` → `{data, pagination:{total,...}}`,
  `usuarioService.obtener(id)` (todos ya existen, sin cambios).
- Produces: `areaService.obtener(id)` — nuevo wrapper frontend para el endpoint
  backend ya existente `GET /areas/:id`, devuelve la fila del área
  (`{id, nombre, codigo, saludDocumentalPct, activo, liderUsuarioId, ...}`). Consumido
  por `AreaDetalle.jsx` en este mismo task. Ruta `/areas/:id` — consumida por Task 2
  (`AreasListado.jsx`'s navegación).

- [ ] **Step 1: Agregar `areaService.obtener`**

Modify `frontend/src/api/area.service.js` — reemplazar el archivo completo:

```js
import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/areas');
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/areas', datos);
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/areas/${id}`);
  return response.data;
}

export default { listar, crear, obtener };
```

- [ ] **Step 2: Escribir los tests que fallan para `AreaDetalle.jsx`**

Create `frontend/src/pages/areas/AreaDetalle.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AreaDetalle from './AreaDetalle';
import areaService from '../../api/area.service';
import usuarioService from '../../api/usuario.service';
import carpetaService from '../../api/carpeta.service';
import documentoService from '../../api/documento.service';

vi.mock('../../api/area.service');
vi.mock('../../api/usuario.service');
vi.mock('../../api/carpeta.service');
vi.mock('../../api/documento.service');

const AREA = { id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0', activo: true, liderUsuarioId: 7 };

const ARBOL = [
  {
    id: 10,
    nombre: 'Contratos',
    areaId: 1,
    carpetaPadreId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    subcarpetas: [{ id: 11, nombre: 'Nómina', areaId: 1, carpetaPadreId: 10, createdAt: '2026-01-02T00:00:00.000Z', subcarpetas: [] }],
  },
];

function paginacion(total) {
  return { data: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

function mockConteosDocumento() {
  documentoService.listar.mockImplementation(({ estado } = {}) => {
    const totales = { undefined: 48, vigente: 40, por_vencer: 3, vencido: 5 };
    return Promise.resolve(paginacion(totales[estado]));
  });
}

function renderPagina(ruta = '/areas/1') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SnackbarProvider>
        <Routes>
          <Route path="/areas/:id" element={<AreaDetalle />} />
          <Route path="/areas" element={<p>Áreas</p>} />
          <Route path="/documentos" element={<p>Documentos</p>} />
          <Route path="/documentos/carpetas" element={<p>Gestión de carpetas</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('AreaDetalle', () => {
  beforeEach(() => {
    areaService.obtener.mockResolvedValue(AREA);
    usuarioService.obtener.mockResolvedValue({ id: 7, nombre: 'Ana', apellido: 'Gómez' });
    carpetaService.listar.mockResolvedValue(ARBOL);
    mockConteosDocumento();
  });

  it('shows the área info, health, and status', async () => {
    renderPagina();
    expect(await screen.findByText('Financiera')).toBeInTheDocument();
    expect(screen.getByText('FIN')).toBeInTheDocument();
    expect(screen.getByText('activo')).toBeInTheDocument();
    expect(screen.getByText('92.0% al día')).toBeInTheDocument();
  });

  it('shows the resolved líder name', async () => {
    renderPagina();
    expect(await screen.findByText('Líder: Ana Gómez')).toBeInTheDocument();
  });

  it('shows "Sin líder asignado" and skips the lookup when there is no líder', async () => {
    areaService.obtener.mockResolvedValue({ ...AREA, liderUsuarioId: null });
    renderPagina();
    expect(await screen.findByText('Sin líder asignado')).toBeInTheDocument();
    expect(usuarioService.obtener).not.toHaveBeenCalled();
  });

  it('shows the carpeta count', async () => {
    renderPagina();
    await screen.findByText('Financiera');
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('shows the total and per-estado document counts', async () => {
    renderPagina();
    await screen.findByText('Financiera');
    expect(await screen.findByText('48')).toBeInTheDocument();
    expect(await screen.findByText('40 vigentes · 3 por vencer · 5 vencidos')).toBeInTheDocument();
  });

  it('navigates to /documentos/carpetas?areaId=1 when "Ver carpetas" is clicked', async () => {
    renderPagina();
    await screen.findByText('Financiera');
    await userEvent.click(screen.getByRole('button', { name: 'Ver carpetas' }));
    expect(await screen.findByText('Gestión de carpetas')).toBeInTheDocument();
  });

  it('navigates to /documentos?areaId=1 when "Ver documentos" is clicked', async () => {
    renderPagina();
    await screen.findByText('Financiera');
    await userEvent.click(screen.getByRole('button', { name: 'Ver documentos' }));
    expect(await screen.findByText('Documentos')).toBeInTheDocument();
  });

  it('shows an error state with a link back to Áreas when loading the área fails', async () => {
    areaService.obtener.mockRejectedValue(new Error('Área no encontrada'));
    renderPagina();
    expect(await screen.findByText('Área no encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver a áreas/i })).toHaveAttribute('href', '/areas');
  });

  it('still shows the rest of the page when the líder lookup fails', async () => {
    usuarioService.obtener.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('Financiera')).toBeInTheDocument();
    expect(await screen.findByText('Sin líder asignado')).toBeInTheDocument();
  });

  it('still shows the rest of the page when the carpeta count fails', async () => {
    carpetaService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('Financiera')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('still shows the rest of the page when the document count fails', async () => {
    documentoService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('Financiera')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `cd frontend && npx vitest run src/pages/areas/AreaDetalle.test.jsx`
Expected: FAIL — `AreaDetalle.jsx` todavía no existe.

- [ ] **Step 4: Crear `AreaDetalle.jsx`**

Create `frontend/src/pages/areas/AreaDetalle.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, FileText, Folder } from 'lucide-react';
import areaService from '../../api/area.service';
import usuarioService from '../../api/usuario.service';
import carpetaService from '../../api/carpeta.service';
import documentoService from '../../api/documento.service';
import { aplanarCarpetas } from '../documentos/DocumentosListado';
import Button from '../../components/common/Button/Button';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import StatusChip from '../../components/common/StatusChip/StatusChip';

function nivelSalud(pct) {
  const valor = Number(pct);
  if (valor >= 80) return 'saludable';
  if (valor >= 50) return 'atencion';
  return 'critico';
}

const ESTADOS_DOCUMENTO = ['vigente', 'por_vencer', 'vencido'];

const VOLVER_CLASSNAME =
  'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors';

export default function AreaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [area, setArea] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [lider, setLider] = useState(null);
  const [cantidadCarpetas, setCantidadCarpetas] = useState(null);
  const [conteoDocumentos, setConteoDocumentos] = useState(null);

  useEffect(() => {
    async function cargarArea() {
      setCargando(true);
      setErrorCarga(null);
      try {
        const data = await areaService.obtener(id);
        setArea(data);
      } catch (error) {
        setArea(null);
        setErrorCarga(error?.message || 'No se pudo cargar el área');
      } finally {
        setCargando(false);
      }
    }
    cargarArea();
  }, [id]);

  useEffect(() => {
    if (!area?.liderUsuarioId) {
      setLider(null);
      return;
    }
    async function cargarLider() {
      try {
        const data = await usuarioService.obtener(area.liderUsuarioId);
        setLider(data);
      } catch {
        setLider(null);
      }
    }
    cargarLider();
  }, [area?.liderUsuarioId]);

  useEffect(() => {
    if (!area?.id) return;
    async function cargarCantidadCarpetas() {
      try {
        const arbol = await carpetaService.listar(area.id);
        setCantidadCarpetas(aplanarCarpetas(arbol).length);
      } catch {
        setCantidadCarpetas(null);
      }
    }
    cargarCantidadCarpetas();
  }, [area?.id]);

  useEffect(() => {
    if (!area?.id) return;
    async function cargarConteoDocumentos() {
      try {
        const [total, ...porEstado] = await Promise.all([
          documentoService.listar({ areaId: area.id, limit: 1 }),
          ...ESTADOS_DOCUMENTO.map((estado) => documentoService.listar({ areaId: area.id, estado, limit: 1 })),
        ]);
        setConteoDocumentos({
          total: total.pagination.total,
          vigente: porEstado[0].pagination.total,
          por_vencer: porEstado[1].pagination.total,
          vencido: porEstado[2].pagination.total,
        });
      } catch {
        setConteoDocumentos(null);
      }
    }
    cargarConteoDocumentos();
  }, [area?.id]);

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!area) {
    return (
      <EmptyState
        icon={Building2}
        title="No se pudo cargar el área"
        description={errorCarga || 'El área solicitada no existe o no está disponible.'}
        action={
          <Link to="/areas" className={VOLVER_CLASSNAME}>
            <ArrowLeft className="w-4 h-4" />
            Volver a Áreas
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/areas" className={VOLVER_CLASSNAME}>
          <ArrowLeft className="w-4 h-4" />
          Volver a Áreas
        </Link>
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{area.codigo}</p>
            </div>
            <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <StatusChip status={area.activo ? 'activo' : 'inactivo'} />
            <StatusChip status={nivelSalud(area.saludDocumentalPct)} customLabel={`${area.saludDocumentalPct}% al día`} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{lider ? `Líder: ${lider.nombre} ${lider.apellido}` : 'Sin líder asignado'}</p>
        </div>

        <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <Folder className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="font-semibold text-slate-800 dark:text-slate-100">Carpetas</p>
          </div>
          <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-3">{cantidadCarpetas ?? '—'}</p>
          <Button variant="outline" fullWidth onClick={() => navigate(`/documentos/carpetas?areaId=${area.id}`)}>
            Ver carpetas
          </Button>
        </div>

        <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="font-semibold text-slate-800 dark:text-slate-100">Documentos</p>
          </div>
          <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">{conteoDocumentos?.total ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {conteoDocumentos ? `${conteoDocumentos.vigente} vigentes · ${conteoDocumentos.por_vencer} por vencer · ${conteoDocumentos.vencido} vencidos` : '—'}
          </p>
          <Button variant="outline" fullWidth onClick={() => navigate(`/documentos?areaId=${area.id}`)}>
            Ver documentos
          </Button>
        </div>
      </div>
    </div>
  );
}
```

No se dispara ningún toast (`enqueueSnackbar`) en esta página: el fallo de carga del
área se comunica una sola vez, en el `EmptyState`, y los fallos de líder/carpetas/
documentos son silenciosos por diseño (información de apoyo, no una acción crítica)
— agregar un toast redundante con el mismo texto del `EmptyState` duplicaría el
mensaje en pantalla.

- [ ] **Step 5: Wire the `/areas/:id` route**

Modify `frontend/src/App.jsx` — add the import (after the `AreasListado` import,
line 10):

```jsx
import AreaDetalle from './pages/areas/AreaDetalle';
```

Add the route right after the `/areas` route (after line 54):

```jsx
                <Route
                  path="/areas/:id"
                  element={
                    <PermissionRoute modulo="areas" accion="ver">
                      <AreaDetalle />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/areas/AreaDetalle.test.jsx`
Expected: PASS (11 tests)

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (189 baseline + 11 new = 200). Nota: esta máquina tiene un
problema de recursos preexistente y ajeno al código que a veces hace que `npm test`
(sin filtro) reporte fallos de timeout ("Test timed out in 5000ms") en archivos no
relacionados con este cambio — si eso ocurre, verifica corriendo los archivos
puntuales en vez de la suite completa antes de asumir una regresión real.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/area.service.js frontend/src/pages/areas/AreaDetalle.jsx frontend/src/pages/areas/AreaDetalle.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add the Detalle de Área screen"
```

---

### Task 2: `AreasListado.jsx` — tarjetas y filas navegables

**Files:**
- Modify: `frontend/src/pages/areas/AreasListado.jsx`
- Modify: `frontend/src/pages/areas/AreasListado.test.jsx`

**Interfaces:**
- Consumes: ruta `/areas/:id` de Task 1.
- Produces: nada nuevo para otros tasks.

- [ ] **Step 1: Write the failing tests**

Modify `frontend/src/pages/areas/AreasListado.test.jsx` — cambiar el import de
react-router (agregar una línea nueva, después de la línea 3 `import { vi } from
'vitest';`):

```jsx
import { MemoryRouter, Routes, Route } from 'react-router-dom';
```

Reemplazar `renderPagina` (líneas 16-22):

```jsx
function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/areas']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/areas" element={<AreasListado />} />
          <Route path="/areas/:id" element={<p>Detalle de Área</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}
```

Add 3 new tests at the end of the `describe('AreasListado', ...)` block (right
before its closing `});`):

```jsx
  it('navigates to the área detail when a tarjeta is clicked', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();

    await screen.findByText('Financiera');
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));
    await userEvent.click(screen.getByText('Financiera'));

    expect(await screen.findByText('Detalle de Área')).toBeInTheDocument();
  });

  it('navigates to the área detail via keyboard when a tarjeta is focused', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();

    await screen.findByText('Financiera');
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));
    screen.getByText('Financiera').closest('[role="button"]').focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText('Detalle de Área')).toBeInTheDocument();
  });

  it('navigates to the área detail when a table row is clicked', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    areaService.listar.mockResolvedValue([{ id: 1, nombre: 'Financiera', codigo: 'FIN', saludDocumentalPct: '92.0' }]);
    renderPagina();

    await userEvent.click(await screen.findByText('Financiera'));

    expect(await screen.findByText('Detalle de Área')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/areas/AreasListado.test.jsx`
Expected: FAIL — clicking "Financiera" today does nothing (no navigation wired up).

- [ ] **Step 3: Make `AreaCard` and table rows navigable**

Modify `frontend/src/pages/areas/AreasListado.jsx`:

Add the import (after line 1's file-path comment, alongside the other imports —
line 2):

```jsx
import { useNavigate } from 'react-router-dom';
```

Replace `AreaCard` (lines 27-40):

```jsx
function AreaCard({ area, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{area.codigo}</p>
        </div>
        <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={nivelSalud(area.saludDocumentalPct)} customLabel={`${area.saludDocumentalPct}% al día`} />
    </div>
  );
}
```

Inside `export default function AreasListado()`, add `const navigate =
useNavigate();` right after the line `const { isAdmin } = useAuth();` (line 43).

Update the `AreaCard` usage (line 182) to pass `onClick`:

```jsx
            <AreaCard key={area.id} area={area} onClick={() => navigate(`/areas/${area.id}`)} />
```

Update the `DataTable` usage (line 177) to add `onRowClick`:

```jsx
      {areas.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={areas} loading={cargando} emptyMessage="Sin áreas todavía" onRowClick={(area) => navigate(`/areas/${area.id}`)} />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/areas/AreasListado.test.jsx`
Expected: PASS (16 tests — 13 existing + 3 new)

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (200 baseline from Task 1 + 3 new = 203).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/areas/AreasListado.jsx frontend/src/pages/areas/AreasListado.test.jsx
git commit -m "feat(frontend): make AreasListado's tarjetas and rows navigate to the área detail"
```

---

### Task 3: `CarpetasGestion.jsx` — preseleccionar área desde la URL

**Files:**
- Modify: `frontend/src/pages/documentos/CarpetasGestion.jsx`
- Modify: `frontend/src/pages/documentos/CarpetasGestion.test.jsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `CarpetasGestion` ahora lee el query param `areaId` de la URL al montar
  — consumido por Task 1's `AreaDetalle.jsx` (su botón "Ver carpetas" navega a
  `/documentos/carpetas?areaId=<id>`, ya escrito en ese task; este task es lo que
  hace que ese query param realmente tenga efecto).

- [ ] **Step 1: Write the failing test**

Modify `frontend/src/pages/documentos/CarpetasGestion.test.jsx` — cambiar
`renderPagina` (para aceptar una ruta inicial opcional):

```jsx
function renderPagina(ruta = '/documentos/carpetas') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SnackbarProvider>
        <Routes>
          <Route path="/documentos/carpetas" element={<CarpetasGestion />} />
          <Route path="/documentos" element={<p>Documentos</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}
```

Add a new test inside `describe('CarpetasGestion', ...)`:

```jsx
  it('preselects the área from the areaId query param on mount', async () => {
    renderPagina('/documentos/carpetas?areaId=1');

    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByLabelText('Área de las carpetas')).toHaveTextContent('RRHH'));
    expect(await screen.findByRole('button', { name: 'Contratos' })).toBeInTheDocument();
  });
```

(This test needs `waitFor` imported from `@testing-library/react` — check the
existing import at the top of the file and add `waitFor` to it if it isn't already
there.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/documentos/CarpetasGestion.test.jsx -t "preselects"`
Expected: FAIL — `areaId` state starts at `''` regardless of the URL, so
`carpetaService.listar` is never called and no cards render.

- [ ] **Step 3: Seed `areaId` from the URL**

Modify `frontend/src/pages/documentos/CarpetasGestion.jsx`:

Change the import (line 2):

```jsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
```

Add `useSearchParams()` and replace the `areaId` state (lines 51-54):

```jsx
export default function CarpetasGestion() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState(() => {
    const areaIdParam = searchParams.get('areaId');
    return areaIdParam ? Number(areaIdParam) : '';
  });
```

El `Number(...)` importa por la misma razón que en `DocumentosListado.jsx`:
`FilterDropdown` compara el `value` seleccionado contra `option.value` con igualdad
estricta (`===`), y las opciones de área (`opcionesArea`) usan `area.id` (numérico).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/documentos/CarpetasGestion.test.jsx -t "preselects"`
Expected: PASS

- [ ] **Step 5: Run the full CarpetasGestion test file**

Run: `cd frontend && npx vitest run src/pages/documentos/CarpetasGestion.test.jsx`
Expected: PASS (15 tests — 14 existing + 1 new)

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (203 baseline from Task 2 + 1 new = 204).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/documentos/CarpetasGestion.jsx frontend/src/pages/documentos/CarpetasGestion.test.jsx
git commit -m "feat(frontend): seed CarpetasGestion's área filter from the areaId URL query param"
```

---

### Task 4: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Add the spec reference and describe the new screen**

Modify `README.md` — in the `## Documentación` list, add a new bullet right after
the "Diseño de la vista de carpetas estilo Google Drive..." line (line 17):

```markdown
- Diseño del Detalle de Área (info del área, líder resuelto, conteo de carpetas/documentos, navegación cruzada): `docs/superpowers/specs/2026-07-09-cod-detalle-area-design.md`
```

Add a new paragraph in the `## Frontend (\`frontend/\`)` section, right after the
"La gestión de carpetas..." paragraph (line 66):

```markdown
El detalle de un área (`/areas/:id`, accesible desde `AreasListado`) muestra su información (nombre, código, salud documental, líder resuelto), y dos accesos directos con conteo: "Ver carpetas" (`/documentos/carpetas?areaId=`) y "Ver documentos" (`/documentos?areaId=`, con desglose por estado). Es de solo lectura — no permite editar ni dar de baja el área.
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all 204 tests passing (documentation-only change, no test impact).

- [ ] **Step 3: Run the production build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the Detalle de Área screen"
```
