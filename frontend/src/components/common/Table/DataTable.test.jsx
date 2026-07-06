import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import DataTable from './DataTable';

const columnas = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'estado', label: 'Estado', type: 'status' },
];
const datos = [
  { id: 1, nombre: 'Financiera', estado: 'activo' },
  { id: 2, nombre: 'SGI', estado: 'inactivo' },
];

describe('DataTable', () => {
  it('renders one row per data item with the configured columns', () => {
    render(<DataTable columns={columnas} data={datos} />);
    expect(screen.getByText('Financiera')).toBeInTheDocument();
    expect(screen.getByText('SGI')).toBeInTheDocument();
    expect(screen.getByText('activo')).toBeInTheDocument();
    expect(screen.getByText('inactivo')).toBeInTheDocument();
  });

  it('shows the empty message when there is no data', () => {
    render(<DataTable columns={columnas} data={[]} emptyMessage="Sin áreas todavía" />);
    expect(screen.getByText('Sin áreas todavía')).toBeInTheDocument();
  });

  it('calls onRowClick with the row when a row is clicked', async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columnas} data={datos} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText('Financiera'));
    expect(onRowClick).toHaveBeenCalledWith(datos[0]);
  });

  it('renders a custom cell via a column render function', () => {
    const conRender = [{ key: 'nombre', label: 'Nombre', render: (valor) => `→ ${valor}` }];
    render(<DataTable columns={conRender} data={datos} />);
    expect(screen.getByText('→ Financiera')).toBeInTheDocument();
  });
});
