import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Pagination from './Pagination';

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(<Pagination pagination={{ page: 1, limit: 20, total: 5, totalPages: 1 }} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current page and total pages', () => {
    render(<Pagination pagination={{ page: 2, limit: 20, total: 45, totalPages: 3 }} onPageChange={() => {}} />);
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
  });

  it('disables "Anterior" on the first page', () => {
    render(<Pagination pagination={{ page: 1, limit: 20, total: 45, totalPages: 3 }} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('disables "Siguiente" on the last page', () => {
    render(<Pagination pagination={{ page: 3, limit: 20, total: 45, totalPages: 3 }} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });

  it('calls onPageChange with page + 1 when "Siguiente" is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination pagination={{ page: 1, limit: 20, total: 45, totalPages: 3 }} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with page - 1 when "Anterior" is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination pagination={{ page: 2, limit: 20, total: 45, totalPages: 3 }} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
