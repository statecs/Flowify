import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

interface Props {
  templateId: string | null;
  templateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TemplatePdfPreviewDialog({ templateId, templateName, open, onOpenChange }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !templateId) return;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    api.getTemplatePdfPreview(templateId)
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(err => {
        setError(err instanceof ApiError ? err.message : 'Failed to load preview');
      })
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, templateId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Preview — {templateName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Compiling preview…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-sm text-destructive">
              {error}
            </div>
          )}
          {pdfUrl && (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded border"
              title={`Preview of ${templateName}`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
