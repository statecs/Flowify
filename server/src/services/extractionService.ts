import fs from 'fs';
import crypto from 'crypto';
import { pool, RowDataPacket } from '../db';
import { callOpenAIVision } from '../ai';
import { buildExtractionSystem, buildExtractionUser, FieldDefinition } from '../prompts';
import { logger } from '../logger';

export async function extract(documentId: string, rawText: string, imagePaths: string[]): Promise<void> {
  // Fetch document type field schema
  const [docRows] = await pool.query<RowDataPacket[]>(
    `SELECT dt.field_schema FROM documents d JOIN document_types dt ON d.document_type_id = dt.id WHERE d.id = ?`,
    [documentId]
  );

  if (docRows.length === 0) throw new Error(`Document ${documentId} not found`);

  const fieldSchema: FieldDefinition[] = typeof docRows[0].field_schema === 'string'
    ? JSON.parse(docRows[0].field_schema)
    : docRows[0].field_schema;

  const systemPrompt = buildExtractionSystem(fieldSchema);

  // Build content parts for vision API
  const contentParts: any[] = [
    { type: 'text', text: buildExtractionUser(rawText) }
  ];

  // Add up to 5 page images as base64
  const imagesToUse = imagePaths.slice(0, 5);
  for (const imgPath of imagesToUse) {
    try {
      const imgBuffer = fs.readFileSync(imgPath);
      const base64 = imgBuffer.toString('base64');
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${base64}`,
          detail: 'high'
        }
      });
    } catch (e) {
      logger.error(`[Extraction] Failed to read image ${imgPath}:`, e);
    }
  }

  logger.log(`[Extraction] Calling OpenAI Vision for document ${documentId} with ${imagesToUse.length} images`);

  const result = await callOpenAIVision(systemPrompt, contentParts, 16000);

  let fields: any;
  try {
    fields = JSON.parse(result.outputText);
  } catch (e) {
    logger.error('[Extraction] Failed to parse AI JSON response:', result.outputText);
    throw new Error('AI returned invalid JSON');
  }

  const extractionId = crypto.randomUUID();

  // Upsert extraction
  await pool.execute(
    `INSERT INTO extractions (id, document_id, raw_text, fields, status, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)
     ON DUPLICATE KEY UPDATE
       raw_text = VALUES(raw_text),
       fields = VALUES(fields),
       status = 'pending',
       input_tokens = VALUES(input_tokens),
       output_tokens = VALUES(output_tokens),
       updated_at = CURRENT_TIMESTAMP`,
    [extractionId, documentId, rawText.slice(0, 65535), JSON.stringify(fields), result.inputTokens, result.outputTokens]
  );

  logger.log(`[Extraction] Saved extraction for document ${documentId}. Tokens: ${result.inputTokens}/${result.outputTokens}`);
}
