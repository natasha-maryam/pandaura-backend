import { VendorProfile } from './vendor-profiles';
import { SPEC_CONTRACT_SYSTEM, SPEC_CONTRACT_USER } from './prompts';
import OpenAI from 'openai';
import { getAIConfig } from '../../config/ai-config';

// Use the same OpenAI setup as Wrapper B
const config = getAIConfig();
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

const MODEL_NAME = config.openai.model;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class CodeGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeGenError';
  }
}

export interface Contract {
  modes: any[];
  conveyors: any[];
  merge_divert: any;
  palletizer_handshake: any;
  alarms: any[];
  diagnostics: any;
  comms: any;
  redundancy?: any;
  vendor_mapping: {
    siemens: string;
    rockwell: string;
    beckhoff: string;
  };
  instances: any[];
  udts: any[];
  test_cases: any[];
}

export interface Module {
  name: string;
  relpath: string;
  language: string;
  type: string;
  summary: string;
  public_interfaces: any;
  dependencies: string[];
  purpose: string;
}

export interface Plan {
  modules: Module[];
}

export interface FileBundle {
  readme: string;
  project_dir: string;
}

export interface GenerationResult {
  contract: Contract;
  plan: Plan;
  files: Record<string, string>;
  bundle: FileBundle;
}

export class Orchestrator {
  private outDir: string;

  constructor(outDir: string) {
    this.outDir = outDir;
  }

  async generate(params: {
    specText: string;
    vendor: string;
    projectName?: string;
  }): Promise<GenerationResult> {
    const { specText, vendor, projectName = "PandauraProject" } = params;

    // Get vendor profile
    const profile = this.getVendorProfile(vendor);
    if (!profile) {
      throw new CodeGenError(`Unsupported vendor: ${vendor}`);
    }

    // 1) SPEC → CONTRACT (strict JSON)
    const contract = await this.specToContract(specText, profile);

    // 2) CONTRACT → PLAN (files/modules/OBs/AOIs/UDTs, interfaces, tag map)
    const plan = await this.contractToPlan(contract, profile, projectName);

    // 3) PLAN → CODE (generate every file; block "skeletons")
    const files = await this.planToCode(contract, plan, profile);

    // 4) CRITIC & PATCH (iterate until complete or max attempts)
    const finalFiles = await this.criticAndPatch(contract, plan, files, profile);

    // 5) PACKAGING (README, build notes, SCADA map)
    const bundle = await this.pack(projectName, plan, finalFiles, profile);

    return {
      contract,
      plan,
      files: finalFiles,
      bundle
    };
  }

  private getVendorProfile(vendor: string): VendorProfile | null {
    const profiles: Record<string, VendorProfile> = {
      'siemens': require('./vendor-profiles').SIEMENS_PROFILE,
      'rockwell': require('./vendor-profiles').ROCKWELL_PROFILE,
      'beckhoff': require('./vendor-profiles').BECKHOFF_PROFILE,
    };
    return profiles[vendor.toLowerCase()] || null;
  }

  private async specToContract(specText: string, vendorProfile: VendorProfile): Promise<Contract> {
    console.log('📋 Starting SPEC → CONTRACT conversion...');
    const messages: LLMMessage[] = [
      { role: "system", content: SPEC_CONTRACT_SYSTEM },
      { role: "user", content: SPEC_CONTRACT_USER.replace('{spec_text}', specText) }
    ];

    console.log('🤖 Calling LLM for contract generation...');
    console.log('📋 Model:', MODEL_NAME);
    console.log('📋 Messages count:', messages.length);
    
    try {
      const completion = await Promise.race([
        openai.chat.completions.create({
          model: MODEL_NAME,
          messages: messages as any,
          temperature: 0.0,
          max_tokens: 16384,
          response_format: { type: "json_object" }
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('LLM call timeout after 60 seconds')), 60000)
        )
      ]) as any;
      
      console.log('✅ LLM call completed successfully');
      
      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new Error('No response from LLM');
      }
      
      console.log('📄 Contract generation completed, length:', raw.length);
      return this.enforceJSON(raw);
    } catch (error) {
      console.error('❌ LLM call failed:', error);
      throw error;
    }
  }

  private async contractToPlan(
    contract: Contract,
    vendorProfile: VendorProfile,
    projectName: string
  ): Promise<Plan> {
    const messages: LLMMessage[] = [
      { role: "system", content: vendorProfile.systemPrompt },
      { 
        role: "user", 
        content: vendorProfile.filePlanPrompt
          .replace('{project_name}', projectName)
          .replace('{contract_json}', JSON.stringify(contract, null, 2))
      }
    ];

    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 16384,
      response_format: { type: "json_object" }
    });
    
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('No response from LLM');
    }
    
    return this.enforceJSON(raw);
  }

  private async planToCode(
    contract: Contract,
    plan: Plan,
    vendorProfile: VendorProfile
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};

    for (const mod of plan.modules) {
      const messages: LLMMessage[] = [
        { role: "system", content: vendorProfile.systemPrompt },
        {
          role: "user",
          content: vendorProfile.modulePrompt
            .replace('{module_json}', JSON.stringify(mod, null, 2))
            .replace('{contract_json}', JSON.stringify(contract, null, 2))
        }
      ];

      const completion = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: messages as any,
        temperature: 0.2,
        max_tokens: 16384
      });
      
      const code = completion.choices[0]?.message?.content;
      if (!code) {
        throw new Error('No response from LLM');
      }
      
      this.rejectSkeleton(code, mod.name);
      files[mod.relpath] = code;
    }

    return files;
  }

  private async criticAndPatch(
    contract: Contract,
    plan: Plan,
    files: Record<string, string>,
    vendorProfile: VendorProfile
  ): Promise<Record<string, string>> {
    const MAX_ITERS = 3;

    for (let i = 0; i < MAX_ITERS; i++) {
      const criticMessages: LLMMessage[] = [
        { role: "system", content: vendorProfile.systemPrompt },
        {
          role: "user",
          content: vendorProfile.criticPrompt
            .replace('{plan_json}', JSON.stringify(plan, null, 2))
            .replace('{files_json}', JSON.stringify(files, null, 2))
            .replace('{checklist}', vendorProfile.completenessChecklist)
            .replace('{contract_json}', JSON.stringify(contract, null, 2))
        }
      ];

      const completion = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: criticMessages as any,
        temperature: 0.0,
        max_tokens: 16384,
        response_format: { type: "json_object" }
      });
      
      const reviewRaw = completion.choices[0]?.message?.content;
      if (!reviewRaw) {
        throw new Error('No response from LLM');
      }
      
      const review = this.enforceJSON(reviewRaw);

      if (review.status === "complete") {
        return files;
      }

      // Apply patches
      for (const patch of review.patches || []) {
        const path = patch.relpath;
        files[path] = patch.new_content;
        this.rejectSkeleton(files[path], path);
      }
    }

    // Final decisive fail with clear reason
    throw new CodeGenError("Critic could not reach completeness within patch budget.");
  }

  private async pack(
    projectName: string,
    plan: Plan,
    files: Record<string, string>,
    vendorProfile: VendorProfile
  ): Promise<FileBundle> {
    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: vendorProfile.systemPrompt },
        {
          role: "user",
          content: vendorProfile.packPrompt
            .replace('{project_name}', projectName)
            .replace('{plan_json}', JSON.stringify(plan, null, 2))
        }
      ] as any,
      temperature: 0.2,
      max_tokens: 16384
    });
    
    const readme = completion.choices[0]?.message?.content;
    if (!readme) {
      throw new Error('No response from LLM');
    }

    // In a real implementation, you would write files to disk here
    // For now, we'll return the bundle structure
    const projectDir = `${this.outDir}/${projectName}`;

    return {
      readme,
      project_dir: projectDir
    };
  }

  private enforceJSON(s: string): any {
    s = s.trim();
    // Grab first { ... } block to be safe
    const match = s.match(/\{.*\}/s);
    if (match) {
      s = match[0];
    }
    return JSON.parse(s);
  }

  private rejectSkeleton(code: string, name: string): void {
    // Hard guard: forbid empty stubs, TODOs, "skeleton" wording, or missing logic markers.
    const redFlags = [
      /\bTODO\b/i,
      /\bplaceholder\b/i,
      /\bskeleton\b/i,
      /\/\/\s*Manual control logic\s*$/i,
      /\/\/\s*Maintenance routines\s*$/i,
      /IF\s+Ready\s+THEN\s+InPosition\s*:=\s*TRUE;/i, // trivial handshake
    ];

    for (const pattern of redFlags) {
      if (pattern.test(code)) {
        throw new CodeGenError(`Rejected skeletal module '${name}': matched pattern ${pattern}`);
      }
    }

    // Additional SCL syntax validation for Siemens
    if (name.includes('.scl') || code.includes('FUNCTION_BLOCK') || code.includes('ORGANIZATION_BLOCK')) {
      this.validateSCLSyntax(code, name);
    }
  }

  private validateSCLSyntax(code: string, name: string): void {
    const sclErrors: string[] = [];

    // Check for proper VAR block endings
    const varInputBlocks = (code.match(/VAR_INPUT/g) || []).length;
    const varInputEndings = (code.match(/END_VAR/g) || []).length;
    
    if (varInputBlocks > 0 && varInputEndings < varInputBlocks) {
      sclErrors.push('Missing END_VAR for VAR_INPUT blocks');
    }

    // Check for proper function block endings
    if (code.includes('FUNCTION_BLOCK') && !code.includes('END_FUNCTION_BLOCK')) {
      sclErrors.push('Missing END_FUNCTION_BLOCK');
    }

    // Check for proper organization block endings
    if (code.includes('ORGANIZATION_BLOCK') && !code.includes('END_ORGANIZATION_BLOCK')) {
      sclErrors.push('Missing END_ORGANIZATION_BLOCK');
    }

    // Check for common syntax errors
    if (code.includes('VAR_INPUT') && !code.includes('END_VAR')) {
      sclErrors.push('VAR_INPUT block not properly closed with END_VAR');
    }

    if (code.includes('VAR_OUTPUT') && !code.match(/VAR_OUTPUT[\s\S]*?END_VAR/)) {
      sclErrors.push('VAR_OUTPUT block not properly closed with END_VAR');
    }

    // Check for incomplete CASE statements
    if (code.includes('CASE') && !code.includes('END_CASE')) {
      sclErrors.push('CASE statement not properly closed with END_CASE');
    }

    // Check for incomplete IF statements
    const ifCount = (code.match(/\bIF\b/g) || []).length;
    const endIfCount = (code.match(/\bEND_IF\b/g) || []).length;
    if (ifCount > endIfCount) {
      sclErrors.push('IF statements not properly closed with END_IF');
    }

    if (sclErrors.length > 0) {
      throw new CodeGenError(`SCL Syntax errors in '${name}': ${sclErrors.join(', ')}`);
    }
  }
}
