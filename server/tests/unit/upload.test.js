const express = require('express');
const request = require('supertest');
const { subirArchivoUnico } = require('../../src/middlewares/upload');

function crearAppPrueba() {
  const app = express();
  app.post('/subir', subirArchivoUnico, (req, res) => res.status(200).json({ ok: true, archivo: !!req.file }));
  return app;
}

describe('upload middleware', () => {
  it('acepta un PDF dentro del límite de tamaño', async () => {
    const res = await request(crearAppPrueba())
      .post('/subir')
      .attach('archivo', Buffer.from('%PDF-1.4 contenido de prueba'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.archivo).toBe(true);
  });

  it('rechaza un tipo de archivo no permitido', async () => {
    const res = await request(crearAppPrueba())
      .post('/subir')
      .attach('archivo', Buffer.from('texto plano'), { filename: 'doc.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rechaza un archivo que excede el tamaño máximo de 20MB', async () => {
    const bufferGrande = Buffer.alloc(21 * 1024 * 1024, 'a');
    const res = await request(crearAppPrueba())
      .post('/subir')
      .attach('archivo', bufferGrande, { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
