import {
  HINA_CODES,
  HINA_CODE_BY_ID,
  HINA_DIMENSIONS,
  getDimensionMeta,
  type HinaDimension,
} from './hinaCodes';
import type { HinaPlotSlide } from './hinaPlots';
import type { HinaClassAnalysis, HinaClassEdge, HinaClassStudentRow } from './hinaClassAnalysis';
import {
  BW_AXIS,
  BW_CHART_COLORS,
  BW_GRID,
  BW_HEATMAP_SCALE,
  BW_INK,
  BW_MID,
  BW_MUTED,
  BW_PLOT_BG,
} from './chartTheme';

const PLOT_H = 420;
const MAX_NETWORK_STUDENTS = 16;
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

const hexAlpha = (hex: string, alpha: number) => {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const dimColor = (dimension: HinaDimension) => getDimensionMeta(dimension).color;

const hideAxes = (pad = 0.08) => ({
  xaxis: { visible: false, range: [-pad, 1 + pad] as [number, number], fixedrange: true },
  yaxis: { visible: false, range: [-pad, 1 + pad] as [number, number], fixedrange: true },
});

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

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
  links: Array<{ x0: number; y0: number; x1: number; y1: number; width: number; label: string; color: string; custom: string; bend?: number }>
) =>
  links.map((link) => {
    const curve = bezier(link.x0, link.y0, link.x1, link.y1, link.bend ?? 0.12);
    return {
      x: curve.x,
      y: curve.y,
      mode: 'lines',
      line: { color: link.color, width: link.width, shape: 'spline' },
      hovertemplate: `${link.label}<extra></extra>`,
      customdata: curve.x.map(() => link.custom),
      showlegend: false,
    };
  });

const springLayout = (
  nodeIds: string[],
  links: Array<{ source: string; target: string; weight: number }>,
  rounds = 90
) => {
  const pos = new Map(
    nodeIds.map((id, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, nodeIds.length) - Math.PI / 2;
      return [id, { x: 0.5 + 0.34 * Math.cos(angle), y: 0.5 + 0.34 * Math.sin(angle) }] as const;
    })
  );
  for (let round = 0; round < rounds; round += 1) {
    const disp = new Map(nodeIds.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodeIds.length; i += 1) {
      for (let j = i + 1; j < nodeIds.length; j += 1) {
        const a = pos.get(nodeIds[i])!;
        const b = pos.get(nodeIds[j])!;
        const dx = a.x - b.x || 0.001;
        const dy = a.y - b.y || 0.001;
        const dist = Math.hypot(dx, dy) || 0.001;
        const force = 0.0032 / (dist * dist);
        const ux = (dx / dist) * force;
        const uy = (dy / dist) * force;
        const da = disp.get(nodeIds[i])!;
        const db = disp.get(nodeIds[j])!;
        da.x += ux;
        da.y += uy;
        db.x -= ux;
        db.y -= uy;
      }
    }
    for (const link of links) {
      const a = pos.get(link.source);
      const b = pos.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const pull = Math.min(0.08, 0.012 * link.weight * dist);
      const ux = (dx / dist) * pull;
      const uy = (dy / dist) * pull;
      const da = disp.get(link.source)!;
      const db = disp.get(link.target)!;
      da.x += ux;
      da.y += uy;
      db.x -= ux;
      db.y -= uy;
    }
    const cool = 0.88 - round / (rounds * 1.35);
    for (const id of nodeIds) {
      const p = pos.get(id)!;
      const d = disp.get(id)!;
      p.x = Math.min(0.82, Math.max(0.18, p.x + d.x * cool));
      p.y = Math.min(0.82, Math.max(0.18, p.y + d.y * cool));
    }
  }
  return pos;
};

const visibleStudents = (students: HinaClassStudentRow[]) => {
  if (students.length <= MAX_NETWORK_STUDENTS) return { shown: students, hidden: 0 };
  return { shown: students.slice(0, MAX_NETWORK_STUDENTS), hidden: students.length - MAX_NETWORK_STUDENTS };
};

const networkBipartite = (edges: HinaClassEdge[], students: HinaClassStudentRow[], composite: boolean): HinaPlotSlide => {
  const { shown, hidden } = visibleStudents(students);
  const shownIds = new Set(shown.map((row) => row.userId));
  const drawn = edges.filter((edge) => shownIds.has(edge.studentId));
  const usedCodes = HINA_CODES.filter((code) => drawn.some((edge) => edge.codeId === code.id));
  const leftY = shown.map((_, index) => (shown.length === 1 ? 0.5 : 0.96 - (index / Math.max(1, shown.length - 1)) * 0.92));
  const codeY = usedCodes.map((_, index) => (usedCodes.length === 1 ? 0.5 : 0.96 - (index / Math.max(1, usedCodes.length - 1)) * 0.92));
  const links = drawn.flatMap((edge) => {
    const studentIndex = shown.findIndex((row) => row.userId === edge.studentId);
    const codeIndex = usedCodes.findIndex((code) => code.id === edge.codeId);
    if (studentIndex < 0 || codeIndex < 0) return [];
    const code = usedCodes[codeIndex];
    const rightLabel = composite ? `${code.shortLabel} · AI` : code.shortLabel;
    return [{
      x0: 0.2,
      y0: leftY[studentIndex],
      x1: 0.62,
      y1: codeY[codeIndex],
      width: Math.max(1.1, Math.min(7, 0.6 + edge.weight * 0.55)),
      label: `${edge.studentName} → ${rightLabel} · ${edge.weight}`,
      color: hexAlpha(dimColor(code.dimension), 0.34 + Math.min(0.4, edge.weight * 0.04)),
      custom: `code:${code.id}`,
      bend: studentIndex % 2 === 0 ? 0.08 : -0.08,
    }];
  });

  return {
    title: composite ? 'Student ↔ (code, AI)' : 'Student ↔ code',
    caption: composite
      ? `Paper-style composite nodes. In 1:1 tutoring the partner is almost always AI.${hidden ? ` Showing top ${shown.length} students.` : ''}`
      : `Who is tied to which interaction move. Line thickness is frequency.${hidden ? ` Showing top ${shown.length} by quantity.` : ''}`,
    height: PLOT_H,
    data: [
      ...curvedEdges(links),
      {
        x: shown.map(() => 0.2),
        y: leftY,
        mode: 'markers+text',
        text: shown.map((row) => initials(row.name)),
        textposition: 'middle center',
        textfont: { size: 10, color: '#F8FAFC', family: plotFont.family },
        customdata: shown.map((row) => `student:${row.userId}`),
        marker: { size: 22, color: BW_CHART_COLORS[0], line: { color: '#fff', width: 1.6 } },
        hovertemplate: shown.map((row) => `${row.name}<extra></extra>`),
        showlegend: false,
      },
      {
        x: usedCodes.map(() => 0.62),
        y: codeY,
        mode: 'markers+text',
        text: usedCodes.map((code) => (composite ? `${code.shortLabel} · AI` : code.shortLabel)),
        textposition: 'middle right',
        textfont: { size: 9, color: BW_MID, family: plotFont.family },
        customdata: usedCodes.map((code) => `code:${code.id}`),
        marker: { size: usedCodes.map((code) => Math.max(10, Math.min(18, 8 + drawn.filter((edge) => edge.codeId === code.id).length))), color: usedCodes.map((code) => dimColor(code.dimension)), line: { color: '#fff', width: 1.4 } },
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
      },
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.14), hovermode: 'closest', margin: { l: 28, r: 156, t: 28, b: 28 }, showlegend: false },
  };
};

const networkSpring = (edges: HinaClassEdge[], students: HinaClassStudentRow[], composite: boolean): HinaPlotSlide => {
  const { shown } = visibleStudents(students);
  const shownIds = new Set(shown.map((row) => row.userId));
  const drawn = edges.filter((edge) => shownIds.has(edge.studentId));
  const usedCodes = HINA_CODES.filter((code) => drawn.some((edge) => edge.codeId === code.id));
  const nodes = [...shown.map((row) => `s:${row.userId}`), ...usedCodes.map((code) => code.id)];
  const links = drawn.map((edge) => ({ source: `s:${edge.studentId}`, target: edge.codeId, weight: edge.weight }));
  const pos = springLayout(nodes, links);
  return {
    title: composite ? 'Spring · (code, AI)' : 'Spring layout',
    caption: 'Stronger student–code ties pull nodes closer. Same graph, a force-directed reading.',
    height: PLOT_H,
    data: [
      ...curvedEdges(
        links.flatMap((link) => {
          const from = pos.get(link.source);
          const to = pos.get(link.target);
          const code = HINA_CODE_BY_ID[link.target];
          if (!from || !to || !code) return [];
          return [{
            x0: from.x, y0: from.y, x1: to.x, y1: to.y,
            width: Math.max(1.1, Math.min(6.5, 0.7 + link.weight * 0.4)),
            label: `${link.source.slice(2)} → ${composite ? `${code.shortLabel} · AI` : code.shortLabel} · ${link.weight}`,
            color: hexAlpha(dimColor(code.dimension), 0.4),
            custom: `code:${code.id}`,
            bend: 0.06,
          }];
        })
      ),
      {
        x: shown.map((row) => pos.get(`s:${row.userId}`)?.x || 0.5),
        y: shown.map((row) => pos.get(`s:${row.userId}`)?.y || 0.5),
        mode: 'markers+text',
        text: shown.map((row) => initials(row.name)),
        textposition: 'middle center',
        textfont: { size: 10, color: '#F8FAFC' },
        customdata: shown.map((row) => `student:${row.userId}`),
        marker: { size: 22, color: BW_CHART_COLORS[0], line: { color: '#fff', width: 1.5 } },
        hovertemplate: shown.map((row) => `${row.name}<extra></extra>`),
        showlegend: false,
      },
      {
        x: usedCodes.map((code) => pos.get(code.id)?.x || 0.5),
        y: usedCodes.map((code) => pos.get(code.id)?.y || 0.5),
        mode: 'markers+text',
        text: usedCodes.map((code) => code.shortLabel),
        textposition: 'top center',
        textfont: { size: 9, color: BW_MID },
        customdata: usedCodes.map((code) => `code:${code.id}`),
        marker: { size: 13, color: usedCodes.map((code) => dimColor(code.dimension)), line: { color: '#fff', width: 1.3 } },
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
      },
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.2), hovermode: 'closest', margin: { l: 36, r: 36, t: 36, b: 36 }, showlegend: false },
  };
};

const dimensionBars = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const totals = HINA_DIMENSIONS.map((dimension) =>
    analysis.students.reduce((sum, row) => sum + (row.quantityByDimension[dimension.id] || 0), 0)
  );
  return {
    title: 'Class four-dimension mix',
    caption: 'Student-side coded turns by HINA dimension. Coordinative near zero is expected in 1:1 tutoring.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        x: HINA_DIMENSIONS.map((item) => item.label),
        y: totals,
        marker: { color: HINA_DIMENSIONS.map((item) => item.color), line: { color: '#fff', width: 0.8 } },
        hovertemplate: '%{x}: %{y}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      yaxis: { title: { text: 'Student coded turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, linecolor: BW_AXIS, zeroline: false, rangemode: 'tozero' },
      xaxis: { linecolor: BW_AXIS },
    },
  };
};

export const classNetworkSlides = (analysis: HinaClassAnalysis, edges: HinaClassEdge[]): HinaPlotSlide[] => [
  networkBipartite(edges, analysis.students, false),
  networkSpring(edges, analysis.students, false),
  networkBipartite(edges, analysis.students, true),
  networkSpring(edges, analysis.students, true),
  dimensionBars(analysis),
];

const rosterQuantity = (students: HinaClassStudentRow[]): HinaPlotSlide => ({
  title: 'Quantity ranking',
  caption: 'How much each student interacted with the tutor. Low quantity is non-use, not a grade.',
  height: PLOT_H,
  data: [
    {
      type: 'bar',
      orientation: 'h',
      y: students.map((row) => row.name).reverse(),
      x: students.map((row) => row.quantity).reverse(),
      customdata: students.map((row) => `student:${row.userId}`).reverse(),
      marker: { color: BW_CHART_COLORS[0], line: { color: '#fff', width: 0.6 } },
      hovertemplate: '%{y}: %{x} student turns<extra></extra>',
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    margin: { l: 120, r: 24, t: 12, b: 40 },
    xaxis: { title: { text: 'Student coded turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, linecolor: BW_AXIS, rangemode: 'tozero' },
    yaxis: { automargin: true, linecolor: BW_AXIS },
  },
});

const rosterDimensions = (students: HinaClassStudentRow[]): HinaPlotSlide => ({
  title: 'Quantity by dimension',
  caption: 'Each bar stack is one student. Cognitive usually dominates 1:1 tutor chat.',
  height: PLOT_H,
  data: HINA_DIMENSIONS.map((dimension) => ({
    type: 'bar',
    name: dimension.label,
    x: students.map((row) => row.name),
    y: students.map((row) => row.quantityByDimension[dimension.id] || 0),
    customdata: students.map((row) => `student:${row.userId}`),
    marker: { color: dimension.color },
    hovertemplate: `${dimension.label}: %{y}<extra></extra>`,
  })),
  layout: {
    ...baseLayout,
    height: PLOT_H,
    barmode: 'stack',
    margin: { l: 56, r: 24, t: 64, b: students.length > 10 ? 96 : 64 },
    xaxis: { tickangle: students.length > 8 ? -35 : 0, automargin: true, linecolor: BW_AXIS },
    yaxis: { title: { text: 'Coded turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero', automargin: true },
    legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0, xanchor: 'left', font: { size: 11 } },
    showlegend: true,
  },
});

const rosterScatter = (students: HinaClassStudentRow[]): HinaPlotSlide => ({
  title: 'Quantity × diversity',
  caption: 'High quantity and low diversity often means repeating the same ask-for-answer move.',
  height: PLOT_H,
  data: [
    {
      type: 'scatter',
      mode: 'markers+text',
      x: students.map((row) => row.quantity),
      y: students.map((row) => row.diversity),
      text: students.map((row) => initials(row.name)),
      textposition: 'top center',
      customdata: students.map((row) => `student:${row.userId}`),
      marker: {
        size: students.map((row) => Math.max(10, Math.min(22, 8 + row.sessionCount * 2))),
        color: students.map((row) => (row.requestShare > 0.35 ? BW_CHART_COLORS[0] : BW_CHART_COLORS[4])),
        line: { color: '#fff', width: 1.2 },
      },
      hovertemplate: students.map((row) => `${row.name}<br>Qty %{x}<br>Diversity %{y:.2f}<br>${row.diversityLabel}<extra></extra>`),
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    xaxis: { title: { text: 'Quantity (student turns)', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, linecolor: BW_AXIS, rangemode: 'tozero' },
    yaxis: { title: { text: 'Diversity', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, linecolor: BW_AXIS, range: [0, 1] },
  },
});

const rosterNormalized = (students: HinaClassStudentRow[]): HinaPlotSlide => ({
  title: 'Share of class quantity',
  caption: 'Normalized quantity: each student’s share of all student–AI coded turns.',
  height: PLOT_H,
  data: [
    {
      type: 'bar',
      x: students.map((row) => row.name),
      y: students.map((row) => Math.round(row.normalizedQuantity * 1000) / 10),
      customdata: students.map((row) => `student:${row.userId}`),
      marker: { color: BW_CHART_COLORS[1], line: { color: '#fff', width: 0.6 } },
      hovertemplate: '%{x}: %{y}% of class<extra></extra>',
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    margin: { l: 48, r: 16, t: 12, b: students.length > 10 ? 90 : 56 },
    xaxis: { tickangle: students.length > 8 ? -35 : 0, linecolor: BW_AXIS },
    yaxis: { title: { text: 'Percent of class', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
  },
});

const rosterRequest = (students: HinaClassStudentRow[]): HinaPlotSlide => ({
  title: 'Answer-seeking share',
  caption: 'Share of each student’s turns that are Direct Solution Request. Darker is more answer-seeking.',
  height: PLOT_H,
  data: [
    {
      type: 'bar',
      x: students.map((row) => row.name),
      y: students.map((row) => Math.round(row.requestShare * 100)),
      customdata: students.map((row) => `student:${row.userId}`),
      marker: { color: students.map((row) => (row.requestShare > 0.35 ? BW_CHART_COLORS[0] : BW_CHART_COLORS[4])), line: { color: '#fff', width: 0.6 } },
      hovertemplate: '%{x}: %{y}% request<extra></extra>',
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    margin: { l: 48, r: 16, t: 12, b: students.length > 10 ? 90 : 56 },
    xaxis: { tickangle: students.length > 8 ? -35 : 0, linecolor: BW_AXIS },
    yaxis: { title: { text: 'Request share (%)', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero', range: [0, 100] },
  },
});

export const classRosterSlides = (analysis: HinaClassAnalysis): HinaPlotSlide[] => {
  const students = analysis.students.slice(0, 24);
  return [rosterQuantity(students), rosterDimensions(students), rosterScatter(students), rosterNormalized(students), rosterRequest(students)];
};

const patternHeat = (analysis: HinaClassAnalysis, edges: HinaClassEdge[]): HinaPlotSlide => {
  const students = analysis.students.slice(0, 18);
  const codes = HINA_CODES.filter((code) => edges.some((edge) => edge.codeId === code.id));
  const z = students.map((student) =>
    codes.map((code) => edges.find((edge) => edge.studentId === student.userId && edge.codeId === code.id)?.weight || 0)
  );
  return {
    title: 'Student × code heatmap',
    caption: 'Raw frequencies. A dark cell is a habitual student–move tie, not a score.',
    height: PLOT_H,
    data: [
      {
        type: 'heatmap',
        z,
        x: codes.map((code) => code.shortLabel),
        y: students.map((row) => row.name),
        colorscale: BW_HEATMAP_SCALE,
        hovertemplate: '%{y} · %{x}: %{z}<extra></extra>',
        customdata: students.map((row) => codes.map((code) => `code:${code.id}`)),
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 120, r: 24, t: 12, b: 80 },
      xaxis: { tickangle: -32, linecolor: BW_AXIS },
      yaxis: { automargin: true, linecolor: BW_AXIS },
    },
  };
};

const patternDots = (edges: HinaClassEdge[]): HinaPlotSlide => {
  const rows = edges.slice().sort((a, b) => b.weight - a.weight).slice(0, 24);
  return {
    title: 'Strongest student–code ties',
    caption: 'Each row is one student–move edge. Use Stable only to keep ties that beat a uniform chance model.',
    height: PLOT_H,
    data: [
      {
        type: 'scatter',
        mode: 'markers+text',
        x: rows.map((edge) => edge.weight),
        y: rows.map((edge) => `${edge.studentName} · ${HINA_CODE_BY_ID[edge.codeId]?.shortLabel || edge.codeId}`),
        text: rows.map((edge) => (edge.significant ? 'stable' : '')),
        textposition: 'middle right',
        customdata: rows.map((edge) => `code:${edge.codeId}`),
        marker: {
          size: rows.map((edge) => Math.max(9, Math.min(18, 7 + edge.weight))),
          color: rows.map((edge) => (edge.significant ? BW_CHART_COLORS[0] : BW_CHART_COLORS[4])),
          line: { color: '#fff', width: 1 },
        },
        hovertemplate: '%{y}: %{x}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 180, r: 56, t: 12, b: 40 },
      xaxis: { title: { text: 'Weight', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      yaxis: { automargin: true, autorange: 'reversed' },
    },
  };
};

const patternPValues = (edges: HinaClassEdge[]): HinaPlotSlide => {
  const rows = edges.filter((edge) => edge.weight > 0).slice().sort((a, b) => a.pValue - b.pValue).slice(0, 20);
  return {
    title: 'Significance (p-value)',
    caption: 'Binomial tail vs a uniform code model. p < .05 is marked stable. Short profiles stay at p = 1.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        orientation: 'h',
        y: rows.map((edge) => `${edge.studentName} · ${HINA_CODE_BY_ID[edge.codeId]?.shortLabel}`).reverse(),
        x: rows.map((edge) => Number(edge.pValue.toFixed(3))).reverse(),
        customdata: rows.map((edge) => `code:${edge.codeId}`).reverse(),
        marker: { color: rows.map((edge) => (edge.significant ? BW_CHART_COLORS[0] : BW_CHART_COLORS[5])).reverse() },
        hovertemplate: 'p = %{x}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 180, r: 24, t: 12, b: 40 },
      xaxis: { title: { text: 'p-value', font: { size: 12, color: BW_MUTED } }, range: [0, 1], gridcolor: BW_GRID },
      yaxis: { automargin: true },
    },
  };
};

const patternAnomaly = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const socioOnly = analysis.students.filter((row) => {
    const socio = row.quantityByDimension['socio-emotional'] || 0;
    const cog = row.quantityByDimension.cognitive || 0;
    return row.quantity > 0 && socio > 0 && cog === 0;
  });
  const low = analysis.students.filter((row) => row.quantity <= 2);
  const labels = ['Low quantity', 'Narrow + high request', 'Socio-emotional only', 'Metacognitive exemplars'];
  const values = [
    low.length,
    analysis.students.filter((row) => row.diversity < 0.28 && row.requestShare > 0.35).length,
    socioOnly.length,
    analysis.students.filter((row) => row.metaShare > 0.2).length,
  ];
  return {
    title: 'Who may need a look',
    caption: 'Counts, not labels on students. Open the roster to see names.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        x: labels,
        y: values,
        marker: { color: [BW_CHART_COLORS[0], BW_CHART_COLORS[1], BW_CHART_COLORS[3], BW_CHART_COLORS[5]] },
        hovertemplate: '%{x}: %{y} students<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      yaxis: { title: { text: 'Students', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      xaxis: { tickangle: -12 },
    },
  };
};

const patternEmpty = (): HinaPlotSlide => ({
  title: 'No stable edges',
  caption: 'The class is too small for significance pruning. Turn the filter off to see every weighted tie.',
  height: PLOT_H,
  data: [{ type: 'scatter', x: [0], y: [0], mode: 'markers', marker: { opacity: 0 }, hoverinfo: 'skip' }],
  layout: { ...baseLayout, height: PLOT_H, ...hideAxes(), annotations: [{ text: 'No stable edges yet', showarrow: false, font: { size: 14, color: BW_MUTED }, x: 0.5, y: 0.5, xref: 'paper', yref: 'paper' }] },
});

export const classPatternSlides = (analysis: HinaClassAnalysis, edges: HinaClassEdge[]): HinaPlotSlide[] => {
  if (edges.length === 0) {
    return [patternEmpty(), patternAnomaly(analysis)];
  }
  return [patternHeat(analysis, edges), patternDots(edges), patternPValues(edges), patternAnomaly(analysis), dimensionBars(analysis)];
};

const clusterScatter = (analysis: HinaClassAnalysis): HinaPlotSlide => ({
  title: 'Clusters in strategy space',
  caption: 'Automatic grouping by student–code profiles. These labels are for teachers only.',
  height: PLOT_H,
  data: analysis.clusters.map((cluster, index) => {
    const members = analysis.students.filter((row) => row.clusterId === cluster.id);
    return {
      type: 'scatter',
      mode: 'markers+text',
      name: cluster.label,
      x: members.map((row) => row.quantity),
      y: members.map((row) => row.diversity),
      text: members.map((row) => initials(row.name)),
      textposition: 'top center',
      customdata: members.map((row) => `student:${row.userId}`),
      marker: { size: 14, color: BW_CHART_COLORS[index % BW_CHART_COLORS.length], line: { color: '#fff', width: 1.2 } },
      hovertemplate: members.map((row) => `${row.name}<br>${cluster.label}<extra></extra>`),
    };
  }),
  layout: {
    ...baseLayout,
    height: PLOT_H,
    showlegend: true,
    legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0, xanchor: 'left', font: { size: 11 } },
    margin: { l: 56, r: 28, t: 64, b: 52 },
    xaxis: { title: { text: 'Quantity', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
    yaxis: { title: { text: 'Diversity', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, range: [0, 1] },
  },
});

const clusterSizes = (analysis: HinaClassAnalysis): HinaPlotSlide => ({
  title: 'Cluster sizes',
  caption: 'How many students share each inferred AI-use strategy.',
  height: PLOT_H,
  data: [
    {
      type: 'bar',
      x: analysis.clusters.map((cluster) => cluster.label),
      y: analysis.clusters.map((cluster) => cluster.studentIds.length),
      marker: { color: analysis.clusters.map((_, index) => BW_CHART_COLORS[index % BW_CHART_COLORS.length]) },
      hovertemplate: '%{x}: %{y} students<extra></extra>',
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    yaxis: { title: { text: 'Students', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
  },
});

const clusterRadar = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const theta = [...HINA_DIMENSIONS.map((item) => item.label), HINA_DIMENSIONS[0].label];
  return {
    title: 'Cluster dimension profiles',
    caption: 'Mean student-side dimension mix inside each cluster.',
    height: PLOT_H,
    data: analysis.clusters.map((cluster, index) => {
      const members = analysis.students.filter((row) => row.clusterId === cluster.id);
      const means = HINA_DIMENSIONS.map((dimension) => {
        if (members.length === 0) return 0;
        return members.reduce((sum, row) => sum + (row.quantityByDimension[dimension.id] || 0), 0) / members.length;
      });
      return {
        type: 'scatterpolar',
        name: cluster.label,
        r: [...means, means[0]],
        theta,
        fill: 'toself',
        line: { color: BW_CHART_COLORS[index % BW_CHART_COLORS.length] },
        fillcolor: hexAlpha(BW_CHART_COLORS[index % BW_CHART_COLORS.length], 0.12),
      };
    }),
    layout: {
      ...baseLayout,
      height: PLOT_H,
      polar: {
        domain: { x: [0.14, 0.86], y: [0.18, 0.82] },
        radialaxis: { gridcolor: BW_GRID, linecolor: BW_AXIS },
        angularaxis: { linecolor: BW_AXIS },
      },
      showlegend: true,
      margin: { l: 48, r: 48, t: 64, b: 36 },
      legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0, xanchor: 'left', font: { size: 11 } },
    },
  };
};

const clusterHeat = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const codes = HINA_CODES.filter((code) =>
    analysis.students.some((row) => (row.profile.edges.find((edge) => edge.actor === 'me' && edge.codeId === code.id)?.weight || 0) > 0)
  );
  const z = analysis.clusters.map((cluster) => {
    const members = analysis.students.filter((row) => row.clusterId === cluster.id);
    return codes.map((code) => {
      if (members.length === 0) return 0;
      return (
        members.reduce(
          (sum, row) => sum + (row.profile.edges.find((edge) => edge.actor === 'me' && edge.codeId === code.id)?.weight || 0),
          0
        ) / members.length
      );
    });
  });
  return {
    title: 'Cluster × code means',
    caption: 'Which moves define each strategy group. Use this when deciding an intervention.',
    height: PLOT_H,
    data: [
      {
        type: 'heatmap',
        z,
        x: codes.map((code) => code.shortLabel),
        y: analysis.clusters.map((cluster) => cluster.label),
        colorscale: BW_HEATMAP_SCALE,
        hovertemplate: '%{y} · %{x}: %{z:.1f}<extra></extra>',
        customdata: analysis.clusters.map(() => codes.map((code) => `code:${code.id}`)),
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 130, r: 24, t: 12, b: 80 },
      xaxis: { tickangle: -32 },
    },
  };
};

export const classClusterSlides = (analysis: HinaClassAnalysis): HinaPlotSlide[] => [
  clusterScatter(analysis),
  clusterSizes(analysis),
  clusterRadar(analysis),
  clusterHeat(analysis),
  rosterScatter(analysis.students.slice(0, 24)),
];

const projectionSpring = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const used = new Set(analysis.projection.flatMap((link) => [link.source, link.target]));
  const codes = HINA_CODES.filter((code) => used.has(code.id));
  const links = analysis.projection.slice(0, 40);
  const pos = springLayout(codes.map((code) => code.id), links);
  return {
    title: 'Code projection',
    caption: 'Students removed: codes sit closer when the same people use both. Request–Provide closeness means the tutor answers quickly.',
    height: PLOT_H,
    data: [
      ...curvedEdges(
        links.flatMap((link) => {
          const a = pos.get(link.source);
          const b = pos.get(link.target);
          const code = HINA_CODE_BY_ID[link.source];
          if (!a || !b || !code) return [];
          return [{
            x0: a.x, y0: a.y, x1: b.x, y1: b.y,
            width: Math.max(1, Math.min(6, 0.5 + link.weight * 0.15)),
            label: `${HINA_CODE_BY_ID[link.source]?.shortLabel} ↔ ${HINA_CODE_BY_ID[link.target]?.shortLabel} · ${link.weight}`,
            color: hexAlpha(dimColor(code.dimension), 0.35),
            custom: `code:${link.source}`,
            bend: 0.1,
          }];
        })
      ),
      {
        x: codes.map((code) => pos.get(code.id)?.x || 0.5),
        y: codes.map((code) => pos.get(code.id)?.y || 0.5),
        mode: 'markers+text',
        text: codes.map((code) => code.shortLabel),
        textposition: 'top center',
        textfont: { size: 9, color: BW_MID },
        customdata: codes.map((code) => `code:${code.id}`),
        marker: { size: 14, color: codes.map((code) => dimColor(code.dimension)), line: { color: '#fff', width: 1.3 } },
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
      },
    ],
    layout: { ...baseLayout, height: PLOT_H, ...hideAxes(0.2), hovermode: 'closest', margin: { l: 40, r: 40, t: 40, b: 40 }, showlegend: false },
  };
};

const projectionPairs = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const top = analysis.projection.slice(0, 12);
  return {
    title: 'Strongest code pairs',
    caption: 'Pairs that travel together across students. Request + Provide is a prompt-design signal.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        orientation: 'h',
        y: top.map((link) => `${HINA_CODE_BY_ID[link.source]?.shortLabel} · ${HINA_CODE_BY_ID[link.target]?.shortLabel}`).reverse(),
        x: top.map((link) => link.weight).reverse(),
        customdata: top.map((link) => `code:${link.source}`).reverse(),
        marker: { color: BW_CHART_COLORS[1] },
        hovertemplate: '%{y}: %{x}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 190, r: 24, t: 12, b: 40 },
      xaxis: { title: { text: 'Co-use weight', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
      yaxis: { automargin: true },
    },
  };
};

const projectionHeat = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const used = HINA_CODES.filter((code) =>
    analysis.projection.some((link) => link.source === code.id || link.target === code.id)
  ).slice(0, 12);
  const z = used.map((a) =>
    used.map((b) => {
      if (a.id === b.id) return 0;
      return analysis.projection.find(
        (link) => (link.source === a.id && link.target === b.id) || (link.source === b.id && link.target === a.id)
      )?.weight || 0;
    })
  );
  return {
    title: 'Code × code matrix',
    caption: 'Blank cells mean those moves rarely appear in the same student profile.',
    height: PLOT_H,
    data: [
      {
        type: 'heatmap',
        z,
        x: used.map((code) => code.shortLabel),
        y: used.map((code) => code.shortLabel),
        colorscale: BW_HEATMAP_SCALE,
        hovertemplate: '%{y} ↔ %{x}: %{z}<extra></extra>',
        customdata: used.map((row) => used.map((col) => `code:${col.id}`)),
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 110, r: 24, t: 12, b: 90 },
      xaxis: { tickangle: -32 },
    },
  };
};

const missingCodes = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const used = new Set(analysis.classEdges.map((edge) => edge.codeId));
  const rows = HINA_CODES.map((code) => ({
    code,
    weight: analysis.classEdges.filter((edge) => edge.codeId === code.id).reduce((sum, edge) => sum + edge.weight, 0),
    missing: !used.has(code.id),
  }));
  return {
    title: 'Which codes appear at all',
    caption: 'Critical Assessment or Integration near zero often means the task never asked for critique or synthesis.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        x: rows.map((row) => row.code.shortLabel),
        y: rows.map((row) => row.weight),
        customdata: rows.map((row) => `code:${row.code.id}`),
        marker: { color: rows.map((row) => (row.missing ? BW_CHART_COLORS[6] : dimColor(row.code.dimension))) },
        hovertemplate: '%{x}: %{y}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      margin: { l: 48, r: 16, t: 12, b: 90 },
      xaxis: { tickangle: -40 },
      yaxis: { title: { text: 'Class weight', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
    },
  };
};

export const classProjectionSlides = (analysis: HinaClassAnalysis): HinaPlotSlide[] => [
  projectionSpring(analysis),
  projectionPairs(analysis),
  projectionHeat(analysis),
  missingCodes(analysis),
  dimensionBars(analysis),
];

const overlayStages = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const stages = Object.entries(analysis.overlay.stageCounts).sort((a, b) => b[1] - a[1]);
  return {
    title: 'Existing stage tags',
    caption: 'Clarify / Plan / Execute from the tutor, not HINA. Cross this with request share on the next slide.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        x: stages.map(([name]) => name),
        y: stages.map(([, count]) => count),
        marker: { color: BW_CHART_COLORS[1] },
        hovertemplate: '%{x}: %{y}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      yaxis: { title: { text: 'Student turns with a stage tag', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
    },
  };
};

const overlayExecute = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const other = Math.max(0, analysis.overlay.executeTotal - analysis.overlay.executeRequest);
  return {
    title: 'Execute vs solution request',
    caption: analysis.overlay.executeTotal === 0
      ? 'No Execute-stage tags in this slice. Stage detection and HINA can still be read side by side later.'
      : 'If Execute is mostly Direct Solution Request, students are asking for implementations, not doing the work.',
    height: PLOT_H,
    data: [
      {
        type: 'pie',
        labels: ['Execute + solution request', 'Execute, other HINA codes'],
        values: analysis.overlay.executeTotal === 0 ? [0, 1] : [analysis.overlay.executeRequest, other],
        marker: { colors: [BW_CHART_COLORS[0], BW_CHART_COLORS[5]] },
        hole: 0.55,
        hovertemplate: '%{label}: %{value}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      showlegend: true,
      margin: { l: 24, r: 24, t: 24, b: 72 },
      legend: { orientation: 'h', y: 0, yanchor: 'top', x: 0.5, xanchor: 'center' },
    },
  };
};

const overlayRoles = (analysis: HinaClassAnalysis): HinaPlotSlide => {
  const roles = Object.entries(analysis.overlay.roleCounts).sort((a, b) => b[1] - a[1]);
  return {
    title: 'Tutor role cards',
    caption: roles.length === 0
      ? 'No analyst / experimenter / reviewer / summarizer tags in this slice.'
      : 'Which tutor role was on when students used each function. Roles are the existing tutor feature; HINA is the student move.',
    height: PLOT_H,
    data: [
      {
        type: 'bar',
        x: roles.length ? roles.map(([name]) => name) : ['No role tags'],
        y: roles.length ? roles.map(([, count]) => count) : [0],
        marker: { color: BW_CHART_COLORS[2] },
        hovertemplate: '%{x}: %{y}<extra></extra>',
      },
    ],
    layout: {
      ...baseLayout,
      height: PLOT_H,
      yaxis: { title: { text: 'Tagged turns', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
    },
  };
};

const overlayLoop = (analysis: HinaClassAnalysis): HinaPlotSlide => ({
  title: 'Request → provide loops',
  caption: 'Consecutive student Direct Solution Request followed by tutor Direct solution provide. High counts argue for delaying full code.',
  height: PLOT_H,
  data: [
    {
      type: 'bar',
      x: ['Request → provide pairs', 'Student coded turns', 'Tutor coded turns'],
      y: [
        analysis.overlay.requestProvidePairs,
        analysis.students.reduce((sum, row) => sum + row.quantity, 0),
        analysis.students.reduce((sum, row) => sum + row.quantityAi, 0),
      ],
      marker: { color: [BW_CHART_COLORS[0], BW_CHART_COLORS[3], BW_CHART_COLORS[5]] },
      hovertemplate: '%{x}: %{y}<extra></extra>',
    },
  ],
  layout: {
    ...baseLayout,
    height: PLOT_H,
    yaxis: { title: { text: 'Count', font: { size: 12, color: BW_MUTED } }, gridcolor: BW_GRID, rangemode: 'tozero' },
  },
});

export const classOverlaySlides = (analysis: HinaClassAnalysis): HinaPlotSlide[] => [
  overlayStages(analysis),
  overlayExecute(analysis),
  overlayRoles(analysis),
  overlayLoop(analysis),
  rosterRequest(analysis.students.slice(0, 24)),
];
