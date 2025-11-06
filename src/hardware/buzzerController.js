const gpioQueue = require('./gpioQueue');

class BuzzerController {
  constructor() {
    this.isInitialized = false;
    this.gpioPin = 18; // GPIO pin for buzzer
    this.isActive = false;
    this.currentPattern = null;
    this.patternInterval = null;
    this.patternStep = 0;
    this.holdTimer = null;
    this.isHolding = false;
    this.holdTimeRemaining = 0;
    this.alertStartTime = null;
    this.alertDuration = 0;
    this.activeTimeouts = [];
    
    // Buzzer patterns
    this.patterns = {
      low: {
        name: 'Low Level Alert - Intermittent Beeps',
        sequence: [
          { on: 130, off: 130 },  // Beep
          { on: 160, off: 130 }   // Short pause before repeating
        ],
        repeat: true,
        holdTime: 0,
        description: 'Rapid beep-beep-beep-beep pattern, stops immediately when gas clears'
      },
      critical: {
        name: 'Critical Alert - Continuous Long Beep',
        sequence: [
          { on: 10000, off: 200 }, // Long continuous beep (10 seconds)
          { on: 15000, off: 200 }  // Another long beep (15 seconds)
        ],
        repeat: true,
        holdTime: 0,
        description: 'Long continuous beeping, stops immediately when gas clears'
      },
      test: {
        name: 'Test Pattern',
        sequence: [
          { on: 200, off: 200 },
          { on: 200, off: 200 },
          { on: 200, off: 200 },
          { on: 0, off: 1000 }
        ],
        repeat: false,
        holdTime: 0,
        description: 'Test beep sequence'
      }
    };
  }

  async setPin(pin, value) {
    try {
      await gpioQueue.enqueue(pin, value, 2000); // 2 second timeout
    } catch (error) {
      console.error(`[WARNING]  GPIO ${pin} buzzer error:`, error.message);
    }
  }

  async initialize() {
    try {
      if (process.platform !== 'linux') {
        console.log('[WARNING]  Running in development mode - Buzzer controller using mock implementation');
        this.gpioPin = null;
        this.isInitialized = true;
        console.log('[OK] Buzzer controller initialized (mock mode)');
        return;
      }

      // Verify Python GPIO script exists
      const fs = require('fs');
      const scriptPath = require('path').join(__dirname, '../../bin/gpio-control.py');
      
      if (!fs.existsSync(scriptPath)) {
        console.error('[ERROR] gpio-control.py not found in bin/ directory!');
        this.gpioPin = null;
        this.isInitialized = false;
        return;
      }

      console.log(`[OK] Buzzer connected to GPIO ${this.gpioPin} (Python gpiod)`);
      
      // Set initialized
      this.isInitialized = true;

      await this.turnOff();
      console.log('[OK] Buzzer controller initialized');

    } catch (error) {
      console.error('Buzzer controller initialization failed:', error);
      // Mark as initialized anyway so we can continue
      this.isInitialized = true;
      console.log('[WARNING]  Buzzer controller initialized with errors (will try to continue)');
    }
  }

  async turnOn() {
    if (!this.isInitialized) {
      throw new Error('Buzzer controller not initialized');
    }

    if (!this.gpioPin) {
      console.log('[WARNING]  Buzzer GPIO pin not configured - using mock mode');
      this.isActive = true;
      return;
    }

    try {
      await this.setPin(this.gpioPin, 1);
      this.isActive = true;
    } catch (error) {
      console.error(`Failed to turn on buzzer: ${error.message}`);
      this.isActive = true;
    }
  }

  async turnOff() {
    if (!this.isInitialized) {
      throw new Error('Buzzer controller not initialized');
    }

    if (!this.gpioPin) {
      this.isActive = false;
      return;
    }

    try {
      await this.setPin(this.gpioPin, 0);
      this.isActive = false;
    } catch (error) {
      console.error(`Failed to turn off buzzer: ${error.message}`);
      this.isActive = false;
    }
  }

  async start(patternName) {
    if (!this.isInitialized) {
      throw new Error('Buzzer controller not initialized');
    }

    const pattern = this.patterns[patternName];
    if (!pattern) {
      throw new Error(`Unknown buzzer pattern: ${patternName}`);
    }

    if (this.currentPattern === patternName && !this.isHolding) {
      this.stopHoldTimer();
      return;
    }

    await this.stop();

    this.currentPattern = patternName;
    this.patternStep = 0;
    this.alertStartTime = new Date();
    this.alertDuration = 0;
    this.isHolding = false;
    this.holdTimeRemaining = 0;
    
    console.log(`[SOUND] Starting buzzer pattern: ${pattern.name}`);
    this.playPatternStep();
  }

  startHoldTimer() {
    if (!this.currentPattern) return;
    
    const pattern = this.patterns[this.currentPattern];
    if (!pattern.holdTime || pattern.holdTime <= 0) {
      this.stop();
      return;
    }

    if (this.isHolding) {
      return;
    }

    this.isHolding = true;
    this.holdTimeRemaining = pattern.holdTime;
    
    console.log(`[TIMER]  Gas cleared - continuing buzzer for ${pattern.holdTime/1000}s (hold time)`);
    
    if (!this.currentPattern || this.patternStep >= pattern.sequence.length) {
      this.patternStep = 0;
      this.playPatternStep();
    }
    
    this.holdTimer = setTimeout(() => {
      console.log(`[OK] Hold timer completed - stopping buzzer`);
      this.stop();
    }, pattern.holdTime);
  }

  stopHoldTimer() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
      if (this.isHolding) {
        console.log('[TIMER]  Hold timer cancelled - gas detected again');
      }
    }
    this.isHolding = false;
    this.holdTimeRemaining = 0;
  }

  playPatternStep() {
    if (!this.currentPattern) return;

    const pattern = this.patterns[this.currentPattern];
    const step = pattern.sequence[this.patternStep];
    
    if (!step) {
      if (pattern.repeat && this.currentPattern) {
        this.patternStep = 0;
        this.playPatternStep();
      } else {
        this.stop();
      }
      return;
    }

    if (step.on > 0) {
      this.turnOn().catch(err => console.error('Buzzer turn on error:', err));
      
      const timeout1 = setTimeout(async () => {
        if (!this.currentPattern) return;
        
        await this.turnOff();
        
        if (step.off > 0) {
          const timeout2 = setTimeout(() => {
            if (!this.currentPattern) return;
            
            this.patternStep++;
            this.playPatternStep();
          }, step.off);
          this.activeTimeouts.push(timeout2);
        } else {
          if (!this.currentPattern) return;
          
          this.patternStep++;
          this.playPatternStep();
        }
      }, step.on);
      this.activeTimeouts.push(timeout1);
      
    } else {
      const timeout = setTimeout(() => {
        if (!this.currentPattern) return;
        
        this.patternStep++;
        this.playPatternStep();
      }, step.off);
      this.activeTimeouts.push(timeout);
    }
  }

  async stop() {
    this.activeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.activeTimeouts = [];
    
    if (this.patternInterval) {
      clearTimeout(this.patternInterval);
      this.patternInterval = null;
    }
    
    this.stopHoldTimer();
    
    if (this.isInitialized) {
      await this.turnOff();
    }
    
    this.currentPattern = null;
    this.patternStep = 0;
    this.isHolding = false;
    this.holdTimeRemaining = 0;
    this.alertStartTime = null;
    this.alertDuration = 0;
    
    console.log('[MUTE] Buzzer stopped');
  }

  async beep(duration = 200) {
    if (!this.isInitialized) {
      throw new Error('Buzzer controller not initialized');
    }

    await this.turnOn();
    setTimeout(async () => {
      await this.turnOff();
    }, duration);
  }

  async test() {
    if (!this.isInitialized) {
      throw new Error('Buzzer controller not initialized');
    }

    console.log('Testing buzzer controller...');
    
    console.log('Testing single beep...');
    await this.beep(200);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Testing low level pattern...');
    await this.start('low');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.stop();
    
    console.log('Testing critical pattern...');
    await this.start('critical');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.stop();
    
    console.log('[OK] Buzzer test completed');
  }

  getStatus() {
    const now = new Date();
    this.alertDuration = this.alertStartTime ? (now - this.alertStartTime) / 1000 : 0;
    
    return {
      initialized: this.isInitialized,
      active: this.isActive,
      currentPattern: this.currentPattern,
      isHolding: this.isHolding,
      holdTimeRemaining: this.holdTimeRemaining,
      alertDuration: this.alertDuration,
      platform: process.platform,
      gpioPin: this.gpioPin
    };
  }

  getAvailablePatterns() {
    return Object.keys(this.patterns).map(key => ({
      name: key,
      description: this.patterns[key].name,
      sequence: this.patterns[key].sequence,
      repeat: this.patterns[key].repeat
    }));
  }

  async cleanup() {
    if (this.isInitialized) {
      await this.stop();
      
      if (process.platform === 'linux' && this.gpioPin) {
        try {
          await this.turnOff();
        } catch (error) {
          console.error('Error during buzzer cleanup:', error);
        }
      }
    }
    
    this.isInitialized = false;
    console.log('[OK] Buzzer controller cleanup completed');
  }
}

module.exports = BuzzerController;
