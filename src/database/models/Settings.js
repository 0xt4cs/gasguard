const BaseModel = require('./BaseModel');

class Settings extends BaseModel {
  constructor() {
    super('settings');
  }

  // Get settings by user ID
  async getByUserId(userId) {
    return await this.findOne({ user_id: userId });
  }

  // Update settings by user ID
  async updateByUserId(userId, data) {
    const settings = await this.getByUserId(userId);
    if (settings) {
      return await this.update(settings.id, data);
    }
    
    // Create if doesn't exist
    return await this.create({ ...data, user_id: userId });
  }

  // Update GPS location
  async updateGPS(userId, latitude, longitude, enabled = true) {
    return await this.updateByUserId(userId, {
      gps_latitude: latitude,
      gps_longitude: longitude,
      gps_enabled: enabled ? 1 : 0
    });
  }

  // Update alert thresholds
  async updateThresholds(userId, lowThreshold, criticalThreshold) {
    return await this.updateByUserId(userId, {
      low_level_threshold: lowThreshold,
      critical_level_threshold: criticalThreshold
    });
  }
}

module.exports = new Settings();


