"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentProcessor = exports.DocumentProcessor = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
class DocumentProcessor {
    constructor() {
        this.uploadDir = path_1.default.join(process.cwd(), 'uploads', 'documents');
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
    ensureUploadDir() {
        if (!fs_1.default.existsSync(this.uploadDir)) {
            fs_1.default.mkdirSync(this.uploadDir, { recursive: true });
        }
    }
    validateDocument(file) {
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
    async saveDocument(file) {
        const documentId = (0, uuid_1.v4)();
        const fileExtension = path_1.default.extname(file.originalname);
        const filename = `${documentId}${fileExtension}`;
        const filePath = path_1.default.join(this.uploadDir, filename);
        // Save file
        fs_1.default.writeFileSync(filePath, file.buffer);
        const documentInfo = {
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
    async extractTextFromDocument(documentInfo) {
        try {
            const fileBuffer = fs_1.default.readFileSync(documentInfo.path);
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
        }
        catch (error) {
            console.error('Error extracting text from document:', error);
            return `=== ERROR PROCESSING: ${documentInfo.originalName} ===\n\nPlease provide a text description of what you'd like to know about this document.\n\n=== END OF ${documentInfo.originalName} ===\n`;
        }
    }
    async extractTextFromPDF(buffer) {
        try {
            const data = await (0, pdf_parse_1.default)(buffer);
            return data.text;
        }
        catch (error) {
            console.error('Error extracting text from PDF:', error);
            return '[Error processing PDF content]';
        }
    }
    async deleteDocument(documentPath) {
        try {
            if (fs_1.default.existsSync(documentPath)) {
                fs_1.default.unlinkSync(documentPath);
            }
        }
        catch (error) {
            console.error(`Failed to delete document ${documentPath}:`, error);
        }
    }
    async cleanupOldDocuments(maxAge = 24 * 60 * 60 * 1000) {
        try {
            const files = fs_1.default.readdirSync(this.uploadDir);
            const now = Date.now();
            for (const file of files) {
                const filePath = path_1.default.join(this.uploadDir, file);
                const stats = fs_1.default.statSync(filePath);
                if (now - stats.mtime.getTime() > maxAge) {
                    await this.deleteDocument(filePath);
                }
            }
        }
        catch (error) {
            console.error('Failed to cleanup old documents:', error);
        }
    }
    getDocumentInfo(documentPath) {
        try {
            const stats = fs_1.default.statSync(documentPath);
            const filename = path_1.default.basename(documentPath);
            const documentId = path_1.default.parse(filename).name;
            return {
                id: documentId,
                originalName: filename,
                filename,
                path: documentPath,
                size: stats.size,
                mimeType: this.getMimeTypeFromPath(documentPath),
                uploadedAt: stats.mtime
            };
        }
        catch (error) {
            return null;
        }
    }
    getMimeTypeFromPath(filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        const mimeMap = {
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
    getSupportedFormats() {
        return [
            'PDF (.pdf)',
            'Word Document (.doc, .docx)',
            'Text File (.txt)',
            'CSV (.csv)',
            'Excel (.xls, .xlsx)',
            'PowerPoint (.ppt, .pptx)'
        ];
    }
    async analyzeMultipleDocuments(documents) {
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
exports.DocumentProcessor = DocumentProcessor;
exports.documentProcessor = new DocumentProcessor();
