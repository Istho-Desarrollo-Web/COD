import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EvaluacionesListado from './EvaluacionesListado';
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';

vi.mock('../../api/evaluacionProveedor.service');

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/proveedores/evaluaciones']}>
      <SnackbarProvider>
        <Routes>
          <Route path="/proveedores/evaluaciones" element={<EvaluacionesListado />} />
          <Route path="/proveedores/:id" element={<p>Detalle proveedor</p>} />
        </Routes>
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('EvaluacionesListado', () => {
  beforeEach(() => {
    evaluacionProveedorService.listarTodas.mockResolvedValue([]);
  });

  it('lists evaluaciones with the proveedor razón social', async () => {
    evaluacionProveedorService.listarTodas.mockResolvedValue([
      { id: 1, proveedorId: 7, periodo: 2026, fechaProgramada: '2026-12-01', fechaRealizada: null, puntaje: null, estado: 'pendiente', Proveedor: { razonSocial: 'Insumos ABC' } },
    ]);
    renderPagina();
    expect(await screen.findByText('Insumos ABC')).toBeInTheDocument();
  });

  it('filters by estado', async () => {
    renderPagina();
    await waitFor(() => expect(evaluacionProveedorService.listarTodas).toHaveBeenCalledWith({}));

    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(await screen.findByRole('button', { name: 'Pendiente' }));

    await waitFor(() => expect(evaluacionProveedorService.listarTodas).toHaveBeenLastCalledWith({ estado: 'pendiente' }));
  });

  it('navigates to the proveedor detail when a row is clicked', async () => {
    evaluacionProveedorService.listarTodas.mockResolvedValue([
      { id: 1, proveedorId: 7, periodo: 2026, fechaProgramada: '2026-12-01', fechaRealizada: null, puntaje: null, estado: 'pendiente', Proveedor: { razonSocial: 'Insumos ABC' } },
    ]);
    renderPagina();
    await userEvent.click(await screen.findByText('Insumos ABC'));
    expect(await screen.findByText('Detalle proveedor')).toBeInTheDocument();
  });
});
