// Test the Railway deployment specifically for code generation
require('dotenv').config();

const testRailwayCodeGeneration = async () => {
  console.log('🧪 Testing Railway Code Generation');
  console.log('==================================');

  const RAILWAY_URL = 'https://pandaura-backend-production.up.railway.app';
  const LOCAL_URL = 'http://localhost:5000';
  
  // Test both local and Railway
  const urls = [
    { name: 'Railway', url: RAILWAY_URL },
    { name: 'Local', url: LOCAL_URL }
  ];

  for (const { name, url } of urls) {
    console.log(`\n🔍 Testing ${name} (${url})`);
    
    try {
      const formData = new FormData();
      formData.append('prompt', 'Generate a simple Siemens SCL conveyor control system with motor start/stop and jam detection');
      formData.append('stream', 'true');

      const response = await fetch(`${url}/api/v1/wrapperB`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }
      });

      if (!response.ok) {
        console.error(`❌ ${name} HTTP Error: ${response.status}`);
        continue;
      }

      console.log(`✅ ${name} Connected successfully`);
      
      const reader = response.body?.getReader();
      if (!reader) {
        console.error(`❌ ${name} No readable body`);
        continue;
      }

      const decoder = new TextDecoder();
      let artifactsReceived = 0;
      let codeFiles = 0;
      let responseLength = 0;
      let hasCompleteEvent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        responseLength += chunk.length;
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'artifacts') {
                artifactsReceived++;
                if (data.artifacts?.code) {
                  codeFiles += data.artifacts.code.length;
                }
                console.log(`  📦 Artifacts chunk ${artifactsReceived}: ${data.artifacts?.code?.length || 0} files`);
              } else if (data.type === 'complete') {
                hasCompleteEvent = true;
                const filesInComplete = data.fullResponse?.artifacts?.code?.length || 0;
                console.log(`  ✅ Complete event: ${filesInComplete} files in artifacts`);
              } else if (data.type === 'end') {
                console.log(`  🏁 Stream ended`);
                break;
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      console.log(`📊 ${name} Summary:`);
      console.log(`   Response Length: ${responseLength} bytes`);
      console.log(`   Artifact Chunks: ${artifactsReceived}`);
      console.log(`   Code Files: ${codeFiles}`);
      console.log(`   Has Complete Event: ${hasCompleteEvent}`);

    } catch (error) {
      console.error(`❌ ${name} Error:`, error.message);
    }
  }
};

// Only test if we're running this directly
if (require.main === module) {
  testRailwayCodeGeneration().catch(console.error);
}

module.exports = { testRailwayCodeGeneration };
