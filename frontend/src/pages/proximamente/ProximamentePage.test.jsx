import { render, screen } from '@testing-library/react';
import ProximamentePage from './ProximamentePage';

describe('ProximamentePage', () => {
  it('renders the module name and an in-construction message', () => {
    render(<ProximamentePage nombre="Documentos" />);
    expect(screen.getByText('Documentos')).toBeInTheDocument();
    expect(screen.getByText('Módulo en construcción.')).toBeInTheDocument();
  });
});
