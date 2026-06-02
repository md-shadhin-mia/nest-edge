import {
  CallHandler,
  ExecutionContext,
  Inject,
  mixin,
  NestInterceptor,
  Optional,
  Type,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { UPLOAD_MODULE_OPTIONS } from '../files.constants';
import { UploadModuleOptions, UploadOptions } from '../interfaces';
import { parseUploadedFiles } from '../upload.utils';

/**
 * Interceptor that processes a single uploaded file from a multipart request.
 * The file is available via `@UploadedFile()` in the controller.
 *
 * Works on Node.js, Bun, Deno, and Cloudflare Workers.
 *
 * @param fieldName  Form field name
 * @param localOptions  Per-route upload options (merged with module-level options)
 *
 * @publicApi
 */
export function FileInterceptor(
  fieldName: string,
  localOptions?: UploadOptions,
): Type<NestInterceptor> {
  class MixinInterceptor implements NestInterceptor {
    constructor(
      @Optional()
      @Inject(UPLOAD_MODULE_OPTIONS)
      private readonly moduleOptions: UploadModuleOptions = {},
    ) {}

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<any>> {
      const req = context.switchToHttp().getRequest();
      const options: UploadOptions = {
        ...this.moduleOptions,
        ...localOptions,
      };

      const files = await parseUploadedFiles(req, fieldName, options);
      req.file = files[0] ?? undefined;

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
