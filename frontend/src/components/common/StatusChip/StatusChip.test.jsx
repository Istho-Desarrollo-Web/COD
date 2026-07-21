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

  it('renders "en evaluación" for the en_evaluacion proveedor status', () => {
    render(<StatusChip status="en_evaluacion" />);
    expect(screen.getByText('en evaluación')).toBeInTheDocument();
  });

  it('renders "suspendido" for the suspendido proveedor status', () => {
    render(<StatusChip status="suspendido" />);
    expect(screen.getByText('suspendido')).toBeInTheDocument();
  });

  it('renders "info", "warn" and "error" for log-level statuses', () => {
    render(<StatusChip status="info" />);
    expect(screen.getByText('info')).toBeInTheDocument();
  });
});
