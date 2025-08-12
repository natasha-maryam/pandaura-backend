# Projects API Documentation

## Overview

The Projects API provides comprehensive CRUD operations for managing projects in the Pandaura system. It implements zero-trust authentication, supports auto-save functionality, and maintains strict ownership controls.

## Base URL
```
http://localhost:5000/api/v1/projects
```

## Authentication

All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt-token>
```

## Database Schema

### Projects Table (SQLite)
```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    client_name TEXT,
    project_type TEXT,
    description TEXT,
    target_plc_vendor TEXT CHECK (target_plc_vendor IN ('siemens', 'rockwell', 'beckhoff')),
    autosave_state TEXT, -- JSON as TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## API Endpoints

### 1. Create Project
**POST** `/projects`

Creates a new project. Only allowed from the Home screen (frontend enforcement).

**Request Body:**
```json
{
  "projectName": "My Automation Project",
  "clientName": "ACME Corporation",
  "projectType": "Industrial Automation",
  "description": "Description of the project",
  "targetPLCVendor": "siemens"
}
```

**Validation Rules:**
- `projectName`: Required, non-empty string
- `targetPLCVendor`: Optional, must be one of: "siemens", "rockwell", "beckhoff"

**Response (201):**
```json
{
  "success": true,
  "project": {
    "id": 1,
    "user_id": "user-uuid",
    "project_name": "My Automation Project",
    "client_name": "ACME Corporation",
    "project_type": "Industrial Automation",
    "description": "Description of the project",
    "target_plc_vendor": "siemens",
    "autosave_state": null,
    "created_at": "2025-08-13T10:00:00Z",
    "updated_at": "2025-08-13T10:00:00Z"
  }
}
```

### 2. List Projects
**GET** `/projects`

Retrieves all projects owned by the authenticated user.

**Response (200):**
```json
{
  "success": true,
  "projects": [
    {
      "id": 1,
      "project_name": "My Automation Project",
      "client_name": "ACME Corporation",
      "project_type": "Industrial Automation",
      "description": "Description of the project",
      "target_plc_vendor": "siemens",
      "autosave_state": null,
      "created_at": "2025-08-13T10:00:00Z",
      "updated_at": "2025-08-13T10:00:00Z"
    }
  ]
}
```

### 3. Get Project Details
**GET** `/projects/:projectId`

Retrieves detailed information for a specific project.

**Path Parameters:**
- `projectId`: Integer, the project ID

**Response (200):**
```json
{
  "success": true,
  "project": {
    "id": 1,
    "project_name": "My Automation Project",
    "client_name": "ACME Corporation",
    "project_type": "Industrial Automation",
    "description": "Description of the project",
    "target_plc_vendor": "siemens",
    "autosave_state": {
      "currentStep": "config",
      "progress": 25
    },
    "created_at": "2025-08-13T10:00:00Z",
    "updated_at": "2025-08-13T10:00:00Z"
  }
}
```

### 4. Update Project
**PATCH** `/projects/:projectId`

Updates project metadata. Only the project owner can update.

**Request Body (partial):**
```json
{
  "projectName": "Updated Project Name",
  "clientName": "New Client Name",
  "projectType": "Updated Type",
  "description": "Updated description",
  "targetPLCVendor": "rockwell"
}
```

**Response (200):**
```json
{
  "success": true,
  "project": {
    // Updated project object
  }
}
```

### 5. Auto-Save Project State
**PUT** `/projects/:projectId/autosave`

Silently saves project progress without user prompts. Used for automatic state preservation.

**Request Body:**
```json
{
  "autosaveState": {
    "currentStep": "implementation",
    "progress": 45,
    "tags": ["tag1", "tag2"],
    "lastActivity": "2025-08-13T10:30:00Z",
    "workingDocuments": ["temp-doc1.pdf"],
    "unsavedChanges": true
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Project progress autosaved successfully"
}
```

### 6. Explicit Save Project
**PUT** `/projects/:projectId/save`

Explicitly saves project state when user confirms. Marks the save as intentional.

**Request Body:**
```json
{
  "state": {
    "currentStep": "testing",
    "progress": 75,
    "tags": ["tag1", "tag2", "tag3"],
    "documents": ["final-doc1.pdf", "final-doc2.pdf"],
    "completed": false
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Project saved successfully"
}
```

### 7. Delete Project
**DELETE** `/projects/:projectId`

Permanently deletes a project. Only the owner can delete.

**Response (200):**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

### 8. Check Project Ownership
**GET** `/projects/:projectId/ownership`

Utility endpoint to verify if the current user owns a project.

**Response (200):**
```json
{
  "success": true,
  "isOwner": true
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Project name is required and cannot be empty"
}
```

### 401 Unauthorized
```json
{
  "error": "User not authenticated"
}
```

### 403 Forbidden
```json
{
  "error": "Unauthorized: You do not own this project"
}
```

### 404 Not Found
```json
{
  "error": "Project not found or unauthorized"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create project"
}
```

## Security Features

1. **Zero-Trust Authentication**: Every request requires a valid JWT token
2. **Ownership Validation**: Users can only access/modify their own projects
3. **Input Validation**: All inputs are sanitized and validated
4. **Audit Logging**: All CRUD operations are logged with user details
5. **SQL Injection Protection**: Using prepared statements
6. **Rate Limiting**: Can be implemented at middleware level

## Auto-Save vs Explicit Save

### Auto-Save (`/autosave`)
- **Purpose**: Transparent background saving to prevent data loss
- **Frequency**: Can be called frequently (every few minutes)
- **User Interaction**: No prompts or confirmations
- **Data**: Ephemeral working state, temporary files
- **Performance**: Optimized for minimal disruption

### Explicit Save (`/save`)
- **Purpose**: Intentional save when user wants to persist work
- **Frequency**: User-initiated only
- **User Interaction**: Requires user confirmation
- **Data**: Finalized state, permanent documents
- **Metadata**: Adds `explicitly_saved: true` and timestamp

## Document/Tag Upload Strategy

The API supports the concept of ephemeral vs persistent data:

1. **Default Behavior**: Documents and tags are processed in memory/temp storage
2. **Optional Persistence**: When user explicitly saves, files can be moved to permanent storage
3. **Clear UI Messaging**: Frontend should indicate which files are temporary vs saved
4. **Cleanup**: Temporary files should be cleaned up periodically

## Usage Examples

### Frontend Integration

```javascript
// Create a project
const createProject = async (projectData) => {
  try {
    const response = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(projectData)
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to create project:', error);
  }
};

// Auto-save project state
const autoSaveProject = async (projectId, state) => {
  try {
    await fetch(`/api/v1/projects/${projectId}/autosave`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ autosaveState: state })
    });
  } catch (error) {
    console.error('Auto-save failed:', error);
  }
};

// Explicit save with user confirmation
const saveProject = async (projectId, state) => {
  const confirmed = confirm('Save your project progress?');
  if (confirmed) {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/save`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state })
      });
      return await response.json();
    } catch (error) {
      console.error('Save failed:', error);
    }
  }
};
```

## Testing

Use the provided test script:

```bash
node test-projects-api.js
```

Make sure to set a valid JWT token in the `AUTH_TOKEN` variable before running tests.

## Environment Variables

The API respects these environment variables:

- `DB_PATH`: Path to SQLite database (default: `./pandaura.db`)
- `JWT_SECRET`: Secret for JWT token verification
- `NODE_ENV`: Environment (development/production)

## On-Premises Compatibility

The API is fully compatible with on-premises deployments:
- Uses local SQLite database (no cloud dependencies)
- Self-contained authentication system
- No external API calls required
- Can be deployed behind corporate firewalls
