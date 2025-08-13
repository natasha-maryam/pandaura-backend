-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user'
);

-- Tags table
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  data_type VARCHAR(50),
  address VARCHAR(100),
  default_value TEXT,
  vendor VARCHAR(50),
  scope VARCHAR(50),
  UNIQUE (project_id, name)
);
