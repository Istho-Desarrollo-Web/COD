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
    vi.clearAllMocks();
    areaService.obtener.mockResolvedValue(AREA);
    usuarioService.obtener.mockResolvedValue({ id: 7, nombre: 'Ana', apellido: 'Gómez' });
    carpetaService.listar.mockResolvedValue(ARBOL);
    mockConteosDocumento();
  });

  it('shows the área info, health, and status', async () => {
    renderPagina();
    expect(await screen.findByText('FIN')).toBeInTheDocument();
    expect(screen.getAllByText('Financiera').length).toBeGreaterThan(0);
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
    await screen.findByText('FIN');
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('shows the total and per-estado document counts', async () => {
    renderPagina();
    await screen.findByText('FIN');
    expect(await screen.findByText('48')).toBeInTheDocument();
    expect(await screen.findByText('40 vigentes · 3 por vencer · 5 vencidos')).toBeInTheDocument();
  });

  it('navigates to /documentos/carpetas?areaId=1 when "Ver carpetas" is clicked', async () => {
    renderPagina();
    await screen.findByText('FIN');
    await userEvent.click(screen.getByRole('button', { name: 'Ver carpetas' }));
    expect(await screen.findByText('Gestión de carpetas')).toBeInTheDocument();
  });

  it('navigates to /documentos?areaId=1 when "Ver documentos" is clicked', async () => {
    renderPagina();
    await screen.findByText('FIN');
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
    expect(await screen.findByText('FIN')).toBeInTheDocument();
    expect(await screen.findByText('Sin líder asignado')).toBeInTheDocument();
  });

  it('still shows the rest of the page when the carpeta count fails', async () => {
    carpetaService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('FIN')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('still shows the rest of the page when the document count fails', async () => {
    documentoService.listar.mockRejectedValue(new Error('Network error'));
    renderPagina();
    expect(await screen.findByText('FIN')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
  });
});
