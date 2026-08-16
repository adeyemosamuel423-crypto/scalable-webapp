const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Advanced feature #2: media conversion. When a creator uploads a video we
// use ffmpeg to (a) probe its duration and (b) extract a thumbnail frame,
// which is then pushed to object storage alongside the video itself.
// This mirrors what a managed media-conversion pipeline (e.g. AWS
// Elemental MediaConvert / Elastic Transcoder) would do in a full
// cloud deployment, but runs entirely locally via the ffmpeg binary
// bundled into the backend Docker image.

function probeDuration(localFilePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(localFilePath, (err, metadata) => {
      if (err) {
        console.error('[ffprobe] failed to read metadata', err.message);
        return resolve(null);
      }
      resolve(Math.round(metadata.format.duration || 0));
    });
  });
}

function extractThumbnail(localFilePath, timestampSecs = 1) {
  return new Promise((resolve, reject) => {
    const outDir = os.tmpdir();
    const outName = `thumb-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    ffmpeg(localFilePath)
      .on('end', () => resolve(path.join(outDir, outName)))
      .on('error', (err) => {
        console.error('[ffmpeg] thumbnail extraction failed', err.message);
        reject(err);
      })
      .screenshots({
        timestamps: [timestampSecs],
        filename: outName,
        folder: outDir,
        size: '480x?',
      });
  });
}

function safeUnlink(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.warn('[cleanup] could not remove temp file', filePath);
  });
}

module.exports = { probeDuration, extractThumbnail, safeUnlink };
