function success(res, data, statusCodeOrMessage = 200) {
  const isCode = typeof statusCodeOrMessage === 'number';
  return res
    .status(isCode ? statusCodeOrMessage : 200)
    .json({ success: true, data, message: isCode ? null : statusCodeOrMessage, errors: [], code: null });
}

function successMessage(res, message, data = null, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message, errors: [], code: null });
}

function created(res, message, data) {
  return successMessage(res, message, data, 201);
}

function paginated(res, data, pagination) {
  return res.status(200).json({ success: true, data, message: null, errors: [], code: null, pagination });
}

function error(res, message, statusCode = 400, errors = null, code = null) {
  return res.status(statusCode).json({ success: false, data: null, message, errors: errors || [], code });
}

function logError(errorObj) {
  if (errorObj) console.error(errorObj);
}

const unauthorized = (res, message = 'No autorizado', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 401);
};
const forbidden = (res, message = 'Prohibido', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 403);
};
const notFound = (res, message = 'No encontrado', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 404);
};
const badRequest = (res, message = 'Solicitud inválida', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 400);
};
const conflict = (res, message = 'Conflicto', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 409);
};
const unprocessable = (res, message = 'Regla de negocio violada', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 422);
};
const serverError = (res, message = 'Error interno', errorObj = null) => {
  logError(errorObj);
  return error(res, message, 500);
};

module.exports = {
  success, successMessage, created, paginated,
  error, unauthorized, forbidden, notFound, badRequest, conflict, unprocessable, serverError,
};
