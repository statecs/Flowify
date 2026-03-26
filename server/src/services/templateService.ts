import crypto from 'crypto';
import { pool, RowDataPacket } from '../db';
import { logger } from '../logger';

function escapeLatex(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function renderBlock(template: string, item: any): string {
  // Replace simple {{key}} placeholders
  return template.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (_match, key) => {
    // Handle nested like {{skills_Methods}}
    const parts = key.split('_');
    if (parts.length === 2 && typeof item === 'object' && item !== null) {
      const topKey = parts[0];
      const subKey = parts[1];
      if (item[topKey] && typeof item[topKey][subKey] !== 'undefined') {
        return escapeLatex(String(item[topKey][subKey]));
      }
    }
    const val = item[key];
    if (val === null || val === undefined) return '';
    return escapeLatex(String(val));
  });
}

export async function renderTemplate(templateId: string, fields: any): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT latex_content FROM templates WHERE id = ?',
    [templateId]
  );

  if (rows.length === 0) throw new Error(`Template ${templateId} not found`);

  let latex = rows[0].latex_content;

  // Handle {{#array_key}}...{{/array_key}} blocks
  latex = latex.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, blockBody) => {
    const arrayVal = fields[key];
    if (!Array.isArray(arrayVal) || arrayVal.length === 0) return '';

    return arrayVal.map((item: any) => {
      let rendered = blockBody;

      // Handle nested {{#bullet_points}}...{{/bullet_points}} within item
      rendered = rendered.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m2: string, subKey: string, subBody: string) => {
        const subArray = item[subKey];
        if (!Array.isArray(subArray) || subArray.length === 0) return '';
        return subArray.map((subItem: any) => {
          return subBody.replace(/\{\{\.?\}\}/g, () => escapeLatex(String(subItem)));
        }).join('');
      });

      return renderBlock(rendered, item);
    }).join('');
  });

  // Handle skills object: {{skills_Methods}}, {{skills_Tools}}, etc.
  if (fields.skills && typeof fields.skills === 'object') {
    for (const [skillKey, skillVal] of Object.entries(fields.skills)) {
      latex = latex.replace(
        new RegExp(`\\{\\{skills_${skillKey}\\}\\}`, 'g'),
        escapeLatex(String(skillVal || ''))
      );
    }
  }

  // Replace remaining scalar {{key}} placeholders
  latex = latex.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const val = fields[key];
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.map(v => escapeLatex(String(v))).join(', ');
    return escapeLatex(String(val));
  });

  return latex;
}

export async function saveOutput(documentId: string, templateId: string, latexContent: string): Promise<string> {
  const outputId = crypto.randomUUID();

  // Delete any existing output for this document
  await pool.execute('DELETE FROM outputs WHERE document_id = ?', [documentId]);

  await pool.execute(
    'INSERT INTO outputs (id, document_id, template_id, latex_content) VALUES (?, ?, ?, ?)',
    [outputId, documentId, templateId, latexContent]
  );

  logger.log(`[Template] Saved output ${outputId} for document ${documentId}`);
  return outputId;
}
