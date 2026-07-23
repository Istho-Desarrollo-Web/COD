import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProveedorDetalle from './ProveedorDetalle';
import proveedorService from '../../api/proveedor.service';
import requisitoProveedorService from '../../api/requisitoProveedor.service';
import proveedorDocumentoService from '../../api/proveedorDocumento.service';
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/proveedor.service');
vi.mock('../../api/requisitoProveedor.service');
vi.mock('../../api/proveedorDocumento.service');
vi.mock('../../api/evaluacionProveedor.service');
vi.mock('../../context/AuthContext');

const PROVEEDOR = { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123456', criticidad: 'relevante', categoria: 'insumos', estado: 'activo' };

const REQUISITOS = [
  { id: 1, nombre: 'RUT', criticidadMinima: 'basico' },
  { id: 2, nombre: 'Certificado SST', criticidadMinima: 'relevante' },
  { id: 3, nombre: 'Certificado SARLAFT', criticidadMinima: 'critico' },
];

function renderPagina(ruta = '/proveedores/1') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SnackbarProvider>
        <Routes>
          <Route path="/proveedores/:id" element={<ProveedorDetalle />} />
          <Route path="/proveedores" element={<p>Proveedores</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('ProveedorDetalle', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ tienePermiso: () => true });
    proveedorService.obtener.mockResolvedValue(PROVEEDOR);
    requisitoProveedorService.listar.mockResolvedValue(REQUISITOS);
    proveedorDocumentoService.listar.mockResolvedValue([]);
    evaluacionProveedorService.listar.mockResolvedValue([]);
  });

  it('shows the proveedor info', async () => {
    renderPagina();
    expect(await screen.findByText('Insumos ABC')).toBeInTheDocument();
    expect(screen.getByText('900123456')).toBeInTheDocument();
  });

  it('edits the proveedor', async () => {
    proveedorService.editar.mockResolvedValue({ ...PROVEEDOR, razonSocial: 'Insumos ABC Modificado' });
    renderPagina();
    await screen.findByText('Insumos ABC');

    const input = screen.getByLabelText('Razón social *');
    await userEvent.clear(input);
    await userEvent.type(input, 'Insumos ABC Modificado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(proveedorService.editar).toHaveBeenCalledWith('1', expect.objectContaining({ razonSocial: 'Insumos ABC Modificado' }))
    );
  });

  it('gives the proveedor a baja and navigates back to the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    proveedorService.eliminar.mockResolvedValue(null);
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByText('Proveedores')).toBeInTheDocument();
  });

  it('only shows requisitos applicable to the proveedor criticidad', async () => {
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    const checklist = (await screen.findByText('Checklist de requisitos')).closest('div');
    expect(within(checklist).getByText('RUT')).toBeInTheDocument();
    expect(within(checklist).getByText('Certificado SST')).toBeInTheDocument();
    expect(within(checklist).queryByText('Certificado SARLAFT')).not.toBeInTheDocument();
  });

  it('shows "Falta" for a requisito with no covering document', async () => {
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await screen.findByText('Checklist de requisitos');
    expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
  });

  it('shows the document estado for a covered requisito', async () => {
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await screen.findByText('Checklist de requisitos');
    expect(screen.getAllByText('vigente').length).toBeGreaterThan(0);
  });

  it('uploads a document to the expediente', async () => {
    proveedorDocumentoService.crear.mockResolvedValue({ id: 6 });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    const archivo = new File(['contenido'], 'rut.pdf', { type: 'application/pdf' });
    await userEvent.upload(await screen.findByLabelText('Archivo *'), archivo);
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    await waitFor(() => expect(proveedorDocumentoService.crear).toHaveBeenCalledWith('1', expect.any(FormData)));
  });

  it('downloads a document from the expediente', async () => {
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Descargar' }));
    expect(proveedorDocumentoService.descargar).toHaveBeenCalledWith('1', 5);
  });

  it('deletes a document from the expediente', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    proveedorDocumentoService.eliminar.mockResolvedValue(null);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(proveedorDocumentoService.eliminar).toHaveBeenCalledWith('1', 5));
  });

  it('hides "Subir documento" and "Eliminar" when the user lacks the editar permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    proveedorDocumentoService.listar.mockResolvedValue([{ id: 5, requisitoId: 1, estado: 'vigente', RequisitoProveedor: { nombre: 'RUT' } }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente documental' }));

    await screen.findByText('Documentos subidos');
    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('shows Aprobar registro and Rechazar buttons only while en_evaluacion, and aprueba el registro exitosamente', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'en_evaluacion' });
    proveedorService.aprobarRegistro.mockResolvedValue({ ...PROVEEDOR, estado: 'registro_aprobado' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar registro' }));

    await waitFor(() => expect(proveedorService.aprobarRegistro).toHaveBeenCalledWith('1'));
  });

  it('shows Aprobar requisitos and Rechazar buttons while registro_aprobado, and aprueba los requisitos exitosamente', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'registro_aprobado' });
    proveedorService.aprobarRequisitos.mockResolvedValue({ proveedor: { ...PROVEEDOR, estado: 'activo' }, carpeta: { id: 9, nombre: 'Insumos ABC' }, documentosReflejados: 2 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar requisitos' }));

    await waitFor(() => expect(proveedorService.aprobarRequisitos).toHaveBeenCalledWith('1'));
  });

  it('hides Aprobar and Rechazar when estado is not en_evaluacion', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'activo' });
    renderPagina();
    await screen.findByText('Insumos ABC');

    expect(screen.queryByRole('button', { name: 'Aprobar registro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar requisitos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('rejects a proveedor with a motivo', async () => {
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'en_evaluacion' });
    proveedorService.rechazar.mockResolvedValue({ ...PROVEEDOR, estado: 'inactivo' });
    vi.spyOn(window, 'prompt').mockReturnValue('Documentación incompleta');
    renderPagina();
    await screen.findByText('Insumos ABC');

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    await waitFor(() => expect(proveedorService.rechazar).toHaveBeenCalledWith('1', 'Documentación incompleta'));
  });

  it('hides Aprobar and Rechazar when the user lacks the editar permission', async () => {
    useAuth.mockReturnValue({ tienePermiso: () => false });
    proveedorService.obtener.mockResolvedValue({ ...PROVEEDOR, estado: 'en_evaluacion' });
    renderPagina();
    await screen.findByText('Insumos ABC');

    expect(screen.queryByRole('button', { name: 'Aprobar registro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar requisitos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('programs an evaluación when there is no active one', async () => {
    evaluacionProveedorService.crear.mockResolvedValue({ id: 1, estado: 'pendiente' });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await userEvent.type(screen.getByLabelText('Fecha programada'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Programar evaluación' }));

    await waitFor(() => expect(evaluacionProveedorService.crear).toHaveBeenCalledWith('1', { fechaProgramada: '2026-12-01' }));
  });

  it('hides "Programar evaluación" when there is already a pendiente/en_proceso evaluación', async () => {
    evaluacionProveedorService.listar.mockResolvedValue([{ id: 1, periodo: 2026, fechaProgramada: '2026-12-01', puntaje: null, observaciones: null, estado: 'pendiente' }]);
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await screen.findByText(/Periodo 2026/);
    expect(screen.queryByRole('button', { name: 'Programar evaluación' })).not.toBeInTheDocument();
  });

  it('starts a pendiente evaluación', async () => {
    evaluacionProveedorService.listar.mockResolvedValue([{ id: 1, periodo: 2026, fechaProgramada: '2026-12-01', puntaje: null, observaciones: null, estado: 'pendiente' }]);
    evaluacionProveedorService.iniciar.mockResolvedValue({ id: 1, estado: 'en_proceso' });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(evaluacionProveedorService.iniciar).toHaveBeenCalledWith('1', 1));
  });

  it('completes an en_proceso evaluación with a puntaje', async () => {
    evaluacionProveedorService.listar.mockResolvedValue([{ id: 1, periodo: 2026, fechaProgramada: '2026-12-01', puntaje: null, observaciones: null, estado: 'en_proceso' }]);
    evaluacionProveedorService.completar.mockResolvedValue({ id: 1, estado: 'completada', puntaje: 85 });
    renderPagina();
    await screen.findByText('Insumos ABC');
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluaciones' }));

    await userEvent.type(screen.getByLabelText('Puntaje (0-100)'), '85');
    await userEvent.click(screen.getByRole('button', { name: 'Completar evaluación' }));

    await waitFor(() => expect(evaluacionProveedorService.completar).toHaveBeenCalledWith('1', 1, { puntaje: '85', observaciones: undefined }));
  });
});
