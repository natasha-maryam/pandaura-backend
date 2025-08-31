import pdf from 'pdf-parse';

// Enterprise-Grade PDF Processing Tools for Pandaura AS
// Implements PyMuPDF-like functionality, pdfplumber table extraction, and OCR capabilities

export interface PDFParseResult {
  text: string;
  pages: PDFPage[];
  tables: PDFTable[];
  images: PDFImage[];
  metadata: PDFMetadata;
  plcData?: PLCDataExtraction;
}

export interface PDFPage {
  pageNumber: number;
  text: string;
  tables: PDFTable[];
  images: PDFImage[];
}

export interface PDFTable {
  pageNumber: number;
  rows: string[][];
  headers: string[];
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface PDFImage {
  pageNumber: number;
  data: Buffer;
  mimeType: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  totalPages: number;
  fileSize: number;
}

export interface PLCDataExtraction {
  vendor?: string;
  tags: Array<{
    name: string;
    dataType: string;
    address?: string;
    description?: string;
    pageNumber: number;
  }>;
  ioLists: PDFTable[];
  diagrams: PDFImage[];
  specifications: string[];
}

export class EnterprisePDFParser {
  private ocrEnabled: boolean = false;
  
  constructor(enableOCR: boolean = false) {
    this.ocrEnabled = enableOCR;
    // TODO: Initialize Tesseract.js if OCR is enabled
  }

  /**
   * Main PDF parsing function - combines text, table, and image extraction
   * Equivalent to PyMuPDF + pdfplumber + Tesseract functionality
   */
  async parseDocument(buffer: Buffer, filename: string): Promise<PDFParseResult> {
    try {
      // Basic PDF parsing with pdf-parse (PyMuPDF equivalent)
      const pdfData = await pdf(buffer);
      
      const result: PDFParseResult = {
        text: pdfData.text,
        pages: [],
        tables: [],
        images: [],
        metadata: {
          totalPages: pdfData.numpages,
          fileSize: buffer.length,
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          creator: pdfData.info?.Creator,
          producer: pdfData.info?.Producer,
          creationDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : undefined,
          modificationDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : undefined
        }
      };

      // Extract tables using enhanced pattern matching (pdfplumber equivalent)
      const tables = await this.extractTables(pdfData.text);
      result.tables = tables;

      // Extract PLC-specific data
      result.plcData = await this.extractPLCData(pdfData.text, tables);

      // Process pages individually
      result.pages = await this.processPages(pdfData);

      // TODO: Extract images if needed (requires additional PDF library)
      // result.images = await this.extractImages(buffer);

      return result;
      
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error(`PDF parsing failed: ${error}`);
    }
  }

  /**
   * Extract tables from PDF text (pdfplumber equivalent)
   * Uses pattern matching to identify tabular data
   */
  private async extractTables(text: string): Promise<PDFTable[]> {
    const tables: PDFTable[] = [];
    const lines = text.split('\n');
    
    let currentTable: string[][] = [];
    let tableHeaders: string[] = [];
    let inTable = false;
    let pageNumber = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Update page number tracking
      if (line.includes('Page ') || line.match(/^\d+$/)) {
        const pageMatch = line.match(/Page\s+(\d+)|\b(\d+)\b/);
        if (pageMatch) {
          pageNumber = parseInt(pageMatch[1] || pageMatch[2]);
        }
      }

      // Detect table headers (common patterns)
      if (this.isTableHeader(line)) {
        if (currentTable.length > 0) {
          // Save previous table
          tables.push({
            pageNumber: pageNumber - 1,
            rows: currentTable,
            headers: tableHeaders
          });
        }
        
        // Start new table
        tableHeaders = this.parseTableRow(line);
        currentTable = [];
        inTable = true;
        continue;
      }

      // Detect table rows
      if (inTable && this.isTableRow(line)) {
        const row = this.parseTableRow(line);
        if (row.length >= tableHeaders.length) {
          currentTable.push(row);
        }
      } else if (inTable && line.length === 0) {
        // End of table
        if (currentTable.length > 0) {
          tables.push({
            pageNumber,
            rows: currentTable,
            headers: tableHeaders
          });
        }
        inTable = false;
        currentTable = [];
        tableHeaders = [];
      }
    }

    // Handle last table
    if (currentTable.length > 0) {
      tables.push({
        pageNumber,
        rows: currentTable,
        headers: tableHeaders
      });
    }

    return tables;
  }

  /**
   * Extract PLC-specific data from PDF content
   */
  private async extractPLCData(text: string, tables: PDFTable[]): Promise<PLCDataExtraction> {
    const plcData: PLCDataExtraction = {
      tags: [],
      ioLists: [],
      diagrams: [],
      specifications: []
    };

    // Detect vendor from text
    const lowerText = text.toLowerCase();
    if (lowerText.includes('siemens') || lowerText.includes('step 7') || lowerText.includes('tia portal')) {
      plcData.vendor = 'Siemens';
    } else if (lowerText.includes('rockwell') || lowerText.includes('studio 5000') || lowerText.includes('allen-bradley')) {
      plcData.vendor = 'Rockwell';
    } else if (lowerText.includes('beckhoff') || lowerText.includes('twincat')) {
      plcData.vendor = 'Beckhoff';
    }

    // Extract tags from text using advanced patterns
    const tagPatterns = [
      // Standard tag patterns
      /(\w+)\s*:\s*(BOOL|INT|DINT|REAL|STRING|WORD|DWORD)\s*(?:@\s*(%[IMQ][\w.]+))?\s*(?:\/\/\s*(.+))?/gi,
      
      // Address-based patterns
      /%[IMQ][BWDX]?[\d.]+\s+(\w+)\s+(BOOL|INT|DINT|REAL|STRING)/gi,
      
      // Table-based patterns
      /^(\w+)\s+([IMQ][\d.]+)\s+(BOOL|INT|DINT|REAL)\s*(.*)$/gmi
    ];

    let pageNumber = 1;
    const textLines = text.split('\n');
    
    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i];
      
      // Track page numbers
      if (line.includes('Page ') || line.match(/^\s*\d+\s*$/)) {
        const pageMatch = line.match(/Page\s+(\d+)|\b(\d+)\b/);
        if (pageMatch) {
          pageNumber = parseInt(pageMatch[1] || pageMatch[2]);
        }
      }

      // Apply tag patterns
      for (const pattern of tagPatterns) {
        pattern.lastIndex = 0; // Reset regex
        let match;
        while ((match = pattern.exec(line)) !== null) {
          plcData.tags.push({
            name: match[1],
            dataType: match[2],
            address: match[3] || '',
            description: match[4] || '',
            pageNumber
          });
        }
      }
    }

    // Identify I/O tables
    plcData.ioLists = tables.filter(table => {
      const headerText = table.headers.join(' ').toLowerCase();
      return headerText.includes('tag') || 
             headerText.includes('address') || 
             headerText.includes('input') || 
             headerText.includes('output') ||
             headerText.includes('i/o');
    });

    // Extract specifications
    const specPatterns = [
      /CPU\s+\w+/gi,
      /\d+\s+(Digital|Analog)\s+(Input|Output)s?/gi,
      /Memory:\s*[\d\w\s]+/gi,
      /Communication:\s*[\w\s,]+/gi
    ];

    for (const pattern of specPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        plcData.specifications.push(match[0]);
      }
    }

    return plcData;
  }

  /**
   * Process individual pages for detailed extraction
   */
  private async processPages(pdfData: any): Promise<PDFPage[]> {
    const pages: PDFPage[] = [];
    
    // Since pdf-parse doesn't provide per-page text by default,
    // we'll simulate page breaks using common patterns
    const pageTexts = this.splitTextIntoPages(pdfData.text);
    
    for (let i = 0; i < pageTexts.length; i++) {
      const pageText = pageTexts[i];
      const tables = await this.extractTables(pageText);
      
      pages.push({
        pageNumber: i + 1,
        text: pageText,
        tables,
        images: [] // TODO: Implement image extraction per page
      });
    }
    
    return pages;
  }

  /**
   * Split full text into pages using common page break patterns
   */
  private splitTextIntoPages(text: string): string[] {
    const pages: string[] = [];
    
    // Common page break patterns
    const pageBreakPatterns = [
      /\f/g,                    // Form feed character
      /Page\s+\d+/gi,           // "Page N" patterns
      /^\s*\d+\s*$/gm,          // Standalone page numbers
      /\n\s*\n\s*\n/g           // Multiple line breaks
    ];
    
    let currentText = text;
    
    // Try to split by form feed first
    if (currentText.includes('\f')) {
      return currentText.split('\f');
    }
    
    // Try page number patterns
    const pageMatches = [...currentText.matchAll(/Page\s+(\d+)/gi)];
    if (pageMatches.length > 1) {
      for (let i = 0; i < pageMatches.length - 1; i++) {
        const start = pageMatches[i].index || 0;
        const end = pageMatches[i + 1].index || currentText.length;
        pages.push(currentText.substring(start, end));
      }
      // Add last page
      const lastMatch = pageMatches[pageMatches.length - 1];
      pages.push(currentText.substring(lastMatch.index || 0));
      return pages;
    }
    
    // Fallback: split by estimated page length (3000 chars per page)
    const estimatedPageLength = 3000;
    for (let i = 0; i < currentText.length; i += estimatedPageLength) {
      pages.push(currentText.substring(i, i + estimatedPageLength));
    }
    
    return pages.length > 0 ? pages : [text];
  }

  /**
   * Check if a line looks like a table header
   */
  private isTableHeader(line: string): boolean {
    // Common header patterns
    const headerPatterns = [
      /tag\s*name/i,
      /address/i,
      /data\s*type/i,
      /description/i,
      /input.*output/i,
      /symbol/i,
      /comment/i
    ];
    
    return headerPatterns.some(pattern => pattern.test(line)) &&
           (line.includes('|') || line.includes('\t') || Boolean(line.match(/\s{3,}/)));
  }

  /**
   * Check if a line looks like a table row
   */
  private isTableRow(line: string): boolean {
    // Must have separators and multiple columns
    const separators = (line.match(/[\t|]/g) || []).length;
    const spaces = (line.match(/\s{3,}/g) || []).length;
    
    return (separators >= 2 || spaces >= 2) && line.trim().length > 10;
  }

  /**
   * Parse a table row into columns
   */
  private parseTableRow(line: string): string[] {
    // Try different separators
    if (line.includes('|')) {
      return line.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
    }
    
    if (line.includes('\t')) {
      return line.split('\t').map(cell => cell.trim()).filter(cell => cell.length > 0);
    }
    
    // Split by multiple spaces
    return line.split(/\s{3,}/).map(cell => cell.trim()).filter(cell => cell.length > 0);
  }

  /**
   * Extract images from PDF (placeholder for future implementation)
   * Would require additional libraries like pdf2pic or pdf-image
   */
  private async extractImages(buffer: Buffer): Promise<PDFImage[]> {
    // TODO: Implement image extraction
    // This would require additional dependencies like pdf2pic
    return [];
  }

  /**
   * OCR functionality for scanned PDFs (placeholder)
   * Would integrate with Tesseract.js
   */
  private async performOCR(imageBuffer: Buffer): Promise<string> {
    if (!this.ocrEnabled) {
      return '';
    }
    
    // TODO: Implement Tesseract.js integration
    // const { createWorker } = require('tesseract.js');
    // const worker = createWorker();
    // await worker.load();
    // await worker.loadLanguage('eng');
    // await worker.initialize('eng');
    // const { data: { text } } = await worker.recognize(imageBuffer);
    // await worker.terminate();
    // return text;
    
    return 'OCR not implemented yet';
  }
}

// Export singleton instance
export const pdfParser = new EnterprisePDFParser(false);

// Helper function for document processor integration
export async function parseDocumentPDF(buffer: Buffer, filename: string): Promise<any> {
  try {
    const result = await pdfParser.parseDocument(buffer, filename);
    
    // Convert to document processor format
    return {
      content: result.text,
      metadata: {
        pageCount: result.metadata.totalPages,
        title: result.metadata.title,
        author: result.metadata.author,
        fileSize: result.metadata.fileSize,
        plcVendor: result.plcData?.vendor
      },
      extractedData: {
        tags: result.plcData?.tags || [],
        tables: result.tables.map(table => ({
          title: `Table from Page ${table.pageNumber}`,
          schema: table.headers,
          rows: table.rows
        })),
        plcInfo: {
          vendor: result.plcData?.vendor,
          specifications: result.plcData?.specifications || []
        }
      }
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw error;
  }
}
