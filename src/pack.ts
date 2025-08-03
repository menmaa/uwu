import fs from 'fs';
import stream from 'stream';
import crypto from 'crypto';
import zlib from 'zlib';
import path from 'path';
import { pipeline } from 'stream/promises';

export type PackingOptions = {
  maxPartSize: number;
  outputNameFormat: string;
  compress: boolean;
};

export type FileType = {
  filePath: string;
  fileOffset: number;
  fileSize: number;
  packageOffset: number;
  packageSize: number;
};

export type DestinationEntry = {
  name: string;
  sha1: string;
  size: number;
  compressed: boolean;
  compressedSha1?: string;
  compressedSize?: number;
  fileList: FileType[],
};

export type PackingResult = {
  totalSize: number;
  compressedSize: number;
  parts: number;
  fileList: DestinationEntry[];
};

const defaultOptions: PackingOptions = {
  maxPartSize: Number.MAX_SAFE_INTEGER,
  outputNameFormat: '%d',
  compress: false
};

class FilePacker {
  private result: PackingResult;
  private options: PackingOptions;

  constructor(options?: Partial<PackingOptions>) {
    this.result = {
      totalSize: 0,
      compressedSize: 0,
      parts: 0,
      fileList: [],
    };

    this.options = Object.assign({}, defaultOptions);
    if (options) {
      Object.assign(this.options, options);
    }

    if (!this.options.outputNameFormat?.includes('%d')) {
      throw new Error('Output name format missing \'%d\' placeholder.');
    }

    if (!this.options.outputNameFormat.endsWith('.uwu')) {
      this.options.outputNameFormat += '.uwu';
    }

    if (!this.options.compress) {
      this.options.compress = false;
    }
  }

  async pack(srcDir: string, dstDir: string): Promise<PackingResult> {
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
    }

    let partNumber = (this.result.fileList.length + 1).toString().padStart(3, '0');
    let hash = crypto.createHash('sha1');
    let destEntry: Omit<DestinationEntry, 'sha1'> = {
      name: this.options.outputNameFormat.replace('%d', partNumber),
      size: 0,
      compressed: this.options.compress,
      fileList: []
    };
    let destPath = path.join(dstDir, destEntry.name);

    for (const src of getFilesRecursively(srcDir)) {
      console.log(`Writing file ${src.file}...`);
      let srcRead = 0;

      while (srcRead < src.size) {
        const streamEnd = srcRead + Math.min(src.size, this.options.maxPartSize - destEntry.size);
        let bytesRead = 0;

        await pipeline(
          fs.createReadStream(src.file, { start: srcRead, end: streamEnd - 1 }),
          new stream.Transform({
            transform(chunk, _, next) {
              bytesRead += chunk.byteLength;
              hash.update(chunk);
              next(null, chunk);
            },
          }),
          fs.createWriteStream(`${destPath}.tmp`, { flags: 'a+' }),
        );

        destEntry.fileList.push({
          filePath: path.relative(srcDir, src.file),
          fileOffset: srcRead,
          fileSize: src.size,
          packageOffset: destEntry.size,
          packageSize: bytesRead,
        });
        destEntry.size += bytesRead;
        srcRead += bytesRead;

        if (destEntry.size === this.options.maxPartSize) {
          const sha1 = hash.digest('hex');
          await this.finalizePart({ sha1, ...destEntry }, destPath);

          partNumber = (this.result.fileList.length + 1).toString().padStart(3, '0');
          hash = crypto.createHash('sha1');
          destEntry = {
            name: this.options.outputNameFormat.replace('%d', partNumber),
            size: 0,
            compressed: this.options.compress,
            fileList: []
          };
          destPath = path.join(dstDir, destEntry.name);
        }
      }

      const sha1 = hash.digest('hex');
      await this.finalizePart({ sha1, ...destEntry }, destPath);
      this.result.parts = this.result.fileList.length;

      const metadataPath = path.join(
        dstDir, this.options.outputNameFormat.replace('%d', 'dat'),
      );

      await pipeline(
        stream.Readable.from(JSON.stringify(this.result)),
        zlib.createGzip({ level: 1 }),
        fs.createWriteStream(metadataPath),
      );
    }

    return this.result;
  }

  async finalizePart(dstEntry: DestinationEntry, filePath: string) {
    if (dstEntry.compressed) {
      const hash = crypto.createHash('sha1');
      dstEntry.compressedSize = 0;

      console.log(`Compressing file ${filePath}...`);
      await pipeline(
        fs.createReadStream(`${filePath}.tmp`),
        zlib.createGzip({ level: 1 }),
        new stream.Transform({
          transform(chunk, _, next) {
            hash.update(chunk);
            dstEntry.compressedSize += chunk.byteLength;
            next(null, chunk);
          },
        }),
        fs.createWriteStream(filePath),
      );
      dstEntry.compressedSha1 = hash.digest("hex");
      fs.rmSync(`${filePath}.tmp`);
    } else {
      fs.renameSync(`${filePath}.tmp`, filePath);
    }

    this.result.totalSize += dstEntry.size;
    this.result.compressedSize += dstEntry.compressedSize ?? dstEntry.size;
    this.result.fileList.push(Object.assign({}, dstEntry));
  }
}

function* getFilesRecursively(dir: string): Generator<{ file: string; size: number }> {
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      yield* getFilesRecursively(filePath);
    } else {
      yield ({ file: filePath, size: stat.size });
    }
  }
}

export function packFile(srcDir: string, dstDir: string, options?: PackingOptions): Promise<PackingResult> {
  const packer = new FilePacker(options);
  return packer.pack(srcDir, dstDir);
}