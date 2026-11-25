import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Circle,
  Copy,
  Eraser,
  ExternalLink,
  Hand,
  Highlighter,
  Lasso,
  LayoutGrid,
  ListOrdered,
  Maximize2,
  Minus,
  Palette,
  PenLine,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  X
} from 'lucide-react';
import type { CaptureAction, OverlayInit, SelectionRect } from '@shared/types';
import { COLOR_SWATCHES } from '@shared/settings';
import { clamp } from '@shared/geometry';
import {
  annotationHit,
  contrastColor,
  drawAnnotation,
  nextStepNumber,
  normalizeRect,
  uid,
  type Annotation,
  type TextAnnotation
} from '../lib/annotations';
import { api, errorMessage } from '../lib/api';
import { Spinner } from '../components/Spinner';

interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

type Point = { x: number; y: number };
type InlineTool = 'move' | 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'marker' | 'text' | 'step' | 'blur' | 'eraser';
type SelectionShape = 'rect' | 'ellipse' | 'lasso';
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w';
type Panel = 'color' | 'size' | null;

const SELECTION_MODES: Array<{ id: SelectionShape; label: string; icon: typeof Square }> = [
  { id: 'rect', label: 'Rectangle selection', icon: Square },
  { id: 'ellipse', label: 'Ellipse selection', icon: Circle },
  { id: 'lasso', label: 'Freehand lasso selection', icon: Lasso }
];

function pointsBBox(points: Point[]): SelectionRect {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(0, Math.max(...xs) - minX),
    height: Math.max(0, Math.max(...ys) - minY)
  };
}

function traceSelectionPath(
  ctx: CanvasRenderingContext2D,
  shape: SelectionShape,
  selection: SelectionRect,
  lassoPoints: Point[]
): void {
  ctx.beginPath();
  if (shape === 'rect') {
    ctx.rect(selection.x, selection.y, selection.width, selection.height);
  } else if (shape === 'ellipse') {
    ctx.ellipse(
      selection.x + selection.width / 2,
      selection.y + selection.height / 2,
      selection.width / 2,
      selection.height / 2,
      0,
      0,
      Math.PI * 2
    );
  } else if (lassoPoints.length > 2) {
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let index = 1; index < lassoPoints.length; index += 1) {
      ctx.lineTo(lassoPoints[index].x, lassoPoints[index].y);
    }
    ctx.closePath();
  }
}

interface ResizeState {
  handle: Handle;
  initial: SelectionRect;
}

interface MoveDragState {
  start: Point;
  initial: SelectionRect;
}

const INLINE_TOOLS: Array<{ id: InlineTool; label: string; icon: typeof PenLine; shortcut: string }> = [
  { id: 'move', label: 'Move', icon: Hand, shortcut: 'H' },
  { id: 'pen', label: 'Pen', icon: PenLine, shortcut: 'P' },
  { id: 'line', label: 'Line', icon: Minus, shortcut: 'L' },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight, shortcut: 'A' },
  { id: 'rect', label: 'Box', icon: Square, shortcut: 'R' },
  { id: 'ellipse', label: 'Circle', icon: Circle, shortcut: 'O' },
  { id: 'marker', label: 'Marker', icon: Highlighter, shortcut: 'M' },
  { id: 'text', label: 'Text', icon: Type, shortcut: 'T' },
  { id: 'step', label: 'Step', icon: ListOrdered, shortcut: 'S' },
  { id: 'blur', label: 'Pixelate', icon: LayoutGrid, shortcut: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, shortcut: 'E' }
];

function relativeRect(start: Point, end: Point, viewport: Viewport): SelectionRect {
  const x = clamp(Math.min(start.x, end.x), 0, viewport.width);
  const y = clamp(Math.min(start.y, end.y), 0, viewport.height);
  const right = clamp(Math.max(start.x, end.x), 0, viewport.width);
  const bottom = clamp(Math.max(start.y, end.y), 0, viewport.height);
  return { x, y, width: right - x, height: bottom - y };
}

function clampToRect(point: Point, rect: SelectionRect): Point {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height)
  };
}

function pointInRect(point: Point, rect: SelectionRect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function handlePoints(rect: SelectionRect): Array<{ id: Handle; point: Point }> {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const middleX = left + rect.width / 2;
  const middleY = top + rect.height / 2;
  return [
    { id: 'nw', point: { x: left, y: top } },
    { id: 'ne', point: { x: right, y: top } },
    { id: 'sw', point: { x: left, y: bottom } },
    { id: 'se', point: { x: right, y: bottom } },
    { id: 'n', point: { x: middleX, y: top } },
    { id: 'e', point: { x: right, y: middleY } },
    { id: 's', point: { x: middleX, y: bottom } },
    { id: 'w', point: { x: left, y: middleY } }
  ];
}

function handleAt(point: Point, rect: SelectionRect, radius = 13): Handle | null {
  for (const handle of handlePoints(rect)) {
    if (Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= radius) return handle.id;
  }
  return null;
}

function cursorForHandle(handle: Handle): string {
  if (handle === 'nw' || handle === 'se') return 'nwse-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  if (handle === 'n' || handle === 's') return 'ns-resize';
  return 'ew-resize';
}

function resizeSelection(handle: Handle, initial: SelectionRect, target: Point, viewport: Viewport): SelectionRect {
  const min = 16;
  let left = initial.x;
  let top = initial.y;
  let right = initial.x + initial.width;
  let bottom = initial.y + initial.height;

  if (handle.includes('w')) left = clamp(target.x, 0, Math.max(0, right - min));
  if (handle.includes('e')) right = clamp(target.x, Math.min(left + min, viewport.width), viewport.width);
  if (handle.includes('n')) top = clamp(target.y, 0, Math.max(0, bottom - min));
  if (handle.includes('s')) bottom = clamp(target.y, Math.min(top + min, viewport.height), viewport.height);

  left = clamp(left, 0, Math.max(0, viewport.width - min));
  top = clamp(top, 0, Math.max(0, viewport.height - min));
  right = clamp(right, left + min, viewport.width);
  bottom = clamp(bottom, top + min, viewport.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 23);
  ctx.lineTo(5.5, 18);
  ctx.lineTo(9.5, 27);
  ctx.lineTo(13.5, 25.2);
  ctx.lineTo(9.5, 16.5);
  ctx.lineTo(16.5, 16.5);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(0,0,0,.85)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

/**
 * The overlay window is pre-created and reused across captures. The gate waits
 * for the main process to push a session into it, then mounts a fresh
 * OverlaySession keyed by the session id so no state leaks between captures.
 */
export function OverlayPage() {
  const [init, setInit] = useState<OverlayInit | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const off = api.capture.onInit((value) => {
      if (alive) setInit(value);
    });
    api.capture
      .getOverlayInit()
      .then((value) => {
        if (alive) setInit((current) => current ?? value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!ready || !init) return <div className="overlay-idle" aria-hidden="true" />;
  return <OverlaySession key={init.sessionId} initial={init} />;
}

function OverlaySession({ initial }: { initial: OverlayInit }) {
  const [init, setInit] = useState<OverlayInit | null>(initial);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1
  });
  const [cursor, setCursor] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionShape>('rect');
  const [selectionShape, setSelectionShape] = useState<SelectionShape>('rect');
  const [lassoPending, setLassoPending] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoDrawing, setLassoDrawing] = useState(false);
  const [selectionDrag, setSelectionDrag] = useState<{ start: Point } | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [tool, setTool] = useState<InlineTool>('move');
  const [color, setColor] = useState('#ff3b30');
  const [stroke, setStroke] = useState(4);
  const [fontSize, setFontSize] = useState(24);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; value: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationStart = useRef<Point | null>(null);
  const erasing = useRef(false);
  const eraseSnapshot = useRef<Annotation[] | null>(null);
  const cancelTextRef = useRef(false);
  const textFocused = useRef(false);
  const readySent = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.resolve(initial)
      .then((value) => {
        if (!alive) return;
        setInit(value);
        const editor = value.settings.editor;
        setColor(editor.defaultColor);
        setStroke(editor.defaultWidth);
        // The inline overlay starts with the hand so a new selection can be
        // repositioned immediately. Markup tools are opt-in from the rail.
        setTool('move');
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          setImage(img);
          if (value.lastRegion) {
            const rect = value.lastRegion;
            const x = clamp(rect.x, 0, Math.max(0, value.display.bounds.width - 1));
            const y = clamp(rect.y, 0, Math.max(0, value.display.bounds.height - 1));
            setSelection({
              x,
              y,
              width: clamp(rect.width, 1, value.display.bounds.width - x),
              height: clamp(rect.height, 1, value.display.bounds.height - y)
            });
            setSelectionShape('rect');
            setLassoPoints([]);
          }
        };
        img.onerror = () => setError('The captured image could not be loaded.');
        img.src = value.imageDataUrl;
      })
      .catch((reason) => setError(errorMessage(reason)));
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const scaleX = image && viewport.width ? image.naturalWidth / viewport.width : 1;
  const scaleY = image && viewport.height ? image.naturalHeight / viewport.height : 1;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !init) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.fillStyle = `rgba(5, 8, 12, ${init.settings.capture.dimOpacity})`;
    ctx.fillRect(0, 0, width, height);

    if (selection && selection.width > 0 && selection.height > 0) {
      const shape = lassoDrawing ? 'lasso' : selectionShape;
      const hasPath = shape !== 'lasso' || lassoPoints.length > 2;
      if (hasPath) {
        ctx.save();
        traceSelectionPath(ctx, shape, selection, lassoPoints);
        ctx.clip();
        ctx.drawImage(image, 0, 0, width, height);
        for (const annotation of annotations) drawAnnotation(ctx, annotation);
        if (draft) drawAnnotation(ctx, draft);
        ctx.restore();

        ctx.save();
        ctx.setLineDash([5, 4]);
        traceSelectionPath(ctx, shape, selection, lassoPoints);
        ctx.strokeStyle = 'rgba(0,0,0,.72)';
        ctx.lineWidth = 2;
        ctx.stroke();
        traceSelectionPath(ctx, shape, selection, lassoPoints);
        ctx.strokeStyle = 'rgba(255,255,255,.98)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      if (!lassoDrawing && selectionShape !== 'lasso') {
        // Four corner squares plus four edge-wall squares. The dark plate keeps
        // every square readable on both light and dark screenshots.
        const handle = 8;
        for (const { point: handlePoint } of handlePoints(selection)) {
          ctx.fillStyle = 'rgba(0,0,0,.75)';
          ctx.fillRect(handlePoint.x - handle / 2 - 2, handlePoint.y - handle / 2 - 2, handle + 4, handle + 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(handlePoint.x - handle / 2, handlePoint.y - handle / 2, handle, handle);
        }
      }
    }
  }, [annotations, draft, image, init, lassoDrawing, lassoPoints, selection, selectionShape]);

  useEffect(() => {
    draw();
  }, [draw, viewport]);

  useEffect(() => {
    if (!image || !init || readySent.current) return;
    draw();
    readySent.current = true;
    // Do not wait on requestAnimationFrame: the pre-warmed overlay is hidden
    // until this signal arrives, and Chromium does not run frames for hidden windows.
    void api.capture.overlayReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, init, draw]);

  useEffect(() => {
    if (textEditor && !textFocused.current) {
      textFocused.current = true;
      const element = document.querySelector<HTMLTextAreaElement>('.inline-text-editor');
      element?.focus();
      element?.select();
    } else if (!textEditor) {
      textFocused.current = false;
    }
  }, [textEditor]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => ({
    x: clamp(event.clientX, 0, window.innerWidth),
    y: clamp(event.clientY, 0, window.innerHeight)
  });

  const cursorStyle = useMemo(() => {
    if (!selection) return 'crosshair';
    if (lassoPending) return 'crosshair';
    if (tool === 'eraser') return pointInRect(cursor, selection) ? 'cell' : 'default';
    if (selectionShape === 'lasso') return pointInRect(cursor, selection) ? 'crosshair' : 'default';
    const handle = handleAt(cursor, selection);
    if (handle) return cursorForHandle(handle);
    if (moveDrag) return 'grabbing';
    if (tool === 'move') return pointInRect(cursor, selection) ? 'grab' : 'default';
    return pointInRect(cursor, selection) ? 'crosshair' : 'default';
  }, [cursor, lassoPending, moveDrag, selection, selectionShape, tool]);

  const eraseAt = (at: Point) => {
    if (!selection) return;
    const hits = annotations.filter((annotation) => annotationHit(at, annotation, 10));
    if (!hits.length) return;
    if (!eraseSnapshot.current) {
      eraseSnapshot.current = annotations;
      setPast((value) => [...value, annotations].slice(-40));
      setFuture([]);
    }
    const ids = new Set(hits.map((annotation) => annotation.id));
    setAnnotations((value) => value.filter((annotation) => !ids.has(annotation.id)));
  };

  const beginSelection = (p: Point, event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setTextEditor(null);
    setLassoPending(false);
    setAnnotations([]);
    setPast([]);
    setFuture([]);
    setDraft(null);
    setPanel(null);
    if (selectionMode === 'lasso') {
      setSelectionShape('lasso');
      setLassoPoints([p]);
      setLassoDrawing(true);
      setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
      return;
    }
    setSelectionShape(selectionMode);
    setLassoPoints([]);
    setSelectionDrag({ start: p });
    setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (submitting || event.button !== 0) return;
    const p = point(event);
    setCursor(p);
    setPanel(null);
    if (lassoPending) {
      beginSelection(p, event);
      return;
    }
    if (!selection || selection.width < 4 || selection.height < 4) {
      beginSelection(p, event);
      return;
    }

    const handle = selectionShape === 'lasso' ? null : handleAt(p, selection);
    if (handle) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setResize({ handle, initial: selection });
      return;
    }

    if (!pointInRect(p, selection)) {
      // A remembered region can be tiny or stale. With no markup yet, dragging
      // outside it should start a fresh selection instead of doing nothing.
      if (!annotations.length) beginSelection(p, event);
      return;
    }
    if (tool === 'move') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setMoveDrag({ start: p, initial: selection });
      return;
    }
    if (tool === 'text') {
      setCursor(p);
      return;
    }
    if (tool === 'step') {
      const radius = Math.max(11, Math.min(18, stroke * 3));
      const margin = radius + 2;
      const x =
        selection.width > margin * 2
          ? clamp(p.x, selection.x + margin, selection.x + selection.width - margin)
          : selection.x + selection.width / 2;
      const y =
        selection.height > margin * 2
          ? clamp(p.y, selection.y + margin, selection.y + selection.height - margin)
          : selection.y + selection.height / 2;
      commit({
        id: uid(),
        type: 'step',
        x,
        y,
        number: nextStepNumber(annotations),
        color,
        radius
      });
      return;
    }
    if (tool === 'eraser') {
      event.currentTarget.setPointerCapture(event.pointerId);
      erasing.current = true;
      eraseSnapshot.current = null;
      eraseAt(p);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const start = clampToRect(p, selection);
    annotationStart.current = start;
    if (tool === 'pen' || tool === 'marker') {
      setDraft({ id: uid(), type: 'path', tool, points: [start], color, width: stroke });
    } else if (tool === 'blur') {
      setDraft({
        id: uid(),
        type: 'shape',
        shape: 'rect',
        start,
        end: start,
        color: '#1e90ff',
        width: 2,
        dashed: true
      });
    } else {
      setDraft({ id: uid(), type: 'shape', shape: tool, start, end: start, color, width: stroke });
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = point(event);
    setCursor(p);
    if (lassoDrawing) {
      if ((event.buttons & 1) === 0) return;
      const last = lassoPoints[lassoPoints.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) {
        const next = [...lassoPoints, p];
        setLassoPoints(next);
        setSelection(pointsBBox(next));
      }
      return;
    }
    if (selectionDrag) {
      setSelection(relativeRect(selectionDrag.start, p, viewport));
      return;
    }
    if (moveDrag) {
      const initial = moveDrag.initial;
      setSelection({
        x: clamp(initial.x + p.x - moveDrag.start.x, 0, Math.max(0, viewport.width - initial.width)),
        y: clamp(initial.y + p.y - moveDrag.start.y, 0, Math.max(0, viewport.height - initial.height)),
        width: initial.width,
        height: initial.height
      });
      return;
    }
    if (resize && selection) {
      setSelection(resizeSelection(resize.handle, resize.initial, p, viewport));
      return;
    }
    if (erasing.current) {
      eraseAt(p);
      return;
    }
    if (!annotationStart.current || !selection) return;
    const start = annotationStart.current;
    const current = clampToRect(p, selection);
    if (tool === 'pen' || tool === 'marker') {
      setDraft((value) =>
        value && value.type === 'path' ? { ...value, points: [...value.points, current] } : value
      );
      return;
    }
    setDraft((value) => (value && value.type === 'shape' ? { ...value, start, end: current } : value));
  };

  const finishPointerAt = async (clientX: number, clientY: number) => {
    const p = {
      x: clamp(clientX, 0, window.innerWidth),
      y: clamp(clientY, 0, window.innerHeight)
    };
    if (erasing.current) {
      erasing.current = false;
      eraseSnapshot.current = null;
      return;
    }
    if (lassoDrawing) {
      const next = [...lassoPoints, p];
      setLassoDrawing(false);
      setLassoPoints(next);
      const bbox = pointsBBox(next);
      if (next.length < 3 || bbox.width < 8 || bbox.height < 8) {
        setSelection(null);
        setLassoPoints([]);
      } else {
        setSelection(bbox);
        setSelectionShape('lasso');
        setTool('move');
        setPanel(null);
      }
      return;
    }
    if (selectionDrag) {
      const rect = relativeRect(selectionDrag.start, p, viewport);
      setSelectionDrag(null);
      if (rect.width < 8 || rect.height < 8) setSelection(null);
      else {
        setSelection(rect);
        setSelectionShape(selectionMode);
        setTool('move');
        setPanel(null);
      }
      return;
    }
    if (moveDrag) {
      setMoveDrag(null);
      return;
    }
    if (resize) {
      setResize(null);
      return;
    }
    const start = annotationStart.current;
    annotationStart.current = null;
    if (!start || !selection || !draft) return;
    const current = clampToRect(p, selection);
    if (tool === 'blur') {
      const rect = normalizeRect(start, current);
      setDraft(null);
      if (rect.width >= 8 && rect.height >= 8) await applyPixelate(rect);
      return;
    }
    if (draft.type === 'path') {
      if (draft.points.length < 2) {
        setDraft(null);
        return;
      }
      commit({ ...draft, points: [...draft.points, current] });
      return;
    }
    if (draft.type === 'shape') {
      const rect = normalizeRect(draft.start, current);
      if (Math.max(rect.width, rect.height) < 3) {
        setDraft(null);
        return;
      }
      commit({ ...draft, end: current });
    }
  };

  useEffect(() => {
    const onPointerUp = (event: PointerEvent) => {
      if (selectionDrag || resize || moveDrag || annotationStart.current || erasing.current || lassoDrawing) {
        void finishPointerAt(event.clientX, event.clientY);
      }
    };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionDrag, resize, moveDrag, draft, tool, selection, lassoDrawing, lassoPoints]);

  const commit = (annotation: Annotation) => {
    setPast((value) => [...value, annotations].slice(-40));
    setFuture([]);
    setAnnotations((value) => [...value, annotation]);
    setDraft(null);
  };

  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast((value) => value.slice(0, -1));
    setFuture((value) => [annotations, ...value]);
    setAnnotations(previous);
    setDraft(null);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((value) => value.slice(1));
    setPast((value) => [...value, annotations]);
    setAnnotations(next);
    setDraft(null);
  };

  const clearMarkup = () => {
    if (!annotations.length) return;
    setPast((value) => [...value, annotations]);
    setFuture([]);
    setAnnotations([]);
    setDraft(null);
    setTextEditor(null);
  };

  const applyPixelate = async (rect: SelectionRect): Promise<void> => {
    if (!image) return;
    try {
      const source = document.createElement('canvas');
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      const ctx = source.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      ctx.save();
      ctx.scale(image.naturalWidth / viewport.width, image.naturalHeight / viewport.height);
      for (const annotation of annotations) drawAnnotation(ctx, annotation);
      ctx.restore();
      const sx = image.naturalWidth / viewport.width;
      const sy = image.naturalHeight / viewport.height;
      const physical = {
        x: rect.x * sx,
        y: rect.y * sy,
        width: rect.width * sx,
        height: rect.height * sy
      };
      const block = Math.max(6, Math.round(Math.min(physical.width, physical.height) / 14));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.ceil(physical.width / block));
      small.height = Math.max(1, Math.ceil(physical.height / block));
      const smallCtx = small.getContext('2d');
      if (!smallCtx) return;
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.drawImage(source, physical.x, physical.y, physical.width, physical.height, 0, 0, small.width, small.height);
      const patch = document.createElement('canvas');
      patch.width = Math.max(1, Math.round(physical.width));
      patch.height = Math.max(1, Math.round(physical.height));
      const patchCtx = patch.getContext('2d');
      if (!patchCtx) return;
      patchCtx.imageSmoothingEnabled = false;
      patchCtx.drawImage(small, 0, 0, small.width, small.height, 0, 0, patch.width, patch.height);
      const dataUrl = patch.toDataURL('image/png');
      const patchImage = new Image();
      await new Promise<void>((resolve, reject) => {
        patchImage.onload = () => resolve();
        patchImage.onerror = () => reject(new Error('Could not create the pixelated patch'));
        patchImage.src = dataUrl;
      });
      commit({
        id: uid(),
        type: 'patch',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        image: patchImage,
        dataUrl
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const pendingText = (): TextAnnotation | null => {
    if (!textEditor || !textEditor.value.trim() || !init) return null;
    return {
      id: uid(),
      type: 'text',
      x: textEditor.x,
      y: textEditor.y,
      text: textEditor.value,
      color,
      fontSize,
      fontFamily: init.settings.editor.fontFamily
    };
  };

  const commitText = () => {
    if (!textEditor) return;
    if (cancelTextRef.current) {
      cancelTextRef.current = false;
      setTextEditor(null);
      return;
    }
    const extra = pendingText();
    setTextEditor(null);
    if (extra) commit(extra);
  };

  const renderAnnotatedCrop = useCallback(
    (extra?: Annotation): { dataUrl: string; width: number; height: number } => {
      if (!image || !selection) throw new Error('Select an area first');
      const scaleXRatio = image.naturalWidth / viewport.width;
      const scaleYRatio = image.naturalHeight / viewport.height;
      const outputWidth = Math.max(1, Math.round(selection.width * scaleXRatio));
      const outputHeight = Math.max(1, Math.round(selection.height * scaleYRatio));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the image');
      ctx.imageSmoothingEnabled = true;
      ctx.save();
      if (selectionShape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(outputWidth / 2, outputHeight / 2, outputWidth / 2, outputHeight / 2, 0, 0, Math.PI * 2);
        ctx.clip();
      } else if (selectionShape === 'lasso' && lassoPoints.length > 2) {
        const sx = outputWidth / selection.width;
        const sy = outputHeight / selection.height;
        ctx.beginPath();
        lassoPoints.forEach((item, index) => {
          const x = (item.x - selection.x) * sx;
          const y = (item.y - selection.y) * sy;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.clip();
      }
      ctx.drawImage(
        image,
        selection.x * scaleXRatio,
        selection.y * scaleYRatio,
        selection.width * scaleXRatio,
        selection.height * scaleYRatio,
        0,
        0,
        outputWidth,
        outputHeight
      );
      ctx.scale(outputWidth / selection.width, outputHeight / selection.height);
      ctx.translate(-selection.x, -selection.y);
      for (const annotation of annotations) drawAnnotation(ctx, annotation);
      if (extra) drawAnnotation(ctx, extra);
      ctx.restore();
      if (init?.settings.capture.includeCursor) {
        const localX = (cursor.x - selection.x) * (outputWidth / selection.width);
        const localY = (cursor.y - selection.y) * (outputHeight / selection.height);
        if (localX >= 0 && localY >= 0 && localX < outputWidth && localY < outputHeight) {
          drawCursor(ctx, localX, localY, Math.max(1, outputWidth / selection.width));
        }
      }
      return { dataUrl: canvas.toDataURL('image/png'), width: outputWidth, height: outputHeight };
    },
    [annotations, cursor.x, cursor.y, image, init, lassoPoints, selection, selectionShape, viewport]
  );

  const confirmInline = useCallback(
    async (action: CaptureAction) => {
      if (!init || !image || !selection || submitting) return;
      setSubmitting(true);
      try {
        const extra = pendingText();
        const rendered = renderAnnotatedCrop(extra ?? undefined);
        await api.capture.confirm({
          sessionId: init.sessionId,
          displayId: init.display.id,
          action,
          width: rendered.width,
          height: rendered.height,
          dataUrl: rendered.dataUrl,
          selection
        });
      } catch (reason) {
        setSubmitting(false);
        setError(errorMessage(reason));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [color, fontSize, image, init, selection, submitting, renderAnnotatedCrop, textEditor]
  );

  const cancel = useCallback(() => {
    void api.capture.cancel();
  }, []);

  const redraw = () => {
    setSelection(null);
    setSelectionDrag(null);
    setResize(null);
    setMoveDrag(null);
    setLassoDrawing(false);
    setLassoPending(false);
    setLassoPoints([]);
    setAnnotations([]);
    setPast([]);
    setFuture([]);
    setDraft(null);
    setTextEditor(null);
    setPanel(null);
    annotationStart.current = null;
  };

  const selectFull = () => {
    setSelection({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    setSelectionShape('rect');
    setTool('move');
    setLassoPoints([]);
    setLassoDrawing(false);
    setLassoPending(false);
    setPanel(null);
    setTextEditor(null);
  };

  const chooseSelectionShape = (shape: SelectionShape) => {
    setPanel(null);
    if (shape === 'lasso') {
      setSelectionMode('lasso');
      setLassoPoints([]);
      if (selection) {
        // Keep the current selection visible. The next drag replaces it with a
        // freehand shape, which avoids wiping a rectangle on a single tap.
        setLassoPending(true);
        return;
      }
      setLassoPending(false);
      setSelectionShape('lasso');
      return;
    }
    setLassoPending(false);
    setSelectionMode(shape);
    setSelectionShape(shape);
    setLassoPoints([]);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if (typing) {
        if (event.key === 'Escape' && target?.tagName === 'TEXTAREA') {
          event.preventDefault();
          cancelTextRef.current = true;
          setTextEditor(null);
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          commitText();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (textEditor) {
          cancelTextRef.current = true;
          setTextEditor(null);
        } else if (lassoPending) {
          setLassoPending(false);
        } else if (panel) setPanel(null);
        else if (moveDrag) {
          setSelection(moveDrag.initial);
          setMoveDrag(null);
        } else if (selectionDrag) {
          setSelectionDrag(null);
          setSelection(null);
        } else if (draft) {
          setDraft(null);
          annotationStart.current = null;
        } else {
          cancel();
        }
        return;
      }
      if (!selection) {
        const modeKey = event.key.toLowerCase();
        if (modeKey === 'r' || modeKey === 'o' || modeKey === 'l') {
          event.preventDefault();
          setSelectionMode(modeKey === 'r' ? 'rect' : modeKey === 'o' ? 'ellipse' : 'lasso');
          setLassoPoints([]);
          return;
        }
      }
      if (event.key === 'Enter' && !submitting) {
        event.preventDefault();
        if (!selection) selectFull();
        else void confirmInline('edit');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void confirmInline('copy');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void confirmInline('save');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        void confirmInline('upload');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void confirmInline('print');
        return;
      }
      const found = INLINE_TOOLS.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
      if (found && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setTool(found.id);
        setLassoPending(false);
        setPanel(null);
        return;
      }
      if (event.key === 'f' && !event.ctrlKey && !event.metaKey) {
        selectFull();
        return;
      }
      if (event.key === '[') {
        setStroke((value) => Math.max(1, value - 1));
      } else if (event.key === ']') {
        setStroke((value) => Math.min(40, value + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, draft, lassoPending, moveDrag, panel, past, future, submitting, textEditor, selection, tool, color, stroke, fontSize, viewport]);

  if (error && !init) {
    return (
      <div className="overlay-error">
        <div className="overlay-error-card">
          <h2>Capture unavailable</h2>
          <p>{error}</p>
          <button type="button" className="button primary" onClick={cancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!init || !image) {
    return (
      <div className="overlay-loading">
        <Spinner label="Preparing capture…" />
      </div>
    );
  }

  const hasSelection = Boolean(selection && selection.width >= 8 && selection.height >= 8);
  const showInline = hasSelection && !selectionDrag && !lassoDrawing;
  const RAIL_W = 20;
  const RAIL_H = 322;
  const RAIL_GAP = 4;
  const BAR_W = 161;
  const BAR_H = 20;
  const BAR_GAP = 4;
  const SHAPE_W = 60;
  const SHAPE_H = 20;
  // The shape strip sits a full grab radius above the top edge so reaching for
  // the north-west handle never lands on a shape button instead.
  const SHAPE_GAP = 14;
  const selectionRight = selection ? selection.x + selection.width : 0;
  const selectionBottom = selection ? selection.y + selection.height : 0;

  let railLeft = 0;
  let railTop = 0;
  let actionLeft = 0;
  let actionTop = 0;
  let shapeBarLeft = 12;
  let shapeBarTop = 12;
  if (selection) {
    // Prefer touching the right edge; flip left when the display runs out. The
    // small gap keeps the middle-right resize handle clickable.
    railLeft = selectionRight + RAIL_GAP;
    if (railLeft + RAIL_W > viewport.width) railLeft = selection.x - RAIL_W - RAIL_GAP;
    if (railLeft < 0) railLeft = Math.max(0, selectionRight - RAIL_W - RAIL_GAP);

    // Prefer touching the top edge; settle upward when the selection is low.
    railTop = selection.y;
    if (railTop + RAIL_H > viewport.height) railTop = Math.max(0, selectionBottom - RAIL_H);

    // Prefer touching the bottom edge, then the top edge, then inside. The gap
    // keeps the middle-bottom resize handle clickable.
    actionTop = selectionBottom + BAR_GAP;
    if (actionTop + BAR_H > viewport.height) actionTop = selection.y - BAR_H - BAR_GAP;
    if (actionTop < 0) actionTop = Math.max(0, selectionBottom - BAR_H - BAR_GAP);

    // Right-align under the selection; keep it on screen.
    actionLeft = selectionRight - BAR_W;
    if (actionLeft < 0) actionLeft = 0;
    if (actionLeft + BAR_W > viewport.width) actionLeft = viewport.width - BAR_W;

    // The shape switcher uses the same square, icon-only strip as the rail and
    // the action bar. Keep its left edge on the selection's left edge so the
    // strip still reads as attached to the box.
    shapeBarLeft = clamp(selection.x, 0, Math.max(0, viewport.width - SHAPE_W));
    shapeBarTop =
      selection.y >= SHAPE_H + SHAPE_GAP + 8
        ? selection.y - SHAPE_H - SHAPE_GAP
        : Math.min(selection.y + SHAPE_GAP, Math.max(0, viewport.height - SHAPE_H));
  }

  const panelLeft = clamp(
    railLeft >= 206 ? railLeft - 206 : railLeft + RAIL_W,
    0,
    Math.max(0, viewport.width - 206)
  );
  const panelTop = clamp(railTop + 14, 0, Math.max(0, viewport.height - 190));

  return (
    <div className="capture-overlay" onMouseEnter={() => api.capture.focus()} onContextMenu={(event) => event.preventDefault()}>
      <canvas
        ref={canvasRef}
        className="capture-canvas"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerCancel={() => {
          if (moveDrag) setSelection(moveDrag.initial);
          setSelectionDrag(null);
          setResize(null);
          setMoveDrag(null);
          setLassoDrawing(false);
          setDraft(null);
          annotationStart.current = null;
          erasing.current = false;
          eraseSnapshot.current = null;
        }}
        onDoubleClick={() => {
          if (!selection) selectFull();
        }}
        onClick={(event) => {
          if (tool !== 'text' || !selection || submitting) return;
          const p = { x: clamp(event.clientX, 0, viewport.width), y: clamp(event.clientY, 0, viewport.height) };
          if (!pointInRect(p, selection)) return;
          const point = clampToRect(p, selection);
          cancelTextRef.current = false;
          window.setTimeout(() => setTextEditor({ x: point.x, y: point.y, value: '' }), 0);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!selection) cancel();
        }}
        onMouseLeave={() => setCursor({ x: -100, y: -100 })}
      />

      {!selectionDrag && !lassoDrawing ? (
        <div
          className={`selection-shapebar ${selection ? 'is-attached' : 'is-idle'}`}
          style={selection ? { left: shapeBarLeft, top: shapeBarTop } : undefined}
          role="group"
          aria-label="Selection shape"
        >
          {SELECTION_MODES.map((mode) => {
            const Icon = mode.icon;
            const activeShape = lassoPending ? 'lasso' : selection ? selectionShape : selectionMode;
            const active = activeShape === mode.id;
            const shortcut = mode.id === 'rect' ? 'R' : mode.id === 'ellipse' ? 'O' : 'L';
            return (
              <button
                key={mode.id}
                type="button"
                className={`selection-shape-button ${active ? 'is-active' : ''}`}
                title={
                  selection
                    ? mode.id === 'lasso'
                      ? lassoPending
                        ? 'Drag on the image to draw the freehand replacement'
                        : `${mode.label} — drag to replace this selection`
                      : mode.label
                    : `${mode.label} (${shortcut})`
                }
                aria-label={mode.label}
                aria-pressed={active}
                onClick={() => chooseSelectionShape(mode.id)}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="capture-hint">
        {lassoPending ? (
          <>
            <span>Drag to replace with a freehand selection</span>
            <span className="hint-dot" />
            <span><kbd>Esc</kbd> keep the current shape</span>
          </>
        ) : hasSelection && selection ? (
          <>
            <span className="hint-size">
              {Math.round(selection.width * scaleX)} × {Math.round(selection.height * scaleY)}
            </span>
            <span className="hint-dot" />
            <span>Drag inside to move · pick a tool to draw</span>
            <span className="hint-dot" />
            <span><kbd>Enter</kbd> full editor</span>
            <span className="hint-dot" />
            <span><kbd>Ctrl</kbd>+<kbd>C</kbd> copy</span>
            <span className="hint-dot" />
            <span><kbd>Esc</kbd> close</span>
          </>
        ) : (
          <>
            <span>
              {selectionMode === 'lasso'
                ? 'Drag to draw a freehand selection'
                : selectionMode === 'ellipse'
                  ? 'Drag to select a circle or ellipse'
                  : 'Drag to select'}
            </span>
            <span className="hint-dot" />
            <span><kbd>Enter</kbd> full screen</span>
            <span className="hint-dot" />
            <span><kbd>Esc</kbd> cancel</span>
          </>
        )}
      </div>

      {showInline && selection ? (
        <>
          <div
            className="inline-rail"
            style={{ left: railLeft, top: railTop }}
            data-markup-count={annotations.length}
            onClick={() => setLassoPending(false)}
          >
            {INLINE_TOOLS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`inline-tool ${tool === item.id ? 'is-active' : ''}`}
                  title={`${item.label} (${item.shortcut})`}
                  aria-label={item.label}
                  aria-pressed={tool === item.id}
                  onClick={() => {
                    setTool(item.id);
                    setLassoPending(false);
                    setPanel(null);
                  }}
                >
                  <Icon size={16} />
                </button>
              );
            })}
            <div className="inline-divider" />
            <button type="button" className="inline-tool" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={!past.length}>
              <Undo2 size={15} />
            </button>
            <button type="button" className="inline-tool" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo} disabled={!future.length}>
              <Redo2 size={15} />
            </button>
            <button type="button" className="inline-tool" title="Clear all markup" aria-label="Clear all markup" onClick={clearMarkup} disabled={!annotations.length}>
              <Trash2 size={15} />
            </button>
            <div className="inline-divider" />
            <button
              type="button"
              className={`inline-tool ${panel === 'color' ? 'is-active' : ''}`}
              title="Color"
              aria-label="Color"
              onClick={() => setPanel(panel === 'color' ? null : 'color')}
            >
              <span className="inline-color-dot" style={{ background: color }} />
            </button>
            <button
              type="button"
              className={`inline-tool ${panel === 'size' ? 'is-active' : ''}`}
              title={`Stroke ${stroke}px, text ${fontSize}px`}
              aria-label="Stroke and text size"
              onClick={() => setPanel(panel === 'size' ? null : 'size')}
            >
              <SlidersHorizontal size={15} />
            </button>
          </div>

          <div className="inline-actionbar" style={{ left: actionLeft, top: actionTop }}>
            <button type="button" className="inline-action" onClick={() => void confirmInline('edit')} disabled={submitting} title="Open the full editor with this crop" aria-label="Edit">
              <ExternalLink size={16} />
            </button>
            <button type="button" className="inline-action" onClick={() => void confirmInline('copy')} disabled={submitting} title="Copy annotated image" aria-label="Copy">
              <Copy size={16} />
            </button>
            <button type="button" className="inline-action" onClick={() => void confirmInline('save')} disabled={submitting} title="Save annotated image" aria-label="Save">
              <Save size={16} />
            </button>
            <button type="button" className="inline-action primary" onClick={() => void confirmInline('upload')} disabled={submitting} title="Share annotated image" aria-label="Share">
              <Upload size={16} />
            </button>
            <button type="button" className="inline-action" onClick={() => void confirmInline('print')} disabled={submitting} title="Print annotated image" aria-label="Print">
              <Printer size={16} />
            </button>
            <div className="inline-action-divider" />
            <button type="button" className="inline-action" title="Redraw selection (clears markup)" aria-label="Redraw" onClick={redraw}>
              <RotateCcw size={16} />
            </button>
            <button type="button" className="inline-action" title="Use the full screen" aria-label="Full screen" onClick={selectFull}>
              <Maximize2 size={16} />
            </button>
            <button type="button" className="inline-action" title="Cancel capture" aria-label="Close" onClick={cancel}>
              <X size={17} />
            </button>
          </div>

          {panel ? (
            <div className="inline-popover" style={{ left: panelLeft, top: panelTop }}>
              <div className="inline-popover-head">
                {panel === 'color' ? <Palette size={14} /> : <SlidersHorizontal size={14} />}
                <button type="button" className="inline-icon" onClick={() => setPanel(null)} title="Close panel" aria-label="Close panel">
                  <X size={14} />
                </button>
              </div>
              {panel === 'color' ? (
                <>
                  <div className="inline-swatches">
                    {COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        className={`inline-swatch ${color.toLowerCase() === swatch.toLowerCase() ? 'is-active' : ''}`}
                        style={{ background: swatch }}
                        title={swatch}
                        aria-label={`Color ${swatch}`}
                        onClick={() => {
                          setColor(swatch);
                          setPanel(null);
                        }}
                      >
                        {color.toLowerCase() === swatch.toLowerCase() ? (
                          <Check size={11} color={contrastColor(swatch)} />
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <label className="inline-custom-color" title="Custom color">
                    <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Custom color" />
                  </label>
                </>
              ) : (
                <>
                  <label className="inline-panel-range" title={`Stroke ${stroke}px`}>
                    <PenLine size={14} />
                    <input type="range" min={1} max={40} value={stroke} onChange={(event) => setStroke(Number(event.target.value))} aria-label="Stroke size" />
                  </label>
                  <label className="inline-panel-range" title={`Text ${fontSize}px`}>
                    <Type size={14} />
                    <input type="range" min={10} max={96} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} aria-label="Text size" />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {textEditor ? (
            <textarea
              className="inline-text-editor"
              value={textEditor.value}
              onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })}
              onBlur={commitText}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelTextRef.current = true;
                  setTextEditor(null);
                } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  commitText();
                }
              }}
              style={{
                left: textEditor.x,
                top: textEditor.y,
                fontSize: Math.max(12, fontSize),
                fontFamily: init.settings.editor.fontFamily,
                color,
                caretColor: color
              }}
              placeholder="Type here…"
              spellCheck={false}
            />
          ) : null}
        </>
      ) : null}

      {selectionDrag && image ? <Magnifier image={image} cursor={cursor} viewport={viewport} /> : null}

      {submitting ? (
        <div className="overlay-busy">
          <Spinner label="Working…" />
        </div>
      ) : null}

      {error ? (
        <div className="overlay-error-bar" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Magnifier({ image, cursor, viewport }: { image: HTMLImageElement; cursor: { x: number; y: number }; viewport: Viewport }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scaleX = image.naturalWidth / viewport.width;
  const scaleY = image.naturalHeight / viewport.height;
  const color = useMemo(() => {
    try {
      const sample = document.createElement('canvas');
      sample.width = 1;
      sample.height = 1;
      const ctx = sample.getContext('2d');
      if (!ctx) return '';
      const sx = clamp(Math.round(cursor.x * scaleX), 0, image.naturalWidth - 1);
      const sy = clamp(Math.round(cursor.y * scaleY), 0, image.naturalHeight - 1);
      ctx.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    } catch {
      return '';
    }
  }, [cursor.x, cursor.y, image, scaleX, scaleY]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const size = 132;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, size, size);
    const source = 19;
    const sx = clamp(cursor.x * scaleX - (source * scaleX) / 2, 0, Math.max(0, image.naturalWidth - source * scaleX));
    const sy = clamp(cursor.y * scaleY - (source * scaleY) / 2, 0, Math.max(0, image.naturalHeight - source * scaleY));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, sx, sy, source * scaleX, source * scaleY, 0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [cursor.x, cursor.y, image, scaleX, scaleY]);

  const width = 148;
  const height = 178;
  const left = cursor.x + 26 + width > viewport.width ? cursor.x - width - 26 : cursor.x + 26;
  const top = cursor.y + 26 + height > viewport.height ? cursor.y - height - 26 : cursor.y + 26;

  return (
    <div className="magnifier" style={{ left: Math.max(10, left), top: Math.max(10, top) }}>
      <canvas ref={ref} style={{ width: 132, height: 132 }} />
      <div className="magnifier-meta">
        <span>{Math.round(cursor.x * scaleX)}, {Math.round(cursor.y * scaleY)}</span>
        <span className="magnifier-color">
          <i style={{ background: color || '#000' }} />
          {color}
        </span>
      </div>
    </div>
  );
}
