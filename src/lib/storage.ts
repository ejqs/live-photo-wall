import "server-only";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage. Uses an S3-compatible bucket (Railway Bucket) when AWS_S3_BUCKET_NAME is set,
 * otherwise a local folder (development only).
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  putStream(key: string, body: Readable, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  stream(key: string): Promise<Readable | null>;
  delete(key: string): Promise<void>;
  /** A time-limited download URL, or null when files must be served through the app. */
  signedUrl(key: string, seconds: number, downloadName?: string): Promise<string | null>;
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL || undefined,
      region: process.env.AWS_DEFAULT_REGION || "auto",
      forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
  async putStream(key: string, body: Readable, contentType: string) {
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
    }).done();
  }
  async stream(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body as Readable;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }
  async get(key: string) {
    const s = await this.stream(key);
    return s ? streamToBuffer(s) : null;
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async signedUrl(key: string, seconds: number, downloadName?: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadName
          ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
          : undefined,
      }),
      { expiresIn: Math.min(seconds, 7 * 24 * 3600) },
    );
  }
}

class DiskStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("bad key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
  }
  async putStream(key: string, body: Readable) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.file(key));
    } catch {
      return null;
    }
  }
  async stream(key: string) {
    try {
      await fs.access(this.file(key));
      return createReadStream(this.file(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
  async signedUrl() {
    return null;
  }
}

function isNotFound(e: unknown) {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

export async function streamToBuffer(s: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

const g = globalThis as unknown as { __lpwStorage?: Storage };

export function storage(): Storage {
  if (!g.__lpwStorage) {
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    g.__lpwStorage = bucket
      ? new S3Storage(bucket)
      : new DiskStorage(path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR || ".data/storage"));
  }
  return g.__lpwStorage;
}

export const keys = {
  orig: (hash: string) => `photos/orig/${hash}.jpg`,
  view: (hash: string) => `photos/view/${hash}.webp`,
  thumb: (hash: string) => `photos/thumb/${hash}.webp`,
  asset: (id: string, ext: string) => `assets/${id}${ext}`,
  export: (id: string, ext: string) => `exports/${id}${ext}`,
};
