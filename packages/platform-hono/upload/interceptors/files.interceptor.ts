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
 * Interceptor that processes multiple uploaded files from a single form field.
 * The files are available via `@UploadedFiles()` in the controller.
 *
 * @param fieldName  Form field name
 * @param maxCount   Maximum number of files allowed
 * @param localOptions  Per-route upload options
 *
 * @publicApi
 */
export function FilesInterceptor(
  fieldName: string,
  maxCount = Infinity,
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
        limits: {
          ...this.moduleOptions.limits,
          ...localOptions?.limits,
          files: Math.min(
            maxCount,
            localOptions?.limits?.files ??
              this.moduleOptions.limits?.files ??
              Infinity,
          ),
        },
      };

      req.files = await parseUploadedFiles(req, fieldName, options);

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
