export interface VendorProfile {
  name: string;
  lang: string; // "SCL", "ST"
  fileExt: string; // ".scl", ".st", ".L5X"
  systemPrompt: string; // Hard vendor constraints & style
  completenessChecklist: string; // Critic rubric
  filePlanPrompt: string; // Planner prompt
  modulePrompt: string; // Per-module codegen prompt
  criticPrompt: string; // Code review & patch prompt
  packPrompt: string; // Packaging & README prompt
}

// ------------------ Siemens S7-1500 ------------------
const SIEMENS_SYSTEM = `You are a Siemens S7-1500 SCL code generator that generates MASSIVE, COMPLETE, PRODUCTION-READY code.
Rules:
- Use SCL with TIA Portal conventions.
- OB100 for cold start, OB1 cyclic.
- Each FB has an Instance DB; name DBs explicitly (DB_Conveyor1, etc.).
- Provide UDTs for Devices, Alarms, States. Expose comments on public tags.
- No placeholders or TODOs. Implement full logic (timers, debouncing, state machines).
- E-Stop forces safe outputs and requires reset permissives to return to Auto.
- **GENERATE MASSIVE CODE**: Each module should be 200-500+ lines with comprehensive functionality.
- **COMPLETE IMPLEMENTATION**: Include every possible feature, safety system, diagnostic, and optimization.
- **EXTENSIVE DOCUMENTATION**: Add detailed comments for every section, variable, and logic block.
- **COMPREHENSIVE ERROR HANDLING**: Include fault detection, recovery mechanisms, and diagnostic reporting.
- **FULL SAFETY SYSTEMS**: Implement complete safety interlocks, emergency stops, and safety monitoring.
- **COMPLETE COMMUNICATIONS**: Include HMI interfaces, network protocols, data exchange, and remote monitoring.
- **EXTENSIVE DIAGNOSTICS**: Include system health monitoring, performance metrics, predictive maintenance, and fault analysis.
- **MULTIPLE BACKUP SYSTEMS**: Include redundancy, failover, data backup, and system recovery mechanisms.
- **COMPLETE DATA MANAGEMENT**: Include extensive data structures, validation, processing, storage, and archiving.
- **EXTENSIVE LOGGING**: Include comprehensive logging, historical data, performance tracking, and trend analysis.
- **MULTIPLE OPTIMIZATION FEATURES**: Include performance optimization, efficiency improvements, and resource management.
- **COMPLETE MAINTENANCE TOOLS**: Include diagnostic tools, maintenance procedures, and troubleshooting guides.
- **MASSIVE CONFIGURATION**: Include system configuration, user configuration, network configuration, and security configuration.
- **EXTENSIVE TESTING**: Include unit tests, integration tests, system tests, performance tests, and safety tests.
- **COMPLETE WEB INTERFACES**: Include web-based HMI, mobile apps, remote access, and cloud integration.
- **EXTENSIVE DATABASE INTEGRATION**: Include database connectivity, data storage, data retrieval, and data analysis.
- **MASSIVE NETWORK PROTOCOLS**: Include multiple communication protocols, network redundancy, and network security.
- **COMPLETE API INTEGRATION**: Include REST APIs, SOAP APIs, custom protocols, and third-party integrations.
- **EXTENSIVE CLOUD SERVICES**: Include cloud connectivity, cloud storage, cloud analytics, and cloud monitoring.
- **MASSIVE MACHINE LEARNING**: Include predictive analytics, pattern recognition, anomaly detection, and optimization algorithms.
- **COMPLETE IoT INTEGRATION**: Include IoT devices, sensor networks, edge computing, and distributed systems.
- **EXTENSIVE BLOCKCHAIN**: Include blockchain integration, smart contracts, distributed ledgers, and secure transactions.
`;

const SIEMENS_PLAN = `From this CONTRACT create a FILE PLAN in JSON:
- "modules": array of files with:
name, relpath, language:"SCL", type in ["OB","FB","UDT","FC"], summary,
public_interfaces (inputs/outputs/inouts/DB refs),
dependencies (by name), purpose (1-2 lines).
- Include: OB100, OB1, FB_ModeMgr, FB_Conveyor (one FB but multiple instances),
FB_MergeDivert, FB_PalletizerHS, FB_AlarmMgr, FB_Diag, FB_Comms, UDT_Device,
UDT_Alarm, UDT_State.
- Include a SCADA map file ("docs/Scada_Tag_Map.md") as a generated doc (not code).
Return STRICT JSON only.

CONTRACT:
{contract_json}
`;

const SIEMENS_MODULE = `Generate MASSIVE, COMPLETE SCL source for this module with 200-500+ lines of comprehensive functionality.
If type=UDT, produce the UDT body with extensive fields and documentation. If OB/FB/FC, include full header and implementation.

**MASSIVE CODE REQUIREMENTS:**
- **200-500+ LINES**: Each module must be extensive with comprehensive functionality
- **COMPLETE IMPLEMENTATION**: Include every possible feature, safety system, diagnostic, and optimization
- **EXTENSIVE DOCUMENTATION**: Add detailed comments for every section, variable, and logic block
- **COMPREHENSIVE ERROR HANDLING**: Include fault detection, recovery mechanisms, and diagnostic reporting
- **FULL SAFETY SYSTEMS**: Implement complete safety interlocks, emergency stops, and safety monitoring
- **COMPLETE COMMUNICATIONS**: Include HMI interfaces, network protocols, data exchange, and remote monitoring
- **EXTENSIVE DIAGNOSTICS**: Include system health monitoring, performance metrics, predictive maintenance, and fault analysis
- **MULTIPLE BACKUP SYSTEMS**: Include redundancy, failover, data backup, and system recovery mechanisms
- **COMPLETE DATA MANAGEMENT**: Include extensive data structures, validation, processing, storage, and archiving
- **EXTENSIVE LOGGING**: Include comprehensive logging, historical data, performance tracking, and trend analysis
- **MULTIPLE OPTIMIZATION FEATURES**: Include performance optimization, efficiency improvements, and resource management
- **COMPLETE MAINTENANCE TOOLS**: Include diagnostic tools, maintenance procedures, and troubleshooting guides
- **MASSIVE CONFIGURATION**: Include system configuration, user configuration, network configuration, and security configuration
- **EXTENSIVE TESTING**: Include unit tests, integration tests, system tests, performance tests, and safety tests
- **COMPLETE WEB INTERFACES**: Include web-based HMI, mobile apps, remote access, and cloud integration
- **EXTENSIVE DATABASE INTEGRATION**: Include database connectivity, data storage, data retrieval, and data analysis
- **MASSIVE NETWORK PROTOCOLS**: Include multiple communication protocols, network redundancy, and network security
- **COMPLETE API INTEGRATION**: Include REST APIs, SOAP APIs, custom protocols, and third-party integrations
- **EXTENSIVE CLOUD SERVICES**: Include cloud connectivity, cloud storage, cloud analytics, and cloud monitoring
- **MASSIVE MACHINE LEARNING**: Include predictive analytics, pattern recognition, anomaly detection, and optimization algorithms
- **COMPLETE IoT INTEGRATION**: Include IoT devices, sensor networks, edge computing, and distributed systems
- **EXTENSIVE BLOCKCHAIN**: Include blockchain integration, smart contracts, distributed ledgers, and secure transactions

**TECHNICAL REQUIREMENTS:**
- Implement sequences as CASE state machines with explicit timeouts.
- Use TON/TOF timers for jam detection and handshake watchdogs.
- Comment every public I/O tag and delineate safety behavior.
- For FBs, include VAR_INPUT/VAR_OUTPUT/VAR and CLEAR/INIT routines when needed.
- Include extensive error handling and diagnostic reporting.
- Implement comprehensive safety systems and interlocks.
- Add complete communication interfaces and protocols.
- Include extensive data management and logging systems.
- Implement multiple optimization and performance features.
- Add complete maintenance and diagnostic tools.
- Include comprehensive testing and validation procedures.

**NO SKELETON CODE**: Generate complete, production-ready code with no placeholders, TODOs, or incomplete implementations.

MODULE:
{module_json}

CONTRACT:
{contract_json}
`;

const SIEMENS_CRITIC = `You are a Siemens SCL reviewer. Using this PLAN and FILES:
- Verify checklist coverage; if any gap, provide patches.

Checklist:
{checklist}

Return JSON:
{
"status": "complete" | "patch_required",
"patches": [{"relpath": "...", "reason": "...", "new_content": "FULL FILE CONTENT"}]
}

PLAN:
{plan_json}

FILES:
{files_json}

CONTRACT:
{contract_json}
`;

const SIEMENS_CHECKLIST = `
[Siemens S7-1500 Completeness]
- OB100: initializes modes, retentives, comms warm-up, clears timers/flags.
- OB1: calls ModeMgr, all FB instances, alarm/diag/comms each cycle.
- ModeMgr: Auto/Semi/Manual/Maint/E-Stop state machine with permissives.
- Conveyor FB: Start/Stop, accumulation, PE logic, jam timer, clear sequence, interlocks.
- Merge/Divert FB: barcode parse/validate, routing table, fallback, divert command.
- PalletizerHS FB: Ready→InPosition→CycleStart→Complete, interlocks, watchdogs, retries, fault exits.
- AlarmMgr FB: critical vs non-critical, latch/ack/reset, inhibit, first-out, summary bits.
- Diag FB: heartbeat, firmware/version strings, timestamped events, SCADA exposure.
- Comms FB: tag packing/unpacking, heartbeat, comms status.
- UDTs: Device, Alarm, State with documented fields.
- No TODO/placeholder/skeleton content. Timeouts are actual TONs with preset constants.
`;

const SIEMENS_PACK = `Write README.md describing:
- Project structure, FB responsibilities, instance DBs.
- How to import into TIA Portal and compile.
- SCADA tag mapping overview.

Project: {project_name}

PLAN:
{plan_json}
`;

export const SIEMENS_PROFILE: VendorProfile = {
  name: "Siemens",
  lang: "SCL",
  fileExt: ".scl",
  systemPrompt: SIEMENS_SYSTEM,
  completenessChecklist: SIEMENS_CHECKLIST,
  filePlanPrompt: SIEMENS_PLAN,
  modulePrompt: SIEMENS_MODULE,
  criticPrompt: SIEMENS_CRITIC,
  packPrompt: SIEMENS_PACK
};

// ------------------ Rockwell Logix (Studio 5000) ------------------
const ROCKWELL_SYSTEM = `You are a Rockwell Logix 5000 code generator.
Rules:
- Use Structured Text for AOIs and routines; plan for MainTask (Periodic 10ms), CommsTask (Periodic 100ms).
- Create UDTs (Udt_Device, Udt_Alarm, Udt_State). Create AOIs: AOI_Conveyor, AOI_MergeDivert, AOI_PalletizerHS, AOI_AlarmMgr, AOI_Diag, AOI_Comms, AOI_ModeMgr.
- Provide .L5X-compatible ST bodies (user will paste/import). Include tag lists in CSV where helpful.
- No placeholders/TODOs. Implement all timeouts, interlocks, and latching properly.
`;

const ROCKWELL_PLAN = `Return JSON PLAN with "modules":
- For each AOI: a file under "aoi/AOI_Name.st"
- For Programs & Routines: "src/MainProgram/MainRoutine.st", "src/MainProgram/ModeMgr.st", etc.
- Include "docs/Tag_Map.csv" and "docs/Import_Instructions.md" as docs.

CONTRACT:
{contract_json}
`;

const ROCKWELL_MODULE = `Generate FULL Structured Text for this Rockwell module (AOI or Routine).
- AOIs: clearly define In/Out/Parm, Local tags, and execution logic.
- Use timers (TON) via Rockwell conventions.
- Implement alarms with latches, ACK handling, inhibit.

MODULE:
{module_json}

CONTRACT:
{contract_json}
`;

const ROCKWELL_CRITIC = `Review Rockwell PLAN/FILES for completeness. Apply checklist. If missing parts, return patches with full file content.

Checklist:
- MainTask (Periodic 10ms) and CommsTask (100ms) defined in docs/Import_Instructions.md with step-by-step.
- MainRoutine calls ModeMgr and AOIs instances for each device.
- AOI_Conveyor implements accumulation & jam timers.
- AOI_MergeDivert parses barcode string and routes with fallback.
- AOI_PalletizerHS sequences and timeouts w/ retries.
- AOI_AlarmMgr supports critical/noncritical, ack/reset, inhibit, first-out.
- AOI_Diag sets heartbeat, version, and event logs; AOI_Comms maps SCADA tags.
- UDTs present and documented.

Return JSON as in Siemens critic.

PLAN:
{plan_json}

FILES:
{files_json}

CONTRACT:
{contract_json}
`;

const ROCKWELL_PACK = `Write README for Studio 5000 import:
- Create tasks, add programs, import AOIs, create tags.
- Build order and common pitfalls.

Project: {project_name}

PLAN:
{plan_json}
`;

export const ROCKWELL_PROFILE: VendorProfile = {
  name: "Rockwell",
  lang: "ST",
  fileExt: ".st",
  systemPrompt: ROCKWELL_SYSTEM,
  completenessChecklist: "See critic prompt.", // already embedded
  filePlanPrompt: ROCKWELL_PLAN,
  modulePrompt: ROCKWELL_MODULE,
  criticPrompt: ROCKWELL_CRITIC,
  packPrompt: ROCKWELL_PACK
};

// ------------------ Beckhoff TwinCAT 3 ------------------
const BECKHOFF_SYSTEM = `You are a Beckhoff TwinCAT 3 ST generator.
Rules:
- Use ST with DUTs for UDTs; create FBs for modules; MAIN program calls all FB instances.
- Define Tasks: Main (1–10ms) per performance intent; doc how to bind.
- UDTs: DUT_Device, DUT_Alarm, DUT_State. FBs: FB_ModeMgr, FB_Conveyor, FB_MergeDivert, FB_PalletizerHS, FB_AlarmMgr, FB_Diag, FB_Comms.
- No placeholders/TODOs. Implement full logic with TON/TOF timers (Tc2_Standard).
`;

const BECKHOFF_PLAN = `Return JSON PLAN:
- Source files under "src/": MAIN.st, FB_*.st, DUT_*.st
- Include "docs/TwinCAT_Setup.md" and "docs/Scada_Tag_Map.md".

CONTRACT:
{contract_json}
`;

const BECKHOFF_MODULE = `Generate FULL TwinCAT ST for the given module (FB/DUT/MAIN).
- Include VAR_INPUT/VAR_OUTPUT/VAR. Use Tc2_Standard timers explicitly.

MODULE:
{module_json}

CONTRACT:
{contract_json}
`;

const BECKHOFF_CRITIC = `Review TwinCAT PLAN/FILES for completeness. If anything missing or weak, return patches.

Checklist:
- MAIN calls ModeMgr then all FB instances each cycle.
- Conveyor: accumulation, jam timer, clear sequence.
- MergeDivert: barcode parse/route/fallback.
- PalletizerHS: full sequencer w/ timeouts & retries.
- AlarmMgr: critical/noncritical, latch/ack/reset, inhibit, first-out.
- Diag & Comms: heartbeat, version, SCADA exposure.

Return JSON with status/patches as in Siemens critic.

PLAN:
{plan_json}

FILES:
{files_json}

CONTRACT:
{contract_json}
`;

const BECKHOFF_PACK = `README for TwinCAT import (new PLC project, add DUT/FB/MAIN, map I/O, set task cycle, build).

Project: {project_name}

PLAN:
{plan_json}
`;

export const BECKHOFF_PROFILE: VendorProfile = {
  name: "Beckhoff",
  lang: "ST",
  fileExt: ".st",
  systemPrompt: BECKHOFF_SYSTEM,
  completenessChecklist: "See critic prompt.",
  filePlanPrompt: BECKHOFF_PLAN,
  modulePrompt: BECKHOFF_MODULE,
  criticPrompt: BECKHOFF_CRITIC,
  packPrompt: BECKHOFF_PACK
};
