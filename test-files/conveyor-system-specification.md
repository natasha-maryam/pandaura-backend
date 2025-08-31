# Conveyor System Technical Specification

**Project:** Industrial Conveyor Control System  
**Client:** Manufacturing Solutions Inc.  
**Date:** August 31, 2025  
**Document Version:** 1.0  
**Engineer:** Pandaura AS  

## 1. System Overview

This document specifies the technical requirements for an automated conveyor system with safety interlocks and motor control. The system shall provide reliable material transport with comprehensive safety features.

### 1.1 Scope
- Motor control and monitoring
- Safety system integration
- Emergency stop functionality
- Fault detection and recovery
- HMI interface requirements

## 2. Hardware Specifications

### 2.1 Motor Requirements
- **Type:** 3-phase AC induction motor
- **Power:** 5 HP (3.7 kW)
- **Voltage:** 480V AC, 60Hz
- **Speed:** 1750 RPM
- **Protection:** IP65 rated enclosure

### 2.2 Control Hardware
- **PLC:** Rockwell ControlLogix L71 or Siemens S7-1500
- **I/O Count:** Minimum 16 digital inputs, 8 digital outputs
- **Communication:** Ethernet/IP or PROFINET
- **Safety Rating:** SIL 2 compliant

### 2.3 Safety Components
- **Emergency Stop:** Category 3, dual-channel
- **Safety Gates:** Light curtains with muting
- **Motor Disconnect:** Lockable switch
- **Fault Indicators:** Red/Green tower lights

## 3. Control Logic Requirements

### 3.1 Operating Modes
1. **Manual Mode:** Individual motor control via HMI
2. **Automatic Mode:** Sequence-based operation
3. **Maintenance Mode:** Reduced speed operation

### 3.2 Safety Interlocks
- Emergency stop must immediately halt all motion
- Safety gates must be closed before motor start
- Motor overload protection with auto-reset
- Loss of feedback signal triggers fault state

### 3.3 Fault Handling
- **Motor Fault:** Display fault code, require manual reset
- **Safety Fault:** Require key reset and safety check
- **Communication Fault:** Switch to safe state, alarm indication

## 4. I/O Assignment

### 4.1 Digital Inputs
| Address | Tag Name | Description | Type |
|---------|----------|-------------|------|
| I:0/0 | StartButton | Conveyor start pushbutton | BOOL |
| I:0/1 | StopButton | Conveyor stop pushbutton | BOOL |
| I:0/2 | EmergencyStop | Emergency stop circuit | BOOL |
| I:0/3 | MotorContactorFB | Motor contactor feedback | BOOL |
| I:0/4 | SafetyGate1 | Safety gate position switch | BOOL |
| I:0/5 | SafetyGate2 | Safety gate position switch | BOOL |
| I:0/6 | MotorOverload | Motor thermal overload | BOOL |
| I:0/7 | MainDisconnect | Main power disconnect status | BOOL |

### 4.2 Digital Outputs
| Address | Tag Name | Description | Type |
|---------|----------|-------------|------|
| O:0/0 | MotorContactor | Motor starter contactor | BOOL |
| O:0/1 | MotorRunLamp | Green run indication | BOOL |
| O:0/2 | MotorFaultLamp | Red fault indication | BOOL |
| O:0/3 | SystemReady | System ready indicator | BOOL |
| O:0/4 | SafetyAlarm | Safety system alarm | BOOL |

### 4.3 Analog Signals
| Address | Tag Name | Description | Range | Units |
|---------|----------|-------------|-------|-------|
| AI:0 | SpeedSetpoint | Motor speed reference | 0-100 | % |
| AI:1 | MotorCurrent | Motor current feedback | 0-20 | Amps |
| AI:2 | VibrationLevel | Motor vibration sensor | 0-10 | mm/s |

## 5. Sequence of Operations

### 5.1 Startup Sequence
1. Verify all safety conditions
2. Check motor contactor feedback (OFF)
3. Enable start button
4. On start command:
   - Energize motor contactor
   - Wait 2 seconds for contactor feedback
   - If feedback confirmed, set running status
   - If no feedback, trigger fault

### 5.2 Normal Operation
- Monitor all safety inputs continuously
- Display current motor status on HMI
- Log operational hours for maintenance
- Monitor motor current for overload

### 5.3 Shutdown Sequence
1. De-energize motor contactor
2. Wait for motor feedback (OFF)
3. Reset all status indicators
4. Log shutdown event

## 6. Safety Requirements

### 6.1 Emergency Stop
- **Response Time:** < 500ms
- **Coverage:** All hazardous motion
- **Reset:** Manual key reset required
- **Testing:** Monthly functional test

### 6.2 Risk Assessment
- **Risk Level:** Medium (Category 2)
- **Safety Functions:** Stop function SIL 2
- **Fault Tolerance:** Single fault tolerant
- **Diagnostics:** Continuous monitoring

## 7. Testing and Commissioning

### 7.1 Factory Acceptance Test (FAT)
- [ ] All I/O points verified
- [ ] Safety systems tested
- [ ] Emergency stop function verified
- [ ] Motor control sequence tested
- [ ] HMI functionality verified

### 7.2 Site Acceptance Test (SAT)
- [ ] Installation inspection
- [ ] Electrical connections verified
- [ ] Safety system integration
- [ ] Performance testing
- [ ] Operator training completed

## 8. Maintenance Requirements

### 8.1 Preventive Maintenance
- **Daily:** Visual inspection of motor and connections
- **Weekly:** Safety system functional test
- **Monthly:** Motor current and vibration readings
- **Quarterly:** Contactor contact inspection
- **Annually:** Complete safety system validation

### 8.2 Spare Parts
- Motor contactor (1 spare)
- Emergency stop buttons (2 spare)
- Control fuses (assorted)
- HMI display unit (1 spare)

## 9. Documentation Deliverables

### 9.1 Design Documents
- P&ID drawings
- Electrical schematics
- PLC program backup
- HMI application files
- As-built documentation

### 9.2 Operating Procedures
- Startup/shutdown procedures
- Emergency response procedures
- Maintenance procedures
- Troubleshooting guide

## 10. Appendices

### Appendix A: Vendor Information
- Motor: WEG W22 Series
- PLC: Allen-Bradley ControlLogix
- Safety Components: Pilz PNOZ Series
- HMI: Rockwell PanelView Plus

### Appendix B: Standards Compliance
- NFPA 79: Electrical Standard for Industrial Machinery
- ISO 13849: Safety of Machinery
- IEC 61508: Functional Safety
- OSHA 29 CFR 1910.147: Lockout/Tagout

---

**Document Approval:**

Engineering Manager: _________________ Date: _______

Safety Manager: _________________ Date: _______

Project Manager: _________________ Date: _______

**End of Document**
