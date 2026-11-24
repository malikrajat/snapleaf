import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function publish(): void {
  for (const listener of listeners) listener([...items]);
}

export function toast(message: string, kind: ToastKind = 'info', duration = 3200): void {
  const id = nextId++;
  items = [...items, { id, message, kind }];
  publish();
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    publish();
  }, duration);
}

export function useToasts(): ToastItem[] {
  const [value, setValue] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
