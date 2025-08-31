import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';

export interface DocumentInfo {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
  extractedText?: string;
  pageCount?: number;
}

export interface ProcessedDocument {
  id: string;
  originalPath: string;
  textContent: string;
  metadata: DocumentInfo;
}

export class DocumentProcessor {
  private uploadDir: string;
  private maxFileSize: number;
  private allowedMimeTypes: string[];

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];

    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  private ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  public validateDocument(file: Express.Multer.File): { valid: boolean; error?: string } {
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
        error: `Unsupported file type. Allowed types: PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, PPT, PPTX`
      };
    }

    return { valid: true };
  }

  public async saveDocument(file: Express.Multer.File): Promise<DocumentInfo> {
    const documentId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const filename = `${documentId}${fileExtension}`;
    const filePath = path.join(this.uploadDir, filename);

    // Save file
    fs.writeFileSync(filePath, file.buffer);

    const documentInfo: DocumentInfo = {
      id: documentId,
      originalName: file.originalname,
      filename,
      path: filePath,
      size: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date()
    };

    return documentInfo;
  }

  public async extractTextFromDocument(documentInfo: DocumentInfo): Promise<string> {
    try {
      const fileBuffer = fs.readFileSync(documentInfo.path);
      
      switch (documentInfo.mimeType) {
        case 'application/pdf':
          const pdfText = await this.extractTextFromPDF(fileBuffer);
          return `=== PDF DOCUMENT: ${documentInfo.originalName} ===\n\n${pdfText}\n\n=== END OF ${documentInfo.originalName} ===\n`;
        case 'text/plain':
          const plainText = fileBuffer.toString('utf-8');
          return `=== TEXT DOCUMENT: ${documentInfo.originalName} ===\n\n${plainText}\n\n=== END OF ${documentInfo.originalName} ===\n`;
        case 'text/csv':
          const csvText = fileBuffer.toString('utf-8');
          return `=== CSV DOCUMENT: ${documentInfo.originalName} ===\n\n${csvText}\n\n=== END OF ${documentInfo.originalName} ===\n`;
        case 'application/msword':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-powerpoint':
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
          // For now, return a placeholder for Office documents
          // In production, you might want to use libraries like mammoth.js for DOCX
          return `=== OFFICE DOCUMENT: ${documentInfo.originalName} ===\n\nThis document contains content that needs to be processed. For now, please provide a text description of what you'd like to know about this document.\n\n=== END OF ${documentInfo.originalName} ===\n`;
        default:
          return `=== UNSUPPORTED DOCUMENT: ${documentInfo.originalName} ===\n\nPlease provide a text description of what you'd like to know about this document.\n\n=== END OF ${documentInfo.originalName} ===\n`;
      }
    } catch (error) {
      console.error('Error extracting text from document:', error);
      return `=== ERROR PROCESSING: ${documentInfo.originalName} ===\n\nPlease provide a text description of what you'd like to know about this document.\n\n=== END OF ${documentInfo.originalName} ===\n`;
    }
  }

  private async extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      return '[Error processing PDF content]';
    }
  }

  public async deleteDocument(documentPath: string): Promise<void> {
    try {
      if (fs.existsSync(documentPath)) {
        fs.unlinkSync(documentPath);
      }
    } catch (error) {
      console.error(`Failed to delete document ${documentPath}:`, error);
    }
  }

  public async cleanupOldDocuments(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = fs.readdirSync(this.uploadDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await this.deleteDocument(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old documents:', error);
    }
  }

  public getDocumentInfo(documentPath: string): DocumentInfo | null {
    try {
      const stats = fs.statSync(documentPath);
      const filename = path.basename(documentPath);
      const documentId = path.parse(filename).name;

      return {
        id: documentId,
        originalName: filename,
        filename,
        path: documentPath,
        size: stats.size,
        mimeType: this.getMimeTypeFromPath(documentPath),
        uploadedAt: stats.mtime
      };
    } catch (error) {
      return null;
    }
  }

  private getMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  public getSupportedFormats(): string[] {
    return [
      'PDF (.pdf)',
      'Word Document (.doc, .docx)',
      'Text File (.txt)',
      'CSV (.csv)',
      'Excel (.xls, .xlsx)',
      'PowerPoint (.ppt, .pptx)'
    ];
  }

  public async analyzeMultipleDocuments(documents: DocumentInfo[]): Promise<string> {
    if (documents.length === 0) {
      return '';
    }

    let analysis = `\n=== MULTI-DOCUMENT ANALYSIS ===\n`;
    analysis += `Total documents: ${documents.length}\n`;
    analysis += `Document types: ${documents.map(d => d.mimeType).join(', ')}\n`;
    analysis += `Total size: ${(documents.reduce((sum, d) => sum + d.size, 0) / (1024 * 1024)).toFixed(2)} MB\n\n`;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      analysis += `Document ${i + 1}: ${doc.originalName}\n`;
      analysis += `- Type: ${doc.mimeType}\n`;
      analysis += `- Size: ${(doc.size / (1024 * 1024)).toFixed(2)} MB\n`;
      analysis += `- Uploaded: ${doc.uploadedAt.toISOString()}\n\n`;
    }

    return analysis;
  }
}

export const documentProcessor = new DocumentProcessor();
