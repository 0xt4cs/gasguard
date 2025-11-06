const util = require('util');
const exec = util.promisify(require('child_process').exec);

class GPIOQueue {
  constructor() {
    this.queues = new Map();
    this.processing = new Map();
    this.lastOperation = new Map();
    this.minDelay = 100;
  }

  /**
   * Add GPIO operation to queue
   * @param {number} pin - GPIO pin number
   * @param {number} value - 0 (off) or 1 (on)
   * @param {number} timeout - Operation timeout in ms (default 2000ms)
   * @returns {Promise<void>}
   */
  async enqueue(pin, value, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const operation = {
        pin,
        value,
        timeout,
        resolve,
        reject,
        retries: 0,
        maxRetries: 2
      };

      // Get or create queue for this pin
      if (!this.queues.has(pin)) {
        this.queues.set(pin, []);
      }

      // Add operation to queue
      this.queues.get(pin).push(operation);

      // Start processing if not already running
      if (!this.processing.get(pin)) {
        this.processQueue(pin);
      }
    });
  }

  /**
   * Process queued operations for a specific pin
   * @param {number} pin - GPIO pin number
   */
  async processQueue(pin) {
    // Mark as processing
    this.processing.set(pin, true);

    const queue = this.queues.get(pin);
    
    while (queue && queue.length > 0) {
      const operation = queue[0]; // Peek at first operation
      
      try {
        // Respect minimum delay between operations
        const lastOp = this.lastOperation.get(pin) || 0;
        const timeSinceLast = Date.now() - lastOp;
        if (timeSinceLast < this.minDelay) {
          await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLast));
        }

        // Execute the GPIO operation
        await this.executeOperation(operation);
        
        // Update last operation time
        this.lastOperation.set(pin, Date.now());
        
        // Operation succeeded - resolve and remove from queue
        operation.resolve();
        queue.shift();
        
      } catch (error) {
        // Operation failed
        operation.retries++;
        
        if (operation.retries < operation.maxRetries) {
          // Retry after brief delay
          console.log(`[WARNING]  GPIO ${pin} operation failed, retrying (${operation.retries}/${operation.maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.error(`[ERROR] GPIO ${pin} operation failed after ${operation.retries} retries:`, error.message);
          operation.reject(error);
          queue.shift();
        }
      }
    }

    // Done processing queue
    this.processing.set(pin, false);
  }

  /**
   * Execute a single GPIO operation
   * @param {Object} operation - Operation details
   */
  async executeOperation(operation) {
    const { pin, value, timeout } = operation;
    
    // Use absolute path to Python script
    const scriptPath = require('path').join(__dirname, '../../bin/gpio-control.py');
    const command = `python3 ${scriptPath} ${pin} ${value}`;
    
    try {
      await exec(command, {
        timeout,
        killSignal: 'SIGTERM'
      });
    } catch (error) {
      // Check if error is due to busy device
      if (error.message.includes('Device or resource busy')) {
        throw new Error(`GPIO ${pin} is busy`);
      } else if (error.killed) {
        throw new Error(`GPIO ${pin} operation timed out after ${timeout}ms`);
      } else {
        throw error;
      }
    }
  }
 // get queue status for debugging
  getStatus() {
    const status = {};
    for (const [pin, queue] of this.queues.entries()) {
      status[`GPIO${pin}`] = {
        queueLength: queue.length,
        processing: this.processing.get(pin) || false,
        lastOperation: this.lastOperation.get(pin) || null
      };
    }
    return status;
  }

  // clear all queues (for cleanup)
  clearAll() {
    for (const [pin, queue] of this.queues.entries()) {
      for (const operation of queue) {
        operation.reject(new Error('GPIO queue cleared'));
      }
      queue.length = 0;
    }
    this.processing.clear();
  }
}

// singleton instance
const gpioQueue = new GPIOQueue();

module.exports = gpioQueue;
