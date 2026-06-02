import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { HonoUploadedFile, UploadOptions } from './interfaces';

/**
 * Parses multipart/form-data from the request and returns files for a given field.
 * Uses Web Standard FormData API — works on all runtimes.
 */
export async function parseUploadedFiles(
  req: any,
  fieldName: string | null,
  options: UploadOptions = {},
): Promise<HonoUploadedFile[]> {
  let formData: FormData;

  // Prefer already-parsed formData on req (set by body parser middleware)
  if (req.formData && typeof req.formData === 'function') {
    try {
      formData = await req.formData();
    } catch {
      throw new BadRequestException('Failed to parse multipart/form-data');
    }
  } else if (req.body instanceof FormData) {
    formData = req.body;
  } else {
    throw new BadRequestException('Request does not contain multipart data');
  }

  const files: HonoUploadedFile[] = [];
  const maxFiles = options.limits?.files ?? Infinity;
  const maxSize = options.limits?.fileSize ?? Infinity;

  for (const [key, value] of (formData as any).entries()) {
    if (fieldName !== null && key !== fieldName) continue;
    if (!(value instanceof File)) continue;

    if (files.length >= maxFiles) {
      throw new BadRequestException(
        `Too many files. Maximum allowed: ${maxFiles}`,
      );
    }

    if (value.size > maxSize) {
      throw new PayloadTooLargeException(
        `File too large. Maximum size: ${maxSize} bytes`,
      );
    }

    const uploaded: HonoUploadedFile = {
      fieldname: key,
      originalname: value.name,
      mimetype: value.type || 'application/octet-stream',
      size: value.size,
    };

    // Apply fileFilter if provided
    if (options.fileFilter) {
      const accepted = await new Promise<boolean>((resolve, reject) => {
        options.fileFilter!(uploaded, (err, ok) => {
          if (err) reject(err);
          else resolve(ok);
        });
      });
      if (!accepted) continue;
    }

    // Read into buffer (works on all runtimes)
    const buf = await value.arrayBuffer();
    uploaded.buffer = new Uint8Array(buf);

    // Node.js disk storage
    if (options.dest) {
      try {
        const { writeFile, mkdir } = await import('node:fs/promises');
        const { join } = await import('node:path');
        await mkdir(options.dest, { recursive: true });
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${value.name}`;
        const filePath = join(options.dest, filename);
        await writeFile(filePath, uploaded.buffer);
        uploaded.path = filePath;
        delete uploaded.buffer;
      } catch {
        throw new BadRequestException('Failed to save uploaded file to disk');
      }
    }

    files.push(uploaded);
  }

  return files;
}
