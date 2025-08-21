// This file contains TypeScript interfaces for tags table
// Table creation is handled by Knex migrations

export interface Tag {
  id: number;
  project_id: number;
  name: string;
  type?: string;
  data_type?: string;
  address?: string;
  default_value?: string;
  vendor?: string;
  scope?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTagData {
  project_id: number;
  user_id?: string;
  name: string;
  description?: string;
  type?: string;
  data_type?: string;
  address?: string;
  default_value?: string;
  vendor?: string;
  scope?: string;
  tag_type?: string;
  is_ai_generated?: boolean;
}

export interface UpdateTagData {
  name?: string;
  type?: string;
  data_type?: string;
  address?: string;
  default_value?: string;
  vendor?: string;
  scope?: string;
}
