import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProveedorDetalle from './ProveedorDetalle';
import proveedorService from '../../api/proveedor.service';
import requisitoProveedorService from '../../api/requisitoProveedor.service';
import proveedorDocumentoService from '../../api/proveedorDocumento.service';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../api/proveedor.service');
vi.mock('../../api/requisitoProveedor.service');
vi.mock('../../api/proveedorDocumento.service');
vi.mock('../../context/AuthContext');

const PROVEEDOR = { id: 1, razonSocial: 'Insumos ABC', documentoIdentificacion: '900123456', criticidad: 'media', categoria: 'insumos', estado: 'activo' };

const REQUISITOS = [
  { id: 1, nombre: 'RUT', criticidadMinima: 'baja' },
  { id: 2, nombre: 'Certificado SST', criticidadMinima: 'media' },
  { id: 3, nombre: 'Certificado SARLAFT', criticidadMinima: 'alta' },
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
});
