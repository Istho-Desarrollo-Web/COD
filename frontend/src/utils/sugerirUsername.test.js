import { sugerirUsername } from './sugerirUsername';

describe('sugerirUsername', () => {
  it('builds username from first initial + apellido', () => {
    expect(sugerirUsername('Juan', 'Pérez')).toBe('jperez');
  });

  it('strips accents and lowercases', () => {
    expect(sugerirUsername('María', 'Núñez')).toBe('mnunez');
  });

  it('removes spaces from compound apellidos', () => {
    expect(sugerirUsername('Ana', 'De La Cruz')).toBe('adelacruz');
  });

  it('returns an empty string when nombre or apellido is missing', () => {
    expect(sugerirUsername('', 'Pérez')).toBe('');
    expect(sugerirUsername('Juan', '')).toBe('');
  });
});
