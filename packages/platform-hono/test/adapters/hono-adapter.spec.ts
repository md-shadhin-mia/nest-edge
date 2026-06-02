import { RequestMethod, VersioningType } from '@nestjs/common';
import { expect } from 'chai';
import { Hono } from 'hono';
import * as sinon from 'sinon';
import { HonoAdapter } from '../../adapters/hono-adapter';

describe('HonoAdapter', () => {
  let adapter: HonoAdapter;
  let honoInstance: Hono;

  beforeEach(() => {
    honoInstance = new Hono();
    adapter = new HonoAdapter(honoInstance);
  });

  afterEach(() => sinon.restore());

  // ── getType ────────────────────────────────────────────────────────────────

  describe('getType', () => {
    it('should return "hono"', () => {
      expect(adapter.getType()).to.equal('hono');
    });
  });

  // ── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should use the provided Hono instance', () => {
      expect(adapter.getInstance()).to.equal(honoInstance);
    });

    it('should create a default Hono instance when none is provided', () => {
      const defaultAdapter = new HonoAdapter();
      expect(defaultAdapter.getInstance()).to.be.instanceOf(Hono);
    });
  });

  // ── getFetch ───────────────────────────────────────────────────────────────

  describe('getFetch', () => {
    it('should return a function', () => {
      expect(adapter.getFetch()).to.be.a('function');
    });

    it('should return a fetch handler that responds to requests', async () => {
      honoInstance.get('/ping', c => c.text('pong'));
      const fetch = adapter.getFetch();
      const res = await fetch(new Request('http://localhost/ping'));
      expect(res.status).to.equal(200);
      const body = await res.text();
      expect(body).to.equal('pong');
    });
  });

  // ── response helpers ───────────────────────────────────────────────────────

  describe('status', () => {
    it('should call status on the response and return it', () => {
      const res = { status: sinon.stub().returnsThis() };
      const result = adapter.status(res, 201);
      expect(res.status.calledWith(201)).to.be.true;
      expect(result).to.equal(res);
    });
  });

  describe('end', () => {
    it('should call end on the response', () => {
      const res = { end: sinon.stub() };
      adapter.end(res, 'bye');
      expect(res.end.calledWith('bye')).to.be.true;
    });
  });

  describe('redirect', () => {
    it('should call redirect with url and statusCode', () => {
      const res = { redirect: sinon.stub() };
      adapter.redirect(res, 302, '/new-path');
      expect(res.redirect.calledWith('/new-path', 302)).to.be.true;
    });
  });

  describe('isHeadersSent', () => {
    it('should return response.headersSent', () => {
      expect(adapter.isHeadersSent({ headersSent: true })).to.be.true;
      expect(adapter.isHeadersSent({ headersSent: false })).to.be.false;
    });

    it('should return false when headersSent is undefined', () => {
      expect(adapter.isHeadersSent({})).to.be.false;
    });
  });

  describe('setHeader', () => {
    it('should call setHeader when available', () => {
      const res = { setHeader: sinon.stub() };
      adapter.setHeader(res, 'X-Custom', 'value');
      expect(res.setHeader.calledWith('X-Custom', 'value')).to.be.true;
    });

    it('should fall back to set() when setHeader is not available', () => {
      const res = { set: sinon.stub() };
      adapter.setHeader(res, 'X-Custom', 'value');
      expect(res.set.calledWith('X-Custom', 'value')).to.be.true;
    });
  });

  describe('getHeader', () => {
    it('should call getHeader when available', () => {
      const res = { getHeader: sinon.stub().returns('application/json') };
      const result = adapter.getHeader(res, 'Content-Type');
      expect(result).to.equal('application/json');
    });

    it('should fall back to get() when getHeader is not available', () => {
      const res = { get: sinon.stub().returns('text/plain') };
      const result = adapter.getHeader(res, 'Content-Type');
      expect(result).to.equal('text/plain');
    });
  });

  describe('appendHeader', () => {
    it('should call appendHeader when available', () => {
      const res = { appendHeader: sinon.stub() };
      adapter.appendHeader(res, 'Set-Cookie', 'a=1');
      expect(res.appendHeader.calledWith('Set-Cookie', 'a=1')).to.be.true;
    });
  });

  // ── request helpers ────────────────────────────────────────────────────────

  describe('getRequestHostname', () => {
    it('should return req.hostname', () => {
      expect(adapter.getRequestHostname({ hostname: 'example.com' })).to.equal(
        'example.com',
      );
    });

    it('should fall back to host header without port', () => {
      expect(
        adapter.getRequestHostname({ headers: { host: 'example.com:3000' } }),
      ).to.equal('example.com');
    });
  });

  describe('getRequestMethod', () => {
    it('should return req.method', () => {
      expect(adapter.getRequestMethod({ method: 'POST' })).to.equal('POST');
    });
  });

  describe('getRequestUrl', () => {
    it('should return originalUrl when present', () => {
      expect(
        adapter.getRequestUrl({ originalUrl: '/path?q=1', url: '/path' }),
      ).to.equal('/path?q=1');
    });

    it('should fall back to url', () => {
      expect(adapter.getRequestUrl({ url: '/path' })).to.equal('/path');
    });
  });

  // ── reply ──────────────────────────────────────────────────────────────────

  describe('reply', () => {
    it('should call status then json for object bodies', () => {
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
        send: sinon.stub(),
        getHeader: sinon.stub().returns(undefined),
        setHeader: sinon.stub(),
      };
      adapter.reply(res, { hello: 'world' }, 200);
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.calledWith({ hello: 'world' })).to.be.true;
    });

    it('should call send for string bodies', () => {
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
        send: sinon.stub(),
        getHeader: sinon.stub().returns(undefined),
        setHeader: sinon.stub(),
      };
      adapter.reply(res, 'hello');
      expect(res.send.calledWith('hello')).to.be.true;
    });

    it('should call send() with no args for null body', () => {
      const res = {
        send: sinon.stub(),
        status: sinon.stub().returnsThis(),
      };
      adapter.reply(res, null);
      expect(res.send.calledOnce).to.be.true;
    });
  });

  // ── registerParserMiddleware ───────────────────────────────────────────────

  describe('registerParserMiddleware', () => {
    it('should register a middleware on the Hono instance', () => {
      const useSpy = sinon.spy(honoInstance, 'use');
      adapter.registerParserMiddleware();
      expect(useSpy.calledOnce).to.be.true;
      expect(useSpy.calledWith('*')).to.be.true;
    });
  });

  // ── enableCors ─────────────────────────────────────────────────────────────

  describe('enableCors', () => {
    it('should register CORS middleware on the Hono instance', () => {
      const useSpy = sinon.spy(honoInstance, 'use');
      adapter.enableCors({ origin: '*' });
      expect(useSpy.calledOnce).to.be.true;
    });
  });

  // ── createMiddlewareFactory ────────────────────────────────────────────────

  describe('createMiddlewareFactory', () => {
    it('should return a function', () => {
      const factory = adapter.createMiddlewareFactory(RequestMethod.GET);
      expect(factory).to.be.a('function');
    });

    it('should register a GET route on the Hono instance', () => {
      const getSpy = sinon.spy(honoInstance, 'get');
      const factory = adapter.createMiddlewareFactory(RequestMethod.GET);
      factory('/test', () => {});
      expect(getSpy.calledOnce).to.be.true;
    });

    it('should register a POST route on the Hono instance', () => {
      const postSpy = sinon.spy(honoInstance, 'post');
      const factory = adapter.createMiddlewareFactory(RequestMethod.POST);
      factory('/submit', () => {});
      expect(postSpy.calledOnce).to.be.true;
    });

    it('should pass the path to the Hono instance', () => {
      const getSpy = sinon.spy(honoInstance, 'get');
      const factory = adapter.createMiddlewareFactory(RequestMethod.GET);
      factory('/my-route', () => {});
      expect(getSpy.firstCall.args[0]).to.equal('/my-route');
    });

    it('should default to "/" for empty path', () => {
      const getSpy = sinon.spy(honoInstance, 'get');
      const factory = adapter.createMiddlewareFactory(RequestMethod.GET);
      factory('', () => {});
      expect(getSpy.firstCall.args[0]).to.equal('/');
    });
  });

  // ── setErrorHandler ────────────────────────────────────────────────────────

  describe('setErrorHandler', () => {
    it('should register an onError handler on the Hono instance', () => {
      const onErrorSpy = sinon.spy(honoInstance, 'onError');
      adapter.setErrorHandler(() => {});
      expect(onErrorSpy.calledOnce).to.be.true;
    });
  });

  // ── setNotFoundHandler ─────────────────────────────────────────────────────

  describe('setNotFoundHandler', () => {
    it('should register a notFound handler on the Hono instance', () => {
      const notFoundSpy = sinon.spy(honoInstance, 'notFound');
      adapter.setNotFoundHandler(() => {});
      expect(notFoundSpy.calledOnce).to.be.true;
    });
  });

  // ── unsupported methods ────────────────────────────────────────────────────

  describe('useStaticAssets', () => {
    it('should throw an error', () => {
      expect(() => adapter.useStaticAssets()).to.throw();
    });
  });

  describe('setViewEngine', () => {
    it('should throw an error', () => {
      expect(() => adapter.setViewEngine('pug')).to.throw();
    });
  });

  describe('setBaseViewsDir', () => {
    it('should throw an error', () => {
      expect(() => adapter.setBaseViewsDir('/views')).to.throw();
    });
  });

  // ── applyVersionFilter ─────────────────────────────────────────────────────

  describe('applyVersionFilter', () => {
    const makeReq = (headers: Record<string, string> = {}) => ({ headers });
    const noopRes = {};
    const noopNext = () => {};

    it('should pass through for VERSION_NEUTRAL', () => {
      const handler = sinon.stub();
      const { VERSION_NEUTRAL } = require('@nestjs/common');
      const versioned = adapter.applyVersionFilter(handler, VERSION_NEUTRAL, {
        type: VersioningType.HEADER,
        header: 'X-API-Version',
      });
      versioned(makeReq(), noopRes, noopNext);
      expect(handler.calledOnce).to.be.true;
    });

    it('should pass through for URI versioning (handled by path)', () => {
      const handler = sinon.stub();
      const versioned = adapter.applyVersionFilter(handler, '1', {
        type: VersioningType.URI,
      });
      versioned(makeReq(), noopRes, noopNext);
      expect(handler.calledOnce).to.be.true;
    });

    it('should call handler when header version matches', () => {
      const handler = sinon.stub();
      const versioned = adapter.applyVersionFilter(handler, '2', {
        type: VersioningType.HEADER,
        header: 'x-api-version',
      });
      versioned(makeReq({ 'x-api-version': '2' }), noopRes, noopNext);
      expect(handler.calledOnce).to.be.true;
    });

    it('should call next when header version does not match', () => {
      const handler = sinon.stub();
      const next = sinon.stub();
      const versioned = adapter.applyVersionFilter(handler, '2', {
        type: VersioningType.HEADER,
        header: 'x-api-version',
      });
      versioned(makeReq({ 'x-api-version': '1' }), noopRes, next);
      expect(handler.called).to.be.false;
      expect(next.calledOnce).to.be.true;
    });

    it('should call handler for matching custom extractor version', () => {
      const handler = sinon.stub();
      const versioned = adapter.applyVersionFilter(handler, '3', {
        type: VersioningType.CUSTOM,
        extractor: (req: any) => req.headers['x-ver'],
      });
      versioned(makeReq({ 'x-ver': '3' }), noopRes, noopNext);
      expect(handler.calledOnce).to.be.true;
    });

    it('should call handler for matching media-type version', () => {
      const handler = sinon.stub();
      const versioned = adapter.applyVersionFilter(handler, '1', {
        type: VersioningType.MEDIA_TYPE,
        key: 'v=',
      });
      versioned(makeReq({ accept: 'application/json;v=1' }), noopRes, noopNext);
      expect(handler.calledOnce).to.be.true;
    });

    it('should call next for non-matching media-type version', () => {
      const handler = sinon.stub();
      const next = sinon.stub();
      const versioned = adapter.applyVersionFilter(handler, '2', {
        type: VersioningType.MEDIA_TYPE,
        key: 'v=',
      });
      versioned(makeReq({ accept: 'application/json;v=1' }), noopRes, next);
      expect(handler.called).to.be.false;
      expect(next.calledOnce).to.be.true;
    });

    it('should throw for unsupported versioning type', () => {
      expect(() =>
        adapter.applyVersionFilter(sinon.stub(), '1', {
          type: 99 as any,
        }),
      ).to.throw();
    });
  });
});
