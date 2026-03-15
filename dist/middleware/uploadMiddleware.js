"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const multer_s3_1 = __importDefault(require("multer-s3"));
const path_1 = __importDefault(require("path"));
const s3Client_1 = require("../config/s3Client");
// ⚡ FIX: Allow Images AND PDFs
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') ||
        file.mimetype === 'application/pdf') {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type! Please upload only Images or PDFs.'), false);
    }
};
exports.upload = (0, multer_1.default)({
    storage: (0, multer_s3_1.default)({
        s3: s3Client_1.s3,
        bucket: s3Client_1.BUCKET_NAME,
        contentType: multer_s3_1.default.AUTO_CONTENT_TYPE, // Auto-detects (image/jpeg, application/pdf)
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Generate Unique Filename
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
        }
    }),
    fileFilter: fileFilter,
    limits: { fileSize: 1024 * 1024 * 10 } // 10MB Limit
});
