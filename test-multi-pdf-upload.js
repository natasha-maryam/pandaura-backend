const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testMultiPDFUpload() {
  try {
    console.log('🧪 Testing multi-PDF upload functionality...');
    
    const formData = new FormData();
    formData.append('prompt', 'Analyze these documents and provide a summary of key findings from each document. Compare and contrast the information across all documents.');
    formData.append('projectId', '2');
    formData.append('sessionId', 'test_multi_pdf_' + Date.now());
    
    // Create test PDF files (simulated)
    const testFiles = [
      { name: 'document1.pdf', content: 'This is test content for document 1. It contains information about automation systems.' },
      { name: 'document2.pdf', content: 'This is test content for document 2. It contains information about PLC programming.' },
      { name: 'document3.pdf', content: 'This is test content for document 3. It contains information about SCADA systems.' }
    ];
    
    // Add multiple documents to FormData
    testFiles.forEach((file, index) => {
      // Create a buffer with the test content
      const buffer = Buffer.from(file.content);
      formData.append('document', buffer, {
        filename: file.name,
        contentType: 'application/pdf'
      });
    });
    
    console.log(`📄 Uploading ${testFiles.length} documents...`);
    
    const response = await fetch('http://localhost:5001/api/assistant/wrapperA', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    console.log('📋 Response status:', data.status);
    console.log('📋 Answer MD length:', data.answer_md?.length || 0);
    
    if (data.status === 'ok') {
      console.log('✅ Multi-PDF upload successful!');
      console.log('📝 Answer preview:', data.answer_md?.substring(0, 300) + '...');
      
      // Check if the response mentions multiple documents
      const mentionsMultipleDocs = data.answer_md && (
        data.answer_md.includes('multiple') ||
        data.answer_md.includes('documents') ||
        data.answer_md.includes('compare') ||
        data.answer_md.includes('contrast')
      );
      
      if (mentionsMultipleDocs) {
        console.log('✅ Multi-document analysis detected in response');
      } else {
        console.log('⚠️ Response may not be analyzing multiple documents');
      }
      
    } else {
      console.log('❌ Multi-PDF upload failed:', data.errors);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testDocumentProcessor() {
  try {
    console.log('\n🧪 Testing document processor functionality...');
    
    // Test the health endpoint to see supported formats
    const healthResponse = await fetch('http://localhost:5001/api/assistant/health');
    const healthData = await healthResponse.json();
    
    console.log('📋 Health check:', healthData.status);
    console.log('📋 Document support:', healthData.document_support);
    console.log('📋 Supported formats:', healthData.supported_formats);
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting multi-PDF upload tests...\n');
  
  await testDocumentProcessor();
  console.log('\n' + '='.repeat(50) + '\n');
  await testMultiPDFUpload();
  
  console.log('\n✅ All tests completed!');
}

runAllTests();
