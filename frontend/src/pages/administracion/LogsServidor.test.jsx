import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import LogsServidor from './LogsServidor';
import logServidorService from '../../api/logServidor.service';

vi.mock('../../api/logServidor.service');

const LOGS = [
  { id: 1, createdAt: '2026-07-09T10:00:00.000Z', nivel: 'info', metodo: 'GET', ruta: '/api/v1/health', statusCode: 200, duracionMs: 12, mensaje: 'GET /api/v1/health → 200', usuarioNombre: null },
  { id: 2, createdAt: '2026-07-09T10:05:00.000Z', nivel: 'error', metodo: 'POST', ruta: '/api/v1/areas', statusCode: null, duracionMs: null, mensaje: 'Fallo simulado', usuarioNombre: 'Administrador COD' },
];
const PAGINACION = { page: 1, limit: 20, total: 2, totalPages: 1 };

function renderPagina() {
  return render(
    <MemoryRouter>
      <SnackbarProvider>
        <LogsServidor />
      </SnackbarProvider>
    </MemoryRouter>
  );
}

describe('LogsServidor', () => {
  beforeEach(() => {
    logServidorService.listar.mockResolvedValue({ data: LOGS, pagination: PAGINACION });
  });

  it('lists the logs in a table', async () => {
    renderPagina();
    expect(await screen.findByText('GET /api/v1/health → 200')).toBeInTheDocument();
    expect(screen.getByText('Fallo simulado')).toBeInTheDocument();
  });

  it('shows an empty state when there are no logs', async () => {
    logServidorService.listar.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    renderPagina();
    expect(await screen.findByText('Sin logs para mostrar')).toBeInTheDocument();
  });

  it('filters by nivel', async () => {
    renderPagina();
    await screen.findByText('GET /api/v1/health → 200');

    await userEvent.click(screen.getByLabelText('Nivel'));
    await userEvent.click(await screen.findByRole('button', { name: 'error' }));

    await waitFor(() => expect(logServidorService.listar).toHaveBeenLastCalledWith(expect.objectContaining({ nivel: 'error', page: 1 })));
  });

  it('reloads the current filters when "Actualizar" is clicked', async () => {
    renderPagina();
    await screen.findByText('GET /api/v1/health → 200');
    logServidorService.listar.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(logServidorService.listar).toHaveBeenCalledTimes(1));
  });
});
