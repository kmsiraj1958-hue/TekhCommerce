import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== config.adminUser || password !== config.adminPass) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ username }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token, username });
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const user = jwt.verify(token, config.jwtSecret);
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid session' });
  }
});

export default router;
