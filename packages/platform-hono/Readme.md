# @nestjs/platform-hono

NestJS HTTP adapter for [Hono](https://hono.dev/) — works on **Node.js, Bun, Deno, and Cloudflare Workers**.

## Installation

```bash
npm install @nestjs/platform-hono hono @hono/node-server
```

## Usage

### Node.js / Bun / Deno

```typescript
import { NestFactory } from '@nestjs/core';
import { HonoAdapter, NestHonoApplication } from '@nestjs/platform-hono';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestHonoApplication>(
    AppModule,
    new HonoAdapter(),
  );
  await app.listen(3000);
}
bootstrap();
```

### Cloudflare Workers / Edge runtimes

```typescript
import { NestFactory } from '@nestjs/core';
import { HonoAdapter, NestHonoApplication } from '@nestjs/platform-hono';
import { AppModule } from './app.module';

let fetchHandler: ((req: Request) => Promise<Response>) | undefined;

async function getHandler() {
  if (!fetchHandler) {
    const app = await NestFactory.create<NestHonoApplication>(
      AppModule,
      new HonoAdapter(),
    );
    await app.init();
    fetchHandler = app.getFetch();
  }
  return fetchHandler;
}

export default {
  async fetch(request: Request): Promise<Response> {
    return (await getHandler())(request);
  },
};
```

## File Uploads

```typescript
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-hono';

@Controller('upload')
export class UploadController {
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: HonoUploadedFile) {
    console.log(file.originalname, file.size);
  }
}
```

## Supported runtimes

| Runtime | `listen()` | `getFetch()` |
|---------|-----------|-------------|
| Node.js | ✅ via `@hono/node-server` | ✅ |
| Bun | ✅ via `Bun.serve()` | ✅ |
| Deno | ✅ via `Deno.serve()` | ✅ |
| Cloudflare Workers | ❌ (no port binding) | ✅ |
