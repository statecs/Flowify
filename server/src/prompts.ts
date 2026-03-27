export interface FieldDefinition {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  item_schema?: FieldDefinition[];
  object_keys?: { key: string; label: string }[];
}

export function buildExtractionSystem(fieldSchema: FieldDefinition[]): string {
  const fieldDescriptions = fieldSchema.map(f => {
    let desc = `- ${f.key} (${f.label}): `;
    if (f.type === 'text') desc += 'string (null if missing)';
    else if (f.type === 'textarea') desc += 'string (null if missing)';
    else if (f.type === 'string_array') desc += 'array of strings ([] if missing)';
    else if (f.type === 'json_array') {
      const subFields = f.item_schema?.map(sf => sf.key).join(', ') || '';
      desc += `array of objects with fields: {${subFields}} ([] if missing)`;
    } else if (f.type === 'json_object') {
      const objKeys = f.object_keys?.map(ok => ok.key).join(', ') || 'dynamic keys';
      desc += `object with keys: {${objKeys}} (null if missing)`;
    }
    return desc;
  }).join('\n');

  return `You are a document data extraction specialist. Extract the following fields from the provided document and return ONLY valid JSON with no other text, no markdown, no code fences.

Fields to extract:
${fieldDescriptions}

Rules:
- Return null for missing scalar fields
- Return [] for missing array fields
- Preserve exact text from the document, do not paraphrase or summarize
- For work experience and education, extract ALL entries found
- For skills in a CV, group them by category using the keys: Methods, Tools, Tech, Standards, Languages (spoken/human languages only — not programming languages). The document may be in any language — map localized headings to these English keys semantically (e.g. Swedish: Metodik→Methods, Verktyg→Tools, Programmeringsspråk→Tech, Databaser→Tech, Operativsystem→Tech, Övrigt→Standards, Språk→Languages)
- The document may be written in any language. Always map section headings and field labels to their English equivalents semantically — do not skip sections just because their headings are not in English
- For description and summary fields, include ALL paragraphs verbatim — never truncate or summarise multi-paragraph content`;
}

export function buildExtractionUser(rawText: string): string {
  const truncated = rawText.slice(0, 32000);
  return `Please extract the structured data from this document:\n\n${truncated}`;
}
