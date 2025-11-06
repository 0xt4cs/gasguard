# GasGuard - IoT Gas Leak Detection System

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi-red)](https://www.raspberrypi.org/)

> **IoT-based gas leak detection system with real-time monitoring and emergency alert capabilities.**

A capstone project implementing a complete IoT safety system for detecting LPG and combustible gas leaks using Raspberry Pi Zero 2 W, MQ-2/MQ-6 sensors, GPS tracking, and real-time SMS alerts.

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Hardware Components](#hardware-components)
- [System Architecture](#system-architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Overview](#api-overview)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## About

This system was developed as a capstone research project focusing on practical IoT solutions for residential safety. It demonstrates the integration of hardware sensors, real-time communication, web technologies, and emergency alert systems.

The project addresses real-world concerns about gas leak detection in residential areas, providing an affordable and effective monitoring solution using readily available components (estimated cost: ~$50-60 USD or ₱2000-₱3000).

---

## Features

### Real-Time Monitoring
- Dual gas sensor detection (MQ-2 for smoke/LPG, MQ-6 for LPG/butane)
- Live web dashboard with data visualization
- WebSocket-based instant updates
- GPS location tracking (NEO-6M module)
- Historical data logging and export

### Alert System
- Multi-level alerts (Normal: 0-99 PPM, Warning: 100-299 PPM, Critical: 300+ PPM)
- SMS notifications via TextBee
- Visual indicators (RGB LEDs: Green/Yellow/Red)
- Audio alerts (5V active buzzer)
- Automatic emergency contact notification

### System Management
- User authentication (JWT-based)
- Contact management (internal/external)
- Sensor calibration interface
- Data retention management with auto-cleanup
- System logging and monitoring
- Responsive web interface (mobile-friendly)

---

## Hardware Components

| Component | Model | Purpose | Est. Price |
|-----------|-------|---------|-----------|
| Microcontroller | Raspberry Pi Zero 2 W | Main processing unit | $15 |
| Gas Sensor (LPG) | MQ-6 | LPG, isobutane, propane detection | $3 |
| Gas Sensor (Smoke) | MQ-2 | Smoke, LPG, propane detection | $3 |
| GPS Module | NEO-6M | Location tracking | $8 |
| ADC Converter | MCP3008 | Analog-to-digital conversion | $4 |
| Buzzer | 5V Active Buzzer | Audio alerts | $1 |
| LEDs | 5mm RGB LEDs | Visual status indicators | $0.30 |
| Power Supply | 5V 2.5A USB-C | Power source | $8 |

**Total Cost:** ~$50-60 USD

For detailed wiring diagrams and assembly instructions, see [docs/HARDWARE.md](./docs/HARDWARE.md).

---

## System Architecture

```
┌─────────────────────────────────────────┐
│         Web Dashboard (Client)          │
│     HTML/CSS/JS + Socket.IO + Charts    │
└──────────────┬──────────────────────────┘
               │ WebSocket / REST API
┌──────────────▼──────────────────────────┐
│       Node.js Server (Backend)          │
│  Express │ Socket.IO │ Authentication   │
│  Hardware Manager │ Alert Manager       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│    Hardware (Raspberry Pi)              │
│  MQ-2/MQ-6 │ MCP3008 │ GPS │ LEDs       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         SQLite Database                 │
│  Sensor Data │ Alerts │ Logs            │
└─────────────────────────────────────────┘
```

### Technology Stack

**Backend:** Node.js, Express, Socket.IO, SQLite3, JWT authentication  
**Frontend:** Vanilla JavaScript, TailwindCSS, DaisyUI, Chart.js  
**Hardware:** GPIO (onoff), SPI (spi-device), UART (serialport)

---

## Installation

### Prerequisites
- Raspberry Pi Zero 2 W with Raspbian OS
- Node.js 16 or higher
- Hardware components assembled

### Quick Setup

```bash
# Clone repository
git clone https://github.com/0xt4cs/gasguard.git
cd gasguard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Add JWT_SECRET

# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Start server
npm start
```

Access dashboard at: `http://raspberrypi.local:3000`

**Default Login:**
- Username: `admin`
- Password: `admin123`

**Important:** Change the default password immediately after first login.

For detailed installation instructions including Raspberry Pi setup, see [docs/INSTALLATION.md](./docs/INSTALLATION.md).

---

## Configuration

### Environment Variables

Key settings in `.env` file:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-generated-secret-key-here
JWT_EXPIRES_IN=7d
```

### SMS Alerts Configuration

1. Create account at [textbee.dev](https://textbee.dev)
2. Install TextBee app on Android device
3. Get API credentials from dashboard
4. Configure in: Settings → SMS Configuration

### Alert Thresholds

| Level | PPM Range | LED Color | Action |
|-------|-----------|-----------|--------|
| Normal | 0-99 | Green | Monitoring only |
| Warning | 100-299 | Yellow | SMS + Buzzer |
| Critical | 300+ | Red | SMS + Continuous Buzzer |

---

## Usage

### Starting the System

```bash
# Standard start
npm start

# Development mode (auto-reload)
npm run dev
```

### Web Interface Pages

- `/` - Landing page
- `/dashboard` - Real-time monitoring with live charts
- `/history` - Historical data and analytics
- `/contacts` - Emergency contact management
- `/settings` - System configuration (admin only)
- `/admin/calibration` - Sensor calibration tools (admin only)
- `/admin/system-logs` - Application logs (admin only)

---

## API Overview

### Authentication

All API endpoints require JWT token (except login):

```javascript
// Login
POST /api/auth/login
Body: { "username": "admin", "password": "admin123" }

// Authenticated request
GET /api/dashboard/current
Headers: { "Authorization": "Bearer <token>" }
```

### Key Endpoints

**Dashboard:**
- `GET /api/dashboard/current` - Current sensor readings
- `GET /api/dashboard/status` - System status

**Alerts:**
- `GET /api/alerts` - Alert history
- `POST /api/alerts/test` - Send test alert

**Sensors:**
- `POST /api/calibration/mq2` - Calibrate MQ-2 sensor
- `POST /api/calibration/mq6` - Calibrate MQ-6 sensor

**Data:**
- `GET /api/history?limit=100` - Historical sensor data
- `GET /api/history/export` - Export data as JSON

Complete API reference: [docs/API.md](./docs/API.md)

---

## Documentation

- **[Hardware Setup Guide](./docs/HARDWARE.md)** - Component specifications, wiring diagrams, assembly instructions
- **[Installation Guide](./docs/INSTALLATION.md)** - Complete setup process for Raspberry Pi and software
- **[API Documentation](./docs/API.md)** - REST API and WebSocket reference

---

## Contributing

This project is open for collaboration and further research. Contributions are welcome!

**How to Contribute:**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Commit your changes (`git commit -m 'Add improvement'`)
4. Push to branch (`git push origin feature/improvement`)
5. Open a Pull Request

For questions or collaboration inquiries, please open an issue on GitHub.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](./LICENSE) file for details.

**Key Points:**
- ✅ Free to use for personal and academic purposes
- ✅ Modifications must be shared under GPL-3.0
- ❌ Cannot be used in proprietary/commercial software without releasing source
- ⚠️ No warranty provided

## Acknowledgments

**Hardware & Components:**
- Raspberry Pi Foundation
- Hanwei Electronics (MQ sensors)
- u-blox (NEO-6M GPS)

**Software Libraries:**
- Express.js, Socket.IO, Chart.js, jsPDF
- TailwindCSS, DaisyUI
- TextBee SMS service


**Disclaimer:** This is an academic research project developed for educational purposes. While functional, it is not certified for use as a primary safety device. Always install certified gas detectors as your main safety system.
