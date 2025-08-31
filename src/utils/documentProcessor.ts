import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';
import { parseDocumentPDF } from './enterprisePDFParser';

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
  content: string;
  extractedData?: {
    tags?: any[];
    tables?: any[];
    plcInfo?: any;
  };
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
          // Use enterprise PDF parser for enhanced extraction
          try {
            const enhancedPdfData = await parseDocumentPDF(fileBuffer, documentInfo.originalName);
            let pdfContent = `=== PDF DOCUMENT: ${documentInfo.originalName} ===\n\n`;
            pdfContent += enhancedPdfData.content;
            
            // Add extracted tables if any
            if (enhancedPdfData.extractedData?.tables?.length > 0) {
              pdfContent += '\n\n=== EXTRACTED TABLES ===\n';
              enhancedPdfData.extractedData.tables.forEach((table: any, index: number) => {
                pdfContent += `\nTable ${index + 1}: ${table.title}\n`;
                pdfContent += `Headers: ${table.schema.join(' | ')}\n`;
                table.rows.forEach((row: string[]) => {
                  pdfContent += `${row.join(' | ')}\n`;
                });
              });
            }
            
            // Add PLC tags if any
            if (enhancedPdfData.extractedData?.tags?.length > 0) {
              pdfContent += '\n\n=== EXTRACTED PLC TAGS ===\n';
              enhancedPdfData.extractedData.tags.forEach((tag: any) => {
                pdfContent += `${tag.name} (${tag.dataType}): ${tag.description}\n`;
              });
            }
            
            pdfContent += `\n\n=== END OF ${documentInfo.originalName} ===\n`;
            return pdfContent;
          } catch (error) {
            console.warn('Enterprise PDF parser failed, falling back to basic parser:', error);
            const pdfText = await this.extractTextFromPDF(fileBuffer);
            return `=== PDF DOCUMENT: ${documentInfo.originalName} ===\n\n${pdfText}\n\n=== END OF ${documentInfo.originalName} ===\n`;
          }
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

  // New method for processing documents from buffer (for Wrapper B)
  public async processDocument(buffer: Buffer, originalName: string): Promise<ProcessedDocument> {
    const documentId = uuidv4();
    const mimeType = this.getMimeTypeFromName(originalName);
    
    const documentInfo: DocumentInfo = {
      id: documentId,
      originalName,
      filename: originalName,
      path: '', // Not saved to disk for buffer processing
      size: buffer.length,
      mimeType,
      uploadedAt: new Date()
    };

    let content = '';
    let extractedData: any = {};

    try {
      switch (mimeType) {
        case 'application/pdf':
          const pdfData = await pdf(buffer);
          content = pdfData.text;
          documentInfo.pageCount = pdfData.numpages;
          extractedData = await this.extractPLCDataFromText(content, originalName);
          break;
        case 'text/plain':
        case 'text/csv':
          content = buffer.toString('utf-8');
          extractedData = await this.extractPLCDataFromText(content, originalName);
          break;
        case 'application/msword':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-powerpoint':
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
          // Placeholder for Office document processing
          content = `Office document: ${originalName}\nContent processing requires additional libraries.`;
          break;
        default:
          content = buffer.toString('utf-8');
          break;
      }
    } catch (error) {
      console.error('Error processing document:', error);
      content = `Error processing document: ${originalName}`;
    }

    return {
      id: documentId,
      originalPath: '',
      textContent: content,
      content: content,
      metadata: documentInfo,
      extractedData
    };
  }

  private getMimeTypeFromName(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.st': 'text/x-structured-text',
      '.scl': 'text/x-structured-text'
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  // Extract PLC-specific data from text content
  private async extractPLCDataFromText(content: string, filename: string): Promise<any> {
    const extractedData: any = {
      tags: [],
      tables: [],
      plcInfo: {}
    };

    try {
      // Check for common PLC patterns
      const lowerContent = content.toLowerCase();
      
      // Detect vendor
      if (lowerContent.includes('siemens') || lowerContent.includes('step 7') || lowerContent.includes('tia portal')) {
        extractedData.plcInfo.vendor = 'Siemens';
      } else if (lowerContent.includes('rockwell') || lowerContent.includes('studio 5000') || lowerContent.includes('logix')) {
        extractedData.plcInfo.vendor = 'Rockwell';
      } else if (lowerContent.includes('beckhoff') || lowerContent.includes('twincat')) {
        extractedData.plcInfo.vendor = 'Beckhoff';
      }

      // Enhanced tag patterns for different vendors
      const tagPatterns = [
        // Siemens patterns
        /(\w+)\s*:\s*(BOOL|INT|DINT|REAL|STRING|WORD|DWORD)[\s;]/gi,
        /VAR\s+(\w+)\s*:\s*(BOOL|INT|DINT|REAL|STRING|WORD|DWORD)/gi,
        /%[IMQ][BWDX]?[\d.]+\s*->\s*(\w+)/gi,
        
        // Rockwell patterns  
        /([\w_]+)\s+DataType:\s*(BOOL|INT|DINT|REAL|STRING)/gi,
        /Tag\s+Name="([^"]+)"\s+DataType="([^"]+)"/gi,
        
        // Beckhoff patterns
        /VAR_(INPUT|OUTPUT|GLOBAL)\s*\n\s*(\w+)\s*:\s*(BOOL|INT|DINT|REAL|STRING)/gi,
        
        // Generic ST patterns
        /(\w+)\s*AT\s*%[IMQ][BWDX]?[\d.]+\s*:\s*(BOOL|INT|DINT|REAL)/gi
      ];

      for (const pattern of tagPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const tagName = match[1] || match[2] || '';
          const dataType = match[2] || match[3] || match[1] || '';
          
          if (tagName && dataType) {
            extractedData.tags.push({
              TagName: tagName,
              DataType: dataType,
              Scope: this.determineScope(match[0]),
              Address: this.extractAddress(match[0]),
              Direction: this.determineDirection(match[0]),
              Description: '',
              source: filename
            });
          }
        }
      }

      // Enhanced table extraction for technical specifications
      if (filename.endsWith('.csv') || content.includes(',')) {
        const lines = content.split('\n');
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1)
            .filter(line => line.trim().length > 0)
            .map(line => line.split(',').map(cell => cell.trim()));
          
          // Check if this looks like a tag database
          const isTagDB = headers.some(h => 
            h.toLowerCase().includes('tag') || 
            h.toLowerCase().includes('address') ||
            h.toLowerCase().includes('datatype')
          );
          
          if (isTagDB && rows.length > 0) {
            extractedData.tables.push({
              title: `Tag Database from ${filename}`,
              schema: headers,
              rows: rows.filter(row => row.length > 1)
            });
            
            // Convert table rows to standardized tags
            const tagNameIdx = headers.findIndex(h => h.toLowerCase().includes('tag'));
            const dataTypeIdx = headers.findIndex(h => h.toLowerCase().includes('type'));
            const addressIdx = headers.findIndex(h => h.toLowerCase().includes('address'));
            const descIdx = headers.findIndex(h => h.toLowerCase().includes('desc'));
            
            if (tagNameIdx >= 0) {
              for (const row of rows) {
                if (row[tagNameIdx]) {
                  extractedData.tags.push({
                    TagName: row[tagNameIdx] || '',
                    DataType: row[dataTypeIdx] || '',
                    Scope: 'Global',
                    Address: row[addressIdx] || '',
                    Direction: this.determineDirectionFromAddress(row[addressIdx] || ''),
                    Description: row[descIdx] || '',
                    source: filename
                  });
                }
              }
            }
          } else {
            extractedData.tables.push({
              title: `Data from ${filename}`,
              schema: headers,
              rows: rows.filter(row => row.length > 1)
            });
          }
        }
      }

      // Extract I/O specifications from technical documents
      this.extractIOSpecifications(content, extractedData, filename);
      
      // Extract safety system information
      this.extractSafetyInfo(content, extractedData, filename);
      
      // Extract alarm and fault information
      this.extractAlarmInfo(content, extractedData, filename);

    } catch (error) {
      console.error('Error extracting PLC data:', error);
    }

    return extractedData;
  }

  private determineScope(matchText: string): string {
    const lower = matchText.toLowerCase();
    if (lower.includes('global') || lower.includes('var_global')) return 'Global';
    if (lower.includes('input') || lower.includes('var_input')) return 'Input';
    if (lower.includes('output') || lower.includes('var_output')) return 'Output';
    if (lower.includes('local') || lower.includes('var_local')) return 'Local';
    return 'Local';
  }

  private extractAddress(matchText: string): string {
    const addressMatch = matchText.match(/%[IMQ][BWDX]?[\d.]+/);
    return addressMatch ? addressMatch[0] : '';
  }

  private determineDirection(matchText: string): 'Input' | 'Output' | 'Internal' {
    const address = this.extractAddress(matchText);
    return this.determineDirectionFromAddress(address);
  }

  private determineDirectionFromAddress(address: string): 'Input' | 'Output' | 'Internal' {
    if (!address) return 'Internal';
    const upper = address.toUpperCase();
    if (upper.includes('%I')) return 'Input';
    if (upper.includes('%Q')) return 'Output';
    return 'Internal';
  }

  private extractIOSpecifications(content: string, extractedData: any, filename: string): void {
    const ioPatterns = [
      // Digital I/O patterns
      /(\d+)\s+Digital\s+(Inputs|Outputs)/gi,
      /(\d+)\s+DI\b/gi,
      /(\d+)\s+DO\b/gi,
      
      // Analog I/O patterns
      /(\d+)\s+Analog\s+(Inputs|Outputs)/gi,
      /(\d+)\s+AI\b/gi,
      /(\d+)\s+AO\b/gi,
      
      // Module specifications
      /([\w-]+)\s*:\s*(\d+)\s+(DI|DO|AI|AO)/gi
    ];

    for (const pattern of ioPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (!extractedData.plcInfo.ioModules) {
          extractedData.plcInfo.ioModules = [];
        }
        extractedData.plcInfo.ioModules.push({
          type: match[2] || match[3] || 'Unknown',
          count: match[1],
          description: match[0],
          source: filename
        });
      }
    }
  }

  private extractSafetyInfo(content: string, extractedData: any, filename: string): void {
    const safetyPatterns = [
      /Emergency\s+Stop/gi,
      /Safety\s+(Interlock|System)/gi,
      /E-?Stop/gi,
      /Safety\s+PLC/gi,
      /SIL\s*[0-9]/gi,
      /Category\s*[0-9]/gi
    ];

    const safetyItems: string[] = [];
    for (const pattern of safetyPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        safetyItems.push(match[0]);
      }
    }

    if (safetyItems.length > 0) {
      extractedData.plcInfo.safetyFeatures = [...new Set(safetyItems)];
    }
  }

  private extractAlarmInfo(content: string, extractedData: any, filename: string): void {
    const alarmPatterns = [
      /(Priority\s*[0-9])/gi,
      /(Critical|Warning|Information)\s+Alarm/gi,
      /Alarm\s+(Summary|Management)/gi,
      /Fault\s+(Code|Handling)/gi
    ];

    const alarmItems: string[] = [];
    for (const pattern of alarmPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        alarmItems.push(match[0]);
      }
    }

    if (alarmItems.length > 0) {
      extractedData.plcInfo.alarmSystem = [...new Set(alarmItems)];
    }
  }
}

export const documentProcessor = new DocumentProcessor();
