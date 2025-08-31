# Wrapper B — Document & Logic Analyst (RAG) System

## Overview

Wrapper B is an enterprise-grade RAG (Retrieval-Augmented Generation) system designed specifically for industrial automation document analysis. It combines OpenAI's advanced AI capabilities with sophisticated PLC-aware parsing to provide intelligent document and logic analysis for Pandaura AS's automation platform.

## Architecture

### Core Components

1. **AI System Instructions** (`src/ai/wrapper-B-system.ts`)
   - Specialized prompts for document and logic analysis
   - PLC vendor-specific knowledge integration
   - Safety system awareness and preservation
   - Structured JSON output contracts

2. **API Route Handler** (`src/ai/wrapper-B-route.ts`)
   - RESTful endpoint: `POST /ai/wrapper-b`
   - Multi-file upload support
   - OpenAI integration with vision capabilities
   - Comprehensive error handling and logging

3. **Enterprise PLC Parser** (`src/utils/enterprisePLCParser.ts`)
   - Multi-vendor support (Siemens, Rockwell, Beckhoff, Generic ST)
   - Unified JSON output schema
   - Batch processing capabilities
   - Automatic vendor detection

4. **Enhanced PDF Parser** (`src/utils/enterprisePDFParser.ts`)
   - PyMuPDF-equivalent functionality
   - Table extraction (pdfplumber-style)
   - PLC-specific data extraction
   - Image and metadata extraction

5. **Document Processor** (`src/utils/documentProcessor.ts`)
   - PLC-aware text extraction
   - Enhanced tag and I/O list detection
   - Safety system identification
   - Technical specification parsing

## Features

### Document Analysis Capabilities

- **Multi-format Support**: PDF, TXT, CSV, XML, ZIP archives
- **PLC File Types**: .xml (Siemens), .l5x (Rockwell), .tsproj (Beckhoff), .st (Structured Text)
- **Intelligent Extraction**: Tags, I/O lists, routines, safety systems
- **Vendor Detection**: Automatic identification of PLC vendor and version
- **Table Parsing**: Advanced table extraction from PDFs and documents

### AI-Powered Analysis

- **Document Understanding**: Deep comprehension of technical documentation
- **Logic Analysis**: PLC program structure and flow analysis
- **Safety Compliance**: Identification of safety-critical components
- **Cross-referencing**: Relationship analysis between documents and code
- **Code Generation**: PLC code suggestions and improvements

### Enterprise Features

- **Scalability**: Handles large industrial projects with thousands of files
- **Error Recovery**: Robust error handling with fallback mechanisms
- **Logging**: Comprehensive logging for audit and debugging
- **Security**: Input validation and sanitization
- **Performance**: Optimized for large file processing

## API Usage

### Endpoint

```
POST /ai/wrapper-b
```

### Request Format

```javascript
const formData = new FormData();
formData.append('prompt', 'Analyze the PLC program and identify all safety-related tags');
formData.append('files', file1);
formData.append('files', file2);
// ... additional files

const response = await fetch('/ai/wrapper-b', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

### Response Format

```json
{
  "success": true,
  "analysis": "Detailed AI analysis...",
  "processedFiles": [
    {
      "filename": "safety_program.xml",
      "type": "Siemens TIA Portal",
      "tags": [...],
      "routines": [...],
      "safety_systems": [...]
    }
  ],
  "metadata": {
    "processingTime": 2.5,
    "filesProcessed": 3,
    "totalSize": "1.2MB"
  }
}
```

## Supported File Formats

### PLC Project Files

| Vendor | Format | Extension | Support Level |
|--------|---------|-----------|---------------|
| Siemens | TIA Portal XML | .xml, .ap11 | Full |
| Rockwell | Studio 5000 | .l5x | Full |
| Beckhoff | TwinCAT | .xml, .tsproj | Full |
| Generic | Structured Text | .st | Full |

### Document Formats

- **PDF**: Advanced parsing with table and image extraction
- **Text**: Plain text with PLC tag detection
- **CSV**: I/O lists and tag databases
- **XML**: Generic XML parsing for various formats
- **ZIP**: Archive support for project backups

## PLC Parser Features

### Unified Output Schema

All PLC files are parsed into a standardized JSON format:

```json
{
  "metadata": {
    "vendor": "Siemens",
    "version": "V17",
    "project_name": "Safety_System_v2.1",
    "created_date": "2024-01-15T10:30:00Z"
  },
  "tags": [
    {
      "name": "EmergencyStop",
      "data_type": "BOOL",
      "address": "%I0.0",
      "description": "Emergency stop button input",
      "safety_relevant": true
    }
  ],
  "routines": [
    {
      "name": "SafetyLogic",
      "type": "FB",
      "description": "Main safety control logic",
      "safety_relevant": true
    }
  ],
  "networks": [
    {
      "number": 1,
      "title": "Emergency Stop Logic",
      "code": "...",
      "safety_relevant": true
    }
  ]
}
```

### Vendor-Specific Features

#### Siemens TIA Portal
- Hardware configuration parsing
- Safety program identification
- Symbol table extraction
- Network structure analysis

#### Rockwell Studio 5000
- Tag database extraction
- Routine and program organization
- Safety task identification
- I/O module configuration

#### Beckhoff TwinCAT
- POU (Program Organization Unit) parsing
- Library dependency tracking
- Variable declaration extraction
- Task configuration analysis

## Safety System Analysis

The system includes specialized logic for identifying and preserving safety-critical components:

- **Safety Tags**: Automatic detection of safety-related variables
- **Safety Routines**: Identification of safety program blocks
- **Interlock Logic**: Analysis of safety interlock systems
- **Emergency Stop**: Detection of emergency stop circuits
- **Safety Networks**: Identification of safety-relevant logic networks

## Testing

### Test Files Provided

The system includes comprehensive test files for validation:

1. **siemens_tia_portal_project.xml** - Complete Siemens project
2. **rockwell_studio5000_project.l5x** - Rockwell automation project
3. **beckhoff_twincat_project.xml** - TwinCAT project structure
4. **structured_text_program.st** - Generic ST program
5. **plc_documentation.pdf** - Technical documentation
6. **io_list_database.csv** - I/O configuration data

### Test Interface

Use `test-wrapper-b.html` for interactive testing:

```bash
# Start the backend server
npm run dev

# Open test interface in browser
start test-wrapper-b.html
```

## Configuration

### Environment Variables

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o  # or gpt-4-turbo
WRAPPER_B_MAX_FILES=20
WRAPPER_B_MAX_SIZE=50MB
```

### System Requirements

- Node.js 18+
- TypeScript 4.8+
- OpenAI API access
- Minimum 4GB RAM for large file processing

## Performance Optimization

- **Batch Processing**: Multiple files processed in parallel
- **Memory Management**: Efficient buffer handling for large files
- **Caching**: Parsed results cached for repeated analysis
- **Stream Processing**: Large files processed in chunks

## Error Handling

The system includes comprehensive error handling:

- **File Format Validation**: Unsupported formats gracefully handled
- **Parse Errors**: Fallback to basic text extraction
- **API Failures**: Circuit breaker pattern for OpenAI calls
- **Memory Limits**: Protection against oversized file uploads

## Development

### Adding New Vendors

To add support for a new PLC vendor:

1. Update `enterprisePLCParser.ts` with vendor detection logic
2. Implement vendor-specific parsing in the parser switch statement
3. Update the unified output schema if needed
4. Add test files for the new vendor
5. Update documentation

### Extending AI Capabilities

To enhance AI analysis:

1. Modify `wrapper-B-system.ts` with new instructions
2. Update the API route handler for new parameters
3. Enhance the document processor for new extraction patterns
4. Test with relevant industrial documentation

## Security Considerations

- **Input Validation**: All file uploads validated for type and size
- **Sanitization**: File contents sanitized before AI processing
- **Rate Limiting**: API endpoints protected against abuse
- **Access Control**: Integration with existing authentication system

## Future Enhancements

### Planned Features

- **OCR Support**: Tesseract.js integration for scanned documents
- **Image Analysis**: Enhanced diagram and schematic analysis
- **Real-time Collaboration**: Multi-user document analysis
- **Version Control**: Track changes in PLC projects over time
- **Compliance Checking**: Automated safety standard compliance

### Integration Roadmap

- **PLCopen XML**: Support for PLCopen standard format
- **CODESYS**: Integration with CODESYS development environment
- **Schneider Electric**: Unity Pro and EcoStruxure support
- **Mitsubishi**: GX Works and iQ Works integration

## Support

For technical support or feature requests, contact the Pandaura AS development team or refer to the internal documentation portal.

---

*Wrapper B — Document & Logic Analyst (RAG) System*  
*Version 1.0.0*  
*Pandaura AS — Industrial Automation Intelligence Platform*
