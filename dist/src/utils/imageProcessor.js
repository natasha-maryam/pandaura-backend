"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageProcessor = exports.ImageProcessor = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
class ImageProcessor {
    constructor() {
        this.uploadDir = path_1.default.join(process.cwd(), 'uploads', 'images');
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/tiff'
        ];
        // Ensure upload directory exists
        this.ensureUploadDir();
    }
    ensureUploadDir() {
        if (!fs_1.default.existsSync(this.uploadDir)) {
            fs_1.default.mkdirSync(this.uploadDir, { recursive: true });
        }
    }
    validateImage(file) {
        // Check file size
        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: `File size exceeds maximum limit of ${this.maxFileSize / (1024 * 1024)}MB`
            };
        }
        // Check MIME type
        if (!this.allowedMimeTypes.includes(file.mimetype)) {
            return {
                valid: false,
                error: `Unsupported file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`
            };
        }
        return { valid: true };
    }
    async saveImage(file) {
        const imageId = (0, uuid_1.v4)();
        const fileExtension = path_1.default.extname(file.originalname);
        const filename = `${imageId}${fileExtension}`;
        const filePath = path_1.default.join(this.uploadDir, filename);
        // Save file
        fs_1.default.writeFileSync(filePath, file.buffer);
        const imageInfo = {
            id: imageId,
            originalName: file.originalname,
            filename,
            path: filePath,
            size: file.size,
            mimeType: file.mimetype,
            uploadedAt: new Date()
        };
        return imageInfo;
    }
    async getImageBase64(imagePath) {
        try {
            const imageBuffer = fs_1.default.readFileSync(imagePath);
            const mimeType = this.getMimeTypeFromPath(imagePath);
            return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        }
        catch (error) {
            throw new Error(`Failed to convert image to base64: ${error}`);
        }
    }
    async deleteImage(imagePath) {
        try {
            if (fs_1.default.existsSync(imagePath)) {
                fs_1.default.unlinkSync(imagePath);
            }
        }
        catch (error) {
            console.error(`Failed to delete image ${imagePath}:`, error);
        }
    }
    async cleanupOldImages(maxAge = 24 * 60 * 60 * 1000) {
        try {
            const files = fs_1.default.readdirSync(this.uploadDir);
            const now = Date.now();
            for (const file of files) {
                const filePath = path_1.default.join(this.uploadDir, file);
                const stats = fs_1.default.statSync(filePath);
                if (now - stats.mtime.getTime() > maxAge) {
                    await this.deleteImage(filePath);
                }
            }
        }
        catch (error) {
            console.error('Failed to cleanup old images:', error);
        }
    }
    getMimeTypeFromPath(filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.tiff': 'image/tiff'
        };
        return mimeMap[ext] || 'image/jpeg';
    }
    getImageInfo(imagePath) {
        try {
            const stats = fs_1.default.statSync(imagePath);
            const filename = path_1.default.basename(imagePath);
            const imageId = path_1.default.parse(filename).name;
            return {
                id: imageId,
                originalName: filename,
                filename,
                path: imagePath,
                size: stats.size,
                mimeType: this.getMimeTypeFromPath(imagePath),
                uploadedAt: stats.mtime
            };
        }
        catch (error) {
            return null;
        }
    }
}
exports.ImageProcessor = ImageProcessor;
exports.imageProcessor = new ImageProcessor();
