import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createProject,
  fetchProjects,
  getStoredToken,
  setAuthToken,
} from '@/lib/api';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<
    Array<{ id: number; name: string; description: string; role: string }>
  >([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // restore token on initial load
    const token = getStoredToken();
    if (token) setAuthToken(token);
    load();
  }, []);

  async function load() {
    try {
      const { projects } = await fetchProjects();
      setProjects(projects);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate('/login');
      } else {
        setError(err?.response?.data?.error || 'Failed to load projects');
      }
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createProject({ name, description });
      setName('');
      setDescription('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create project');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Projects</h1>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="border rounded px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-gray-600">{p.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-gray-100 rounded px-2 py-1">
                  {p.role}
                </span>
                <Link to={`/projects/${p.id}`} className="text-blue-600">
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border rounded p-4">
        <h2 className="font-medium mb-3">Create a new project</h2>
        <form onSubmit={onCreate} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button>Create</Button>
        </form>
      </div>
    </div>
  );
}
