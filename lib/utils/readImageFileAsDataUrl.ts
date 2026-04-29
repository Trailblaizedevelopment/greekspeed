const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);

/**
 * Read a user-picked image as a data URL for API payloads (JPEG/PNG/GIF, max 5MB).
 */
export function fileToImageDataUrl(file: File): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!ALLOWED.has(file.type.toLowerCase())) {
    return Promise.resolve({ ok: false, error: 'Please choose a JPEG, PNG, or GIF image.' });
  }
  if (file.size > MAX_BYTES) {
    return Promise.resolve({ ok: false, error: 'Image must be 5 MB or smaller.' });
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve({ ok: true, dataUrl: r });
      else resolve({ ok: false, error: 'Could not read the file.' });
    };
    reader.onerror = () => resolve({ ok: false, error: 'Could not read the file.' });
    reader.readAsDataURL(file);
  });
}
