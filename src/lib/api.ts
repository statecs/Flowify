const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5073';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const key = localStorage.getItem('flowify_api_key') || '';
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

async function requestFile(path: string): Promise<Blob> {
  const key = localStorage.getItem('flowify_api_key') || '';
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'x-api-key': key },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText, body.detail);
  }

  return res.blob();
}

export const api = {
  // Document types
  getDocumentTypes: () => request<DocumentType[]>('/api/document-types'),

  // Templates
  getTemplates: (document_type_id?: string) => {
    const qs = document_type_id ? `?document_type_id=${document_type_id}` : '';
    return request<Template[]>(`/api/templates${qs}`);
  },
  getTemplate: (id: string) => request<Template>(`/api/templates/${id}`),
  createTemplate: (data: FormData) => {
    const key = localStorage.getItem('flowify_api_key') || '';
    return fetch(`${API_URL}/api/templates`, {
      method: 'POST',
      headers: { 'x-api-key': key },
      body: data,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || res.statusText);
      }
      return res.json() as Promise<Template>;
    });
  },
  deleteTemplate: (id: string) =>
    request<{ success: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),
  setTemplateDefault: (id: string) =>
    request<Template>(`/api/templates/${id}/set-default`, { method: 'PATCH' }),
  getTemplatePdfPreview: (id: string) => requestFile(`/api/templates/${id}/preview-pdf`),

  // Documents
  uploadDocument: (data: FormData) => {
    const key = localStorage.getItem('flowify_api_key') || '';
    return fetch(`${API_URL}/api/documents/upload`, {
      method: 'POST',
      headers: { 'x-api-key': key },
      body: data,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || res.statusText);
      }
      return res.json() as Promise<{ id: string; status: string }>;
    });
  },
  getDocuments: (params?: { page?: number; limit?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    return request<DocumentsResponse>(`/api/documents?${qs}`);
  },
  getDocument: (id: string) => request<DocumentDetail>(`/api/documents/${id}`),
  deleteDocument: (id: string) =>
    request<{ success: boolean }>(`/api/documents/${id}`, { method: 'DELETE' }),
  getPageImage: (documentId: string, pageNumber: number) =>
    requestFile(`/api/documents/${documentId}/pages/${pageNumber}/image`),
  updateExtraction: (id: string, fields: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/documents/${id}/extraction`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    }),
  acceptDocument: (id: string, template_id: string) =>
    request<{ latex_content: string }>(`/api/documents/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ template_id }),
    }),
  getOutput: (id: string) => requestFile(`/api/documents/${id}/output`),
  reprocessDocument: (id: string) =>
    request<{ id: string; status: string }>(`/api/documents/${id}/reprocess`, { method: 'POST' }),
};

// Types
export interface DocumentType {
  id: string;
  name: string;
  label: string;
  field_schema: FieldDefinition[];
  created_at: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'json_array' | 'string_array' | 'json_object';
  required?: boolean;
  item_schema?: FieldDefinition[];
  object_keys?: { key: string; label: string }[];
}

export interface Template {
  id: string;
  document_type_id: string;
  name: string;
  description: string | null;
  latex_content?: string;
  is_default: number;
  created_at: string;
}

export interface DocumentSummary {
  id: string;
  document_type_id: string;
  document_type_name: string;
  document_type_label: string;
  original_filename: string;
  file_mime: string;
  file_size: number;
  page_count: number;
  status: 'uploaded' | 'processing' | 'reviewing' | 'accepted' | 'generated';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentPage {
  id: string;
  page_number: number;
  width: number | null;
  height: number | null;
}

export interface Extraction {
  id: string;
  document_id: string;
  raw_text: string | null;
  fields: Record<string, unknown>;
  status: 'pending' | 'reviewing' | 'accepted';
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentSummary {
  field_schema: FieldDefinition[];
  pages: DocumentPage[];
  extraction: Extraction | null;
}

export interface DocumentsResponse {
  data: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
