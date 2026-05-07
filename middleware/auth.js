/**
 * Require the user to be logged in.
 * If not, redirect to /login.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

/**
 * Redirect already-logged-in users away from auth pages.
 */
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/photos/gallery');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuth };
