import { Loader2 } from 'lucide-react';

export function LoadingState({ children }: { children: string }) {
  return (
    <section className="center-state" aria-live="polite">
      <Loader2 className="spin" size={28} aria-hidden />
      <p>{children}</p>
    </section>
  );
}
