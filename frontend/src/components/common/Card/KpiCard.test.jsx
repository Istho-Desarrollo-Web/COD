import { render, screen } from '@testing-library/react';
import { ClipboardList } from 'lucide-react';
import KpiCard from './KpiCard';

describe('KpiCard', () => {
  it('renders title and value', () => {
    render(<KpiCard title="Aprobaciones pendientes" value={4} icon={ClipboardList} />);
    expect(screen.getByText('Aprobaciones pendientes')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders a loading skeleton when loading is true, hiding the real value', () => {
    render(<KpiCard title="X" value={1} loading />);
    expect(screen.getByLabelText('Cargando indicador')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
