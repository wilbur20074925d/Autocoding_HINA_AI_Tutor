/**
 * Event Tracking Utilities
 * Provides helpers for tracking mouse actions, keyboard shortcuts, and identifying blocks
 */

export type MouseActionType = 'click' | 'hover' | 'mousemove' | 'mousedown' | 'mouseup' | 'contextmenu' | 'doubleclick';
export type KeyboardActionType = 'shortcut' | 'keypress' | 'keydown' | 'keyup';

/**
 * Get key combination string from keyboard event
 * e.g., "Ctrl+C", "Ctrl+V", "Tab", "Enter"
 */
export function getKeyCombination(event: KeyboardEvent): string {
  const parts: string[] = [];

  if (event.ctrlKey || event.metaKey) parts.push(event.metaKey ? 'Cmd' : 'Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  const key = event.key;
  if (key && key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
    // Normalize key names
    const normalizedKey = key
      .replace(/^Arrow/, '')
      .replace(/^Digit/, '')
      .replace(/^Key/, '')
      .toUpperCase();
    parts.push(normalizedKey);
  } else if (event.code) {
    // Fallback to code if key is not available
    const codeKey = event.code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Arrow/, '')
      .toUpperCase();
    if (codeKey) parts.push(codeKey);
  }

  return parts.length > 0 ? parts.join('+') : 'Unknown';
}

/**
 * Check if a keyboard event is a common shortcut
 */
export function isCommonShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const shortcuts = ['c', 'v', 'x', 'z', 'a', 's', 'f', 'p', 'n', 'w', 't'];
  return (event.ctrlKey || event.metaKey) && shortcuts.includes(key);
}

/**
 * Get block identifier from an element
 * Looks for data-block-id, id, or generates one from element structure
 */
export function getBlockId(element: HTMLElement | null): string | null {
  if (!element) return null;

  // Check for explicit block ID
  const blockId = element.getAttribute('data-block-id') || element.id;
  if (blockId) return blockId;

  // Try to find parent with block ID
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;
  while (current && depth < 5) {
    const parentBlockId = current.getAttribute('data-block-id') || current.id;
    if (parentBlockId) return parentBlockId;
    current = current.parentElement;
    depth++;
  }

  // Generate ID from element structure
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).join('-');
  const role = element.getAttribute('role');
  
  if (role) return `${tag}-${role}`;
  if (classes) return `${tag}-${classes.split('-')[0]}`;
  return tag;
}

/**
 * Get block name from an element
 * Looks for data-block-name, aria-label, title, or text content
 */
export function getBlockName(element: HTMLElement | null): string | null {
  if (!element) return null;

  const blockName =
    element.getAttribute('data-block-name') ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.textContent?.trim().substring(0, 50);

  return blockName || null;
}

/**
 * Get element identifier for tracking
 */
export function getElementIdentifier(element: HTMLElement | EventTarget | null): {
  id: string | null;
  tag: string | null;
  classes: string | null;
  text: string | null;
} {
  if (!element || !(element instanceof HTMLElement)) {
    return { id: null, tag: null, classes: null, text: null };
  }

  return {
    id: element.id || null,
    tag: element.tagName.toLowerCase(),
    classes: element.className && typeof element.className === 'string' ? element.className : null,
    text: element.textContent?.trim().substring(0, 100) || null,
  };
}

/**
 * Check if element is in a folded/collapsed section
 */
export function isFolded(element: HTMLElement | null): boolean {
  if (!element) return false;

  // Check element itself
  if (element.hasAttribute('data-folded') || element.classList.contains('collapsed')) {
    return true;
  }

  // Check parent elements
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;
  while (current && depth < 5) {
    if (
      current.hasAttribute('data-folded') ||
      current.classList.contains('collapsed') ||
      current.classList.contains('folded') ||
      current.style.display === 'none' ||
      current.getAttribute('aria-hidden') === 'true'
    ) {
      return true;
    }
    current = current.parentElement;
    depth++;
  }

  return false;
}

/**
 * Get coordinates from mouse event
 */
export function getMouseCoordinates(event: MouseEvent): { x: number; y: number } {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

/**
 * Debounce function for throttling frequent events
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Throttle function for limiting event frequency
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
