const { Storage } = require('@google-cloud/storage');
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'gcs-config' }
});

class GCSConfig {
    constructor() {
        this.storage = null;
        this.bucket = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            // Initialize Google Cloud Storage
            const keyFilePath = process.env.GCS_KEY_FILE;
            
            // Check if credentials file exists (in production)
            if (process.env.NODE_ENV === 'production' && !keyFilePath) {
                throw new Error('GCS_KEY_FILE path not specified in production environment');
            }

            // Initialize storage client
            if (keyFilePath) {
                this.storage = new Storage({
                    projectId: process.env.GCS_PROJECT_ID,
                    keyFilename: keyFilePath
                });
            } else {
                // Development mode - use default credentials or emulator
                this.storage = new Storage({
                    projectId: process.env.GCS_PROJECT_ID || 'hulab-portal-dev'
                });
            }

            // Get bucket reference
            const bucketName = process.env.GCS_BUCKET_NAME || 'hulab-portal-storage';
            this.bucket = this.storage.bucket(bucketName);

            // Test bucket access
            const [exists] = await this.bucket.exists();
            
            if (!exists) {
                if (process.env.NODE_ENV === 'development') {
                    // Try to create bucket in development
                    await this.storage.createBucket(bucketName, {
                        location: 'US',
                        storageClass: 'STANDARD',
                        uniformBucketLevelAccess: {
                            enabled: true
                        }
                    });
                    logger.info(`Created GCS bucket: ${bucketName}`);
                } else {
                    throw new Error(`GCS bucket ${bucketName} does not exist`);
                }
            }

            // Set up CORS for bucket
            await this.configureCORS();

            this.initialized = true;
            logger.info('Google Cloud Storage initialized successfully');
            return true;
        } catch (error) {
            logger.error('GCS initialization failed:', error);
            // Don't throw in development to allow app to run without GCS
            if (process.env.NODE_ENV === 'production') {
                throw error;
            }
            return false;
        }
    }

    async configureCORS() {
        try {
            const corsConfiguration = [{
                origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
                method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
                responseHeader: ['Content-Type', 'Content-Length', 'Date', 'ETag', 'Cache-Control'],
                maxAgeSeconds: 3600
            }];

            await this.bucket.setCorsConfiguration(corsConfiguration);
            logger.info('CORS configuration set for GCS bucket');
        } catch (error) {
            logger.error('Failed to set CORS configuration:', error);
        }
    }

    getBucket() {
        if (!this.initialized) {
            throw new Error('GCS not initialized. Call initialize() first.');
        }
        return this.bucket;
    }

    getStorage() {
        if (!this.initialized) {
            throw new Error('GCS not initialized. Call initialize() first.');
        }
        return this.storage;
    }

    // Generate signed URL for file access
    async generateSignedUrl(fileName, action = 'read', expirationMinutes = 60) {
        const options = {
            version: 'v4',
            action: action,
            expires: Date.now() + expirationMinutes * 60 * 1000,
        };

        try {
            const [url] = await this.bucket.file(fileName).getSignedUrl(options);
            return url;
        } catch (error) {
            logger.error('Failed to generate signed URL:', error);
            throw error;
        }
    }

    // Helper to generate unique file names
    generateUniqueFileName(originalName, userId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const ext = path.extname(originalName);
        const name = path.basename(originalName, ext);
        return `${userId}/${timestamp}-${random}-${name}${ext}`;
    }

    // Helper to organize files by type
    getFilePath(fileType, userId, fileName) {
        const paths = {
            'profile': `users/${userId}/profile/${fileName}`,
            'research': `research/${fileName}`,
            'document': `documents/${userId}/${fileName}`,
            'assessment': `assessments/${fileName}`,
            'submission': `submissions/${userId}/${fileName}`,
            'temp': `temp/${fileName}`
        };

        return paths[fileType] || `misc/${userId}/${fileName}`;
    }

    // Get file metadata
    async getFileMetadata(fileName) {
        try {
            const file = this.bucket.file(fileName);
            const [metadata] = await file.getMetadata();
            return {
                name: metadata.name,
                size: metadata.size,
                contentType: metadata.contentType,
                created: metadata.timeCreated,
                updated: metadata.updated,
                md5Hash: metadata.md5Hash,
                crc32c: metadata.crc32c,
                metadata: metadata.metadata
            };
        } catch (error) {
            logger.error('Failed to get file metadata:', error);
            throw error;
        }
    }

    // Set custom metadata
    async setFileMetadata(fileName, customMetadata) {
        try {
            const file = this.bucket.file(fileName);
            await file.setMetadata({
                metadata: customMetadata
            });
            return true;
        } catch (error) {
            logger.error('Failed to set file metadata:', error);
            throw error;
        }
    }

    // Check if file exists
    async fileExists(fileName) {
        try {
            const file = this.bucket.file(fileName);
            const [exists] = await file.exists();
            return exists;
        } catch (error) {
            logger.error('Failed to check file existence:', error);
            return false;
        }
    }

    // List files with prefix
    async listFiles(prefix, delimiter = null) {
        try {
            const options = {
                prefix: prefix
            };
            
            if (delimiter) {
                options.delimiter = delimiter;
            }

            const [files] = await this.bucket.getFiles(options);
            return files.map(file => ({
                name: file.name,
                size: file.metadata.size,
                updated: file.metadata.updated,
                contentType: file.metadata.contentType
            }));
        } catch (error) {
            logger.error('Failed to list files:', error);
            throw error;
        }
    }

    // Create folder structure (GCS uses flat namespace, but we can simulate folders)
    createFolderStructure(userId) {
        const folders = [
            `users/${userId}/`,
            `users/${userId}/profile/`,
            `documents/${userId}/`,
            `submissions/${userId}/`
        ];

        // In GCS, folders are simulated by creating empty objects with trailing slashes
        // This is optional but helps with organization
        return folders;
    }
}

module.exports = new GCSConfig();