import { INestApplication } from '@nestjs/common';
import { Hono } from 'hono';

/**
 * @publicApi
 */
export interface NestHonoApplication<
  TServer = any,
> extends INestApplication<TServer> {
  /**
   * Returns the underlying Hono instance.
   */
  getInstance<T = Hono>(): T;

  /**
   * Returns the Hono fetch handler for edge/serverless deployment.
   *
   * @example
   * // Cloudflare Workers
   * export default { fetch: app.getFetch() };
   *
   * @example
   * // Deno
   * Deno.serve(app.getFetch());
   */
  getFetch(): (req: Request) => Promise<Response>;
}
