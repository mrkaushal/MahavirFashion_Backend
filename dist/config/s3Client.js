"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignedFileUrl = exports.s3 = exports.BUCKET_NAME = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.BUCKET_NAME = process.env.B2_BUCKET_NAME;
exports.s3 = new client_s3_1.S3Client({
    endpoint: process.env.B2_ENDPOINT, // e.g. https://s3.us-west-004.backblazeb2.com
    region: process.env.B2_REGION,
    credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY
    }
});
// ⚡ HELPER: Generate Secure Signed URL
const getSignedFileUrl = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    if (!fileUrl)
        return null;
    try {
        // 1. Parse the URL object to safely get the path
        const urlObj = new URL(fileUrl);
        const pathName = decodeURIComponent(urlObj.pathname);
        // 2. Extract Key
        // Backblaze URL Format: /BUCKET_NAME/filename.jpg
        // We need just: filename.jpg
        // Remove leading slash
        let key = pathName.startsWith('/') ? pathName.slice(1) : pathName;
        // Remove Bucket Name if it exists in the path
        if (key.startsWith(`${exports.BUCKET_NAME}/`)) {
            key = key.replace(`${exports.BUCKET_NAME}/`, '');
        }
        // 3. Create the Command
        const command = new client_s3_1.GetObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
        });
        // 4. Generate Signed URL (Valid for 1 Hour)
        const signedUrl = yield (0, s3_request_presigner_1.getSignedUrl)(exports.s3, command, { expiresIn: 3600 });
        return signedUrl;
    }
    catch (error) {
        console.error(`[S3 Sign Error] Could not sign URL: ${fileUrl}`, error);
        return fileUrl; // Fallback to original (will likely 403/401 if private)
    }
});
exports.getSignedFileUrl = getSignedFileUrl;
