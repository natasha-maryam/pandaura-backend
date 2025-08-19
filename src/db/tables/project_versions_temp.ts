// This file contains TypeScript interfaces for project versions table
// Table creation is handled by Knex migrations

export interface ProjectVersion {
  id: number;
  project_id: number;
  user_id: string;
  version_number: number;
  data: any; // Full project snapshot including metadata and state
  created_at: string;
  message?: string;
  is_auto?: boolean;
}

export interface ProjectVersionSnapshot {
  projectMetadata: {
    id: number;
    project_name: string;
    client_name?: string;
    project_type?: string;
    description?: string;
    target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
    metadata?: any;
  };
  autosaveState?: any;
  moduleStates?: {
    [moduleName: string]: any;
  };
  timestamp: number;
  version_info: {
    created_by: string;
    created_at: string;
    message?: string;
  };
}
