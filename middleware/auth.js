const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.SuperAdminStatus !== 'True') {
    return res.status(403).json({ success: false, message: 'SuperAdmin access required' });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
