export async function cropDataUrl(
  dataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  devicePixelRatio: number
): Promise<string> {
  const dpr = devicePixelRatio || 1;
  const sx = Math.max(0, Math.floor(rect.x * dpr));
  const sy = Math.max(0, Math.floor(rect.y * dpr));
  const sw = Math.max(1, Math.floor(rect.width * dpr));
  const sh = Math.max(1, Math.floor(rect.height * dpr));

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not crop screenshot.');

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  const out = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(out);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
