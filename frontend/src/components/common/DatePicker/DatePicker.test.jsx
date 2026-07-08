import { render, screen, fireEvent } from '@testing-library/react';
import DatePicker from './DatePicker';

// react-day-picker uses matchMedia internally; jsdom doesn't implement it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('DatePicker', () => {
  it('shows the placeholder when there is no value', () => {
    render(<DatePicker onChange={vi.fn()} />);
    expect(screen.getByText('dd/mm/aaaa')).toBeInTheDocument();
  });

  it('shows the date in DD/MM/YYYY format when a value is set', () => {
    render(<DatePicker value="2026-05-08" onChange={vi.fn()} />);
    expect(screen.getByText('08/05/2026')).toBeInTheDocument();
  });

  it('opens the calendar when the trigger button is clicked', () => {
    render(<DatePicker onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    // DayPicker v9 renders its month grid with role="grid".
    expect(document.querySelector('[role="grid"]')).toBeInTheDocument();
  });

  it('shows a clear button when a value is set and clearable is true', () => {
    const { container } = render(<DatePicker value="2026-05-08" onChange={vi.fn()} />);
    expect(container.querySelector('span[role="button"]')).toBeInTheDocument();
  });

  it('calls onChange with an empty string when the clear button is clicked', () => {
    const handleChange = vi.fn();
    const { container } = render(<DatePicker value="2026-05-08" onChange={handleChange} />);
    fireEvent.click(container.querySelector('span[role="button"]'));
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('is keyboard-focusable and calls onChange with an empty string on Enter', () => {
    const handleChange = vi.fn();
    const { container } = render(<DatePicker value="2026-05-08" onChange={handleChange} />);
    const clearBtn = container.querySelector('span[role="button"]');
    expect(clearBtn).toHaveAttribute('tabindex', '0');
    clearBtn.focus();
    expect(clearBtn).toHaveFocus();
    fireEvent.keyDown(clearBtn, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('calls onChange with an empty string when the clear button receives a Space keydown', () => {
    const handleChange = vi.fn();
    const { container } = render(<DatePicker value="2026-05-08" onChange={handleChange} />);
    const clearBtn = container.querySelector('span[role="button"]');
    fireEvent.keyDown(clearBtn, { key: ' ' });
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('does not show a clear button when clearable is false', () => {
    const { container } = render(<DatePicker value="2026-05-08" onChange={vi.fn()} clearable={false} />);
    expect(container.querySelector('span[role="button"]')).not.toBeInTheDocument();
  });

  it('does not throw with an invalid date and falls back to the placeholder', () => {
    expect(() => render(<DatePicker value="no-es-fecha" onChange={vi.fn()} />)).not.toThrow();
    expect(screen.getByText('dd/mm/aaaa')).toBeInTheDocument();
  });

  it('renders the label with a real htmlFor/id association to the trigger button', () => {
    render(<DatePicker label="Vigencia desde" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Vigencia desde')).toBe(screen.getByRole('button'));
  });
});
