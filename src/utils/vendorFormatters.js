// Vendor-specific tag formatters for Rockwell, Siemens, Beckhoff

function formatTagForRockwell(tag) {
  // Validate & format address if missing or inconsistent
  const address = tag.address || generateRockwellAddress(tag.scope, tag.type);
  // Data type map strict Rockwell types
  const validTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'];
  const dataType = validTypes.includes((tag.dataType || '').toUpperCase()) ? tag.dataType.toUpperCase() : 'DINT';
  return {
    Name: tag.name,
    DataType: dataType,
    Address: address,
    Description: '',
    Scope: tag.scope || 'Internal',
    DefaultValue: tag.defaultValue || null,
    Vendor: 'Rockwell',
  };
}

function generateRockwellAddress(scope, type) {
  if (!scope) return null;
  switch ((scope || '').toLowerCase()) {
    case 'input': return 'I:0.0';
    case 'output': return 'O:0.0';
    case 'global': return 'N7:0';
    default: return null;
  }
}

function formatTagForSiemens(tag) {
  const dataTypeMap = {
    BOOL: 'Bool',
    INT: 'Int',
    DINT: 'DInt',
    REAL: 'Real',
    STRING: 'String',
  };
  const dataType = dataTypeMap[(tag.dataType || '').toUpperCase()] || 'Int';
  const address = tag.address || generateSiemensAddress(tag.scope);
  return {
    TagName: tag.name,
    DataType: dataType,
    Address: address,
    Description: '',
    Scope: tag.scope || 'Internal',
    DefaultValue: tag.defaultValue || null,
    Vendor: 'Siemens',
  };
}

function generateSiemensAddress(scope) {
  switch ((scope || '').toLowerCase()) {
    case 'input': return 'I0.0';
    case 'output': return 'Q0.0';
    case 'global': return 'DB1.DBD0';
    default: return null;
  }
}

function formatTagForBeckhoff(tag) {
  const dataType = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'].includes((tag.dataType || '').toUpperCase())
    ? tag.dataType.toUpperCase()
    : 'DINT';
  const address = tag.address || generateBeckhoffAddress(tag.scope);
  return {
    Name: tag.name,
    DataType: dataType,
    Address: address,
    Scope: tag.scope || 'Internal',
    DefaultValue: tag.defaultValue || null,
    Vendor: 'Beckhoff',
  };
}

function generateBeckhoffAddress(scope) {
  switch ((scope || '').toLowerCase()) {
    case 'input': return '%I0.0';
    case 'output': return '%Q0.0';
    case 'global': return '%M0.0';
    default: return null;
  }
}

module.exports = {
  formatTagForRockwell,
  generateRockwellAddress,
  formatTagForSiemens,
  generateSiemensAddress,
  formatTagForBeckhoff,
  generateBeckhoffAddress,
};
