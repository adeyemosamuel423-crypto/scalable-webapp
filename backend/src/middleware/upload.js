const multer = require('multer');
const path = require('path');
const os = require('os');

// Videos are buffered briefly to local disk (container tmp) before being
// streamed into object storage - keeps memory usage bounded for large files.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const ALLOWED_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`Unsupported video format: ${file.mimetype}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB cap
});

module.exports = upload;
