// Conveyor Motor Control - Structured Text
// Author: Pandaura Engineering
// Date: 2025-08-31
// Description: Main conveyor motor control with safety interlocks

PROGRAM ConveyorControl
VAR
    // Input variables
    bStartButton        : BOOL;     // Start pushbutton
    bStopButton         : BOOL;     // Stop pushbutton  
    bEmergencyStop      : BOOL;     // Emergency stop input
    rSpeedSetpoint      : REAL;     // Speed setpoint 0-100%
    bMotorContactorFB   : BOOL;     // Motor contactor feedback
    
    // Output variables
    bMotorContactor     : BOOL;     // Motor contactor output
    bMotorFaultLamp     : BOOL;     // Fault indication lamp
    bMotorRunLamp       : BOOL;     // Running indication lamp
    
    // Internal variables
    fbStartupTimer      : TON;      // Startup delay timer
    fbFaultTimer        : TOF;      // Fault reset timer
    bMotorRunning       : BOOL;     // Internal running state
    bMotorFault         : BOOL;     // Internal fault state
    iMotorState         : INT;      // Motor state machine
END_VAR

// Main control logic
CASE iMotorState OF
    0: // Stopped state
        bMotorRunning := FALSE;
        bMotorContactor := FALSE;
        bMotorRunLamp := FALSE;
        
        IF bStartButton AND NOT bStopButton AND NOT bEmergencyStop AND NOT bMotorFault THEN
            iMotorState := 1; // Go to starting
        END_IF;
        
    1: // Starting state
        fbStartupTimer(IN := TRUE, PT := T#2S);
        IF fbStartupTimer.Q THEN
            IF bMotorContactorFB THEN
                iMotorState := 2; // Go to running
                bMotorRunning := TRUE;
            ELSE
                iMotorState := 3; // Go to fault
                bMotorFault := TRUE;
            END_IF;
        END_IF;
        
        IF bStopButton OR bEmergencyStop THEN
            iMotorState := 0; // Go to stopped
            fbStartupTimer(IN := FALSE);
        END_IF;
        
    2: // Running state
        bMotorContactor := TRUE;
        bMotorRunLamp := TRUE;
        bMotorRunning := TRUE;
        
        IF bStopButton OR bEmergencyStop OR bMotorFault THEN
            iMotorState := 0; // Go to stopped
        END_IF;
        
        // Check for motor feedback loss
        IF NOT bMotorContactorFB THEN
            iMotorState := 3; // Go to fault
            bMotorFault := TRUE;
        END_IF;
        
    3: // Fault state
        bMotorContactor := FALSE;
        bMotorRunning := FALSE;
        bMotorFaultLamp := TRUE;
        bMotorRunLamp := FALSE;
        
        // Auto-reset fault after 5 seconds if conditions are OK
        fbFaultTimer(IN := NOT bEmergencyStop, PT := T#5S);
        IF fbFaultTimer.Q THEN
            bMotorFault := FALSE;
            bMotorFaultLamp := FALSE;
            iMotorState := 0; // Go to stopped
        END_IF;
        
        IF bEmergencyStop THEN
            fbFaultTimer(IN := FALSE);
        END_IF;
END_CASE;

// Emergency stop overrides everything
IF bEmergencyStop THEN
    bMotorContactor := FALSE;
    bMotorRunning := FALSE;
    bMotorRunLamp := FALSE;
    bMotorFault := TRUE;
    bMotorFaultLamp := TRUE;
    iMotorState := 3;
END_IF;

END_PROGRAM

// Function Block for reusable motor control
FUNCTION_BLOCK FB_StandardMotor
VAR_INPUT
    bStart      : BOOL;     // Start command
    bStop       : BOOL;     // Stop command
    bEStop      : BOOL;     // Emergency stop
    rSpeed      : REAL;     // Speed setpoint
END_VAR

VAR_OUTPUT
    bRunning    : BOOL;     // Running status
    bFault      : BOOL;     // Fault status
    bReady      : BOOL;     // Ready for operation
END_VAR

VAR
    fbTimer     : TON;      // Internal timer
    iState      : INT;      // State machine
END_VAR

// Safety first - emergency stop
IF bEStop THEN
    bRunning := FALSE;
    bFault := TRUE;
    bReady := FALSE;
    iState := 0;
    RETURN;
END_IF;

// State machine logic
CASE iState OF
    0: // Reset state
        bRunning := FALSE;
        bFault := FALSE;
        bReady := TRUE;
        IF bStart AND NOT bStop THEN
            iState := 1;
        END_IF;
        
    1: // Starting
        fbTimer(IN := TRUE, PT := T#1S);
        IF fbTimer.Q THEN
            bRunning := TRUE;
            iState := 2;
        END_IF;
        IF bStop THEN
            iState := 0;
            fbTimer(IN := FALSE);
        END_IF;
        
    2: // Running
        bRunning := TRUE;
        IF bStop THEN
            iState := 0;
        END_IF;
END_CASE;

END_FUNCTION_BLOCK
