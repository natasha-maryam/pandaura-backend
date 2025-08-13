# Beckhoff CSV + XML Import/Export Module

This module provides comprehensive support for importing and exporting Beckhoff TwinCAT tag data in CSV and XML formats, specifically designed for the Pandaura AS backend.

## 🚀 Features

- **CSV Import/Export**: Support for typical TwinCAT CSV tag export formats
- **XML Import/Export**: Support for TwinCAT ADS-style XML tag exchanges
- **Flexible Header Normalization**: Automatically handles various CSV header formats
- **Strict Data Type Validation**: Validates against official Beckhoff data types
- **Address Format Validation**: Supports multiple Beckhoff addressing schemes
- **Upsert Functionality**: Updates existing tags or creates new ones
- **Comprehensive Error Reporting**: Detailed validation errors with row-level information
- **UTF-8 Support**: Proper encoding for international characters
- **Audit Logging**: Tracks all import/export operations

## 📦 Dependencies

```bash
npm install csv-parse fast-csv xml2js xmlbuilder multer
npm install --save-dev @types/xml2js @types/multer
```

## 🏗️ Installation

The module is already integrated into your backend at:
- **Module**: `src/utils/beckhoffTagIO.ts`
- **Routes**: Added to `src/routes/tags.ts`
- **Test**: `test-beckhoff.ts`

## 🔗 API Endpoints

### Import Beckhoff CSV
```http
POST /api/tags/projects/:projectId/import/beckhoff/csv
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body: 
- file: CSV file (field name must be "file")
```

### Export Beckhoff CSV
```http
GET /api/tags/projects/:projectId/export/beckhoff/csv
Authorization: Bearer <token>

Response: CSV file download
```

### Import Beckhoff XML
```http
POST /api/tags/projects/:projectId/import/beckhoff/xml
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body:
- file: XML file (field name must be "file")
```

### Export Beckhoff XML
```http
GET /api/tags/projects/:projectId/export/beckhoff/xml
Authorization: Bearer <token>

Response: XML file download
```

## 📊 Supported CSV Format

The module supports flexible CSV headers and automatically normalizes common variations:

```csv
Name,DataType,Address,Comment,InitialValue,Scope
Motor1_Start,BOOL,%I0.0,Motor 1 Start Button,,Global
Motor1_Stop,BOOL,%I0.1,Motor 1 Stop Button,,Global
Motor1_Running,BOOL,%Q0.0,Motor 1 Running Output,,Global
Speed_Setpoint,INT,%MW100,Speed setpoint value,1500,Global
Current_Speed,REAL,%MD200,Current speed feedback,0.0,Global
```

### Header Variations Supported
- `name` / `variable name` / `symbol`
- `type` / `data type` / `datatype`
- `comment` / `description`
- `address` / `physical address`
- `initial value` / `default value` / `initialvalue`
- `scope`
- `access mode` / `category`

## 📄 Supported XML Format

```xml
<?xml version="1.0" encoding="utf-8"?>
<Variables>
  <Variable>
    <Name>Motor1_Start</Name>
    <DataType>BOOL</DataType>
    <PhysicalAddress>%I0.0</PhysicalAddress>
    <Comment>Motor 1 Start Button</Comment>
  </Variable>
  <Variable>
    <Name>Speed_Setpoint</Name>
    <DataType>INT</DataType>
    <PhysicalAddress>%MW100</PhysicalAddress>
    <Comment>Speed setpoint value</Comment>
  </Variable>
</Variables>
```

## 🏷️ Supported Data Types

The module supports all standard Beckhoff/TwinCAT data types:

| Beckhoff Type | Standard Type | Description |
|---------------|---------------|-------------|
| BOOL          | BOOL          | Boolean |
| BYTE          | INT           | 8-bit unsigned |
| WORD          | INT           | 16-bit unsigned |
| DWORD         | DINT          | 32-bit unsigned |
| LWORD         | DINT          | 64-bit unsigned |
| SINT          | INT           | 8-bit signed |
| USINT         | INT           | 8-bit unsigned |
| INT           | INT           | 16-bit signed |
| UINT          | INT           | 16-bit unsigned |
| DINT          | DINT          | 32-bit signed |
| UDINT         | DINT          | 32-bit unsigned |
| LINT          | DINT          | 64-bit signed |
| ULINT         | DINT          | 64-bit unsigned |
| REAL          | REAL          | 32-bit float |
| LREAL         | REAL          | 64-bit float |
| TIME          | TIMER         | Time duration |
| DATE          | STRING        | Date value |
| TIME_OF_DAY   | TIMER         | Time of day |
| DATE_AND_TIME | STRING        | Date and time |
| STRING        | STRING        | Character string |
| WSTRING       | STRING        | Wide character string |
| ARRAY         | STRING        | Array type |
| STRUCT        | STRING        | Structure type |

## 🏠 Supported Address Formats

The module validates and supports multiple Beckhoff addressing schemes:

- **I/O Addresses**: `%I0.0`, `%Q2.5`, `%I1`, `%Q0`
- **Memory Addresses**: `%M1.2`, `%T0`
- **Typed Memory**: `%IB0`, `%QB1`, `%MW100`, `%MD200`, `%MB400`
- **Symbolic Names**: `Motor1_Start`, `System_Status`
- **Global Variable Lists**: `GVL.VariableName`
- **Program References**: `MAIN.VariableName`

## 🔄 Tag Type Mapping

Tags are automatically categorized based on their addresses:

- **Input**: Addresses starting with `%I` → `tag_type: 'input'`
- **Output**: Addresses starting with `%Q` → `tag_type: 'output'`
- **Memory**: All other addresses → `tag_type: 'memory'`

## 🔍 Error Handling

The module provides comprehensive error reporting:

```json
{
  "success": false,
  "errors": [
    {
      "row": 5,
      "errors": [
        "Missing variable name",
        "Unsupported Beckhoff data type: UNKNOWN_TYPE"
      ],
      "raw": {
        "name": "",
        "data_type": "UNKNOWN_TYPE",
        "address": "%I0.0"
      }
    }
  ],
  "processed": 4
}
```

## 🧪 Testing

Run the test suite to verify functionality:

```bash
cd pandaura-backend
npx ts-node test-beckhoff.ts
```

## 🔧 Configuration

The module supports various configuration options:

### CSV Export Options
```typescript
await exportBeckhoffCsv(projectId, res, { 
  delimiter: ',' // or ';', '\t', etc.
});
```

### File Upload Limits
The module is configured with a 10MB file size limit for uploads. This can be adjusted in the multer configuration.

## 🛡️ Security

- **Authentication Required**: All endpoints require valid JWT token
- **Project Access Control**: Users can only import/export tags for their own projects
- **File Type Validation**: Only accepts appropriate file types
- **Size Limits**: Prevents oversized file uploads
- **Audit Logging**: All operations are logged for security tracking

## 📝 Usage Examples

### Frontend Integration (JavaScript/TypeScript)

```typescript
// Import CSV
const formData = new FormData();
formData.append('file', csvFile);

const response = await fetch(`/api/tags/projects/${projectId}/import/beckhoff/csv`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
if (result.success) {
  console.log(`Imported ${result.inserted} tags`);
} else {
  console.error('Import errors:', result.errors);
}

// Export CSV
const csvResponse = await fetch(`/api/tags/projects/${projectId}/export/beckhoff/csv`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const blob = await csvResponse.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'tags.csv';
a.click();
```

### cURL Examples

```bash
# Import CSV
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@tags.csv" \
  http://localhost:3000/api/tags/projects/123/import/beckhoff/csv

# Export CSV
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -o tags.csv \
  http://localhost:3000/api/tags/projects/123/export/beckhoff/csv

# Import XML
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@tags.xml" \
  http://localhost:3000/api/tags/projects/123/import/beckhoff/xml

# Export XML
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -o tags.xml \
  http://localhost:3000/api/tags/projects/123/export/beckhoff/xml
```

## 🐛 Troubleshooting

### Common Issues

1. **Foreign Key Constraint Error**: Ensure the project exists and user has access
2. **File Upload Error**: Check file size limits and ensure field name is "file"
3. **Invalid Data Type Error**: Verify data types match supported Beckhoff types
4. **Address Format Error**: Check address follows supported format patterns
5. **Authentication Error**: Ensure valid JWT token is provided

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=beckhoff:* npm start
```

## 🔮 Future Enhancements

- Support for additional TwinCAT XML schema variations
- Batch processing for very large files
- Real-time validation feedback during upload
- Support for custom data types and user-defined types (UDTs)
- Integration with TwinCAT project files (.tsproj)
- Automatic mapping suggestions for unknown data types

## 📚 References

- [Beckhoff TwinCAT Documentation](https://infosys.beckhoff.com/)
- [TwinCAT 3 Variable Configuration](https://infosys.beckhoff.com/content/1033/tc3_plc_intro/2528489867.html)
- [IEC 61131-3 Data Types](https://infosys.beckhoff.com/content/1033/tc3_plc_intro/2528557835.html)

---

**Module Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Last Updated**: August 13, 2025  
**Maintainer**: Pandaura AS Backend Team
