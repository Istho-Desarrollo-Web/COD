import { render, screen, fireEvent } from '@testing-library/react';
import FilterDropdown from './FilterDropdown';

const OPCIONES = [
  { value: '', label: 'Todos' },
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
];

describe('FilterDropdown', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb();
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the placeholder when no value is selected', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} placeholder="Seleccionar estado" />);
    expect(screen.getByRole('button', { name: /Seleccionar estado/i })).toBeInTheDocument();
  });

  it('shows the selected option label on the trigger button', () => {
    render(<FilterDropdown options={OPCIONES} value="activo" onChange={() => {}} />);
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('Activo');
  });

  it('opens the options panel when the trigger button is clicked', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} />);
    expect(screen.queryByText('Activo')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getByText('Todos')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('calls onChange with the selected option value and closes the panel', () => {
    const handleChange = vi.fn();
    render(<FilterDropdown options={OPCIONES} value="" onChange={handleChange} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('Activo'));

    expect(handleChange).toHaveBeenCalledWith('activo');
    expect(screen.queryByText('Inactivo')).not.toBeInTheDocument();
  });

  it('supports multiple selection without closing the panel', () => {
    const handleChange = vi.fn();
    render(<FilterDropdown options={OPCIONES} value={[]} onChange={handleChange} multiple />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByText('Activo'));

    expect(handleChange).toHaveBeenCalledWith(['activo']);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('shows a search box and filters options when there are more than 6', () => {
    const muchasOpciones = Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, label: `Opción ${i}` }));
    render(<FilterDropdown options={muchasOpciones} value="" onChange={() => {}} />);

    fireEvent.click(screen.getAllByRole('button')[0]);
    const buscador = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(buscador, { target: { value: 'Opción 3' } });

    expect(screen.getByText('Opción 3')).toBeInTheDocument();
    expect(screen.queryByText('Opción 1')).not.toBeInTheDocument();
  });

  it('renders the label with a real htmlFor/id association to the trigger button', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} label="Estado" />);
    expect(screen.getByLabelText('Estado')).toBe(screen.getAllByRole('button')[0]);
  });

  it('does not open the panel when disabled', () => {
    render(<FilterDropdown options={OPCIONES} value="" onChange={() => {}} disabled />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('Activo')).not.toBeInTheDocument();
  });
});
