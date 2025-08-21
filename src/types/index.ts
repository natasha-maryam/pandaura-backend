import { Request } from 'express';

export interface ProjectAuthRequest extends Request {
  project?: {
    id: number;
    user_id: string;
  };
  user?: {
    userId: string;
    email: string;
  };
}

export interface Tag {
  id: string;
  project_id: number;
  user_id: string;
  name: string;
  description: string;
  type: string; // Allow any string to support custom Beckhoff types
  data_type: string;
  address: string;
  default_value: string;
  vendor: 'rockwell' | 'siemens' | 'beckhoff';
  scope: 'global' | 'local' | 'input' | 'output';
  tag_type: 'input' | 'output' | 'memory' | 'temp' | 'constant';
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTagData {
  project_id: number;
  user_id: string;
  name: string;
  description: string;
  type: string; // Allow any string to support custom Beckhoff types
  data_type: string;
  address: string;
  default_value: string;
  vendor: 'rockwell' | 'siemens' | 'beckhoff';
  scope: 'global' | 'local' | 'input' | 'output';
  tag_type: 'input' | 'output' | 'memory' | 'temp' | 'constant';
  is_ai_generated?: boolean;
}
