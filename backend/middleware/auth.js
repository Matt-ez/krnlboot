const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token di accesso mancante' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sport_analytics_secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token non valido o scaduto' });
  }
};

module.exports = authMiddleware;
