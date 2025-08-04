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

export type SourceFile = {
  path: string;
  size: number;
};

type CurrentProcessingEntry = Omit<DestinationEntry, 'sha1'> & {
  sha1: crypto.Hash;
  path: string;
};

const defaultOptions: PackingOptions = {
  maxPartSize: Number.MAX_SAFE_INTEGER,
  outputNameFormat: '%d',
  compress: false
};

class FilePacker {
  private result: PackingResult;
  private options: PackingOptions;
  private curDest: CurrentProcessingEntry;

  constructor(
    private srcDir: string,
    private dstDir: string,
    options: Partial<PackingOptions>
  ) {
    this.result = {
      totalSize: 0,
      compressedSize: 0,
      parts: 0,
      fileList: [],
    };

    this.options = Object.assign({}, defaultOptions, options);

    if (!this.options.outputNameFormat?.includes('%d')) {
      throw new Error('Output name format missing \'%d\' placeholder.');
    }

    if (!this.options.outputNameFormat.endsWith('.uwu')) {
      this.options.outputNameFormat += '.uwu';
    }

    if (!this.options.compress) {
      this.options.compress = false;
    }

    this.curDest = this.initCurDst();
  }

  async pack(): Promise<PackingResult> {
    if (!fs.existsSync(this.dstDir)) {
      fs.mkdirSync(this.dstDir, { recursive: true });
    }

    for (const src of getFilesRecursively(this.srcDir)) {
      await this.processFile(src);
    }

    await this.finalizePart(this.curDest);

    this.result.parts = this.result.fileList.length;
    const metadataPath = path.join(
      this.dstDir, this.options.outputNameFormat.replace('%d', 'dat'),
    );

    await pipeline(
      stream.Readable.from(JSON.stringify(this.result)),
      zlib.createGzip({ level: 1 }),
      fs.createWriteStream(metadataPath),
    );

    return this.result;
  }

  async processFile(srcFile: SourceFile) {
    console.log(`Writing file ${srcFile.path}...`);
    let totalBytesRead = 0;

    while (totalBytesRead < srcFile.size) {
      const streamEnd = totalBytesRead + Math.min(srcFile.size, this.options.maxPartSize - this.curDest.size);
      let bytesRead = 0;

      await pipeline(
        fs.createReadStream(srcFile.path, { start: totalBytesRead, end: streamEnd - 1 }),
        new stream.Transform({
          transform: (chunk, _, next) => {
            bytesRead += chunk.byteLength;
            this.curDest.sha1.update(chunk);
            next(null, chunk);
          },
        }),
        fs.createWriteStream(`${this.curDest.path}.tmp`, { flags: 'a+' }),
      );

      this.curDest.fileList.push({
        filePath: path.relative(this.srcDir, srcFile.path),
        fileOffset: totalBytesRead,
        fileSize: srcFile.size,
        packageOffset: this.curDest.size,
        packageSize: bytesRead,
      });
      this.curDest.size += bytesRead;
      totalBytesRead += bytesRead;

      if (this.curDest.size === this.options.maxPartSize) {
        await this.finalizePart(this.curDest);
      }
    }
  }

  async finalizePart(dstEntry: CurrentProcessingEntry) {
    const finalEntry: DestinationEntry = {
      name: dstEntry.name,
      sha1: dstEntry.sha1.digest('hex'),
      size: dstEntry.size,
      compressed: dstEntry.compressed,
      fileList: dstEntry.fileList
    };

    if (finalEntry.compressed) {
      const hash = crypto.createHash('sha1');
      finalEntry.compressedSize = 0;

      console.log(`Compressing file ${this.curDest.path}...`);
      await pipeline(
        fs.createReadStream(`${this.curDest.path}.tmp`),
        zlib.createGzip({ level: 1 }),
        new stream.Transform({
          transform(chunk, _, next) {
            hash.update(chunk);
            finalEntry.compressedSize += chunk.byteLength;
            next(null, chunk);
          },
        }),
        fs.createWriteStream(this.curDest.path),
      );
      finalEntry.compressedSha1 = hash.digest("hex");
      fs.rmSync(`${this.curDest.path}.tmp`);
    } else {
      fs.renameSync(`${this.curDest.path}.tmp`, this.curDest.path);
    }

    this.result.totalSize += dstEntry.size;
    this.result.compressedSize += dstEntry.compressedSize ?? dstEntry.size;
    this.result.fileList.push(finalEntry);

    this.curDest = this.initCurDst();
  }

  get currentPartNumber() {
    return (this.result.fileList.length + 1).toString().padStart(3, '0');
  }

  private initCurDst() {
    const dstName = this.options.outputNameFormat.replace('%d', this.currentPartNumber);
    const dstPath = path.join(this.dstDir, dstName);

    return {
      name: dstName,
      path: dstPath,
      sha1: crypto.createHash('sha1'),
      size: 0,
      compressed: this.options.compress,
      fileList: []
    };
  }
}

function* getFilesRecursively(dir: string): Generator<SourceFile> {
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      yield* getFilesRecursively(filePath);
    } else {
      yield ({ path: filePath, size: stat.size });
    }
  }
}

export function packDir(
  srcDir: string,
  dstDir: string,
  options: Partial<PackingOptions> = defaultOptions
): Promise<PackingResult> {
  const packer = new FilePacker(srcDir, dstDir, options);
  return packer.pack();
}