import { CallHandler } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { expect } from 'chai';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { FilesInterceptor } from '../../../upload/interceptors/files.interceptor';
import * as uploadUtils from '../../../upload/upload.utils';

const makeFile = (name: string) => ({
  fieldname: 'files',
  originalname: name,
  mimetype: 'image/png',
  size: 50,
  buffer: new Uint8Array([]),
});

describe('FilesInterceptor', () => {
  let handler: CallHandler;

  beforeEach(() => {
    handler = { handle: () => of('test') };
  });

  afterEach(() => sinon.restore());

  it('should return a class with an intercept method', () => {
    expect(FilesInterceptor('files').prototype.intercept).to.be.a('function');
  });

  describe('intercept', () => {
    it('should attach parsed files array to req.files', async () => {
      const files = [makeFile('a.png'), makeFile('b.png')];
      sinon.stub(uploadUtils, 'parseUploadedFiles').resolves(files);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      await new (FilesInterceptor('files'))().intercept(ctx, handler);

      expect(req.files).to.deep.equal(files);
    });

    it('should cap files limit to maxCount', async () => {
      const parseStub = sinon
        .stub(uploadUtils, 'parseUploadedFiles')
        .resolves([]);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      await new (FilesInterceptor('files', 3))().intercept(ctx, handler);

      const calledOptions = parseStub.firstCall.args[2];
      expect(calledOptions?.limits?.files).to.equal(3);
    });

    it('should set req.files to empty array when no files found', async () => {
      sinon.stub(uploadUtils, 'parseUploadedFiles').resolves([]);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      await new (FilesInterceptor('files'))().intercept(ctx, handler);

      expect(req.files).to.deep.equal([]);
    });
  });
});
