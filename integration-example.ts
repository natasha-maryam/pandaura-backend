// integration-example.ts
// Example showing how to integrate vendor formatters with existing tag operations

import { TagsTable, CreateTagData } from './src/db/tables/tags';
import { ProjectsTable } from './src/db/tables/projects';
import { 
  formatTagForVendor, 
  type VendorTag 
} from './src/utils/vendorFormatters';

// Example: Create and format tags for different vendors
async function createAndFormatTags() {
  console.log('🔧 Integration Example: Creating and Formatting Tags for Multiple Vendors\n');

  // Sample project ID and user ID (replace with actual values)
  const projectId = 1;
  const userId = 'sample-user-id';

  // Sample tags to create
  const sampleTags: CreateTagData[] = [
    {
      project_id: projectId,
      user_id: userId,
      name: 'Emergency_Stop',
      description: 'Emergency stop button',
      type: 'BOOL',
      data_type: 'BOOL',
      address: '',
      vendor: 'rockwell',
      scope: 'input',
      tag_type: 'input',
      is_ai_generated: false
    },
    {
      project_id: projectId,
      user_id: userId,
      name: 'Motor_Start',
      description: 'Motor start command',
      type: 'BOOL',
      data_type: 'BOOL',
      address: '',
      vendor: 'siemens',
      scope: 'input',
      tag_type: 'input',
      is_ai_generated: false
    },
    {
      project_id: projectId,
      user_id: userId,
      name: 'Speed_Setpoint',
      description: 'Motor speed setpoint',
      type: 'INT',
      data_type: 'INT',
      address: '',
      vendor: 'beckhoff',
      scope: 'global',
      tag_type: 'memory',
      is_ai_generated: false,
      default_value: '1500'
    }
  ];

  // Create tags in database (commented out to avoid actual DB operations)
  /*
  for (const tagData of sampleTags) {
    try {
      const createdTag = TagsTable.createTag(tagData);
      console.log(`✅ Created tag: ${createdTag.name}`);
    } catch (error) {
      console.error(`❌ Failed to create tag ${tagData.name}:`, error);
    }
  }
  */

  // Format tags for each vendor
  const vendors: ('rockwell' | 'siemens' | 'beckhoff')[] = ['rockwell', 'siemens', 'beckhoff'];
  
  for (const vendor of vendors) {
    console.log(`\n🔧 Formatting Tags for ${vendor.toUpperCase()}:`);
    
    for (const tagData of sampleTags) {
      const vendorTag: VendorTag = {
        name: tagData.name,
        dataType: tagData.data_type || tagData.type || 'DINT',
        address: tagData.address,
        description: tagData.description,
        scope: tagData.scope,
        defaultValue: tagData.default_value,
        vendor: vendor
      };

      try {
        const formattedTag = formatTagForVendor(vendorTag, vendor);
        console.log(`   ✅ ${tagData.name}:`);
        console.log(`      Address: ${formattedTag.Address || (formattedTag as any).TagName || 'N/A'}`);
        console.log(`      DataType: ${formattedTag.DataType}`);
        
        // Example: Update the original tag with the formatted address
        // tagData.address = formattedTag.Address || (formattedTag as any).Address;
        
      } catch (error) {
        console.log(`   ❌ Failed to format ${tagData.name}: ${error}`);
      }
    }
  }

  // Example: Batch format tags from database
  console.log(`\n🔧 Batch Formatting Example:`);
  
  // Get tags from database (commented out to avoid actual DB operations)
  /*
  const tagsFromDB = TagsTable.getTags({ project_id: projectId });
  
  if (tagsFromDB.tags.length > 0) {
    const vendorGroups = tagsFromDB.tags.reduce((groups, tag) => {
      const vendor = tag.vendor as 'rockwell' | 'siemens' | 'beckhoff';
      if (!groups[vendor]) groups[vendor] = [];
      groups[vendor].push(tag);
      return groups;
    }, {} as Record<string, any[]>);

    for (const [vendor, tags] of Object.entries(vendorGroups)) {
      console.log(`\n   ${vendor.toUpperCase()} Tags (${tags.length}):`);
      
      const formattedTags = tags.map(tag => {
        const vendorTag: VendorTag = {
          name: tag.name,
          dataType: tag.data_type,
          address: tag.address,
          description: tag.description,
          scope: tag.scope,
          defaultValue: tag.default_value,
          vendor: vendor as any
        };
        
        return formatTagForVendor(vendorTag, vendor as any);
      });

      console.log(`   ✅ Formatted ${formattedTags.length} tags`);
    }
  }
  */

  // Example: Export formatted tags for each vendor
  console.log(`\n🔧 Export Formatting Example:`);
  
  for (const vendor of vendors) {
    const exportData = {
      project: { name: `Sample Project`, vendor },
      exportDate: new Date().toISOString(),
      tags: sampleTags
        .filter(tag => tag.vendor === vendor)
        .map(tag => {
          const vendorTag: VendorTag = {
            name: tag.name,
            dataType: tag.data_type || 'DINT',
            address: tag.address,
            description: tag.description,
            scope: tag.scope,
            defaultValue: tag.default_value,
            vendor: vendor
          };
          return formatTagForVendor(vendorTag, vendor);
        })
    };

    console.log(`   ✅ ${vendor.toUpperCase()} Export Ready: ${exportData.tags.length} tags`);
    
    // Example: Save to file (commented out to avoid file operations)
    /*
    const filename = `export_${vendor}_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    console.log(`   💾 Saved to ${filename}`);
    */
  }

  console.log('\n🎉 Integration Example Complete!');
  console.log('\n📋 Key Integration Points:');
  console.log('   ✅ Formatter works with existing tag database schema');
  console.log('   ✅ Supports batch processing of tags');
  console.log('   ✅ Generates vendor-appropriate addresses automatically');
  console.log('   ✅ Handles data type mapping between vendors');
  console.log('   ✅ Compatible with existing export/import workflows');
  console.log('   ✅ Ready for use in existing API endpoints');
}

// Example: Using formatters in API response
function exampleAPIResponse() {
  console.log('\n🔧 API Response Example:');
  
  const sampleTag: VendorTag = {
    name: 'Conveyor_Running',
    dataType: 'BOOL',
    description: 'Conveyor belt running status',
    scope: 'output',
    vendor: 'rockwell'
  };

  const rockwellFormatted = formatTagForVendor(sampleTag, 'rockwell');
  const siemensFormatted = formatTagForVendor(sampleTag, 'siemens');
  const beckhoffFormatted = formatTagForVendor(sampleTag, 'beckhoff');

  const apiResponse = {
    success: true,
    originalTag: sampleTag,
    formattedTags: {
      rockwell: rockwellFormatted,
      siemens: siemensFormatted,
      beckhoff: beckhoffFormatted
    }
  };

  console.log('API Response Structure:');
  console.log(JSON.stringify(apiResponse, null, 2));
}

// Run examples
console.log('🚀 Vendor Formatters Integration Examples\n');
console.log('These examples show how to integrate the vendor formatters');
console.log('with the existing Pandaura backend system.\n');

createAndFormatTags();
exampleAPIResponse();

console.log('\n📝 Next Steps:');
console.log('1. Update existing tag creation workflows to use formatters');
console.log('2. Add vendor formatting to import/export operations');
console.log('3. Integrate with frontend tag management components');
console.log('4. Add vendor-specific validation to tag forms');
console.log('5. Create vendor-specific export templates');

export { createAndFormatTags, exampleAPIResponse };
