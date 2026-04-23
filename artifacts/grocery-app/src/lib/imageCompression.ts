/**
 * Client-side image compression.
 *
 * Why this exists:
 *   - Vercel serverless functions cap request body size at ~4.5 MB.
 *   - Modern phone cameras produce 4–10 MB photos.
 *   - Without compression, proof-of-delivery uploads fail with 413.
 *
 * Strategy:
 *   1. Decode the file via an HTMLImageElement (works for JPEG/PNG/WebP).
 *   2. Downscale to a max dimension (default 1920 px — plenty for POD evidence).
 *   3. Re-encode as JPEG at a quality ceiling, then step quality down until
 *      the output is under `targetBytes`. If quality floor is reached and
 *      still too big, shrink dimensions and retry.
 *   4. Give up gracefully: if anything fails (non-image, HEIC the browser
 *      can't decode, etc.) return the original File so the caller can still
 *      attempt the upload.
 */

export interface CompressOptions {
  /** Target size in bytes. Default 3 MB — comfortably under Vercel's ~4.5 MB limit. */
  targetBytes?: number;
  /** Absolute ceiling in bytes; compression keeps tightening until under this. Default 5 MB. */
  maxBytes?: number;
  /** Longest side after resizing, in px. Default 1920. */
  maxDimension?: number;
  /** Starting JPEG quality (0–1). Default 0.85. */
  initialQuality?: number;
  /** Minimum JPEG quality before we start shrinking dimensions. Default 0.5. */
  minQuality?: number;
  /** Output MIME type. Default 'image/jpeg'. */
  mimeType?: "image/jpeg" | "image/webp";
}

const DEFAULTS: Required<CompressOptions> = {
  targetBytes: 3 * 1024 * 1024,
  maxBytes: 5 * 1024 * 1024,
  maxDimension: 1920,
  initialQuality: 0.85,
  minQuality: 0.5,
  mimeType: "image/jpeg",
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image"));
    };
    img.src = url;
  });
}

function drawToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      type,
      quality,
    );
  });
}

function renameWithExt(originalName: string, mimeType: string): string {
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const base = originalName.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.${ext}`;
}

export interface CompressionResult {
  file: File;
  /** True if we actually compressed. False if the original was already small enough or couldn't be decoded. */
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}

/**
 * Compress an image file. Always resolves — on failure, returns the original file.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressionResult> {
  const opts = { ...DEFAULTS, ...options };
  const originalSize = file.size;

  // Non-image files: nothing to do.
  if (!file.type.startsWith("image/")) {
    return { file, compressed: false, originalSize, finalSize: originalSize };
  }

  // Already comfortably under target — skip work.
  if (file.size <= opts.targetBytes) {
    return { file, compressed: false, originalSize, finalSize: originalSize };
  }

  try {
    const img = await loadImage(file);

    let maxDim = opts.maxDimension;
    let bestBlob: Blob | null = null;

    // Outer loop: if quality floor isn't enough, shrink dimensions.
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = drawToCanvas(img, maxDim);

      // Inner loop: walk quality down from initial → min.
      let q = opts.initialQuality;
      while (q >= opts.minQuality - 1e-6) {
        const blob = await canvasToBlob(canvas, opts.mimeType, q);
        bestBlob = blob;
        if (blob.size <= opts.targetBytes) break;
        q -= 0.1;
      }

      if (bestBlob && bestBlob.size <= opts.maxBytes) break;

      // Still too big: shrink dimensions by 25% and try again.
      maxDim = Math.round(maxDim * 0.75);
      if (maxDim < 640) break; // don't degrade below usable quality
    }

    if (!bestBlob) {
      return { file, compressed: false, originalSize, finalSize: originalSize };
    }

    // If our best effort is still larger than the original, keep the original.
    if (bestBlob.size >= originalSize) {
      return { file, compressed: false, originalSize, finalSize: originalSize };
    }

    const compressedFile = new File(
      [bestBlob],
      renameWithExt(file.name, opts.mimeType),
      { type: opts.mimeType, lastModified: Date.now() },
    );

    return {
      file: compressedFile,
      compressed: true,
      originalSize,
      finalSize: compressedFile.size,
    };
  } catch {
    // Any decode/encode failure: return original so upload is still attempted.
    return { file, compressed: false, originalSize, finalSize: originalSize };
  }
}

/** Format bytes for user-facing messages. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
