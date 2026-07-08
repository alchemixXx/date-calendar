import { Inject, Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SYNC_CONFIG_TOKEN, SyncConfig } from './sync-config';

export interface RemoteObject {
  body: Buffer;
  sha256?: string;
  lastModified?: Date;
}

@Injectable()
export class RemoteStoreClient {
  private s3Client: S3Client | null = null;

  constructor(@Inject(SYNC_CONFIG_TOKEN) private readonly config: SyncConfig) {}

  private getClient(): S3Client {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: this.config.region,
        ...(this.config.endpoint
          ? {
              endpoint: this.config.endpoint,
              forcePathStyle: true,
            }
          : {}),
      });
    }
    return this.s3Client;
  }

  private get objectKey(): string {
    return `${this.config.keyPrefix}ideas.json`;
  }

  async putObject(
    body: Buffer,
    sha256: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: this.objectKey,
      Body: body,
      ContentType: 'application/json',
      Metadata: { sha256 },
    });

    await this.getClient().send(command, {
      ...(signal ? { abortSignal: signal } : {}),
    });
  }

  async getObject(signal?: AbortSignal): Promise<RemoteObject | null> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: this.objectKey,
    });

    try {
      const response = await this.getClient().send(command, {
        ...(signal ? { abortSignal: signal } : {}),
      });

      const bodyBytes = await response.Body?.transformToByteArray();
      const body = bodyBytes ? Buffer.from(bodyBytes) : Buffer.alloc(0);

      return {
        body,
        sha256: response.Metadata?.sha256,
        lastModified: response.LastModified,
      };
    } catch (error: unknown) {
      if (error instanceof NoSuchKey || (error as any)?.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async headObject(
    signal?: AbortSignal,
  ): Promise<{ lastModified?: Date; sha256?: string } | null> {
    const command = new HeadObjectCommand({
      Bucket: this.config.bucketName,
      Key: this.objectKey,
    });

    try {
      const response = await this.getClient().send(command, {
        ...(signal ? { abortSignal: signal } : {}),
      });

      return {
        lastModified: response.LastModified,
        sha256: response.Metadata?.sha256,
      };
    } catch (error: unknown) {
      if (
        error instanceof NotFound ||
        error instanceof NoSuchKey ||
        (error as any)?.name === 'NotFound' ||
        (error as any)?.name === 'NoSuchKey' ||
        (error as any)?.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }
}
