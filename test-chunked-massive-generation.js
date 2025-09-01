/**
 * Test script for chunked massive code generation
 * Tests the enhanced Simple Code Governor with token limit fixes
 */

const { SimpleCodeGovernor } = require('../src/ai/code-governor/simple-governor');

async function testChunkedGeneration() {
    console.log('🧪 Testing Chunked Massive Code Generation...\n');

    const testSpec = `
    Industrial Automation System Requirements:
    - Multi-zone conveyor control system
    - Barcode scanning and product tracking
    - Safety interlocks and emergency stops
    - SCADA communication interfaces
    - Alarm management system
    - Maintenance mode operations
    - Production data logging
    - Quality control checkpoints
    `;

    const testPrompt = `
    Generate a complete industrial automation system with:
    - Multiple conveyor zones with speed control
    - Product tracking and barcode integration
    - Comprehensive safety systems
    - Advanced diagnostics and monitoring
    - Communication protocols for SCADA
    - Fault detection and recovery
    - User interface integration
    - Data logging and reporting
    
    Focus 95% on complete working code with no skeleton code.
    Generate maximum code output in appropriate files.
    `;

    try {
        console.log('📊 Starting chunked generation test...');
        const startTime = Date.now();
        
        const result = await SimpleCodeGovernor.generateFromDocument(testSpec, testPrompt);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log('\n✅ CHUNKED GENERATION TEST RESULTS:');
        console.log('='.repeat(50));
        console.log(`⏱️  Duration: ${duration.toFixed(1)} seconds`);
        console.log(`📁 Files Generated: ${Object.keys(result.files).length}`);
        
        let totalLines = 0;
        let totalChars = 0;
        
        Object.entries(result.files).forEach(([filename, content]) => {
            const lines = content.split('\n').length;
            const chars = content.length;
            totalLines += lines;
            totalChars += chars;
            
            console.log(`   📄 ${filename}: ${lines} lines, ${chars} chars`);
            
            // Show first few lines of each file
            const preview = content.split('\n').slice(0, 3).join('\n');
            console.log(`      Preview: ${preview.substring(0, 100)}...`);
        });
        
        console.log('\n📈 SUMMARY STATISTICS:');
        console.log(`   Total Lines: ${totalLines}`);
        console.log(`   Total Characters: ${totalChars}`);
        console.log(`   Average Lines/File: ${Math.round(totalLines / Object.keys(result.files).length)}`);
        console.log(`   Largest File: ${Math.max(...Object.values(result.files).map(f => f.split('\n').length))} lines`);
        
        console.log('\n📋 GENERATED SUMMARY:');
        console.log(result.summary);
        
        // Test file content quality
        console.log('\n🔍 CONTENT QUALITY CHECK:');
        let hasSkeletonCode = false;
        let hasCompleteCode = false;
        
        Object.entries(result.files).forEach(([filename, content]) => {
            if (content.includes('TODO') || content.includes('Add your code here') || content.includes('skeleton')) {
                hasSkeletonCode = true;
                console.log(`   ⚠️  ${filename} contains skeleton code`);
            }
            
            if (content.includes('function') || content.includes('if') || content.includes('for') || content.includes('FUNCTION_BLOCK')) {
                hasCompleteCode = true;
            }
        });
        
        console.log(`   Skeleton Code Found: ${hasSkeletonCode ? '❌ YES' : '✅ NO'}`);
        console.log(`   Complete Code Found: ${hasCompleteCode ? '✅ YES' : '❌ NO'}`);
        
        // Check if we met the massive code target
        const isEffective = totalLines >= 2000 && Object.keys(result.files).length >= 5;
        console.log(`   Massive Code Target: ${isEffective ? '✅ MET' : '⚠️  NEEDS MORE'}`);
        
        console.log('\n🚀 CHUNKED GENERATION TEST COMPLETE!');
        
        return {
            success: true,
            duration,
            fileCount: Object.keys(result.files).length,
            totalLines,
            totalChars,
            hasSkeletonCode,
            hasCompleteCode,
            isEffective
        };
        
    } catch (error) {
        console.error('❌ Chunked generation test failed:', error);
        
        return {
            success: false,
            error: error.message,
            duration: 0,
            fileCount: 0,
            totalLines: 0,
            totalChars: 0,
            hasSkeletonCode: false,
            hasCompleteCode: false,
            isEffective: false
        };
    }
}

// Run the test
if (require.main === module) {
    testChunkedGeneration()
        .then(result => {
            console.log('\n📊 FINAL TEST RESULT:', result.success ? '✅ PASSED' : '❌ FAILED');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testChunkedGeneration };
