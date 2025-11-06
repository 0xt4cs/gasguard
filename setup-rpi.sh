#!/bin/bash

echo "Setting up IoT Gas Leak Detection System on Raspberry Pi Zero 2 W"
echo "=================================================================="
echo "Target OS: Raspberry Pi OS 64-bit (Trixie - Debian 12)"
echo ""

# Exit on error
set -e

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
    echo "ERROR: This script must be run on a Raspberry Pi"
    exit 1
fi

echo "[1/7] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js LTS (20.x recommended for Raspberry Pi Zero 2 W)
if ! command -v node &> /dev/null; then
    echo "[2/7] Installing Node.js LTS (v20.x)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "Node.js installed: $(node --version)"
    echo "npm installed: $(npm --version)"
else
    echo "[2/7] Node.js already installed: $(node --version)"
    echo "npm version: $(npm --version)"
fi

# Enable hardware interfaces
echo "[3/7] Enabling hardware interfaces..."

# Enable SPI (for MCP3008 ADC)
echo "  - Enabling SPI interface for MCP3008..."
sudo raspi-config nonint do_spi 0

# Enable I2C (for potential I2C sensors/displays)
echo "  - Enabling I2C interface..."
sudo raspi-config nonint do_i2c 0

# Enable Serial/UART (for GPS module)
echo "  - Enabling Serial interface for GPS..."
sudo raspi-config nonint do_serial 2  # Enable serial port, disable serial console

# Enable 1-Wire (for temperature sensors like DS18B20)
echo "  - Enabling 1-Wire interface..."
sudo raspi-config nonint do_onewire 0

# Disable Bluetooth to free up UART0 for GPS (optional but recommended)
echo "  - Disabling Bluetooth to free UART for GPS..."
if ! grep -q "dtoverlay=disable-bt" /boot/firmware/config.txt; then
    echo "dtoverlay=disable-bt" | sudo tee -a /boot/firmware/config.txt > /dev/null
fi

# Configure GPIO permissions
echo "  - Setting up GPIO permissions..."
sudo usermod -a -G gpio,spi,i2c,dialout $USER

# Configure GPIO for LEDs (using /boot/firmware/config.txt for Bookworm/Trixie)
echo "  - Configuring GPIO pins for LEDs..."
CONFIG_FILE="/boot/firmware/config.txt"

# Add GPIO configuration section if it doesn't exist
if ! grep -q "# Gas Detection System GPIO Configuration" $CONFIG_FILE; then
    echo "" | sudo tee -a $CONFIG_FILE > /dev/null
    echo "# Gas Detection System GPIO Configuration" | sudo tee -a $CONFIG_FILE > /dev/null
    echo "# Enable GPIO pins for LEDs and other outputs" | sudo tee -a $CONFIG_FILE > /dev/null
fi

# Set GPIO pins as outputs (recommended pins for LEDs: 17, 27, 22)
# GPIO 17 - Red LED (Critical alert)
# GPIO 27 - Yellow LED (Warning)  
# GPIO 22 - Green LED (Normal/Status)
# These are added as examples - user can configure in web interface

# Load kernel modules
echo "  - Loading kernel modules..."
sudo modprobe spi_bcm2835
sudo modprobe i2c-dev
sudo modprobe w1-gpio
sudo modprobe w1-therm

# Add modules to load at boot
echo "  - Configuring modules to load at boot..."
for module in spi_bcm2835 i2c-dev w1-gpio w1-therm; do
    if ! grep -q "^$module" /etc/modules; then
        echo "$module" | sudo tee -a /etc/modules > /dev/null
    fi
done

# Configure system for headless operation
echo "  - Optimizing for headless/no desktop environment..."
# Reduce GPU memory allocation (more RAM for Node.js)
if ! grep -q "^gpu_mem=" $CONFIG_FILE; then
    echo "gpu_mem=16" | sudo tee -a $CONFIG_FILE > /dev/null
else
    sudo sed -i 's/^gpu_mem=.*/gpu_mem=16/' $CONFIG_FILE
fi

# Disable unnecessary services for headless
sudo systemctl disable bluetooth.service 2>/dev/null || true
sudo systemctl disable hciuart.service 2>/dev/null || true
sudo systemctl disable triggerhappy.service 2>/dev/null || true

echo "Hardware interfaces enabled successfully"

# Install required system packages
echo "[4/7] Installing system dependencies..."
sudo apt install -y \
    python3-pip \
    python3-dev \
    python3-setuptools \
    python3-rpi.gpio \
    python3-smbus \
    python3-spidev \
    python3-gpiozero \
    build-essential \
    git \
    sqlite3 \
    i2c-tools \
    gpsd \
    gpsd-clients \
    gpiod \
    libgpiod3 \
    python3-libgpiod \
    raspi-config

# Install build dependencies for node-gyp (required for native modules)
echo "  - Installing build dependencies for native Node.js modules..."
# Python 3.13 in Trixie has setuptools built-in but node-gyp needs proper setup
sudo apt install -y python-is-python3 2>/dev/null || true

# Install required Python packages for GPS and hardware
echo "[5/7] Installing Python packages..."
sudo pip3 install --break-system-packages \
    gps \
    gpsd-py3 \
    spidev \
    smbus2 \
    RPi.GPIO

# Configure GPSD for GPS module (if using GPS)
echo "  - Configuring GPSD service..."
sudo systemctl stop gpsd.socket
sudo systemctl disable gpsd.socket
sudo tee /etc/default/gpsd > /dev/null <<GPSD_EOF
# Default settings for the gpsd init script and the hotplug wrapper.
START_DAEMON="true"
GPSD_OPTIONS="-n"
DEVICES="/dev/ttyAMA0 /dev/serial0"
USBAUTO="true"
GPSD_SOCKET="/var/run/gpsd.sock"
GPSD_EOF

sudo systemctl enable gpsd
sudo systemctl restart gpsd

# Configure WiFi Hotspot (AP + Client mode)
echo ""
echo "=================================================================="
echo "WiFi Hotspot Configuration (Optional)"
echo "=================================================================="
echo ""
echo "This will configure your Raspberry Pi to work as:"
echo "  1. WiFi Client (STA) - Connect to existing WiFi network"
echo "  2. WiFi Hotspot (AP) - Create its own access point"
echo ""
echo "Benefits:"
echo "  - Remote access via your network (SSH, Web interface)"
echo "  - Portable access via hotspot when away from network"
echo "  - No risk of being locked out - both modes work simultaneously"
echo ""
echo "WARNING: Skip this if you're connected via WiFi SSH right now!"
echo "         (It's safer to run this after connecting via Ethernet)"
echo ""

read -p "Do you want to configure WiFi Hotspot? (y/N): " configure_hotspot

if [[ "$configure_hotspot" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Installing required packages for hostapd and dnsmasq..."
    sudo apt install -y hostapd dnsmasq iptables-persistent netfilter-persistent

    # Stop services during configuration
    sudo systemctl stop hostapd
    sudo systemctl stop dnsmasq

    # Backup existing configurations
    echo "  - Backing up existing configurations..."
    sudo cp /etc/dhcpcd.conf /etc/dhcpcd.conf.backup 2>/dev/null || true
    sudo cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup 2>/dev/null || true
    sudo cp /etc/hostapd/hostapd.conf /etc/hostapd/hostapd.conf.backup 2>/dev/null || true

    # Get hotspot configuration from user
    echo ""
    echo "Hotspot Configuration:"
    read -p "Enter hotspot SSID [default: GasGuard-AP]: " hotspot_ssid
    hotspot_ssid=${hotspot_ssid:-GasGuard-AP}

    read -sp "Enter hotspot password (min 8 characters): " hotspot_password
    echo ""
    
    while [ ${#hotspot_password} -lt 8 ]; do
        echo "Password must be at least 8 characters!"
        read -sp "Enter hotspot password (min 8 characters): " hotspot_password
        echo ""
    done

    read -p "Enter WiFi channel [default: 6]: " wifi_channel
    wifi_channel=${wifi_channel:-6}

    # Configure dhcpcd for static IP on uap0 (virtual AP interface)
    echo ""
    echo "  - Configuring virtual AP interface (uap0) with static IP 192.168.4.1..."
    
    # Remove any existing uap0 or wlan0 AP configuration
    sudo sed -i '/^interface uap0/,/^$/d' /etc/dhcpcd.conf
    sudo sed -i '/# Static IP for WiFi Hotspot/,/^$/d' /etc/dhcpcd.conf
    
    # Add new uap0 configuration (virtual interface for AP)
    sudo tee -a /etc/dhcpcd.conf > /dev/null <<DHCPCD_EOF

# Static IP for WiFi Hotspot (uap0 - virtual AP interface)
interface uap0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant

# Keep wlan0 for client connections
interface wlan0
    env ifwireless=1
    env wpa_supplicant_driver=nl80211,wext
DHCPCD_EOF

    # Configure NetworkManager to ignore uap0
    echo "  - Configuring NetworkManager to not manage uap0..."
    sudo mkdir -p /etc/NetworkManager/conf.d
    sudo tee /etc/NetworkManager/conf.d/unmanaged-uap0.conf > /dev/null <<'NM_EOF'
[keyfile]
unmanaged-devices=interface-name:uap0
NM_EOF

    # Configure dnsmasq
    echo "  - Configuring DHCP server (dnsmasq)..."
    sudo tee /etc/dnsmasq.conf > /dev/null <<DNSMASQ_EOF
# Gas Detection System - WiFi Hotspot DHCP Configuration
# Use uap0 (virtual AP interface) to avoid conflict with wlan0 (client)
interface=uap0
bind-interfaces
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
domain=gasguard.local
address=/gasguard.local/192.168.4.1

# Logging
log-queries
log-dhcp

# DNS
no-resolv
server=8.8.8.8
server=8.8.4.4
DNSMASQ_EOF

    # Configure hostapd for virtual AP interface
    echo "  - Configuring Access Point (hostapd) with virtual interface..."
    sudo tee /etc/hostapd/hostapd.conf > /dev/null <<HOSTAPD_EOF
# Gas Detection System - WiFi Hotspot Configuration
# Using wlan0 as base, will create uap0 virtual interface for AP
interface=uap0
driver=nl80211

# Network configuration
ssid=$hotspot_ssid
hw_mode=g
channel=$wifi_channel
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0

# Security configuration
wpa=2
wpa_passphrase=$hotspot_password
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP

# Country code (adjust if needed)
country_code=PH
ieee80211n=1
ieee80211d=1

# Beacon interval and timeouts
beacon_int=100
dtim_period=2
max_num_sta=10
rts_threshold=2347
fragm_threshold=2346
HOSTAPD_EOF

    # Point hostapd to config file
    sudo sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd

    # Create systemd service to create virtual interface uap0 on boot
    echo "  - Creating virtual AP interface startup service..."
    sudo tee /etc/systemd/system/create-uap0.service > /dev/null <<UAP0_SERVICE_EOF
[Unit]
Description=Create uap0 virtual AP interface
After=network.target
Before=hostapd.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/iw dev wlan0 interface add uap0 type __ap
ExecStop=/sbin/iw dev uap0 del

[Install]
WantedBy=multi-user.target
UAP0_SERVICE_EOF

    sudo systemctl enable create-uap0.service

    # Create a script to manage the virtual interface and bring it up
    echo "  - Creating network interface management script..."
    sudo tee /usr/local/bin/start-ap.sh > /dev/null <<'START_AP_EOF'
#!/bin/bash
# Script to manage virtual AP interface and routing

# Wait for wlan0 to be ready
sleep 5

# Check if uap0 already exists, if not create it
if ! ip link show uap0 > /dev/null 2>&1; then
    iw dev wlan0 interface add uap0 type __ap
fi

# Bring up uap0
ip link set uap0 up

# Set IP address
ip addr flush dev uap0
ip addr add 192.168.4.1/24 dev uap0

# Wait for interface to be fully configured
sleep 2

# Restart services (dnsmasq first, then hostapd)
systemctl restart dnsmasq
sleep 1
systemctl restart hostapd

# Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1

# Setup NAT rules
iptables -t nat -F
iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
iptables -A FORWARD -i wlan0 -o uap0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i uap0 -o wlan0 -j ACCEPT

echo "Virtual AP interface uap0 is ready"
START_AP_EOF

    sudo chmod +x /usr/local/bin/start-ap.sh

    # Create systemd service to run start-ap script
    sudo tee /etc/systemd/system/start-ap.service > /dev/null <<START_AP_SERVICE_EOF
[Unit]
Description=Start WiFi Access Point on virtual interface
After=create-uap0.service dhcpcd.service
Wants=create-uap0.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/start-ap.sh

[Install]
WantedBy=multi-user.target
START_AP_SERVICE_EOF

    sudo systemctl enable start-ap.service

    # Enable IP forwarding and NAT (for internet sharing)
    echo "  - Configuring IP forwarding and NAT..."
    
    # Enable IP forwarding permanently (using sysctl.d for modern systems)
    sudo tee /etc/sysctl.d/99-gas-detection-forwarding.conf > /dev/null <<SYSCTL_EOF
# Enable IP forwarding for Gas Detection System WiFi hotspot
net.ipv4.ip_forward=1
SYSCTL_EOF
    
    # Apply immediately
    sudo sysctl -w net.ipv4.ip_forward=1

    # Configure iptables for NAT/Masquerading (wlan0 client -> uap0 hotspot)
    sudo iptables -t nat -F
    sudo iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
    sudo iptables -A FORWARD -i wlan0 -o uap0 -m state --state RELATED,ESTABLISHED -j ACCEPT
    sudo iptables -A FORWARD -i uap0 -o wlan0 -j ACCEPT

    # Save iptables rules persistently
    sudo netfilter-persistent save

    # Unmask and enable services
    echo "  - Enabling hostapd and dnsmasq services..."
    sudo systemctl unmask hostapd
    sudo systemctl enable hostapd
    sudo systemctl enable dnsmasq

    # Create a safety script to restore WiFi if something goes wrong
    echo "  - Creating safety restore script..."
    sudo tee /usr/local/bin/restore-wifi.sh > /dev/null <<'RESTORE_EOF'
#!/bin/bash
echo "Restoring WiFi configuration..."

# Stop all AP-related services
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq
sudo systemctl stop start-ap.service
sudo systemctl stop create-uap0.service

# Disable services
sudo systemctl disable hostapd
sudo systemctl disable dnsmasq
sudo systemctl disable start-ap.service
sudo systemctl disable create-uap0.service

# Remove virtual interface if exists
if ip link show uap0 > /dev/null 2>&1; then
    sudo ip link set uap0 down
    sudo iw dev uap0 del
fi

# Restore backups if they exist
if [ -f /etc/dhcpcd.conf.backup ]; then
    sudo cp /etc/dhcpcd.conf.backup /etc/dhcpcd.conf
fi

# Flush iptables NAT rules
sudo iptables -t nat -F
sudo netfilter-persistent save

# Restart networking
sudo systemctl restart dhcpcd
sudo systemctl restart wpa_supplicant

echo "WiFi restored. Hotspot disabled."
echo "Your wlan0 is now back to normal client mode."
echo "Reboot recommended: sudo reboot"
RESTORE_EOF

    sudo chmod +x /usr/local/bin/restore-wifi.sh

    echo ""
    echo "=================================================================="
    echo "WiFi Hotspot Configuration Complete!"
    echo "=================================================================="
    echo ""
    echo "CONFIGURATION SUMMARY:"
    echo "  - Physical Interface: wlan0 (WiFi client - connect to networks)"
    echo "  - Virtual Interface: uap0 (WiFi AP - your hotspot)"
    echo "  - No conflict: Both work simultaneously!"
    echo ""
    echo "IMPORTANT - RASPBERRY PI ZERO 2 W SPECIFIC:"
    echo ""
    echo "1. Your Pi will work in DUAL MODE:"
    echo "   - wlan0: Connect to your home/office WiFi (client mode)"
    echo "   - uap0: Broadcast hotspot for portable access (AP mode)"
    echo ""
    echo "2. FIRST TIME SETUP AFTER REBOOT:"
    echo "   a) Connect to the hotspot first:"
    echo "      SSID: $hotspot_ssid"
    echo "      Password: (the one you entered)"
    echo "      Pi IP: 192.168.4.1"
    echo ""
    echo "   b) Then configure WiFi client via web interface or:"
    echo "      sudo raspi-config"
    echo "      Select: System Options -> Wireless LAN"
    echo ""
    echo "3. SAFETY - Multiple ways to access your Pi:"
    echo "   - Via Hotspot: Always available at 192.168.4.1"
    echo "   - Via Network: When connected to WiFi as client"
    echo "   - No lockout risk: Hotspot is your backup access!"
    echo ""
    echo "4. To DISABLE hotspot later:"
    echo "   sudo /usr/local/bin/restore-wifi.sh"
    echo ""
    echo "5. Access points after reboot:"
    echo "   - Web Interface: http://192.168.4.1:3000"
    echo "   - SSH: ssh pi@192.168.4.1"
    echo "   - Or: ssh pi@<network-ip> (when on network)"
    echo ""
    echo "6. Internet sharing:"
    echo "   - Devices connecting to hotspot will get internet"
    echo "   - Traffic routed through Pi's wlan0 connection"
    echo ""
    echo "7. Check interfaces after reboot:"
    echo "   ip addr show"
    echo "   - Should see both wlan0 and uap0"
    echo ""
    echo "Press ENTER to continue with the setup..."
    read

else
    echo "Skipping WiFi Hotspot configuration."
fi

# Install Node.js dependencies
echo "[6/7] Installing Node.js project dependencies..."
echo "  - Cleaning npm cache..."
npm cache clean --force

echo "  - Installing dependencies (this may take 5-10 minutes on Pi Zero 2 W)..."
npm install --no-audit --no-fund

# Set up systemd service
echo "[7/7] Setting up systemd service..."
sudo tee /etc/systemd/system/gas-detection.service > /dev/null <<EOF
[Unit]
Description=IoT Gas Leak Detection System
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable gas-detection.service

# Create database directory if it doesn't exist
mkdir -p data

# Initialize database
echo ""
echo "Initializing database..."
node src/database/migrate.js

# Set proper permissions
echo ""
echo "Setting file permissions..."
sudo chown -R $USER:$USER $(pwd)
chmod -R 755 $(pwd)
chmod 644 data/*.db 2>/dev/null || true

# Test hardware interfaces
echo ""
echo "Testing hardware interfaces..."
echo "  - SPI devices:"
ls -l /dev/spidev* 2>/dev/null || echo "    No SPI devices found (will be available after reboot)"
echo "  - I2C devices:"
ls -l /dev/i2c* 2>/dev/null || echo "    No I2C devices found (will be available after reboot)"
echo "  - GPIO access:"
ls -l /sys/class/gpio 2>/dev/null && echo "    GPIO accessible" || echo "    GPIO not accessible"

echo ""
echo "=================================================================="
echo "Setup completed successfully!"
echo "=================================================================="
echo ""
echo "REBOOT REQUIRED to activate all hardware interfaces!"
echo "Run: sudo reboot"
echo ""
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Start the system manually:"
echo "   npm start"
echo ""
echo "2. OR start as a system service:"
echo "   sudo systemctl start gas-detection.service"
echo ""
echo "3. Check service status:"
echo "   sudo systemctl status gas-detection.service"
echo ""
echo "4. View service logs:"
echo "   sudo journalctl -u gas-detection.service -f"
echo ""
echo "5. Stop the service:"
echo "   sudo systemctl stop gas-detection.service"
echo ""
echo "HARDWARE INTERFACES ENABLED:"
echo "  [[OK]] SPI - For MCP3008 ADC"
echo "  [[OK]] I2C - For I2C sensors/displays"
echo "  [[OK]] Serial/UART - For GPS module"
echo "  [[OK]] 1-Wire - For temperature sensors"
echo "  [[OK]] GPIO - For LEDs, buzzer, buttons"
echo "  [[OK]] GPSD - GPS daemon configured"
echo ""
echo "HEADLESS OPTIMIZATIONS:"
echo "  [[OK]] GPU memory reduced to 16MB (more RAM for Node.js)"
echo "  [[OK]] Bluetooth service disabled (UART freed for GPS)"
echo "  [[OK]] Unnecessary services disabled"
echo "  [[OK]] Optimized for remote access only"
echo ""
echo "HARDWARE CONNECTIONS:"
echo "  MCP3008 ADC (SPI):"
echo "    - VDD  → 3.3V (Pin 1)"
echo "    - VREF → 3.3V (Pin 1)"
echo "    - AGND → GND (Pin 6)"
echo "    - DGND → GND (Pin 6)"
echo "    - CLK  → GPIO 11 (Pin 23) - SCLK"
echo "    - DOUT → GPIO 9 (Pin 21)  - MISO"
echo "    - DIN  → GPIO 10 (Pin 19) - MOSI"
echo "    - CS   → GPIO 8 (Pin 24)  - CE0"
echo ""
echo "  Gas Sensors:"
echo "    - MQ2 Sensor (LPG/Smoke) → MCP3008 Channel 0"
echo "    - MQ6 Sensor (LPG)       → MCP3008 Channel 1"
echo "    - Sensor VCC → 5V (Pin 2 or 4)"
echo "    - Sensor GND → GND (Pin 6, 9, 14, 20, 25, 30, 34, 39)"
echo "    - Sensor Analog Out → MCP3008 CH0/CH1"
echo ""
echo "  Output Devices:"
echo "    - Buzzer → GPIO 18 (Pin 12) + GND"
echo ""
echo "  LEDs (Recommended pins with 220-330Ω resistors):"
echo "    - Red LED (Critical)   → GPIO 17 (Pin 11) + 220Ω resistor + GND"
echo "    - Yellow LED (Warning) → GPIO 27 (Pin 13) + 220Ω resistor + GND"
echo "    - Green LED (Normal)   → GPIO 22 (Pin 15) + 220Ω resistor + GND"
echo "    Note: Configure LED pins in web interface Settings page"
echo "    Connection: GPIO Pin → Resistor → LED (+) → LED (-) → GND"
echo ""
echo "  GPS Module (optional):"
echo "    - GPS TX → GPIO 15 (Pin 10) - UART RX"
echo "    - GPS RX → GPIO 14 (Pin 8)  - UART TX"
echo "    - GPS VCC → 3.3V or 5V"
echo "    - GPS GND → GND"
echo ""
echo "WEB INTERFACE:"
echo "  http://$(hostname -I | awk '{print $1}'):3000"
echo "  http://localhost:3000"
echo ""
echo "DEFAULT LOGIN:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "IMPORTANT: Change default password after first login!"
echo ""
echo "LED WIRING GUIDE:"
echo "  Each LED needs a current-limiting resistor (220-330Ω recommended)"
echo "  "
echo "  Example for Red LED on GPIO 17:"
echo "    GPIO 17 (Pin 11) → 220Ω Resistor → LED Anode (+, longer leg)"
echo "    LED Cathode (-, shorter leg) → GND (any GND pin)"
echo "  "
echo "  Test LED manually (using modern GPIO tools):"
echo "    gpioset gpiochip0 17=1  # Turn ON"
echo "    gpioset gpiochip0 17=0  # Turn OFF"
echo "  "
echo "  OR using sysfs (legacy method):"
echo "    echo 17 > /sys/class/gpio/export"
echo "    echo out > /sys/class/gpio/gpio17/direction"
echo "    echo 1 > /sys/class/gpio/gpio17/value  # Turn ON"
echo "    echo 0 > /sys/class/gpio/gpio17/value  # Turn OFF"
echo ""
echo "WIFI HOTSPOT (if configured):"
echo "  - Interfaces: wlan0 (client) + uap0 (hotspot virtual interface)"
echo "  - Hotspot will start automatically after reboot"
echo "  - Connect to hotspot SSID to access the system"
echo "  - Hotspot IP: 192.168.4.1 (always available)"
echo "  - Web interface: http://192.168.4.1:3000"
echo "  - SSH access: ssh pi@192.168.4.1"
echo "  - Disable hotspot: sudo /usr/local/bin/restore-wifi.sh"
echo "  - Check hotspot status: sudo systemctl status hostapd"
echo "  - Check virtual interface: ip addr show uap0"
echo "  - View connected devices: arp -a | grep 192.168.4"
echo "  - Configure client WiFi: Use web interface or raspi-config"
echo ""
echo "TROUBLESHOOTING:"
echo "  - Check SPI: ls -l /dev/spidev*"
echo "  - Check I2C: ls -l /dev/i2c* && i2cdetect -y 1"
echo "  - Check GPIO: pinout  OR  gpioinfo"
echo "  - Check GPS: cgps -s (if GPS connected)"
echo "  - Test MCP3008: Check logs when system starts"
echo "  - View system logs: sudo journalctl -xe"
echo "  - Check memory: free -h"
echo "  - Check WiFi interfaces: ip addr show"
echo "  - Check routing: ip route"
echo "  - Check NAT rules: sudo iptables -t nat -L -v"
echo ""
echo "For WiFi client configuration, use the web interface Settings page"
echo "or run: sudo raspi-config"
echo ""
echo "Your user ($USER) has been added to groups: gpio, spi, i2c, dialout"
echo "Log out and back in (or reboot) for group changes to take effect."
echo ""
