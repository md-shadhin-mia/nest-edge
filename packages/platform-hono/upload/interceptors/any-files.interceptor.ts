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
 * Interceptor that accepts files from any form field.
 * The files are available via `@UploadedFiles()` in the controller.
 *
 * @param localOptions  Per-route upload options
 *
 * @publicApi
 */
export function AnyFilesInterceptor(
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

      // null fieldName = accept from any field
      req.files = await parseUploadedFiles(req, null, options);

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
