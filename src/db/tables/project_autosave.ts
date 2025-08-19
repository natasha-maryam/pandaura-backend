// This file contains TypeScript interfaces for project autosave table
// Table creation is handled by Knex migrations

export interface ProjectAutosave {
  id: number;
  project_id: number;
  user_id: string;
  state: any;
  created_at: string;
  updated_at: string;
}
