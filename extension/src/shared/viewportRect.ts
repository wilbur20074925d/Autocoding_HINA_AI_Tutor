/** CSS viewport coordinates (px from top-left of the page viewport). */
export type ViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const OVERLAY_PANEL_WIDTH = 380;
export const OVERLAY_PANEL_MAX_HEIGHT = 520;

/** Place a panel so its bottom-right sits near the anchor's bottom-right (viewport coords). */
export function panelViewportPosition(
  anchor: ViewportRect | null | undefined,
  panelW: number,
  panelH: number,
  viewportW: number,
  viewportH: number
): { left: number; top: number } {
  const margin = 12;
  if (!anchor || anchor.width <= 0 || anchor.height <= 0) {
    return {
      left: Math.max(margin, viewportW - panelW - margin),
      top: Math.max(margin, viewportH - panelH - margin),
    };
  }

  const selRight = anchor.x + anchor.width;
  const selBottom = anchor.y + anchor.height;
  let left = selRight - panelW;
  let top = selBottom - panelH;

  left = Math.max(margin, Math.min(left, viewportW - panelW - margin));
  top = Math.max(margin, Math.min(top, viewportH - panelH - margin));
  return { left, top };
}
