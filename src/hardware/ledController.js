const gpioQueue = require('./gpioQueue');

class LEDController {
  constructor() {
    this.isInitialized = false;
    this.pins = {
      red: 22,      
      green: 17,    
      yellow: 27    
    };
    this.currentColor = 'off';
    this.blinkInterval = null;
    this.blinkState = false;
    this.pendingOperations = new Map();
  }

  async initialize() {
    try {
      if (process.platform !== 'linux') {
        console.log('Not running on Raspberry Pi - using mock LED controller');
        this.isInitialized = true;
        return;
      }

      const fs = require('fs');
      const scriptPath = require('path').join(__dirname, '../../bin/gpio-control.py');
      
      if (!fs.existsSync(scriptPath)) {
        console.error('gpio-control.py not found in bin/ directory!');
        this.isInitialized = false;
        return;
      }

      this.isInitialized = true;
      
      console.log('Initializing LED status (Normal - Clean Air)...');
      await this.setColor('green');

      console.log('LED controller initialized (GPIO 17=Green, 27=Yellow, 22=Red)');
      console.log('System ready - Normal status indicated');

    } catch (error) {
      console.error('LED controller initialization failed:', error);
      this.isInitialized = true;
      console.log('LED controller initialized with errors (will try to continue)');
    }
  }

  async setPin(pin, value) {
    if (!this.isInitialized) {
      throw new Error('LED controller not initialized');
    }
    
    try {
      await gpioQueue.enqueue(pin, value, 2000); // 2 second timeout
    } catch (error) {
      console.error(`GPIO ${pin} error:`, error.message);
    }
  }

  async setColor(color) {
    if (!this.isInitialized) {
      throw new Error('LED controller not initialized');
    }

    // Stop any blinking
    this.stopBlinking();

    if (process.platform !== 'linux') {
      this.currentColor = color.toLowerCase();
      console.log(`LED color set to: ${color} (mock mode)`);
      return;
    }

    try {
      const targetColor = color.toLowerCase();
      
      switch (targetColor) {
        case 'red':
          await this.setPin(this.pins.yellow, 0);
          await this.setPin(this.pins.green, 0);
          await this.setPin(this.pins.red, 1);
          console.log('Red LED ON (Critical)');
          break;
        case 'green':
          await this.setPin(this.pins.red, 0);
          await this.setPin(this.pins.yellow, 0);
          await this.setPin(this.pins.green, 1);
          console.log('Green LED ON (Normal)');
          break;
        case 'yellow':
        case 'orange':
          await this.setPin(this.pins.red, 0);
          await this.setPin(this.pins.green, 0);
          await this.setPin(this.pins.yellow, 1);
          console.log('Yellow LED ON (Warning)');
          break;
        case 'off':
        default:
          await this.turnOff();
          break;
      }
      
      this.currentColor = targetColor;
      
    } catch (error) {
      console.error(`Failed to set LED color to ${color}:`, error.message);
    }
  }

  async setRGB(red, green, blue) {
    try {
      this.setPin(this.pins.red, red);
      this.setPin(this.pins.green, green);
      this.setPin(this.pins.yellow, blue);
    } catch (error) {
      console.error(`Failed to set LED values: ${error.message}`);
    }
  }

  async turnOff() {
    try {
      this.setPin(this.pins.red, 0);
      this.setPin(this.pins.green, 0);
      this.setPin(this.pins.yellow, 0);
      this.currentColor = 'off';
      console.log('All LEDs OFF');
    } catch (error) {
      console.error(`Failed to turn off LEDs: ${error.message}`);
    }
  }

  async blink(color, interval = 500) {
    if (!this.isInitialized) {
      throw new Error('LED controller not initialized');
    }

    this.stopBlinking();
    
    if (process.platform !== 'linux') {
      console.log(`LED blinking ${color} every ${interval}ms (mock mode)`);
      return;
    }
    
    this.blinkInterval = setInterval(async () => {
      if (this.blinkState) {
        await this.turnOff();
      } else {
        await this.setColor(color);
      }
      this.blinkState = !this.blinkState;
    }, interval);
    
    console.log(`LED blinking ${color} every ${interval}ms`);
  }

  stopBlinking() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
      this.blinkState = false;
    }
  }

  async test() {
    if (!this.isInitialized) {
      throw new Error('LED controller not initialized');
    }

    console.log('Testing LED controller...');
    
    if (process.platform !== 'linux') {
      console.log('LED test completed (mock mode)');
      return;
    }

    const colors = ['red', 'green', 'yellow'];

    for (const color of colors) {
      console.log(`Testing ${color} LED...`);
      await this.setColor(color);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    await this.turnOff();
    console.log('LED test completed');
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      currentColor: this.currentColor,
      blinking: this.blinkInterval !== null,
      platform: process.platform
    };
  }

  async cleanup() {
    this.stopBlinking();
    
    if (process.platform === 'linux') {
      try {
        await this.turnOff();

      } catch (error) {
        console.error('Error during LED cleanup:', error);
      }
    }
    
    this.isInitialized = false;
    console.log('LED controller cleanup completed');
  }
}

module.exports = LEDController;
