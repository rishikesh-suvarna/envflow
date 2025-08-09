import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

// Auth
export async function registerUser(input: {
  username: string;
  email: string;
  password: string;
}) {
  const { data } = await api.post('/api/register', input);
  return data;
}

export async function loginUser(input: { username: string; password: string }) {
  const { data } = await api.post('/api/login', input);
  return data as {
    token: string;
    user: { id: number; username: string; email: string };
  };
}

// Projects
export async function fetchProjects() {
  const { data } = await api.get('/api/projects');
  return data as {
    projects: Array<{
      id: number;
      name: string;
      description: string;
      role: string;
    }>;
  };
}

export async function createProject(input: {
  name: string;
  description?: string;
}) {
  const { data } = await api.post('/api/projects', input);
  return data as { project: { id: number; name: string; description: string } };
}

// Tokens
export async function createAccessToken(
  projectId: number | string,
  input: { name: string; expiresAt?: string | null }
) {
  const { data } = await api.post(`/api/projects/${projectId}/tokens`, input);
  return data as { token: any };
}

// Secrets
export async function setSecret(
  projectId: number | string,
  input: { key: string; value: string; description?: string }
) {
  const { data } = await api.post(`/api/projects/${projectId}/secrets`, input);
  return data as {
    secret: {
      id: number;
      key: string;
      description: string;
      created_at: string;
      updated_at: string;
    };
  };
}

export async function fetchSecrets(projectId: number | string) {
  const { data } = await api.get(`/api/projects/${projectId}/secrets`);
  return data as {
    secrets: Array<{
      id: number;
      key: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>;
  };
}
