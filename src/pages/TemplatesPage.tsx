import { useState, useEffect, useRef } from 'react';
import { api, Template, DocumentType } from '@/lib/api';
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
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewTab, setPreviewTab] = useState<'pdf' | 'source'>('pdf');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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

  const handlePreview = async (templateId: string) => {
    setPreviewTab('pdf');
    setPdfError(null);
    setPreviewPdfUrl(null);
    setPdfLoading(true);
    try {
      const [tmpl, pdfBlob] = await Promise.allSettled([
        api.getTemplate(templateId),
        api.getTemplatePdfPreview(templateId),
      ]);
      if (tmpl.status === 'fulfilled') {
        setPreviewTemplate(tmpl.value);
      } else {
        toast.error('Failed to load template');
        return;
      }
      if (pdfBlob.status === 'fulfilled') {
        setPreviewPdfUrl(URL.createObjectURL(pdfBlob.value));
      } else {
        setPdfError('PDF preview unavailable — pdflatex may not be installed');
        setPreviewTab('source');
      }
    } catch {
      toast.error('Failed to load template');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    setPreviewTemplate(null);
    setPreviewPdfUrl(null);
    setPdfError(null);
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
      <Dialog open={!!previewTemplate} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
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
          </div>
          {previewTab === 'pdf' ? (
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
                  <pre className="bg-muted rounded p-4 text-xs overflow-auto max-h-[60vh] font-mono whitespace-pre-wrap">
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
          ) : (
            <pre className="bg-muted rounded p-4 text-xs overflow-auto max-h-[70vh] font-mono whitespace-pre-wrap">
              {previewTemplate?.latex_content}
            </pre>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePreview}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
