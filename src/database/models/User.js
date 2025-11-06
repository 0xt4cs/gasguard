const BaseModel = require('./BaseModel');

class User extends BaseModel {
  constructor() {
    super('users');
  }

  // Find user by username
  async findByUsername(username) {
    return await this.findOne({ username });
  }

  // Get user with settings
  async getUserWithSettings(userId) {
    const sql = `
      SELECT 
        u.id, u.username, u.role, u.created_at,
        s.full_name, s.address, s.landmark, s.phone,
        s.gps_enabled, s.gps_latitude, s.gps_longitude,
        s.low_level_threshold, s.critical_level_threshold,
        s.sms_alerts_enabled, s.buzz_on_low, s.buzz_on_critical
      FROM users u
      LEFT JOIN settings s ON u.id = s.user_id
      WHERE u.id = ?
    `;
    return await this.queryOne(sql, [userId]);
  }
}

module.exports = new User();


