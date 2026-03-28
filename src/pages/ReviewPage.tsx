import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, ApiError, DocumentDetail, FieldDefinition } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, Trash2, Download, Save, CheckCircle, Eye } from 'lucide-react';

// ─── Field Editors ────────────────────────────────────────────────────────────

function StringArrayEditor({
  value, onChange
}: { value: string[]; onChange: (v: string[]) => void }) {
  const [newItem, setNewItem] = useState('');
  const items = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm">
            {item}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add item..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newItem.trim()) {
              e.preventDefault();
              onChange([...items, newItem.trim()]);
              setNewItem('');
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!newItem.trim()}
          onClick={() => { onChange([...items, newItem.trim()]); setNewItem(''); }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function JsonObjectEditor({
  value, objectKeys, onChange
}: {
  value: Record<string, string>;
  objectKeys: { key: string; label: string }[];
  onChange: (v: Record<string, string>) => void;
}) {
  const obj = (typeof value === 'object' && value !== null) ? value : {};
  return (
    <div className="space-y-2">
      {objectKeys.map(({ key, label }) => (
        <div key={key} className="flex gap-2 items-center">
          <span className="text-sm font-medium text-muted-foreground w-24 shrink-0">{label}</span>
          <Input
            value={String(obj[key] || '')}
            onChange={(e) => onChange({ ...obj, [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

function JsonArrayEditor({
  value, itemSchema, onChange
}: {
  value: Record<string, unknown>[];
  itemSchema: FieldDefinition[];
  onChange: (v: Record<string, unknown>[]) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  const emptyItem = Object.fromEntries(itemSchema.map(f => [f.key, f.type === 'string_array' ? [] : '']));

  const updateItem = (i: number, key: string, val: unknown) => {
    const updated = items.map((item, j) => j === i ? { ...item, [key]: val } : item);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {itemSchema.map(field => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs">{field.label}</Label>
              {field.type === 'string_array' ? (
                <StringArrayEditor
                  value={Array.isArray(item[field.key]) ? item[field.key] as string[] : []}
                  onChange={(v) => updateItem(i, field.key, v)}
                />
              ) : field.type === 'textarea' ? (
                <Textarea
                  rows={2}
                  value={String(item[field.key] || '')}
                  onChange={(e) => updateItem(i, field.key, e.target.value)}
                />
              ) : (
                <Input
                  value={String(item[field.key] || '')}
                  onChange={(e) => updateItem(i, field.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, { ...emptyItem }])}>
        <Plus className="h-4 w-4 mr-2" />
        Add entry
      </Button>
    </div>
  );
}

function FieldEditor({
  field, value, onChange
}: { field: FieldDefinition; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'text') {
    return (
      <Input
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'textarea') {
    return (
      <Textarea
        rows={3}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'string_array') {
    return (
      <StringArrayEditor
        value={Array.isArray(value) ? value as string[] : []}
        onChange={onChange}
      />
    );
  }
  if (field.type === 'json_array' && field.item_schema) {
    return (
      <JsonArrayEditor
        value={Array.isArray(value) ? value as Record<string, unknown>[] : []}
        itemSchema={field.item_schema}
        onChange={onChange}
      />
    );
  }
  if (field.type === 'json_object' && field.object_keys) {
    return (
      <JsonObjectEditor
        value={(typeof value === 'object' && value !== null) ? value as Record<string, string> : {}}
        objectKeys={field.object_keys}
        onChange={onChange}
      />
    );
  }
  return null;
}

// ─── Main ReviewPage ──────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedLatex, setGeneratedLatex] = useState<string | null>(null);
  const [outputTab, setOutputTab] = useState<'pdf' | 'source' | 'split'>('pdf');
  const [outputPdfUrl, setOutputPdfUrl] = useState<string | null>(null);
  const [outputPdfLoading, setOutputPdfLoading] = useState(false);
  const [outputPdfError, setOutputPdfError] = useState<string | null>(null);
  const [outputPdfErrorDetail, setOutputPdfErrorDetail] = useState<string | null>(null);
  const [editedOutputLatex, setEditedOutputLatex] = useState('');
  const [isOutputDirty, setIsOutputDirty] = useState(false);
  const [isSavingOutput, setIsSavingOutput] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api.getDocument(id).then(d => {
      setDoc(d);
      if (d.extraction?.fields) {
        const f = typeof d.extraction.fields === 'string'
          ? JSON.parse(d.extraction.fields)
          : d.extraction.fields;
        setFields(f);
      }
      if (d.file_mime === 'application/pdf') {
        setPdfLoading(true);
        api.getDocumentFile(id).then(blob => {
          setPdfUrl(URL.createObjectURL(blob));
        }).catch(() => {/* fall through to image viewer */}).finally(() => {
          setPdfLoading(false);
        });
      }
    }).catch(() => toast.error('Failed to load document'));
  }, [id]);

  // Load page image
  const loadPageImage = useCallback(async (pageNum: number) => {
    if (!id) return;
    try {
      const blob = await api.getPageImage(id, pageNum);
      const url = URL.createObjectURL(blob);
      setPageImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPageImageUrl(null);
    }
  }, [id]);

  useEffect(() => {
    if (doc && doc.pages.length > 0) {
      loadPageImage(currentPage);
    }
  }, [doc, currentPage, loadPageImage]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { if (pageImageUrl) URL.revokeObjectURL(pageImageUrl); };
  }, [pageImageUrl]);

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  useEffect(() => {
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl); };
  }, [photoUrl]);

  // Load profile photo if one was extracted
  useEffect(() => {
    if (!id || !doc?.photo_path) return;
    api.getDocumentPhoto(id).then(blob => {
      setPhotoUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }).catch(() => { /* no photo on disk */ });
  }, [id, doc?.photo_path]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setPhotoUploading(true);
    try {
      await api.uploadDocumentPhoto(id, file);
      const blob = await api.getDocumentPhoto(id);
      setPhotoUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      toast.success('Photo updated');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await api.updateExtraction(id, fields);
      toast.success('Changes saved');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const openAcceptDialog = () => {
    if (!doc) return;
    api.getTemplates(doc.document_type_id).then(tmpls => {
      setTemplates(tmpls);
      const preferred = doc.preferred_template_id
        ? tmpls.find(t => t.id === doc.preferred_template_id)
        : null;
      const def = tmpls.find(t => t.is_default);
      const pick = preferred ?? def ?? tmpls[0];
      if (pick) setSelectedTemplate(pick.id);
      setAcceptDialogOpen(true);
    }).catch(() => toast.error('Failed to load templates'));
  };

  const handleAccept = async () => {
    if (!id || !selectedTemplate) return;
    setGenerating(true);
    try {
      // Save latest fields first
      await api.updateExtraction(id, fields);
      const result = await api.acceptDocument(id, selectedTemplate);
      setGeneratedLatex(result.latex_content);
      setEditedOutputLatex(result.latex_content);
      setIsOutputDirty(false);
      setOutputTab('pdf');
      setOutputPdfUrl(null);
      setOutputPdfError(null);
      setOutputPdfErrorDetail(null);
      toast.success('Output generated');
      setDoc(prev => prev ? { ...prev, status: 'generated' } : prev);
      // Compile PDF in background
      fetchOutputPdf(id);
    } catch {
      toast.error('Failed to generate output');
    } finally {
      setGenerating(false);
    }
  };

  const fetchOutputPdf = async (docId: string) => {
    setOutputPdfLoading(true);
    setOutputPdfError(null);
    setOutputPdfErrorDetail(null);
    if (outputPdfUrl) { URL.revokeObjectURL(outputPdfUrl); setOutputPdfUrl(null); }
    try {
      const blob = await api.getOutputPdf(docId);
      setOutputPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setOutputPdfError(apiErr ? apiErr.message : 'PDF compilation failed');
      setOutputPdfErrorDetail(apiErr?.detail ?? null);
    } finally {
      setOutputPdfLoading(false);
    }
  };

  const handleOpenOutputDialog = async () => {
    if (!id) return;
    // Show output view immediately (non-null generatedLatex triggers it)
    if (!generatedLatex) setGeneratedLatex('\u00a0'); // placeholder — replaced below
    setAcceptDialogOpen(true);
    if (!editedOutputLatex) {
      // Load existing output (page was refreshed, state was reset)
      try {
        const blob = await api.getOutput(id);
        const text = await blob.text();
        setEditedOutputLatex(text);
        setGeneratedLatex(text);
      } catch { /* ignore */ }
    }
    if (!outputPdfUrl && !outputPdfLoading) {
      fetchOutputPdf(id);
    }
  };

  const handleSaveOutput = async () => {
    if (!id || !isOutputDirty) return;
    setIsSavingOutput(true);
    try {
      await api.updateOutput(id, editedOutputLatex);
      setIsOutputDirty(false);
      setOutputPdfError(null);
      toast.success('Output saved');
      fetchOutputPdf(id);
    } catch {
      toast.error('Failed to save output');
    } finally {
      setIsSavingOutput(false);
    }
  };

  const handleDownloadOutputPdf = async () => {
    if (!id) return;
    try {
      const blob = await api.getOutputPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.original_filename?.replace(/\.[^.]+$/, '') || 'output'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  const handleDownload = async () => {
    if (!id) return;
    try {
      const blob = await api.getOutput(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.original_filename?.replace(/\.[^.]+$/, '') || 'output'}.tex`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download output');
    }
  };

  if (!doc) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const schema = typeof doc.field_schema === 'string'
    ? JSON.parse(doc.field_schema as unknown as string)
    : (doc.field_schema || []);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
            ← Back
          </button>
          <span className="text-sm font-medium truncate max-w-xs">{doc.original_filename}</span>
          <StatusBadge status={doc.status} />
        </div>
        <div className="flex items-center gap-2">
          {doc.status === 'generated' && (
            <>
              <Button variant="outline" size="sm" onClick={handleOpenOutputDialog}>
                <Eye className="h-4 w-4 mr-2" />
                View Output
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download .tex
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button size="sm" onClick={openAcceptDialog}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Accept & Generate
          </Button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Page viewer */}
        <div className="w-1/2 border-r flex flex-col bg-muted/20 overflow-hidden">
          {pdfUrl ? (
            <div className="flex-1 overflow-hidden">
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0"
                title="Document preview"
              />
            </div>
          ) : pdfLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
                <span className="text-sm">Loading preview…</span>
              </div>
            </div>
          ) : (
            <>
              {/* Page nav */}
              {doc.pages.length > 0 && (
                <div className="border-b px-4 py-2 flex items-center gap-3 bg-card shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {doc.pages.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage >= doc.pages.length}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Page image */}
              <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
                {pageImageUrl ? (
                  <img
                    src={pageImageUrl}
                    alt={`Page ${currentPage}`}
                    className="max-w-full shadow-md rounded border"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    {doc.pages.length === 0 ? 'No preview available' : 'Loading…'}
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {doc.pages.length > 1 && (
                <div className="border-t p-2 flex gap-2 overflow-x-auto shrink-0 bg-card">
                  {doc.pages.map(page => (
                    <button
                      key={page.page_number}
                      onClick={() => setCurrentPage(page.page_number)}
                      className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
                        currentPage === page.page_number
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card hover:bg-accent border-border'
                      }`}
                    >
                      {page.page_number}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Field editor */}
        <div className="w-1/2 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Extracted Fields</h2>
              {doc.extraction && (
                <p className="text-xs text-muted-foreground mt-1">
                  {doc.extraction.input_tokens + doc.extraction.output_tokens} tokens used
                </p>
              )}
            </div>

            {/* Profile Photo — CV documents only */}
            {doc.document_type_name === 'cv' && (
              <div className="space-y-2">
                <Label>Profile Photo</Label>
                <div className="flex items-center gap-4">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Profile"
                      className="w-20 h-20 rounded-full object-cover border shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border text-muted-foreground text-xs text-center leading-tight shrink-0">
                      No photo
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <button
                      className="text-sm underline text-foreground hover:text-primary disabled:opacity-50 text-left"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                    >
                      {photoUploading ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Add photo'}
                    </button>
                    <p className="text-xs text-muted-foreground">JPEG or PNG</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>
                </div>
              </div>
            )}

            {schema.map((field: FieldDefinition) => (
              <div key={field.key} className="space-y-2">
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <FieldEditor
                  field={field}
                  value={fields[field.key]}
                  onChange={(v) => setFields(prev => ({ ...prev, [field.key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accept dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent className={generatedLatex && outputTab === 'split' ? 'max-w-[92vw]' : 'max-w-3xl'}>
          <DialogHeader>
            <DialogTitle>Accept & Generate LaTeX</DialogTitle>
          </DialogHeader>

          {!generatedLatex ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Need a different template?{' '}
                  <Link to="/templates" className="underline hover:text-foreground">
                    Manage templates
                  </Link>
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleAccept}
                  disabled={!selectedTemplate || generating}
                >
                  {generating ? 'Generating...' : 'Generate'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2 border-b pb-2">
                <Button variant={outputTab === 'pdf' ? 'default' : 'ghost'} size="sm" onClick={() => setOutputTab('pdf')}>PDF Preview</Button>
                <Button variant={outputTab === 'source' ? 'default' : 'ghost'} size="sm" onClick={() => setOutputTab('source')}>LaTeX Source</Button>
                <Button variant={outputTab === 'split' ? 'default' : 'ghost'} size="sm" onClick={() => setOutputTab('split')}>Split</Button>
              </div>
              {outputTab === 'split' ? (
                <div className="flex gap-3 h-[60vh]">
                  <textarea
                    className="flex-1 bg-muted rounded p-3 text-xs font-mono resize-none border focus:outline-none focus:ring-1 focus:ring-ring"
                    value={editedOutputLatex}
                    onChange={(e) => { setEditedOutputLatex(e.target.value); setIsOutputDirty(true); }}
                    spellCheck={false}
                  />
                  <div className="flex-1 flex flex-col">
                    {outputPdfLoading ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm rounded border bg-muted/30">Compiling PDF...</div>
                    ) : outputPdfError ? (
                      <div className="space-y-2 overflow-auto">
                        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{outputPdfError}</div>
                        {outputPdfErrorDetail && (
                          <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[20vh] font-mono whitespace-pre-wrap">{outputPdfErrorDetail}</pre>
                        )}
                      </div>
                    ) : outputPdfUrl ? (
                      <iframe src={outputPdfUrl} className="w-full h-full rounded border" title="Output PDF" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm rounded border bg-muted/30">Save to recompile</div>
                    )}
                  </div>
                </div>
              ) : outputTab === 'pdf' ? (
                <div className="w-full h-[60vh]">
                  {outputPdfLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Compiling PDF...</div>
                  ) : outputPdfError ? (
                    <div className="space-y-3">
                      <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{outputPdfError}</div>
                      {outputPdfErrorDetail && (
                        <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[30vh] font-mono whitespace-pre-wrap">{outputPdfErrorDetail}</pre>
                      )}
                    </div>
                  ) : outputPdfUrl ? (
                    <iframe src={outputPdfUrl} className="w-full h-full rounded border" title="Output PDF" />
                  ) : null}
                </div>
              ) : (
                <textarea
                  className="w-full h-[60vh] bg-muted rounded p-3 text-xs font-mono resize-none border focus:outline-none focus:ring-1 focus:ring-ring"
                  value={editedOutputLatex}
                  onChange={(e) => { setEditedOutputLatex(e.target.value); setIsOutputDirty(true); }}
                  spellCheck={false}
                />
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <div className="flex w-full justify-between items-center gap-2">
                  <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Close</Button>
                  <div className="flex gap-2">
                    {(outputTab === 'source' || outputTab === 'split') && (
                      <Button size="sm" onClick={handleSaveOutput} disabled={!isOutputDirty || isSavingOutput}>
                        {isSavingOutput ? 'Saving…' : 'Save'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleDownloadOutputPdf}>
                      <Download className="h-4 w-4 mr-1" />
                      Download PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-1" />
                      Download .tex
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
