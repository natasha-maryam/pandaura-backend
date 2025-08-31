// Simple PDF creator for testing Wrapper B
const fs = require('fs');

// Create a simple HTML file that can be printed to PDF
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Motor Control System Specification</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 30px; 
            line-height: 1.6; 
        }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; }
        h2 { color: #34495e; }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 15px 0; 
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
        }
        th { background-color: #f8f9fa; }
        .safety { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; }
        .important { background-color: #d1ecf1; padding: 15px; border-left: 4px solid #17a2b8; }
    </style>
</head>
<body>
    <h1>Conveyor Motor Control System</h1>
    <p><strong>Project:</strong> Industrial Conveyor Line #3</p>
    <p><strong>Date:</strong> August 31, 2025</p>
    <p><strong>Engineer:</strong> Pandaura AS</p>
    
    <h2>System Requirements</h2>
    <ul>
        <li>Motor: 5HP, 480V AC, 3-phase induction motor</li>
        <li>Control Voltage: 24V DC</li>
        <li>Safety Rating: SIL 2 compliant</li>
        <li>Environmental: IP65 rated enclosure</li>
    </ul>
    
    <div class="safety">
        <h3>⚠️ SAFETY REQUIREMENTS</h3>
        <ul>
            <li>Emergency stop response time: &lt; 500ms</li>
            <li>Dual-channel emergency stop circuit</li>
            <li>Safety gates must be closed before motor start</li>
            <li>Motor overload protection with auto-reset</li>
        </ul>
    </div>
    
    <h2>I/O Assignment Table</h2>
    <table>
        <tr>
            <th>Address</th>
            <th>Tag Name</th>
            <th>Description</th>
            <th>Type</th>
            <th>Safety Critical</th>
        </tr>
        <tr>
            <td>I:0/0</td>
            <td>StartButton</td>
            <td>Conveyor start pushbutton</td>
            <td>BOOL</td>
            <td>No</td>
        </tr>
        <tr>
            <td>I:0/1</td>
            <td>StopButton</td>
            <td>Conveyor stop pushbutton</td>
            <td>BOOL</td>
            <td>No</td>
        </tr>
        <tr>
            <td>I:0/2</td>
            <td>EmergencyStop</td>
            <td>Emergency stop circuit status</td>
            <td>BOOL</td>
            <td>YES</td>
        </tr>
        <tr>
            <td>I:0/3</td>
            <td>MotorContactorFB</td>
            <td>Motor contactor feedback</td>
            <td>BOOL</td>
            <td>YES</td>
        </tr>
        <tr>
            <td>I:0/4</td>
            <td>SafetyGate1</td>
            <td>Safety gate position switch #1</td>
            <td>BOOL</td>
            <td>YES</td>
        </tr>
        <tr>
            <td>O:0/0</td>
            <td>MotorContactor</td>
            <td>Motor starter contactor coil</td>
            <td>BOOL</td>
            <td>YES</td>
        </tr>
        <tr>
            <td>O:0/1</td>
            <td>MotorRunLamp</td>
            <td>Green motor running indicator</td>
            <td>BOOL</td>
            <td>No</td>
        </tr>
        <tr>
            <td>O:0/2</td>
            <td>MotorFaultLamp</td>
            <td>Red motor fault indicator</td>
            <td>BOOL</td>
            <td>No</td>
        </tr>
    </table>
    
    <h2>Sequence of Operations</h2>
    <ol>
        <li><strong>Pre-Start Checks:</strong>
            <ul>
                <li>Verify emergency stop is reset</li>
                <li>Check all safety gates are closed</li>
                <li>Confirm motor contactor is de-energized</li>
            </ul>
        </li>
        <li><strong>Start Sequence:</strong>
            <ul>
                <li>Press start button</li>
                <li>System energizes motor contactor</li>
                <li>Wait 2 seconds for contactor feedback</li>
                <li>If feedback confirmed, illuminate run lamp</li>
                <li>If no feedback, trigger fault and illuminate fault lamp</li>
            </ul>
        </li>
        <li><strong>Normal Operation:</strong>
            <ul>
                <li>Monitor all safety inputs continuously</li>
                <li>Check motor contactor feedback every scan</li>
                <li>Any safety input failure triggers immediate stop</li>
            </ul>
        </li>
        <li><strong>Stop Sequence:</strong>
            <ul>
                <li>De-energize motor contactor</li>
                <li>Turn off run lamp</li>
                <li>System returns to safe state</li>
            </ul>
        </li>
    </ol>
    
    <div class="important">
        <h3>📋 MAINTENANCE SCHEDULE</h3>
        <ul>
            <li><strong>Daily:</strong> Visual inspection of motor and safety devices</li>
            <li><strong>Weekly:</strong> Test emergency stop function</li>
            <li><strong>Monthly:</strong> Check motor current readings</li>
            <li><strong>Quarterly:</strong> Inspect contactor contacts</li>
            <li><strong>Annually:</strong> Complete safety system validation</li>
        </ul>
    </div>
    
    <h2>Fault Conditions</h2>
    <table>
        <tr>
            <th>Fault Code</th>
            <th>Description</th>
            <th>Action Required</th>
        </tr>
        <tr>
            <td>F001</td>
            <td>Motor contactor feedback lost</td>
            <td>Check contactor wiring and aux contacts</td>
        </tr>
        <tr>
            <td>F002</td>
            <td>Emergency stop activated</td>
            <td>Reset emergency stop and investigate cause</td>
        </tr>
        <tr>
            <td>F003</td>
            <td>Safety gate open during operation</td>
            <td>Close safety gate and reset system</td>
        </tr>
        <tr>
            <td>F004</td>
            <td>Motor overload protection tripped</td>
            <td>Check motor load and reset overload</td>
        </tr>
    </table>
    
    <h2>Testing Procedures</h2>
    <h3>Emergency Stop Test</h3>
    <ol>
        <li>Start the motor in normal operation</li>
        <li>Press emergency stop button</li>
        <li>Verify motor stops within 500ms</li>
        <li>Check that system cannot restart until E-stop is reset</li>
        <li>Document test results</li>
    </ol>
    
    <h3>Safety Gate Test</h3>
    <ol>
        <li>Attempt to start motor with safety gate open</li>
        <li>Verify system prevents start</li>
        <li>Start motor with gate closed</li>
        <li>Open safety gate during operation</li>
        <li>Verify immediate motor stop</li>
    </ol>
    
    <p><strong>Document Version:</strong> 1.0</p>
    <p><strong>Last Updated:</strong> August 31, 2025</p>
    <p><strong>Next Review:</strong> February 28, 2026</p>
</body>
</html>
`;

// Write the HTML file
fs.writeFileSync('./test-files/motor-control-spec.html', htmlContent);

console.log('✅ Created HTML file: test-files/motor-control-spec.html');
console.log('');
console.log('📄 TO CREATE PDF FOR TESTING:');
console.log('');
console.log('1. Open the HTML file in any web browser');
console.log('2. Press Ctrl+P (or Cmd+P on Mac) to print');
console.log('3. Select "Save as PDF" as the destination');
console.log('4. Save as: test-files/motor-control-spec.pdf');
console.log('');
console.log('🧪 THEN TEST WITH WRAPPER B:');
console.log('');
console.log('Use this prompt: "Analyze this motor control specification and extract all I/O tags, safety requirements, and maintenance procedures"');
console.log('');
console.log('📋 THIS PDF CONTAINS:');
console.log('   • Technical specifications');
console.log('   • Complete I/O tag table');
console.log('   • Safety requirements');
console.log('   • Sequence of operations');
console.log('   • Fault codes and descriptions');
console.log('   • Testing procedures');
console.log('   • Maintenance schedule');
console.log('');
console.log('✨ Perfect for testing Wrapper B\'s document analysis capabilities!');

// Also create a simple markdown version
const markdownContent = `# Motor Control System Specification

**Project:** Industrial Conveyor Line #3  
**Date:** August 31, 2025  
**Engineer:** Pandaura AS

## I/O Assignment

| Address | Tag Name | Description | Type | Safety Critical |
|---------|----------|-------------|------|-----------------|
| I:0/0 | StartButton | Conveyor start pushbutton | BOOL | No |
| I:0/1 | StopButton | Conveyor stop pushbutton | BOOL | No |
| I:0/2 | EmergencyStop | Emergency stop circuit status | BOOL | YES |
| I:0/3 | MotorContactorFB | Motor contactor feedback | BOOL | YES |
| O:0/0 | MotorContactor | Motor starter contactor coil | BOOL | YES |
| O:0/1 | MotorRunLamp | Green motor running indicator | BOOL | No |

## Safety Requirements
- Emergency stop response time: < 500ms
- Dual-channel emergency stop circuit
- Safety gates must be closed before motor start
- Motor overload protection with auto-reset

## Maintenance Schedule
- **Daily:** Visual inspection
- **Weekly:** Test emergency stop
- **Monthly:** Check motor current
- **Quarterly:** Inspect contactor contacts
`;

fs.writeFileSync('./test-files/motor-control-spec.md', markdownContent);
console.log('✅ Also created: test-files/motor-control-spec.md (markdown version)');
