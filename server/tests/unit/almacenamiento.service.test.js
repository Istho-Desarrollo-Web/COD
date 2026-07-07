const fs = require('fs');
const path = require('path');
const { guardarArchivo, obtenerRutaAbsoluta, eliminarArchivo } = require('../../src/services/almacenamiento.service');

describe('almacenamiento.service', () => {
  const areaIdPrueba = 999999;

  afterEach(() => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'documentos', String(areaIdPrueba));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('guarda un archivo en disco bajo el área correspondiente y devuelve una ruta relativa', () => {
    const file = { originalname: 'contrato.pdf', buffer: Buffer.from('contenido de prueba') };
    const { ruta } = guardarArchivo(file, areaIdPrueba);
    expect(ruta).toMatch(new RegExp(`^documentos[\\\\/]${areaIdPrueba}[\\\\/].+\\.pdf$`));
    expect(fs.existsSync(obtenerRutaAbsoluta(ruta))).toBe(true);
  });

  it('elimina un archivo previamente guardado', () => {
    const file = { originalname: 'borrar.pdf', buffer: Buffer.from('x') };
    const { ruta } = guardarArchivo(file, areaIdPrueba);
    eliminarArchivo(ruta);
    expect(fs.existsSync(obtenerRutaAbsoluta(ruta))).toBe(false);
  });

  it('eliminarArchivo no lanza error si el archivo no existe', () => {
    expect(() => eliminarArchivo('documentos/000/no-existe.pdf')).not.toThrow();
  });
});
