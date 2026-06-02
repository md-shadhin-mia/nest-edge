import { CallHandler } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { expect } from 'chai';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { AnyFilesInterceptor } from '../../../upload/interceptors/any-files.interceptor';
import * as uploadUtils from '../../../upload/upload.utils';

describe('AnyFilesInterceptor', () => {
  let handler: CallHandler;

  beforeEach(() => {
    handler = { handle: () => of('test') };
  });

  afterEach(() => sinon.restore());

  it('should return a class with an intercept method', () => {
    expect(AnyFilesInterceptor().prototype.intercept).to.be.a('function');
  });

  describe('intercept', () => {
    it('should pass null as fieldName to accept files from any field', async () => {
      const parseStub = sinon
        .stub(uploadUtils, 'parseUploadedFiles')
        .resolves([]);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      await new (AnyFilesInterceptor())().intercept(ctx, handler);

      expect(parseStub.firstCall.args[1]).to.be.null;
    });

    it('should attach all parsed files to req.files', async () => {
      const files = [
        {
          fieldname: 'img',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 200,
          buffer: new Uint8Array([]),
        },
        {
          fieldname: 'doc',
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 300,
          buffer: new Uint8Array([]),
        },
      ];
      sinon.stub(uploadUtils, 'parseUploadedFiles').resolves(files);

      const req: any = {};
      const ctx = new ExecutionContextHost([req, {}]);
      await new (AnyFilesInterceptor())().intercept(ctx, handler);

      expect(req.files).to.have.length(2);
      expect(req.files[0].fieldname).to.equal('img');
      expect(req.files[1].fieldname).to.equal('doc');
    });
  });
});
