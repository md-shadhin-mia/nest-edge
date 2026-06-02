import { DynamicModule, Module, Provider } from '@nestjs/common';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { UPLOAD_MODULE_ID, UPLOAD_MODULE_OPTIONS } from './files.constants';
import {
  UploadModuleAsyncOptions,
  UploadModuleOptions,
  UploadOptionsFactory,
} from './interfaces';

/**
 * Dynamic NestJS module for file uploads via Hono's built-in formData parsing.
 * Works on Node.js, Bun, Deno, and Cloudflare Workers.
 *
 * @publicApi
 */
@Module({})
export class HonoUploadModule {
  static register(options: UploadModuleOptions = {}): DynamicModule {
    return {
      module: HonoUploadModule,
      providers: [
        { provide: UPLOAD_MODULE_OPTIONS, useFactory: () => options },
        { provide: UPLOAD_MODULE_ID, useValue: randomStringGenerator() },
      ],
      exports: [UPLOAD_MODULE_OPTIONS],
    };
  }

  static registerAsync(options: UploadModuleAsyncOptions): DynamicModule {
    return {
      module: HonoUploadModule,
      imports: options.imports,
      providers: [
        ...this.createAsyncProviders(options),
        { provide: UPLOAD_MODULE_ID, useValue: randomStringGenerator() },
      ],
      exports: [UPLOAD_MODULE_OPTIONS],
    };
  }

  private static createAsyncProviders(
    options: UploadModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    return [
      this.createAsyncOptionsProvider(options),
      { provide: options.useClass!, useClass: options.useClass! },
    ];
  }

  private static createAsyncOptionsProvider(
    options: UploadModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: UPLOAD_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      };
    }
    return {
      provide: UPLOAD_MODULE_OPTIONS,
      useFactory: async (factory: UploadOptionsFactory) =>
        factory.createUploadOptions(),
      inject: [options.useExisting ?? options.useClass!],
    };
  }
}
