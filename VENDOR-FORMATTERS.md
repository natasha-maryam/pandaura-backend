# Vendor-Specific Address & Syntax Formatters

This module provides comprehensive vendor-specific tag formatting for **Rockwell**, **Siemens**, and **Beckhoff** PLC systems, implementing Step 2 of the vendor formatting requirements.

## 🚀 Features

- **Multi-Vendor Support**: Format tags for Rockwell, Siemens, and Beckhoff PLCs
- **Address Generation**: Automatically generate vendor-appropriate addresses
- **Data Type Mapping**: Convert between standard and vendor-specific data types
- **Address Validation**: Validate addresses against vendor-specific patterns
- **API Endpoints**: RESTful APIs for tag formatting and validation
- **Export Functionality**: Export tags in vendor-specific formats

## 📦 Components

### Core Module: `vendorFormatters.ts`
Contains the main formatting functions and validators:
- `formatTagForRockwell(tag)` - Rockwell Allen-Bradley formatting
- `formatTagForSiemens(tag)` - Siemens TIA Portal formatting  
- `formatTagForBeckhoff(tag)` - Beckhoff TwinCAT formatting
- Address generation and validation functions

### API Endpoints: `tags.ts`
New endpoints added to the existing tags API:
- `POST /api/tags/format/:vendor` - Format tags for specific vendor
- `POST /api/tags/validate-addresses/:vendor` - Validate addresses
- `GET /api/tags/projects/:projectId/export/:vendor/formatted` - Export formatted tags

## 🏷️ Vendor Specifications

### 1. Rockwell (Allen-Bradley)
**Address Examples**: `N7:0`, `I:0.0`, `O:0.0`
**Data Types**: `BOOL`, `INT`, `DINT`, `REAL`, `STRING`
**Scope Categories**: Local, Global, Input, Output
**Naming**: PascalCase, no spaces or special chars

```typescript
const rockwellTag = formatTagForRockwell({
  name: 'Motor_Start',
  dataType: 'BOOL',
  scope: 'input'
});
// Result: { Name: 'Motor_Start', DataType: 'BOOL', Address: 'I:0.0', ... }
```

### 2. Siemens (TIA Portal)
**Address Examples**: `DB1.DBD0`, `I0.0`, `Q0.0`
**Data Types**: `Bool`, `Int`, `DInt`, `Real`, `String`
**Scope Categories**: DB (data block), Inputs, Outputs
**Export Formats**: CSV, TIA Portal XML

```typescript
const siemensTag = formatTagForSiemens({
  name: 'Motor_Start',
  dataType: 'BOOL',
  scope: 'input'
});
// Result: { TagName: 'Motor_Start', DataType: 'Bool', Address: 'I0.0', ... }
```

### 3. Beckhoff (TwinCAT)
**Address Examples**: `%I0.0`, `%Q0.0`, `%M0.0`
**Data Types**: `BOOL`, `INT`, `DINT`, `REAL`, `STRING`
**Scope Categories**: Input, Output, Internal (Global/Local)
**Address Syntax**: ADS syntax or symbolic addresses

```typescript
const beckhoffTag = formatTagForBeckhoff({
  name: 'Motor_Start',
  dataType: 'BOOL',
  scope: 'input'
});
// Result: { Name: 'Motor_Start', DataType: 'BOOL', Address: '%I0.0', ... }
```

## 🔗 API Usage Examples

### Format Tags for Vendor
```typescript
POST /api/tags/format/rockwell
Content-Type: application/json
Authorization: Bearer <token>

{
  "projectId": 123,
  "tags": [
    {
      "name": "Motor_Start",
      "dataType": "BOOL",
      "scope": "input",
      "description": "Motor start button"
    }
  ]
}
```

### Validate Addresses
```typescript
POST /api/tags/validate-addresses/siemens
Content-Type: application/json
Authorization: Bearer <token>

{
  "addresses": ["I0.0", "Q0.0", "DB1.DBD0", "InvalidAddr"]
}
```

### Export Formatted Tags
```typescript
GET /api/tags/projects/123/export/beckhoff/formatted
Authorization: Bearer <token>

// Downloads JSON file with formatted tags
```

## 🧪 Testing

### Unit Tests
```bash
cd pandaura-backend
npx ts-node test-vendor-formatters.ts
```

### API Tests
```bash
# Start the backend server first
npm start

# Run API tests (update token and project ID first)
npx ts-node test-vendor-api.ts
```

## 📊 Address Generation Rules

### Rockwell Address Generation
- **Input**: `I:0.0` (Input slot 0, bit 0)
- **Output**: `O:0.0` (Output slot 0, bit 0)
- **Global**: `N7:0` (Integer file N7, element 0)
- **Local**: `L1:0` (Local tag file L1, element 0)

### Siemens Address Generation
- **Input**: `I0.0` (Input byte 0, bit 0)
- **Output**: `Q0.0` (Output byte 0, bit 0)
- **Global**: `DB1.DBD0` (Data block 1, double word 0)
- **Local**: `L0.0` (Local byte 0, bit 0)

### Beckhoff Address Generation
- **Input**: `%I0.0` (Input byte 0, bit 0)
- **Output**: `%Q0.0` (Output byte 0, bit 0)
- **Global**: `%M0.0` (Memory byte 0, bit 0)
- **Local**: `%L0.0` (Local byte 0, bit 0)

## 🔍 Address Validation Patterns

### Rockwell Patterns
- Input: `I:\d+/\d+` (e.g., `I:1/0`)
- Output: `O:\d+/\d+` (e.g., `O:2/0`)
- Integer: `N\d+:\d+` (e.g., `N7:0`)
- Float: `F\d+:\d+` (e.g., `F8:0`)
- Symbolic: `[A-Za-z_][A-Za-z0-9_]*`

### Siemens Patterns
- Input: `I\d+\.\d+` (e.g., `I0.0`)
- Output: `Q\d+\.\d+` (e.g., `Q0.0`)
- Memory: `M\d+\.\d+` (e.g., `M0.0`)
- Data Block: `DB\d+\.DB[BWDX]\d+` (e.g., `DB1.DBD0`)
- Symbolic: `[A-Za-z_][A-Za-z0-9_]*`

### Beckhoff Patterns
- I/O: `%[IQMT]\d+(\.\d+)?` (e.g., `%I0.0`, `%Q2`)
- Typed Memory: `%[IQMT][BWDL]\d+` (e.g., `%MW100`)
- Symbolic: `[a-zA-Z_][\w]*`
- GVL References: `GVL\.[a-zA-Z_][\w]*`

## 🛡️ Error Handling

The formatters include comprehensive error handling:

- **Invalid Vendor**: Returns 400 error with valid vendor list
- **Missing Data**: Validates required fields and returns appropriate errors
- **Invalid Data Types**: Maps to default types with warnings
- **Invalid Addresses**: Validates against vendor-specific patterns
- **Project Access**: Verifies user has access to specified project

## 📈 Performance Considerations

- **Batch Processing**: Can format multiple tags in a single request
- **Caching**: Address validation patterns are pre-compiled
- **Memory Efficient**: Streaming for large exports
- **Audit Logging**: All formatting operations are logged

## 🔮 Future Enhancements

- **Custom Address Ranges**: Allow configuration of base addresses
- **Tag Templates**: Predefined tag templates per vendor
- **Bulk Import**: Import and format tags from vendor-specific files
- **Real-time Validation**: WebSocket-based validation feedback
- **Advanced Export**: Support for vendor-specific file formats (L5X, TIA files, etc.)

## 📚 Integration with Existing System

The vendor formatters seamlessly integrate with the existing Pandaura backend:

- **Authentication**: Uses existing JWT authentication
- **Project Management**: Integrates with existing project system
- **Audit Logging**: Uses existing audit logging system
- **Database**: Works with existing tag database schema
- **Error Handling**: Follows existing error response patterns

---

**Module Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Last Updated**: August 14, 2025  
**Maintainer**: Pandaura AS Backend Team
