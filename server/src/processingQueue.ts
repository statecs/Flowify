import { logger } from './logger';

type Job = () => Promise<void>;

interface QueueEntry {
  job: Job;
  documentId: string;
}

const queue: QueueEntry[] = [];
const running = new Set<string>();

export function enqueue(documentId: string, job: Job): void {
  if (running.has(documentId)) {
    logger.log(`[Queue] Document ${documentId} already processing, skipping`);
    return;
  }
  queue.push({ job, documentId });
  logger.log(`[Queue] Enqueued document ${documentId}, queue size: ${queue.length}`);
  setImmediate(processNext);
}

async function processNext(): Promise<void> {
  const entry = queue.shift();
  if (!entry) return;

  const { job, documentId } = entry;
  running.add(documentId);
  logger.log(`[Queue] Starting job for document ${documentId}`);

  try {
    await job();
    logger.log(`[Queue] Completed job for document ${documentId}`);
  } catch (error) {
    logger.error(`[Queue] Job failed for document ${documentId}:`, error);
  } finally {
    running.delete(documentId);
    if (queue.length > 0) {
      setImmediate(processNext);
    }
  }
}

export function isProcessing(documentId: string): boolean {
  return running.has(documentId);
}
