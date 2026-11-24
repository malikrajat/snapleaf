import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useToasts } from '../lib/toast';

export function Toaster() {
  const items = useToasts();
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          {item.kind === 'success' ? <CheckCircle2 size={18} /> : item.kind === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
