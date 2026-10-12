import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  getDimensionMeta,
  type HinaActor,
  type HinaDimension,
} from './hinaCodes';
import type { HinaEdge, HinaProfile } from './hinaAnalysis';
import {
  BW_AXIS,
  BW_CHART_COLORS,
  BW_FILL,
  BW_GRID,
  BW_HEATMAP_SCALE,
  BW_INK,
  BW_MID,
  BW_MUTED,
  BW_PLOT_BG,
} from './chartTheme';

export interface HinaPlotSlide {
  title: string;
  caption: string;
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  height: number;
}

const PLOT_H = 420;
const plotFont = { family: 'Inter, system-ui, sans-serif', color: BW_INK, size: 12 };
const hoverlabel = {
  bgcolor: BW_INK,
  bordercolor: BW_INK,
  font: { color: '#F8FAFC', size: 12, family: plotFont.family },
};
const baseLayout = {
  autosize: true,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: BW_PLOT_BG,
  font: plotFont,
  hoverlabel,
  margin: { l: 52, r: 24, t: 18, b: 52 },
};

const weightOf = (edges: HinaEdge[], actor: HinaActor, codeId: string) =>
  edges.find((edge) => edge.actor === actor && edge.codeId === codeId)?.weight || 0;

const totalForCode = (edges: HinaEdge[], codeId: string) =>
  edges.filter((edge) => edge.codeId === codeId).reduce((sum, edge) => sum + edge.weight, 0);

const dimColor = (dimension: HinaDimension) => getDimensionMeta(dimension).color;

const dimFill = (dimension: HinaDimension, alpha = 0.16) => {
  const meta = getDimensionMeta(dimension);
  return hexAlpha(meta.color, alpha);
};

const hexAlpha = (hex: string, alpha: number) => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const hideAxes = (pad = 0.08) => ({
  xaxis: { visible: false, range: [-pad, 1 + pad] as [number, number], fixedrange: true },
  yaxis: { visible: false, range: [-pad, 1 + pad] as [number, number], fixedrange: true },
});

const bezier = (x0: number, y0: number, x1: number, y1: number, bend = 0.16, steps = 22) => {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    x.push(u * u * x0 + 2 * u * t * cx + t * t * x1);
    y.push(u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
  return { x, y };
};

const curvedEdges = (
  links: Array<{ x0: number; y0: number; x1: number; y1: number; width: number; label: string; color: string; codeId?: string; bend?: number }>
) =>
  links.map((link) => {
    const curve = bezier(link.x0, link.y0, link.x1, link.y1, link.bend ?? 0.14);
    return {
      x: curve.x,
      y: curve.y,
      mode: 'lines',
      line: { color: link.color, width: link.width, shape: 'spline' },
      hovertemplate: `${link.label}<extra></extra>`,
      customdata: curve.x.map(() => link.codeId),
      showlegend: false,
    };
  });

const actorMarkers = (x: number[], y: number[], labels: string[]) => [
  {
    x,
    y,
    mode: 'markers',
    marker: { size: 38, color: labels.map((_, i) => hexAlpha(i === 0 ? BW_CHART_COLORS[0] : BW_CHART_COLORS[4], 0.22)), line: { width: 0 } },
    hoverinfo: 'skip',
    showlegend: false,
  },
  {
    x,
    y,
    mode: 'markers+text',
    text: labels,
    textposition: 'middle center',
    textfont: { size: 11, color: '#F8FAFC', family: plotFont.family },
    marker: {
      size: 28,
      color: [BW_CHART_COLORS[0], BW_CHART_COLORS[4]].slice(0, labels.length),
      line: { color: '#fff', width: 2 },
    },
    hovertemplate: '%{text}<extra></extra>',
    showlegend: false,
  },
];

const codeMarkers = (
  x: number[],
  y: number[],
  codes: Array<{ id: string; shortLabel: string; dimension: HinaDimension }>,
  sizes: number[],
  position = 'middle right'
) => [
  {
    x,
    y,
    mode: 'markers',
    marker: { size: sizes.map((s) => s + 10), color: codes.map((c) => dimFill(c.dimension, 0.2)), line: { width: 0 } },
    hoverinfo: 'skip',
    showlegend: false,
  },
  {
    x,
    y,
    mode: 'markers+text',
    text: codes.map((c) => c.shortLabel),
    textposition: position,
    textfont: { size: 9, color: BW_MID, family: plotFont.family },
    customdata: codes.map((c) => c.id),
    marker: {
      size: sizes,
      color: codes.map((c) => dimColor(c.dimension)),
      line: { color: '#fff', width: 1.4 },
    },
    hovertemplate: '%{text}<extra></extra>',
    showlegend: false,
  },
];

const springLayout = (
  nodeIds: string[],
  links: Array<{ source: string; target: string; weight: number }>,
  rounds = 110
) => {
  const pos = new Map(nodeIds.map((id, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodeIds.length) - Math.PI / 2;
    return [id, { x: 0.5 + 0.34 * Math.cos(angle), y: 0.5 + 0.34 * Math.sin(angle) }] as const;
  }));
  for (let round = 0; round < rounds; round += 1) {
    const disp = new Map(nodeIds.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodeIds.length; i += 1) {
      for (let j = i + 1; j < nodeIds.length; j += 1) {
        const a = pos.get(nodeIds[i])!;
        const b = pos.get(nodeIds[j])!;
        const dx = a.x - b.x || 0.001;
        const dy = a.y - b.y || 0.001;
        const dist = Math.hypot(dx, dy) || 0.001;
        const force = 0.0036 / (dist * dist);
        const ux = (dx / dist) * force;
        const uy = (dy / dist) * force;
        const da = disp.get(nodeIds[i])!;
        const db = disp.get(nodeIds[j])!;
        da.x += ux; da.y += uy;
        db.x -= ux; db.y -= uy;
      }
    }
    for (const link of links) {
      const a = pos.get(link.source);
      const b = pos.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const pull = Math.min(0.09, 0.014 * link.weight * dist);
      const ux = (dx / dist) * pull;
      const uy = (dy / dist) * pull;
      const da = disp.get(link.source)!;
      const db = disp.get(link.target)!;
      da.x += ux; da.y += uy;
      db.x -= ux; db.y -= uy;
    }
    const cool = 0.88 - round / (rounds * 1.35);
    for (const id of nodeIds) {
      const p = pos.get(id)!;
      const d = disp.get(id)!;
      p.x = Math.min(0.96, Math.max(0.04, p.x + d.x * cool));
      p.y = Math.min(0.96, Math.max(0.04, p.y + d.y * cool));
    }
  }
  return pos;
};

const bipartitePlot = (edges: HinaEdge[]): HinaPlotSlide => {
  const leftY = [0.74, 0.26];
  const codeY = HINA_CODES.map((_, index) => 0.98 - index / Math.max(1, HINA_CODES.length - 1) * 0.96);
  const links = edges.flatMap((edge) => {
    const toIndex = HINA_CODES.findIndex((code) => code.id === edge.codeId);
    if (toIndex < 0) return [];
    const code = HINA_CODES[toIndex];
    return [{
      x0: 0.16,
      y0: edge.actor === 'me' ? leftY[0] : leftY[1],
      x1: 0.58,
      y1: codeY[toIndex],
      width: Math.max(1.2, Math.min(8.5, 0.7 + edge.weight * 1.15)),
      label: `${edge.actor === 'me' ? 'Me' : 'AI'} → ${code.shortLabel} · ${edge.weight}`,
      color: hexAlpha(dimColor(code.dimension), 0.38 + Math.min(0.4, edge.weight * 0.06)),
      codeId: edge.codeId,
      bend: edge.actor === 'me' ? 0.1 : -0.1,
    }];
  });
  return {
    title: 'Bipartite network',
    caption: 'NetworkX bipartite_layout: speakers on the left, 19 codes on the right. Curve thickness is how often the move appeared.',
    height: PLOT_H,
    data: [
      ...curvedEdges(links),
      ...actorMarkers([0.16, 0.16], leftY, ['Me', 'AI']),
      ...codeMarkers(
        HINA_CODES.map(() => 0.58),
        codeY,
        HINA_CODES,
        HINA_CODES.map((code) => Math.max(10, Math.min(18, 8 + totalForCode(edges, code.id))))
      ),
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.04), hovermode: 'closest', margin: { l: 28, r: 138, t: 10, b: 10 }, showlegend: false },
  };
};

const springPlot = (edges: HinaEdge[], title = 'Spring layout', caption = 'NetworkX spring_layout: stronger ties pull nodes closer together.'): HinaPlotSlide => {
  const usedCodes = HINA_CODES.filter((code) => totalForCode(edges, code.id) > 0);
  const nodes = ['me', 'ai', ...usedCodes.map((code) => code.id)];
  const links = edges
    .filter((edge) => usedCodes.some((code) => code.id === edge.codeId))
    .map((edge) => ({ source: edge.actor, target: edge.codeId, weight: edge.weight }));
  const pos = springLayout(nodes, links);
  const me = pos.get('me')!;
  const ai = pos.get('ai')!;
  const drawn = links.map((link) => {
    const from = pos.get(link.source)!;
    const to = pos.get(link.target)!;
    const code = HINA_CODE_BY_ID[link.target];
    return {
      x0: from.x, y0: from.y, x1: to.x, y1: to.y,
      width: Math.max(1.2, Math.min(7.5, 0.8 + link.weight)),
      label: `${link.source === 'me' ? 'Me' : 'AI'} → ${code?.shortLabel} · ${link.weight}`,
      color: hexAlpha(code ? dimColor(code.dimension) : BW_INK, 0.42),
      codeId: link.target,
      bend: 0.08,
    };
  });
  return {
    title,
    caption,
    height: PLOT_H,
    data: [
      ...curvedEdges(drawn),
      ...actorMarkers([me.x, ai.x], [me.y, ai.y], ['Me', 'AI']),
      ...codeMarkers(
        usedCodes.map((code) => pos.get(code.id)!.x),
        usedCodes.map((code) => pos.get(code.id)!.y),
        usedCodes,
        usedCodes.map((code) => Math.max(11, Math.min(20, 8 + totalForCode(edges, code.id)))),
        'bottom center'
      ),
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.06), hovermode: 'closest', margin: { l: 12, r: 12, t: 12, b: 12 }, showlegend: false },
  };
};

const circularPlot = (edges: HinaEdge[]): HinaPlotSlide => {
  const codePos = HINA_CODES.map((code, index) => {
    const angle = (Math.PI * 2 * index) / HINA_CODES.length - Math.PI / 2;
    return { code, x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
  });
  const me = { x: 0.42, y: 0.5 };
  const ai = { x: 0.58, y: 0.5 };
  const links = edges.flatMap((edge) => {
    const node = codePos.find((item) => item.code.id === edge.codeId);
    if (!node) return [];
    const from = edge.actor === 'me' ? me : ai;
    return [{
      x0: from.x, y0: from.y, x1: node.x, y1: node.y,
      width: Math.max(1.1, Math.min(7.5, 0.7 + edge.weight)),
      label: `${edge.actor === 'me' ? 'Me' : 'AI'} → ${node.code.shortLabel}`,
      color: hexAlpha(dimColor(node.code.dimension), 0.4),
      codeId: edge.codeId,
      bend: 0.18,
    }];
  });
  const ring = Array.from({ length: 73 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 72;
    return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
  });
  return {
    title: 'Circular layout',
    caption: 'NetworkX circular_layout: codes on a ring, speakers in the core. Same ties, a cleaner geometry.',
    height: PLOT_H,
    data: [
      {
        x: ring.map((p) => p.x),
        y: ring.map((p) => p.y),
        mode: 'lines',
        line: { color: hexAlpha(BW_INK, 0.08), width: 10 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      ...curvedEdges(links),
      ...actorMarkers([me.x, ai.x], [me.y, ai.y], ['Me', 'AI']),
      ...codeMarkers(
        codePos.map((item) => item.x),
        codePos.map((item) => item.y),
        codePos.map((item) => item.code),
        codePos.map((item) => Math.max(10, Math.min(18, 8 + totalForCode(edges, item.code.id)))),
        'top center'
      ),
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.08), hovermode: 'closest', margin: { l: 16, r: 16, t: 16, b: 16 }, showlegend: false },
  };
};

const shellPlot = (edges: HinaEdge[]): HinaPlotSlide => {
  const inner = [
    { id: 'me', x: 0.5 + 0.13 * Math.cos(Math.PI), y: 0.5 + 0.13 * Math.sin(Math.PI), label: 'Me' },
    { id: 'ai', x: 0.5 + 0.13 * Math.cos(0), y: 0.5 + 0.13 * Math.sin(0), label: 'AI' },
  ];
  const codePos = HINA_CODES.map((code, index) => {
    const angle = (Math.PI * 2 * index) / HINA_CODES.length - Math.PI / 2;
    return { code, x: 0.5 + 0.41 * Math.cos(angle), y: 0.5 + 0.41 * Math.sin(angle) };
  });
  const shells = [0.13, 0.41].flatMap((r) =>
    Array.from({ length: 73 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 72;
      return { x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle), r };
    })
  );
  const links = edges.flatMap((edge) => {
    const node = codePos.find((item) => item.code.id === edge.codeId);
    const from = inner.find((item) => item.id === edge.actor);
    if (!node || !from) return [];
    return [{
      x0: from.x, y0: from.y, x1: node.x, y1: node.y,
      width: Math.max(1.1, Math.min(7.5, 0.7 + edge.weight)),
      label: `${from.label} → ${node.code.shortLabel} · ${edge.weight}`,
      color: hexAlpha(dimColor(node.code.dimension), 0.38),
      codeId: edge.codeId,
      bend: 0.12,
    }];
  });
  return {
    title: 'Shell layout',
    caption: 'NetworkX shell_layout: Me and AI on an inner ring, codes on the outer ring grouped by dimension.',
    height: PLOT_H,
    data: [
      {
        x: shells.filter((p) => p.r === 0.13).map((p) => p.x),
        y: shells.filter((p) => p.r === 0.13).map((p) => p.y),
        mode: 'lines',
        line: { color: hexAlpha(BW_INK, 0.1), width: 1 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        x: shells.filter((p) => p.r === 0.41).map((p) => p.x),
        y: shells.filter((p) => p.r === 0.41).map((p) => p.y),
        mode: 'lines',
        line: { color: hexAlpha(BW_INK, 0.08), width: 8 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      ...curvedEdges(links),
      ...actorMarkers(inner.map((item) => item.x), inner.map((item) => item.y), inner.map((item) => item.label)),
      ...codeMarkers(
        codePos.map((item) => item.x),
        codePos.map((item) => item.y),
        codePos.map((item) => item.code),
        codePos.map((item) => Math.max(10, Math.min(18, 8 + totalForCode(edges, item.code.id)))),
        'top center'
      ),
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.08), hovermode: 'closest', margin: { l: 16, r: 16, t: 16, b: 16 }, showlegend: false },
  };
};

const chordPlot = (edges: HinaEdge[]): HinaPlotSlide => {
  const nodes = [
    { id: 'me', label: 'Me', color: BW_CHART_COLORS[0] },
    { id: 'ai', label: 'AI', color: BW_CHART_COLORS[4] },
    ...HINA_CODES.map((code) => ({ id: code.id, label: code.shortLabel, color: dimColor(code.dimension) })),
  ];
  const pos = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    return { ...node, angle, x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
  });
  const indexOf = (id: string) => pos.findIndex((item) => item.id === id);
  const ribbons = edges.flatMap((edge) => {
    const a = pos[indexOf(edge.actor)];
    const b = pos[indexOf(edge.codeId)];
    if (!a || !b) return [];
    const curve = bezier(a.x, a.y, b.x, b.y, 0.22, 20);
    const code = HINA_CODE_BY_ID[edge.codeId];
    return [{
      x: [...curve.x, a.x],
      y: [...curve.y, a.y],
      fill: 'toself',
      fillcolor: hexAlpha(code ? dimColor(code.dimension) : BW_INK, 0.14 + Math.min(0.22, edge.weight * 0.04)),
      line: { color: hexAlpha(code ? dimColor(code.dimension) : BW_INK, 0.45), width: Math.max(1, Math.min(4, 0.6 + edge.weight * 0.45)) },
      mode: 'lines',
      hovertemplate: `${edge.actor === 'me' ? 'Me' : 'AI'} → ${code?.shortLabel} · ${edge.weight}<extra></extra>`,
      customdata: curve.x.map(() => edge.codeId),
      showlegend: false,
    }];
  });
  const ring = Array.from({ length: 73 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 72;
    return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
  });
  return {
    title: 'Chord diagram',
    caption: 'A chord view of the same graph: ribbons run between speakers and codes. Thicker, darker ribbons are habitual moves.',
    height: PLOT_H,
    data: [
      {
        x: ring.map((p) => p.x),
        y: ring.map((p) => p.y),
        mode: 'lines',
        line: { color: hexAlpha(BW_INK, 0.08), width: 14 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      ...ribbons,
      {
        x: pos.map((item) => item.x),
        y: pos.map((item) => item.y),
        mode: 'markers',
        marker: { size: 22, color: pos.map((item) => hexAlpha(item.color, 0.2)), line: { width: 0 } },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        x: pos.map((item) => item.x),
        y: pos.map((item) => item.y),
        mode: 'markers+text',
        text: pos.map((item) => item.label),
        textposition: 'top center',
        textfont: { size: 9, color: BW_MID },
        customdata: pos.map((item) => (item.id === 'me' || item.id === 'ai' ? null : item.id)),
        marker: { size: 13, color: pos.map((item) => item.color), line: { color: '#fff', width: 1.4 } },
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
      },
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.1), hovermode: 'closest', margin: { l: 18, r: 18, t: 22, b: 18 }, showlegend: false },
  };
};

export const networkSlides = (edges: HinaEdge[]): HinaPlotSlide[] => [
  bipartitePlot(edges),
  springPlot(edges),
  circularPlot(edges),
  shellPlot(edges),
  chordPlot(edges),
];

const axisY = {
  title: { text: 'Coded turns', font: { size: 12, color: BW_MUTED } },
  gridcolor: BW_GRID,
  linecolor: BW_AXIS,
  zeroline: false,
  rangemode: 'tozero' as const,
};

const portraitButterfly = (profile: HinaProfile): HinaPlotSlide => {
  const meVals = HINA_DIMENSIONS.map((item) => profile.quantityByDimension.me[item.id] || 0);
  const aiVals = HINA_DIMENSIONS.map((item) => profile.quantityByDimension.ai[item.id] || 0);
  const span = Math.max(1, ...meVals, ...aiVals);
  const step = span <= 6 ? 1 : Math.ceil(span / 5);
  const ticks: number[] = [];
  for (let value = -span; value <= span; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] !== span) ticks.push(span);
  return {
    title: 'Butterfly portrait',
    caption: 'You open to the left, the tutor to the right. Length is coded turns on each HINA dimension.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        name: 'You',
        orientation: 'h',
        y: HINA_DIMENSIONS.map((item) => item.label),
        x: meVals.map((value) => -value),
        marker: { color: BW_CHART_COLORS[0], line: { color: '#fff', width: 1 } },
        hovertemplate: 'You · %{y}: %{customdata}<extra></extra>',
        customdata: meVals,
      },
      {
        type: 'bar',
        name: 'Tutor',
        orientation: 'h',
        y: HINA_DIMENSIONS.map((item) => item.label),
        x: aiVals,
        marker: { color: BW_CHART_COLORS[4], line: { color: '#fff', width: 1 } },
        hovertemplate: 'Tutor · %{y}: %{x}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      barmode: 'relative',
      bargap: 0.28,
      xaxis: {
        gridcolor: BW_GRID,
        linecolor: BW_AXIS,
        zeroline: true,
        zerolinecolor: BW_INK,
        tickmode: 'array',
        tickvals: ticks,
        ticktext: ticks.map((value) => String(Math.abs(value))),
        title: { text: '← You  Tutor →', font: { size: 12, color: BW_MUTED } },
      },
      yaxis: { automargin: true, tickfont: { size: 12, color: BW_MID } },
      legend: { orientation: 'h', y: 1.12 },
      margin: { l: 120, r: 24, t: 28, b: 48 },
    },
  };
};

const portraitRadar = (profile: HinaProfile): HinaPlotSlide => {
  const theta = [...HINA_DIMENSIONS.map((item) => item.label), HINA_DIMENSIONS[0].label];
  const close = (actor: HinaActor) => [
    ...HINA_DIMENSIONS.map((item) => profile.quantityByDimension[actor][item.id] || 0),
    profile.quantityByDimension[actor][HINA_DIMENSIONS[0].id] || 0,
  ];
  return {
    title: 'Radar portrait',
    caption: 'Four-dimension radar. Similar shapes mean you and the tutor are using the same mix of moves.',
    height: PLOT_H,
    data: [
      { type: 'scatterpolar', r: close('me'), theta, fill: 'toself', name: 'You', line: { color: BW_CHART_COLORS[0], width: 2.4 }, fillcolor: BW_FILL, marker: { size: 7, color: BW_CHART_COLORS[0] } },
      { type: 'scatterpolar', r: close('ai'), theta, fill: 'toself', name: 'Tutor', line: { color: BW_CHART_COLORS[4], width: 2.4 }, fillcolor: 'rgba(100, 116, 139, 0.16)', marker: { size: 7, color: BW_CHART_COLORS[4] } },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      polar: {
        bgcolor: BW_PLOT_BG,
        radialaxis: { gridcolor: BW_GRID, linecolor: BW_AXIS, tickfont: { size: 10, color: BW_MUTED }, angle: 90 },
        angularaxis: { tickfont: { size: 12, color: BW_INK }, gridcolor: BW_GRID, linecolor: BW_AXIS },
      },
      legend: { orientation: 'h', y: 1.12 },
      margin: { l: 40, r: 40, t: 28, b: 28 },
    },
  };
};

const portraitNightingale = (profile: HinaProfile): HinaPlotSlide => {
  const theta = HINA_DIMENSIONS.map((item) => item.label);
  return {
    title: 'Nightingale rose',
    caption: 'Polar bars of the four dimensions. Area grows with how much that side of the chat is used.',
    height: PLOT_H,
    data: [
      {
        type: 'barpolar',
        name: 'You',
        r: HINA_DIMENSIONS.map((item) => profile.quantityByDimension.me[item.id] || 0),
        theta,
        marker: { color: hexAlpha(BW_CHART_COLORS[0], 0.82), line: { color: '#fff', width: 1 } },
      },
      {
        type: 'barpolar',
        name: 'Tutor',
        r: HINA_DIMENSIONS.map((item) => profile.quantityByDimension.ai[item.id] || 0),
        theta,
        marker: { color: hexAlpha(BW_CHART_COLORS[4], 0.7), line: { color: '#fff', width: 1 } },
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      polar: {
        bgcolor: BW_PLOT_BG,
        bargap: 0.18,
        radialaxis: { gridcolor: BW_GRID, tickfont: { size: 10, color: BW_MUTED } },
        angularaxis: { tickfont: { size: 12, color: BW_INK }, gridcolor: BW_GRID },
      },
      legend: { orientation: 'h', y: 1.12 },
      margin: { l: 40, r: 40, t: 28, b: 28 },
    },
  };
};

const portraitHeat = (profile: HinaProfile): HinaPlotSlide => {
  const z = [
    HINA_DIMENSIONS.map((item) => profile.quantityByDimension.me[item.id] || 0),
    HINA_DIMENSIONS.map((item) => profile.quantityByDimension.ai[item.id] || 0),
  ];
  return {
    title: 'Quantity heatmap',
    caption: 'Speaker × dimension intensity. Numbers sit on the cells so you can read both pattern and count.',
    height: PLOT_H,
    data: [{
      type: 'heatmap',
      z,
      x: HINA_DIMENSIONS.map((item) => item.label),
      y: ['You', 'Tutor'],
      colorscale: BW_HEATMAP_SCALE,
      hovertemplate: '%{y} · %{x}: %{z}<extra></extra>',
      xgap: 6,
      ygap: 6,
      text: z.map((row) => row.map((value) => String(value))),
      texttemplate: '%{text}',
      textfont: { color: '#F8FAFC', size: 14 },
    }],
    layout: { ...baseLayout, height: PLOT_H, margin: { l: 80, r: 24, t: 16, b: 48 } },
  };
};

const portraitTreemap = (profile: HinaProfile): HinaPlotSlide => {
  const labels = ['Your mix', ...HINA_DIMENSIONS.map((item) => item.label)];
  const parents = ['', ...HINA_DIMENSIONS.map(() => 'Your mix')];
  const values = [0, ...HINA_DIMENSIONS.map((item) => profile.quantityByDimension.me[item.id] || 0)];
  const colors = [BW_PLOT_BG, ...HINA_DIMENSIONS.map((item) => item.color)];
  HINA_CODES.forEach((code) => {
    const w = weightOf(profile.edges, 'me', code.id);
    if (!w) return;
    labels.push(code.shortLabel);
    parents.push(getDimensionMeta(code.dimension).label);
    values.push(w);
    colors.push(dimColor(code.dimension));
  });
  return {
    title: 'Your code treemap',
    caption: 'Area is how much of your talk sits in each dimension and code. Large tiles are your habitual moves.',
    height: PLOT_H,
    data: [{
      type: 'treemap',
      labels,
      parents,
      values,
      marker: { colors, line: { color: '#fff', width: 2 } },
      textfont: { size: 13, color: '#F8FAFC', family: plotFont.family },
      hovertemplate: '%{label}<br>%{value} turns<extra></extra>',
      tiling: { packing: 'squarify' },
    }],
    layout: { ...baseLayout, height: PLOT_H, margin: { l: 8, r: 8, t: 8, b: 8 } },
  };
};

export const portraitSlides = (profile: HinaProfile): HinaPlotSlide[] => [
  portraitButterfly(profile),
  portraitRadar(profile),
  portraitNightingale(profile),
  portraitHeat(profile),
  portraitTreemap(profile),
];

const diversityScore = (profile: HinaProfile): HinaPlotSlide => ({
  title: 'Diversity gauges',
  caption: '0 is a single repeated move. 1 is an even mix across the 19 codes. Volume is ignored here.',
  height: PLOT_H,
  data: [
    {
      type: 'indicator',
      mode: 'gauge+number',
      value: profile.diversityByActor.me,
      title: { text: 'You', font: { size: 14, color: BW_INK } },
      number: { valueformat: '.2f', font: { color: BW_INK } },
      gauge: {
        axis: { range: [0, 1], tickcolor: BW_AXIS },
        bar: { color: BW_CHART_COLORS[0] },
        bgcolor: BW_PLOT_BG,
        bordercolor: BW_GRID,
        steps: [
          { range: [0, 0.35], color: hexAlpha(BW_CHART_COLORS[0], 0.08) },
          { range: [0.35, 0.65], color: hexAlpha(BW_CHART_COLORS[0], 0.16) },
          { range: [0.65, 1], color: hexAlpha(BW_CHART_COLORS[0], 0.28) },
        ],
      },
      domain: { x: [0, 0.48], y: [0, 1] },
    },
    {
      type: 'indicator',
      mode: 'gauge+number',
      value: profile.diversityByActor.ai,
      title: { text: 'Tutor', font: { size: 14, color: BW_INK } },
      number: { valueformat: '.2f', font: { color: BW_INK } },
      gauge: {
        axis: { range: [0, 1], tickcolor: BW_AXIS },
        bar: { color: BW_CHART_COLORS[4] },
        bgcolor: BW_PLOT_BG,
        bordercolor: BW_GRID,
        steps: [
          { range: [0, 0.35], color: hexAlpha(BW_CHART_COLORS[4], 0.08) },
          { range: [0.35, 0.65], color: hexAlpha(BW_CHART_COLORS[4], 0.16) },
          { range: [0.65, 1], color: hexAlpha(BW_CHART_COLORS[4], 0.28) },
        ],
      },
      domain: { x: [0.52, 1], y: [0, 1] },
    },
  ],
  layout: { ...baseLayout, height: PLOT_H, margin: { l: 24, r: 24, t: 36, b: 16 } },
});

const diversitySunburst = (profile: HinaProfile): HinaPlotSlide => {
  const labels = ['You'];
  const parents = [''];
  const values = [0];
  const colors = [BW_CHART_COLORS[0]];
  HINA_DIMENSIONS.forEach((dimension) => {
    labels.push(dimension.label);
    parents.push('You');
    values.push(profile.quantityByDimension.me[dimension.id] || 0);
    colors.push(dimension.color);
  });
  HINA_CODES.forEach((code) => {
    const w = weightOf(profile.edges, 'me', code.id);
    if (!w) return;
    labels.push(code.shortLabel);
    parents.push(getDimensionMeta(code.dimension).label);
    values.push(w);
    colors.push(dimColor(code.dimension));
  });
  return {
    title: 'Strategy sunburst',
    caption: 'Your mix from dimension down to code. A few fat slices means a narrow strategy, not a quiet chat.',
    height: PLOT_H,
    data: [{
      type: 'sunburst',
      labels,
      parents,
      values,
      marker: { colors, line: { color: '#fff', width: 1.5 } },
      hovertemplate: '%{label}<br>%{value} turns<extra></extra>',
      textfont: { size: 12, family: plotFont.family },
    }],
    layout: { ...baseLayout, height: PLOT_H, margin: { l: 8, r: 8, t: 8, b: 8 } },
  };
};

const diversityPareto = (profile: HinaProfile): HinaPlotSlide => {
  const ranked = HINA_CODES
    .map((code) => ({ code, value: weightOf(profile.edges, 'me', code.id) }))
    .sort((a, b) => b.value - a.value);
  const total = ranked.reduce((sum, item) => sum + item.value, 0) || 1;
  let running = 0;
  const cumulative = ranked.map((item) => {
    running += item.value;
    return running / total;
  });
  return {
    title: 'Concentration curve',
    caption: 'How quickly your turns pile onto a few codes. A steep rise means you keep using the same move.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        name: 'Your turns',
        x: ranked.map((item) => item.code.shortLabel),
        y: ranked.map((item) => item.value),
        marker: { color: ranked.map((item) => dimColor(item.code.dimension)), line: { color: '#fff', width: 0.6 } },
        customdata: ranked.map((item) => item.code.id),
      },
      {
        type: 'scatter',
        name: 'Cumulative',
        x: ranked.map((item) => item.code.shortLabel),
        y: cumulative,
        yaxis: 'y2',
        mode: 'lines+markers',
        line: { color: BW_CHART_COLORS[0], width: 2.4, shape: 'spline' },
        marker: { size: 7, color: BW_CHART_COLORS[0], line: { color: '#fff', width: 1 } },
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      xaxis: { tickangle: -32, tickfont: { size: 9, color: BW_MID } },
      yaxis: { title: { text: 'Turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      yaxis2: { overlaying: 'y', side: 'right', range: [0, 1.05], title: { text: 'Share', font: { size: 12, color: BW_MUTED } }, gridcolor: 'rgba(0,0,0,0)' },
      legend: { orientation: 'h', y: 1.12 },
    },
  };
};

const diversityLollipop = (profile: HinaProfile): HinaPlotSlide => {
  const rows = HINA_CODES
    .map((code) => ({ code, me: weightOf(profile.edges, 'me', code.id), ai: weightOf(profile.edges, 'ai', code.id) }))
    .filter((item) => item.me + item.ai > 0)
    .sort((a, b) => a.me + a.ai - (b.me + b.ai));
  return {
    title: 'You vs tutor stems',
    caption: 'Each line is one code. Circles are you, diamonds are the tutor. Long gaps mean you use the code very differently.',
    height: PLOT_H,
    data: [
      ...rows.map((item) => ({
        type: 'scatter',
        mode: 'lines',
        x: [item.me, item.ai],
        y: [item.code.shortLabel, item.code.shortLabel],
        line: { color: hexAlpha(dimColor(item.code.dimension), 0.35), width: 4 },
        showlegend: false,
        hoverinfo: 'skip',
      })),
      {
        type: 'scatter',
        mode: 'markers',
        name: 'You',
        x: rows.map((item) => item.me),
        y: rows.map((item) => item.code.shortLabel),
        marker: { size: 11, color: BW_CHART_COLORS[0], line: { color: '#fff', width: 1.2 } },
        customdata: rows.map((item) => item.code.id),
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Tutor',
        x: rows.map((item) => item.ai),
        y: rows.map((item) => item.code.shortLabel),
        marker: { size: 11, color: BW_CHART_COLORS[4], symbol: 'diamond', line: { color: '#fff', width: 1.2 } },
        customdata: rows.map((item) => item.code.id),
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      xaxis: { title: { text: 'Turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      yaxis: { automargin: true, tickfont: { size: 10, color: BW_MID } },
      legend: { orientation: 'h', y: 1.12 },
      margin: { l: 120, r: 20, t: 28, b: 48 },
    },
  };
};

const diversityStacked = (profile: HinaProfile): HinaPlotSlide => ({
  title: 'Dimension mix',
  caption: '100% stacked mix. Compare the share of cognitive / meta / social / coordinative talk, not the raw count.',
  height: PLOT_H,
  data: HINA_DIMENSIONS.map((dimension) => ({
    type: 'bar',
    name: dimension.label,
    x: ['You', 'Tutor'],
    y: [profile.quantityByDimension.me[dimension.id] || 0, profile.quantityByDimension.ai[dimension.id] || 0],
    marker: { color: dimension.color, line: { color: '#fff', width: 1 } },
  })),
  layout: {
    ...baseLayout,
    height: PLOT_H,
    barmode: 'stack',
    barnorm: 'percent',
    yaxis: { title: { text: 'Share of coded turns', font: { size: 12, color: BW_MUTED } }, ticksuffix: '%', gridcolor: BW_GRID, rangemode: 'tozero' },
    legend: { orientation: 'h', y: 1.12 },
  },
});

export const diversitySlides = (profile: HinaProfile): HinaPlotSlide[] => [
  diversityScore(profile),
  diversitySunburst(profile),
  diversityStacked(profile),
  diversityPareto(profile),
  diversityLollipop(profile),
];

const patternBars = (edges: HinaEdge[]): HinaPlotSlide => {
  const rows = edges.slice().sort((a, b) => b.weight - a.weight).slice(0, 12);
  return {
    title: 'Strongest ties',
    caption: 'Top speaker–code ties. Dark bars are statistically stable; lighter bars still appear but may be chance.',
    height: PLOT_H,
    data: [{
      type: 'bar',
      orientation: 'h',
      x: rows.map((edge) => edge.weight),
      y: rows.map((edge) => `${edge.actor === 'me' ? 'You' : 'Tutor'} · ${HINA_CODE_BY_ID[edge.codeId]?.shortLabel || edge.codeId}`),
      marker: {
        color: rows.map((edge) => (edge.significant ? BW_CHART_COLORS[0] : BW_CHART_COLORS[4])),
        line: { color: '#fff', width: 0.8 },
      },
      customdata: rows.map((edge) => edge.codeId),
      hovertemplate: '%{y}: %{x} turns<extra></extra>',
    }],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      xaxis: { title: { text: 'Turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      yaxis: { automargin: true },
      showlegend: false,
      margin: { l: 168, r: 20, t: 16, b: 48 },
    },
  };
};

const patternScatter = (edges: HinaEdge[]): HinaPlotSlide => ({
  title: 'Weight vs chance',
  caption: 'Right = used more. Lower = less likely random. Click a point to open the original turns.',
  height: PLOT_H,
  data: [
    {
      type: 'scatter',
      mode: 'lines',
      x: [0, Math.max(1, ...edges.map((e) => e.weight), 4)],
      y: [0.05, 0.05],
      line: { color: hexAlpha(BW_INK, 0.15), width: 1, dash: 'dot' },
      hoverinfo: 'skip',
      showlegend: false,
    },
    {
      type: 'scatter',
      mode: 'markers+text',
      x: edges.map((edge) => edge.weight),
      y: edges.map((edge) => edge.pValue),
      text: edges.map((edge) => HINA_CODE_BY_ID[edge.codeId]?.shortLabel || ''),
      textposition: 'top center',
      textfont: { size: 9, color: BW_MID },
      customdata: edges.map((edge) => edge.codeId),
      marker: {
        size: edges.map((edge) => Math.max(10, Math.min(22, 8 + edge.weight * 1.4))),
        color: edges.map((edge) => (edge.actor === 'me' ? BW_CHART_COLORS[0] : BW_CHART_COLORS[4])),
        opacity: 0.9,
        line: { color: '#fff', width: 1.4 },
      },
      hovertemplate: '%{text}<br>weight %{x}, p %{y:.3f}<extra></extra>',
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    xaxis: { title: { text: 'Weight', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
    yaxis: { title: { text: 'p-value', font: { size: 12, color: BW_MUTED } }, range: [0, 1.05], gridcolor: BW_GRID },
    showlegend: false,
    annotations: [{ text: 'p = 0.05', x: 0, y: 0.05, xref: 'paper', showarrow: false, font: { size: 10, color: BW_MUTED }, xanchor: 'left', yshift: 8 }],
  },
});

const patternArc = (edges: HinaEdge[]): HinaPlotSlide => {
  const used = HINA_CODES.filter((code) => totalForCode(edges, code.id) > 0);
  const xs = used.map((_, i) => (used.length <= 1 ? 0.5 : i / Math.max(1, used.length - 1)));
  const arcs = edges.flatMap((edge) => {
    const idx = used.findIndex((code) => code.id === edge.codeId);
    if (idx < 0) return [];
    const x1 = xs[idx];
    const x0 = edge.actor === 'me' ? -0.08 : 1.08;
    const y0 = edge.actor === 'me' ? 0.08 : 0.08;
    const lift = 0.22 + Math.min(0.55, edge.weight * 0.08);
    const curve = bezier(x0, y0, x1, 0.08, lift, 28);
    const code = used[idx];
    return [{
      x: curve.x,
      y: curve.y,
      mode: 'lines',
      line: { color: hexAlpha(dimColor(code.dimension), 0.45), width: Math.max(1.3, Math.min(7, 0.8 + edge.weight)) },
      hovertemplate: `${edge.actor === 'me' ? 'Me' : 'AI'} → ${code.shortLabel} · ${edge.weight}<extra></extra>`,
      customdata: curve.x.map(() => edge.codeId),
      showlegend: false,
    }];
  });
  return {
    title: 'Arc diagram',
    caption: 'NetworkX-style arc diagram: codes along the base, speakers at the ends. Taller arcs are heavier ties.',
    height: PLOT_H,
    data: [
      ...arcs,
      {
        x: [-0.08, 1.08],
        y: [0.08, 0.08],
        mode: 'markers+text',
        text: ['Me', 'AI'],
        textposition: 'bottom center',
        marker: { size: 16, color: [BW_CHART_COLORS[0], BW_CHART_COLORS[4]], line: { color: '#fff', width: 1.5 } },
        showlegend: false,
        hovertemplate: '%{text}<extra></extra>',
      },
      ...codeMarkers(
        xs,
        used.map(() => 0.08),
        used,
        used.map((code) => Math.max(10, Math.min(18, 8 + totalForCode(edges, code.id)))),
        'bottom center'
      ),
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      xaxis: { visible: false, range: [-0.18, 1.18], fixedrange: true },
      yaxis: { visible: false, range: [-0.12, 1.05], fixedrange: true },
      hovermode: 'closest',
      margin: { l: 16, r: 16, t: 12, b: 48 },
      showlegend: false,
    },
  };
};

const patternHeat = (edges: HinaEdge[]): HinaPlotSlide => {
  const z = [
    HINA_CODES.map((code) => weightOf(edges, 'me', code.id)),
    HINA_CODES.map((code) => weightOf(edges, 'ai', code.id)),
  ];
  return {
    title: 'Adjacency matrix',
    caption: 'Actor × code matrix of the interaction network. Darker cells are the stable habits in this chat.',
    height: PLOT_H,
    data: [{
      type: 'heatmap',
      z,
      x: HINA_CODES.map((code) => code.shortLabel),
      y: ['You', 'Tutor'],
      colorscale: BW_HEATMAP_SCALE,
      hovertemplate: '%{y} · %{x}: %{z}<extra></extra>',
      xgap: 2,
      ygap: 4,
      customdata: [HINA_CODES.map((c) => c.id), HINA_CODES.map((c) => c.id)],
    }],
    layout: { ...baseLayout, height: PLOT_H, xaxis: { tickangle: -42, tickfont: { size: 9, color: BW_MID } }, margin: { l: 72, r: 16, t: 16, b: 96 } },
  };
};

export const patternSlides = (edges: HinaEdge[]): HinaPlotSlide[] => [
  patternBars(edges),
  patternScatter(edges),
  springPlot(edges, 'Ego network', 'Force-directed view of the ties in this filter. Click a code node to open quotes.'),
  patternArc(edges),
  patternHeat(edges),
];

const COMPARE_CODES = ['direct-solution-request', 'direct-solution-provide', 'planning', 'monitoring', 'idea-explanation-sharing'];

const countCode = (profile: HinaProfile | null, actor: HinaActor, codeId: string) =>
  profile?.edges.find((edge) => edge.actor === actor && edge.codeId === codeId)?.weight || 0;

const compareGrouped = (current: HinaProfile, previous: HinaProfile | null, week: HinaProfile | null): HinaPlotSlide => ({
  title: 'This / previous / week',
  caption: 'Your turns on five key codes across this chat, the previous session, and this week.',
  height: PLOT_H,
  data: [
    { type: 'bar', name: 'This chat', x: COMPARE_CODES.map((id) => HINA_CODE_BY_ID[id].shortLabel), y: COMPARE_CODES.map((id) => countCode(current, 'me', id)), marker: { color: BW_CHART_COLORS[0], line: { color: '#fff', width: 0.8 } } },
    { type: 'bar', name: 'Previous', x: COMPARE_CODES.map((id) => HINA_CODE_BY_ID[id].shortLabel), y: COMPARE_CODES.map((id) => countCode(previous, 'me', id)), marker: { color: BW_CHART_COLORS[3], line: { color: '#fff', width: 0.8 } } },
    { type: 'bar', name: 'This week', x: COMPARE_CODES.map((id) => HINA_CODE_BY_ID[id].shortLabel), y: COMPARE_CODES.map((id) => countCode(week, 'me', id)), marker: { color: BW_CHART_COLORS[5], line: { color: '#fff', width: 0.8 } } },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    barmode: 'group',
    bargap: 0.28,
    yaxis: axisY,
    xaxis: { tickangle: -18, tickfont: { size: 10, color: BW_MID } },
    legend: { orientation: 'h', y: 1.14 },
  },
});

const compareRadar = (current: HinaProfile, previous: HinaProfile | null): HinaPlotSlide => {
  const theta = [...HINA_DIMENSIONS.map((item) => item.label), HINA_DIMENSIONS[0].label];
  const series = (profile: HinaProfile | null) => [
    ...HINA_DIMENSIONS.map((item) => profile?.quantityByDimension.me[item.id] || 0),
    profile?.quantityByDimension.me[HINA_DIMENSIONS[0].id] || 0,
  ];
  return {
    title: 'Portrait shift',
    caption: 'Your four-dimension shape this chat versus the previous session.',
    height: PLOT_H,
    data: [
      { type: 'scatterpolar', r: series(current), theta, fill: 'toself', name: 'This chat', line: { color: BW_CHART_COLORS[0], width: 2.4 }, fillcolor: BW_FILL, marker: { size: 7, color: BW_CHART_COLORS[0] } },
      { type: 'scatterpolar', r: series(previous), theta, fill: 'toself', name: 'Previous', line: { color: BW_CHART_COLORS[4], width: 2.4 }, fillcolor: 'rgba(100, 116, 139, 0.14)', marker: { size: 7, color: BW_CHART_COLORS[4] } },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      polar: {
        bgcolor: BW_PLOT_BG,
        radialaxis: { gridcolor: BW_GRID, tickfont: { size: 10, color: BW_MUTED } },
        angularaxis: { tickfont: { size: 12, color: BW_INK }, gridcolor: BW_GRID },
      },
      legend: { orientation: 'h', y: 1.12 },
    },
  };
};

const compareSlope = (current: HinaProfile, previous: HinaProfile | null): HinaPlotSlide => ({
  title: 'Dimension slope',
  caption: 'Each line is one dimension moving from the previous session to this chat.',
  height: PLOT_H,
  data: [
    ...HINA_DIMENSIONS.map((dimension) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: dimension.label,
      x: ['Previous', 'This chat'],
      y: [previous?.quantityByDimension.me[dimension.id] || 0, current.quantityByDimension.me[dimension.id] || 0],
      line: { color: dimension.color, width: 2.6 },
      marker: { size: 10, color: dimension.color, line: { color: '#fff', width: 1.4 } },
    })),
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    xaxis: { tickfont: { size: 12, color: BW_MID } },
    yaxis: axisY,
    legend: { orientation: 'h', y: 1.14 },
    margin: { l: 52, r: 24, t: 28, b: 48 },
  },
});

const compareDumbbell = (current: HinaProfile, previous: HinaProfile | null): HinaPlotSlide => {
  const y = COMPARE_CODES.map((id) => HINA_CODE_BY_ID[id].shortLabel);
  return {
    title: 'Dumbbell compare',
    caption: 'Each line connects last time to this chat for one code. Dark dots are now.',
    height: PLOT_H,
    data: [
      ...COMPARE_CODES.map((id, index) => ({
        type: 'scatter',
        mode: 'lines',
        x: [countCode(previous, 'me', id), countCode(current, 'me', id)],
        y: [y[index], y[index]],
        line: { color: hexAlpha(BW_INK, 0.28), width: 5 },
        showlegend: false,
        hoverinfo: 'skip',
      })),
      { type: 'scatter', mode: 'markers', name: 'Previous', x: COMPARE_CODES.map((id) => countCode(previous, 'me', id)), y, marker: { size: 12, color: BW_CHART_COLORS[4], line: { color: '#fff', width: 1.4 } } },
      { type: 'scatter', mode: 'markers', name: 'This chat', x: COMPARE_CODES.map((id) => countCode(current, 'me', id)), y, marker: { size: 13, color: BW_CHART_COLORS[0], line: { color: '#fff', width: 1.4 } } },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      xaxis: { title: { text: 'Your turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      yaxis: { automargin: true },
      legend: { orientation: 'h', y: 1.12 },
    },
  };
};

const compareHeat = (current: HinaProfile, previous: HinaProfile | null, week: HinaProfile | null): HinaPlotSlide => {
  const z = [
    COMPARE_CODES.map((id) => countCode(current, 'me', id)),
    COMPARE_CODES.map((id) => countCode(previous, 'me', id)),
    COMPARE_CODES.map((id) => countCode(week, 'me', id)),
  ];
  return {
    title: 'Session heatmap',
    caption: 'Your code intensity across this chat, the previous session, and the week.',
    height: PLOT_H,
    data: [{
      type: 'heatmap',
      z,
      x: COMPARE_CODES.map((id) => HINA_CODE_BY_ID[id].shortLabel),
      y: ['This chat', 'Previous', 'This week'],
      colorscale: BW_HEATMAP_SCALE,
      hovertemplate: '%{y} · %{x}: %{z}<extra></extra>',
      xgap: 5,
      ygap: 5,
      text: z.map((row) => row.map((value) => String(value))),
      texttemplate: '%{text}',
      textfont: { color: '#F8FAFC', size: 13 },
    }],
    layout: { ...baseLayout, height: PLOT_H, margin: { l: 96, r: 16, t: 16, b: 64 } },
  };
};

export const compareSlides = (
  current: HinaProfile,
  previous: HinaProfile | null,
  week: HinaProfile | null
): HinaPlotSlide[] => [
  compareGrouped(current, previous, week),
  compareRadar(current, previous),
  compareSlope(current, previous),
  compareDumbbell(current, previous),
  compareHeat(current, previous, week),
];
