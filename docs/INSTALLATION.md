# Installation Guide

Complete step-by-step installation guide for GasGuard IoT Gas Leak Detection System.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Raspberry Pi Setup](#raspberry-pi-setup)
- [Software Installation](#software-installation)
- [Database Setup](#database-setup)
- [SMS Configuration](#sms-configuration)
- [Testing Installation](#testing-installation)
- [Autostart Configuration](#autostart-configuration)
- [WiFi Access Point Setup](#wifi-access-point-setup)

---

## Prerequisites

### Hardware

- Raspberry Pi Zero 2 W (or Pi 3/4)
- MicroSD card (16GB minimum, Class 10)
- All sensors and components connected (see [HARDWARE.md](./HARDWARE.md))
- Stable power supply (5V 2.5A)
- Internet connection for initial setup

### Software

- Raspberry Pi OS (Bullseye or newer)
- Basic Linux command line knowledge
- SSH client (Windows: PuTTY, Mac/Linux: Terminal)

---

## Raspberry Pi Setup

### Step 1: Flash Raspberry Pi OS

**Using Raspberry Pi Imager (Recommended):**

1. Download [Raspberry Pi Imager](https://www.raspberrypi.org/software/)
2. Insert microSD card into computer
4. Launch Raspberry Pi Imager
5. Click "CHOOSE OS" → Raspberry Pi OS (other) → **Raspberry Pi OS Lite (64-bit)**
6. Click "CHOOSE STORAGE" → Select your microSD card
7. Click gear icon for advanced options:
   - Enable SSH
   - Set username and password
   - Configure WiFi (SSID and password)
   - Set locale settings
8. Click "WRITE" and wait for completion

**Manual Method:**

1. Download [Raspberry Pi OS Lite](https://www.raspberrypi.org/software/operating-systems/)
2. Flash using [balenaEtcher](https://www.balena.io/etcher/)
3. Create empty file named `ssh` in boot partition
4. Create `wpa_supplicant.conf` in boot partition:

```conf
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="YOUR_WIFI_SSID"
    psk="YOUR_WIFI_PASSWORD"
    key_mgmt=WPA-PSK
}
```

### Step 2: Boot and Connect

1. Insert microSD card into Raspberry Pi
2. Connect power and wait ~60 seconds for boot
3. Find IP address:
   ```bash
   # From another computer on same network
   ping raspberrypi.local
   
   # Or check your router's DHCP client list
   ```

4. Connect via SSH:
   ```bash
   ssh pi@raspberrypi.local
   # or
   ssh pi@192.168.x.x
   ```

### Step 3: Initial Configuration

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Set timezone
sudo timedatectl set-timezone Asia/Manila

# Configure Raspberry Pi
sudo raspi-config
```

In `raspi-config`:
1. **Interface Options** → **SPI** → Enable
2. **Interface Options** → **Serial Port**:
   - Login shell over serial: **No**
   - Serial port hardware: **Yes**
3. **Performance Options** → **GPU Memory** → Set to 16
4. **Finish** → Reboot

### Step 4: Install Dependencies

```bash
# Install Node.js (v16)
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v16.x.x
npm --version   # Should show 8.x.x

# Install system dependencies
sudo apt install -y git python3-pip

# Install GPIO tools (optional, for manual testing)
sudo apt install -y wiringpi

# Install build tools for native modules
sudo apt install -y build-essential
```

---

## Software Installation

### Method 1: Automated Setup Script (Raspberry Pi Only)

```bash
# Clone repository
git clone https://github.com/yourusername/gasguard.git
cd gasguard

# Make setup script executable
chmod +x setup-rpi.sh

# Run automated setup
sudo ./setup-rpi.sh
```

The script will:
- Install all dependencies
- Configure hardware interfaces
- Set up WiFi access point (optional)
- Configure autostart service
- Initialize database

### Method 2: Manual Installation

```bash
# 1. Clone repository
cd ~
git clone https://github.com/yourusername/gasguard.git
cd gasguard

# 2. Install Node.js dependencies
npm install

# This will install:
# - express, socket.io (web server)
# - sqlite3 (database)
# - onoff, spi-device (hardware)
# - bcryptjs, jsonwebtoken (authentication)
# - and more...

# 3. Create environment file
cp .env.example .env

# 4. Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output

# 5. Edit environment file
nano .env
```

**Edit `.env` file:**

```env
NODE_ENV=production
PORT=3000

# Paste the generated JWT secret here
JWT_SECRET=YOUR_GENERATED_SECRET_HERE

JWT_EXPIRES_IN=7d

# Optional: Adjust these if needed
# DB_PATH=./data/gasguard.db
# DATA_RETENTION_DAYS=90
# SENSOR_READING_INTERVAL=2000
```

Save and exit (Ctrl+X, Y, Enter)

---

## Database Setup

The database is automatically created on first run, but here's what happens:

### Automatic Initialization

```bash
# Start the server (database will auto-create)
npm start
```

On first run:
1. Creates `data/` directory
2. Creates `gasguard.db` SQLite database
3. Runs schema migrations
4. Creates default admin user
5. Initializes default settings

### Default Credentials

- **Username**: `admin`
- **Password**: `admin123`

**SECURITY**: Change password immediately after first login!

### Manual Database Reset

If you need to reset the database:

```bash
# Stop the server
# Ctrl+C or:
pkill -f "node server.js"

# Backup existing database (optional)
mv data/gasguard.db data/gasguard.db.backup

# Remove database
rm data/gasguard.db

# Restart server (will recreate)
npm start
```

### Database Schema

The database includes these tables:
- `users` - User accounts
- `settings` - System configuration
- `sensor_data` - Sensor readings
- `alerts` - Alert history
- `contacts` - Emergency contacts
- `calibrations` - Calibration history
- `system_logs` - Application logs

---

## SMS Configuration

GasGuard uses [TextBee](https://textbee.dev) for SMS alerts (free alternative using your Android phone).

### Step 1: Create TextBee Account

1. Visit [https://textbee.dev](https://textbee.dev)
2. Click "Sign Up" and create account
3. Verify email address

### Step 2: Install TextBee App

1. On Android phone, go to Play Store
2. Search "TextBee SMS Gateway"
3. Install and open app
4. Log in with your TextBee account

### Step 3: Get API Credentials

1. Open TextBee dashboard: [https://textbee.dev/dashboard](https://textbee.dev/dashboard)
2. Navigate to "API Credentials" or "Devices"
3. Copy:
   - **API Key** (long string)
   - **Device ID** (your phone identifier)

### Step 4: Configure in GasGuard

**Via Web Interface (Recommended):**

1. Open browser: `http://raspberrypi.local:3000`
2. Login with admin credentials
3. Navigate to **Settings** → **SMS Configuration**
4. Enable SMS alerts
5. Paste API Key and Device ID
6. Click "Save Settings"
7. Click "Test SMS" to verify

**Via Database (Advanced):**

```bash
sqlite3 data/gasguard.db

UPDATE settings 
SET sms_alerts_enabled = 1,
    textbee_api_key = 'your-api-key-here',
    textbee_device_id = 'your-device-id-here'
WHERE user_id = 2;

.quit
```

### Step 5: Test SMS

1. In web interface, go to Settings → SMS Configuration
2. Click "Send Test SMS"
3. Check your Android phone for incoming SMS
4. Verify message appears on TextBee app

---

## Testing Installation

### Test Hardware

```bash
# Navigate to bin directory
cd ~/gasguard/bin

# Run hardware test script
python3 test-hardware.py
```

Expected output:
```
Testing GasGuard Hardware...
================================
MQ-6 (CH0): 234 (1.14V)
MQ-2 (CH1): 198 (0.97V)
```

### Test Web Server

```bash
# Start server
cd ~/gasguard
npm start
```

Expected output:
```
Initializing IoT Gas Leak Detection System...

Initializing database...
Database connected

Initializing hardware...
MCP3008 ADC initialized
GPS module initialized
LED controller initialized
Buzzer controller initialized
Gas sensors initialized

═══════════════════════════════════════════════════
GasGuard Server running on http://0.0.0.0:3000
═══════════════════════════════════════════════════
```

### Test Web Interface

1. Open browser on another device
2. Navigate to: `http://raspberrypi.local:3000`
3. You should see the GasGuard landing page
4. Click "Login" or navigate to `/dashboard`
5. Login with:
   - Username: `admin`
   - Password: `admin123`

### Test API

```bash
# From another terminal or computer

# Test login
curl -X POST http://raspberrypi.local:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Should return JSON with token
# Copy the token for next test

# Test authenticated endpoint
curl http://raspberrypi.local:3000/api/dashboard/current \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Autostart Configuration

Configure GasGuard to start automatically on boot.

### Method 1: Systemd Service (Recommended)

```bash
# Create service file
sudo nano /etc/systemd/system/gasguard.service
```

Paste this content:

```ini
[Unit]
Description=GasGuard IoT Gas Leak Detection System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/gasguard
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=gasguard

[Install]
WantedBy=multi-user.target
```

Save and exit (Ctrl+X, Y, Enter)

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable gasguard

# Start service now
sudo systemctl start gasguard

# Check status
sudo systemctl status gasguard

# View logs
sudo journalctl -u gasguard -f
```

**Service Commands:**

```bash
# Start
sudo systemctl start gasguard

# Stop
sudo systemctl stop gasguard

# Restart
sudo systemctl restart gasguard

# Check status
sudo systemctl status gasguard

# Disable autostart
sudo systemctl disable gasguard
```

### Method 2: Using Provided Script

```bash
# Make start script executable
chmod +x ~/gasguard/start-gasguard.sh

# Add to crontab
crontab -e
```

Add this line:
```
@reboot /home/pi/gasguard/start-gasguard.sh
```

---

## WiFi Access Point Setup

Set up Raspberry Pi as WiFi hotspot for initial configuration or when no internet available.

### Automated Setup

```bash
cd ~/gasguard
sudo ./setup-rpi.sh
# Select option to configure WiFi access point
```

### Manual Setup

```bash
# Install required packages
sudo apt install -y hostapd dnsmasq

# Stop services
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

# Configure static IP for wlan0
sudo nano /etc/dhcpcd.conf
```

Add at the end:
```
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
```

```bash
# Configure DHCP server
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
sudo nano /etc/dnsmasq.conf
```

Add:
```
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
```

```bash
# Configure access point
sudo nano /etc/hostapd/hostapd.conf
```

Add:
```
interface=wlan0
driver=nl80211
ssid=GasGuard-Setup
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=gasguard123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

```bash
# Link configuration
sudo nano /etc/default/hostapd
```

Add:
```
DAEMON_CONF="/etc/hostapd/hostapd.conf"
```

```bash
# Enable and start services
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

sudo systemctl start hostapd
sudo systemctl start dnsmasq
```

**Connect to Access Point:**
- SSID: `GasGuard-Setup`
- Password: `gasguard123`
- Navigate to: `http://192.168.4.1:3000`

---

## Post-Installation Checklist

### Security

- Change default admin password
- Verify JWT_SECRET is secure random value
- Update Raspberry Pi OS: `sudo apt update && sudo apt upgrade`
- Change SSH password: `passwd`
- Configure firewall (optional):
  ```bash
  sudo apt install ufw
  sudo ufw allow 22    # SSH
  sudo ufw allow 3000  # GasGuard
  sudo ufw enable
  ```

### Functionality

- Sensors reading correctly
- GPS acquiring fix (if outdoors)
- LEDs functioning
- Buzzer working
- Web dashboard accessible
- SMS alerts sending (if configured)
- Data logging to database

### Performance

- Server starts without errors
- No memory leaks (check with `free -h`)
- Logs rotating properly
- Database size reasonable

---

## Updating GasGuard

```bash
# Navigate to project directory
cd ~/gasguard

# Stop service
sudo systemctl stop gasguard

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Restart service
sudo systemctl start gasguard

# Check status
sudo systemctl status gasguard
```

---

## Uninstallation

If you need to remove GasGuard:

```bash
# Stop and disable service
sudo systemctl stop gasguard
sudo systemctl disable gasguard
sudo rm /etc/systemd/system/gasguard.service
sudo systemctl daemon-reload

# Remove project files
cd ~
rm -rf gasguard

# Remove Node.js (optional)
sudo apt remove nodejs npm

# Remove database backups (optional)
# Backup first if needed!
```

---

## Troubleshooting Installation

### Node.js Installation Failed

```bash
# Try alternative installation
wget https://nodejs.org/dist/v16.14.0/node-v16.14.0-linux-armv7l.tar.xz
sudo mkdir -p /usr/local/lib/nodejs
sudo tar -xJvf node-v16.14.0-linux-armv7l.tar.xz -C /usr/local/lib/nodejs

# Add to PATH
echo 'export PATH=/usr/local/lib/nodejs/node-v16.14.0-linux-armv7l/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### npm install Fails

```bash
# Clear npm cache
npm cache clean --force

# Reinstall with verbose logging
npm install --verbose

# If native modules fail
sudo apt install -y python3 make g++
npm rebuild
```

### Cannot Access Web Interface

```bash
# Check if server is running
ps aux | grep node

# Check port is listening
sudo netstat -tlnp | grep 3000

# Check firewall
sudo ufw status

# Test locally on Pi
curl http://localhost:3000
```

### Database Errors

```bash
# Check database file exists
ls -lh data/gasguard.db

# Check permissions
sudo chmod 664 data/gasguard.db
sudo chown pi:pi data/gasguard.db

# Test database
sqlite3 data/gasguard.db "SELECT COUNT(*) FROM users;"
```

---

## Additional Resources

- [Raspberry Pi Documentation](https://www.raspberrypi.org/documentation/)
- [Node.js on ARM](https://nodejs.org/en/download/)
- [Systemd Service Tutorial](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
