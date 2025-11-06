const { spawn } = require('child_process');

let spi;
if (process.platform === 'linux') {
  spi = require('spi-device');
}

class MCP3008 {
  constructor() {
    this.isInitialized = false;
    this.channels = 8; // MCP3008 has 8 channels
    this.resolution = 1024; // 10-bit ADC
    this.referenceVoltage = 3.3; // 3.3V reference
  }

  async initialize() {
    try {
      if (process.platform !== 'linux') {
        console.log('Not running on Raspberry Pi - using mock MCP3008');
        this.isInitialized = true;
        return;
      }

      // await this.checkSPI();
      
      await this.initSPI();
      
      this.isInitialized = true;
      console.log('MCP3008 initialized');
    } catch (error) {
      console.error('MCP3008 initialization failed:', error);
      throw error;
    }
  }

  async checkSPI() {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const checkSpi = spawn('sh', ['-c', 'lsmod | grep spi']);
      
      checkSpi.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('SPI module not loaded. Please enable SPI in raspi-config.'));
        }
      });
      
      checkSpi.on('error', (error) => {
        reject(new Error(`Failed to check SPI: ${error.message}`));
      });
    });
  }

  async initSPI() {
    if (!spi) {
      console.log('SPI not available on this platform, using mock mode');
      this.spiDevice = null;
      return;
    }

    try {
      // Initialize SPI device
      this.spiDevice = spi.openSync(0, 0); // Bus 0, Device 0 (/dev/spidev0.0)
      console.log('SPI communication initialized');
    } catch (error) {
      console.log('SPI initialization failed, using mock mode:', error.message);
      this.spiDevice = null;
    }
  }

  async readChannel(channel) {
    if (!this.isInitialized) {
      throw new Error('MCP3008 not initialized');
    }

    if (channel < 0 || channel >= this.channels) {
      throw new Error(`Invalid channel: ${channel}. Must be 0-${this.channels - 1}`);
    }

    if (process.platform !== 'linux' || !this.spiDevice) {
      const rawValue = Math.floor(Math.random() * 50) + 100;
      return {
        raw: rawValue,
        voltage: (rawValue / this.resolution) * this.referenceVoltage,
        percentage: (rawValue / this.resolution) * 100
      };
    }

    try {
      const rawValue = await this.spiRead(channel);
      
      return {
        raw: rawValue,
        voltage: (rawValue / this.resolution) * this.referenceVoltage,
        percentage: (rawValue / this.resolution) * 100
      };
    } catch (error) {
      throw new Error(`Failed to read channel ${channel}: ${error.message}`);
    }
  }

  async spiRead(channel) {
    if (!this.spiDevice) {
      throw new Error('SPI device not initialized - cannot read real sensor data');
    }

    try {
      // MCP3008 SPI communication
      const command = 0x01; // Start bit
      const channelBits = (channel << 4) & 0xF0;
      const commandByte = command | channelBits;
      
      const message = [{
        sendBuffer: Buffer.from([commandByte, 0x00, 0x00]),
        receiveBuffer: Buffer.alloc(3),
        byteLength: 3,
        speedHz: 1000000
      }];
      
      this.spiDevice.transferSync(message);
      
      const rawValue = ((message[0].receiveBuffer[1] & 0x03) << 8) | message[0].receiveBuffer[2];
      
      return rawValue;
    } catch (error) {
      throw new Error(`SPI read error on channel ${channel}: ${error.message}`);
    }
  }

  async test() {
    if (!this.isInitialized) {
      throw new Error('MCP3008 not initialized');
    }

    console.log('Testing MCP3008...');
    
    for (let channel = 0; channel < this.channels; channel++) {
      try {
        const reading = await this.readChannel(channel);
        console.log(`Channel ${channel}: ${reading.raw} (${reading.voltage.toFixed(2)}V)`);
      } catch (error) {
        console.error(`Channel ${channel} test failed:`, error);
        throw error;
      }
    }

    console.log('MCP3008 test completed');
  }

  async cleanup() {
    if (this.spiDevice) {
      try {
        this.spiDevice.closeSync();
      } catch (error) {
        console.error('Error closing SPI device:', error);
      }
    }
    this.isInitialized = false;
    console.log('MCP3008 cleanup completed');
  }
}

module.exports = MCP3008;
