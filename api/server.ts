import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import CryptoJS from 'crypto-js';
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import jwt_lib from 'jsonwebtoken';
import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'secrets_manager',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
});

const app = new Hono();

// Middleware
app.use('*', cors());

// Encryption/Decryption utilities
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || 'your-secret-encryption-key';

const encrypt = (text: string): string => {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
};

const decrypt = (encryptedText: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

// Auth middleware for JWT
const authJWT = jwt({
  secret: process.env.JWT_SECRET || 'your-jwt-secret',
});

// Auth middleware for CLI tokens
const authToken = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const result = await pool.query(
      `SELECT at.*, p.id as project_id, p.name as project_name
       FROM access_tokens at
       JOIN projects p ON at.project_id = p.id
       WHERE at.token = $1 AND (at.expires_at IS NULL OR at.expires_at > NOW())`,
      [token]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Update last_used_at
    await pool.query(
      'UPDATE access_tokens SET last_used_at = NOW() WHERE token = $1',
      [token]
    );

    c.set('tokenData', result.rows[0]);
    await next();
  } catch (error) {
    return c.json({ error: 'Token validation failed' }, 401);
  }
};

// * Routes

// User registration
app.post('/api/register', async (c) => {
  try {
    const { username, email, password } = await c.req.json();

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    return c.json({ user: result.rows[0] });
  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      // Unique violation
      return c.json({ error: 'Username or email already exists' }, 400);
    }
    return c.json({ error: 'Registration failed' }, 500);
  }
});

// User login
app.post('/api/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    const result = await pool.query(
      'SELECT id, username, email, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = jwt_lib.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-jwt-secret',
      { expiresIn: '24h' }
    );

    return c.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500);
  }
});

// Create project
app.post('/api/projects', authJWT, async (c) => {
  try {
    const payload = c.get('jwtPayload');
    const { name, description } = await c.req.json();

    const result = await pool.query(
      'INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, payload.userId]
    );

    // Give owner admin permissions
    await pool.query(
      'INSERT INTO project_permissions (user_id, project_id, role) VALUES ($1, $2, $3)',
      [payload.userId, result.rows[0].id, 'admin']
    );

    return c.json({ project: result.rows[0] });
  } catch (error) {
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

// Get user's projects
app.get('/api/projects', authJWT, async (c) => {
  try {
    const payload = c.get('jwtPayload');

    const result = await pool.query(
      `SELECT p.*, pp.role FROM projects p
       JOIN project_permissions pp ON p.id = pp.project_id
       WHERE pp.user_id = $1`,
      [payload.userId]
    );

    return c.json({ projects: result.rows });
  } catch (error) {
    return c.json({ error: 'Failed to fetch projects' }, 500);
  }
});

// Create access token
app.post('/api/projects/:projectId/tokens', authJWT, async (c) => {
  try {
    const payload = c.get('jwtPayload');
    const projectId = c.req.param('projectId');
    const { name, expiresAt } = await c.req.json();

    // Check if user has admin access to project
    const permissionCheck = await pool.query(
      'SELECT role FROM project_permissions WHERE user_id = $1 AND project_id = $2',
      [payload.userId, projectId]
    );

    if (
      permissionCheck.rows.length === 0 ||
      permissionCheck.rows[0].role !== 'admin'
    ) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const token = CryptoJS.lib.WordArray.random(32).toString();

    const result = await pool.query(
      'INSERT INTO access_tokens (token, user_id, project_id, name, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [token, payload.userId, projectId, name, expiresAt || null]
    );

    return c.json({ token: result.rows[0] });
  } catch (error) {
    return c.json({ error: 'Failed to create token' }, 500);
  }
});

// Set secret
app.post('/api/projects/:projectId/secrets', authJWT, async (c) => {
  try {
    const payload = c.get('jwtPayload');
    const projectId = c.req.param('projectId');
    const { key, value, description } = await c.req.json();

    // Check permissions
    const permissionCheck = await pool.query(
      'SELECT role FROM project_permissions WHERE user_id = $1 AND project_id = $2',
      [payload.userId, projectId]
    );

    if (
      permissionCheck.rows.length === 0 ||
      !['admin', 'write'].includes(permissionCheck.rows[0].role)
    ) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const encryptedValue = encrypt(value);

    const result = await pool.query(
      `INSERT INTO secrets (project_id, key, value, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, key)
       DO UPDATE SET value = $3, description = $4, updated_at = NOW()
       RETURNING id, key, description, created_at, updated_at`,
      [projectId, key, encryptedValue, description, payload.userId]
    );

    return c.json({ secret: result.rows[0] });
  } catch (error) {
    return c.json({ error: 'Failed to set secret' }, 500);
  }
});

// Get secrets (for CLI)
app.get('/api/secrets', authToken, async (c) => {
  try {
    const tokenData = c.get('tokenData' as any);

    const result = await pool.query(
      'SELECT key, value FROM secrets WHERE project_id = $1',
      [tokenData.project_id]
    );

    const secrets = result.rows.reduce((acc: any, row) => {
      acc[row.key] = decrypt(row.value);
      return acc;
    }, {});

    return c.json({ secrets });
  } catch (error) {
    return c.json({ error: 'Failed to fetch secrets' }, 500);
  }
});

// Get secrets list
app.get('/api/projects/:projectId/secrets', authJWT, async (c) => {
  try {
    const payload = c.get('jwtPayload');
    const projectId = c.req.param('projectId');

    // Check permissions
    const permissionCheck = await pool.query(
      'SELECT role FROM project_permissions WHERE user_id = $1 AND project_id = $2',
      [payload.userId, projectId]
    );

    if (permissionCheck.rows.length === 0) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const result = await pool.query(
      'SELECT id, key, description, created_at, updated_at FROM secrets WHERE project_id = $1',
      [projectId]
    );

    return c.json({ secrets: result.rows });
  } catch (error) {
    return c.json({ error: 'Failed to fetch secrets' }, 500);
  }
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = parseInt(process.env.PORT || '3000');

console.log(`🔐 Secrets Manager API running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
