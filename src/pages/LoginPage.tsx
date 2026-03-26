import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    try {
      localStorage.setItem('flowify_api_key', key.trim());
      await api.getDocumentTypes();
      login(key.trim());
      navigate('/');
    } catch (err) {
      localStorage.removeItem('flowify_api_key');
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Invalid API key');
      } else {
        toast.error('Could not connect to server');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border bg-card shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Flowify</h1>
          <p className="text-sm text-muted-foreground">Enter your API key to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key">API Key</Label>
            <Input
              id="key"
              type="password"
              placeholder="your-admin-api-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !key.trim()}>
            {loading ? 'Connecting...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
