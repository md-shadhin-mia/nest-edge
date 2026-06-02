import { ModuleMetadata, Type } from '@nestjs/common/interfaces';
import { UploadOptions } from './upload-options.interface';

export type UploadModuleOptions = UploadOptions;

/**
 * @publicApi
 */
export interface UploadOptionsFactory {
  createUploadOptions(): Promise<UploadModuleOptions> | UploadModuleOptions;
}

/**
 * @publicApi
 */
export interface UploadModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  useExisting?: Type<UploadOptionsFactory>;
  useClass?: Type<UploadOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<UploadModuleOptions> | UploadModuleOptions;
  inject?: any[];
}
