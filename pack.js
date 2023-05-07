const fs = require('fs');
const stream = require('stream');
const crypto = require('crypto');
const path = require('path');
const {pipeline} = require('stream/promises');

const result = {
  totalSize: 0,
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

  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, {recursive: true});
  }

  let partNumber = (result.fileList.length + 1).toString().padStart(3, '0');
  let dst = {
    name: options.outputNameFormat.replace('%d', partNumber),
    sha1: crypto.createHash('sha1'),
    size: 0,
    fileList: [],
  };
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
          fs.createWriteStream(dstPath, {flags: 'a+'}),
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
        closeFilePart(dst);
        partNumber = (result.fileList.length + 1).toString().padStart(3, '0');
        dst = {
          name: options.outputNameFormat.replace('%d', partNumber),
          sha1: crypto.createHash('sha1'),
          size: 0,
          fileList: [],
        };
        dstPath = path.join(dstDir, dst.name);
      }
    }
  }

  closeFilePart(dst);
  result.parts = result.fileList.length;
  fs.writeFileSync(
      path.join(dstDir, options.outputNameFormat.replace('%d', 'dat')),
      Buffer.from(JSON.stringify(result)).toString('base64'),
  );
}

module.exports = pack;

// eslint-disable-next-line require-jsdoc
function closeFilePart(file) {
  file.sha1 = file.sha1.digest('hex');
  result.totalSize += file.size;
  result.fileList.push(Object.assign({}, file));
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
