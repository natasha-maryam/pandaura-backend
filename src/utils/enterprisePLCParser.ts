import { parseSTVariablesDetailed } from './stParser';
import xml2js from 'xml2js';
import path from 'path';
import JSZip from 'jszip';

// ------------------------------
// STANDARD OUTPUT SCHEMA
// ------------------------------
export interface StandardPLCOutput {
  vendor: string;
  project_name: string;
  tags: PLCTag[];
  routines: PLCRoutine[];
  metadata: ProjectMetadata;
}

export interface PLCTag {
  TagName: string;
  DataType: string;
  Scope: string;
  Address: string;
  Direction: 'Input' | 'Output' | 'Internal';
  Description: string;
}

export interface PLCRoutine {
  Name: string;
  Type: string;
  Code: string;
  Program: string;
  File: string;
}

export interface ProjectMetadata {
  file_count?: number;
  total_size?: number;
  line_count?: number;
  creation_date?: string;
  last_modified?: string;
  plc_type?: string;
  software_version?: string;
}

// ------------------------------
// VENDOR DETECTION
// ------------------------------
export function detectVendor(filePath: string, fileContent?: Buffer): string {
  const fileName = path.basename(filePath).toLowerCase();
  const extension = path.extname(fileName);
  
  // File extension based detection
  if (extension === '.ap11' || extension === '.ap16') return 'Siemens';
  if (extension === '.acd' || extension === '.l5x') return 'Rockwell';
  if (extension === '.tsproj' || extension === '.plcproj') return 'Beckhoff';
  if (extension === '.st' || extension === '.scl') return 'Generic';
  
  // Content-based detection for XML files
  if (extension === '.xml' && fileContent) {
    const contentStr = fileContent.toString('utf-8');
    
    // Siemens TIA Portal signatures
    if (contentStr.includes('siemens.com/automation') || 
        contentStr.includes('SW.Blocks.GlobalDB') ||
        contentStr.includes('Step7')) {
      return 'Siemens';
    }
    
    // Rockwell/Allen-Bradley signatures
    if (contentStr.includes('RSLogix5000Content') || 
        contentStr.includes('ControllerTags') ||
        contentStr.includes('AddOnInstruction')) {
      return 'Rockwell';
    }
    
    // Beckhoff TwinCAT signatures
    if (contentStr.includes('TcPlcProject') || 
        contentStr.includes('TwinCAT') ||
        contentStr.includes('Beckhoff')) {
      return 'Beckhoff';
    }
  }
  
  return 'Unknown';
}

// ------------------------------
// SIEMENS PARSER
// ------------------------------
export async function parseSiemensProject(filePath: string, fileBuffer: Buffer): Promise<StandardPLCOutput> {
  const output: StandardPLCOutput = {
    vendor: 'Siemens',
    project_name: path.basename(filePath),
    tags: [],
    routines: [],
    metadata: {}
  };

  try {
    let xmlContent: string;
    
    // Handle ZIP archives (.ap11, .ap16)
    if (filePath.endsWith('.ap11') || filePath.endsWith('.ap16')) {
      const zip = new JSZip();
      const zipData = await zip.loadAsync(fileBuffer);
      
      // Find XML files in the archive
      for (const [fileName, file] of Object.entries(zipData.files)) {
        if (fileName.endsWith('.xml') && !file.dir) {
          xmlContent = await file.async('text');
          await parseSiemensXML(xmlContent, output);
        }
      }
    } else {
      xmlContent = fileBuffer.toString('utf-8');
      await parseSiemensXML(xmlContent, output);
    }
    
    output.metadata = {
      file_count: 1,
      total_size: fileBuffer.length,
      plc_type: 'Siemens S7',
      software_version: 'TIA Portal'
    };
    
  } catch (error) {
    console.error('[ERROR] Siemens parsing failed:', error);
  }

  return output;
}

async function parseSiemensXML(xmlContent: string, output: StandardPLCOutput): Promise<void> {
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  
  try {
    const result = await parser.parseStringPromise(xmlContent);
    
    // Parse Global DB variables
    const globalDBs = findNodes(result, 'SW.Blocks.GlobalDB');
    for (const db of globalDBs) {
      const vars = findNodes(db, 'SW.Blocks.GlobalDB.Var') || [];
      for (const varNode of vars) {
        output.tags.push({
          TagName: varNode.Name || varNode.$.Name || '',
          DataType: varNode.DataType || varNode.$.DataType || '',
          Scope: 'Global',
          Address: varNode.Address || varNode.$.Address || '',
          Direction: determineDirection(varNode.Address || varNode.$.Address || ''),
          Description: varNode.Comment || varNode.$.Comment || ''
        });
      }
    }
    
    // Parse Function Blocks
    const functionBlocks = findNodes(result, 'SW.Blocks.FB');
    for (const fb of functionBlocks) {
      output.routines.push({
        Name: fb.Name || fb.$.Name || '',
        Type: 'FB',
        Program: fb.Program || fb.$.Program || '',
        Code: extractSTCode(fb),
        File: ''
      });
      
      // Parse FB interface variables
      const interfaces = findNodes(fb, 'SW.Blocks.FB.Interface');
      for (const iface of interfaces) {
        const sections = findNodes(iface, 'Section') || [];
        for (const section of sections) {
          const sectionName = section.Name || section.$.Name || '';
          const members = findNodes(section, 'Member') || [];
          
          for (const member of members) {
            output.tags.push({
              TagName: member.Name || member.$.Name || '',
              DataType: member.Datatype || member.$.Datatype || '',
              Scope: sectionName,
              Address: '',
              Direction: mapSectionToDirection(sectionName),
              Description: member.Comment || member.$.Comment || ''
            });
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error parsing Siemens XML:', error);
  }
}

// ------------------------------
// ROCKWELL PARSER
// ------------------------------
export async function parseRockwellProject(filePath: string, fileBuffer: Buffer): Promise<StandardPLCOutput> {
  const output: StandardPLCOutput = {
    vendor: 'Rockwell',
    project_name: path.basename(filePath),
    tags: [],
    routines: [],
    metadata: {}
  };

  try {
    const xmlContent = fileBuffer.toString('utf-8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const result = await parser.parseStringPromise(xmlContent);
    
    // Parse Controller Tags
    const controllerTags = findNodes(result, 'Tag');
    for (const tag of controllerTags) {
      output.tags.push({
        TagName: tag.Name || tag.$.Name || '',
        DataType: tag.DataType || tag.$.DataType || '',
        Scope: 'Controller',
        Address: tag.Address || tag.$.Address || '',
        Direction: 'Internal',
        Description: tag.Description || tag.$.Description || ''
      });
    }
    
    // Parse Programs and Routines
    const programs = findNodes(result, 'Program');
    for (const program of programs) {
      const programName = program.Name || program.$.Name || '';
      const routines = findNodes(program, 'Routine') || [];
      
      for (const routine of routines) {
        output.routines.push({
          Name: routine.Name || routine.$.Name || '',
          Type: routine.Type || routine.$.Type || 'Routine',
          Program: programName,
          Code: extractRockwellCode(routine),
          File: ''
        });
      }
    }
    
    // Parse Add-On Instructions
    const aois = findNodes(result, 'AddOnInstruction');
    for (const aoi of aois) {
      output.routines.push({
        Name: aoi.Name || aoi.$.Name || '',
        Type: 'AOI',
        Program: '',
        Code: extractRockwellCode(aoi),
        File: ''
      });
      
      // Parse AOI parameters
      const parameters = findNodes(aoi, 'Parameter') || [];
      for (const param of parameters) {
        output.tags.push({
          TagName: param.Name || param.$.Name || '',
          DataType: param.DataType || param.$.DataType || '',
          Scope: 'AOI',
          Address: '',
          Direction: mapUsageToDirection(param.Usage || param.$.Usage || ''),
          Description: param.Description || param.$.Description || ''
        });
      }
    }
    
    output.metadata = {
      file_count: 1,
      total_size: fileBuffer.length,
      plc_type: 'Allen-Bradley ControlLogix',
      software_version: 'Studio 5000'
    };
    
  } catch (error) {
    console.error('[ERROR] Rockwell parsing failed:', error);
  }

  return output;
}

// ------------------------------
// BECKHOFF PARSER
// ------------------------------
export async function parseBeckhoffProject(filePath: string, fileBuffer: Buffer): Promise<StandardPLCOutput> {
  const output: StandardPLCOutput = {
    vendor: 'Beckhoff',
    project_name: path.basename(filePath),
    tags: [],
    routines: [],
    metadata: {}
  };

  try {
    const xmlContent = fileBuffer.toString('utf-8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const result = await parser.parseStringPromise(xmlContent);
    
    // Parse Global Variables
    const globalVars = findNodes(result, 'Variable');
    for (const variable of globalVars) {
      output.tags.push({
        TagName: variable.Name || variable.$.Name || '',
        DataType: variable.Type || variable.$.Type || '',
        Scope: variable.Scope || variable.$.Scope || 'Global',
        Address: variable.Address || variable.$.Address || '',
        Direction: determineDirection(variable.Address || variable.$.Address || ''),
        Description: variable.Comment || variable.$.Comment || ''
      });
    }
    
    // Parse POUs (Program Organization Units)
    const pous = findNodes(result, 'POU');
    for (const pou of pous) {
      output.routines.push({
        Name: pou.Name || pou.$.Name || '',
        Type: pou.Type || pou.$.Type || 'POU',
        Program: '',
        Code: extractBeckhoffCode(pou),
        File: ''
      });
    }
    
    output.metadata = {
      file_count: 1,
      total_size: fileBuffer.length,
      plc_type: 'Beckhoff TwinCAT',
      software_version: 'TwinCAT 3'
    };
    
  } catch (error) {
    console.error('[ERROR] Beckhoff parsing failed:', error);
  }

  return output;
}

// ------------------------------
// STRUCTURED TEXT PARSER
// ------------------------------
export async function parseStructuredText(filePath: string, fileBuffer: Buffer): Promise<StandardPLCOutput> {
  const output: StandardPLCOutput = {
    vendor: 'Generic',
    project_name: path.basename(filePath),
    tags: [],
    routines: [],
    metadata: {}
  };

  try {
    const stCode = fileBuffer.toString('utf-8');
    
    // Use existing ST parser for variables
    const variables = parseSTVariablesDetailed(stCode);
    output.tags = variables.map(v => ({
      TagName: v.name,
      DataType: v.dataType,
      Scope: v.scope || 'Local',
      Address: v.address || '',
      Direction: mapTypeToDirection(v.type),
      Description: v.description || ''
    }));
    
    // Extract routines (PROGRAM, FUNCTION_BLOCK, FUNCTION)
    const routineMatches = stCode.match(/(PROGRAM|FUNCTION_BLOCK|FUNCTION)\s+(\w+)[\s\S]*?END_\1/gi);
    if (routineMatches) {
      for (const match of routineMatches) {
        const nameMatch = match.match(/(PROGRAM|FUNCTION_BLOCK|FUNCTION)\s+(\w+)/i);
        if (nameMatch) {
          output.routines.push({
            Name: nameMatch[2],
            Type: nameMatch[1],
            Program: '',
            Code: match,
            File: path.basename(filePath)
          });
        }
      }
    }
    
    output.metadata = {
      file_count: 1,
      total_size: fileBuffer.length,
      line_count: stCode.split('\n').length,
      plc_type: 'Generic ST'
    };
    
  } catch (error) {
    console.error('[ERROR] ST parsing failed:', error);
  }

  return output;
}

// ------------------------------
// UNIFIED INTERFACE
// ------------------------------
export async function parseProject(filePath: string, fileBuffer: Buffer): Promise<StandardPLCOutput> {
  const vendor = detectVendor(filePath, fileBuffer);
  
  switch (vendor) {
    case 'Siemens':
      return await parseSiemensProject(filePath, fileBuffer);
    case 'Rockwell':
      return await parseRockwellProject(filePath, fileBuffer);
    case 'Beckhoff':
      return await parseBeckhoffProject(filePath, fileBuffer);
    case 'Generic':
      return await parseStructuredText(filePath, fileBuffer);
    default:
      console.warn(`[WARN] Unknown vendor for file: ${filePath}`);
      return {
        vendor: 'Unknown',
        project_name: path.basename(filePath),
        tags: [],
        routines: [],
        metadata: { file_count: 1, total_size: fileBuffer.length }
      };
  }
}

// ------------------------------
// BATCH PROCESSING
// ------------------------------
export async function parseMultipleProjects(files: Array<{ path: string; buffer: Buffer }>): Promise<StandardPLCOutput[]> {
  const results: StandardPLCOutput[] = [];
  
  for (const file of files) {
    const result = await parseProject(file.path, file.buffer);
    results.push(result);
  }
  
  return results;
}

// ------------------------------
// HELPER FUNCTIONS
// ------------------------------
function findNodes(obj: any, nodeName: string): any[] {
  const results: any[] = [];
  
  function search(current: any, path: string[] = []): void {
    if (typeof current !== 'object' || current === null) return;
    
    if (Array.isArray(current)) {
      current.forEach((item, index) => search(item, [...path, index.toString()]));
      return;
    }
    
    for (const [key, value] of Object.entries(current)) {
      if (key === nodeName) {
        if (Array.isArray(value)) {
          results.push(...value);
        } else {
          results.push(value);
        }
      } else {
        search(value, [...path, key]);
      }
    }
  }
  
  search(obj);
  return results;
}

function extractSTCode(node: any): string {
  const stSource = findNodes(node, 'STSource')[0];
  if (stSource) {
    return typeof stSource === 'string' ? stSource : stSource._ || '';
  }
  
  const implementation = findNodes(node, 'Implementation')[0];
  if (implementation) {
    const st = findNodes(implementation, 'ST')[0];
    return typeof st === 'string' ? st : st._ || '';
  }
  
  return '';
}

function extractRockwellCode(node: any): string {
  // Try to find ST code
  const stContent = findNodes(node, 'STContent')[0];
  if (stContent) {
    const lines = findNodes(stContent, 'Line') || [];
    return lines.map((line: any) => line._ || line).join('\n');
  }
  
  // Try to find RLL code
  const rllContent = findNodes(node, 'RLLContent')[0];
  if (rllContent) {
    const rungs = findNodes(rllContent, 'Rung') || [];
    return rungs.map((rung: any) => rung.Text || rung.$.Text || '').join('\n');
  }
  
  return '';
}

function extractBeckhoffCode(node: any): string {
  const implementation = findNodes(node, 'Implementation')[0];
  if (implementation) {
    const st = findNodes(implementation, 'ST')[0];
    return typeof st === 'string' ? st : st._ || '';
  }
  return '';
}

function determineDirection(address: string): 'Input' | 'Output' | 'Internal' {
  if (!address) return 'Internal';
  
  const upperAddr = address.toUpperCase();
  if (upperAddr.includes('%I') || upperAddr.includes('INPUT')) return 'Input';
  if (upperAddr.includes('%Q') || upperAddr.includes('OUTPUT')) return 'Output';
  if (upperAddr.includes('%M') || upperAddr.includes('MEMORY')) return 'Internal';
  
  return 'Internal';
}

function mapSectionToDirection(section: string): 'Input' | 'Output' | 'Internal' {
  const upperSection = section.toUpperCase();
  if (upperSection.includes('INPUT')) return 'Input';
  if (upperSection.includes('OUTPUT')) return 'Output';
  return 'Internal';
}

function mapUsageToDirection(usage: string): 'Input' | 'Output' | 'Internal' {
  const upperUsage = usage.toUpperCase();
  if (upperUsage === 'INPUT') return 'Input';
  if (upperUsage === 'OUTPUT') return 'Output';
  return 'Internal';
}

function mapTypeToDirection(type: string): 'Input' | 'Output' | 'Internal' {
  const upperType = type.toUpperCase();
  if (upperType.includes('INPUT')) return 'Input';
  if (upperType.includes('OUTPUT')) return 'Output';
  return 'Internal';
}
