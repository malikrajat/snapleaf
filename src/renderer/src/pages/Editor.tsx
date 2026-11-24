import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Circle,
  Copy,
  Crop,
  Eraser,
  Highlighter,
  LayoutGrid,
  ListOrdered,
  Maximize,
  Minus,
  PenLine,
  Printer,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { CaptureRecord } from '@shared/types';
import type { Settings, ToolId } from '@shared/settings';
import { COLOR_SWATCHES } from '@shared/settings';
import { clamp, normalizeRect, type Point, type Rect } from '@shared/geometry';
import { api, errorMessage } from '../lib/api';
import { useSettings } from '../lib/hooks';
import { toast } from '../lib/toast';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/Spinner';
import {
  annotationHit,
  drawAnnotation,
  nextStepNumber,
  uid,
  type Annotation,
  type TextAnnotation
} from '../lib/annotations';

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof PenLine; shortcut: string; hint: string }> = [
  { id: 'pen', label: 'Pen', icon: PenLine, shortcut: 'P', hint: 'Draw freehand' },
  { id: 'line', label: 'Line', icon: Minus, shortcut: 'L', hint: 'Draw a straight line' },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight, shortcut: 'A', hint: 'Point at something' },
  { id: 'rect', label: 'Box', icon: Square, shortcut: 'R', hint: 'Outline a rectangle' },
  { id: 'ellipse', label: 'Circle', icon: Circle, shortcut: 'O', hint: 'Outline an ellipse' },
  { id: 'marker', label: 'Marker', icon: Highlighter, shortcut: 'M', hint: 'Highlight with translucent ink' },
  { id: 'text', label: 'Text', icon: Type, shortcut: 'T', hint: 'Click to add a note' },
  { id: 'step', label: 'Step', icon: ListOrdered, shortcut: 'S', hint: 'Click to add a numbered step' },
  { id: 'blur', label: 'Pixelate', icon: LayoutGrid, shortcut: 'B', hint: 'Hide sensitive details' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, shortcut: 'E', hint: 'Erase individual markup' },
  { id: 'crop', label: 'Crop', icon: Crop, shortcut: 'C', hint: 'Trim the screenshot' }
];

function textPlaceholder(settings: Settings | null): string {
  return settings?.editor.defaultTool === 'text' ? 'Click the image to type' : 'Pick a tool and draw on the screenshot';
}

export function EditorPage({ captureId }: { captureId: string }) {
  const { settings } = useSettings();
  const [record, setRecord] = useState<CaptureRecord | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [tool, setTool] = useState<ToolId>('pen');
  const [color, setColor] = useState('#ff3b30');
  const [stroke, setStroke] = useState(4);
  const [fontSize, setFontSize] = useState(24);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; value: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [busy, setBusy] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [pointer, setPointer] = useState<Point | null>(null);
  const dragStart = useRef<Point | null>(null);
  const erasing = useRef(false);
  const eraseSnapshot = useRef<Annotation[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textFocused = useRef(false);

  useEffect(() => {
    let alive = true;
    api.editor
      .getCapture(captureId)
      .then((value) => {
        if (!alive) return;
        if (!value) {
          setError('This screenshot is no longer available.');
          return;
        }
        setRecord(value);
        const img = new Image();
        img.onload = () => {
          if (alive) setBaseImage(img);
        };
        img.onerror = () => {
          if (alive) setError('The image could not be loaded.');
        };
        api.editor
          .getImage(value.id)
          .then((dataUrl) => {
            if (alive) img.src = dataUrl;
          })
          .catch((reason) => {
            if (alive) setError(errorMessage(reason));
          });
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => {
      alive = false;
    };
  }, [captureId]);

  useEffect(() => {
    if (!settings) return;
    setColor(settings.editor.defaultColor);
    setStroke(settings.editor.defaultWidth);
    setTool(settings.editor.defaultTool);
  }, [settings?.editor.defaultColor, settings?.editor.defaultTool, settings?.editor.defaultWidth]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    });
    observer.observe(stage);
    setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!baseImage || !stageSize.width || !stageSize.height) return;
    const fit = Math.min((stageSize.width - 88) / baseImage.naturalWidth, (stageSize.height - 88) / baseImage.naturalHeight, 4);
    if (zoomMode === 'fit') setZoom(clamp(fit, 0.05, 4));
  }, [baseImage, stageSize, zoomMode]);

  useEffect(() => {
    if (textEditor && !textFocused.current) {
      textFocused.current = true;
      textareaRef.current?.focus();
      textareaRef.current?.select();
    } else if (!textEditor) {
      textFocused.current = false;
    }
  }, [textEditor]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return;
    const width = baseImage.naturalWidth;
    const height = baseImage.naturalHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(baseImage, 0, 0);
    for (const annotation of annotations) drawAnnotation(ctx, annotation);
    if (draft) drawAnnotation(ctx, draft);
    if (cropRect) {
      ctx.save();
      ctx.fillStyle = 'rgba(3, 7, 12, .62)';
      ctx.fillRect(0, 0, width, height);
      ctx.clearRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      ctx.drawImage(
        baseImage,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height
      );
      for (const annotation of annotations) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
        ctx.clip();
        drawAnnotation(ctx, annotation);
        ctx.restore();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, 2 / Math.max(zoom, 0.1));
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      ctx.restore();
    }
  }, [annotations, baseImage, cropRect, draft, zoom]);

  useEffect(() => {
    draw();
  }, [draw]);

  const composite = useCallback(
    (extra?: Annotation): HTMLCanvasElement => {
      if (!baseImage) throw new Error('Image is not loaded');
      const canvas = document.createElement('canvas');
      canvas.width = baseImage.naturalWidth;
      canvas.height = baseImage.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');
      ctx.drawImage(baseImage, 0, 0);
      for (const annotation of annotations) drawAnnotation(ctx, annotation);
      if (extra) drawAnnotation(ctx, extra);
      return canvas;
    },
    [annotations, baseImage]
  );

  const pendingText = (): TextAnnotation | null => {
    if (!textEditor || !textEditor.value.trim()) return null;
    return {
      id: uid(),
      type: 'text',
      x: textEditor.x,
      y: textEditor.y,
      text: textEditor.value,
      color,
      fontSize,
      fontFamily: settings?.editor.fontFamily ?? 'system-ui, sans-serif'
    };
  };

  const commit = useCallback(
    (annotation: Annotation) => {
      setPast((value) => [...value, annotations].slice(-40));
      setFuture([]);
      setAnnotations((value) => [...value, annotation]);
      setDraft(null);
    },
    [annotations]
  );

  const pointFromClient = (clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp(((clientX - rect.left) / rect.width) * baseImage.naturalWidth, 0, baseImage.naturalWidth),
      y: clamp(((clientY - rect.top) / rect.height) * baseImage.naturalHeight, 0, baseImage.naturalHeight)
    };
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point | null =>
    pointFromClient(event.clientX, event.clientY);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'text') return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    // Wait for the click to finish before mounting the textarea; otherwise the
    // pointer-up would immediately blur the freshly focused text box.
    window.setTimeout(() => setTextEditor({ x: point.x, y: point.y, value: '' }), 0);
  };

  const eraseAt = (point: Point) => {
    const hits = annotations.filter((annotation) => annotationHit(point, annotation, 12));
    if (!hits.length) return;
    if (!eraseSnapshot.current) {
      eraseSnapshot.current = annotations;
      setPast((value) => [...value, annotations].slice(-40));
      setFuture([]);
    }
    const ids = new Set(hits.map((annotation) => annotation.id));
    setAnnotations((value) => value.filter((annotation) => !ids.has(annotation.id)));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!baseImage || event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (tool === 'text') {
      setPointer(point);
      return;
    }
    if (tool === 'step') {
      setPointer(point);
      const radius = Math.max(11, Math.min(22, stroke * 3));
      const margin = radius + 3;
      const x =
        baseImage.naturalWidth > margin * 2
          ? clamp(point.x, margin, baseImage.naturalWidth - margin)
          : baseImage.naturalWidth / 2;
      const y =
        baseImage.naturalHeight > margin * 2
          ? clamp(point.y, margin, baseImage.naturalHeight - margin)
          : baseImage.naturalHeight / 2;
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
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'eraser') {
      erasing.current = true;
      eraseSnapshot.current = null;
      eraseAt(point);
      return;
    }
    dragStart.current = point;
    setPointer(point);
    if (tool === 'crop') {
      setCropRect({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }
    if (tool === 'blur') {
      setDraft({
        id: uid(),
        type: 'shape',
        shape: 'rect',
        start: point,
        end: point,
        color: '#1e90ff',
        width: 2,
        dashed: true
      });
      return;
    }
    if (tool === 'pen' || tool === 'marker') {
      setDraft({ id: uid(), type: 'path', tool, points: [point], color, width: stroke });
      return;
    }
    setDraft({
      id: uid(),
      type: 'shape',
      shape: tool,
      start: point,
      end: point,
      color,
      width: stroke
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    setPointer(point);
    if (erasing.current) {
      eraseAt(point);
      return;
    }
    const start = dragStart.current;
    if (!start) return;
    if (tool === 'crop') {
      setCropRect(normalizeRect(start, point));
      return;
    }
    if (tool === 'pen' || tool === 'marker') {
      setDraft((value) =>
        value && value.type === 'path' ? { ...value, points: [...value.points, point] } : value
      );
      return;
    }
    setDraft((value) =>
      value && value.type === 'shape'
        ? { ...value, end: point }
        : value
    );
  };

  const finishShape = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragStart.current;
    const point = pointFromEvent(event);
    dragStart.current = null;
    if (erasing.current) {
      erasing.current = false;
      eraseSnapshot.current = null;
      return;
    }
    if (!start || !point) return;
    if (tool === 'crop') {
      const rect = normalizeRect(start, point);
      if (rect.width < 6 || rect.height < 6) setCropRect(null);
      else setCropRect(rect);
      return;
    }
    if (tool === 'blur') {
      const rect = normalizeRect(start, point);
      setDraft(null);
      if (rect.width >= 6 && rect.height >= 6) await applyPixelate(rect);
      return;
    }
    if (!draft) return;
    if (draft.type === 'path') {
      if (draft.points.length < 2) {
        setDraft(null);
        return;
      }
      const last = draft.points[draft.points.length - 1];
      const distance = Math.hypot(last.x - draft.points[0].x, last.y - draft.points[0].y);
      if (distance < 1.5 && draft.points.length < 4) {
        setDraft(null);
        return;
      }
      commit({ ...draft, points: [...draft.points, point] });
      return;
    }
    if (draft.type === 'shape') {
      const rect = normalizeRect(draft.start, point);
      if (Math.max(rect.width, rect.height) < 3) {
        setDraft(null);
        return;
      }
      commit({ ...draft, end: point });
    }
  };

  const applyPixelate = async (rect: Rect): Promise<void> => {
    try {
      const source = composite();
      const block = Math.max(5, Math.round(Math.min(rect.width, rect.height) / 14));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.ceil(rect.width / block));
      small.height = Math.max(1, Math.ceil(rect.height / block));
      const smallCtx = small.getContext('2d');
      if (!smallCtx) return;
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, small.width, small.height);
      const patch = document.createElement('canvas');
      patch.width = Math.max(1, Math.round(rect.width));
      patch.height = Math.max(1, Math.round(rect.height));
      const patchCtx = patch.getContext('2d');
      if (!patchCtx) return;
      patchCtx.imageSmoothingEnabled = false;
      patchCtx.drawImage(small, 0, 0, small.width, small.height, 0, 0, patch.width, patch.height);
      const dataUrl = patch.toDataURL('image/png');
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Could not create the pixelated patch'));
        image.src = dataUrl;
      });
      commit({ id: uid(), type: 'patch', x: rect.x, y: rect.y, width: patch.width, height: patch.height, image, dataUrl });
    } catch (reason) {
      toast(errorMessage(reason), 'error');
    }
  };

  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast((value) => value.slice(0, -1));
    setFuture((value) => [annotations, ...value]);
    setAnnotations(previous);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((value) => value.slice(1));
    setPast((value) => [...value, annotations]);
    setAnnotations(next);
  };

  const clearMarkup = () => {
    if (!annotations.length) return;
    setPast((value) => [...value, annotations]);
    setFuture([]);
    setAnnotations([]);
  };

  const commitText = () => {
    if (!textEditor) return;
    const value = textEditor.value.trim();
    setTextEditor(null);
    if (!value) return;
    commit({
      id: uid(),
      type: 'text',
      x: textEditor.x,
      y: textEditor.y,
      text: textEditor.value,
      color,
      fontSize,
      fontFamily: settings?.editor.fontFamily ?? 'system-ui, sans-serif'
    });
  };

  const applyCrop = async () => {
    if (!cropRect || !baseImage) return;
    const extra = pendingText();
    if (extra) commitText();
    const source = composite(extra ?? undefined);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cropRect.width));
    canvas.height = Math.max(1, Math.round(cropRect.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(source, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const image = new Image();
    image.onload = () => {
      setBaseImage(image);
      setAnnotations([]);
      setPast([]);
      setFuture([]);
      setCropRect(null);
      setZoomMode('fit');
      toast('Crop applied', 'success');
    };
    image.src = dataUrl;
  };

  const runAction = async (action: 'copy' | 'save' | 'upload' | 'print') => {
    if (!baseImage || busy) return;
    const extra = pendingText();
    if (extra) commitText();
    const canvas = composite(extra ?? undefined);
    const dataUrl = canvas.toDataURL('image/png');
    setBusy(action);
    try {
      if (action === 'copy') {
        await api.editor.copy(dataUrl);
        toast('Copied to clipboard', 'success');
      } else if (action === 'save') {
        const result = await api.editor.save({
          dataUrl,
          format: settings?.save.format ?? 'png',
          quality: settings?.save.jpegQuality ?? 90,
          suggestedName: record ? record.filename.replace(/\.[^.]+$/, '') : undefined
        });
        if (!result.canceled && result.path) {
          toast('Screenshot saved', 'success');
          if (settings?.save.openFolderAfterSave) await api.app.showItemInFolder(result.path);
        }
      } else if (action === 'upload') {
        const result = await api.editor.upload({
          dataUrl,
          format: settings?.upload.format ?? 'png',
          quality: settings?.upload.jpegQuality ?? 90,
          originalName: record?.filename,
          width: canvas.width,
          height: canvas.height
        });
        if (result) {
          toast(settings?.upload.autoCopyLink ? 'Uploaded — link copied' : 'Screenshot uploaded', 'success');
        }
      } else {
        await api.editor.print(dataUrl);
      }
    } catch (reason) {
      toast(errorMessage(reason), 'error', 5000);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if (typing) {
        if (event.key === 'Escape' && target?.tagName === 'TEXTAREA') {
          event.preventDefault();
          setTextEditor(null);
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          commitText();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (textEditor) setTextEditor(null);
        else if (cropRect) setCropRect(null);
        else if (draft) setDraft(null);
        else api.editor.close();
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
        void runAction('copy');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void runAction('save');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        void runAction('upload');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void runAction('print');
        return;
      }
      const found = TOOLS.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
      if (found && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setTool(found.id);
        return;
      }
      if (event.key === '[') {
        setStroke((value) => Math.max(1, value - 1));
      } else if (event.key === ']') {
        setStroke((value) => Math.min(40, value + 1));
      } else if (event.key === '0') {
        setZoomMode('fit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, baseImage, busy, cropRect, draft, future, past, settings, textEditor, color, fontSize, stroke]);

  if (error) {
    return (
      <div className="fatal">
        <div className="fatal-card">
          <h1>Screenshot unavailable</h1>
          <p>{error}</p>
          <button type="button" className="button primary" onClick={() => api.editor.close()}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!record || !baseImage || !settings) {
    return (
      <div className="editor-loading">
        <Spinner label="Opening screenshot…" />
      </div>
    );
  }

  const scaledWidth = baseImage.naturalWidth * zoom;
  const scaledHeight = baseImage.naturalHeight * zoom;
  const activeTool = TOOLS.find((item) => item.id === tool);
  const dirty = annotations.length > 0;

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="editor-title">
          <Logo size={24} />
          <div>
            <strong>{record.filename}</strong>
            <span>
              {baseImage.naturalWidth} × {baseImage.naturalHeight}
              {dirty ? <i className="dirty-dot" title="Unsaved changes" /> : null}
            </span>
          </div>
        </div>
        <div className="editor-actions">
          <button type="button" className="button ghost" onClick={() => void runAction('copy')} disabled={Boolean(busy)}>
            {busy === 'copy' ? <Spinner label="" /> : <Copy size={16} />}
            <span>Copy</span>
          </button>
          <button type="button" className="button ghost" onClick={() => void runAction('save')} disabled={Boolean(busy)}>
            {busy === 'save' ? <Spinner label="" /> : <Save size={16} />}
            <span>Save</span>
          </button>
          <button type="button" className="button primary" onClick={() => void runAction('upload')} disabled={Boolean(busy)}>
            {busy === 'upload' ? <Spinner label="" /> : <Upload size={16} />}
            <span>Share</span>
          </button>
          <button type="button" className="icon-button" title="Print" onClick={() => void runAction('print')} disabled={Boolean(busy)}>
            <Printer size={17} />
          </button>
          <button type="button" className="icon-button" title="Close editor" onClick={() => api.editor.close()}>
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button type="button" className="icon-button" title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length}>
            <Undo2 size={17} />
          </button>
          <button type="button" className="icon-button" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length}>
            <Redo2 size={17} />
          </button>
          <button type="button" className="icon-button" title="Clear all markup" onClick={clearMarkup} disabled={!annotations.length}>
            <Trash2 size={17} />
          </button>
        </div>
        <div className="toolbar-divider" />
        <div className="color-row" aria-label="Color">
          {COLOR_SWATCHES.slice(0, 9).map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`swatch ${color.toLowerCase() === swatch.toLowerCase() ? 'is-active' : ''}`}
              style={{ background: swatch }}
              title={swatch}
              aria-label={`Color ${swatch}`}
              onClick={() => setColor(swatch)}
            >
              {color.toLowerCase() === swatch.toLowerCase() ? <Check size={12} /> : null}
            </button>
          ))}
          <label className="custom-color" title="Custom color">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <span style={{ background: color }} />
          </label>
        </div>
        <div className="toolbar-divider" />
        <label className="range-control">
          <span>Size</span>
          <input
            type="range"
            min={1}
            max={40}
            value={stroke}
            onChange={(event) => setStroke(Number(event.target.value))}
          />
          <b>{stroke}</b>
        </label>
        {tool === 'text' ? (
          <label className="range-control">
            <span>Text</span>
            <input
              type="range"
              min={10}
              max={96}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
            <b>{fontSize}</b>
          </label>
        ) : null}
        <div className="toolbar-spacer" />
        <div className="zoom-controls">
          <button type="button" className="icon-button" title="Zoom out" onClick={() => { setZoomMode('manual'); setZoom((value) => clamp(value - 0.1, 0.05, 4)); }}>
            <ZoomOut size={16} />
          </button>
          <button type="button" className="zoom-value" title="Fit to window" onClick={() => setZoomMode('fit')}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="icon-button" title="Zoom in" onClick={() => { setZoomMode('manual'); setZoom((value) => clamp(value + 0.1, 0.05, 4)); }}>
            <ZoomIn size={16} />
          </button>
          <button type="button" className="icon-button" title="Fit to window" onClick={() => setZoomMode('fit')}>
            <Maximize size={15} />
          </button>
        </div>
      </div>

      <div className="editor-main">
        <aside className="tool-rail" aria-label="Annotation tools">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`rail-tool ${tool === item.id ? 'is-active' : ''}`}
                onClick={() => {
                  if (textEditor) commitText();
                  setTool(item.id);
                }}
                title={`${item.label} (${item.shortcut}) — ${item.hint}`}
                aria-pressed={tool === item.id}
              >
                <Icon size={19} />
                {settings.editor.showLabels ? <span>{item.label}</span> : null}
              </button>
            );
          })}
        </aside>

        <div className="editor-stage-wrap">
          <div className="editor-stage" ref={stageRef}>
            <div className="canvas-space">
              <div className="canvas-layer" style={{ width: Math.max(1, scaledWidth), height: Math.max(1, scaledHeight) }}>
                <canvas
                  ref={canvasRef}
                  className={`editor-canvas tool-${tool}`}
                  style={{ width: Math.max(1, scaledWidth), height: Math.max(1, scaledHeight) }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={(event) => void finishShape(event)}
                  onPointerCancel={() => {
                    dragStart.current = null;
                    erasing.current = false;
                    eraseSnapshot.current = null;
                    setDraft(null);
                  }}
                  onClick={onCanvasClick}
                  onMouseLeave={() => setPointer(null)}
                />
                {textEditor ? (
                  <textarea
                    ref={textareaRef}
                    className="text-editor"
                    value={textEditor.value}
                    onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })}
                    onBlur={commitText}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setTextEditor(null);
                      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        commitText();
                      }
                    }}
                    style={{
                      left: textEditor.x * zoom,
                      top: textEditor.y * zoom,
                      minWidth: Math.max(160, 220 * zoom),
                      fontSize: Math.max(12, fontSize * zoom),
                      fontFamily: settings.editor.fontFamily,
                      color,
                      caretColor: color,
                      lineHeight: 1.2
                    }}
                    spellCheck={false}
                    placeholder="Type here…"
                  />
                ) : null}
              </div>
            </div>
          </div>
          {cropRect ? (
            <div className="crop-bar">
              <span>
                {Math.round(cropRect.width)} × {Math.round(cropRect.height)}
              </span>
              <button type="button" className="button ghost" onClick={() => setCropRect(null)}>
                Cancel
              </button>
              <button type="button" className="button primary" onClick={() => void applyCrop()}>
                <Crop size={15} /> Apply crop
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="editor-status">
        <span>{activeTool?.hint ?? textPlaceholder(settings)}</span>
        <span className="status-spacer" />
        {pointer ? <span>{Math.round(pointer.x)}, {Math.round(pointer.y)} px</span> : null}
        <span>{annotations.length} markup{annotations.length === 1 ? '' : 's'}</span>
        {busy ? <span className="status-busy">Working…</span> : null}
      </footer>
    </div>
  );
}
