import { useState, type DragEvent, type KeyboardEvent } from 'react';

/** Move arr[from] to index `to`, shifting the rest. */
export function moveItem<T>(arr: T[], from: number, to: number) {
  if (from === to || to < 0 || to >= arr.length) return;
  arr.splice(to, 0, ...arr.splice(from, 1));
}

/**
 * Drag-to-reorder for one list. Spread `row(i, className)` on each item and `handle(i)` on its grip; only the grip
 * starts a drag so inputs inside the row keep normal text selection. The grip also takes ↑/↓ from the keyboard.
 */
export function useDragSort(move: (from: number, to: number) => void, count: number) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  const state = (i: number) =>
    !drag ? '' : i === drag.from ? 'dragging' : i !== drag.over ? '' : drag.from < i ? 'drop-after' : 'drop-before';

  /** `className` is merged with the row's drag state, so pass it here rather than alongside the spread. */
  const row = (i: number, className = '') => ({
    'data-sort-row': '',
    className: `${className} ${state(i)}`.trim() || undefined,
    onDragOver(e: DragEvent) {
      if (!drag) return; // a drag from some other list
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (drag.over !== i) setDrag({ ...drag, over: i });
    },
    onDrop(e: DragEvent) {
      if (!drag) return;
      e.preventDefault();
      if (drag.from !== i) move(drag.from, i);
      setDrag(null);
    },
  });

  const handle = (i: number) => ({
    className: 'grip',
    draggable: true,
    tabIndex: 0,
    role: 'button',
    title: 'Drag to reorder',
    'aria-label': 'Reorder (drag, or use arrow keys)',
    onDragStart(e: DragEvent<HTMLElement>) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // Firefox won't start a drag without data
      const r = e.currentTarget.closest('[data-sort-row]');
      if (r) e.dataTransfer.setDragImage(r, 12, 12);
      setDrag({ from: i, over: i });
    },
    onDragEnd() {
      setDrag(null);
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
      if (to < 0 || to >= count) return;
      e.preventDefault();
      const el = e.currentTarget;
      move(i, to);
      requestAnimationFrame(() => el.focus()); // React may re-insert the row, dropping focus
    },
  });

  return { row, handle };
}
