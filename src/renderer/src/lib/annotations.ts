export interface PathAnnotation {
  id: string;
  type: 'path';
  tool: 'pen' | 'marker';
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface ShapeAnnotation {
  id: string;
  type: 'shape';
  shape: 'line' | 'arrow' | 'rect' | 'ellipse';
  start: { x: number; y: number };
  end: { x: number; y: number };
  color: string;
  width: number;
  dashed?: boolean;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
}

export interface StepAnnotation {
  id: string;
  type: 'step';
  x: number;
  y: number;
  number: number;
  color: string;
  radius: number;
}

export interface PatchAnnotation {
  id: string;
  type: 'patch';
  x: number;
  y: number;
  width: number;
  height: number;
  image: HTMLImageElement;
  dataUrl: string;
}

export type Annotation = PathAnnotation | ShapeAnnotation | TextAnnotation | StepAnnotation | PatchAnnotation;

/** Numbered steps keep stable labels, so erasing step 1 leaves 2..10 untouched. */
export function nextStepNumber(annotations: Annotation[]): number {
  return (
    annotations.reduce(
      (highest, annotation) =>
        annotation.type === 'step' ? Math.max(highest, annotation.number) : highest,
      0
    ) + 1
  );
}

export function uid(): string {
  return crypto.randomUUID();
}

export function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  };
}

function parseHex(color: string): [number, number, number] | null {
  let value = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    value = `#${value
      .slice(1)
      .split('')
      .map((part) => part + part)
      .join('')}`;
  }
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) return null;
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

/**
 * Return a dark or light outline colour that keeps a stroke visible when the
 * annotation colour matches the screenshot underneath it.
 */
export function contrastColor(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return '#0b0f14';
  const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return luminance > 160 ? '#0b0f14' : '#ffffff';
}

function paintPath(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  color: string,
  width: number,
  alpha: number
): void {
  if (points.length < 1) return;
  const [first, ...rest] = points;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  if (rest.length === 0) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, Math.max(0.75, width / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  if (rest.length === 1) {
    ctx.lineTo(rest[0].x, rest[0].y);
  } else {
    for (let index = 0; index < rest.length - 1; index += 1) {
      const current = rest[index];
      const next = rest[index + 1];
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    const last = rest[rest.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

function paintShape(
  ctx: CanvasRenderingContext2D,
  annotation: ShapeAnnotation,
  color: string,
  width: number
): void {
  const { start, end } = annotation;
  const rect = normalizeRect(start, end);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (annotation.shape === 'line') {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (annotation.shape === 'arrow') {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = Math.max(10, width * 4.5);
    const stemX = end.x - Math.cos(angle) * head * 0.55;
    const stemY = end.y - Math.sin(angle) * head * 0.55;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(stemX, stemY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - head * Math.cos(angle - 0.48), end.y - head * Math.sin(angle - 0.48));
    ctx.lineTo(end.x - head * Math.cos(angle + 0.48), end.y - head * Math.sin(angle + 0.48));
    ctx.closePath();
    ctx.fill();
  } else if (annotation.shape === 'rect') {
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  } else {
    ctx.beginPath();
    ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** Eraser hit-test: does this point touch the annotation's visible geometry? */
export function annotationHit(
  point: { x: number; y: number },
  annotation: Annotation,
  radius: number
): boolean {
  if (annotation.type === 'path') {
    if (annotation.points.length === 1) {
      return Math.hypot(point.x - annotation.points[0].x, point.y - annotation.points[0].y) <= radius + annotation.width;
    }
    for (let index = 0; index < annotation.points.length - 1; index += 1) {
      if (distanceToSegment(point, annotation.points[index], annotation.points[index + 1]) <= radius + annotation.width) {
        return true;
      }
    }
    return false;
  }
  if (annotation.type === 'shape') {
    const { start, end } = annotation;
    if (annotation.shape === 'line' || annotation.shape === 'arrow') {
      return distanceToSegment(point, start, end) <= radius + 2;
    }
    const rect = normalizeRect(start, end);
    if (annotation.shape === 'rect') {
      const edges: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
        [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }],
        [{ x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }],
        [{ x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }],
        [{ x: rect.x, y: rect.y + rect.height }, { x: rect.x, y: rect.y }]
      ];
      return edges.some(([a, b]) => distanceToSegment(point, a, b) <= radius + 2);
    }
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const rx = Math.max(1, rect.width / 2);
    const ry = Math.max(1, rect.height / 2);
    const nx = (point.x - cx) / rx;
    const ny = (point.y - cy) / ry;
    const radialDistance = Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
    return radialDistance <= radius + 2;
  }
  if (annotation.type === 'step') {
    return Math.hypot(point.x - annotation.x, point.y - annotation.y) <= annotation.radius + radius;
  }
  if (annotation.type === 'text') {
    const lines = annotation.text.split('\n');
    const width = Math.max(1, ...lines.map((line) => line.length)) * annotation.fontSize * 0.62;
    const height = lines.length * annotation.fontSize * 1.2;
    return (
      point.x >= annotation.x - radius &&
      point.x <= annotation.x + width + radius &&
      point.y >= annotation.y - radius &&
      point.y <= annotation.y + height + radius
    );
  }
  return (
    point.x >= annotation.x - radius &&
    point.x <= annotation.x + annotation.width + radius &&
    point.y >= annotation.y - radius &&
    point.y <= annotation.y + annotation.height + radius
  );
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
  ctx.save();
  if (annotation.type === 'path') {
    if (annotation.points.length < 1) {
      ctx.restore();
      return;
    }
    if (annotation.tool === 'marker') {
      paintPath(ctx, annotation.points, annotation.color, annotation.width * 3.2, 0.34);
      ctx.restore();
      return;
    }
    paintPath(ctx, annotation.points, annotation.color, annotation.width, 1);
  } else if (annotation.type === 'shape') {
    ctx.save();
    if (annotation.dashed) ctx.setLineDash([6, 4]);
    paintShape(ctx, annotation, annotation.color, Math.max(1, annotation.width));
    ctx.restore();
  } else if (annotation.type === 'step') {
    ctx.beginPath();
    ctx.arc(annotation.x, annotation.y, annotation.radius, 0, Math.PI * 2);
    ctx.fillStyle = annotation.color;
    ctx.fill();
    const label = String(annotation.number);
    const fontSize = annotation.radius * (label.length > 1 ? 1 : 1.3);
    ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = contrastColor(annotation.color);
    ctx.fillText(label, annotation.x, annotation.y + 0.5);
  } else if (annotation.type === 'text') {
    ctx.font = `${annotation.fontSize}px ${annotation.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = annotation.color;
    const lines = annotation.text.split('\n');
    const lineHeight = annotation.fontSize * 1.2;
    lines.forEach((line, index) => {
      const y = annotation.y + index * lineHeight;
      ctx.fillText(line, annotation.x, y);
    });
  } else if (annotation.image.complete) {
    ctx.drawImage(annotation.image, annotation.x, annotation.y, annotation.width, annotation.height);
  }
  ctx.restore();
}
