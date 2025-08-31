// Test file for Wrapper B - Document & Logic Analyst
const fs = require('fs');

// Simple test HTML page for Wrapper B
const wrapperBTestHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wrapper B - Document & Logic Analyst Test</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .test-section { border: 1px solid #ddd; margin: 20px 0; padding: 15px; border-radius: 5px; }
        .test-section h3 { margin-top: 0; color: #333; }
        .file-input { margin: 10px 0; }
        .response { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
        .error { background: #ffe6e6; border: 1px solid #ff9999; }
        .success { background: #e6ffe6; border: 1px solid #99ff99; }
        button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; margin: 5px; }
        button:hover { background: #0056b3; }
        button:disabled { background: #6c757d; cursor: not-allowed; }
        textarea { width: 100%; height: 120px; margin: 10px 0; }
        .file-list { margin: 10px 0; }
        .file-item { background: #f8f9fa; padding: 5px 10px; margin: 2px 0; border-radius: 3px; font-size: 14px; }
        .artifact-section { background: #e8f4f8; padding: 10px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #17a2b8; }
        .test-files { background: #fff3cd; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ffeaa7; }
        .sample-files { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 10px 0; }
        .sample-file { background: #f8f9fa; padding: 10px; border-radius: 3px; border: 1px solid #dee2e6; }
        .code-block { background: #f4f4f4; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 12px; margin: 5px 0; }
    </style>
</head>
<body>
    <h1>🤖 Wrapper B - Document & Logic Analyst (RAG) Test</h1>
    <p>Test the enterprise-grade Document & Logic Analyst functionality with PLC files, documentation, and images.</p>

    <div class="test-files">
        <h3>📁 Available Test Files</h3>
        <p>The following test files have been created in the <code>test-files/</code> directory:</p>
        <div class="sample-files">
            <div class="sample-file">
                <strong>Siemens TIA Portal</strong><br>
                <code>siemens-sample.xml</code><br>
                Contains: Global DB, Function Blocks, ST Code
            </div>
            <div class="sample-file">
                <strong>Rockwell Studio 5000</strong><br>
                <code>rockwell-sample.l5x</code><br>
                Contains: Controller Tags, Routines, AOIs
            </div>
            <div class="sample-file">
                <strong>Beckhoff TwinCAT</strong><br>
                <code>beckhoff-sample.xml</code><br>
                Contains: Global Variables, POUs, FB Code
            </div>
            <div class="sample-file">
                <strong>Structured Text</strong><br>
                <code>structured-text-sample.st</code><br>
                Contains: ST Programs, Function Blocks
            </div>
            <div class="sample-file">
                <strong>Tag Database</strong><br>
                <code>tag-database-sample.csv</code><br>
                Contains: Complete I/O tag list
            </div>
            <div class="sample-file">
                <strong>Technical Spec</strong><br>
                <code>technical-specification.txt</code><br>
                Contains: System specs, safety info
            </div>
        </div>
    </div>

    <div class="test-section">
        <h3>🔧 Health Check</h3>
        <button onclick="testHealth()">Check Wrapper B Health</button>
        <div id="health-response" class="response"></div>
    </div>

    <div class="test-section">
        <h3>📤 File Upload Test</h3>
        <div class="file-input">
            <label><strong>Upload Files:</strong> (PDF, DOC, Images, PLC project files)</label><br>
            <input type="file" id="fileInput" multiple accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.st,.scl,.xml,.l5x,.ap11,.tsproj,.plcproj">
        </div>
        <div id="file-list" class="file-list"></div>
        
        <label><strong>Your Question/Prompt:</strong></label>
        <textarea id="promptInput" placeholder="Ask about the uploaded documents and PLC files. Examples:

• Extract all motor control tags and create a comprehensive table
• Analyze the safety systems and generate a safety report  
• Generate ST code for pump control based on the specifications
• Summarize the system architecture and I/O requirements
• Create a maintenance checklist based on the documentation
• What are the emergency stop sequences in this system?"></textarea>
        
        <div style="margin: 10px 0;">
            <label><strong>Vendor Selection:</strong></label>
            <select id="vendorSelect" style="margin-left: 10px; padding: 5px;">
                <option value="Generic">Generic</option>
                <option value="Siemens">Siemens</option>
                <option value="Rockwell">Rockwell</option>
                <option value="Beckhoff">Beckhoff</option>
            </select>
        </div>
        
        <button onclick="testWrapperB()" id="testBtn">🚀 Analyze Documents</button>
        <div id="wrapper-response" class="response"></div>
    </div>

    <div class="test-section">
        <h3>💡 Sample Prompts</h3>
        <button onclick="setSamplePrompt('tag_extract')">🏷️ Extract Tags</button>
        <button onclick="setSamplePrompt('doc_summary')">📄 Document Summary</button>
        <button onclick="setSamplePrompt('code_gen')">⚙️ Generate Code</button>
        <button onclick="setSamplePrompt('safety_report')">🛡️ Safety Analysis</button>
        <button onclick="setSamplePrompt('maintenance')">🔧 Maintenance Plan</button>
        <button onclick="setSamplePrompt('io_mapping')">🔌 I/O Analysis</button>
    </div>

    <div class="test-section">
        <h3>🧪 Advanced Test Cases</h3>
        <button onclick="setSamplePrompt('multi_vendor')">Multi-Vendor Analysis</button>
        <button onclick="setSamplePrompt('code_review')">Code Review</button>
        <button onclick="setSamplePrompt('system_migration')">System Migration</button>
        <button onclick="setSamplePrompt('fault_analysis')">Fault Analysis</button>
    </div>

    <script>
        const API_BASE = '/api/assistant';
        
        // Update file list display
        document.getElementById('fileInput').addEventListener('change', function(e) {
            const fileList = document.getElementById('file-list');
            fileList.innerHTML = '';
            
            Array.from(e.target.files).forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                const sizeKB = (file.size / 1024).toFixed(1);
                const fileType = getFileTypeIcon(file.name);
                fileItem.innerHTML = \`\${fileType} \${file.name} (\${sizeKB} KB)\`;
                fileList.appendChild(fileItem);
            });
        });

        function getFileTypeIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const icons = {
                'xml': '🔷', 'l5x': '🔶', 'st': '📝', 'scl': '📝',
                'pdf': '📄', 'doc': '📄', 'docx': '📄', 'txt': '📄',
                'csv': '📊', 'xls': '📊', 'xlsx': '📊',
                'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️'
            };
            return icons[ext] || '📁';
        }

        async function testHealth() {
            const responseDiv = document.getElementById('health-response');
            responseDiv.textContent = '⏳ Checking health...';
            responseDiv.className = 'response';
            
            try {
                const response = await fetch(\`\${API_BASE}/health\`);
                const data = await response.json();
                responseDiv.textContent = JSON.stringify(data, null, 2);
                responseDiv.className = response.ok ? 'response success' : 'response error';
            } catch (error) {
                responseDiv.textContent = \`❌ Error: \${error.message}\`;
                responseDiv.className = 'response error';
            }
        }

        async function testWrapperB() {
            const files = document.getElementById('fileInput').files;
            const prompt = document.getElementById('promptInput').value;
            const vendor = document.getElementById('vendorSelect').value;
            const responseDiv = document.getElementById('wrapper-response');
            const testBtn = document.getElementById('testBtn');
            
            if (!prompt.trim()) {
                alert('⚠️ Please enter a prompt');
                return;
            }
            
            testBtn.disabled = true;
            testBtn.textContent = '🔄 Processing...';
            responseDiv.textContent = '⏳ Processing documents and generating response...\\nThis may take a moment for large files or complex analysis.';
            responseDiv.className = 'response';
            
            try {
                const formData = new FormData();
                formData.append('prompt', prompt);
                formData.append('vendor_selection', vendor);
                formData.append('projectId', 'test-project');
                
                // Add all files
                Array.from(files).forEach(file => {
                    formData.append('files', file);
                });
                
                const response = await fetch(\`\${API_BASE}/wrapperB\`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                // Display main response
                let displayText = '📋 ANALYSIS RESULTS\\n';
                displayText += '==================\\n\\n';
                displayText += \`Status: \${data.status}\\n\`;
                displayText += \`Task Type: \${data.task_type}\\n\\n\`;
                
                if (data.assumptions && data.assumptions.length > 0) {
                    displayText += '🧠 ASSUMPTIONS:\\n';
                    data.assumptions.forEach(assumption => {
                        displayText += \`• \${assumption}\\n\`;
                    });
                    displayText += '\\n';
                }
                
                displayText += '📝 ANALYSIS:\\n';
                displayText += data.answer_md + '\\n\\n';
                
                if (data.next_actions && data.next_actions.length > 0) {
                    displayText += '🎯 NEXT ACTIONS:\\n';
                    data.next_actions.forEach(action => {
                        displayText += \`• \${action}\\n\`;
                    });
                    displayText += '\\n';
                }
                
                if (data.errors && data.errors.length > 0) {
                    displayText += '❌ ERRORS:\\n';
                    data.errors.forEach(error => {
                        displayText += \`• \${error}\\n\`;
                    });
                    displayText += '\\n';
                }
                
                responseDiv.textContent = displayText;
                responseDiv.className = response.ok ? 'response success' : 'response error';
                
                // Display artifacts if present
                if (data.artifacts) {
                    displayArtifacts(data.artifacts, responseDiv);
                }
                
                // Display processed files info
                if (data.processed_files) {
                    displayProcessedFiles(data.processed_files, responseDiv);
                }
                
            } catch (error) {
                responseDiv.textContent = \`❌ Error: \${error.message}\`;
                responseDiv.className = 'response error';
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = '🚀 Analyze Documents';
            }
        }
        
        function displayArtifacts(artifacts, responseDiv) {
            let artifactHtml = responseDiv.innerHTML;
            
            if (artifacts.code && artifacts.code.length > 0) {
                artifactHtml += '<div class="artifact-section"><h4>⚙️ Generated Code</h4>';
                artifacts.code.forEach((code, i) => {
                    artifactHtml += \`<div class="code-block"><strong>File:</strong> \${code.filename}<br><strong>Vendor:</strong> \${code.vendor}<br><strong>Language:</strong> \${code.language}<br><br><pre>\${code.content}</pre></div>\`;
                });
                artifactHtml += '</div>';
            }
            
            if (artifacts.tables && artifacts.tables.length > 0) {
                artifactHtml += '<div class="artifact-section"><h4>📊 Extracted Tables</h4>';
                artifacts.tables.forEach((table, i) => {
                    artifactHtml += \`<h5>\${table.title}</h5>\`;
                    artifactHtml += \`<p><strong>Schema:</strong> \${table.schema.join(', ')}</p>\`;
                    artifactHtml += \`<p><strong>Rows:</strong> \${table.rows.length}</p>\`;
                    if (table.rows.length > 0) {
                        artifactHtml += '<div class="code-block">';
                        artifactHtml += table.schema.join(' | ') + '\\n';
                        artifactHtml += '---|'.repeat(table.schema.length) + '\\n';
                        table.rows.slice(0, 5).forEach(row => {
                            artifactHtml += row.join(' | ') + '\\n';
                        });
                        if (table.rows.length > 5) {
                            artifactHtml += \`... and \${table.rows.length - 5} more rows\\n\`;
                        }
                        artifactHtml += '</div>';
                    }
                });
                artifactHtml += '</div>';
            }
            
            if (artifacts.reports && artifacts.reports.length > 0) {
                artifactHtml += '<div class="artifact-section"><h4>📋 Generated Reports</h4>';
                artifacts.reports.forEach((report, i) => {
                    artifactHtml += \`<h5>\${report.title}</h5>\`;
                    artifactHtml += \`<div class="code-block">\${report.content_md}</div>\`;
                });
                artifactHtml += '</div>';
            }
            
            if (artifacts.anchors && artifacts.anchors.length > 0) {
                artifactHtml += '<div class="artifact-section"><h4>🔗 File References</h4>';
                artifacts.anchors.forEach(anchor => {
                    artifactHtml += \`<p><strong>\${anchor.id}:</strong> \${anchor.file} (Page \${anchor.page || 'N/A'}) - \${anchor.note}</p>\`;
                });
                artifactHtml += '</div>';
            }
            
            responseDiv.innerHTML = artifactHtml;
        }
        
        function displayProcessedFiles(processedFiles, responseDiv) {
            let fileHtml = responseDiv.innerHTML;
            fileHtml += '<div class="artifact-section"><h4>📁 Processed Files Summary</h4>';
            
            processedFiles.forEach(file => {
                fileHtml += \`<div class="file-item">\`;
                fileHtml += \`<strong>\${file.filename}</strong> (\${file.type}) - \${(file.size/1024).toFixed(1)} KB\`;
                if (file.extracted_data_available) {
                    fileHtml += ' ✅ Data Extracted';
                }
                fileHtml += \`</div>\`;
            });
            
            fileHtml += '</div>';
            responseDiv.innerHTML = fileHtml;
        }

        function setSamplePrompt(type) {
            const promptInput = document.getElementById('promptInput');
            const prompts = {
                'tag_extract': 'Extract all PLC tags from the uploaded files and create a comprehensive table with TagName, DataType, Scope, Address, Direction, and Description. Include safety-related tags and their functions.',
                
                'doc_summary': 'Provide a comprehensive technical summary of the uploaded documentation including: system purpose, hardware specifications, I/O configuration, safety systems, control philosophy, and key operational parameters.',
                
                'code_gen': 'Generate complete Structured Text (ST) code for motor control based on the specifications in the uploaded files. Include proper variable declarations, safety interlocks, fault handling, and comprehensive comments.',
                
                'safety_report': 'Analyze all safety systems mentioned in the documents and generate a detailed safety report covering: emergency stops, safety interlocks, fault conditions, safety ratings (SIL/Category), and compliance requirements.',
                
                'maintenance': 'Create a comprehensive maintenance plan based on the system documentation including: daily, weekly, monthly, and annual tasks, critical components monitoring, predictive maintenance recommendations, and spare parts list.',
                
                'io_mapping': 'Analyze and extract all I/O mappings from the uploaded files. Create a detailed I/O list showing digital inputs, digital outputs, analog inputs, analog outputs with their addresses, descriptions, and safety classifications.',
                
                'multi_vendor': 'Compare and analyze PLC code from different vendors (Siemens, Rockwell, Beckhoff) uploaded in the files. Identify differences in programming approaches, data types, and suggest migration strategies.',
                
                'code_review': 'Perform a comprehensive code review of the uploaded PLC programs. Check for: safety compliance, best practices, potential issues, optimization opportunities, and coding standards adherence.',
                
                'system_migration': 'Analyze the current system configuration and provide recommendations for migrating to a modern PLC platform. Include hardware mapping, software conversion notes, and risk assessment.',
                
                'fault_analysis': 'Extract all fault conditions, alarm systems, and diagnostic information from the uploaded documentation. Create a fault tree analysis and recommend improvements to fault handling strategies.'
            };
            
            promptInput.value = prompts[type] || '';
        }
        
        // Auto-load sample prompt on page load
        window.onload = function() {
            setSamplePrompt('tag_extract');
        };
    </script>
</body>
</html>
`;

// Save the test file
fs.writeFileSync('test-wrapper-b.html', wrapperBTestHTML);

console.log('✅ Wrapper B test file created: test-wrapper-b.html');
console.log('');
console.log('🚀 To test Wrapper B:');
console.log('1. Start your backend server: npm run dev');
console.log('2. Open test-wrapper-b.html in your browser');
console.log('3. Upload PLC files from test-files/ directory');
console.log('4. Try different sample prompts');
console.log('5. Check the extracted tags, code, and reports');
console.log('');
console.log('📁 Test files available in test-files/:');
console.log('   • siemens-sample.xml (Siemens TIA Portal)');
console.log('   • rockwell-sample.l5x (Rockwell Studio 5000)');
console.log('   • beckhoff-sample.xml (Beckhoff TwinCAT)');
console.log('   • structured-text-sample.st (Generic ST)');
console.log('   • tag-database-sample.csv (I/O List)');
console.log('   • technical-specification.txt (System Specs)');
