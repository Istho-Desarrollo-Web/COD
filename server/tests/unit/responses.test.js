const {
  success, successMessage, created, error, paginated,
  unauthorized, forbidden, notFound, badRequest, conflict, unprocessable, serverError,
} = require('../../src/utils/responses');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('responses utils', () => {
  it('success() defaults to 200 and wraps data', () => {
    const res = mockRes();
    success(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 }, message: null, errors: [], code: null });
  });

  it('success() accepts a custom message as 3rd arg', () => {
    const res = mockRes();
    success(res, { id: 1 }, 'Listo');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Listo' }));
  });

  it('success() accepts a custom status code as 3rd arg', () => {
    const res = mockRes();
    success(res, { id: 1 }, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('error() defaults to 400', () => {
    const res = mockRes();
    error(res, 'Malo');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, data: null, message: 'Malo', errors: [], code: null });
  });

  it('paginated() includes pagination metadata', () => {
    const res = mockRes();
    paginated(res, [1, 2], { total: 2, page: 1, limit: 10 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [1, 2], pagination: { total: 2, page: 1, limit: 10 } })
    );
  });

  describe('successMessage()', () => {
    it('defaults to statusCode 200', () => {
      const res = mockRes();
      successMessage(res, 'Success');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('accepts a custom statusCode', () => {
      const res = mockRes();
      successMessage(res, 'Created', { id: 1 }, 201);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Created' }));
    });
  });

  describe('created()', () => {
    it('responds with statusCode 201', () => {
      const res = mockRes();
      created(res, 'Resource created', { id: 1 });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Resource created', data: { id: 1 } })
      );
    });
  });

  describe('unauthorized()', () => {
    it('responds with 401 and default message', () => {
      const res = mockRes();
      unauthorized(res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'No autorizado' })
      );
    });
  });

  describe('forbidden()', () => {
    it('responds with 403 and default message', () => {
      const res = mockRes();
      forbidden(res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Prohibido' })
      );
    });
  });

  describe('notFound()', () => {
    it('responds with 404 and default message', () => {
      const res = mockRes();
      notFound(res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'No encontrado' })
      );
    });
  });

  describe('badRequest()', () => {
    it('responds with 400 and default message', () => {
      const res = mockRes();
      badRequest(res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Solicitud inválida' })
      );
    });
  });

  describe('conflict()', () => {
    it('responds with 409 and default message', () => {
      const res = mockRes();
      conflict(res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Conflicto' })
      );
    });
  });

  describe('unprocessable()', () => {
    it('responds with 422 and default message', () => {
      const res = mockRes();
      unprocessable(res);
      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Regla de negocio violada' })
      );
    });
  });

  describe('serverError()', () => {
    it('responds with 500 without calling console.error when errorObj is not provided', () => {
      const res = mockRes();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      serverError(res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Error interno' })
      );
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('responds with 500 and calls console.error when errorObj is provided', () => {
      const res = mockRes();
      const testError = new Error('Test error');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      serverError(res, 'Error interno', testError);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(consoleSpy).toHaveBeenCalledWith(testError);
      consoleSpy.mockRestore();
    });
  });

  describe('errorObj logging on all helpers', () => {
    it('unauthorized() logs errorObj when provided', () => {
      const res = mockRes();
      const testError = new Error('Unauthorized error');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      unauthorized(res, 'Custom message', testError);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(consoleSpy).toHaveBeenCalledWith(testError);
      consoleSpy.mockRestore();
    });
  });
});
