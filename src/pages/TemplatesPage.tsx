import { useState, useEffect, useRef } from 'react';
import { api, ApiError, Template, DocumentType } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, FileText, Star } from 'lucide-react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewTab, setPreviewTab] = useState<'pdf' | 'source' | 'split'>('pdf');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfErrorDetail, setPdfErrorDetail] = useState<string | null>(null);
  const [editedLatex, setEditedLatex] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false);
  const [saveAsNewName, setSaveAsNewName] = useState('');
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadTypeId, setUploadTypeId] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadIsDefault, setUploadIsDefault] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    try {
      const [tmplsRes, typesRes] = await Promise.all([
        api.getTemplates(),
        api.getDocumentTypes(),
      ]);
      setTemplates(tmplsRes);
      setDocumentTypes(typesRes);
      if (typesRes.length > 0 && !uploadTypeId) {
        const cv = typesRes.find(t => t.name === 'cv');
        setUploadTypeId(cv ? cv.id : typesRes[0].id);
      }
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSetDefault = async (id: string) => {
    try {
      const updated = await api.setTemplateDefault(id);
      setTemplates(prev => prev.map(t =>
        t.document_type_id === updated.document_type_id
          ? { ...t, is_default: t.id === id ? 1 : 0 }
          : t
      ));
      toast.success('Default template updated');
    } catch {
      toast.error('Failed to set default template');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await api.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleFetchPdf = async (templateId: string) => {
    setPdfLoading(true);
    setPdfError(null);
    setPdfErrorDetail(null);
    if (previewPdfUrl) { URL.revokeObjectURL(previewPdfUrl); setPreviewPdfUrl(null); }
    try {
      const blob = await api.getTemplatePdfPreview(templateId);
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPdfError(apiErr ? apiErr.message : 'PDF preview unavailable');
      setPdfErrorDetail(apiErr?.detail ?? null);
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreview = async (templateId: string) => {
    // Open dialog immediately
    setPreviewOpen(true);
    setPreviewTab('pdf');
    setPdfError(null);
    setPdfErrorDetail(null);
    setPreviewPdfUrl(null);
    setPdfLoading(true);
    setPreviewTemplate(null);

    // Start both fetches in parallel
    const tmplPromise = api.getTemplate(templateId);
    const pdfPromise = api.getTemplatePdfPreview(templateId);

    // Template DB fetch is fast — populate name/source quickly
    try {
      const tmpl = await tmplPromise;
      setPreviewTemplate(tmpl);
      setEditedLatex(tmpl.latex_content ?? '');
      setIsDirty(false);
    } catch {
      toast.error('Failed to load template');
      setPreviewOpen(false);
      setPdfLoading(false);
      return;
    }

    // PDF compilation is slow — await separately
    try {
      const blob = await pdfPromise;
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPdfError(apiErr ? apiErr.message : 'PDF preview unavailable');
      setPdfErrorDetail(apiErr?.detail ?? null);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (isDirty && !confirm('You have unsaved changes. Close anyway?')) return;
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    setPreviewOpen(false);
    setPreviewTemplate(null);
    setPreviewPdfUrl(null);
    setPdfError(null);
    setPdfErrorDetail(null);
    setEditedLatex('');
    setIsDirty(false);
    setIsFixing(false);
    setSaveAsNewOpen(false);
    setSaveAsNewName('');
    setPreviewTab('pdf');
  };

  const handleSave = async () => {
    if (!previewTemplate || !isDirty) return;
    setIsSaving(true);
    try {
      await api.updateTemplate(previewTemplate.id, editedLatex);
      setIsDirty(false);
      setPdfError(null);
      toast.success('Template saved');
      handleFetchPdf(previewTemplate.id);
    } catch {
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!previewTemplate || !saveAsNewName.trim()) return;
    setIsSavingNew(true);
    try {
      const formData = new FormData();
      formData.append('name', saveAsNewName.trim());
      formData.append('document_type_id', previewTemplate.document_type_id);
      if (previewTemplate.description) formData.append('description', previewTemplate.description);
      formData.append('latex_content', editedLatex);
      const newTemplate = await api.createTemplate(formData);
      setTemplates(prev => [newTemplate, ...prev]);
      setSaveAsNewOpen(false);
      setSaveAsNewName('');
      toast.success(`Template "${newTemplate.name}" created`);
    } catch {
      toast.error('Failed to create template');
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleFixLatex = async () => {
    if (!editedLatex.trim()) return;
    setIsFixing(true);
    try {
      const { fixed_content } = await api.fixLatex(editedLatex);
      setEditedLatex(fixed_content);
      setIsDirty(true);
      toast.success('LaTeX errors fixed — review changes and save');
    } catch {
      toast.error('AI fix failed');
    } finally {
      setIsFixing(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadName.trim() || !uploadTypeId || !uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', uploadName.trim());
      formData.append('document_type_id', uploadTypeId);
      if (uploadDescription.trim()) formData.append('description', uploadDescription.trim());
      if (uploadIsDefault) formData.append('is_default', '1');
      formData.append('file', uploadFile);

      const newTemplate = await api.createTemplate(formData);
      setTemplates(prev => [newTemplate, ...prev]);
      toast.success('Template uploaded');
      setUploadDialogOpen(false);
      setUploadName('');
      setUploadDescription('');
      setUploadIsDefault(false);
      setUploadFile(null);
    } catch {
      toast.error('Failed to upload template');
    } finally {
      setUploading(false);
    }
  };

  // Group templates by document type
  const grouped = documentTypes.map(dt => ({
    type: dt,
    templates: templates.filter(t => t.document_type_id === dt.id),
  })).filter(g => g.templates.length > 0);

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
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage LaTeX output templates</p>
        </div>
        <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Template
        </Button>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-card">
          <p className="text-muted-foreground mb-4">No templates yet</p>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload your first template
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ type, templates: typeTmpls }) => (
            <div key={type.id}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {type.label}
              </h2>
              <div className="border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Default</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeTmpls.map((tmpl, i) => (
                      <tr key={tmpl.id} className={i > 0 ? 'border-t' : ''}>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {tmpl.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {tmpl.description || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {tmpl.is_default ? (
                            <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                              Default
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!tmpl.is_default && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSetDefault(tmpl.id)}
                              >
                                <Star className="h-4 w-4 mr-1" />
                                Set Default
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(tmpl.id)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(tmpl.id, tmpl.name)}
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
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                placeholder="My CV Template"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={uploadTypeId} onValueChange={setUploadTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map(dt => (
                    <SelectItem key={dt.id} value={dt.id}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>.tex File</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <p className="text-sm font-medium">{uploadFile.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to select .tex file</p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".tex"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={uploadIsDefault}
                onChange={(e) => setUploadIsDefault(e.target.checked)}
              />
              <Label htmlFor="is_default">Set as default for this type</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadName.trim() || !uploadTypeId || !uploadFile || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={handleClosePreview}>
        <DialogContent className={previewTab === 'split' ? 'max-w-[92vw]' : 'max-w-4xl'}>
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name ?? 'Loading…'}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={previewTab === 'pdf' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPreviewTab('pdf')}
            >
              PDF Preview
            </Button>
            <Button
              variant={previewTab === 'source' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPreviewTab('source')}
            >
              LaTeX Source
            </Button>
            <Button
              variant={previewTab === 'split' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPreviewTab('split')}
            >
              Split
            </Button>
          </div>
          {previewTab === 'split' ? (
            <div className="flex gap-3 h-[75vh]">
              {/* Left: editor */}
              <textarea
                className="flex-1 bg-muted rounded p-4 text-xs font-mono resize-none border focus:outline-none focus:ring-1 focus:ring-ring"
                value={editedLatex}
                onChange={(e) => { setEditedLatex(e.target.value); setIsDirty(true); }}
                spellCheck={false}
              />
              {/* Right: PDF */}
              <div className="flex-1 flex flex-col">
                {pdfLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm rounded border bg-muted/30">
                    Compiling PDF...
                  </div>
                ) : pdfError ? (
                  <div className="space-y-2 overflow-auto">
                    <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                      {pdfError}
                    </div>
                    {pdfErrorDetail && (
                      <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[30vh] font-mono whitespace-pre-wrap">
                        {pdfErrorDetail}
                      </pre>
                    )}
                  </div>
                ) : previewPdfUrl ? (
                  <iframe src={previewPdfUrl} className="w-full h-full rounded border" title="PDF Preview" />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm rounded border bg-muted/30">
                    Save to recompile
                  </div>
                )}
              </div>
            </div>
          ) : previewTab === 'pdf' ? (
            <div className="w-full h-[70vh]">
              {pdfLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Compiling PDF...
                </div>
              ) : pdfError ? (
                <div className="space-y-3">
                  <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                    {pdfError}
                  </div>
                  {pdfErrorDetail && (
                    <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[40vh] font-mono whitespace-pre-wrap">
                      {pdfErrorDetail}
                    </pre>
                  )}
                  <pre className="bg-muted rounded p-4 text-xs overflow-auto max-h-[30vh] font-mono whitespace-pre-wrap">
                    {previewTemplate?.latex_content}
                  </pre>
                </div>
              ) : previewPdfUrl ? (
                <iframe
                  src={previewPdfUrl}
                  className="w-full h-full rounded border"
                  title="PDF Preview"
                />
              ) : null}
            </div>
          ) : previewTemplate ? (
            <textarea
              className="w-full h-[70vh] bg-muted rounded p-4 text-xs font-mono resize-none border focus:outline-none focus:ring-1 focus:ring-ring"
              value={editedLatex}
              onChange={(e) => { setEditedLatex(e.target.value); setIsDirty(true); }}
              spellCheck={false}
            />
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Loading…
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {saveAsNewOpen && (
              <div className="flex items-center gap-2 w-full">
                <Input
                  placeholder="New template name…"
                  value={saveAsNewName}
                  onChange={(e) => setSaveAsNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsNew(); }}
                  autoFocus
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={handleSaveAsNew} disabled={!saveAsNewName.trim() || isSavingNew}>
                  {isSavingNew ? 'Creating…' : 'Create'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSaveAsNewOpen(false)}>Cancel</Button>
              </div>
            )}
            <div className="flex w-full justify-between items-center gap-2">
              <Button variant="outline" onClick={handleClosePreview}>Close</Button>
              {(previewTab === 'source' || previewTab === 'split') && (pdfLoading || pdfError || previewPdfUrl) && (
                <div className="flex items-center gap-1.5 text-xs">
                  {pdfLoading ? (
                    <span className="text-muted-foreground">Compiling…</span>
                  ) : pdfError ? (
                    <span className="text-yellow-700 font-medium">⚠ LaTeX errors found</span>
                  ) : (
                    <span className="text-green-700 font-medium">✓ Compiled OK</span>
                  )}
                </div>
              )}
              {(previewTab === 'source' || previewTab === 'split') && previewTemplate && (
                <div className="flex gap-2">
                  {!!pdfError && (
                    <Button
                      variant="destructive" size="sm"
                      onClick={handleFixLatex}
                      disabled={isFixing || isSaving || isSavingNew}
                    >
                      {isFixing ? 'Fixing…' : 'Fix Errors'}
                    </Button>
                  )}
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setSaveAsNewOpen(true); setSaveAsNewName(''); }}
                    disabled={isSaving || isSavingNew || isFixing}
                  >Save As New</Button>
                  <Button
                    size="sm" onClick={handleSave}
                    disabled={!isDirty || isSaving || isSavingNew || isFixing}
                  >{isSaving ? 'Saving…' : 'Save'}</Button>
                </div>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
