
const textbeeService = require('./textbeeService');
const { Contact } = require('../database/models/Contact');
const Settings = require('../database/models/Settings');
const Alert = require('../database/models/Alert');

class AlertManager {
    constructor() {
        this.detectionState = {
            level: 'normal',
            startTime: null,
            duration: 0,
            smsTriggered: false,
            lastSMSTime: null,
            detectionCount: 0
        };

        // SMS triggering thresholds
        this.SMS_TRIGGER_DELAY = 5000;
        this.SMS_COOLDOWN = 300000; // 5mins cooldown between SMS for same level
        
        this.persistenceTimer = null;
        
        console.log('[ALERT MANAGER] Initialized with SMS trigger delay:', this.SMS_TRIGGER_DELAY / 1000, 'seconds');
    }

     //Update alert state with new gas detection level.
    async updateAlertLevel(newLevel, sensorData) {
        const previousLevel = this.detectionState.level;
        const now = Date.now();

        // Level changed
        if (newLevel !== previousLevel) {
            console.log(`[ALERT MANAGER] Level changed: ${previousLevel} → ${newLevel}`);
            
            // Clear any pending SMS timer
            this.clearPersistenceTimer();
            
            // If going back to normal, reset everything
            if (newLevel === 'normal') {
                this.resetDetectionState();
                return;
            }

            // New alert level detected - start tracking
            this.detectionState = {
                level: newLevel,
                startTime: now,
                duration: 0,
                smsTriggered: false,
                lastSMSTime: this.detectionState.lastSMSTime,
                detectionCount: 1
            };

            // Start persistence timer
            this.startPersistenceTimer(newLevel, sensorData);
        } 
        // Same level continues - update duration
        else if (newLevel !== 'normal') {
            this.detectionState.duration = now - this.detectionState.startTime;
            this.detectionState.detectionCount++;
            
            console.log(`[ALERT MANAGER] ${newLevel.toUpperCase()} persisting for ${(this.detectionState.duration / 1000).toFixed(1)}s (${this.detectionState.detectionCount} readings)`);
        }
    }

    // Start timer to trigger SMS after persistent detection
    startPersistenceTimer(level, sensorData) {
        // Clear any existing timer
        this.clearPersistenceTimer();

        console.log(`[ALERT MANAGER] Starting ${this.SMS_TRIGGER_DELAY / 1000}s persistence timer for ${level.toUpperCase()} level`);

        this.persistenceTimer = setTimeout(async () => {
            await this.triggerSMSAlert(level, sensorData);
        }, this.SMS_TRIGGER_DELAY);
    }

    // Clear persistence timer
    clearPersistenceTimer() {
        if (this.persistenceTimer) {
            clearTimeout(this.persistenceTimer);
            this.persistenceTimer = null;
            console.log('[ALERT MANAGER] Persistence timer cleared');
        }
    }

    // Trigger SMS alert after persistent detection
    async triggerSMSAlert(level, sensorData) {
        try {
            // Check if already triggered for this detection
            if (this.detectionState.smsTriggered) {
                console.log('[ALERT MANAGER] SMS already triggered for this detection - skipping');
                return;
            }

            // Check cooldown period
            if (this.detectionState.lastSMSTime) {
                const timeSinceLastSMS = Date.now() - this.detectionState.lastSMSTime;
                if (timeSinceLastSMS < this.SMS_COOLDOWN) {
                    const cooldownRemaining = Math.ceil((this.SMS_COOLDOWN - timeSinceLastSMS) / 1000);
                    console.log(`[ALERT MANAGER] SMS cooldown active - ${cooldownRemaining}s remaining`);
                    return;
                }
            }

            // Check if SMS alerts are enabled
            const smsEnabled = textbeeService.isConfigured();
            if (!smsEnabled) {
                console.log('[ALERT MANAGER] SMS alerts disabled - skipping');
                return;
            }

            console.log(`[ALERT MANAGER] TRIGGERING SMS ALERT - ${level.toUpperCase()} level persisted for ${this.SMS_TRIGGER_DELAY / 1000}s`);

            // Get global profile settings for location info (profile is shared across all users - use admin user_id = 2)
            const settings = await Settings.getByUserId(2);
            
            // Prepare location - priority: current GPS > last known GPS > manual address (fallback)
            let location = 'Unknown location';
            let locationLink = null;
            
            if (sensorData.gpsData?.latitude && sensorData.gpsData?.longitude) {
                // 1st Priority: Current GPS coordinates - create Google Maps link
                const lat = sensorData.gpsData.latitude;
                const lng = sensorData.gpsData.longitude;
                location = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                locationLink = `https://maps.google.com/?q=${lat},${lng}`;
            } else if (sensorData.gpsData?.lastKnownLocation?.latitude && sensorData.gpsData?.lastKnownLocation?.longitude) {
                // 2nd Priority: Last known GPS location (fallback when signal lost)
                const lat = sensorData.gpsData.lastKnownLocation.latitude;
                const lng = sensorData.gpsData.lastKnownLocation.longitude;
                location = `GPS (last known): ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                locationLink = `https://maps.google.com/?q=${lat},${lng}`;
                
                // Add age of location if available
                if (sensorData.gpsData.locationAge) {
                    location += ` - ${sensorData.gpsData.locationAge} old`;
                }
            } else if (settings && settings.address) {
                // 3rd Priority (Fallback): Manual address configured
                location = settings.address;
                if (settings.landmark) location += `, ${settings.landmark}`;
            }

            // Prepare alert data for SMS
            const alertData = {
                gasType: sensorData.fused?.gasType || 'Unknown',
                level: level,
                mq6Value: sensorData.mq6?.ppm?.toFixed(1) || 'N/A',
                mq2Value: sensorData.mq2?.ppm?.toFixed(1) || 'N/A',
                location: location,
                locationLink: locationLink,
                profileName: settings?.full_name || 'Unknown',
                profilePhone: settings?.phone || 'Not set'
            };

            // Get contacts based on level
            let contacts = [];
            
            if (level === 'low') {
                // LOW: Profile + Internal contacts only (family, neighbors, anyone nearby)
                const internalContacts = await Contact.getInternalContacts(2);
                contacts = internalContacts || [];
                
                // Add profile contact if phone is set
                if (settings && settings.phone) {
                    contacts.unshift({
                        id: 0,
                        type: 'profile',
                        name: settings.full_name || 'Profile Contact',
                        phone: settings.phone
                    });
                }
                
                console.log(`[ALERT MANAGER] LOW level - Notifying ${contacts.length} contacts (profile + internal: family/neighbors)`);
            } 
            else if (level === 'critical') {
                // CRITICAL: Profile + Internal (family/neighbors) + External (fire dept/emergency services)
                const internalContacts = await Contact.getInternalContacts(2) || [];
                const externalContacts = await Contact.getExternalContacts() || [];
                contacts = [...internalContacts, ...externalContacts];
                
                // Add profile contact if phone is set
                if (settings && settings.phone) {
                    contacts.unshift({
                        id: 0,
                        type: 'profile',
                        name: settings.full_name || 'Profile Contact',
                        phone: settings.phone
                    });
                }
                
                console.log(`[ALERT MANAGER] CRITICAL level - Notifying ${contacts.length} contacts (profile + ${internalContacts.length} internal + ${externalContacts.length} external)`);
            }

            if (contacts.length === 0) {
                console.log('[ALERT MANAGER] No contacts configured - skipping SMS');
                return;
            }

            // Send SMS alerts via TextBee
            const result = await textbeeService.sendGasLeakAlert(contacts, level, alertData);

            // Mark SMS as triggered
            this.detectionState.smsTriggered = true;
            this.detectionState.lastSMSTime = Date.now();

            // Update the most recent alert of this level to mark SMS as sent
            try {
                const recentAlert = await Alert.getMostRecentByType(level);
                if (recentAlert && !recentAlert.sms_sent) {
                    await Alert.markSmsSent(recentAlert.id);
                    console.log(`[ALERT MANAGER] Alert ID ${recentAlert.id} marked as SMS sent`);
                }
            } catch (updateError) {
                console.error('[ALERT MANAGER] Failed to update alert SMS status:', updateError.message);
            }

            // Log success
            const sentCount = result.recipients ? result.recipients.length : contacts.length;
            console.log(`[ALERT MANAGER] ${level.toUpperCase()} alert SMS sent to ${sentCount} contacts after ${this.SMS_TRIGGER_DELAY / 1000}s persistent detection`);
            console.log(`[ALERT MANAGER] SMS alert sent successfully to ${sentCount} contact(s)`);

        } catch (error) {
            console.error('[ALERT MANAGER] Error sending SMS alert:', error);
            console.error(`[ALERT MANAGER] Failed to send ${level} alert: ${error.message}`);
        }
    }

    // Reset detection state when gas clears
    resetDetectionState() {
        this.clearPersistenceTimer();
        
        const wasSMSTriggered = this.detectionState.smsTriggered;
        const duration = this.detectionState.duration;
        
        if (wasSMSTriggered) {
            console.log(`[ALERT MANAGER] Gas cleared - SMS was triggered during this detection (lasted ${(duration / 1000).toFixed(1)}s)`);
        } else if (duration > 0) {
            console.log(`[ALERT MANAGER] Gas cleared - SMS not triggered (only lasted ${(duration / 1000).toFixed(1)}s, needed ${this.SMS_TRIGGER_DELAY / 1000}s)`);
        }

        this.detectionState = {
            level: 'normal',
            startTime: null,
            duration: 0,
            smsTriggered: false,
            lastSMSTime: this.detectionState.lastSMSTime, // Keep cooldown
            detectionCount: 0
        };
    }

    // Get current detection state for debugging/monitoring
    getState() {
        return {
            ...this.detectionState,
            durationSeconds: this.detectionState.duration / 1000,
            triggerThreshold: this.SMS_TRIGGER_DELAY / 1000,
            cooldownRemaining: this.detectionState.lastSMSTime 
                ? Math.max(0, Math.ceil((this.SMS_COOLDOWN - (Date.now() - this.detectionState.lastSMSTime)) / 1000))
                : 0
        };
    }

    // Manually trigger test SMS for testing configuration
    async sendTestAlert() {
        try {
            const testData = {
                gasType: 'TEST',
                level: 'test',
                mq6Value: '0.0',
                mq2Value: '0.0',
                location: 'Test Location'
            };

            const settings = await Settings.getByUserId(2); // Admin user for global settings
            if (!settings || !settings.phone) {
                throw new Error('Profile phone number not configured');
            }

            const testContact = [{
                id: 0,
                contact_type: 'profile',
                name: settings.full_name || 'Test User',
                phone: settings.phone
            }];

            await textbeeService.sendGasLeakAlert(testContact, 'TEST', testData);
            console.log('[ALERT MANAGER] Test alert sent successfully');
            
            return { success: true, message: 'Test SMS sent' };
        } catch (error) {
            console.error('[ALERT MANAGER] Test alert failed:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new AlertManager();
