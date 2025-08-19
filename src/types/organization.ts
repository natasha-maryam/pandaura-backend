export interface Organization {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  size?: string;
  country?: string;
  website?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganizationData {
  id?: string;
  name: string;
  description?: string;
  industry?: string;
  size?: string;
  country?: string;
  website?: string;
  created_by: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  invited_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Invite {
  id: string;
  email: string;
  organization_id: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  invited_by: string;
  token: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}
