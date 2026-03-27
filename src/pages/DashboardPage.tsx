import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, DocumentSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/StatusBadge';
import { toast } from 'sonner';
import { Upload, RefreshCw, Trash2, Eye, RotateCcw } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function DashboardPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.getDocuments({ limit: 50 });
      setDocuments(res.data);
      setTotal(res.total);
    } catch {
      // silently fail on poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Poll every 3s if any document is processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing' || d.status === 'uploaded');
    if (!hasProcessing) return;
    const interval = setInterval(fetchDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await api.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setTotal(prev => prev - 1);
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const handleReprocess = async (id: string) => {
    try {
      await api.reprocessDocument(id);
      toast.success('Reprocessing started');
      fetchDocuments();
    } catch {
      toast.error('Failed to reprocess document');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} document{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDocuments}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/upload')}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-card">
          <p className="text-muted-foreground mb-4">No documents yet</p>
          <Button onClick={() => navigate('/upload')}>
            <Upload className="h-4 w-4 mr-2" />
            Upload your first document
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Filename</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, i) => (
                <tr key={doc.id} className={i > 0 ? 'border-t' : ''}>
                  <td className="px-4 py-3 max-w-0 overflow-hidden">
                    <span className="font-medium truncate max-w-xs block" title={doc.original_filename}>
                      {doc.original_filename}
                    </span>
                    {doc.error_message && (
                      <span className="text-xs text-destructive block mt-0.5 truncate" title={doc.error_message}>
                        {doc.error_message}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">{doc.document_type_label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatBytes(doc.file_size)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(doc.status === 'reviewing' || doc.status === 'accepted' || doc.status === 'generated') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/review/${doc.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      )}
                      {doc.error_message && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReprocess(doc.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Retry
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(doc.id, doc.original_filename)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
