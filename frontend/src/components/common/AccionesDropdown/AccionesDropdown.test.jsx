import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download, RefreshCw } from 'lucide-react';
import AccionesDropdown from './AccionesDropdown';

describe('AccionesDropdown', () => {
  it('renders nothing when there are no acciones', () => {
    const { container } = render(<AccionesDropdown acciones={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every acción is hidden', () => {
    const { container } = render(<AccionesDropdown acciones={[{ label: 'Actualizar', onClick: vi.fn(), hidden: true }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a desktop button per acción and invokes onClick', async () => {
    const onActualizar = vi.fn();
    render(<AccionesDropdown acciones={[{ label: 'Actualizar', icon: RefreshCw, onClick: onActualizar }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onActualizar).toHaveBeenCalledTimes(1);
  });

  it('excludes hidden acciones from the desktop buttons', () => {
    render(
      <AccionesDropdown
        acciones={[
          { label: 'Actualizar', onClick: vi.fn() },
          { label: 'Exportar', onClick: vi.fn(), hidden: true },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });

  it('opens a mobile menu with the same acciones and invokes onClick on selection', async () => {
    const onDescargar = vi.fn();
    render(<AccionesDropdown acciones={[{ label: 'Descargar', icon: Download, onClick: onDescargar }]} />);

    await userEvent.click(screen.getByLabelText('Más acciones'));
    const menu = screen.getByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descargar' }));

    expect(onDescargar).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile menu after selecting an item', async () => {
    render(<AccionesDropdown acciones={[{ label: 'Descargar', onClick: vi.fn() }]} />);

    await userEvent.click(screen.getByLabelText('Más acciones'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Descargar' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
