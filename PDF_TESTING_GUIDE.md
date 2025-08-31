# 📄 PDF Testing Guide for Wrapper B

## 🎯 Quick Start - Create Test PDF

1. **Open the HTML file I just created:**
   ```
   test-files/motor-control-spec.html
   ```

2. **Convert to PDF:**
   - Open in any web browser
   - Press `Ctrl+P` (Windows) or `Cmd+P` (Mac)
   - Select "Save as PDF"
   - Save as: `test-files/motor-control-spec.pdf`

3. **Test with Wrapper B:**
   - Upload the PDF to Wrapper B
   - Use prompt: "Analyze this motor control specification and extract all I/O tags, safety requirements, and maintenance procedures"

## 📋 Best PDF Types for Wrapper B Testing

### ✅ EXCELLENT for Testing:

1. **Technical Specifications**
   - Motor control documents
   - System requirement specs
   - Control logic descriptions
   - Process flow documents

2. **I/O Documentation**
   - Tag databases
   - I/O assignment lists
   - Signal descriptions
   - Address mapping tables

3. **Safety Documents**
   - Safety function descriptions
   - Risk assessments
   - Emergency procedures
   - Safety validation reports

4. **Maintenance Procedures**
   - PM schedules
   - Troubleshooting guides
   - Calibration procedures
   - Spare parts lists

### ⚠️ MODERATE Results:

1. **Engineering Drawings**
   - P&ID diagrams (text extraction limited)
   - Electrical schematics (if they contain text tables)
   - Layout drawings with annotations

2. **Scanned Documents**
   - Works if OCR quality is good
   - Text-based content preferred
   - Tables may need manual verification

### ❌ NOT RECOMMENDED:

1. **Pure Image Files**
   - Hand-drawn sketches
   - Photos of equipment
   - Low-quality scans without text

2. **Complex Graphics**
   - CAD drawings without text
   - Pure diagram files
   - Image-only content

## 🧪 Sample Test Prompts

### For Technical Specifications:
```
"Analyze this technical specification and identify:
1. All I/O tags and their addresses
2. Safety requirements and interlocks
3. Motor specifications and ratings
4. Maintenance schedule and procedures"
```

### For I/O Documentation:
```
"Extract all tags from this document and create a summary table showing:
- Tag names and addresses
- Data types and descriptions
- Safety-critical tags
- Input vs output classification"
```

### For Safety Documents:
```
"Review this safety document and identify:
1. All safety functions and their SIL ratings
2. Emergency stop requirements
3. Risk mitigation measures
4. Testing and validation procedures"
```

### For Maintenance Docs:
```
"Analyze this maintenance document and extract:
1. Preventive maintenance schedules
2. Troubleshooting procedures
3. Spare parts requirements
4. Calibration intervals"
```

## 📊 Expected Wrapper B Analysis Results

When you upload the test PDF, Wrapper B should extract:

### 📝 Main Analysis (`answer_md`):
- System overview and specifications
- Key safety requirements
- Motor control logic description
- Maintenance recommendations

### 📋 Structured Data (`artifacts`):

1. **Tables** - I/O assignment table with:
   - Tag addresses (I:0/0, O:0/0, etc.)
   - Tag names (StartButton, MotorContactor)
   - Descriptions and safety flags

2. **Reports** - Detailed sections on:
   - Safety requirements analysis
   - Maintenance schedule breakdown
   - Fault code descriptions

3. **Citations** - References to specific document sections

### ⏭️ Next Actions:
- Import tags to Logic Studio
- Create safety validation checklist
- Schedule maintenance procedures
- Export I/O configuration

## 🔧 Troubleshooting PDF Issues

### If PDF analysis fails:

1. **Check file size** - Keep under 10MB
2. **Verify text content** - PDFs must contain extractable text
3. **Test with simple PDF** - Try the HTML-generated PDF first
4. **Check file format** - Ensure it's a valid PDF file

### If tables aren't extracted:

1. **Use proper table formatting** - HTML tables work best
2. **Clear headers** - Make sure table headers are defined
3. **Consistent structure** - Avoid merged cells if possible

### If safety data is missed:

1. **Use keywords** - Include "safety", "emergency", "SIL", "critical"
2. **Clear formatting** - Use headers and bullet points
3. **Explicit labeling** - Mark safety-critical items clearly

## 🎉 Success Indicators

Your test is successful when Wrapper B:

✅ **Extracts I/O tags** with addresses and descriptions  
✅ **Identifies safety requirements** and critical functions  
✅ **Creates structured tables** from the document content  
✅ **Provides actionable next steps** for implementation  
✅ **References specific document sections** in citations  

## 📞 Support

If you have issues:
1. Check the backend console logs for detailed error messages
2. Verify the PDF contains extractable text (not just images)
3. Try with the sample HTML-generated PDF first
4. Test with simpler documents before complex ones

Happy testing! 🚀
