import { useState, useEffect } from 'react';
import { api, ApiError, Output } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Eye, Download, FileOutput } from 'lucide-react';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function OutputsPage() {
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);

  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOutput, setPreviewOutput] = useState<Output | null>(null);
  const [previewTab, setPreviewTab] = useState<'pdf' | 'source' | 'split'>('pdf');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfErrorDetail, setPdfErrorDetail] = useState<string | null>(null);
  const [editedLatex, setEditedLatex] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    api.getOutputs()
      .then(setOutputs)
      .catch(() => toast.error('Failed to load outputs'))
      .finally(() => setLoading(false));
  }, []);

  const fetchPdf = async (docId: string) => {
    setPdfLoading(true);
    setPdfError(null);
    setPdfErrorDetail(null);
    if (previewPdfUrl) { URL.revokeObjectURL(previewPdfUrl); setPreviewPdfUrl(null); }
    try {
      const blob = await api.getOutputPdf(docId);
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPdfError(apiErr ? apiErr.message : 'PDF compilation failed');
      setPdfErrorDetail(apiErr?.detail ?? null);
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreview = async (output: Output) => {
    setPreviewOpen(true);
    setPreviewTab('pdf');
    setPreviewOutput(output);
    setPdfError(null);
    setPdfErrorDetail(null);
    setPreviewPdfUrl(null);
    setPdfLoading(true);
    setEditedLatex('');
    setIsDirty(false);

    // Load LaTeX source
    const texPromise = api.getOutput(output.document_id).then(blob => blob.text());
    const pdfPromise = api.getOutputPdf(output.document_id);

    try {
      const tex = await texPromise;
      setEditedLatex(tex);
    } catch {
      toast.error('Failed to load LaTeX source');
    }

    try {
      const blob = await pdfPromise;
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPdfError(apiErr ? apiErr.message : 'PDF compilation failed');
      setPdfErrorDetail(apiErr?.detail ?? null);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (isDirty && !confirm('You have unsaved changes. Close anyway?')) return;
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    setPreviewOpen(false);
    setPreviewOutput(null);
    setPreviewPdfUrl(null);
    setPdfError(null);
    setPdfErrorDetail(null);
    setEditedLatex('');
    setIsDirty(false);
    setPreviewTab('pdf');
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

  const handleSave = async () => {
    if (!previewOutput || !isDirty) return;
    setIsSaving(true);
    try {
      await api.updateOutput(previewOutput.document_id, editedLatex);
      setIsDirty(false);
      setPdfError(null);
      toast.success('Output saved');
      fetchPdf(previewOutput.document_id);
    } catch {
      toast.error('Failed to save output');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async (output: Output) => {
    try {
      const blob = await api.getOutputPdf(output.document_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${output.original_filename.replace(/\.[^.]+$/, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  const handleDownloadTex = async (output: Output) => {
    try {
      const blob = await api.getOutput(output.document_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${output.original_filename.replace(/\.[^.]+$/, '')}.tex`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download .tex file');
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
      <div>
        <h1 className="text-2xl font-semibold">Generated CVs</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse, preview, and download generated outputs</p>
      </div>

      {outputs.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-card">
          <FileOutput className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No generated outputs yet</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Filename</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Template</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map((output, i) => (
                <tr key={output.id} className={i > 0 ? 'border-t' : ''}>
                  <td className="px-4 py-3 max-w-0 overflow-hidden">
                    <span className="font-medium truncate block" title={output.original_filename}>
                      {output.original_filename}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{output.template_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{output.document_type_label}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(output.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handlePreview(output)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(output)}>
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadTex(output)}>
                        <Download className="h-4 w-4 mr-1" />
                        .tex
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={handleClosePreview}>
        <DialogContent className={previewTab === 'split' ? 'max-w-[92vw]' : 'max-w-4xl'}>
          <DialogHeader>
            <DialogTitle>
              {previewOutput?.original_filename.replace(/\.[^.]+$/, '') ?? 'Loading…'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 border-b pb-2">
            <Button variant={previewTab === 'pdf' ? 'default' : 'ghost'} size="sm" onClick={() => setPreviewTab('pdf')}>PDF Preview</Button>
            <Button variant={previewTab === 'source' ? 'default' : 'ghost'} size="sm" onClick={() => setPreviewTab('source')}>LaTeX Source</Button>
            <Button variant={previewTab === 'split' ? 'default' : 'ghost'} size="sm" onClick={() => setPreviewTab('split')}>Split</Button>
          </div>
          {previewTab === 'split' ? (
            <div className="flex gap-3 h-[75vh]">
              <textarea
                className="flex-1 bg-muted rounded p-4 text-xs font-mono resize-none border focus:outline-none focus:ring-1 focus:ring-ring"
                value={editedLatex}
                onChange={(e) => { setEditedLatex(e.target.value); setIsDirty(true); }}
                spellCheck={false}
              />
              <div className="flex-1 flex flex-col">
                {pdfLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm rounded border bg-muted/30">Compiling PDF...</div>
                ) : pdfError ? (
                  <div className="space-y-2 overflow-auto">
                    <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{pdfError}</div>
                    {pdfErrorDetail && (
                      <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[30vh] font-mono whitespace-pre-wrap">{pdfErrorDetail}</pre>
                    )}
                  </div>
                ) : previewPdfUrl ? (
                  <iframe src={previewPdfUrl} className="w-full h-full rounded border" title="PDF Preview" />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm rounded border bg-muted/30">Save to recompile</div>
                )}
              </div>
            </div>
          ) : previewTab === 'pdf' ? (
            <div className="w-full h-[70vh]">
              {pdfLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Compiling PDF...</div>
              ) : pdfError ? (
                <div className="space-y-3">
                  <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{pdfError}</div>
                  {pdfErrorDetail && (
                    <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[40vh] font-mono whitespace-pre-wrap">{pdfErrorDetail}</pre>
                  )}
                </div>
              ) : previewPdfUrl ? (
                <iframe src={previewPdfUrl} className="w-full h-full rounded border" title="PDF Preview" />
              ) : null}
            </div>
          ) : (
            <textarea
              className="w-full h-[70vh] bg-muted rounded p-4 text-xs font-mono resize-none border focus:outline-none focus:ring-1 focus:ring-ring"
              value={editedLatex}
              onChange={(e) => { setEditedLatex(e.target.value); setIsDirty(true); }}
              spellCheck={false}
            />
          )}
          <DialogFooter>
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
              <div className="flex gap-2">
                {(previewTab === 'source' || previewTab === 'split') && !!pdfError && (
                  <Button
                    variant="destructive" size="sm"
                    onClick={handleFixLatex}
                    disabled={isFixing || isSaving}
                  >
                    {isFixing ? 'Fixing…' : 'Fix Errors'}
                  </Button>
                )}
                {(previewTab === 'source' || previewTab === 'split') && (
                  <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving || isFixing}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                )}
                {previewOutput && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(previewOutput)}>
                      <Download className="h-4 w-4 mr-1" />
                      Download PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadTex(previewOutput)}>
                      <Download className="h-4 w-4 mr-1" />
                      Download .tex
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
