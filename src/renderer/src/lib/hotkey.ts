const SPECIAL: Record<string, string | null> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Escape: null,
  Esc: null,
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  PrintScreen: 'PrintScreen',
  Pause: 'Pause',
  ScrollLock: 'ScrollLock',
  CapsLock: 'CapsLock',
  ContextMenu: 'Menu',
  '+': 'Plus',
  '-': '-',
  '=': '=',
  ',': ',',
  '.': '.',
  '/': '/',
  ';': ';',
  "'": "'",
  '[': '[',
  ']': ']',
  '\\': '\\',
  '`': '`'
};

const MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

export function eventToAccelerator(event: KeyboardEvent): string | null {
  if (event.key === 'Escape') return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  let key: string | null = null;
  if (event.code.startsWith('Key')) key = event.code.slice(3);
  else if (event.code.startsWith('Digit')) key = event.code.slice(5);
  else if (event.code.startsWith('Numpad') && /^[0-9]$/.test(event.code.slice(6))) key = `num${event.code.slice(6)}`;
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) key = event.key;
  else if (event.key in SPECIAL) key = SPECIAL[event.key];
  else if (event.key.length === 1) key = event.key.toUpperCase();

  if (!key || MODIFIERS.has(event.key)) return null;
  parts.push(key);
  return parts.join('+');
}

export function formatAccelerator(accelerator: string): string {
  if (!accelerator) return 'Not set';
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'Control') return 'Ctrl';
      if (part === 'Command' || part === 'Super') return 'Win';
      if (part === 'PrintScreen') return 'PrtSc';
      if (part === 'Return') return 'Enter';
      return part;
    })
    .join(' + ');
}

export function isModifierOnly(event: KeyboardEvent): boolean {
  return MODIFIERS.has(event.key);
}
