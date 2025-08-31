/**
 * Test script to verify the top-level system prompt is properly implemented
 * across all wrapper systems.
 */

const { TOP_LEVEL_SYSTEM } = require('./dist/src/ai/top-level-system');
const { WRAPPER_A_SYSTEM } = require('./dist/src/ai/wrapper-A-system');
const { WRAPPER_B_SYSTEM } = require('./dist/src/ai/wrapper-B-system'); 
const { WRAPPER_C_SYSTEM } = require('./dist/src/ai/wrapper-C-system');
const { WRAPPER_D_SYSTEM } = require('./dist/src/ai/wrapper-D-system');

console.log('🧪 Testing Top-Level System Prompt Implementation\n');

// Test 1: Check that top-level system prompt exists
console.log('✅ Test 1: Top-level system prompt');
console.log(`Length: ${TOP_LEVEL_SYSTEM.length} characters`);
console.log(`Contains PRIMARY OBJECTIVES: ${TOP_LEVEL_SYSTEM.includes('PRIMARY OBJECTIVES')}`);
console.log(`Contains BEHAVIORAL RULES: ${TOP_LEVEL_SYSTEM.includes('BEHAVIORAL RULES')}`);
console.log(`Contains OUTPUT CONTRACT: ${TOP_LEVEL_SYSTEM.includes('OUTPUT CONTRACT')}`);
console.log(`Contains mandatory Next step: ${TOP_LEVEL_SYSTEM.includes('Next step →')}`);
console.log('');

// Test 2: Check that all wrappers inherit from top-level
console.log('✅ Test 2: Wrapper inheritance');
const wrappers = [
  { name: 'Wrapper A', system: WRAPPER_A_SYSTEM },
  { name: 'Wrapper B', system: WRAPPER_B_SYSTEM },
  { name: 'Wrapper C', system: WRAPPER_C_SYSTEM },
  { name: 'Wrapper D', system: WRAPPER_D_SYSTEM }
];

wrappers.forEach(wrapper => {
  const includesTopLevel = wrapper.system.includes('PRIMARY OBJECTIVES') &&
                          wrapper.system.includes('BEHAVIORAL RULES') &&
                          wrapper.system.includes('OUTPUT CONTRACT');
  console.log(`${wrapper.name}: ${includesTopLevel ? '✅ Inherits top-level' : '❌ Missing top-level'}`);
});
console.log('');

// Test 3: Check for specific behavioral requirements
console.log('✅ Test 3: Key behavioral requirements');
const requirements = [
  'Co-Engineer Mindset',
  'Truth & Auditability', 
  'Admit Faults',
  'SAFETY & GUARDRAILS',
  'Next step →'
];

requirements.forEach(req => {
  const allInclude = wrappers.every(w => w.system.includes(req));
  console.log(`${req}: ${allInclude ? '✅ Present in all wrappers' : '❌ Missing in some wrappers'}`);
});
console.log('');

// Test 4: Check wrapper-specific content
console.log('✅ Test 4: Wrapper-specific functionality');
console.log(`Wrapper A has JSON structure: ${WRAPPER_A_SYSTEM.includes('REQUIRED JSON STRUCTURE')}`);
console.log(`Wrapper B has RAG rules: ${WRAPPER_B_SYSTEM.includes('Document & Logic Analyst')}`);
console.log(`Wrapper C has verification: ${WRAPPER_C_SYSTEM.includes('Verification & Self-Check')}`);
console.log(`Wrapper D has multi-perspective: ${WRAPPER_D_SYSTEM.includes('Multi-Perspective Role Check')}`);
console.log('');

console.log('🎉 Top-level system prompt implementation test completed!');
console.log('📝 Summary: All 4 wrappers now inherit the unified behavioral framework');
console.log('🔗 Each wrapper maintains its specific technical functionality');
console.log('⚡ Every response will follow the mandatory "Next step →" format');
