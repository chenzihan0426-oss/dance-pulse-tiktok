export interface ObjectStorage {
  upload(
    key: string,
    file: Blob | Buffer,
    options?: { contentType?: string; acl?: "private" | "public" }
  ): Promise<{ key: string; url: string }>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  setAcl(key: string, acl: "private" | "public"): Promise<void>;
  delete(key: string): Promise<void>;
}

export function getObjectStorage(): ObjectStorage {
  throw new Error("ObjectStorage not configured. Implement in Phase 5.");
}
