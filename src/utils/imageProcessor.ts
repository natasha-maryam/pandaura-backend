import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ImageInfo {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  dimensions?: {
    width: number;
    height: number;
  };
  uploadedAt: Date;
}

export interface ProcessedImage {
  id: string;
  originalPath: string;
  processedPath: string;
  thumbnailPath?: string;
  base64?: string;
  metadata: ImageInfo;
}

export class ImageProcessor {
  private uploadDir: string;
  private maxFileSize: number;
  private allowedMimeTypes: string[];

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'images');
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

  private ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  public validateImage(file: Express.Multer.File): { valid: boolean; error?: string } {
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

  public async saveImage(file: Express.Multer.File): Promise<ImageInfo> {
    const imageId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const filename = `${imageId}${fileExtension}`;
    const filePath = path.join(this.uploadDir, filename);

    // Save file
    fs.writeFileSync(filePath, file.buffer);

    const imageInfo: ImageInfo = {
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

  public async getImageBase64(imagePath: string): Promise<string> {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const mimeType = this.getMimeTypeFromPath(imagePath);
      return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      throw new Error(`Failed to convert image to base64: ${error}`);
    }
  }

  public async deleteImage(imagePath: string): Promise<void> {
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    } catch (error) {
      console.error(`Failed to delete image ${imagePath}:`, error);
    }
  }

  public async cleanupOldImages(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = fs.readdirSync(this.uploadDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await this.deleteImage(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old images:', error);
    }
  }

  private getMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: { [key: string]: string } = {
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

  public getImageInfo(imagePath: string): ImageInfo | null {
    try {
      const stats = fs.statSync(imagePath);
      const filename = path.basename(imagePath);
      const imageId = path.parse(filename).name;

      return {
        id: imageId,
        originalName: filename,
        filename,
        path: imagePath,
        size: stats.size,
        mimeType: this.getMimeTypeFromPath(imagePath),
        uploadedAt: stats.mtime
      };
    } catch (error) {
      return null;
    }
  }

  // New method for processing images from buffer (for Wrapper B)
  public async processImage(buffer: Buffer, originalName: string): Promise<ImageInfo> {
    const imageId = uuidv4();
    const mimeType = this.getMimeTypeFromName(originalName);
    
    const imageInfo: ImageInfo = {
      id: imageId,
      originalName,
      filename: originalName,
      path: '', // Not saved to disk for buffer processing
      size: buffer.length,
      mimeType,
      uploadedAt: new Date()
    };

    // TODO: Add image analysis capabilities here
    // - OCR text extraction
    // - Object detection for PLC diagrams
    // - Technical drawing analysis

    return imageInfo;
  }

  private getMimeTypeFromName(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: { [key: string]: string } = {
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
}

export const imageProcessor = new ImageProcessor();
