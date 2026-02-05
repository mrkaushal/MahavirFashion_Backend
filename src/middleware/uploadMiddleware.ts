import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import { s3, BUCKET_NAME } from '../config/s3Client';

// ⚡ FIX: Allow Images AND PDFs
const fileFilter = (req: any, file: any, cb: any) => {
  if (
    file.mimetype.startsWith('image/') || 
    file.mimetype === 'application/pdf'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type! Please upload only Images or PDFs.'), false);
  }
};

export const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE, // Auto-detects (image/jpeg, application/pdf)
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      // Generate Unique Filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 10 } // 10MB Limit
});