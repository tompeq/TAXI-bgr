import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MultipartFile } from '@fastify/multipart';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from 'minio';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { UserEntity } from '../users/user.entity';
import {
  DRIVER_CAR_UPLOAD_KINDS,
  RegistrationUploadKind,
} from './registration-upload-kind.enum';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 64;

interface DetectedImage {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly registrationUploadRetentionHours: number;

  constructor(
    config: ConfigService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(DriverProfileEntity)
    private readonly driverProfiles: Repository<DriverProfileEntity>,
  ) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.publicBaseUrl =
      config.get<string>('S3_PUBLIC_BASE_URL')?.replace(/\/+$/, '') ?? '';
    this.registrationUploadRetentionHours = config.getOrThrow<number>(
      'REGISTRATION_UPLOAD_RETENTION_HOURS',
    );
    this.client = new Client({
      endPoint: config.getOrThrow<string>('S3_ENDPOINT'),
      port: config.getOrThrow<number>('S3_PORT'),
      useSSL: config.getOrThrow<boolean>('S3_USE_SSL'),
      accessKey: config.getOrThrow<string>('S3_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('S3_SECRET_KEY'),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
      }
    } catch {
      throw new ServiceUnavailableException({
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'Document storage is unavailable',
      });
    }
  }

  async putRegistrationImage(
    registrationId: string,
    kind: RegistrationUploadKind,
    file: MultipartFile,
  ): Promise<{ objectKey: string }> {
    const buffer = await file.toBuffer();
    if (
      file.file.truncated ||
      buffer.length > MAX_IMAGE_BYTES ||
      buffer.length < MIN_IMAGE_BYTES
    ) {
      throw new BadRequestException({
        code: 'IMAGE_SIZE_INVALID',
        message: 'Image size must be between 64 bytes and 8 MB',
      });
    }

    const image = await this.normalizeImage(buffer);
    if (image.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        code: 'NORMALIZED_IMAGE_TOO_LARGE',
        message: 'Processed image exceeds the 8 MB limit',
      });
    }
    const objectKey = [
      'registrations',
      registrationId,
      kind,
      `${randomUUID()}.${image.extension}`,
    ].join('/');

    await this.client.putObject(
      this.bucket,
      objectKey,
      image.buffer,
      image.buffer.length,
      {
        'Content-Type': image.contentType,
        'X-Amz-Meta-Upload-Kind': kind,
      },
    );
    return { objectKey };
  }

  async assertRegistrationImages(
    registrationId: string,
    objectKeys: string[],
    expectedKinds: readonly RegistrationUploadKind[],
  ): Promise<void> {
    if (
      objectKeys.length !== expectedKinds.length ||
      new Set(objectKeys).size !== objectKeys.length
    ) {
      throw this.invalidRegistrationImages();
    }

    const expectedPrefix = `registrations/${registrationId}/`;
    const suppliedKinds = objectKeys.map((key) => {
      if (!key.startsWith(expectedPrefix)) {
        throw this.invalidRegistrationImages();
      }
      return key.slice(expectedPrefix.length).split('/')[0];
    });
    if (
      expectedKinds.some((kind) => !suppliedKinds.includes(kind)) ||
      suppliedKinds.some(
        (kind) =>
          !expectedKinds.includes(kind as (typeof expectedKinds)[number]),
      )
    ) {
      throw this.invalidRegistrationImages();
    }

    try {
      await Promise.all(
        objectKeys.map((objectKey) =>
          this.client.statObject(this.bucket, objectKey),
        ),
      );
    } catch {
      throw this.invalidRegistrationImages();
    }
  }

  assertDriverCarKinds(
    registrationId: string,
    objectKeys: string[],
  ): Promise<void> {
    return this.assertRegistrationImages(
      registrationId,
      objectKeys,
      DRIVER_CAR_UPLOAD_KINDS,
    );
  }

  getTemporaryDownloadUrl(
    objectKey: string,
    expiresInSeconds = 600,
  ): Promise<string> {
    return this.client
      .presignedGetObject(this.bucket, objectKey, expiresInSeconds)
      .then((signedUrl) => {
        if (!this.publicBaseUrl) {
          return signedUrl;
        }

        const signed = new URL(signedUrl);
        const encodedKey = objectKey
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/');
        const publicUrl = new URL(
          `${this.publicBaseUrl}/${this.bucket}/${encodedKey}`,
        );
        publicUrl.search = signed.search;
        return publicUrl.toString();
      });
  }

  async removeObjects(objectKeys: string[]): Promise<void> {
    if (objectKeys.length > 0) {
      const errors = await this.client.removeObjects(this.bucket, objectKeys);
      if (errors.length > 0) {
        throw new Error(
          `Could not remove ${errors.length} registration storage object(s)`,
        );
      }
    }
  }

  async cleanupExpiredRegistrationUploads(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.registrationUploadRetentionHours * 60 * 60 * 1000,
    );
    const [objects, referencedKeys] = await Promise.all([
      this.listRegistrationObjects(),
      this.referencedRegistrationObjectKeys(),
    ]);
    const expiredKeys = objects
      .filter(
        (object) =>
          object.lastModified <= cutoff && !referencedKeys.has(object.name),
      )
      .map((object) => object.name);
    await this.removeObjects(expiredKeys);
    if (expiredKeys.length > 0) {
      this.logger.log(
        `Removed ${expiredKeys.length} expired registration upload(s)`,
      );
    }
    return expiredKeys.length;
  }

  async checkAvailability(): Promise<void> {
    if (!(await this.client.bucketExists(this.bucket))) {
      throw new Error('Document bucket does not exist');
    }
  }

  private async listRegistrationObjects(): Promise<
    Array<{ name: string; lastModified: Date }>
  > {
    return new Promise((resolve, reject) => {
      const objects: Array<{ name: string; lastModified: Date }> = [];
      const stream = this.client.listObjectsV2(
        this.bucket,
        'registrations/',
        true,
      );
      stream.on('data', (object) => {
        if (object.name && object.lastModified) {
          objects.push({
            name: object.name,
            lastModified: object.lastModified,
          });
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(objects));
    });
  }

  private async referencedRegistrationObjectKeys(): Promise<Set<string>> {
    const [users, profiles] = await Promise.all([
      this.users.find({ select: { id: true, avatarObjectKey: true } }),
      this.driverProfiles.find({
        select: {
          id: true,
          licensePhotoKey: true,
          licensePhotoBackKey: true,
          carPhotoKeys: true,
        },
      }),
    ]);
    const keys = new Set<string>();
    for (const user of users) {
      this.addRegistrationObjectKey(keys, user.avatarObjectKey);
    }
    for (const profile of profiles) {
      this.addRegistrationObjectKey(keys, profile.licensePhotoKey);
      this.addRegistrationObjectKey(keys, profile.licensePhotoBackKey);
      for (const objectKey of profile.carPhotoKeys) {
        this.addRegistrationObjectKey(keys, objectKey);
      }
    }
    return keys;
  }

  private addRegistrationObjectKey(
    keys: Set<string>,
    objectKey: string | null,
  ): void {
    if (objectKey?.startsWith('registrations/')) {
      keys.add(objectKey);
    }
  }

  private async normalizeImage(buffer: Buffer): Promise<DetectedImage> {
    try {
      const image = sharp(buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      }).rotate();
      const metadata = await image.metadata();

      switch (metadata.format) {
        case 'jpeg':
          return {
            buffer: await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
            contentType: 'image/jpeg',
            extension: 'jpg',
          };
        case 'png':
          return {
            buffer: await image.png({ compressionLevel: 9 }).toBuffer(),
            contentType: 'image/png',
            extension: 'png',
          };
        case 'webp':
          return {
            buffer: await image.webp({ quality: 92 }).toBuffer(),
            contentType: 'image/webp',
            extension: 'webp',
          };
        default:
          throw new Error('Unsupported image format');
      }
    } catch {
      throw new BadRequestException({
        code: 'IMAGE_FORMAT_UNSUPPORTED',
        message: 'Only valid JPEG, PNG and WebP images are supported',
      });
    }
  }

  private invalidRegistrationImages(): BadRequestException {
    return new BadRequestException({
      code: 'REGISTRATION_IMAGES_INVALID',
      message: 'Registration images are missing or do not belong to this form',
    });
  }
}
