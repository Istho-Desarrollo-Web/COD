import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

describe('Dashboard', () => {
  it('renders the three sample KPI cards labeled as sample data', () => {
    render(<Dashboard />);
    expect(screen.getByText('Aprobaciones pendientes')).toBeInTheDocument();
    expect(screen.getByText('Alertas de vigencia documental')).toBeInTheDocument();
    expect(screen.getByText('% documentos al día')).toBeInTheDocument();
    expect(screen.getByText('Datos de muestra')).toBeInTheDocument();
  });
});
