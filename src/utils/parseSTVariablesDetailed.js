// parseSTVariablesDetailed.js
// Parses Structured Text (ST) code into tag objects with type, address, scope, etc.
// Handles vendor-specific comments (address, scope, etc.)

function parseSTVariablesDetailed(stCode, vendor) {
  // Split code into lines, ignore empty/comment-only lines
  const lines = stCode.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//'));
  const tags = [];
  for (const line of lines) {
    // Match: Name : TYPE [:= value]; // address=... scope=...
    const mainMatch = line.match(/^(\w+)\s*:\s*(\w+)(\s*:=\s*([^;]+))?;/);
    if (!mainMatch) continue;
    const name = mainMatch[1];
    const dataType = mainMatch[2];
    const defaultValue = mainMatch[4] ? mainMatch[4].trim() : null;
    // Parse trailing comment for address/scope
    let address = null, scope = null;
    const commentMatch = line.match(/\/\/\s*(.*)$/);
    if (commentMatch) {
      const comment = commentMatch[1];
      const addrMatch = comment.match(/address=([^\s]+)/);
      if (addrMatch) address = addrMatch[1];
      const scopeMatch = comment.match(/scope=([^\s]+)/);
      if (scopeMatch) scope = scopeMatch[1];
    }
    tags.push({
      name,
      dataType,
      defaultValue,
      address,
      scope,
      vendor: vendor || null,
    });
  }
  return tags;
}

module.exports = { parseSTVariablesDetailed };
