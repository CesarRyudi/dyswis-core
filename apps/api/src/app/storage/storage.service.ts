/**
 * StorageService — Abstrai upload de arquivos para disco local ou Supabase Storage.
 *
 * Detecta automaticamente o ambiente:
 * - Com SUPABASE_URL + SUPABASE_SERVICE_KEY → upload para Supabase Storage (bucket "pdfs")
 * - Sem essas variáveis → salva em disco local (./uploads/)
 *
 * Retorna:
 * - Supabase: URL pública completa (https://xxx.supabase.co/storage/v1/object/public/pdfs/filename)
 * - Local: apenas o filename (ex: "a1b2c3d4.pdf")
 */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient | null = null;

  constructor() {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_KEY'];

    if (url && key) {
      this.supabase = createClient(url, key);
      this.logger.log('Storage: Supabase Storage configurado');
    } else {
      this.logger.log('Storage: modo local (./uploads/)');
    }
  }

  /**
   * Faz upload de um buffer de arquivo.
   * @returns URL pública (Supabase) ou filename local
   */
  async upload(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    bucket = 'pdfs',
  ): Promise<string> {
    if (this.supabase) {
      return this.uploadToSupabase(buffer, filename, mimetype, bucket);
    }
    return this.uploadToLocal(buffer, filename);
  }

  private async uploadToSupabase(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    bucket: string,
  ): Promise<string> {
    if (!this.supabase) {
      throw new InternalServerErrorException('Supabase client is not initialized');
    }
    const { error } = await this.supabase.storage.from(bucket).upload(
      filename,
      buffer,
      {
        contentType: mimetype,
        upsert: true,
      },
    );

    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      const msg = error.message || '';
      const errRecord = error as unknown as Record<string, unknown>;
      if (
        msg.toLowerCase().includes('exceeded') ||
        msg.toLowerCase().includes('size') ||
        msg.toLowerCase().includes('payload too large') ||
        msg.includes('52428800') ||
        errRecord['statusCode'] === '413' ||
        errRecord['statusCode'] === 413
      ) {
        throw new PayloadTooLargeException(
          bucket === 'videos'
            ? 'File exceeds maximum allowed limit of 50 MB for video storage.'
            : 'File exceeds maximum allowed limit of 20 MB for PDF storage.',
        );
      }
      throw new BadRequestException(
        `Failed to save file in cloud storage: ${msg}`,
      );
    }

    const { data } = this.supabase.storage.from(bucket).getPublicUrl(
      filename,
    );

    return data.publicUrl;
  }

  private async uploadToLocal(
    buffer: Buffer,
    filename: string,
  ): Promise<string> {
    try {
      const uploadsDir = join(process.cwd(), 'uploads');
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, filename), buffer);
      return filename;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Local upload failed: ${errMsg}`);
      throw new InternalServerErrorException(
        'Failed to save file to local server storage.',
      );
    }
  }
}
