import { renderHook, act } from '@testing-library/react';
import { useViewMode } from './useViewMode';

function setViewportWidth(width) {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
}

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1280);
  });

  it('defaults to lista when nothing is stored', () => {
    const { result } = renderHook(() => useViewMode('cod_view_test'));
    expect(result.current.modo).toBe('lista');
    expect(result.current.esVistaMovil).toBe(false);
  });

  it('persists the chosen mode in localStorage under the given key', () => {
    const { result } = renderHook(() => useViewMode('cod_view_test'));
    act(() => result.current.setModo('tarjetas'));
    expect(result.current.modo).toBe('tarjetas');
    expect(localStorage.getItem('cod_view_test')).toBe('tarjetas');
  });

  it('forces tarjetas on mobile viewport regardless of the stored preference', () => {
    localStorage.setItem('cod_view_test', 'lista');
    const { result, rerender } = renderHook(() => useViewMode('cod_view_test'));
    expect(result.current.modo).toBe('lista');

    act(() => setViewportWidth(500));
    rerender();

    expect(result.current.modo).toBe('tarjetas');
    expect(result.current.esVistaMovil).toBe(true);
    expect(localStorage.getItem('cod_view_test')).toBe('lista');
  });
});
