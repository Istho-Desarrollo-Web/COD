import { render, screen } from '@testing-library/react';
import StatusChip from './StatusChip';

describe('StatusChip', () => {
  it('renders the configured label for a known status', () => {
    render(<StatusChip status="vigente" />);
    expect(screen.getByText('vigente')).toBeInTheDocument();
  });

  it('renders a customLabel when provided, overriding the default label', () => {
    render(<StatusChip status="saludable" customLabel="92% al día" />);
    expect(screen.getByText('92% al día')).toBeInTheDocument();
    expect(screen.queryByText('saludable')).not.toBeInTheDocument();
  });

  it('falls back to the raw status as label when the status is unknown', () => {
    render(<StatusChip status="estado_no_definido" />);
    expect(screen.getByText('estado_no_definido')).toBeInTheDocument();
  });
});
