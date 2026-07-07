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
    vi.clearAllMocks();
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

  it('keeps the real tipo/carpeta selected once multi-item catalogs arrive after the documento (race condition regression)', async () => {
    // Catálogos con más de un elemento, y con el valor real del documento (tipoId 1,
    // carpetaId 10) NO en la primera posición. Con un solo elemento el bug era
    // indistinguible porque "la opción incorrecta" y "la correcta" eran la misma.
    tipoDocumentoService.listar.mockResolvedValue([
      { id: 2, nombre: 'Otro tipo' },
      { id: 1, nombre: 'Manual' },
    ]);
    carpetaService.listar.mockResolvedValue([
      { id: 20, nombre: 'Otra carpeta', carpetaPadreId: null, areaId: 1, subcarpetas: [] },
      { id: 10, nombre: 'Contratos', carpetaPadreId: null, areaId: 1, subcarpetas: [] },
    ]);

    renderDetalle();
    await screen.findByText('Manual RH');

    await waitFor(() => {
      expect(screen.getByLabelText('Tipo de documento').value).toBe('1');
      expect(screen.getByLabelText('Carpeta').value).toBe('10');
    });
  });

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
});
