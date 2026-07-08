# Vista de carpetas estilo Google Drive + detalle de carpeta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `CarpetasGestion.jsx` (`/documentos/carpetas`) as a Google-Drive-style
card grid with drill-down navigation and breadcrumbs (replacing today's flat text
list), add an on-demand folder detail modal, and move folder creation to a modal with
an implicit parent folder.

**Architecture:** `CarpetasGestion.jsx` keeps fetching the full carpeta tree for an
área with a single `carpetaService.listar(areaId)` call (unchanged), then navigates
that tree **in memory** via a new `carpetaActualId` state (`null` = root). The
existing `aplanarCarpetas` helper (already exported from `DocumentosListado.jsx` and
already imported by `CarpetasGestion.jsx`) gets three new fields per flattened carpeta
(`carpetaPadreId`, `createdAt`, `subcarpetasCount`) so the flattened list alone can
drive card filtering, breadcrumb ancestor lookups, and the detail modal's content — no
new backend endpoint, no second data structure to keep in sync.

**Tech Stack:** React 19, Vite 7, Tailwind v4, react-hook-form, react-router-dom v7
(`useSearchParams`), Vitest + Testing Library.

## Global Constraints

- No backend changes: `Carpeta` model, `carpeta.controller.js`, and
  `carpeta.service.js` stay exactly as they are today.
- Carpeta CRUD stays at `listar`/`crear` only — no `editar`/`eliminar`/reorder.
- No per-folder document count on cards or in the detail modal (would require an
  extra request per folder or a new backend aggregation endpoint — explicitly out of
  scope per the approved spec).
- No grid/list `ViewToggle` on this screen — it is grid-only, unlike
  `AreasListado`/`DocumentosListado`.
- `aplanarCarpetas`'s existing consumers (`DocumentosListado.jsx`'s "Carpeta" filter
  and the "Crear documento" modal's Carpeta select) must keep working unchanged —
  the three new fields are additive, nothing existing is renamed or removed.
- Testing convention: Vitest + Testing Library, `describe`/`it` with English
  descriptions, `vi.mock(...)` for service mocks, `MemoryRouter` (with `Routes`/`Route`
  when navigation between routes must be observed).
- Every new/changed file ships with its test updates in the same commit.

---

### Task 1: Foundation — extend `aplanarCarpetas` and seed filters from the URL

**Files:**
- Modify: `frontend/src/pages/documentos/DocumentosListado.jsx`
- Modify: `frontend/src/pages/documentos/DocumentosListado.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `aplanarCarpetas(arbol, prefijo)` now returns objects shaped
  `{id, nombre, ruta, areaId, carpetaPadreId, createdAt, subcarpetasCount}` (previously
  `{id, nombre, ruta, areaId}`) — consumed by Task 2's `CarpetasGestion.jsx` for
  breadcrumb ancestor lookups and the detail modal's ruta/fecha/subcarpetas fields.
  `DocumentosListado`'s `filtros` state now seeds `areaId`/`carpetaId` from the
  `areaId`/`carpetaId` URL query params on first mount — consumed by Task 2's "Ver
  documentos de esta carpeta" button, which navigates to
  `/documentos?areaId=<id>&carpetaId=<id>`.

- [ ] **Step 1: Write the failing test for the extended `aplanarCarpetas` fields**

Modify `frontend/src/pages/documentos/DocumentosListado.test.jsx` — change the import
on line 6 to also bring in `aplanarCarpetas`:

```jsx
import DocumentosListado, { aplanarCarpetas } from './DocumentosListado';
```

Add a new `describe` block anywhere at the top level of the file (e.g. right after
the existing constants, before `describe('DocumentosListado', ...)`):

```jsx
describe('aplanarCarpetas', () => {
  it('includes carpetaPadreId, createdAt, and subcarpetasCount for each flattened carpeta', () => {
    const arbol = [
      {
        id: 1,
        nombre: 'Contratos',
        areaId: 1,
        carpetaPadreId: null,
        createdAt: '2026-01-05T00:00:00.000Z',
        subcarpetas: [
          { id: 2, nombre: 'Nómina', areaId: 1, carpetaPadreId: 1, createdAt: '2026-02-10T00:00:00.000Z', subcarpetas: [] },
        ],
      },
    ];

    const plano = aplanarCarpetas(arbol);

    expect(plano).toEqual([
      { id: 1, nombre: 'Contratos', ruta: 'Contratos', areaId: 1, carpetaPadreId: null, createdAt: '2026-01-05T00:00:00.000Z', subcarpetasCount: 1 },
      { id: 2, nombre: 'Nómina', ruta: 'Contratos / Nómina', areaId: 1, carpetaPadreId: 1, createdAt: '2026-02-10T00:00:00.000Z', subcarpetasCount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/documentos/DocumentosListado.test.jsx -t "aplanarCarpetas"`
Expected: FAIL — `toEqual` mismatch because the current implementation doesn't
include `carpetaPadreId`, `createdAt`, or `subcarpetasCount`.

- [ ] **Step 3: Extend `aplanarCarpetas`**

Modify `frontend/src/pages/documentos/DocumentosListado.jsx` — replace the existing
`aplanarCarpetas` function (currently at lines 35-40):

```jsx
export function aplanarCarpetas(arbol, prefijo = '') {
  return arbol.flatMap((carpeta) => {
    const ruta = prefijo ? `${prefijo} / ${carpeta.nombre}` : carpeta.nombre;
    return [
      {
        id: carpeta.id,
        nombre: carpeta.nombre,
        ruta,
        areaId: carpeta.areaId,
        carpetaPadreId: carpeta.carpetaPadreId,
        createdAt: carpeta.createdAt,
        subcarpetasCount: (carpeta.subcarpetas || []).length,
      },
      ...aplanarCarpetas(carpeta.subcarpetas || [], ruta),
    ];
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/documentos/DocumentosListado.test.jsx -t "aplanarCarpetas"`
Expected: PASS

- [ ] **Step 5: Write the failing test for query-param-seeded filters**

Modify `frontend/src/pages/documentos/DocumentosListado.test.jsx` — change
`renderPagina` (currently lines 25-36) to accept an optional starting route:

```jsx
function renderPagina(ruta = '/documentos') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SnackbarProvider>
        <Routes>
          <Route path="/documentos" element={<DocumentosListado />} />
          <Route path="/documentos/carpetas" element={<p>Gestión de carpetas</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}
```

Add a new test inside `describe('DocumentosListado', ...)` (e.g. right after the
`'keeps the "Carpeta" filter disabled...'` test):

```jsx
  it('seeds the Área and Carpeta filters from areaId/carpetaId query params on mount', async () => {
    renderPagina('/documentos?areaId=1&carpetaId=10');

    await waitFor(() => expect(documentoService.listar).toHaveBeenCalledWith(expect.objectContaining({ areaId: 1, carpetaId: 10, page: 1 })));
    // Both dropdowns' displayed labels depend on their own catalog ("areas"/"carpetas"
    // state) finishing its separate async load — wait for each independently rather
    // than assuming they've resolved by the time documentoService.listar has been called.
    await waitFor(() => expect(screen.getByLabelText('Área')).toHaveTextContent('RRHH'));
    await waitFor(() => expect(screen.getByLabelText('Carpeta')).toHaveTextContent('Contratos'));
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/documentos/DocumentosListado.test.jsx -t "seeds the"`
Expected: FAIL — `documentoService.listar` is called with `areaId: undefined,
carpetaId: undefined` because `filtros` still initializes to empty strings
regardless of the URL.

- [ ] **Step 7: Seed `filtros` from the URL query params**

Modify `frontend/src/pages/documentos/DocumentosListado.jsx`:

Change the import on line 3:

```jsx
import { useNavigate, useSearchParams } from 'react-router-dom';
```

Add a `useSearchParams()` call right after `const navigate = useNavigate();` (line 68):

```jsx
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
```

Replace the `filtros` initialization (line 80):

```jsx
  const [filtros, setFiltros] = useState(() => {
    const areaIdParam = searchParams.get('areaId');
    const carpetaIdParam = searchParams.get('carpetaId');
    return {
      areaId: areaIdParam ? Number(areaIdParam) : '',
      carpetaId: carpetaIdParam ? Number(carpetaIdParam) : '',
      tipoDocumentoId: '',
      estado: '',
      page: 1,
    };
  });
```

The `Number(...)` conversion matters: every other place `filtros.areaId`/`carpetaId`
is set today comes from a `FilterDropdown`'s numeric `option.value` (the catalog's
numeric `id`), and `FilterDropdown` matches selection with strict equality
(`value === option.value` — see `components/common/FilterDropdown/FilterDropdown.jsx`).
A raw string from `searchParams.get(...)` would silently fail to show as "selected"
in the Área/Carpeta dropdowns.

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/documentos/DocumentosListado.test.jsx -t "seeds the"`
Expected: PASS

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (177 baseline + 2 new = 179). If the pre-existing
`DocumentoDetalle.test.jsx` flaky test (fails only under the full-suite run, passes
in isolation) reappears, that's a known, unrelated issue — not something to fix here.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/documentos/DocumentosListado.jsx frontend/src/pages/documentos/DocumentosListado.test.jsx
git commit -m "feat(frontend): extend aplanarCarpetas and seed Documentos filters from the URL"
```

---

### Task 2: Rewrite `CarpetasGestion.jsx` as a navigable Drive-style card grid

**Files:**
- Modify: `frontend/src/pages/documentos/CarpetasGestion.jsx` (full replacement)
- Modify: `frontend/src/pages/documentos/CarpetasGestion.test.jsx` (full replacement)

**Interfaces:**
- Consumes: `aplanarCarpetas` from Task 1 (`{id, nombre, ruta, areaId,
  carpetaPadreId, createdAt, subcarpetasCount}` per entry); `FilterDropdown`, `Modal`,
  `Button`, `Input`, `EmptyState` (all pre-existing, unchanged); `carpetaService.listar(areaId)` /
  `carpetaService.crear({areaId, nombre, carpetaPadreId})` (unchanged); `areaService.listar()`
  (unchanged).
- Produces: navigates to `/documentos?areaId=<id>&carpetaId=<id>` from the detail
  modal's "Ver documentos de esta carpeta" button — Task 1's `DocumentosListado.jsx`
  already reads these query params on mount.

- [ ] **Step 1: Write the new failing tests**

Replace `frontend/src/pages/documentos/CarpetasGestion.test.jsx` entirely:

```jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CarpetasGestion from './CarpetasGestion';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';

vi.mock('../../api/carpeta.service');
vi.mock('../../api/area.service');

const AREAS = [
  { id: 1, nombre: 'RRHH' },
  { id: 2, nombre: 'Financiera' },
];

const ARBOL = [
  {
    id: 10,
    nombre: 'Contratos',
    areaId: 1,
    carpetaPadreId: null,
    createdAt: '2026-01-05T00:00:00.000Z',
    subcarpetas: [
      { id: 11, nombre: 'Nómina', areaId: 1, carpetaPadreId: 10, createdAt: '2026-02-10T00:00:00.000Z', subcarpetas: [] },
    ],
  },
  { id: 12, nombre: 'Proveedores', areaId: 1, carpetaPadreId: null, createdAt: '2026-01-06T00:00:00.000Z', subcarpetas: [] },
];

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/documentos/carpetas']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/documentos/carpetas" element={<CarpetasGestion />} />
          <Route path="/documentos" element={<p>Documentos</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

async function elegirArea(nombre) {
  await userEvent.click(screen.getByLabelText('Área de las carpetas'));
  await userEvent.click(await screen.findByRole('button', { name: nombre }));
}

describe('CarpetasGestion', () => {
  beforeEach(() => {
    areaService.listar.mockResolvedValue(AREAS);
    carpetaService.listar.mockResolvedValue(ARBOL);
  });

  it('shows the root-level carpetas of the chosen área as cards', async () => {
    renderPagina();
    await elegirArea('RRHH');

    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));
    expect(await screen.findByRole('button', { name: 'Contratos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Proveedores' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nómina' })).not.toBeInTheDocument();
  });

  it('opens a carpeta on click and shows its subcarpetas with an updated breadcrumb', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await userEvent.click(await screen.findByRole('button', { name: 'Contratos' }));

    expect(await screen.findByRole('button', { name: 'Nómina' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proveedores' })).not.toBeInTheDocument();
    const migaDePan = screen.getByRole('navigation', { name: 'Ruta de carpetas' });
    expect(migaDePan).toHaveTextContent('RRHH');
    expect(migaDePan).toHaveTextContent('Contratos');
  });

  it('returns to a previous level when a breadcrumb segment is clicked', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await userEvent.click(await screen.findByRole('button', { name: 'Contratos' }));
    await screen.findByRole('button', { name: 'Nómina' });

    await userEvent.click(screen.getByRole('button', { name: 'RRHH' }));

    expect(await screen.findByRole('button', { name: 'Contratos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Proveedores' })).toBeInTheDocument();
  });

  it('opens the detail modal from the info button without navigating into the carpeta', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await screen.findByRole('button', { name: 'Contratos' });

    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle de Contratos' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nómina' })).not.toBeInTheDocument();
  });

  it('shows ruta, creation date, and subcarpetas count in the detail modal', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await userEvent.click(await screen.findByRole('button', { name: 'Contratos' }));
    await screen.findByRole('button', { name: 'Nómina' });

    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle de Nómina' }));

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('heading', { name: 'Nómina' })).toBeInTheDocument();
    expect(within(dialogo).getByText('Contratos / Nómina')).toBeInTheDocument();
    expect(within(dialogo).getByText('10/02/2026')).toBeInTheDocument();
    expect(within(dialogo).getByText('0')).toBeInTheDocument();
  });

  it('navigates to Documentos filtered by this carpeta from the detail modal', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await screen.findByRole('button', { name: 'Contratos' });
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle de Contratos' }));

    await userEvent.click(screen.getByRole('button', { name: /ver documentos de esta carpeta/i }));

    expect(await screen.findByText('Documentos')).toBeInTheDocument();
  });

  it('creates a carpeta at the root of the área when none is open', async () => {
    carpetaService.crear.mockResolvedValue({ id: 13, nombre: 'Nueva' });
    renderPagina();
    await elegirArea('RRHH');
    await screen.findByRole('button', { name: 'Contratos' });

    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    await waitFor(() => expect(carpetaService.crear).toHaveBeenCalledWith({ areaId: 1, nombre: 'Nueva', carpetaPadreId: null }));
    expect(await screen.findByText('Carpeta creada exitosamente')).toBeInTheDocument();
  });

  it('creates a carpeta under the currently open carpeta', async () => {
    carpetaService.crear.mockResolvedValue({ id: 14, nombre: 'Contratos 2026' });
    renderPagina();
    await elegirArea('RRHH');
    await userEvent.click(await screen.findByRole('button', { name: 'Contratos' }));
    await screen.findByRole('button', { name: 'Nómina' });

    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Contratos 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    await waitFor(() => expect(carpetaService.crear).toHaveBeenCalledWith({ areaId: 1, nombre: 'Contratos 2026', carpetaPadreId: 10 }));
  });

  it('shows an error when creation fails', async () => {
    carpetaService.crear.mockRejectedValue(new Error('El nombre ya existe en esta área'));
    renderPagina();
    await elegirArea('RRHH');
    await screen.findByRole('button', { name: 'Contratos' });

    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Contratos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(await screen.findByText('El nombre ya existe en esta área')).toBeInTheDocument();
  });

  it('resets navigation to the root when the área changes', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await userEvent.click(await screen.findByRole('button', { name: 'Contratos' }));
    await screen.findByRole('button', { name: 'Nómina' });

    carpetaService.listar.mockResolvedValue([
      { id: 20, nombre: 'Presupuestos', areaId: 2, carpetaPadreId: null, createdAt: '2026-03-01T00:00:00.000Z', subcarpetas: [] },
    ]);
    await elegirArea('Financiera');

    await waitFor(() => expect(carpetaService.listar).toHaveBeenLastCalledWith(2));
    expect(await screen.findByRole('button', { name: 'Presupuestos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nómina' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the current level has no subcarpetas', async () => {
    carpetaService.listar.mockResolvedValue([]);
    renderPagina();
    await elegirArea('RRHH');

    expect(await screen.findByText('Sin subcarpetas aquí')).toBeInTheDocument();
  });

  it('navigates back to Documentos', async () => {
    renderPagina();
    expect(screen.getByRole('link', { name: /volver a documentos/i })).toHaveAttribute('href', '/documentos');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/documentos/CarpetasGestion.test.jsx`
Expected: FAIL — the current component renders a flat `<ul>` list and a bottom
form with an explicit "Carpeta padre" select; none of the new roles/labels/behaviors
(cards as buttons, breadcrumb navigation, info button, detail modal, "Nueva carpeta"
modal) exist yet.

- [ ] **Step 3: Replace `CarpetasGestion.jsx`**

Replace `frontend/src/pages/documentos/CarpetasGestion.jsx` entirely:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, ChevronRight, FileText, Folder, Info, Plus } from 'lucide-react';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';
import { aplanarCarpetas } from './DocumentosListado';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

function CarpetaCard({ carpeta, onAbrir, onVerDetalle }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={carpeta.nombre}
      onClick={onAbrir}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAbrir()}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer flex items-start justify-between gap-2"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Folder className="w-8 h-8 text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true" />
        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{carpeta.nombre}</p>
      </div>
      <button
        type="button"
        aria-label={`Ver detalle de ${carpeta.nombre}`}
        onClick={(e) => {
          e.stopPropagation();
          onVerDetalle();
        }}
        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-centhrix-surface rounded-lg transition-colors shrink-0"
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function CarpetasGestion() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [arbol, setArbol] = useState([]);
  const [carpetaActualId, setCarpetaActualId] = useState(null);
  const [detalleId, setDetalleId] = useState(null);
  const [crearModalAbierto, setCrearModalAbierto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    async function cargarAreas() {
      try {
        const data = await areaService.listar();
        setAreas(data);
      } catch {
        setAreas([]);
      }
    }
    cargarAreas();
  }, []);

  async function cargarCarpetas(area) {
    if (!area) {
      setArbol([]);
      return;
    }
    try {
      const data = await carpetaService.listar(Number(area));
      setArbol(data);
    } catch {
      setArbol([]);
    }
  }

  useEffect(() => {
    setCarpetaActualId(null);
    setDetalleId(null);
    setCrearModalAbierto(false);
    cargarCarpetas(areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  const carpetasPlanas = useMemo(() => aplanarCarpetas(arbol), [arbol]);
  const nivelActual = carpetasPlanas.filter((carpeta) => carpeta.carpetaPadreId === carpetaActualId);

  function calcularAncestros(id) {
    const ancestros = [];
    let actual = id != null ? carpetasPlanas.find((carpeta) => carpeta.id === id) : null;
    while (actual) {
      ancestros.unshift(actual);
      actual = actual.carpetaPadreId != null ? carpetasPlanas.find((carpeta) => carpeta.id === actual.carpetaPadreId) : null;
    }
    return ancestros;
  }
  const ancestros = calcularAncestros(carpetaActualId);
  const areaSeleccionada = areas.find((area) => area.id === Number(areaId));
  const carpetaDetalle = detalleId != null ? carpetasPlanas.find((carpeta) => carpeta.id === detalleId) : null;

  async function onCrearCarpeta({ nombre }) {
    try {
      await carpetaService.crear({ areaId: Number(areaId), nombre, carpetaPadreId: carpetaActualId });
      enqueueSnackbar('Carpeta creada exitosamente', { variant: 'success' });
      reset();
      setCrearModalAbierto(false);
      await cargarCarpetas(areaId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la carpeta', { variant: 'error' });
    }
  }

  function cerrarModalCrear() {
    setCrearModalAbierto(false);
    reset();
  }

  function irADocumentos() {
    navigate(`/documentos?areaId=${carpetaDetalle.areaId}&carpetaId=${carpetaDetalle.id}`);
  }

  const opcionesArea = areas.map((area) => ({ value: area.id, label: area.nombre }));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/documentos"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Documentos
        </Link>
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Gestión de carpetas</h2>
      </div>

      <div className="max-w-sm mb-6">
        <FilterDropdown
          label="Área de las carpetas"
          options={opcionesArea}
          value={areaId}
          onChange={setAreaId}
          placeholder="Selecciona un área"
        />
      </div>

      {areaId && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <nav aria-label="Ruta de carpetas" className="flex items-center flex-wrap gap-1 text-sm">
              <button
                type="button"
                onClick={() => setCarpetaActualId(null)}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  carpetaActualId === null
                    ? 'font-semibold text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {areaSeleccionada?.nombre || 'Área'}
              </button>
              {ancestros.map((carpeta) => (
                <span key={carpeta.id} className="flex items-center gap-1">
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setCarpetaActualId(carpeta.id)}
                    className={`px-2 py-1 rounded-lg transition-colors ${
                      carpeta.id === carpetaActualId
                        ? 'font-semibold text-slate-800 dark:text-slate-100'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {carpeta.nombre}
                  </button>
                </span>
              ))}
            </nav>

            <Button icon={Plus} onClick={() => setCrearModalAbierto(true)}>
              Nueva carpeta
            </Button>
          </div>

          {nivelActual.length === 0 ? (
            <EmptyState icon={Folder} title="Sin subcarpetas aquí" description='Usa "Nueva carpeta" arriba para crear la primera.' />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nivelActual.map((carpeta) => (
                <CarpetaCard
                  key={carpeta.id}
                  carpeta={carpeta}
                  onAbrir={() => setCarpetaActualId(carpeta.id)}
                  onVerDetalle={() => setDetalleId(carpeta.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={crearModalAbierto}
        onClose={cerrarModalCrear}
        title="Nueva carpeta"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModalCrear}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrearCarpeta)}>Crear carpeta</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre de la nueva carpeta" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
        </form>
      </Modal>

      <Modal isOpen={detalleId != null} onClose={() => setDetalleId(null)} title={carpetaDetalle?.nombre || ''} size="sm">
        {carpetaDetalle && (
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Ruta</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium">{carpetaDetalle.ruta}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Creada el</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium">
                  {new Date(carpetaDetalle.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Subcarpetas</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium">{carpetaDetalle.subcarpetasCount}</dd>
              </div>
            </dl>
            <Button icon={FileText} onClick={irADocumentos} fullWidth>
              Ver documentos de esta carpeta
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
```

Note on `aria-label={carpeta.nombre}` in `CarpetaCard`: the card's outer
`div[role="button"]` also contains a nested real `<button aria-label="Ver detalle de
...">`. Without an explicit `aria-label` on the outer element, its computed
accessible name would concatenate both the visible folder name AND the nested
button's own label ("Contratos Ver detalle de Contratos"), breaking
`getByRole('button', {name: 'Contratos'})`. The explicit `aria-label` overrides
content-based name computation so the outer card's accessible name is exactly the
folder name.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/documentos/CarpetasGestion.test.jsx`
Expected: PASS (12 tests)

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (179 baseline from Task 1 − 4 old `CarpetasGestion` tests +
12 new = 187). The known pre-existing `DocumentoDetalle.test.jsx` flake (full-suite
only, passes in isolation) is unrelated to this task.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/documentos/CarpetasGestion.jsx frontend/src/pages/documentos/CarpetasGestion.test.jsx
git commit -m "feat(frontend): redesign CarpetasGestion as a navigable Drive-style card grid with a folder detail modal"
```

---

### Task 3: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Add the spec reference and update the frontend description**

Modify `README.md` — in the `## Documentación` list, add a new bullet right after the
"Diseño de componentes portados del CRM Centhrix..." line (line 16):

```markdown
- Diseño de la vista de carpetas estilo Google Drive (navegación por tarjetas, migas de pan, y detalle de carpeta): `docs/superpowers/specs/2026-07-08-cod-carpetas-vista-drive-design.md`
```

Then replace the sentence about carpeta management (line 65):

```markdown
La gestión de carpetas (`/documentos/carpetas`) es una vista de tarjetas navegable estilo Google Drive: se entra a una carpeta haciendo clic en su tarjeta, una miga de pan permite volver a cualquier nivel superior, un botón de información abre el detalle de una carpeta (ruta, fecha de creación, cantidad de subcarpetas, y acceso directo a sus documentos), y "Nueva carpeta" crea una carpeta con la carpeta padre implícita según el nivel donde se esté parado.
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all 187 tests passing (documentation-only change, no test impact).

- [ ] **Step 3: Run the production build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the Drive-style carpetas view and folder detail modal"
```
