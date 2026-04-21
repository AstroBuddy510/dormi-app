import { put, head, list, del } from "@vercel/blob";
import { randomUUID } from "crypto";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  /**
   * Search for public objects.
   * On Vercel Blob, we just check if the file exists by name (prefix).
   */
  async searchPublicObject(filePath: string): Promise<string | null> {
    try {
      // Vercel Blob URLs are absolute. We store the path.
      const { blobs } = await list({ prefix: filePath });
      const blob = blobs.find(b => b.pathname === filePath || b.pathname.endsWith(filePath));
      return blob ? blob.url : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Download/Serve object.
   * Since Vercel Blobs are public by default (or can be accessed via URL),
   * we just return a redirect or fetch and pipe.
   */
  async downloadObject(blobUrl: string): Promise<Response> {
    return await fetch(blobUrl);
  }

  /**
   * Generate a "proxy" upload URL.
   * The frontend expects a URL it can PUT to.
   * We point it back to our own server.
   */
  async getObjectEntityUploadURL(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${objectId}`;
    // We return a local proxy URL
    const uploadURL = `/api/storage/proxy-upload?path=${encodeURIComponent(objectPath)}`;
    return { uploadURL, objectPath };
  }

  /**
   * Get blob URL from object path.
   */
  async getObjectEntityFile(objectPath: string): Promise<string> {
    // In our new system, we store the full blob URL in the DB usually,
    // but if we only have the path, we search for it.
    const { blobs } = await list({ prefix: objectPath });
    const blob = blobs.find(b => b.pathname.includes(objectPath));
    if (!blob) throw new ObjectNotFoundError();
    return blob.url;
  }

  /**
   * Directly upload from server.
   */
  async upload(path: string, stream: ReadableStream | Buffer | string): Promise<string> {
    const { url } = await put(path, stream, { access: 'public' });
    return url;
  }
}
