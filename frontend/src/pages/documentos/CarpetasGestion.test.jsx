import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CarpetasGestion from './CarpetasGestion';
import DocumentosListado from './DocumentosListado';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';
import documentoService from '../../api/documento.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/carpeta.service');
vi.mock('../../api/area.service');
vi.mock('../../api/documento.service');
vi.mock('../../api/tipoDocumento.service');
vi.mock('../../context/AuthContext');

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

async function elegirArea(nombre) {
  await userEvent.click(screen.getByLabelText('Área de las carpetas'));
  await userEvent.click(await screen.findByRole('button', { name: nombre }));
}

describe('CarpetasGestion', () => {
  beforeEach(() => {
    areaService.listar.mockResolvedValue(AREAS);
    carpetaService.listar.mockResolvedValue(ARBOL);
    useAuth.mockReturnValue({ tienePermiso: () => false });
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

  it('activating the info button via keyboard opens the detail modal without also navigating into the carpeta', async () => {
    renderPagina();
    await elegirArea('RRHH');
    await screen.findByRole('button', { name: 'Contratos' });

    screen.getByRole('button', { name: 'Ver detalle de Contratos' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nómina' })).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    screen.getByRole('button', { name: 'Ver detalle de Contratos' }).focus();
    await userEvent.keyboard(' ');

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

  it('preselects the área from the areaId query param on mount', async () => {
    renderPagina('/documentos/carpetas?areaId=1');

    await waitFor(() => expect(carpetaService.listar).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByLabelText('Área de las carpetas')).toHaveTextContent('RRHH'));
    expect(await screen.findByRole('button', { name: 'Contratos' })).toBeInTheDocument();
  });

  it('lands on the real DocumentosListado, pre-filtered, after "Ver documentos de esta carpeta"', async () => {
    documentoService.listar.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    tipoDocumentoService.listar.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/documentos/carpetas']}>
        <SnackbarProvider>
          <Routes>
            <Route path="/documentos/carpetas" element={<CarpetasGestion />} />
            <Route path="/documentos" element={<DocumentosListado />} />
          </Routes>
        </SnackbarProvider>
      </MemoryRouter>
    );

    await elegirArea('RRHH');
    await screen.findByRole('button', { name: 'Contratos' });
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle de Contratos' }));
    await userEvent.click(screen.getByRole('button', { name: /ver documentos de esta carpeta/i }));

    await waitFor(() => expect(documentoService.listar).toHaveBeenCalledWith(expect.objectContaining({ areaId: 1, carpetaId: 10 })));
  });
});
