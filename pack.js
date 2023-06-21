const fs = require('fs');
const stream = require('stream');
const crypto = require('crypto');
const zlib = require('zlib');
const path = require('path');
const {pipeline} = require('stream/promises');

const result = {
  totalSize: 0,
  compressedSize: 0,
  parts: 0,
  fileList: [],
};

// eslint-disable-next-line require-jsdoc
async function pack(srcDir, dstDir, options) {
  if (!options) {
    options = {
      maxPartSize: Number.MAX_SAFE_INTEGER,
      outputNameFormat: '%d',
    };
  }

  if (!options.maxPartSize) {
    options.maxPartSize = Number.MAX_SAFE_INTEGER;
  }

  if (!options.outputNameFormat) {
    options.outputNameFormat = '%d';
  }

  if (!options.outputNameFormat.includes('%d')) {
    throw new Error('Output name format missing \'%d\' placeholder.');
  }

  if (!options.outputNameFormat.endsWith('.uwu')) {
    options.outputNameFormat += '.uwu';
  }

  if (!options.compress) {
    options.compress = false;
  }

  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, {recursive: true});
  }

  let partNumber = (result.fileList.length + 1).toString().padStart(3, '0');
  let dst = {
    name: options.outputNameFormat.replace('%d', partNumber),
    sha1: crypto.createHash('sha1'),
    size: 0,
    compressed: false,
    compressedSha1: undefined,
    compressedSize: undefined,
    fileList: [],
  };

  if (options.compress) {
    dst.compressed = true;
    dst.compressedSha1 = crypto.createHash('sha1');
    dst.compressedSize = 0;
  }

  let dstPath = path.join(dstDir, dst.name);

  for (const src of getFilesRecursively(srcDir)) {
    console.log(`Writing file ${src.file}...`);
    let srcRead = 0;

    while (srcRead < src.size) {
      const maxFisEnd = options.maxPartSize - dst.size;
      const fisEnd = srcRead + Math.min(src.size, maxFisEnd);
      let bytesRead = 0;

      await pipeline(
          fs.createReadStream(src.file, {start: srcRead, end: fisEnd - 1}),
          new stream.Transform({
            transform(chunk, _, next) {
              bytesRead += chunk.byteLength;
              dst.sha1.update(chunk);
              next(null, chunk);
            },
          }),
          fs.createWriteStream(`${dstPath}.tmp`, {flags: 'a+'}),
      );

      dst.fileList.push({
        filePath: path.relative(srcDir, src.file),
        fileOffset: srcRead,
        fileSize: src.size,
        packageOffset: dst.size,
        packageSize: bytesRead,
      });
      dst.size += bytesRead;
      srcRead += bytesRead;

      if (dst.size === options.maxPartSize) {
        await closeFilePart(dst, dstPath, options.compress);
        partNumber = (result.fileList.length + 1).toString().padStart(3, '0');
        dst = {
          name: options.outputNameFormat.replace('%d', partNumber),
          sha1: crypto.createHash('sha1'),
          size: 0,
          compressed: false,
          compressedSha1: undefined,
          compressedSize: undefined,
          fileList: [],
        };

        if (options.compress) {
          dst.compressed = true;
          dst.compressedSha1 = crypto.createHash('sha1');
          dst.compressedSize = 0;
        }

        dstPath = path.join(dstDir, dst.name);
      }
    }
  }

  await closeFilePart(dst, dstPath, options.compress);
  result.parts = result.fileList.length;

  const metadataPath = path.join(
      dstDir, options.outputNameFormat.replace('%d', 'dat'),
  );

  await pipeline(
      stream.Readable.from(JSON.stringify(result)),
      zlib.createGzip({level: 1}),
      fs.createWriteStream(metadataPath),
  );
}

module.exports = pack;

// eslint-disable-next-line require-jsdoc
async function closeFilePart(fileObj, filePath, compress = false) {
  fileObj.sha1 = fileObj.sha1.digest('hex');

  if (compress) {
    console.log(`Compressing file ${filePath}...`);
    await pipeline(
        fs.createReadStream(`${filePath}.tmp`),
        zlib.createGzip({level: 1}),
        new stream.Transform({
          transform(chunk, _, next) {
            fileObj.compressedSha1.update(chunk);
            fileObj.compressedSize += chunk.byteLength;
            next(null, chunk);
          },
        }),
        fs.createWriteStream(filePath),
    );
    fs.rmSync(`${filePath}.tmp`);
  } else {
    fs.renameSync(`${filePath}.tmp`, filePath);
  }

  result.totalSize += fileObj.size;
  result.compressedSize += fileObj.compressedSize;
  result.fileList.push(Object.assign({}, fileObj));
}

// eslint-disable-next-line require-jsdoc
function* getFilesRecursively(dir) {
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      yield* getFilesRecursively(filePath);
    } else {
      yield ({file: filePath, size: stat.size});
    }
  }
}
