export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  org_name?: string;
  industry?: string;
  role?: string;
  totp_secret?: string;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  id?: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  org_name?: string;
  industry?: string;
  role?: string;
}

export interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  name?: string;
  org_name?: string;
  industry?: string;
  role?: string;
  totp_secret?: string;
  totp_enabled?: boolean;
}
