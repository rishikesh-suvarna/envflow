import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createAccessToken, fetchSecrets, setSecret } from '@/lib/api';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function ProjectSecrets() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [secrets, setSecrets] = useState<
    Array<{
      id: number;
      key: string;
      description: string;
      created_at: string;
      updated_at: string;
    }>
  >([]);
  const [keyName, setKeyName] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    load();
  }, [projectId]);

  async function load() {
    if (!projectId) return;
    try {
      const { secrets } = await fetchSecrets(projectId);
      setSecrets(secrets);
    } catch (err: any) {
      if (err?.response?.status === 401) navigate('/login');
      setError(err?.response?.data?.error || 'Failed to fetch secrets');
    }
  }

  async function onCreateSecret(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setError(null);
    try {
      await setSecret(projectId, { key: keyName, value, description });
      setKeyName('');
      setValue('');
      setDescription('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to set secret');
    }
  }

  async function onCreateToken(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setError(null);
    try {
      const { token } = await createAccessToken(projectId, {
        name: tokenName,
        expiresAt: expiresAt || null,
      });
      setTokenName('');
      setExpiresAt('');
      setMessage(`Token created: ${token.token} (copy and store securely)`); // token shape from API is { token: row }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create access token');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Secrets</h1>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        <ul className="space-y-2">
          {secrets.map((s) => (
            <li
              key={s.id}
              className="border rounded px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{s.key}</div>
                <div className="text-sm text-gray-600">{s.description}</div>
              </div>
              <span className="text-xs text-gray-500">
                updated{' '}
                {new Date(s.updated_at || s.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border rounded p-4">
        <h2 className="font-medium mb-3">Add / Update Secret</h2>
        <form
          onSubmit={onCreateSecret}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <Input
            placeholder="KEY"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            required
          />
          <Input
            placeholder="VALUE"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <Input
            placeholder="Description (optional)"
            className="md:col-span-3"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="md:col-span-3">
            <Button>Save secret</Button>
          </div>
        </form>
      </div>

      <div className="border rounded p-4">
        <h2 className="font-medium mb-3">Create Access Token (for CLI)</h2>
        <form
          onSubmit={onCreateToken}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <Input
            placeholder="Token name"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            required
          />
          <Input
            placeholder="Expires at (YYYY-MM-DD) optional"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <div className="md:col-span-3">
            <Button>Create token</Button>
          </div>
        </form>
        <p className="text-sm text-gray-600 mt-2">
          Use this token with your CLI: secrets-cli token add
        </p>
      </div>
    </div>
  );
}
