# Portar componentes reutilizables del CRM Centhrix a COD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `DatePicker`, `FilterDropdown`, and `AccionesDropdown` from the CRM Centhrix into COD's `components/common/`, wire them into `DocumentosListado.jsx`, and replace the `CarpetasModal.jsx` modal with a dedicated `CarpetasGestion.jsx` screen at its own route.

**Architecture:** The 3 components are ported near-verbatim from `c:/Users/PC_PRACTIDS/Documents/GitHub/istho-crm-p/frontend/src/components/common/` — they already use COD-compatible `centhrix-*`/`orange-*` classes. Each gets its own folder (`components/common/<Nombre>/<Nombre>.jsx`) per COD's convention, plus a label/button `htmlFor`/`id` association (via `useId()`, matching `Input.jsx`'s pattern) that the CRM originals lack. `CarpetasModal.jsx` is retired in favor of a routed screen (`/documentos/carpetas`) that fetches its own `areas` catalog, following the same "load your own catalogs" precedent already used by `DocumentoDetalle.jsx`.

**Tech Stack:** React 19, Vite 7, Tailwind v4, react-hook-form, react-day-picker (new dependency), Vitest + Testing Library.

## Global Constraints

- New dependency: `react-day-picker@^9.14.0` (same version already used by the CRM; COD's `react`/`react-dom` are already `^19.2.0`, matching the CRM's, so no peer-dependency conflict).
- File structure: one folder per component (`components/common/DatePicker/DatePicker.jsx` + `.test.jsx`), not the CRM's flat-file layout.
- Every ported component gets a real `htmlFor`/`id` label association via `useId()` (the CRM originals render a bare `<label>` with no `htmlFor`, and their trigger `<button>` has no `id` — this is a real gap relative to COD's own `Input.jsx` convention and to COD's test convention of using `getByLabelText` everywhere).
- `FilterDropdown` additionally gets a `disabled` prop the CRM original doesn't have — Task 6 needs it to keep the "Carpeta" filter disabled until an área is chosen, matching today's native-`<select>`'s `disabled={!filtros.areaId}` behavior; without it that existing guard would silently disappear.
- These two additions are the only functional deviations from "verbatim" in this plan; everything else (classes, behavior, other props) is ported as-is.
- `AccionesDropdown` gets a `PropTypes` block on port (the CRM original only has a JSDoc comment) to match every other common component in COD (`Modal`, `Input`, `StatusChip`, `EmptyState`, `Button` all declare `propTypes`).
- Out of scope (do not touch in any task): any `<select>` registered via react-hook-form's `register(...)` inside a create/edit form (Rol in "Crear área", Rol/Usuario existente in Usuarios, Carpeta/Tipo de documento in "Crear documento", Carpeta padre in `CarpetasGestion`) — these stay native `<select>` elements. `AreasListado.jsx`/`UsuariosListado.jsx` are not touched — neither has a filter bar or a multi-button toolbar today.
- Carpeta CRUD stays at today's scope (`listar`/`crear` only) — no `editar`/`eliminar`/reorder endpoints or UI are added.
- Testing convention: Vitest + Testing Library, `describe`/`it` with English descriptions (matching every existing test file in this codebase), `vi.mock(...)` for service mocks, `MemoryRouter` wrapping any component that calls `useNavigate`/`Link`.
- Every new file ships with its test sibling in the same commit.

---

### Task 1: Support changes — dependency and CSS keyframe

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `react-day-picker` importable from any frontend file (consumed by Task 4's `DatePicker`); the `.animate-fadeIn` CSS class available globally (consumed by Task 2's `FilterDropdown` and Task 4's `DatePicker`).

- [ ] **Step 1: Add the `react-day-picker` dependency**

Modify `frontend/package.json` — add one line to `dependencies` (alphabetical, between `prop-types` and `react`):

```json
  "dependencies": {
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.1",
    "@mui/material": "^7.3.7",
    "@tailwindcss/vite": "^4.1.18",
    "axios": "^1.13.2",
    "lucide-react": "^0.562.0",
    "notistack": "^3.0.2",
    "prop-types": "^15.8.1",
    "react-day-picker": "^9.14.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.70.0",
    "react-router-dom": "^7.12.0",
    "tailwindcss": "^4.1.18"
  },
```

- [ ] **Step 2: Install it**

Run: `cd frontend && npm install`
Expected: `react-day-picker@9.x.x` added to `node_modules` and `package-lock.json` updated, no errors.

- [ ] **Step 3: Add the `fadeIn` keyframe and `.animate-fadeIn` class**

Modify `frontend/src/index.css` — add at the end of the file:

```css

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}
```

- [ ] **Step 4: Verify the frontend still builds and tests still pass**

Run: `cd frontend && npm run build`
Expected: build succeeds, no errors.

Run: `cd frontend && npm test`
Expected: all existing tests still pass (this task touches no component logic).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/index.css
git commit -m "chore(frontend): add react-day-picker dependency and fadeIn animation"
```

---

### Task 2: Port `FilterDropdown`

**Files:**
- Create: `frontend/src/components/common/FilterDropdown/FilterDropdown.jsx`
- Create: `frontend/src/components/common/FilterDropdown/FilterDropdown.test.jsx`

**Interfaces:**
- Consumes: nothing new (React, `react-dom`'s `createPortal`, `lucide-react`).
- Produces: default export `FilterDropdown` — props `label?`, `options` (`{value, label}[]`, default `[]`), `value` (string/number, or array when `multiple`), `onChange(newValue)`, `placeholder?` (default `'Seleccionar'`), `multiple?` (default `false`), `icon?` (a lucide component), `compact?` (default `false`), `searchable?` (default: auto — search box shows when `options.length > 6`), `disabled?` (default `false` — not present in the CRM original; added here because Task 6's "Carpeta" filter needs to stay disabled until an área is chosen, matching today's native-`<select>` behavior). Consumed by Task 5 (`CarpetasGestion`) and Task 6 (`DocumentosListado`'s 4 filters).

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/common/FilterDropdown/FilterDropdown.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import FilterDropdown from './FilterDropdown';

const OPCIONES = [
  { value: '', label: 'Todos' },
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
];

describe('FilterDropdown', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the placeholder when no value is selected', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} placeholder="Seleccionar estado" />);
    expect(screen.getByRole('button', { name: /Seleccionar estado/i })).toBeInTheDocument();
  });

  it('shows the selected option label on the trigger button', () => {
    render(<FilterDropdown options={OPCIONES} value="activo" onChange={() => {}} />);
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('Activo');
  });

  it('opens the options panel when the trigger button is clicked', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} />);
    expect(screen.queryByText('Activo')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getByText('Todos')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('calls onChange with the selected option value and closes the panel', () => {
    const handleChange = vi.fn();
    render(<FilterDropdown options={OPCIONES} value="" onChange={handleChange} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('Activo'));

    expect(handleChange).toHaveBeenCalledWith('activo');
    expect(screen.queryByText('Inactivo')).not.toBeInTheDocument();
  });

  it('supports multiple selection without closing the panel', () => {
    const handleChange = vi.fn();
    render(<FilterDropdown options={OPCIONES} value={[]} onChange={handleChange} multiple />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('Activo'));

    expect(handleChange).toHaveBeenCalledWith(['activo']);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('shows a search box and filters options when there are more than 6', () => {
    const muchasOpciones = Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, label: `Opción ${i}` }));
    render(<FilterDropdown options={muchasOpciones} value="" onChange={() => {}} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    const buscador = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(buscador, { target: { value: 'Opción 3' } });

    expect(screen.getByText('Opción 3')).toBeInTheDocument();
    expect(screen.queryByText('Opción 1')).not.toBeInTheDocument();
  });

  it('renders the label with a real htmlFor/id association to the trigger button', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} label="Estado" />);
    expect(screen.getByLabelText('Estado')).toBe(screen.getAllByRole('button')[0]);
  });

  it('does not open the panel when disabled', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} disabled />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('Activo')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run FilterDropdown`
Expected: FAIL — `Cannot find module './FilterDropdown'`

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/components/common/FilterDropdown/FilterDropdown.jsx
import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ChevronDown, Check, Search, X } from 'lucide-react';

const SEARCH_THRESHOLD = 6;

const FilterDropdown = ({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Seleccionar',
  multiple = false,
  icon: Icon,
  compact = false,
  searchable,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const triggerId = useId();

  const showSearch = searchable !== undefined ? searchable : options.length > SEARCH_THRESHOLD;

  const filteredOptions = showSearch && search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - rect.width - 4));
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setIsOpen((prev) => !prev);
  }, [isOpen, disabled]);

  useEffect(() => {
    if (isOpen && showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    if (!isOpen) setSearch('');
  }, [isOpen, showSearch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target) &&
        !(panelRef.current && panelRef.current.contains(event.target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      if (searchRef.current && document.activeElement === searchRef.current) return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleSelect = useCallback((optionValue) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      const newValues = currentValues.includes(optionValue)
        ? currentValues.filter((v) => v !== optionValue)
        : [...currentValues, optionValue];
      onChange?.(newValues);
    } else {
      onChange?.(optionValue);
      setIsOpen(false);
    }
  }, [multiple, value, onChange]);

  const getDisplayValue = () => {
    if (multiple && Array.isArray(value) && value.length > 0) {
      if (value.length === 1) {
        const option = options.find((o) => o.value === value[0]);
        return option?.label || value[0];
      }
      return `${value.length} seleccionados`;
    }

    if (!multiple && value) {
      const option = options.find((o) => o.value === value);
      return option?.label || value;
    }

    return placeholder;
  };

  const isSelected = (optionValue) => {
    if (multiple) {
      return Array.isArray(value) && value.includes(optionValue);
    }
    return value === optionValue;
  };

  return (
    <div ref={containerRef} className="relative">
      {label && <label htmlFor={triggerId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>}

      <button
        ref={buttonRef}
        id={triggerId}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-2 w-full
          bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-600
          hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
          transition-all duration-200
          disabled:bg-slate-50 dark:disabled:bg-centhrix-card disabled:cursor-not-allowed disabled:hover:border-slate-200 dark:disabled:hover:border-slate-600
          ${compact ? 'px-2.5 py-1.5 rounded-lg text-xs' : 'px-4 py-2.5 rounded-xl text-sm'}
        `}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className={compact ? 'w-3 h-3 text-slate-400' : 'w-4 h-4 text-slate-400'} />}
          <span className={value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>{getDisplayValue()}</span>
        </div>
        <ChevronDown
          className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${compact ? 'w-3 h-3' : 'w-4 h-4'}`}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className={`
            bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-600 shadow-lg dark:shadow-slate-900/50
            animate-fadeIn overflow-hidden
            ${compact ? 'rounded-lg' : 'rounded-xl'}
          `}
        >
          {showSearch && (
            <div className={`border-b border-slate-100 dark:border-slate-700 ${compact ? 'p-1.5' : 'p-2'}`}>
              <div className="relative flex items-center">
                <Search className={`absolute left-2.5 text-slate-400 dark:text-slate-500 pointer-events-none ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
                  placeholder="Buscar..."
                  className={`
                    w-full bg-slate-50 dark:bg-centhrix-surface border border-slate-200 dark:border-slate-600
                    rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500
                    focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-400
                    transition-colors
                    ${compact ? 'pl-7 pr-6 py-1 text-xs' : 'pl-8 pr-7 py-1.5 text-xs'}
                  `}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <X className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-52 overflow-y-auto">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`
                  flex items-center justify-between w-full
                  text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400
                  transition-colors duration-150
                  ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}
                `}
              >
                <span>{option.label}</span>
                {isSelected(option.value) && <Check className={compact ? 'w-3 h-3 text-orange-500' : 'w-4 h-4 text-orange-500'} />}
              </button>
            ))}

            {filteredOptions.length === 0 && (
              <div className={`text-slate-500 dark:text-slate-400 text-center ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}>
                {search ? 'Sin resultados' : 'No hay opciones'}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

FilterDropdown.propTypes = {
  label: PropTypes.string,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.array]),
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  multiple: PropTypes.bool,
  icon: PropTypes.elementType,
  compact: PropTypes.bool,
  searchable: PropTypes.bool,
  disabled: PropTypes.bool,
};

export default FilterDropdown;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run FilterDropdown`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/FilterDropdown/FilterDropdown.jsx frontend/src/components/common/FilterDropdown/FilterDropdown.test.jsx
git commit -m "feat(frontend): port FilterDropdown component from the CRM"
```

---

### Task 3: Port `AccionesDropdown`

**Files:**
- Create: `frontend/src/components/common/AccionesDropdown/AccionesDropdown.jsx`
- Create: `frontend/src/components/common/AccionesDropdown/AccionesDropdown.test.jsx`

**Interfaces:**
- Consumes: nothing new (React, `lucide-react`).
- Produces: default export `AccionesDropdown` — prop `acciones` (`{label, icon?, onClick, variant?, hidden?}[]`, default `[]`). Renders `null` if every acción is absent or `hidden`. Consumed by Task 6 (`DocumentosListado`'s toolbar).

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/common/AccionesDropdown/AccionesDropdown.test.jsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download, RefreshCw } from 'lucide-react';
import AccionesDropdown from './AccionesDropdown';

describe('AccionesDropdown', () => {
  it('renders nothing when there are no acciones', () => {
    const { container } = render(<AccionesDropdown acciones={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every acción is hidden', () => {
    const { container } = render(<AccionesDropdown acciones={[{ label: 'Actualizar', onClick: vi.fn(), hidden: true }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a desktop button per acción and invokes onClick', async () => {
    const onActualizar = vi.fn();
    render(<AccionesDropdown acciones={[{ label: 'Actualizar', icon: RefreshCw, onClick: onActualizar }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onActualizar).toHaveBeenCalledTimes(1);
  });

  it('excludes hidden acciones from the desktop buttons', () => {
    render(
      <AccionesDropdown
        acciones={[
          { label: 'Actualizar', onClick: vi.fn() },
          { label: 'Exportar', onClick: vi.fn(), hidden: true },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });

  it('opens a mobile menu with the same acciones and invokes onClick on selection', async () => {
    const onDescargar = vi.fn();
    render(<AccionesDropdown acciones={[{ label: 'Descargar', icon: Download, onClick: onDescargar }]} />);

    await userEvent.click(screen.getByLabelText('Más acciones'));
    const menu = screen.getByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descargar' }));

    expect(onDescargar).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile menu after selecting an item', async () => {
    render(<AccionesDropdown acciones={[{ label: 'Descargar', onClick: vi.fn() }]} />);

    await userEvent.click(screen.getByLabelText('Más acciones'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Descargar' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run AccionesDropdown`
Expected: FAIL — `Cannot find module './AccionesDropdown'`

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/components/common/AccionesDropdown/AccionesDropdown.jsx
import { useState, useRef, useEffect, useId } from 'react';
import PropTypes from 'prop-types';
import { MoreVertical } from 'lucide-react';

const AccionesDropdown = ({ acciones = [] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();
  const visibles = acciones.filter((a) => !a.hidden);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (visibles.length === 0) return null;

  const btnBase = 'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors';
  const btnOutline = `${btnBase} bg-white dark:bg-centhrix-card text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-centhrix-surface`;
  const btnPrimary = `${btnBase} bg-orange-500 text-white hover:bg-orange-600`;

  return (
    <>
      <div className="hidden md:flex items-center gap-2">
        {visibles.map((a, i) => {
          const Icon = a.icon;
          const cls = a.variant === 'primary' ? btnPrimary : btnOutline;
          return (
            <button key={i} onClick={a.onClick} className={cls}>
              {Icon && <Icon className="w-4 h-4" />}
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="md:hidden relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Más acciones"
          className="p-2.5 bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors"
        >
          <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
        </button>

        {open && (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 py-1 overflow-hidden"
          >
            {visibles.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={i}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors"
                >
                  {Icon && <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />}
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

AccionesDropdown.propTypes = {
  acciones: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      onClick: PropTypes.func.isRequired,
      variant: PropTypes.string,
      hidden: PropTypes.bool,
    })
  ),
};

export default AccionesDropdown;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run AccionesDropdown`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/AccionesDropdown/AccionesDropdown.jsx frontend/src/components/common/AccionesDropdown/AccionesDropdown.test.jsx
git commit -m "feat(frontend): port AccionesDropdown component from the CRM"
```

---

### Task 4: Port `DatePicker`

**Files:**
- Create: `frontend/src/components/common/DatePicker/DatePicker.jsx`
- Create: `frontend/src/components/common/DatePicker/DatePicker.test.jsx`

**Interfaces:**
- Consumes: `react-day-picker` (Task 1), `react-day-picker/locale`'s `es` export.
- Produces: default export `DatePicker` — props `value?` (ISO `'YYYY-MM-DD'` string or `''`/`undefined`), `onChange(iso)` (called with `'YYYY-MM-DD'` or `''`), `placeholder?` (default `'dd/mm/aaaa'`), `label?`, `clearable?` (default `true`). Consumed by Task 6 (`DocumentosListado`'s "Vigencia desde"/"Vigencia hasta").

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/common/DatePicker/DatePicker.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import DatePicker from './DatePicker';

// react-day-picker uses matchMedia internally; jsdom doesn't implement it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('DatePicker', () => {
  it('shows the placeholder when there is no value', () => {
    render(<DatePicker onChange={vi.fn()} />);
    expect(screen.getByText('dd/mm/aaaa')).toBeInTheDocument();
  });

  it('shows the date in DD/MM/YYYY format when a value is set', () => {
    render(<DatePicker value="2026-05-08" onChange={vi.fn()} />);
    expect(screen.getByText('08/05/2026')).toBeInTheDocument();
  });

  it('opens the calendar when the trigger button is clicked', () => {
    render(<DatePicker onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    // DayPicker v9 renders its month grid with role="grid".
    expect(document.querySelector('[role="grid"]')).toBeInTheDocument();
  });

  it('shows a clear button when a value is set and clearable is true', () => {
    const { container } = render(<DatePicker value="2026-05-08" onChange={vi.fn()} />);
    expect(container.querySelector('span[role="button"]')).toBeInTheDocument();
  });

  it('calls onChange with an empty string when the clear button is clicked', () => {
    const handleChange = vi.fn();
    const { container } = render(<DatePicker value="2026-05-08" onChange={handleChange} />);
    fireEvent.click(container.querySelector('span[role="button"]'));
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('does not show a clear button when clearable is false', () => {
    const { container } = render(<DatePicker value="2026-05-08" onChange={vi.fn()} clearable={false} />);
    expect(container.querySelector('span[role="button"]')).not.toBeInTheDocument();
  });

  it('does not throw with an invalid date and falls back to the placeholder', () => {
    expect(() => render(<DatePicker value="no-es-fecha" onChange={vi.fn()} />)).not.toThrow();
    expect(screen.getByText('dd/mm/aaaa')).toBeInTheDocument();
  });

  it('renders the label with a real htmlFor/id association to the trigger button', () => {
    render(<DatePicker label="Vigencia desde" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Vigencia desde')).toBe(screen.getByRole('button'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run DatePicker`
Expected: FAIL — `Cannot find module './DatePicker'`

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/components/common/DatePicker/DatePicker.jsx
import { useState, useRef, useEffect, useCallback, useId } from 'react';
import PropTypes from 'prop-types';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const YEAR_START = 1950;
const YEAR_END = new Date().getFullYear() + 15;
const ALL_YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i);

const parseDate = (str) => {
  if (!str) return undefined;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? undefined : d;
};

const formatToIso = (date) => {
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatDisplay = (date) => {
  if (!date) return null;
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
};

const NavBtn = ({ onClick, children, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-centhrix-surface text-slate-500 dark:text-slate-400 transition-colors ${className}`}
  >
    {children}
  </button>
);

const DatePicker = ({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  label,
  clearable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const [view, setView] = useState('days');
  const [displayMonth, setDisplayMonth] = useState(() => parseDate(value) || new Date());

  const ref = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const yearsRef = useRef(null);
  const triggerId = useId();
  const selected = parseDate(value);

  const currentYear = displayMonth.getFullYear();
  const currentMonth = displayMonth.getMonth();

  useEffect(() => {
    const d = parseDate(value);
    if (d) setDisplayMonth(d);
  }, [value]);

  useEffect(() => {
    if (!isOpen) setView('days');
  }, [isOpen]);

  useEffect(() => {
    if (view === 'years' && yearsRef.current) {
      const btn = yearsRef.current.querySelector('[data-current="true"]');
      if (btn) btn.scrollIntoView({ block: 'center' });
    }
  }, [view]);

  const handleToggle = useCallback(() => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const PANEL_W = 288;
      const calendarHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= calendarHeight ? rect.bottom + 6 : rect.top - calendarHeight - 6;
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - PANEL_W - 4));
      setPanelStyle({ position: 'fixed', top, left, zIndex: 9999 });
    }
    setIsOpen((v) => !v);
  }, [isOpen]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleSelect = (date) => {
    onChange?.(formatToIso(date) || '');
    if (date) setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('');
  };

  const prevMonth = () => setDisplayMonth(new Date(currentYear, currentMonth - 1));
  const nextMonth = () => setDisplayMonth(new Date(currentYear, currentMonth + 1));

  const btnCaption = 'px-2 py-1 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-centhrix-surface transition-colors';

  return (
    <div ref={ref} className="relative">
      {label && (
        <label htmlFor={triggerId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        id={triggerId}
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between gap-2 w-full bg-white dark:bg-centhrix-surface border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 px-4 py-2.5 rounded-xl text-sm"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <span className={selected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}>
            {selected ? formatDisplay(selected) : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-white dark:bg-centhrix-card border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl animate-fadeIn overflow-hidden w-72"
        >
          {view === 'days' && (
            <>
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <NavBtn onClick={prevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </NavBtn>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => setView('months')} className={btnCaption}>
                    {MONTHS_ES[currentMonth]}
                  </button>
                  <button type="button" onClick={() => setView('years')} className={btnCaption}>
                    {currentYear}
                  </button>
                </div>
                <NavBtn onClick={nextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </NavBtn>
              </div>
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={handleSelect}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                locale={es}
                classNames={{
                  root: 'px-3 pb-3',
                  months: '',
                  month: '',
                  month_caption: 'hidden',
                  caption_label: 'hidden',
                  nav: 'hidden',
                  month_grid: 'w-full border-collapse',
                  weekdays: '',
                  weekday: 'w-9 h-8 text-center text-xs font-medium text-slate-400 dark:text-slate-500',
                  weeks: '',
                  week: '',
                  day: 'p-0 text-center',
                  day_button: 'w-9 h-9 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400 transition-colors duration-150 mx-auto',
                  selected: '[&>button]:bg-orange-500 [&>button]:text-white [&>button]:hover:bg-orange-600',
                  today: '[&>button]:font-bold [&>button]:ring-1 [&>button]:ring-orange-400',
                  outside: '[&>button]:text-slate-300 dark:[&>button]:text-slate-600 [&>button]:hover:bg-transparent',
                  disabled: '[&>button]:opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
                }}
              />
            </>
          )}

          {view === 'months' && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setView('days')} className={`flex items-center gap-1 ${btnCaption}`}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Volver
                </button>
                <button type="button" onClick={() => setView('years')} className={btnCaption}>
                  {currentYear}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTHS_ES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setDisplayMonth(new Date(currentYear, i)); setView('days'); }}
                    className={`py-2 rounded-lg text-sm transition-colors ${
                      i === currentMonth
                        ? 'bg-orange-500 text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400'
                    }`}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === 'years' && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setView('months')} className={`flex items-center gap-1 ${btnCaption}`}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Volver
                </button>
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Seleccionar año</span>
              </div>
              <div ref={yearsRef} className="grid grid-cols-4 gap-1 max-h-44 overflow-y-auto">
                {ALL_YEARS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-current={y === currentYear ? 'true' : undefined}
                    onClick={() => { setDisplayMonth(new Date(y, currentMonth)); setView('months'); }}
                    className={`py-2 rounded-lg text-sm transition-colors ${
                      y === currentYear
                        ? 'bg-orange-500 text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 dark:hover:text-orange-400'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

DatePicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  label: PropTypes.string,
  clearable: PropTypes.bool,
};

export default DatePicker;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run DatePicker`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/DatePicker/DatePicker.jsx frontend/src/components/common/DatePicker/DatePicker.test.jsx
git commit -m "feat(frontend): port DatePicker component from the CRM"
```

---

### Task 5: Replace `CarpetasModal` with a routed `CarpetasGestion` screen

**Files:**
- Create: `frontend/src/pages/documentos/CarpetasGestion.jsx`
- Create: `frontend/src/pages/documentos/CarpetasGestion.test.jsx`
- Delete: `frontend/src/pages/documentos/CarpetasModal.jsx`
- Delete: `frontend/src/pages/documentos/CarpetasModal.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/documentos/DocumentosListado.jsx`

**Interfaces:**
- Consumes: `FilterDropdown` (Task 2), `aplanarCarpetas` (exported from `DocumentosListado.jsx`), `areaService.listar()`, `carpetaService.listar(areaId)`/`crear(datos)`.
- Produces: default export `CarpetasGestion` (no props, reads nothing from the router other than `useNavigate`), mounted at route `/documentos/carpetas`. No exports consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/documentos/CarpetasGestion.test.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import CarpetasGestion from './CarpetasGestion';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';

vi.mock('../../api/carpeta.service');
vi.mock('../../api/area.service');

const AREAS = [
  { id: 1, nombre: 'RRHH' },
  { id: 2, nombre: 'Financiera' },
];

function renderPagina() {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <CarpetasGestion />
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('CarpetasGestion', () => {
  beforeEach(() => {
    areaService.listar.mockResolvedValue(AREAS);
  });

  it('loads its own areas catalog and lets the user pick one', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [{ id: 11, nombre: 'Nómina', carpetaPadreId: 10, areaId: 1, subcarpetas: [] }] }]);
    renderPagina();

    await userEvent.click(screen.getByLabelText('Área de las carpetas'));
    await userEvent.click(await screen.findByText('RRHH'));
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));

    const lista = screen.getByRole('list');
    expect(await within(lista).findByText('Contratos')).toBeInTheDocument();
    expect(within(lista).getByText('Contratos / Nómina')).toBeInTheDocument();
  });

  it('creates a carpeta under the selected parent and reloads the list', async () => {
    carpetaService.listar.mockResolvedValue([{ id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] }]);
    carpetaService.crear.mockResolvedValue({ id: 12, nombre: 'Políticas' });
    renderPagina();

    await userEvent.click(screen.getByLabelText('Área de las carpetas'));
    await userEvent.click(await screen.findByText('RRHH'));
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
    renderPagina();

    await userEvent.click(screen.getByLabelText('Área de las carpetas'));
    await userEvent.click(await screen.findByText('RRHH'));
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Contratos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(await screen.findByText('El nombre ya existe en esta área')).toBeInTheDocument();
  });

  it('navigates back to Documentos', async () => {
    renderPagina();
    expect(screen.getByRole('link', { name: /volver a documentos/i })).toHaveAttribute('href', '/documentos');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run CarpetasGestion`
Expected: FAIL — `Cannot find module './CarpetasGestion'`

- [ ] **Step 3: Write `CarpetasGestion.jsx`**

```jsx
// frontend/src/pages/documentos/CarpetasGestion.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft } from 'lucide-react';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';
import { aplanarCarpetas } from './DocumentosListado';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

export default function CarpetasGestion() {
  const { enqueueSnackbar } = useSnackbar();
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [carpetas, setCarpetas] = useState([]);
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
        <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 mb-6">
          {carpetas.length === 0 && <li className="text-slate-400 dark:text-slate-500">Sin carpetas todavía en esta área.</li>}
          {carpetas.map((carpeta) => (
            <li key={carpeta.id}>{carpeta.ruta}</li>
          ))}
        </ul>
      )}

      {areaId && (
        <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700 max-w-sm">
          <Input label="Nombre de la nueva carpeta" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />

          <div>
            <label htmlFor="carpetas-gestion-padre" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Carpeta padre (opcional)
            </label>
            <select
              id="carpetas-gestion-padre"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('carpetaPadreId')}
            >
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
  );
}
```

Note: `areaId` is now whatever `FilterDropdown` passes through `onChange` — the raw `option.value` (a number, since `opcionesArea` builds `value: area.id`). This is why `cargarCarpetas`/`onCrearCarpeta` keep their existing `Number(area)`/`Number(areaId)` calls: `Number(1) === 1`, so the coercion is a no-op now but stays harmless and defensive.

- [ ] **Step 4: Delete `CarpetasModal.jsx` and its test**

```bash
git rm frontend/src/pages/documentos/CarpetasModal.jsx frontend/src/pages/documentos/CarpetasModal.test.jsx
```

- [ ] **Step 5: Wire the route in `App.jsx`**

Modify `frontend/src/App.jsx` — add the import (with the other page imports):

```jsx
import CarpetasGestion from './pages/documentos/CarpetasGestion';
```

Add the route right after `/documentos/:id`:

```jsx
                <Route
                  path="/documentos/carpetas"
                  element={
                    <PermissionRoute modulo="documentos" accion="crear">
                      <CarpetasGestion />
                    </PermissionRoute>
                  }
                />
```

- [ ] **Step 6: Update `DocumentosListado.jsx` — retire the modal, navigate instead**

Modify `frontend/src/pages/documentos/DocumentosListado.jsx`:

Remove this import:

```jsx
import CarpetasModal from './CarpetasModal';
```

Remove this state declaration:

```jsx
  const [carpetasModalAbierto, setCarpetasModalAbierto] = useState(false);
```

Remove the `onCarpetaCreada` function entirely (it existed only to patch around the modal's stale-list bug — the routed screen makes it unnecessary, since navigating to `/documentos/carpetas` and back unmounts and remounts `DocumentosListado`, which re-runs `cargarCarpetasFiltro`/`cargarCarpetasCrear` fresh):

```jsx
  function onCarpetaCreada(areaIdAfectada) {
    if (filtros.areaId && Number(filtros.areaId) === areaIdAfectada) cargarCarpetasFiltro(filtros.areaId);
    if (areaSeleccionadaCrear && Number(areaSeleccionadaCrear) === areaIdAfectada) cargarCarpetasCrear(areaSeleccionadaCrear);
  }
```

Change the "Gestionar carpetas" button's `onClick` from:

```jsx
              <Button variant="outline" onClick={() => setCarpetasModalAbierto(true)}>
                Gestionar carpetas
              </Button>
```

to:

```jsx
              <Button variant="outline" onClick={() => navigate('/documentos/carpetas')}>
                Gestionar carpetas
              </Button>
```

Remove the `<CarpetasModal ... />` render block at the end of the component:

```jsx
      <CarpetasModal
        isOpen={carpetasModalAbierto}
        onClose={() => setCarpetasModalAbierto(false)}
        areas={areas}
        onCarpetaCreada={onCarpetaCreada}
      />
```

- [ ] **Step 7: Update `DocumentosListado.test.jsx` — replace the two CarpetasModal-integration tests with a navigation test**

Modify `frontend/src/pages/documentos/DocumentosListado.test.jsx` — remove these two `it(...)` blocks (the functionality they covered now lives in `CarpetasGestion.test.jsx`, written in Step 1):

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

  it('refreshes the "Carpeta" filter after creating a carpeta for the área currently selected in that filter', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    carpetaService.crear.mockResolvedValue({ id: 20, nombre: 'Nueva' });
    renderPagina();

    await screen.findByText('Manual RH');
    await userEvent.selectOptions(screen.getByLabelText('Área'), '1');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));

    await userEvent.click(screen.getByRole('button', { name: /gestionar carpetas/i }));
    await userEvent.selectOptions(screen.getByLabelText('Área de las carpetas'), '1');
    await within(screen.getByRole('list')).findByText('Contratos');

    // The refetch triggered by creation must pick up the new carpeta.
    carpetaService.listar.mockResolvedValue([
      ...CARPETAS_ARBOL,
      { id: 20, nombre: 'Nueva', areaId: 1, carpetaPadreId: null, subcarpetas: [] },
    ]);
    await userEvent.type(screen.getByLabelText('Nombre de la nueva carpeta'), 'Nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));
    await waitFor(() => expect(carpetaService.crear).toHaveBeenCalled());

    // The "Carpeta" filter select lives outside CarpetasModal — without the
    // onCarpetaCreada refresh wired up, this option would never appear.
    await waitFor(() => expect(within(screen.getByLabelText('Carpeta')).getByText('Nueva')).toBeInTheDocument());
  });
```

Replace them with:

```jsx
  it('navigates to /documentos/carpetas when "Gestionar carpetas" is clicked', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    renderPagina();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('button', { name: /gestionar carpetas/i }));

    // DocumentosListado unmounts once /documentos/carpetas is rendered by MemoryRouter,
    // so its absence here confirms the navigation actually happened.
    await waitFor(() => expect(screen.queryByText('Documentos')).not.toBeInTheDocument());
  });
```

This new test needs `Routes`/`Route` in its render helper so `MemoryRouter` actually swaps views on navigation (today's `renderPagina()` only wraps a bare `MemoryRouter`, which doesn't render anything for the destination path). Update `renderPagina` at the top of the file from:

```jsx
function renderPagina() {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <DocumentosListado />
      </SnackbarProvider>
    </MemoryRouter>
  );
}
```

to:

```jsx
function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/documentos']}>
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

And add `Routes, Route` to the existing `react-router-dom` import at the top of the file:

```jsx
import { MemoryRouter, Routes, Route } from 'react-router-dom';
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run CarpetasGestion DocumentosListado`
Expected: PASS (4 + 12 tests — `CarpetasGestion.test.jsx`'s 4 plus `DocumentosListado.test.jsx`'s remaining 12, after removing the 2 CarpetasModal-integration tests and adding 1 navigation test to the prior 13)

Run: `cd frontend && npm test`
Expected: all tests pass, no leftover references to the deleted `CarpetasModal`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/documentos/CarpetasGestion.jsx frontend/src/pages/documentos/CarpetasGestion.test.jsx frontend/src/App.jsx frontend/src/pages/documentos/DocumentosListado.jsx frontend/src/pages/documentos/DocumentosListado.test.jsx
git commit -m "feat(frontend): replace the carpetas modal with a routed Gestión de carpetas screen"
```

---

### Task 6: Integrate `FilterDropdown`, `AccionesDropdown`, and `DatePicker` into `DocumentosListado.jsx`

**Files:**
- Modify: `frontend/src/pages/documentos/DocumentosListado.jsx`
- Modify: `frontend/src/pages/documentos/DocumentosListado.test.jsx`

**Interfaces:**
- Consumes: `FilterDropdown` (Task 2), `AccionesDropdown` (Task 3), `DatePicker` (Task 4).
- Produces: nothing consumed by later tasks — final integration task.

This task starts from the file state left by Task 5 (imports/state for `CarpetasModal` already removed, "Gestionar carpetas" already navigates to `/documentos/carpetas`).

- [ ] **Step 1: Update the failing/changed tests first**

Modify `frontend/src/pages/documentos/DocumentosListado.test.jsx` — the interactions on the 4 filters and the 2 date fields change shape (`FilterDropdown`/`DatePicker` aren't native form controls), so every test touching them needs updating. Replace the full file with:

```jsx
// frontend/src/pages/documentos/DocumentosListado.test.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
    <MemoryRouter initialEntries={['/documentos']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/documentos" element={<DocumentosListado />} />
          <Route path="/documentos/carpetas" element={<p>Gestión de carpetas</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

async function seleccionarFiltro(labelBoton, textoOpcion) {
  await userEvent.click(screen.getByLabelText(labelBoton));
  await userEvent.click(await screen.findByText(textoOpcion));
}

describe('DocumentosListado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    await seleccionarFiltro('Área', 'RRHH');
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

  it('re-fetches with the estado filter when it changes, using the human-readable label', async () => {
    renderPagina();
    await screen.findByText('Manual RH');
    await seleccionarFiltro('Estado', 'vencido');
    await waitFor(() => expect(documentoService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'vencido', page: 1 })));
  });

  it('shows the human-readable label for a multi-word estado', async () => {
    renderPagina();
    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByLabelText('Estado'));
    expect(screen.getByText('por vencer')).toBeInTheDocument();
    expect(screen.getByText('sin vigencia')).toBeInTheDocument();
  });

  it('re-fetches carpetas for the chosen área and resets the carpeta filter', async () => {
    renderPagina();
    await screen.findByText('Manual RH');
    await seleccionarFiltro('Área', 'RRHH');
    await waitFor(() => expect(carpetaService.listar).toHaveBeenLastCalledWith(1));
  });

  it('keeps the "Carpeta" filter disabled until an área is chosen', async () => {
    renderPagina();
    await screen.findByText('Manual RH');

    expect(screen.getByLabelText('Carpeta')).toBeDisabled();

    await seleccionarFiltro('Área', 'RRHH');
    await waitFor(() => expect(screen.getByLabelText('Carpeta')).not.toBeDisabled());
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

  it('creates a documento with the uploaded file, a chosen vigencia date, and reloads the list', async () => {
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

    await userEvent.click(screen.getByLabelText('Vigencia desde'));
    expect(document.querySelector('[role="grid"]')).toBeInTheDocument();
    // Close the calendar without picking a day — the field stays optional; the
    // date-selection mechanics themselves are covered by DatePicker's own tests.
    await userEvent.click(screen.getByLabelText('Vigencia desde'));

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
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText('Archivo *'), archivoInvalido);
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Tipo de archivo no permitido')).toBeInTheDocument();
    expect(documentoService.crear).not.toHaveBeenCalled();
  });

  it('navigates to /documentos/carpetas when "Gestionar carpetas" is clicked', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    renderPagina();

    await screen.findByText('Manual RH');
    await userEvent.click(screen.getByRole('button', { name: /gestionar carpetas/i }));

    await waitFor(() => expect(screen.queryByText('Documentos')).not.toBeInTheDocument());
  });

  it('collapses the toolbar actions into a single menu on mobile', async () => {
    useAuth.mockReturnValue({ tienePermiso: (modulo, accion) => modulo === 'documentos' && accion === 'crear' });
    renderPagina();
    await screen.findByText('Manual RH');

    // Both the desktop buttons and the mobile trigger exist in the DOM at once —
    // Tailwind's hidden/md:flex classes are CSS-only in jsdom — so this just confirms
    // AccionesDropdown mounted with both toolbar actions wired in (not a raw <Button>).
    expect(screen.getByLabelText('Más acciones')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run DocumentosListado`
Expected: FAIL — filters/date field interactions no longer match the current native `<select>`/`<input type="date">` markup.

- [ ] **Step 3: Replace `DocumentosListado.jsx` with the fully integrated version**

Replace `frontend/src/pages/documentos/DocumentosListado.jsx` entirely:

```jsx
// frontend/src/pages/documentos/DocumentosListado.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useForm, Controller } from 'react-hook-form';
import { FileText, FolderCog, Plus } from 'lucide-react';
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
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';
import AccionesDropdown from '../../components/common/AccionesDropdown/AccionesDropdown';
import DatePicker from '../../components/common/DatePicker/DatePicker';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const ESTADOS = [
  { value: 'vigente', label: 'vigente' },
  { value: 'por_vencer', label: 'por vencer' },
  { value: 'vencido', label: 'vencido' },
  { value: 'sin_vigencia', label: 'sin vigencia' },
];
const TIPOS_PERMITIDOS_ACCEPT = Array.from(TIPOS_PERMITIDOS).join(',');

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
        {nombresPorId.areas[documento.areaId] || documento.areaId} / {nombresPorId.carpetas[documento.carpetaId] || documento.carpetaId} ·{' '}
        {nombresPorId.tipos[documento.tipoDocumentoId] || documento.tipoDocumentoId}
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
  const [crearModalAbierto, setCrearModalAbierto] = useState(false);
  const [filtros, setFiltros] = useState({ areaId: '', carpetaId: '', tipoDocumentoId: '', estado: '', page: 1 });

  const [archivoError, setArchivoError] = useState(null);
  const {
    register: registerCrear,
    handleSubmit: handleSubmitCrear,
    reset: resetCrear,
    watch: watchCrear,
    control: controlCrear,
    formState: { errors: erroresCrear },
  } = useForm();

  const areaSeleccionadaCrear = watchCrear('areaId');
  const [carpetasCrear, setCarpetasCrear] = useState([]);

  async function cargarCarpetasCrear(area) {
    if (!area) {
      setCarpetasCrear([]);
      return;
    }
    try {
      const arbol = await carpetaService.listar(Number(area));
      setCarpetasCrear(aplanarCarpetas(arbol));
    } catch {
      setCarpetasCrear([]);
    }
  }

  useEffect(() => {
    cargarCarpetasCrear(areaSeleccionadaCrear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSeleccionadaCrear]);

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

  async function cargarCarpetasFiltro(area) {
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
    cargarCarpetasFiltro(filtros.areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function cerrarModalCrear() {
    setCrearModalAbierto(false);
    resetCrear();
    setArchivoError(null);
  }

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

  const puedeCrear = tienePermiso('documentos', 'crear');

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Documentos</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          <AccionesDropdown
            acciones={[
              { label: 'Gestionar carpetas', icon: FolderCog, onClick: () => navigate('/documentos/carpetas'), hidden: !puedeCrear },
              { label: 'Crear documento', icon: Plus, onClick: () => setCrearModalAbierto(true), variant: 'primary', hidden: !puedeCrear },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <FilterDropdown
          label="Área"
          options={areas.map((area) => ({ value: area.id, label: area.nombre }))}
          value={filtros.areaId}
          onChange={(valor) => actualizarFiltro('areaId', valor)}
          placeholder="Todas"
        />

        <FilterDropdown
          label="Carpeta"
          options={carpetas.map((carpeta) => ({ value: carpeta.id, label: carpeta.ruta }))}
          value={filtros.carpetaId}
          onChange={(valor) => actualizarFiltro('carpetaId', valor)}
          placeholder="Todas"
          disabled={!filtros.areaId}
        />

        <FilterDropdown
          label="Tipo"
          options={tipos.map((tipo) => ({ value: tipo.id, label: tipo.nombre }))}
          value={filtros.tipoDocumentoId}
          onChange={(valor) => actualizarFiltro('tipoDocumentoId', valor)}
          placeholder="Todos"
        />

        <FilterDropdown
          label="Estado"
          options={ESTADOS}
          value={filtros.estado}
          onChange={(valor) => actualizarFiltro('estado', valor)}
          placeholder="Todos"
        />
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

      <Modal
        isOpen={crearModalAbierto}
        onClose={cerrarModalCrear}
        title="Crear documento"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModalCrear}>
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
            <select id="crear-areaId" className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100" {...registerCrear('areaId', { required: true })}>
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
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
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
            <select id="crear-tipoDocumentoId" className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100" {...registerCrear('tipoDocumentoId', { required: true })}>
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
            <Controller
              name="vigenciaDesde"
              control={controlCrear}
              render={({ field }) => <DatePicker label="Vigencia desde" value={field.value || ''} onChange={field.onChange} />}
            />
            <Controller
              name="vigenciaHasta"
              control={controlCrear}
              render={({ field }) => <DatePicker label="Vigencia hasta" value={field.value || ''} onChange={field.onChange} />}
            />
          </div>

          <Input label="Días de alerta de vencimiento" type="number" {...registerCrear('diasAlertaVencimiento')} />

          <div>
            <label htmlFor="crear-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Archivo *
            </label>
            <input
              id="crear-archivo"
              type="file"
              accept={TIPOS_PERMITIDOS_ACCEPT}
              className="w-full text-sm"
              {...registerCrear('archivo', { required: true })}
            />
            {archivoError && (
              <p role="alert" className="text-xs text-red-500 mt-1">
                {archivoError}
              </p>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
```

**On the "Área/Carpeta/Tipo de documento" selects inside "Crear documento" staying native:** per the spec's Global Constraints, these stay exactly as they were (`register(...)`-bound native `<select>`s) — only the "Vigencia desde"/"Vigencia hasta" fields in this same form are converted (via `Controller`, since `DatePicker` is the one ported component this pass explicitly integrates into a react-hook-form field). Converting Área/Carpeta/Tipo to `FilterDropdown` here is explicitly out of scope (see Global Constraints and "Not covered by this plan").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run DocumentosListado`
Expected: PASS (15 tests)

Run: `cd frontend && npm test`
Expected: all tests across the whole frontend pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/documentos/DocumentosListado.jsx frontend/src/pages/documentos/DocumentosListado.test.jsx
git commit -m "feat(frontend): integrate FilterDropdown, AccionesDropdown, and DatePicker into DocumentosListado"
```

---

### Task 7: Documentation and final verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — final task.

- [ ] **Step 1: Update the README**

In the `## Documentación` section, add a new bullet right after the usuario-al-crear-área design spec line:

```markdown
- Diseño de componentes portados del CRM Centhrix (DatePicker, FilterDropdown, AccionesDropdown) y de la pantalla de Gestión de carpetas: `docs/superpowers/specs/2026-07-08-cod-portar-componentes-crm-design.md`
```

In the `## Frontend (\`frontend/\`)` section, add a short note after the existing Usuarios note:

```markdown

`DatePicker`, `FilterDropdown`, y `AccionesDropdown` (portados del CRM Centhrix) ya están disponibles en `components/common/` e integrados en el listado de Documentos (filtros, toolbar, y fechas de vigencia). La gestión de carpetas se hizo pantalla propia (`/documentos/carpetas`), reemplazando el modal anterior.
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS — every test in the frontend green, including every test added in Tasks 2-6.

- [ ] **Step 3: Run a production build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors or warnings about missing modules.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the ported CRM components and the Gestión de carpetas screen"
```

---

## Not covered by this plan (deliberately, per the design spec)

- Full CRUD for Carpeta (editar/eliminar/reordenar) — `CarpetasGestion` only carries today's crear+listar scope forward.
- Converting any react-hook-form `register(...)`-bound `<select>` to `FilterDropdown` — this includes the required Área, Carpeta, and Tipo de documento selects inside `DocumentosListado`'s own "Crear documento" form (they stay native; only "Vigencia desde/hasta" convert, via `Controller`), Rol in Crear Área/Usuarios, Usuario existente, and Carpeta padre in `CarpetasGestion`.
- `AccionesDropdown`/`FilterDropdown` integration in `AreasListado.jsx`/`UsuariosListado.jsx` — neither has a multi-action toolbar or a filter bar today.
