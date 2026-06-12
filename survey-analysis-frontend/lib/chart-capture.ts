import { toPng } from 'html-to-image';

/**
 * Capture a DOM element as a base64 PNG data URL.
 * Returns null if the element is missing or capture fails.
 */
export async function captureElementAsPng(element: HTMLElement | null): Promise<string | null> {
  if (!element) return null;
  try {
    const dataUrl = await toPng(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,  // crisp on high-DPI displays
    });
    return dataUrl;
  } catch (err) {
    console.error('[chart-capture] Failed to capture element:', err);
    return null;
  }
}

/**
 * Capture multiple charts identified by their DOM IDs.
 * Returns {id: dataUrl} for charts that captured successfully.
 */
export async function captureChartsById(ids: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      const dataUrl = await captureElementAsPng(el);
      if (dataUrl) {
        results[id] = dataUrl;
      }
    }
  }
  return results;
}
