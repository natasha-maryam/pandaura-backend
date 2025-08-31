// Convert Markdown to PDF for testing
const fs = require('fs');
const { marked } = require('marked');
const puppeteer = require('puppeteer');

async function convertMarkdownToPDF() {
  try {
    console.log('📄 Converting specification to PDF...');
    
    // Read the markdown file
    const markdownContent = fs.readFileSync('./test-files/conveyor-system-specification.md', 'utf8');
    
    // Convert to HTML
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Conveyor System Technical Specification</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            line-height: 1.6; 
            color: #333;
        }
        h1 { 
            color: #2c3e50; 
            border-bottom: 3px solid #3498db; 
            padding-bottom: 10px;
        }
        h2 { 
            color: #34495e; 
            border-bottom: 1px solid #bdc3c7; 
            padding-bottom: 5px;
        }
        h3 { 
            color: #7f8c8d; 
        }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 20px 0;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 12px; 
            text-align: left; 
        }
        th { 
            background-color: #f8f9fa; 
            font-weight: bold;
        }
        tr:nth-child(even) { 
            background-color: #f8f9fa; 
        }
        .checkbox { 
            font-family: monospace; 
            font-size: 16px;
        }
        code { 
            background-color: #f4f4f4; 
            padding: 2px 4px; 
            border-radius: 3px;
        }
        .page-break { 
            page-break-before: always; 
        }
    </style>
</head>
<body>
    ${marked(markdownContent)}
</body>
</html>`;

    // Launch puppeteer and convert to PDF
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    await page.setContent(htmlContent);
    
    await page.pdf({
      path: './test-files/conveyor-system-specification.pdf',
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      }
    });
    
    await browser.close();
    
    console.log('✅ PDF created: test-files/conveyor-system-specification.pdf');
    console.log('📋 This PDF contains:');
    console.log('   • Technical specifications');
    console.log('   • I/O tag database tables');
    console.log('   • Safety requirements');
    console.log('   • Testing procedures');
    console.log('   • Motor control sequences');
    console.log('');
    console.log('🧪 Perfect for testing Wrapper B document analysis!');
    
  } catch (error) {
    console.error('❌ Error creating PDF:', error.message);
    console.log('💡 You can manually save the markdown as PDF or use an online converter');
  }
}

convertMarkdownToPDF();
