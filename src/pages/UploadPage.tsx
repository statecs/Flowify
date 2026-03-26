import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, DocumentType } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_SIZE_MB = 50;

export default function UploadPage() {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getDocumentTypes().then(types => {
      setDocumentTypes(types);
      // Default to CV
      const cv = types.find(t => t.name === 'cv');
      if (cv) setSelectedType(cv.id);
    }).catch(() => toast.error('Failed to load document types'));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const validateAndSetFile = (f: File) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
      'text/rtf',
      'text/plain',
      'image/png',
      'image/jpeg'
    ];
    if (!allowed.includes(f.type)) {
      toast.error('Unsupported file type. Accepted: PDF, DOCX, DOC, ODT, RTF, TXT, PNG, JPG');
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_SIZE_MB}MB`);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file || !selectedType) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type_id', selectedType);
      const result = await api.uploadDocument(formData);
      toast.success('Document uploaded — processing started');
      navigate('/');
      void result;
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload Document</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload a document or image for AI extraction</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Document Type</Label>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger>
              <SelectValue placeholder="Select document type..." />
            </SelectTrigger>
            <SelectContent>
              {documentTypes.map(dt => (
                <SelectItem key={dt.id} value={dt.id}>{dt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>File</Label>
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              file && 'border-green-400 bg-green-50'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  className="ml-2 p-1 rounded hover:bg-muted"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or <span className="text-primary underline">browse</span>
                </p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, DOC, ODT, RTF, TXT, PNG, JPG — max {MAX_SIZE_MB}MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.doc,.odt,.rtf,.txt,.png,.jpg,.jpeg"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSetFile(f); }}
          />
        </div>

        <Button
          className="w-full"
          disabled={!file || !selectedType || uploading}
          onClick={handleUpload}
        >
          {uploading ? 'Uploading...' : 'Upload & Extract'}
        </Button>
      </div>
    </div>
  );
}
