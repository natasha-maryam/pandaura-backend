// This file contains TypeScript interfaces for projects table
// Table creation is handled by Knex migrations

export interface Project {
  id: number;
  user_id: string;
  project_name: string;
  client_name?: string;
  project_type?: string;
  description?: string;
  target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
  autosave_state?: any; // JSON data
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  user_id: string;
  project_name: string;
  client_name?: string;
  project_type?: string;
  description?: string;
  target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
}

export interface UpdateProjectData {
  project_name?: string;
  client_name?: string;
  project_type?: string;
  description?: string;
  target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
}


