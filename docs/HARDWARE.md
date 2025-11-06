# Hardware Setup Guide

This guide provides detailed information about the hardware components, wiring, and assembly for the GasGuard system.

## Bill of Materials (BOM)

### Core Components

| Item | Component | Model/Specs | Quantity | Est. Price (USD) |
|------|-----------|-------------|----------|------------------|
| 1 | Microcontroller | Raspberry Pi Zero 2 W | 1 | $15 |
| 2 | Gas Sensor (LPG) | MQ-6 | 1 | $3 |
| 3 | Gas Sensor (Smoke) | MQ-2 | 1 | $3 |
| 4 | GPS Module | NEO-6M with antenna | 1 | $8 |
| 5 | ADC Converter | MCP3008 (10-bit, 8-channel) | 1 | $4 |
| 6 | Buzzer | 5V Active Buzzer | 1 | $1 |
| 7 | LED - Green | 5mm LED | 1 | $0.10 |
| 8 | LED - Yellow | 5mm LED | 1 | $0.10 |
| 9 | LED - Red | 5mm LED | 1 | $0.10 |
| 10 | Resistor | 220Ω (for LEDs) | 3 | $0.15 |
| 11 | Power Supply | 5V 2.5A USB-C | 1 | $8 |
| 12 | MicroSD Card | 16GB Class 10 | 1 | $6 |

### Supporting Components

| Item | Component | Purpose | Quantity |
|------|-----------|---------|----------|
| 13 | Breadboard | 830 point or larger | 1 |
| 14 | Jumper Wires | Male-to-Male | 20+ |
| 15 | Jumper Wires | Male-to-Female | 10+ |
| 16 | Jumper Wires | Female-to-Female | 10+ |
| 17 | Enclosure | Custom or 3D printed | 1 (optional) |

**Total Estimated Cost: ~$50-60 USD**

---

## Pin Configuration

### Pin Assignments for GasGuard

| Component | Pin Function | GPIO | Physical Pin | Notes |
|-----------|-------------|------|--------------|-------|
| **MCP3008** | CLK (Clock) | GPIO11 (SCLK) | 23 | SPI Clock |
| | MISO (Master In) | GPIO9 (MISO) | 21 | SPI Data In |
| | MOSI (Master Out) | GPIO10 (MOSI) | 19 | SPI Data Out |
| | CS (Chip Select) | GPIO8 (CE0) | 24 | SPI CS0 |
| | VDD | 3.3V | 17 | Power |
| | VREF | 3.3V | 17 | Reference Voltage |
| | AGND | GND | 20 | Analog Ground |
| | DGND | GND | 20 | Digital Ground |
| **NEO-6M GPS** | TX | GPIO15 (RXD) | 10 | UART Receive |
| | RX | GPIO14 (TXD) | 8 | UART Transmit |
| | VCC | 5V | 2 or 4 | Power |
| | GND | GND | 6 | Ground |
| **Buzzer** | Signal | GPIO17 | 11 | Active Buzzer Control |
| | VCC | 5V | 2 or 4 | Power |
| | GND | GND | 9 | Ground |
| **LED Green** | Anode (+) | GPIO22 | 15 | Normal Status |
| | Cathode (-) | GND via 220Ω | - | Through Resistor |
| **LED Yellow** | Anode (+) | GPIO23 | 16 | Warning Status |
| | Cathode (-) | GND via 220Ω | - | Through Resistor |
| **LED Red** | Anode (+) | GPIO24 | 18 | Critical Status |
| | Cathode (-) | GND via 220Ω | - | Through Resistor |

---

## Wiring Diagrams

### MCP3008 ADC Connection

The MCP3008 converts analog signals from MQ sensors to digital values.

**MCP3008 Pin Connections:**
- Pin 1 (CH0) → MQ-6 Analog Out
- Pin 2 (CH1) → MQ-2 Analog Out
- Pin 9 (DGND) → Raspberry Pi GND
- Pin 10 (CS) → GPIO8 (Pin 24)
- Pin 11 (MOSI) → GPIO10 (Pin 19)
- Pin 12 (MISO) → GPIO9 (Pin 21)
- Pin 13 (CLK) → GPIO11 (Pin 23)
- Pin 14 (AGND) → Raspberry Pi GND
- Pin 15 (VREF) → 3.3V
- Pin 16 (VDD) → 3.3V

### MQ Sensor Connection

Both MQ-2 and MQ-6 have identical 4-pin configuration:
- Pin 1: VCC (5V)
- Pin 2: GND
- Pin 3: Digital Out (not used)
- Pin 4: Analog Out (to MCP3008)

**MQ-6 Connections:**
- VCC → Raspberry Pi 5V
- GND → Raspberry Pi GND
- D0 → Not connected
- A0 → MCP3008 CH0 (Pin 1)

**MQ-2 Connections:**
- VCC → Raspberry Pi 5V
- GND → Raspberry Pi GND
- D0 → Not connected
- A0 → MCP3008 CH1 (Pin 2)

### NEO-6M GPS Connection

**Pin Configuration:**
- VCC → Raspberry Pi 5V (Pin 2 or 4)
- GND → Raspberry Pi GND (Pin 6)
- TX → Raspberry Pi RX (GPIO15, Pin 10)
- RX → Raspberry Pi TX (GPIO14, Pin 8)

### LED Connections (with 220Ω Resistors)

Each LED connects through a 220Ω current-limiting resistor:

**Connection Pattern:**
GPIO Pin → 220Ω Resistor → LED Anode (+) → LED Cathode (-) → GND

**Specific Connections:**
- Green LED: GPIO22 (Pin 15) → 220Ω resistor → LED → GND
- Yellow LED: GPIO23 (Pin 16) → 220Ω resistor → LED → GND  
- Red LED: GPIO24 (Pin 18) → 220Ω resistor → LED → GND

### Buzzer Connection

**5V Active Buzzer:**
- Signal → GPIO17 (Pin 11)
- VCC → 5V (Pin 2 or 4)
- GND → GND (Pin 9)

---

## Assembly Instructions

### Step 1: Prepare Raspberry Pi

1. Flash Raspberry Pi OS Lite to microSD card
2. Enable SSH and configure WiFi (create `wpa_supplicant.conf`)
3. Insert microSD card into Raspberry Pi
4. Connect power and boot up

### Step 2: Enable Required Interfaces

```bash
sudo raspi-config
```

Navigate to:
- **Interface Options → SPI → Enable**
- **Interface Options → Serial Port:**
  - "Would you like a login shell accessible over serial?" → **No**
  - "Would you like the serial port hardware to be enabled?" → **Yes**

Reboot after changes.

### Step 3: Assemble MCP3008 Circuit

1. Place MCP3008 on breadboard
2. Connect power rails:
   - VDD (Pin 16) → 3.3V
   - VREF (Pin 15) → 3.3V
   - AGND (Pin 14) → GND
   - DGND (Pin 9) → GND

3. Connect SPI pins to Raspberry Pi:
   - CLK → GPIO11
   - MISO → GPIO9
   - MOSI → GPIO10
   - CS → GPIO8

### Step 4: Connect Gas Sensors

1. Connect MQ-6:
   - VCC → 5V rail
   - GND → GND rail
   - A0 → MCP3008 CH0

2. Connect MQ-2:
   - VCC → 5V rail
   - GND → GND rail
   - A0 → MCP3008 CH1

**Important**: Allow sensors to preheat for 24-48 hours for accurate readings!

### Step 5: Connect GPS Module

1. Connect NEO-6M:
   - VCC → 5V
   - GND → GND
   - TX → GPIO15 (RX)
   - RX → GPIO14 (TX)

2. Place antenna in location with clear sky view

### Step 6: Connect LEDs

For each LED:
1. Insert LED into breadboard
2. Connect 220Ω resistor to anode (longer leg)
3. Connect resistor to GPIO pin
4. Connect cathode (shorter leg) to GND

### Step 7: Connect Buzzer

1. Connect buzzer signal pin to GPIO17
2. Connect VCC to 5V
3. Connect GND to ground rail

### Step 8: Power Management

1. Connect all GND points to common ground
2. Ensure 5V and 3.3V rails are properly connected
3. Use Raspberry Pi power supply (5V 2.5A minimum)

---

## Testing Hardware

### Test MCP3008 and Sensors

```bash
cd ~/gasguard/bin
python3 test-hardware.py
```

This will display:
- MQ-6 raw values (0-1023)
- MQ-2 raw values (0-1023)
- Voltage calculations

### Test GPS

```bash
sudo cat /dev/ttyAMA0
# or
sudo cat /dev/serial0
```

You should see NMEA sentences:
```
$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
$GPGSA,A,3,04,05,,09,12,,,24,,,,,2.5,1.3,2.1*39
```

### Test LEDs

```bash
# Test green LED
gpio -g mode 22 out
gpio -g write 22 1  # Turn on
gpio -g write 22 0  # Turn off

# Test yellow LED
gpio -g mode 23 out
gpio -g write 23 1

# Test red LED
gpio -g mode 24 out
gpio -g write 24 1
```

### Test Buzzer

```bash
gpio -g mode 17 out
gpio -g write 17 1  # Turn on
sleep 1
gpio -g write 17 0  # Turn off
```

---

## Troubleshooting Hardware

### Sensors Reading 0 or 1023

**Causes:**
- Poor connection to MCP3008
- Insufficient preheat time
- Power supply issues

**Solutions:**
- Check all wiring connections
- Allow 24-48 hour preheat period
- Verify 5V supply to sensors
- Test MCP3008 with known voltage source

### GPS Not Getting Fix

**Causes:**
- No clear sky view
- Antenna not connected
- Serial port disabled

**Solutions:**
- Move antenna outdoors or near window
- Ensure antenna is properly connected
- Verify serial port enabled in raspi-config
- Check `/dev/ttyAMA0` or `/dev/serial0` exists

### LEDs Not Lighting

**Causes:**
- LED polarity reversed
- Resistor missing or wrong value
- GPIO not configured

**Solutions:**
- Check LED orientation (anode to resistor)
- Verify 220Ω resistor present
- Test GPIO with manual control

### Buzzer Always On or Silent

**Causes:**
- Wrong buzzer type (passive vs active)
- Polarity reversed
- GPIO pin issue

**Solutions:**
- Verify you have 5V **active** buzzer
- Check buzzer polarity
- Test GPIO17 manually

---

## 📊 Sensor Specifications

### MQ-6 (LPG Sensor)

- **Target Gas**: LPG, Isobutane, Propane
- **Detection Range**: 200-10,000 ppm
- **Operating Voltage**: 5V DC
- **Preheat Time**: 24 hours minimum
- **Operating Temperature**: -10°C to 50°C
- **Sensitivity**: Rs (in air) / Rs (1000ppm iso-butane) ≥ 5

### MQ-2 (Smoke Sensor)

- **Target Gas**: LPG, Propane, Hydrogen, Smoke
- **Detection Range**: 300-10,000 ppm
- **Operating Voltage**: 5V DC
- **Preheat Time**: 24 hours minimum
- **Operating Temperature**: -10°C to 50°C
- **Sensitivity**: Rs (in air) / Rs (1000ppm LPG) ≥ 5

### NEO-6M GPS

- **Channels**: 50
- **Update Rate**: 1 Hz (default), up to 5 Hz
- **Accuracy**: 2.5m CEP
- **Cold Start**: 27s
- **Warm Start**: 1s
- **Operating Voltage**: 3.3V - 5V
- **Current**: 45mA (acquiring), 30mA (tracking)

### MCP3008 ADC

- **Resolution**: 10-bit (0-1023)
- **Channels**: 8 single-ended or 4 differential
- **Sample Rate**: 200 ksps
- **Operating Voltage**: 2.7V - 5.5V
- **Interface**: SPI
- **Reference Voltage**: External (using VDD as VREF)

---

## 🛡️ Safety Considerations

### ⚠️ Important Safety Notes

1. **Gas Sensors Get Hot**: MQ sensors heat up during operation. Don't touch during use!

2. **Preheat Required**: MQ sensors need 24-48 hours to stabilize. Readings will be inaccurate before this.

3. **Not Certified**: This is an educational project. Do NOT use as primary safety device. Always install certified gas detectors.

4. **Power Supply**: Use quality 5V 2.5A power supply. Insufficient power causes erratic behavior.

5. **Ventilation**: Test gas sensors in well-ventilated area. Never expose to high gas concentrations intentionally.

6. **Wiring**: Double-check all connections before powering on. Incorrect wiring can damage components.

---

## Optional: PCB Design

For a more permanent installation, consider designing a custom PCB:

**Recommended Tools:**
- KiCad (free, open-source)
- EasyEDA (web-based)
- Fritzing (beginner-friendly)

**PCB Features:**
- Raspberry Pi Zero header
- MCP3008 socket
- Sensor connectors
- LED + resistors
- Buzzer connection
- GPS module header
- Screw terminals for external connections

---

## Enclosure Design

### Commercial Enclosures

Search for:
- "Raspberry Pi Zero enclosure with mounting"
- Minimum size: 150mm x 100mm x 50mm
- Ensure space for sensor wiring

### 3D Printed Enclosure

Design requirements:
- Ventilation holes for sensors
- Antenna pass-through for GPS
- LED light pipes
- Buzzer sound holes
- Access to microSD card
- Wall mounting points

---

## Maintenance

### Regular Checks

**Weekly:**
- Verify sensor readings are reasonable
- Check LED indicators function
- Test buzzer operation

**Monthly:**
- Clean sensor mesh (gently with compressed air)
- Verify GPS fix acquisition
- Check all physical connections

**Quarterly:**
- Recalibrate sensors
- Update system software
- Backup database

### Sensor Lifespan

- **MQ Sensors**: 2-5 years with normal use
- **GPS Module**: 5+ years
- **LEDs/Buzzer**: 10+ years

---

## Additional Resources

### Datasheets

- [MQ-6 Datasheet](https://www.pololu.com/file/0J313/MQ6.pdf)
- [MQ-2 Datasheet](https://www.pololu.com/file/0J309/MQ2.pdf)
- [MCP3008 Datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/21295d.pdf)
- [NEO-6M Manual](https://www.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_(GPS.G6-HW-09005).pdf)

### Learning Resources

- [Raspberry Pi GPIO Guide](https://www.raspberrypi.org/documentation/usage/gpio/)
- [SPI Communication Tutorial](https://learn.sparkfun.com/tutorials/serial-peripheral-interface-spi)
- [GPS NMEA Sentences](http://aprs.gids.nl/nmea/)
