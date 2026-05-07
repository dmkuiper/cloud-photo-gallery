const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Initialise GCS client.
// On GCE with the correct service account attached, credentials are
// picked up automatically from the metadata server.
// Locally, set GOOGLE_APPLICATION_CREDENTIALS to your key file.
const storageClient = new Storage(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }
    : {}
);

const bucket = storageClient.bucket(process.env.GCS_BUCKET_NAME);

/**
 * Upload a buffer to GCS.
 * @param {Buffer} buffer       File data
 * @param {string} destination  Path inside the bucket (e.g. "photos/uuid.jpg")
 * @param {string} mimetype     MIME type of the file
 * @returns {Promise<string>}   Public URL
 */
async function uploadToGCS(buffer, destination, mimetype) {
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
  });

  return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${destination}`;
}

/**
 * Delete a file from GCS.
 * @param {string} destination  Path inside the bucket
 */
async function deleteFromGCS(destination) {
  try {
    await bucket.file(destination).delete();
  } catch (err) {
    console.error('GCS delete error:', err.message);
  }
}

/**
 * Get a signed download URL valid for 15 minutes.
 * @param {string} destination  Path inside the bucket
 * @returns {Promise<string>}   Signed URL
 */
async function getSignedUrl(destination, originalName) {
  const [url] = await bucket.file(destination).getSignedUrl({
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000, // 15 min
    responseDisposition: `attachment; filename="${originalName || 'photo'}"`,
  });
  return url;
}

module.exports = { uploadToGCS, deleteFromGCS, getSignedUrl };
