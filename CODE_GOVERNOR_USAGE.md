# Code Generation Governor - Complete PLC Code Generation

## Overview

The Code Generation Governor is a comprehensive system that ensures complete, vendor-compliant PLC code generation by eliminating skeleton code and enforcing vendor-specific requirements.

## How It Works

The governor uses a 4-pass pipeline:

1. **SPEC → CONTRACT**: Converts user requirements into strict JSON contract
2. **CONTRACT → PLAN**: Generates explicit file plan with OBs, FBs, UDTs
3. **PLAN → CODE**: Generates each module individually (no skeletons)
4. **CRITIC & PATCH**: Runs vendor-specific checklist and auto-regenerates missing parts

## API Usage

### Endpoint
```
POST /api/assistant/code-governor
```

### Request Body
```json
{
  "prompt": "Create a conveyor system with 3 conveyors, jam detection, and emergency stops",
  "vendor": "Siemens", // or "Rockwell", "Beckhoff"
  "projectName": "MyConveyorProject",
  "stream": true, // or false
  "files": [] // Optional: uploaded specification files
}
```

### Response Format
```json
{
  "status": "ok",
  "task_type": "code_gen",
  "assumptions": [
    "Generated using Code Generation Governor for complete, vendor-compliant code",
    "Vendor-specific requirements enforced for Siemens",
    "All modules include full implementation with no skeleton code"
  ],
  "answer_md": "## Complete PLC Program Generated...",
  "artifacts": {
    "code": [
      {
        "language": "SCL",
        "vendor": "Siemens",
        "compilable": true,
        "filename": "src/OB1.scl",
        "content": "// Complete SCL code..."
      }
    ],
    "tables": [],
    "citations": ["Generated using Code Generation Governor for Siemens compliance"]
  },
  "next_actions": [
    "Import files into development environment",
    "Configure I/O mapping",
    "Test in simulation",
    "Validate safety functions",
    "Deploy to production"
  ],
  "errors": []
}
```

## Supported Vendors

### Siemens S7-1500
- **Language**: SCL (Structured Control Language)
- **File Extension**: .scl
- **Features**: OB100, OB1, FBs with Instance DBs, UDTs, TON/TOF timers
- **Compliance**: TIA Portal conventions, safety interlocks, emergency stops

### Rockwell Logix 5000
- **Language**: Structured Text (ST)
- **File Extension**: .st
- **Features**: AOIs, UDTs, MainTask/CommsTask, TON timers
- **Compliance**: Studio 5000 conventions, alarm management, tag scope

### Beckhoff TwinCAT 3
- **Language**: Structured Text (ST)
- **File Extension**: .st
- **Features**: FBs, DUTs, MAIN program, Tc2_Standard timers
- **Compliance**: TwinCAT 3 conventions, task binding, I/O mapping

## Key Features

### ✅ No Skeleton Code
- Rejects any code containing TODO, placeholder, skeleton, or trivial patterns
- Enforces complete implementation for all modules
- Validates vendor-specific requirements

### ✅ Vendor Compliance
- Enforces vendor-specific syntax and conventions
- Includes proper safety interlocks and emergency stops
- Generates complete documentation and setup instructions

### ✅ Complete Systems
- Generates 15-50+ files for complex systems
- Includes all required modules (OBs, FBs, UDTs, documentation)
- Provides comprehensive error handling and diagnostics

### ✅ Production Ready
- Includes complete safety systems
- Provides comprehensive alarm management
- Includes SCADA integration and tag mapping
- Generates test cases and validation procedures

## Example Generated Files (Siemens)

```
src/
├── OB100.scl              # Cold start initialization
├── OB1.scl                # Main cyclic program
├── FB_ModeMgr.scl         # Mode management (Auto/Semi/Manual/E-Stop)
├── FB_Conveyor.scl        # Conveyor control with jam detection
├── FB_MergeDivert.scl     # Merge/divert logic
├── FB_PalletizerHS.scl    # Palletizer handshake
├── FB_AlarmMgr.scl        # Alarm management
├── FB_Diag.scl            # Diagnostics and monitoring
├── FB_Comms.scl           # Communication interfaces
├── UDT_Device.scl         # Device data structure
├── UDT_Alarm.scl          # Alarm data structure
├── UDT_State.scl          # State machine data structure
docs/
├── README.md              # Setup and installation instructions
└── Scada_Tag_Map.md       # SCADA tag mapping documentation
```

## Integration with Frontend

The Code Governor is integrated into the existing Wrapper B system and can be accessed through:

1. **Document Analyst (B)** mode with code generation requests
2. **Direct API calls** to `/api/assistant/code-governor`
3. **File upload support** for specification documents

## Error Handling

The governor provides detailed error messages for:
- Missing vendor selection
- Invalid specification requirements
- Skeleton code detection
- Vendor compliance violations
- Incomplete implementations

## Testing

Run the test script to verify the governor works:
```bash
node test-code-governor.js
```

This will generate a complete conveyor system and validate all components.

## Benefits

1. **Eliminates Skeleton Code**: No more TODO, placeholder, or incomplete implementations
2. **Vendor Compliance**: Ensures code follows vendor-specific requirements
3. **Production Ready**: Generates complete, deployable systems
4. **Safety Focused**: Includes comprehensive safety systems and interlocks
5. **Well Documented**: Provides complete documentation and setup instructions
6. **Testable**: Includes test cases and validation procedures

The Code Generation Governor transforms Pandaura from generating skeleton code to producing complete, production-ready PLC programs that are vendor-compliant and ready for deployment.
