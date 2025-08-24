// This file contains TypeScript interfaces for logic_studio table
// Table creation is handled by Knex migrations

export interface LogicStudio {
  id: number;
  project_id: number;
  user_id: string;
  code: string;
  ai_prompt?: string;
  version_id?: number;
  ui_state?: any; // JSON object for UI preferences
  created_at: string;
  updated_at: string;
}

export interface CreateLogicStudioData {
  project_id: number;
  user_id: string;
  code?: string;
  ai_prompt?: string;
  version_id?: number;
  ui_state?: any;
}

export interface UpdateLogicStudioData {
  code?: string;
  ai_prompt?: string;
  version_id?: number;
  ui_state?: any;
}
