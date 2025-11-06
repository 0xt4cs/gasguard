# API Documentation

Complete REST API reference for GasGuard IoT Gas Leak Detection System.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Authentication](#authentication-endpoints)
  - [Dashboard](#dashboard-endpoints)
  - [History](#history-endpoints)
  - [Alerts](#alerts-endpoints)
  - [Contacts](#contacts-endpoints)
  - [Settings](#settings-endpoints)
  - [Calibration](#calibration-endpoints)
  - [System Logs](#system-logs-endpoints)
  - [Data Retention](#data-retention-endpoints)
- [WebSocket Events](#websocket-events)

---

## Overview

**Base URL**: `http://raspberrypi.local:3000/api`

**Protocol**: HTTP/1.1

**Data Format**: JSON

**Authentication**: JWT Bearer Token

---

## Authentication

All endpoints except `/api/auth/login` require authentication.

### Authentication Header

```http
Authorization: Bearer <JWT_TOKEN>
```

### Obtaining Token

See [Authentication Endpoints](#authentication-endpoints) → Login

### Token Expiration

Default: 7 days (configurable via `JWT_EXPIRES_IN` environment variable)

When token expires, client receives `403 Forbidden` and must re-authenticate.

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation completed successfully"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid request parameters |
| `401` | Unauthorized | Authentication required |
| `403` | Forbidden | Invalid/expired token or insufficient permissions |
| `404` | Not Found | Resource not found |
| `500` | Internal Server Error | Server error occurred |

### Common Error Responses

**Unauthorized (401)**
```json
{
  "error": "Access token required"
}
```

**Forbidden (403)**
```json
{
  "error": "Invalid or expired token"
}
```

**Not Found (404)**
```json
{
  "error": "Resource not found"
}
```

---

## Endpoints

### Authentication Endpoints

#### Login

Authenticate user and receive JWT token.

**Endpoint**: `POST /api/auth/login`

**Authentication**: None required

**Request Body**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**Error Response** (401):
```json
{
  "error": "Invalid credentials"
}
```

#### Change Password

Update user password.

**Endpoint**: `PUT /api/auth/password`

**Authentication**: Required

**Request Body**:
```json
{
  "currentPassword": "admin123",
  "newPassword": "new_secure_password"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

---

### Dashboard Endpoints

#### Get Current Sensor Data

Retrieve latest sensor readings and system status.

**Endpoint**: `GET /api/dashboard/current`

**Authentication**: Required

**Response** (200):
```json
{
  "success": true,
  "data": {
    "mq6": {
      "raw": 234,
      "ppm": 45,
      "timestamp": "2025-11-07T10:30:00.000Z"
    },
    "mq2": {
      "raw": 198,
      "ppm": 38,
      "timestamp": "2025-11-07T10:30:00.000Z"
    },
    "gps": {
      "latitude": 14.5995,
      "longitude": 120.9842,
      "accuracy": 5.2,
      "address": "Manila, Philippines",
      "timestamp": "2025-11-07T10:30:00.000Z"
    },
    "alertLevel": "normal",
    "systemOnline": true
  }
}
```

#### Get System Status

Retrieve system health and component status.

**Endpoint**: `GET /api/dashboard/status`

**Authentication**: Required

**Response** (200):
```json
{
  "success": true,
  "status": {
    "online": true,
    "uptime": 86400,
    "lastUpdate": "2025-11-07T10:30:00.000Z",
    "components": {
      "mcp3008": "ok",
      "gps": "ok",
      "leds": "ok",
      "buzzer": "ok",
      "sensors": "ok"
    },
    "errors": []
  }
}
```

---

### History Endpoints

#### Get Historical Data

Retrieve sensor readings history with pagination.

**Endpoint**: `GET /api/history`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional, default: 100): Number of records
- `offset` (optional, default: 0): Skip records
- `startDate` (optional): Filter from date (ISO 8601)
- `endDate` (optional): Filter to date (ISO 8601)

**Example Request**:
```http
GET /api/history?limit=50&offset=0&startDate=2025-11-01T00:00:00Z
```

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": 1234,
      "mq6_raw": 234,
      "mq6_ppm": 45,
      "mq2_raw": 198,
      "mq2_ppm": 38,
      "alert_level": "normal",
      "latitude": 14.5995,
      "longitude": 120.9842,
      "address": "Manila, Philippines",
      "timestamp": "2025-11-07T10:30:00.000Z"
    },
    // ... more records
  ],
  "pagination": {
    "total": 5000,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Export Historical Data

Export data as JSON file.

**Endpoint**: `GET /api/history/export`

**Authentication**: Required

**Query Parameters**:
- `startDate` (optional): From date
- `endDate` (optional): To date
- `format` (optional, default: json): Export format

**Response** (200):
```json
{
  "success": true,
  "data": [ /* all sensor readings */ ],
  "exportDate": "2025-11-07T10:30:00.000Z",
  "recordCount": 5000
}
```

---

### Alerts Endpoints

#### Get Alert History

Retrieve all alerts with optional filtering.

**Endpoint**: `GET /api/alerts`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional, default: 100)
- `offset` (optional, default: 0)
- `level` (optional): Filter by level (low, critical)
- `resolved` (optional, boolean): Filter by resolution status

**Response** (200):
```json
{
  "success": true,
  "alerts": [
    {
      "id": 42,
      "level": "critical",
      "mq6_ppm": 350,
      "mq2_ppm": 320,
      "message": "CRITICAL: High gas levels detected!",
      "latitude": 14.5995,
      "longitude": 120.9842,
      "address": "Manila, Philippines",
      "sms_sent": true,
      "contacts_notified": 5,
      "resolved": false,
      "created_at": "2025-11-07T10:25:00.000Z",
      "resolved_at": null
    }
  ],
  "total": 42
}
```

#### Send Test Alert

Trigger a test alert (for testing notification system).

**Endpoint**: `POST /api/alerts/test`

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "level": "low",
  "testMessage": "This is a test alert"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Test alert sent successfully",
  "details": {
    "smsCount": 3,
    "recipients": ["+639171234567", "+639189876543"]
  }
}
```

#### Resolve Alert

Mark an alert as resolved.

**Endpoint**: `PUT /api/alerts/:id/resolve`

**Authentication**: Required

**Response** (200):
```json
{
  "success": true,
  "message": "Alert resolved successfully"
}
```

#### Delete Alert

Remove an alert from history.

**Endpoint**: `DELETE /api/alerts/:id`

**Authentication**: Required (Admin only)

**Response** (200):
```json
{
  "success": true,
  "message": "Alert deleted successfully"
}
```

---

### Contacts Endpoints

#### Get All Contacts

Retrieve all internal and external contacts.

**Endpoint**: `GET /api/contacts`

**Authentication**: Required

**Response** (200):
```json
{
  "success": true,
  "contacts": {
    "internal": [
      {
        "id": 1,
        "name": "John Doe",
        "phone": "+639171234567",
        "alternate_phone": "+639189876543",
        "created_at": "2025-11-01T00:00:00.000Z"
      }
    ],
    "external": [
      {
        "id": 1,
        "name": "Fire Department - Manila",
        "phone": "+6328123456",
        "type": "FIRE_DEPT",
        "created_at": "2025-11-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### Create Internal Contact

Add a nearby responder contact.

**Endpoint**: `POST /api/contacts/internal`

**Authentication**: Required

**Request Body**:
```json
{
  "name": "Jane Smith",
  "phone": "+639171234567",
  "alternatePhone": "+639189876543"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Contact created successfully",
  "contact": {
    "id": 2,
    "name": "Jane Smith",
    "phone": "+639171234567",
    "alternate_phone": "+639189876543"
  }
}
```

#### Update Internal Contact

Modify an existing internal contact.

**Endpoint**: `PUT /api/contacts/internal/:id`

**Authentication**: Required

**Request Body**:
```json
{
  "name": "Jane Smith Updated",
  "phone": "+639171111111"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Contact updated successfully"
}
```

#### Delete Internal Contact

Remove an internal contact.

**Endpoint**: `DELETE /api/contacts/internal/:id`

**Authentication**: Required

**Response** (200):
```json
{
  "success": true,
  "message": "Contact deleted successfully"
}
```

#### Create External Contact

Add external emergency service contact.

**Endpoint**: `POST /api/contacts/external`

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "name": "Fire Station 23",
  "phone": "+6328765432",
  "type": "FIRE_DEPT"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "External contact created successfully"
}
```

---

### Settings Endpoints

#### Get All Settings

Retrieve system settings for current user.

**Endpoint**: `GET /api/settings`

**Authentication**: Required

**Response** (200):
```json
{
  "success": true,
  "settings": {
    "sms_alerts_enabled": true,
    "textbee_api_key": "sk_live_abc123...",
    "textbee_device_id": "device_xyz789",
    "alert_threshold_low": 100,
    "alert_threshold_critical": 300,
    "data_retention_days": 90,
    "buzzer_enabled": true,
    "auto_resolve_alerts": false
  }
}
```

#### Update Settings

Modify system settings.

**Endpoint**: `PUT /api/settings`

**Authentication**: Required (Admin only)

**Request Body** (partial updates allowed):
```json
{
  "alert_threshold_low": 150,
  "alert_threshold_critical": 350,
  "buzzer_enabled": true
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Settings updated successfully"
}
```

#### Update SMS Configuration

Configure TextBee SMS service.

**Endpoint**: `PUT /api/settings/sms`

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "enabled": true,
  "apiKey": "sk_live_abc123...",
  "deviceId": "device_xyz789"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "SMS configuration updated successfully"
}
```

#### Test SMS Configuration

Send test SMS to verify configuration.

**Endpoint**: `POST /api/settings/sms/test`

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "phoneNumber": "+639171234567"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Test SMS sent successfully"
}
```

---

### Calibration Endpoints

#### Calibrate MQ-2 Sensor

Start calibration process for MQ-2 sensor.

**Endpoint**: `POST /api/calibration/mq2`

**Authentication**: Required (Admin only)

**Request Body**: None required

**Response** (200):
```json
{
  "success": true,
  "message": "MQ-2 calibration started",
  "calibration": {
    "id": 15,
    "sensor": "MQ-2",
    "baseline_raw": 198,
    "calibration_factor": 1.0,
    "timestamp": "2025-11-07T10:30:00.000Z"
  }
}
```

#### Calibrate MQ-6 Sensor

Start calibration process for MQ-6 sensor.

**Endpoint**: `POST /api/calibration/mq6`

**Authentication**: Required (Admin only)

**Response** (200):
```json
{
  "success": true,
  "message": "MQ-6 calibration started",
  "calibration": {
    "id": 16,
    "sensor": "MQ-6",
    "baseline_raw": 234,
    "calibration_factor": 1.0,
    "timestamp": "2025-11-07T10:30:00.000Z"
  }
}
```

#### Get Calibration History

Retrieve past calibrations.

**Endpoint**: `GET /api/calibration/history`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional, default: 50)
- `sensor` (optional): Filter by sensor (MQ-2, MQ-6)

**Response** (200):
```json
{
  "success": true,
  "calibrations": [
    {
      "id": 16,
      "sensor": "MQ-6",
      "baseline_raw": 234,
      "calibration_factor": 1.0,
      "performed_by": "admin",
      "created_at": "2025-11-07T10:30:00.000Z"
    }
  ]
}
```

---

### System Logs Endpoints

#### Get System Logs

Retrieve application logs.

**Endpoint**: `GET /api/logs`

**Authentication**: Required (Admin only)

**Query Parameters**:
- `limit` (optional, default: 100)
- `offset` (optional, default: 0)
- `level` (optional): Filter by level (info, warn, error)
- `category` (optional): Filter by category (system, sensor, sms, etc.)

**Response** (200):
```json
{
  "success": true,
  "logs": [
    {
      "id": 1234,
      "level": "info",
      "category": "system",
      "message": "GasGuard system starting up",
      "details": {
        "source": "server.initialize",
        "data": { "mode": "production" }
      },
      "timestamp": "2025-11-07T08:00:00.000Z"
    }
  ],
  "total": 5000
}
```

#### Clear Old Logs

Delete logs older than specified days.

**Endpoint**: `DELETE /api/logs/cleanup`

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "daysToKeep": 30
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Deleted 1234 log entries",
  "deletedCount": 1234
}
```

---

### Data Retention Endpoints

#### Get Retention Settings

Retrieve data retention configuration.

**Endpoint**: `GET /api/retention/settings`

**Authentication**: Required (Admin only)

**Response** (200):
```json
{
  "success": true,
  "settings": {
    "retentionDays": 90,
    "warningDays": 14,
    "autoCleanup": true,
    "lastCleanup": "2025-11-06T02:00:00.000Z"
  }
}
```

#### Update Retention Settings

Modify retention policy.

**Endpoint**: `PUT /api/retention/settings`

**Authentication**: Required (Admin only)

**Request Body**:
```json
{
  "retentionDays": 60,
  "warningDays": 7
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Retention settings updated successfully"
}
```

#### Manual Cleanup

Trigger immediate data cleanup.

**Endpoint**: `POST /api/retention/cleanup`

**Authentication**: Required (Admin only)

**Response** (200):
```json
{
  "success": true,
  "message": "Cleanup completed",
  "details": {
    "sensorRecordsDeleted": 5000,
    "logsDeleted": 2000
  }
}
```

---

## WebSocket Events

GasGuard uses Socket.IO for real-time updates.

### Connection

```javascript
const socket = io('http://raspberrypi.local:3000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});
```

### Client → Server Events

#### Authenticate
```javascript
socket.emit('authenticate', {
  token: 'YOUR_JWT_TOKEN'
});
```

#### Simulate Alert (Development Only)
```javascript
socket.emit('simulateAlert', {
  level: 'critical' // or 'low', 'normal'
});
```

### Server → Client Events

#### Sensor Data Update
```javascript
socket.on('sensorData', (data) => {
  console.log(data);
  /*
  {
    mq6: { raw: 234, ppm: 45, timestamp: '...' },
    mq2: { raw: 198, ppm: 38, timestamp: '...' },
    alertLevel: 'normal'
  }
  */
});
```

#### GPS Update
```javascript
socket.on('gpsUpdate', (data) => {
  console.log(data);
  /*
  {
    latitude: 14.5995,
    longitude: 120.9842,
    accuracy: 5.2,
    address: 'Manila, Philippines',
    timestamp: '...'
  }
  */
});
```

#### Alert Triggered
```javascript
socket.on('alert', (data) => {
  console.log(data);
  /*
  {
    level: 'critical',
    message: 'CRITICAL: High gas levels detected!',
    mq6_ppm: 350,
    mq2_ppm: 320,
    timestamp: '...'
  }
  */
});
```

#### System Status Change
```javascript
socket.on('systemStatus', (data) => {
  console.log(data);
  /*
  {
    online: true,
    lastUpdate: '...',
    components: { ... }
  }
  */
});
```

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Authentication endpoints**: 5 requests per 15 minutes per IP
- **General endpoints**: 100 requests per 15 minutes per user
- **Data export**: 10 requests per hour

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699347600
```

---

## Examples

### Complete Authentication Flow

```javascript
// 1. Login
const loginResponse = await fetch('http://raspberrypi.local:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});

const { token } = await loginResponse.json();

// 2. Use token for authenticated requests
const dashboardResponse = await fetch('http://raspberrypi.local:3000/api/dashboard/current', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const data = await dashboardResponse.json();
console.log(data);
```

### WebSocket Real-Time Monitoring

```javascript
const socket = io('http://raspberrypi.local:3000', {
  auth: { token: localStorage.getItem('token') }
});

socket.on('connect', () => {
  console.log('Connected to GasGuard');
});

socket.on('sensorData', (data) => {
  updateDashboard(data);
});

socket.on('alert', (alert) => {
  showAlertNotification(alert);
});
```

---

**For more information, see the main [README](../README.md)**
