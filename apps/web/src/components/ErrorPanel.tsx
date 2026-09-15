import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ApiFailure } from '../api/client';

export const asApiFailure = (error: unknown): ApiFailure | null => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return error as ApiFailure;
};

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const failure = asApiFailure(error);
  if (!failure || failure.kind === 'aborted') return null;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} aria-hidden />
      <div>
        <strong>{failure.message}</strong>
        <span>
          {failure.code}
          {failure.requestId ? ` · ${failure.requestId}` : ''}
        </span>
      </div>
      {onRetry ? (
        <button className="ghost-button" type="button" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden />
          Повторить
        </button>
      ) : null}
    </div>
  );
}
