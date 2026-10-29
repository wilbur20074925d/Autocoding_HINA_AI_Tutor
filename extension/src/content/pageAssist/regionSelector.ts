export type RegionRect = { x: number; y: number; width: number; height: number };

export function pickScreenRegion(): Promise<RegionRect> {
  return new Promise((resolve, reject) => {
    const mask = document.createElement('div');
    mask.id = 'hina-region-capture-mask';
    Object.assign(mask.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      cursor: 'crosshair',
      background: 'rgba(15,23,42,0.35)',
      pointerEvents: 'auto',
    });

    const box = document.createElement('div');
    box.id = 'hina-region-capture-box';
    Object.assign(box.style, {
      position: 'fixed',
      border: '2px solid #2563eb',
      background: 'rgba(37,99,235,0.12)',
      pointerEvents: 'none',
      display: 'none',
    });

    const hint = document.createElement('div');
    hint.id = 'hina-region-capture-hint';
    hint.textContent = 'Drag to select the question area · Esc to cancel';
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#0f172a',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '8px',
      font: '13px system-ui,sans-serif',
      zIndex: '2147483647',
    });

    const parent = document.body || document.documentElement;
    if (!parent) {
      reject(new Error('This page cannot show the selection layer.'));
      return;
    }
    parent.appendChild(mask);
    parent.appendChild(box);
    parent.appendChild(hint);

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let settled = false;

    const cleanup = () => {
      settled = true;
      mask.remove();
      box.remove();
      hint.remove();
      document.removeEventListener('keydown', onKey);
    };

    // Native PDF viewer only: the drag mask is not reachable at the viewport center.
    if (document.contentType === 'application/pdf') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (settled || !mask.isConnected) return;
          const hit = document.elementFromPoint(
            Math.floor(window.innerWidth / 2),
            Math.floor(window.innerHeight / 2)
          );
          if (hit === mask) return;
          cleanup();
          reject(new Error('This page cannot show the selection layer.'));
        });
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        reject(new Error('Region capture cancelled.'));
      }
    };

    const finalize = (rect: RegionRect) => {
      cleanup();
      if (rect.width < 8 || rect.height < 8) {
        reject(new Error('Selection too small.'));
        return;
      }
      resolve(rect);
    };

    mask.addEventListener(
      'mousedown',
      (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      Object.assign(box.style, {
        left: `${startX}px`,
        top: `${startY}px`,
        width: '0',
        height: '0',
        display: 'block',
      });
    },
      true
    );

    mask.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    });

    mask.addEventListener(
      'mouseup',
      (e) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = false;
        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);
        finalize({ x, y, width, height });
      },
      true
    );

    document.addEventListener('keydown', onKey);
  });
}
