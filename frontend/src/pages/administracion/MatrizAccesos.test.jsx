import { render, screen } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import MatrizAccesos from './MatrizAccesos';
import rolService from '../../api/rol.service';

vi.mock('../../api/rol.service');

function renderPagina() {
  return render(
    <SnackbarProvider>
      <MatrizAccesos />
    </SnackbarProvider>
  );
}

const DATOS = {
  roles: [
    { id: 1, nombre: 'super_administrador', nivel: 100 },
    { id: 2, nombre: 'auditor', nivel: 20 },
  ],
  modulos: { inicio: ['ver'], proveedores: ['ver', 'gestionar', 'aprobar', 'eliminar', 'evaluar', 'exportar'] },
  permisos: [
    { rolId: 1, modulo: 'inicio', acciones: ['ver'] },
    { rolId: 1, modulo: 'proveedores', acciones: ['ver', 'gestionar', 'aprobar', 'eliminar', 'evaluar', 'exportar'] },
    { rolId: 2, modulo: 'inicio', acciones: ['ver'] },
  ],
};

describe('MatrizAccesos', () => {
  it('renders the roles as column headers and modulos as row headers', async () => {
    rolService.matrizAccesos.mockResolvedValue(DATOS);
    renderPagina();

    expect(await screen.findByText('super_administrador')).toBeInTheDocument();
    expect(screen.getByText('auditor')).toBeInTheDocument();
    expect(screen.getByText('inicio')).toBeInTheDocument();
    expect(screen.getByText('proveedores')).toBeInTheDocument();
  });

  it('shows the acciones granted for a rol+modulo cell', async () => {
    rolService.matrizAccesos.mockResolvedValue(DATOS);
    renderPagina();

    await screen.findByText('super_administrador');
    expect(screen.getByText('ver, gestionar, aprobar, eliminar, evaluar, exportar')).toBeInTheDocument();
  });

  it('shows a dash for a rol+modulo with no permisos entry', async () => {
    rolService.matrizAccesos.mockResolvedValue(DATOS);
    renderPagina();

    await screen.findByText('super_administrador');
    // auditor no tiene entrada para proveedores en DATOS.permisos
    const filas = screen.getAllByText('—');
    expect(filas.length).toBeGreaterThan(0);
  });

  it('shows an error state when the request fails', async () => {
    rolService.matrizAccesos.mockRejectedValue({ message: 'Error de red' });
    renderPagina();

    expect(await screen.findByText('No se pudo cargar la matriz de accesos')).toBeInTheDocument();
  });
});
