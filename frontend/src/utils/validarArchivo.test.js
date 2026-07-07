import { validarArchivo, TIPOS_PERMITIDOS, TAMANO_MAXIMO_BYTES } from './validarArchivo';

function crearArchivo({ type = 'application/pdf', size = 1024 } = {}) {
  const archivo = new File(['contenido'], 'documento.pdf', { type });
  Object.defineProperty(archivo, 'size', { value: size });
  return archivo;
}

describe('validarArchivo', () => {
  it('returns null for a valid PDF under the size limit', () => {
    expect(validarArchivo(crearArchivo({ type: 'application/pdf', size: 1024 }))).toBeNull();
  });

  it('accepts every mimetype in TIPOS_PERMITIDOS', () => {
    for (const type of TIPOS_PERMITIDOS) {
      expect(validarArchivo(crearArchivo({ type, size: 1024 }))).toBeNull();
    }
  });

  it('rejects an unsupported mimetype', () => {
    expect(validarArchivo(crearArchivo({ type: 'application/zip' }))).toBe('Tipo de archivo no permitido');
  });

  it('rejects a file over 20MB', () => {
    expect(validarArchivo(crearArchivo({ size: TAMANO_MAXIMO_BYTES + 1 }))).toBe('El archivo excede el tamaño máximo de 20MB');
  });

  it('accepts a file exactly at the 20MB limit', () => {
    expect(validarArchivo(crearArchivo({ size: TAMANO_MAXIMO_BYTES }))).toBeNull();
  });

  it('returns an error when no file is provided', () => {
    expect(validarArchivo(null)).toBe('El archivo es obligatorio');
  });
});
