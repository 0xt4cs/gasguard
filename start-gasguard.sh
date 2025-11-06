#!/bin/bash
#
# GasGuard System Startup Script
# Starts the complete integrated system with all hardware checks
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         GasGuard IoT Gas Detection System               ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Pre-flight checks
echo -e "${YELLOW} Running pre-flight checks...${NC}"
echo ""

# Check if running on Linux
if [ "$(uname)" != "Linux" ]; then
    echo -e "${RED}[ERROR] Error: This system must run on Linux (Raspberry Pi)${NC}"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js not found${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}[OK]${NC} Node.js $NODE_VERSION"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[ERROR] Python3 not found${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo -e "${GREEN}[OK]${NC} $PYTHON_VERSION"

# Check gpiod tools
if ! command -v gpioset &> /dev/null; then
    echo -e "${YELLOW}[WARNING]  gpiod tools not found (optional but recommended)${NC}"
else
    echo -e "${GREEN}[OK]${NC} gpiod tools available"
fi

# Check Python gpiod library
if python3 -c "import gpiod" 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Python gpiod library installed"
else
    echo -e "${RED}[ERROR] Python gpiod library not found${NC}"
    echo -e "${YELLOW}  Install with: sudo apt install python3-libgpiod${NC}"
    exit 1
fi

# Check GPIO permissions
if [ -e "/dev/gpiochip0" ]; then
    if [ -r "/dev/gpiochip0" ] && [ -w "/dev/gpiochip0" ]; then
        echo -e "${GREEN}[OK]${NC} GPIO access available"
    else
        echo -e "${YELLOW}[WARNING]  GPIO access may require sudo${NC}"
        echo -e "${YELLOW}  Run: sudo ./setup-gpio-permissions.sh${NC}"
    fi
else
    echo -e "${RED}[ERROR] /dev/gpiochip0 not found${NC}"
    exit 1
fi

# Check WiFi hotspot
if ip addr show uap0 &> /dev/null; then
    AP_IP=$(ip -4 addr show uap0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
    echo -e "${GREEN}[OK]${NC} WiFi AP running (${AP_IP})"
else
    echo -e "${YELLOW}[WARNING]  WiFi AP (uap0) not detected${NC}"
fi

# Check database
if [ -f "data/gasguard.db" ]; then
    echo -e "${GREEN}[OK]${NC} Database found"
else
    echo -e "${YELLOW}[WARNING]  Database not found - will be created${NC}"
fi

# Check npm dependencies
if [ -d "node_modules" ]; then
    echo -e "${GREEN}[OK]${NC} Node.js dependencies installed"
else
    echo -e "${YELLOW}[WARNING]  Installing Node.js dependencies...${NC}"
    npm install
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}[OK] Pre-flight checks complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Hardware test option
echo -e "${YELLOW}Would you like to test hardware before starting? (y/n)${NC}"
read -r -n 1 TEST_HW
echo ""
if [ "$TEST_HW" = "y" ] || [ "$TEST_HW" = "Y" ]; then
    echo -e "${BLUE} Testing hardware...${NC}"
    echo ""
    sudo python3 bin/test-hardware.py
    echo ""
    echo -e "${YELLOW}Press Enter to continue with server startup...${NC}"
    read -r
fi

# Clear any stuck GPIO
echo -e "${BLUE} Cleaning up GPIO lines...${NC}"
if [ -f "bin/gpio-control.py" ]; then
    # Turn off all LEDs and buzzer
    sudo python3 bin/gpio-control.py 17 0 2>/dev/null  # Green LED off
    sudo python3 bin/gpio-control.py 27 0 2>/dev/null  # Yellow LED off
    sudo python3 bin/gpio-control.py 22 0 2>/dev/null  # Red LED off
    sudo python3 bin/gpio-control.py 18 0 2>/dev/null  # Buzzer off
fi
echo -e "${GREEN}[OK]${NC} GPIO cleanup complete"
echo ""

# Display connection info
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} Access GasGuard Dashboard:${NC}"
echo ""
if [ -n "$AP_IP" ]; then
    echo -e "   WiFi AP:    http://${AP_IP}:3000"
fi
echo -e "   localhost:  http://localhost:3000"
echo -e "   mDNS:       http://iotgasleakdetect.local:3000"
echo ""
echo -e "${GREEN}📶 WiFi Hotspot:${NC}"
echo -e "   SSID:       GasGuard-AP"
echo -e "   Password:   GGL34kD3t3ct"
echo -e "   IP Range:   192.168.4.2-20"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Start server
echo -e "${GREEN} Starting GasGuard Server...${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""
sleep 2

# Run the server
npm start

# Cleanup on exit
echo ""
echo -e "${YELLOW}[STOP] Server stopped${NC}"
echo -e "${BLUE} Cleaning up...${NC}"
sudo python3 bin/gpio-control.py 17 0 2>/dev/null  # Green LED off
sudo python3 bin/gpio-control.py 27 0 2>/dev/null  # Yellow LED off
sudo python3 bin/gpio-control.py 22 0 2>/dev/null  # Red LED off
sudo python3 bin/gpio-control.py 18 0 2>/dev/null  # Buzzer off
echo -e "${GREEN}[OK] Cleanup complete${NC}"
echo -e "${GREEN}Goodbye!${NC}"
