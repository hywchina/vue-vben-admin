import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getConfig } from './config';

let internalClient: S3Client | undefined;
let publicClient: S3Client | undefined;
let bucketReady: Promise<void> | undefined;

function createClient(endpoint: string) {
  const config = getConfig();
  return new S3Client({
    credentials: {
      accessKeyId: config.s3AccessKey,
      secretAccessKey: config.s3SecretKey,
    },
    endpoint,
    forcePathStyle: config.s3ForcePathStyle,
    region: config.s3Region,
  });
}

function useInternalClient() {
  internalClient ??= createClient(getConfig().s3Endpoint);
  return internalClient;
}

function usePublicClient() {
  publicClient ??= createClient(getConfig().s3PublicEndpoint);
  return publicClient;
}

export function ensureStorageBucket() {
  bucketReady ??= (async () => {
    const config = getConfig();
    const client = useInternalClient();
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: config.s3Bucket }));
    }
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: config.s3Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'HEAD', 'PUT'],
                AllowedOrigins: config.s3CorsOrigins,
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (statusCode !== 501) throw error;
      // MinIO 的 CORS 由 MINIO_API_CORS_ALLOW_ORIGIN 配置；AWS S3 使用桶级配置。
    }
  })();
  return bucketReady;
}

export async function createUploadUrl(objectKey: string, mimeType: string) {
  const config = getConfig();
  await ensureStorageBucket();
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    ContentType: mimeType,
    Key: objectKey,
  });
  return await getSignedUrl(usePublicClient(), command, {
    expiresIn: config.s3PresignTtlSeconds,
  });
}

export async function createDownloadUrl(
  objectKey: string,
  filename: null | string,
) {
  const config = getConfig();
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: objectKey,
    ResponseContentDisposition: filename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      : undefined,
  });
  return await getSignedUrl(usePublicClient(), command, {
    expiresIn: config.s3PresignTtlSeconds,
  });
}

export async function createPreviewUrl(objectKey: string, mimeType: string) {
  const config = getConfig();
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: objectKey,
    ResponseCacheControl: 'private, max-age=300',
    ResponseContentDisposition: 'inline',
    ResponseContentType: mimeType,
  });
  return await getSignedUrl(usePublicClient(), command, {
    expiresIn: config.s3PresignTtlSeconds,
  });
}

export async function inspectObject(objectKey: string) {
  const config = getConfig();
  return await useInternalClient().send(
    new HeadObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }),
  );
}

export async function deleteObject(objectKey: string) {
  const config = getConfig();
  await useInternalClient().send(
    new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }),
  );
}
