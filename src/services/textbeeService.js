/**
 * TextBee SMS Service
 * 
 * Handles SMS notifications via TextBee API
 * TextBee is a free SMS gateway that uses your Android phone
 * 
 * @see https://textbee.dev
 */

const axios = require('axios');
const Settings = require('../database/models/Settings');

class TextBeeService {
  constructor() {
    this.apiBaseUrl = 'https://api.textbee.dev/api/v1';
    this.apiKey = null;
    this.deviceId = null;
    this.enabled = false;
    this.initialized = false;
  }

  /**
   * Initialize TextBee service with configuration from database
   * Loads API credentials and checks if SMS alerts are enabled
   */
  async initialize() {
    try {
      console.log('[TextBee] Fetching settings from database...');
      
      const settings = await this.getSettings();
      
      console.log('[TextBee] Settings retrieved successfully');

      this.enabled = Boolean(settings?.sms_alerts_enabled);
      this.apiKey = settings?.textbee_api_key;
      this.deviceId = settings?.textbee_device_id;

      if (!this.enabled) {
        console.log('[TextBee] SMS alerts are disabled');
        this.initialized = false;
        return;
      }

      if (!this.apiKey || !this.deviceId) {
        console.warn('[TextBee] SMS service not configured (missing API Key or Device ID)');
        this.initialized = false;
        return;
      }

      this.initialized = true;
      console.log('[TextBee] SMS service initialized successfully');
      console.log(`[TextBee] API Key: ${this.apiKey.substring(0, 8)}...`);
      console.log(`[TextBee] Device ID: ${this.deviceId.substring(0, 8)}...`);

    } catch (error) {
      console.error('[TextBee] Error initializing SMS service:', error.message);
      this.initialized = false;
    }
  }
  
  /**
   * Get settings from database with timeout protection
   * Uses user_id = 2 (admin) for global SMS configuration
   * 
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database query timeout after 5 seconds'));
      }, 5000);

      // Global SMS config stored under admin user (user_id = 2)
      Settings.getByUserId(2)
        .then(settings => {
          clearTimeout(timeout);
          resolve(settings);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Validate TextBee API credentials format
   * 
   * @param {string} apiKey - TextBee API key
   * @param {string} deviceId - TextBee device ID
   * @returns {Object} Validation result
   */
  async validateCredentials(apiKey = this.apiKey, deviceId = this.deviceId) {
    if (!apiKey || !deviceId) {
      return { valid: false, error: 'API Key and Device ID are required' };
    }

    if (apiKey.trim().length === 0) {
      return { valid: false, error: 'API Key cannot be empty' };
    }

    if (deviceId.trim().length === 0) {
      return { valid: false, error: 'Device ID cannot be empty' };
    }

    console.log('[TextBee] Credentials format validated');
    return { valid: true };
  }

  /**
   * Send SMS to a single recipient or multiple recipients
   * 
   * @param {string|string[]} to - Phone number(s) in E.164 format (e.g., +639171234567)
   * @param {string} message - SMS message body
   * @returns {Promise<Object>} Response with success status and details
   */
  async sendSMS(to, message) {
    if (!this.initialized) {
      throw new Error('TextBee service not initialized or disabled');
    }

    if (!this.apiKey || !this.deviceId) {
      throw new Error('TextBee not configured properly');
    }

    // Convert single recipient to array
    let recipients = Array.isArray(to) ? to : [to];

    // Validate recipients
    if (recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    // Normalize Philippine phone numbers and validate
    recipients = recipients.map(recipient => {
      let phone = recipient.trim();
      
      // If already has +63, use as is
      if (phone.startsWith('+63')) {
        return phone;
      }
      
      // If starts with 63 (without +), add +
      if (phone.startsWith('63') && phone.length === 12) {
        return '+' + phone;
      }
      
      // If starts with 0 (local format like 09171234567), convert to +63
      if (phone.startsWith('0') && phone.length === 11) {
        return '+63' + phone.substring(1);
      }
      
      // If it's 10 digits starting with 9 (like 9171234567), add +63
      if (phone.startsWith('9') && phone.length === 10) {
        return '+63' + phone;
      }
      
      // If it starts with + but not +63, reject (only PH numbers allowed)
      if (phone.startsWith('+') && !phone.startsWith('+63')) {
        throw new Error(`Only Philippine phone numbers are supported. Got: ${phone}`);
      }
      
      throw new Error(`Invalid Philippine phone number format: ${phone}. Expected formats: +639171234567, 09171234567, or 9171234567`);
    });

    try {
      console.log(`[TextBee] Sending SMS to ${recipients.length} recipient(s)...`);
      console.log(`[TextBee] Recipients: ${recipients.join(', ')}`);
      console.log(`[TextBee] Message: ${message.substring(0, 50)}...`);
      console.log(`[TextBee] Full API URL: ${this.apiBaseUrl}/gateway/devices/${this.deviceId}/send-sms`);
      console.log(`[TextBee] Device ID: ${this.deviceId}`);
      console.log(`[TextBee] API Key: ${this.apiKey?.substring(0, 8)}...`);

      // Send SMS to multiple recipients with same message
      const response = await axios.post(
        `${this.apiBaseUrl}/gateway/devices/${this.deviceId}/send-sms`,
        {
          recipients: recipients,
          message: message
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      console.log('[TextBee] API Response Status:', response.status);
      console.log('[TextBee] API Response Data:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.data) {
        console.log(`[TextBee] SMS sent successfully to ${recipients.length} recipient(s)`);
        
        return {
          success: true,
          messageId: response.data.data._id || response.data.data.smsBatchId || response.data.data.id,
          recipients: recipients,
          status: response.data.data.status || 'pending',
          response: response.data
        };
      }

      // Simplified response
      if (response.data && response.status === 200) {
        console.log(`[TextBee] SMS sent successfully (simplified response)`);
        return {
          success: true,
          messageId: response.data._id || response.data.id || 'unknown',
          recipients: recipients,
          status: 'sent',
          response: response.data
        };
      }

      throw new Error('Unexpected response from TextBee API');

    } catch (error) {
      console.error('[TextBee] Error sending SMS:', error.message);
      
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;

        console.error(`[TextBee] API Error Response [${status}]:`, JSON.stringify(errorData, null, 2));

        if (status === 401 || status === 403) {
          throw new Error('TextBee API authentication failed. Please check your API Key.');
        } else if (status === 404) {
          // Try alternative endpoint
          console.log('[TextBee] Trying alternative endpoint: /send-sms');
          try {
            const retryResponse = await axios.post(
              `${this.apiBaseUrl}/gateway/devices/${this.deviceId}/send-sms`,
              {
                recipients: recipients,
                message: message
              },
              {
                headers: {
                  'x-api-key': this.apiKey,
                  'Content-Type': 'application/json'
                },
                timeout: 15000
              }
            );

            if (retryResponse.data) {
              console.log(`[TextBee] SMS sent successfully via alternative endpoint`);
              return {
                success: true,
                messageId: retryResponse.data.data?._id || retryResponse.data._id || 'unknown',
                recipients: recipients,
                status: 'sent',
                response: retryResponse.data
              };
            }
          } catch (retryError) {
            console.error('[TextBee] Alternative endpoint also failed:', retryError.message);
            throw new Error('TextBee device not found. Please check your Device ID.');
          }
        } else if (status === 400 && errorData?.error) {
          throw new Error(`TextBee API error: ${errorData.error}`);
        } else if (errorData?.message) {
          throw new Error(`TextBee API error: ${errorData.message}`);
        }
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to TextBee API. Please check your internet connection.');
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error('TextBee API request timed out. Please try again.');
      }

      throw new Error(`Failed to send SMS via TextBee: ${error.message}`);
    }
  }

  /**
   * Send gas leak alert to multiple contacts
   * 
   * @param {Array} contacts - Array of contact objects with phone numbers
   * @param {string} alertLevel - Alert level ('LOW' or 'CRITICAL')
   * @param {Object} sensorData - Sensor data for alert context
   * @returns {Promise<Object>} Send results
   */
  async sendGasLeakAlert(contacts, alertLevel, sensorData) {
    if (!this.initialized) {
      throw new Error('TextBee service not initialized');
    }

    if (!contacts || contacts.length === 0) {
      throw new Error('No contacts provided for alert');
    }

    // Extract phone numbers from contacts
    const recipients = contacts.map(contact => contact.phone).filter(phone => phone);

    if (recipients.length === 0) {
      throw new Error('No valid phone numbers found in contacts');
    }

    // Craft professional alert message without emojis
    const levelText = alertLevel.toUpperCase();
    const timestamp = new Date().toLocaleString('en-PH', { 
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    // Safety instructions based on level
    let safetyInstructions = '';
    if (alertLevel === 'critical') {
      safetyInstructions = 'IMMEDIATE ACTION REQUIRED:\n' +
        '1. EVACUATE the area immediately\n' +
        '2. Do NOT use any electrical switches\n' +
        '3. Do NOT light matches or create sparks\n' +
        '4. Call emergency services (911)\n' +
        '5. Turn off gas supply if safe to do so\n' +
        '6. Ventilate the area from outside';
    } else {
      safetyInstructions = 'RECOMMENDED ACTIONS:\n' +
        '1. Open windows and doors for ventilation\n' +
        '2. Check for gas source (stove, leaks, etc.)\n' +
        '3. Turn off unnecessary gas appliances\n' +
        '4. Monitor the situation closely\n' +
        '5. Evacuate if levels continue to rise';
    }
    
    // Build message
    let message = `GasGuard LEAK DETECTED: ${levelText} LEVEL\n\n`;
    message += `Gas Type: ${sensorData.gasType}\n`;
    message += `MQ6 Reading: ${sensorData.mq6Value} PPM\n`;
    message += `MQ2 Reading: ${sensorData.mq2Value} PPM\n`;
    message += `Time: ${timestamp}\n\n`;
    message += `Location: ${sensorData.location}\n`;
    if (sensorData.locationLink) {
      message += `Map: ${sensorData.locationLink}\n`;
    }
    message += `\nContact: ${sensorData.profileName}\n`;
    message += `Phone: ${sensorData.profilePhone}\n\n`;
    message += `${safetyInstructions}\n\n`;
    message += `- GasGuard IoT Gas Detection System`;

    try {
      const result = await this.sendSMS(recipients, message);
      
      console.log(`[TextBee] Gas leak alert sent to ${recipients.length} contact(s)`);
      console.log(`[TextBee] Alert level: ${alertLevel}, Recipients: ${recipients.join(', ')}`);

      return result;
    } catch (error) {
      console.error('[TextBee] Failed to send gas leak alert:', error.message);
      throw error;
    }
  }

  /**
   * Check if TextBee service is configured and ready
   */
  isConfigured() {
    return this.initialized && this.enabled;
  }

  /**
   * Get current configuration status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      configured: Boolean(this.apiKey && this.deviceId),
      apiKeySet: Boolean(this.apiKey),
      deviceIdSet: Boolean(this.deviceId)
    };
  }
}

// Export singleton instance
module.exports = new TextBeeService();
