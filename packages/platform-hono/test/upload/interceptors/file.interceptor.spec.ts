import { CallHandler } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { expect } from 'chai';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { FileInterceptor } from '../../../upload/interceptors/file.interceptor';
import * as uploadUtils from '../../../upload/upload.utils';

describe('FileInterceptor', () => {
  let handler: CallHandler;

  beforeEach(() => {
    handler = { handle: () => of('test') };
  });

  afterEach(() => sinon.restore());

  it('should return a class with an intercept method', () => {
    const Target = FileInterceptor('file');
    expect(Target.prototype.intercept).to.be.a('function');
  });

  describe('intercept', () => {
    it('should attach the first parsed file to req.file', async () => {
      const fakeFile = {
        fieldname: 'file',
        originalname: 'test.png',
        mimetype: 'image/png',
        size: 100,
        buffer: new Uint8Array([1, 2, 3]),
      };
      sinon.stub(uploadUtils, 'parseUploadedFiles').resolves([fakeFile]);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      const target = new (FileInterceptor('file'))();

      await target.intercept(ctx, handler);

      expect(req.file).to.deep.equal(fakeFile);
    });

    it('should set req.file to undefined when no file is found', async () => {
      sinon.stub(uploadUtils, 'parseUploadedFiles').resolves([]);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      const target = new (FileInterceptor('file'))();

      await target.intercept(ctx, handler);

      expect(req.file).to.be.undefined;
    });

    it('should propagate errors from parseUploadedFiles', async () => {
      sinon
        .stub(uploadUtils, 'parseUploadedFiles')
        .rejects(new Error('too large'));

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      const target = new (FileInterceptor('file'))();

      try {
        await target.intercept(ctx, handler);
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('too large');
      }
    });

    it('should merge module options with local options', async () => {
      const parseStub = sinon
        .stub(uploadUtils, 'parseUploadedFiles')
        .resolves([]);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      const Target = FileInterceptor('avatar', { limits: { fileSize: 500 } });
      const target = new Target({ limits: { fileSize: 1000 } } as any);

      await target.intercept(ctx, handler);

      const calledOptions = parseStub.firstCall.args[2];
      expect(calledOptions?.limits?.fileSize).to.equal(500);
    });
  });
});
