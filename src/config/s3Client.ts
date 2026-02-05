import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

export const BUCKET_NAME = process.env.B2_BUCKET_NAME!;

export const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT, // e.g. https://s3.us-west-004.backblazeb2.com
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!
  }
});

// ⚡ HELPER: Generate Secure Signed URL
export const getSignedFileUrl = async (fileUrl: string | null) => {
  if (!fileUrl) return null;

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
    if (key.startsWith(`${BUCKET_NAME}/`)) {
        key = key.replace(`${BUCKET_NAME}/`, '');
    }

    // 3. Create the Command
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    // 4. Generate Signed URL (Valid for 1 Hour)
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    return signedUrl;

  } catch (error) {
    console.error(`[S3 Sign Error] Could not sign URL: ${fileUrl}`, error);
    return fileUrl; // Fallback to original (will likely 403/401 if private)
  }
};