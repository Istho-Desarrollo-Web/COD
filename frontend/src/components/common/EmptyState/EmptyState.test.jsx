import { render, screen } from '@testing-library/react';
import { Building2 } from 'lucide-react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={Building2} title="Sin áreas" description="Crea la primera área" />);
    expect(screen.getByText('Sin áreas')).toBeInTheDocument();
    expect(screen.getByText('Crea la primera área')).toBeInTheDocument();
  });

  it('renders the optional action', () => {
    render(<EmptyState title="Sin áreas" action={<button>Crear</button>} />);
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });
});
