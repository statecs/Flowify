import { cn } from '@/lib/utils';

type Status = 'uploaded' | 'processing' | 'reviewing' | 'accepted' | 'generated';

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  uploaded:   { label: 'Uploaded',   className: 'bg-gray-100 text-gray-700 border-gray-200' },
  processing: { label: 'Processing', className: 'bg-yellow-100 text-yellow-700 border-yellow-200 animate-pulse' },
  reviewing:  { label: 'Reviewing',  className: 'bg-blue-100 text-blue-700 border-blue-200' },
  accepted:   { label: 'Accepted',   className: 'bg-green-100 text-green-700 border-green-200' },
  generated:  { label: 'Generated',  className: 'bg-purple-100 text-purple-700 border-purple-200' },
};

export default function StatusBadge({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.uploaded;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
      config.className
    )}>
      {config.label}
    </span>
  );
}
