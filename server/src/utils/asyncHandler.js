// Wraps an async Express route handler so that rejected promises (thrown errors)
// are forwarded to next(err) instead of hanging the request. Express 4 does not
// do this automatically for async handlers.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
