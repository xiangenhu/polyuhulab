/**
 * Google Cloud Storage Service for Hu Lab Portal
 * Handles all file operations including upload, download, delete, versioning, and access control
 * All file storage operations should go through this service
 */

const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs').promises;
const uuid = require('uuid');
const mime = require('mime-types');
const sharp = require('sharp');

class GCSService {
    constructor() {
        this.storage = null;
        this.bucket = null;
        this.bucketName = process.env.GCS_BUCKET_NAME;
        this.projectId = process.env.GCS_PROJECT_ID;
        this.keyFilename = process.env.GCS_KEY_FILE;
        this.initialized = false;
        this.allowedFileTypes = {
            images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
            documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
            spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
            presentations: ['ppt', 'pptx', 'odp'],
            archives: ['zip', 'rar', '7z', 'tar', 'gz'],
            code: ['js', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'rb'],
            audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
            video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm']
        };
        this.maxFileSize = 100 * 1024 * 1024; // 100MB default
        this.thumbnailSize = { width: 300, height: 300 };
    }

    /**
     * Initialize Google Cloud Storage
     */
    async initialize() {
        try {
            const storageConfig = {
                projectId: this.projectId
            };

            // Use key file if provided, otherwise rely on environment authentication
            if (this.keyFilename && await this.fileExists(this.keyFilename)) {
                storageConfig.keyFilename = this.keyFilename;
            }

            this.storage = new Storage(storageConfig);
            this.bucket = this.storage.bucket(this.bucketName);

            // Verify bucket exists and is accessible
            const [exists] = await this.bucket.exists();
            if (!exists) {
                throw new Error(`Bucket ${this.bucketName} does not exist`);
            }

            this.initialized = true;
            console.log('Google Cloud Storage initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Google Cloud Storage:', error);
            throw new Error('GCS initialization failed: ' + error.message);
        }
    }

    /**
     * Upload file to GCS
     */
    async uploadFile(fileBuffer, fileName, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const {
                userId = 'anonymous',
                projectId = null,
                folder = 'general',
                metadata = {},
                generateThumbnail = false,
                isPublic = false,
                contentType = null
            } = options;

            // Generate unique filename
            const fileExtension = path.extname(fileName).toLowerCase();
            const fileId = uuid.v4();
            const sanitizedFileName = this.sanitizeFileName(path.basename(fileName, fileExtension));
            const uniqueFileName = `${sanitizedFileName}-${fileId}${fileExtension}`;
            
            // Create folder structure: userId/projectId/folder/file
            let filePath = `${userId}/${folder}/${uniqueFileName}`;
            if (projectId) {
                filePath = `${userId}/projects/${projectId}/${folder}/${uniqueFileName}`;
            }

            // Validate file
            await this.validateFile(fileBuffer, fileName);

            // Determine content type
            const detectedContentType = contentType || mime.lookup(fileName) || 'application/octet-stream';

            // Prepare file metadata
            const fileMetadata = {
                contentType: detectedContentType,
                metadata: {
                    originalName: fileName,
                    uploadedBy: userId,
                    uploadedAt: new Date().toISOString(),
                    projectId: projectId,
                    folder: folder,
                    fileId: fileId,
                    ...metadata
                }
            };

            // Upload main file
            const file = this.bucket.file(filePath);
            const stream = file.createWriteStream({
                metadata: fileMetadata,
                resumable: true,
                validation: 'crc32c'
            });

            const uploadPromise = new Promise((resolve, reject) => {
                stream.on('error', reject);
                stream.on('finish', resolve);
                stream.end(fileBuffer);
            });

            await uploadPromise;

            // Set public access if requested
            if (isPublic) {
                await file.makePublic();
            }

            // Generate thumbnail for images
            let thumbnailUrl = null;
            if (generateThumbnail && this.isImageFile(fileName)) {
                thumbnailUrl = await this.generateThumbnail(fileBuffer, filePath, fileId, userId, projectId);
            }

            // Get signed URL for private access
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
            });

            const result = {
                fileId: fileId,
                fileName: uniqueFileName,
                originalName: fileName,
                filePath: filePath,
                url: isPublic ? file.publicUrl() : signedUrl,
                thumbnailUrl: thumbnailUrl,
                contentType: detectedContentType,
                size: fileBuffer.length,
                uploadedAt: new Date().toISOString(),
                userId: userId,
                projectId: projectId,
                folder: folder,
                isPublic: isPublic
            };

            return result;
        } catch (error) {
            console.error('Error uploading file to GCS:', error);
            throw error;
        }
    }

    /**
     * Download file from GCS
     */
    async downloadFile(filePath, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { 
                generateSignedUrl = true,
                urlExpiration = 60 * 60 * 1000 // 1 hour
            } = options;

            const file = this.bucket.file(filePath);
            
            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new Error('File not found');
            }

            // Get file metadata
            const [metadata] = await file.getMetadata();

            let downloadUrl = null;
            if (generateSignedUrl) {
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + urlExpiration
                });
                downloadUrl = signedUrl;
            }

            return {
                filePath: filePath,
                downloadUrl: downloadUrl,
                metadata: metadata.metadata || {},
                contentType: metadata.contentType,
                size: metadata.size,
                created: metadata.timeCreated,
                updated: metadata.updated
            };
        } catch (error) {
            console.error('Error downloading file from GCS:', error);
            throw error;
        }
    }

    /**
     * Get file buffer (for processing)
     */
    async getFileBuffer(filePath) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const file = this.bucket.file(filePath);
            const [buffer] = await file.download();
            return buffer;
        } catch (error) {
            console.error('Error getting file buffer from GCS:', error);
            throw error;
        }
    }

    /**
     * Delete file from GCS
     */
    async deleteFile(filePath, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { deleteThumbnail = true } = options;

            const file = this.bucket.file(filePath);
            
            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new Error('File not found');
            }

            // Get metadata before deletion
            const [metadata] = await file.getMetadata();
            const fileId = metadata.metadata?.fileId;

            // Delete main file
            await file.delete();

            // Delete thumbnail if exists
            if (deleteThumbnail && fileId) {
                await this.deleteThumbnail(fileId, metadata.metadata?.uploadedBy, metadata.metadata?.projectId);
            }

            return {
                filePath: filePath,
                deleted: true,
                deletedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error deleting file from GCS:', error);
            throw error;
        }
    }

    /**
     * List files in a folder
     */
    async listFiles(userId, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const {
                projectId = null,
                folder = null,
                limit = 100,
                pageToken = null,
                includeMetadata = true
            } = options;

            let prefix = `${userId}/`;
            if (projectId) {
                prefix += `projects/${projectId}/`;
            }
            if (folder) {
                prefix += `${folder}/`;
            }

            const [files, , metadata] = await this.bucket.getFiles({
                prefix: prefix,
                maxResults: limit,
                pageToken: pageToken
            });

            const fileList = await Promise.all(files.map(async (file) => {
                const [fileMetadata] = includeMetadata ? await file.getMetadata() : [{}];
                
                return {
                    name: file.name,
                    size: fileMetadata.size,
                    contentType: fileMetadata.contentType,
                    created: fileMetadata.timeCreated,
                    updated: fileMetadata.updated,
                    metadata: fileMetadata.metadata || {},
                    publicUrl: fileMetadata.metadata?.isPublic ? file.publicUrl() : null
                };
            }));

            return {
                files: fileList,
                nextPageToken: metadata.nextPageToken || null,
                totalCount: files.length
            };
        } catch (error) {
            console.error('Error listing files from GCS:', error);
            throw error;
        }
    }

    /**
     * Generate signed URL for temporary access
     */
    async generateSignedUrl(filePath, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const {
                action = 'read',
                expires = Date.now() + 15 * 60 * 1000, // 15 minutes
                contentType = null
            } = options;

            const file = this.bucket.file(filePath);
            
            const signedUrlOptions = {
                action: action,
                expires: expires
            };

            if (contentType && action === 'write') {
                signedUrlOptions.contentType = contentType;
            }

            const [signedUrl] = await file.getSignedUrl(signedUrlOptions);

            return {
                signedUrl: signedUrl,
                expires: new Date(expires).toISOString(),
                filePath: filePath
            };
        } catch (error) {
            console.error('Error generating signed URL:', error);
            throw error;
        }
    }

    /**
     * Copy file
     */
    async copyFile(sourcePath, destinationPath, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const { updateMetadata = {} } = options;

            const sourceFile = this.bucket.file(sourcePath);
            const destinationFile = this.bucket.file(destinationPath);

            await sourceFile.copy(destinationFile);

            // Update metadata if provided
            if (Object.keys(updateMetadata).length > 0) {
                const [metadata] = await destinationFile.getMetadata();
                const newMetadata = {
                    ...metadata,
                    metadata: {
                        ...metadata.metadata,
                        ...updateMetadata,
                        copiedFrom: sourcePath,
                        copiedAt: new Date().toISOString()
                    }
                };

                await destinationFile.setMetadata(newMetadata);
            }

            return {
                sourcePath: sourcePath,
                destinationPath: destinationPath,
                copied: true,
                copiedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error copying file:', error);
            throw error;
        }
    }

    /**
     * Share file with other users
     */
    async shareFile(filePath, shareOptions = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const {
                emails = [],
                role = 'READER', // READER, WRITER, OWNER
                allowAnonymous = false,
                expirationTime = null
            } = shareOptions;

            const file = this.bucket.file(filePath);

            // Make file publicly accessible if allowAnonymous
            if (allowAnonymous) {
                await file.makePublic();
            }

            // Add specific email permissions (simplified - GCS doesn't directly support email-based permissions like Google Drive)
            // This would typically be handled at the application level with signed URLs

            const shareInfo = {
                filePath: filePath,
                sharedWith: emails,
                publicAccess: allowAnonymous,
                sharedAt: new Date().toISOString()
            };

            // Generate signed URLs for shared access
            if (emails.length > 0) {
                const expiration = expirationTime || (Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: expiration
                });
                shareInfo.sharedUrl = signedUrl;
                shareInfo.expires = new Date(expiration).toISOString();
            }

            return shareInfo;
        } catch (error) {
            console.error('Error sharing file:', error);
            throw error;
        }
    }

    /**
     * Generate thumbnail for images
     */
    async generateThumbnail(imageBuffer, originalFilePath, fileId, userId, projectId) {
        try {
            if (!this.isImageFile(originalFilePath)) {
                return null;
            }

            // Generate thumbnail using sharp
            const thumbnailBuffer = await sharp(imageBuffer)
                .resize(this.thumbnailSize.width, this.thumbnailSize.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 80 })
                .toBuffer();

            // Upload thumbnail
            let thumbnailPath = `${userId}/thumbnails/${fileId}.jpg`;
            if (projectId) {
                thumbnailPath = `${userId}/projects/${projectId}/thumbnails/${fileId}.jpg`;
            }

            const thumbnailFile = this.bucket.file(thumbnailPath);
            const stream = thumbnailFile.createWriteStream({
                metadata: {
                    contentType: 'image/jpeg',
                    metadata: {
                        originalFile: originalFilePath,
                        fileId: fileId,
                        thumbnailFor: originalFilePath,
                        createdAt: new Date().toISOString()
                    }
                }
            });

            await new Promise((resolve, reject) => {
                stream.on('error', reject);
                stream.on('finish', resolve);
                stream.end(thumbnailBuffer);
            });

            // Generate signed URL for thumbnail
            const [thumbnailUrl] = await thumbnailFile.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
            });

            return thumbnailUrl;
        } catch (error) {
            console.error('Error generating thumbnail:', error);
            return null;
        }
    }

    /**
     * Delete thumbnail
     */
    async deleteThumbnail(fileId, userId, projectId) {
        try {
            let thumbnailPath = `${userId}/thumbnails/${fileId}.jpg`;
            if (projectId) {
                thumbnailPath = `${userId}/projects/${projectId}/thumbnails/${fileId}.jpg`;
            }

            const thumbnailFile = this.bucket.file(thumbnailPath);
            const [exists] = await thumbnailFile.exists();
            
            if (exists) {
                await thumbnailFile.delete();
            }

            return true;
        } catch (error) {
            console.error('Error deleting thumbnail:', error);
            return false;
        }
    }

    /**
     * File validation
     */
    async validateFile(fileBuffer, fileName) {
        const fileExtension = path.extname(fileName).toLowerCase().substring(1);
        const fileSize = fileBuffer.length;

        // Check file size
        if (fileSize > this.maxFileSize) {
            throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB`);
        }

        // Check file type
        const isAllowedType = Object.values(this.allowedFileTypes)
            .some(types => types.includes(fileExtension));

        if (!isAllowedType) {
            throw new Error(`File type .${fileExtension} is not allowed`);
        }

        return true;
    }

    /**
     * Helper methods
     */
    sanitizeFileName(fileName) {
        return fileName
            .replace(/[^a-zA-Z0-9.-]/g, '_')
            .replace(/_{2,}/g, '_')
            .toLowerCase();
    }

    isImageFile(fileName) {
        const ext = path.extname(fileName).toLowerCase().substring(1);
        return this.allowedFileTypes.images.includes(ext);
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Batch operations
     */
    async uploadMultipleFiles(files, options = {}) {
        const results = [];
        const errors = [];

        for (const file of files) {
            try {
                const result = await this.uploadFile(file.buffer, file.name, {
                    ...options,
                    metadata: { ...options.metadata, batchId: uuid.v4() }
                });
                results.push(result);
            } catch (error) {
                errors.push({ fileName: file.name, error: error.message });
            }
        }

        return { results, errors };
    }

    /**
     * Get storage usage for a user
     */
    async getStorageUsage(userId, projectId = null) {
        try {
            let prefix = `${userId}/`;
            if (projectId) {
                prefix += `projects/${projectId}/`;
            }

            const [files] = await this.bucket.getFiles({ prefix });
            
            let totalSize = 0;
            const fileCount = files.length;
            const typeBreakdown = {};

            for (const file of files) {
                const [metadata] = await file.getMetadata();
                totalSize += parseInt(metadata.size || 0);
                
                const ext = path.extname(file.name).toLowerCase().substring(1) || 'unknown';
                typeBreakdown[ext] = (typeBreakdown[ext] || 0) + parseInt(metadata.size || 0);
            }

            return {
                userId,
                projectId,
                totalSize,
                fileCount,
                typeBreakdown,
                calculatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error calculating storage usage:', error);
            throw error;
        }
    }

    /**
     * Health check for GCS connection
     */
    async healthCheck() {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Try to list one file to test connection
            await this.bucket.getFiles({ maxResults: 1 });
            
            return { 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                bucket: this.bucketName
            };
        } catch (error) {
            return { 
                status: 'unhealthy', 
                error: error.message, 
                timestamp: new Date().toISOString() 
            };
        }
    }
}

module.exports = new GCSService();