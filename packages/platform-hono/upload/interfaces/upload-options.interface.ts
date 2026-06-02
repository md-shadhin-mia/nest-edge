/**
 * @publicApi
 */
export interface UploadOptions {
  /**
   * Destination directory for uploaded files (Node.js only).
   * When omitted, files are kept in memory as Uint8Array.
   */
  dest?: string;

  /**
   * Per-field file size limits.
   */
  limits?: {
    /** Maximum number of files per request. Default: Infinity */
    files?: number;
    /** Maximum file size in bytes. Default: Infinity */
    fileSize?: number;
  };

  /**
   * Function to control which files are accepted.
   * Call `cb(null, true)` to accept or `cb(null, false)` to reject.
   */
  fileFilter?: (
    file: HonoUploadedFile,
    cb: (error: Error | null, accept: boolean) => void,
  ) => void;
}

/**
 * Represents an uploaded file from a multipart/form-data request.
 * Compatible across all runtimes (uses Web Standard File/Blob).
 *
 * @publicApi
 */
export interface HonoUploadedFile {
  /** Original field name from the form */
  fieldname: string;
  /** Original filename from the client */
  originalname: string;
  /** MIME type of the file */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** In-memory buffer (when no dest is set) */
  buffer?: Uint8Array;
  /** Path on disk (when dest is set, Node.js only) */
  path?: string;
}
