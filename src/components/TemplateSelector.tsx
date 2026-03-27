import { useState, useEffect, useRef } from 'react';
import { Eye, ChevronDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, Template } from '@/lib/api';
import { cn } from '@/lib/utils';
import TemplatePdfPreviewDialog from './TemplatePdfPreviewDialog';

interface Props {
  documentTypeId: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export default function TemplateSelector({ documentTypeId, value, onChange, disabled }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewTemplateName, setPreviewTemplateName] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch templates when documentTypeId changes
  useEffect(() => {
    if (!documentTypeId) return;
    setLoading(true);
    api.getTemplates(documentTypeId)
      .then(tmpls => {
        setTemplates(tmpls);
        if (!value) {
          const def = tmpls.find(t => t.is_default) ?? tmpls[0];
          if (def) onChange(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentTypeId]);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedTemplate = templates.find(t => t.id === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <span className={cn(!selectedTemplate && 'text-muted-foreground')}>
          {loading ? 'Loading…' : selectedTemplate ? selectedTemplate.name : 'Select template…'}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {templates.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No templates for this type</div>
          ) : (
            <ul className="py-1 max-h-60 overflow-auto">
              {templates.map(t => (
                <li
                  key={t.id}
                  className={cn(
                    'flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground',
                    t.id === value && 'bg-accent/50 font-medium'
                  )}
                  onClick={() => { onChange(t.id); setOpen(false); }}
                >
                  <span className="truncate flex-1">{t.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mt-1">
        {selectedTemplate && (
          <button
            type="button"
            onClick={() => {
              setPreviewTemplateId(selectedTemplate.id);
              setPreviewTemplateName(selectedTemplate.name);
              setPreviewOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
            Preview Template
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/templates')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      <TemplatePdfPreviewDialog
        templateId={previewTemplateId}
        templateName={previewTemplateName}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
