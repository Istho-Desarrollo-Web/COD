const { success, error, paginated } = require('../../src/utils/responses');

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
});
