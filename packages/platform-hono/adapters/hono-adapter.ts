import {
  HttpStatus,
  InternalServerErrorException,
  Logger,
  RequestMethod,
  StreamableFile,
  VERSION_NEUTRAL,
  VersioningOptions,
  VersioningType,
} from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';
import {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import {
  isNil,
  isObject,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';
import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import * as http from 'http';
import * as https from 'https';

type VersionedRoute = <
  TRequest extends Record<string, any> = any,
  TResponse = any,
>(
  req: TRequest,
  res: TResponse,
  next: () => void,
) => any;

/**
 * Wraps a Web Standard Response builder so NestJS can write headers/body
 * via the Node.js-style res API it expects, then converts to a real Response.
 */
class HonoResponseBridge {
  private _statusCode = 200;
  private _headers: Record<string, string | string[]> = {};
  private _resolve!: (r: globalThis.Response) => void;
  private _resolved = false;
  public headersSent = false;

  init(resolve: (r: globalThis.Response) => void) {
    this._resolve = resolve;
  }

  status(code: number) {
    this._statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | string[]) {
    this._headers[name.toLowerCase()] = value;
    return this;
  }

  getHeader(name: string): string | string[] | undefined {
    return this._headers[name.toLowerCase()];
  }

  /** Express-compat alias */
  get(name: string) {
    return this.getHeader(name);
  }

  /** Express-compat alias */
  set(name: string, value: string) {
    return this.setHeader(name, value);
  }

  append(name: string, value: string) {
    const existing = this._headers[name.toLowerCase()];
    if (existing) {
      this._headers[name.toLowerCase()] = Array.isArray(existing)
        ? [...existing, value]
        : [existing as string, value];
    } else {
      this._headers[name.toLowerCase()] = value;
    }
    return this;
  }

  appendHeader(name: string, value: string) {
    return this.append(name, value);
  }

  json(body: any) {
    this.setHeader('content-type', 'application/json');
    this._flush(JSON.stringify(body));
    return this;
  }

  send(body?: string | Buffer | null) {
    this._flush(body ?? null);
    return this;
  }

  end(message?: string) {
    this._flush(message ?? null);
    return this;
  }

  redirect(url: string, statusCode = 302) {
    this._statusCode = statusCode;
    this.setHeader('location', url);
    this._flush(null);
    return this;
  }

  render(_view: string, _options?: any) {
    throw new Error(
      'Template rendering is not supported in platform-hono edge mode',
    );
  }

  toWebResponse(): globalThis.Response {
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(this._headers)) {
      headers[key] = Array.isArray(val) ? val.join(', ') : val;
    }
    return new globalThis.Response(null, { status: this._statusCode, headers });
  }

  private _flush(body: any) {
    if (this._resolved) return;
    this._resolved = true;
    this.headersSent = true;

    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(this._headers)) {
      headers[key] = Array.isArray(val) ? val.join(', ') : val;
    }

    let responseBody: BodyInit | null = null;
    if (body instanceof Buffer) {
      responseBody = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer;
    } else if (body != null) {
      responseBody = String(body);
    }

    this._resolve(
      new globalThis.Response(responseBody, {
        status: this._statusCode,
        headers,
      }),
    );
  }
}

/**
 * Wraps a Hono Context to look like a Node.js-style request object
 * for edge runtimes where there is no IncomingMessage.
 */
class HonoRequestBridge {
  public body: any = null;
  public rawBody?: Buffer;
  public params: Record<string, string> = {};

  constructor(private readonly ctx: Context) {}

  get method(): string {
    return this.ctx.req.method;
  }

  get url(): string {
    const raw = this.ctx.req.raw.url;
    const idx = raw.indexOf('/', raw.indexOf('//') + 2);
    return idx === -1 ? '/' : raw.slice(idx);
  }

  get originalUrl(): string {
    return this.url;
  }

  get hostname(): string {
    return this.ctx.req.header('host')?.split(':')[0] ?? '';
  }

  get headers(): Record<string, string> {
    const result: Record<string, string> = {};
    this.ctx.req.raw.headers.forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }

  get query(): Record<string, string> {
    return this.ctx.req.query();
  }

  header(name: string): string | undefined {
    return this.ctx.req.header(name);
  }
}

/**
 * @publicApi
 */
export class HonoAdapter extends AbstractHttpAdapter<
  http.Server | https.Server | any,
  any,
  any
> {
  private readonly logger = new Logger(HonoAdapter.name);

  constructor(instance?: Hono) {
    super(instance ?? new Hono());
  }

  public getType(): string {
    return 'hono';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  public initHttpServer(options: NestApplicationOptions) {
    if (this._isEdgeRuntime()) {
      // Edge runtimes have no server — listen() / getFetch() handles startup
      return;
    }

    // Node.js: build http/https server backed by Hono's fetch handler
    // We use createAdaptorServer from @hono/node-server so that
    // c.env.incoming / c.env.outgoing are available in route handlers.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAdaptorServer } = require('@hono/node-server');
      const serverOptions: Record<string, any> = {
        fetch: this.instance.fetch.bind(this.instance),
      };
      if (options?.httpsOptions) {
        serverOptions.createServer = https.createServer.bind(
          https,
          options.httpsOptions,
        );
      }
      this.httpServer = createAdaptorServer(serverOptions);
    } catch {
      // fallback: plain http.createServer with manual dispatch
      this.httpServer = http.createServer(async (req: any, res: any) => {
        const url = `http://${req.headers.host ?? 'localhost'}${req.url}`;
        const webReq = new globalThis.Request(url, {
          method: req.method,
          headers: req.headers as any,
        });
        const webRes = await this.instance.fetch(webReq, {
          incoming: req,
          outgoing: res,
        });
        if (!res.headersSent) {
          res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
          const buf = await webRes.arrayBuffer();
          res.end(Buffer.from(buf));
        }
      });
    }
  }

  public listen(port: string | number, ...args: any[]): any {
    const portNum = Number(port);
    const cb = args.find(a => typeof a === 'function');

    if (typeof (globalThis as any).Bun !== 'undefined') {
      const server = (globalThis as any).Bun.serve({
        port: portNum,
        fetch: this.instance.fetch.bind(this.instance),
      });
      this.setHttpServer(server);
      cb?.();
      return server;
    }

    if (typeof (globalThis as any).Deno !== 'undefined') {
      const server = (globalThis as any).Deno.serve(
        { port: portNum },
        this.instance.fetch.bind(this.instance),
      );
      this.setHttpServer(server);
      cb?.();
      return server;
    }

    // Node.js
    return this.httpServer.listen(port, ...args);
  }

  public close(): any {
    if (!this.httpServer) return undefined;
    return new Promise(resolve => this.httpServer.close(resolve));
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  public createMiddlewareFactory(
    requestMethod: RequestMethod,
  ): (path: string, callback: Function) => any {
    return (path: string, callback: Function) => {
      const method = RequestMethod[requestMethod]?.toLowerCase() ?? 'all';
      const honoPath = this._toHonoPath(path);

      (this.instance as any)[method](honoPath, async (c: Context) => {
        return this._dispatchToNest(c, callback);
      });
    };
  }

  // ── Response helpers ───────────────────────────────────────────────────────

  public reply(response: any, body: any, statusCode?: number) {
    if (statusCode) {
      response.status(statusCode);
    }
    if (isNil(body)) {
      return response.send();
    }
    if (body instanceof StreamableFile) {
      const stream = body.getStream();
      const headers = body.getHeaders();
      if (headers.type && !response.getHeader('Content-Type')) {
        response.setHeader('Content-Type', headers.type);
      }
      if (headers.disposition && !response.getHeader('Content-Disposition')) {
        response.setHeader('Content-Disposition', headers.disposition);
      }
      if (headers.length && !response.getHeader('Content-Length')) {
        response.setHeader('Content-Length', String(headers.length));
      }
      // Stream to response (Node.js only)
      if (typeof response.pipe === 'function') {
        stream.once('error', (err: Error) => body.errorHandler(err, response));
        return stream.pipe(response);
      }
      // Edge fallback: buffer the stream
      const chunks: Buffer[] = [];
      return new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          response.send(Buffer.concat(chunks));
          resolve();
        });
        stream.on('error', reject);
      });
    }

    const responseContentType = response.getHeader?.('Content-Type');
    if (
      typeof responseContentType === 'string' &&
      !responseContentType.startsWith('application/json') &&
      body?.statusCode >= HttpStatus.BAD_REQUEST
    ) {
      this.logger.warn(
        "Content-Type doesn't match Reply body, you might need a custom ExceptionFilter for non-JSON responses",
      );
      response.setHeader('Content-Type', 'application/json');
    }

    return isObject(body) ? response.json(body) : response.send(String(body));
  }

  public status(response: any, statusCode: number) {
    return response.status(statusCode);
  }

  public end(response: any, message?: string) {
    return response.end(message);
  }

  public render(response: any, view: string, options: any) {
    return response.render(view, options);
  }

  public redirect(response: any, statusCode: number, url: string) {
    return response.redirect(url, statusCode);
  }

  public isHeadersSent(response: any): boolean {
    return response.headersSent ?? false;
  }

  public setHeader(response: any, name: string, value: string) {
    if (typeof response.setHeader === 'function') {
      return response.setHeader(name, value);
    }
    return response.set(name, value);
  }

  public getHeader(response: any, name: string) {
    if (typeof response.getHeader === 'function') {
      return response.getHeader(name);
    }
    return response.get?.(name);
  }

  public appendHeader(response: any, name: string, value: string) {
    if (typeof response.appendHeader === 'function') {
      return response.appendHeader(name, value);
    }
    return response.append?.(name, value);
  }

  // ── Request helpers ────────────────────────────────────────────────────────

  public getRequestHostname(request: any): string {
    return request.hostname ?? request.headers?.host?.split(':')[0] ?? '';
  }

  public getRequestMethod(request: any): string {
    return request.method;
  }

  public getRequestUrl(request: any): string {
    return request.originalUrl ?? request.url;
  }

  // ── Middleware & CORS ──────────────────────────────────────────────────────

  public registerParserMiddleware(_prefix?: string, rawBody?: boolean) {
    (this.instance as Hono).use('*', async (c, next) => {
      const contentType = c.req.header('content-type') ?? '';

      // Node.js mode: attach parsed body to IncomingMessage.body
      const env = c.env as any;
      if (env?.incoming) {
        const incoming = env.incoming;
        if (!('body' in incoming) || (incoming as any).body === undefined) {
          try {
            if (contentType.includes('application/json')) {
              (incoming as any).body = await c.req.json();
            } else if (
              contentType.includes('application/x-www-form-urlencoded')
            ) {
              (incoming as any).body = await c.req.parseBody();
            } else {
              (incoming as any).body = {};
            }
            if (rawBody) {
              const buf = await c.req.arrayBuffer();
              (incoming as any).rawBody = Buffer.from(buf);
            }
          } catch {
            (incoming as any).body = {};
          }
        }
      }

      await next();
    });
  }

  public enableCors(
    options?: CorsOptions | CorsOptionsDelegate<any>,
    _prefix?: string,
  ) {
    (this.instance as Hono).use('*', cors(options as any));
  }

  public use(...args: any[]) {
    return (this.instance as Hono).use(...args);
  }

  // ── Error handlers ─────────────────────────────────────────────────────────

  public setErrorHandler(handler: Function, _prefix?: string) {
    (this.instance as any).onError((err: any, c: Context) => {
      const bridge = this._buildBridge(c);
      handler(err, bridge.req, bridge.res, () => {});
      return bridge.res instanceof HonoResponseBridge
        ? bridge.res.toWebResponse()
        : new globalThis.Response(null, { status: 500 });
    });
  }

  public setNotFoundHandler(handler: Function, _prefix?: string) {
    (this.instance as any).notFound((c: Context) => {
      const bridge = this._buildBridge(c);
      handler(bridge.req, bridge.res, () => {});
      return bridge.res instanceof HonoResponseBridge
        ? bridge.res.toWebResponse()
        : new globalThis.Response(null, { status: 404 });
    });
  }

  // ── Unsupported (Node.js-only features) ────────────────────────────────────

  public useStaticAssets(..._args: any[]) {
    throw new Error(
      'useStaticAssets is not supported in platform-hono. ' +
        'Use the serveStatic middleware from @hono/node-server or hono/serve-static directly.',
    );
  }

  public setBaseViewsDir(_path: string | string[]) {
    throw new Error('Template views are not supported in platform-hono.');
  }

  public setViewEngine(_engine: string) {
    throw new Error('Template engines are not supported in platform-hono.');
  }

  // ── API Versioning ─────────────────────────────────────────────────────────

  public applyVersionFilter(
    handler: Function,
    version: VersionValue,
    versioningOptions: VersioningOptions,
  ): VersionedRoute {
    const callNext: VersionedRoute = (req, res, next) => {
      if (!next) {
        throw new InternalServerErrorException(
          'HTTP adapter does not support filtering on version',
        );
      }
      return next();
    };

    if (
      version === VERSION_NEUTRAL ||
      versioningOptions.type === VersioningType.URI
    ) {
      return (req, res, next) => handler(req, res, next);
    }

    if (versioningOptions.type === VersioningType.CUSTOM) {
      return (req, res, next) => {
        const extracted = versioningOptions.extractor(req);
        if (Array.isArray(version)) {
          if (
            (Array.isArray(extracted) &&
              version.filter(v => extracted.includes(v as string)).length) ||
            (isString(extracted) && version.includes(extracted))
          ) {
            return handler(req, res, next);
          }
        } else if (isString(version)) {
          if (
            (Array.isArray(extracted) && extracted.includes(version)) ||
            (isString(extracted) && version === extracted)
          ) {
            return handler(req, res, next);
          }
        }
        return callNext(req, res, next);
      };
    }

    if (versioningOptions.type === VersioningType.MEDIA_TYPE) {
      return (req, res, next) => {
        const acceptHeader: string | undefined =
          req.headers?.['Accept'] ?? req.headers?.['accept'];
        const versionParam = acceptHeader?.split(';')[1];
        if (isUndefined(versionParam)) {
          if (Array.isArray(version) && version.includes(VERSION_NEUTRAL)) {
            return handler(req, res, next);
          }
        } else {
          const headerVersion = versionParam!.split(versioningOptions.key)[1];
          if (
            (Array.isArray(version) && version.includes(headerVersion)) ||
            (isString(version) && version === headerVersion)
          ) {
            return handler(req, res, next);
          }
        }
        return callNext(req, res, next);
      };
    }

    if (versioningOptions.type === VersioningType.HEADER) {
      return (req, res, next) => {
        const headerVal: string | undefined =
          req.headers?.[versioningOptions.header] ??
          req.headers?.[versioningOptions.header.toLowerCase()];
        if (isUndefined(headerVal)) {
          if (Array.isArray(version) && version.includes(VERSION_NEUTRAL)) {
            return handler(req, res, next);
          }
        } else {
          if (
            (Array.isArray(version) && version.includes(headerVal)) ||
            (isString(version) && version === headerVal)
          ) {
            return handler(req, res, next);
          }
        }
        return callNext(req, res, next);
      };
    }

    throw new Error('Unsupported versioning options');
  }

  // ── Edge/serverless export ─────────────────────────────────────────────────

  /**
   * Returns Hono's fetch handler for edge/serverless deployment.
   * Use as: `export default { fetch: app.getFetch() }` (Cloudflare Workers)
   * or:     `Deno.serve(app.getFetch())`
   */
  public getFetch(): (req: globalThis.Request) => Promise<globalThis.Response> {
    const hono = this.instance as Hono;
    return (req: globalThis.Request) => Promise.resolve(hono.fetch(req));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _isEdgeRuntime(): boolean {
    return (
      typeof (globalThis as any).Bun !== 'undefined' ||
      typeof (globalThis as any).Deno !== 'undefined' ||
      // Cloudflare Workers detection
      (typeof (globalThis as any).caches !== 'undefined' &&
        typeof process === 'undefined')
    );
  }

  private _toHonoPath(path: string): string {
    // Convert Express-style :param to Hono-style :param (already compatible)
    // Convert Express wildcard * to Hono wildcard *
    return path || '/';
  }

  private _buildBridge(c: Context): {
    req: any;
    res: HonoResponseBridge;
  } {
    const res = new HonoResponseBridge();
    const env = c.env as any;
    if (env?.incoming) {
      return { req: env.incoming, res: env.outgoing ?? res };
    }
    const req = new HonoRequestBridge(c);
    return { req, res };
  }

  private async _dispatchToNest(
    c: Context,
    callback: Function,
  ): Promise<globalThis.Response> {
    // Node.js: delegate to real IncomingMessage/ServerResponse
    const env = c.env as any;
    if (env?.incoming) {
      const incoming = env.incoming;
      // Inject path params into req.params
      incoming.params = c.req.param();
      return new Promise<globalThis.Response>(resolve => {
        callback(incoming, env.outgoing, () => {
          resolve(new globalThis.Response(null, { status: 404 }));
        });
        // The actual response is written by NestJS to env.outgoing;
        // @hono/node-server handles the flush
        resolve(new globalThis.Response(null, { status: 200 }));
      });
    }

    // Edge runtimes: use bridge objects
    const req = new HonoRequestBridge(c);
    req.params = c.req.param();

    return new Promise<globalThis.Response>(resolve => {
      const res = new HonoResponseBridge();
      res.init(resolve);
      callback(req, res, () => {
        resolve(new globalThis.Response(null, { status: 404 }));
      });
    });
  }
}
