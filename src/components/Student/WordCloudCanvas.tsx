import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface WordCloudCanvasProps {
  words: Array<[string, number]>;
  height?: number;
  compact?: boolean;
  activeWord?: string | null;
  onWordClick?: (word: string) => void;
  onWordHover?: (word: string | null) => void;
}

const CLOUD_COLORS = [
  '#0f172a', '#1e3a8a', '#0f766e', '#4338ca', '#075985',
  '#1e3a5f', '#334155', '#0e7490', '#1d4ed8', '#475569',
];

type PlacedWord = {
  text: string;
  weight: number;
  x: number;
  y: number;
  fontSize: number;
  width: number;
  height: number;
  angle: number;
  t: number;
  color: string;
  fontWeight: number;
};

function normalizeWords(words: Array<[string, number]>) {
  return words
    .filter((w) => Array.isArray(w) && typeof w[0] === 'string' && w[0].trim().length > 0)
    .map(([text, weight]) => [text.trim(), Number(weight) || 1] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}

function wordHash(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

let measureContext: CanvasRenderingContext2D | null = null;

function measureWord(text: string, fontSize: number, fontWeight: number) {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  if (!measureContext) {
    return { width: text.length * fontSize * 0.56, height: fontSize * 1.2 };
  }
  measureContext.font = `${fontWeight} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  return {
    width: Math.max(measureContext.measureText(text).width, fontSize * 0.8),
    height: fontSize * 1.15,
  };
}

function rotatedBox(width: number, height: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap: number
) {
  return !(
    a.x + a.width / 2 + gap < b.x - b.width / 2 ||
    a.x - a.width / 2 - gap > b.x + b.width / 2 ||
    a.y + a.height / 2 + gap < b.y - b.height / 2 ||
    a.y - a.height / 2 - gap > b.y + b.height / 2
  );
}

function anglesForWord(text: string, index: number, compact: boolean) {
  if (index === 0) return [0];
  const hash = wordHash(text);
  const long = text.length > 12;
  const short = text.length <= 8;

  if (compact) {
    if (index === 1) return long ? [90, 0, -90] : [0, 90];
    const mix = long
      ? [90, -90, 0]
      : short
        ? [90, -90, 18, -22, 0]
        : [0, 90, -90, 12, -16];
    const start = hash % mix.length;
    return [...mix.slice(start), ...mix.slice(0, start)];
  }

  const mix = short
    ? [0, 90, -90, 16, -20, 8]
    : long
      ? [0, 90, -90]
      : [0, 12, -14, 90, -90];
  const start = hash % mix.length;
  return [...mix.slice(start), ...mix.slice(0, start), 0];
}

function layoutWordCloud(
  words: Array<[string, number]>,
  width: number,
  height: number,
  compact: boolean
): PlacedWord[] {
  if (width < 40 || height < 40 || words.length === 0) return [];

  const ranked = normalizeWords(words).slice(0, compact ? 18 : 42);
  const maxWeight = ranked[0]?.[1] || 1;
  const minWeight = ranked[ranked.length - 1]?.[1] || 1;
  const weightRange = maxWeight - minWeight || 1;
  const pad = compact ? 6 : 16;
  const gap = compact ? 2 : 5;
  const minFont = compact ? 8 : 13;
  const maxFont = compact ? Math.min(26, height * 0.26) : Math.min(48, height * 0.14);
  const ellipticity = Math.max(0.52, Math.min(0.92, height / Math.max(width, 1)));
  const placed: PlacedWord[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.hypot(width, height);

  ranked.forEach(([text, weight], index) => {
    const t = (weight - minWeight) / weightRange;
    const fontWeight = t >= 0.7 ? 800 : t >= 0.42 ? 700 : t >= 0.22 ? 600 : 500;
    const fontSize = minFont + Math.pow(t, 0.62) * (maxFont - minFont);
    const sizes = [fontSize, fontSize * 0.88, Math.max(minFont, fontSize * 0.74)];
    const angles = anglesForWord(text, index, compact);

    const tryPlace = (size: number, angle: number) => {
      const metrics = measureWord(text, size, fontWeight);
      const box = rotatedBox(metrics.width, metrics.height, angle);
      if (box.width > width - pad * 2 || box.height > height - pad * 2) return null;

      const fits = (x: number, y: number) => {
        if (
          x - box.width / 2 < pad ||
          x + box.width / 2 > width - pad ||
          y - box.height / 2 < pad ||
          y + box.height / 2 > height - pad
        ) {
          return false;
        }
        return placed.every((item) => !boxesOverlap({ x, y, width: box.width, height: box.height }, item, gap));
      };

      if (index === 0 && fits(cx, cy)) {
        return { x: cx, y: cy, width: box.width, height: box.height, fontSize: size, angle };
      }

      const startTheta = (wordHash(text) % 360) * (Math.PI / 180) + index * 0.55;
      const step = compact ? 0.22 : 0.18;
      const growth = compact ? 1.35 : 2.1;
      for (let radius = 1, theta = startTheta; radius < maxRadius; theta += step) {
        radius = growth * theta;
        const x = cx + radius * Math.cos(theta);
        const y = cy + radius * Math.sin(theta) * ellipticity;
        if (fits(x, y)) {
          return { x, y, width: box.width, height: box.height, fontSize: size, angle };
        }
      }
      return null;
    };

    let candidate: ReturnType<typeof tryPlace> = null;
    for (const size of sizes) {
      for (const angle of angles) {
        candidate = tryPlace(size, angle);
        if (candidate) break;
      }
      if (candidate) break;
    }
    if (!candidate) return;

    placed.push({
      text,
      weight,
      x: candidate.x,
      y: candidate.y,
      fontSize: candidate.fontSize,
      width: candidate.width,
      height: candidate.height,
      angle: candidate.angle,
      t,
      color: t >= 0.78
        ? '#0f172a'
        : t >= 0.5
          ? CLOUD_COLORS[index % 6]
          : CLOUD_COLORS[4 + (index % 4)],
      fontWeight,
    });
  });

  return placed;
}

export const WordCloudCanvas: React.FC<WordCloudCanvasProps> = ({
  words,
  height = 400,
  compact = false,
  activeWord = null,
  onWordClick,
  onWordHover,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height });
  const [hovered, setHoveredState] = useState<string | null>(null);
  const ranked = useMemo(() => normalizeWords(words), [words]);
  const active = activeWord ?? hovered;

  const setHovered = (word: string | null) => {
    setHoveredState(word);
    onWordHover?.(word);
  };

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSize({
      width: Math.round(rect.width),
      height: Math.round(rect.height || height || 168),
    });
  }, [height]);

  useLayoutEffect(() => {
    updateSize();
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateSize, ranked.length]);

  const placed = useMemo(
    () => layoutWordCloud(ranked, size.width, size.height, compact),
    [ranked, size.width, size.height, compact]
  );

  const hoveredWord = placed.find((word) => word.text === active);
  const maxWeight = ranked[0]?.[1] || 1;

  if (ranked.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200"
        style={compact ? undefined : { height }}
      >
        <p className="text-center text-[11px] text-slate-500">No keywords yet</p>
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-col ${compact ? 'h-full min-h-0' : ''}`}>
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,_#ffffff_0%,_#f8fafc_55%,_#f1f5f9_100%)] ring-1 ring-inset ring-slate-200 ${compact ? 'min-h-0 flex-1' : ''}`}
        style={compact ? undefined : { height }}
        onMouseLeave={() => setHovered(null)}
      >
        {placed.map((word) => {
          const isHovered = active === word.text;
          const isDimmed = active !== null && !isHovered;
          return (
            <button
              key={word.text}
              type="button"
              onMouseEnter={() => setHovered(word.text)}
              onFocus={() => setHovered(word.text)}
              onBlur={() => setHovered(null)}
              onClick={() => onWordClick?.(word.text)}
              className={`absolute origin-center whitespace-nowrap rounded-md px-0.5 text-left leading-none outline-none transition-[transform,opacity,color] duration-150 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-slate-400 ${
                onWordClick ? 'cursor-pointer' : 'cursor-default'
              }`}
              style={{
                left: word.x,
                top: word.y,
                fontSize: `${word.fontSize}px`,
                fontWeight: word.fontWeight,
                color: isHovered ? '#0f172a' : word.color,
                opacity: isDimmed ? 0.22 : 1,
                transform: `translate(-50%, -50%) rotate(${word.angle}deg)${!compact && isHovered ? ' scale(1.12)' : ''}`,
                zIndex: isHovered ? 20 : Math.round(word.t * 12),
              }}
              title={word.text}
              aria-label={`${word.text}, ${Math.round((word.weight / maxWeight) * 100)} percent of the top topic`}
            >
              {word.text}
            </button>
          );
        })}
      </div>
      <div className="flex h-5 shrink-0 items-center justify-center px-1">
        {hoveredWord ? (
          <div className="max-w-full truncate text-[10px] font-medium text-slate-600">
            <span className="capitalize">{hoveredWord.text}</span>
            <span className="text-slate-400"> · {Math.round((hoveredWord.weight / maxWeight) * 100)}%</span>
          </div>
        ) : (
          <span className="text-[10px] text-transparent">.</span>
        )}
      </div>
    </div>
  );
};
