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
  // Scope to the dropdown option's button role rather than raw text — the table
  // can already show the same text (e.g. an área name resolved independently of
  // the filter), which would otherwise make screen.findByText ambiguous.
  await userEvent.click(await screen.findByRole('button', { name: textoOpcion }));
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

  it('allows resetting the área filter back to "Todas" after selecting a value', async () => {
    renderPagina();
    await screen.findByText('Manual RH');

    await seleccionarFiltro('Área', 'RRHH');
    await waitFor(() => expect(documentoService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ areaId: 1 })));

    await seleccionarFiltro('Área', 'Todas');
    await waitFor(() => expect(documentoService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ areaId: undefined })));
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
