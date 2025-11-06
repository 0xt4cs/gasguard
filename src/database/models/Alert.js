// Alert Model
const BaseModel = require('./BaseModel');

class Alert extends BaseModel {
  constructor() {
    super('alerts');
  }

  /**
   * Create new alert for a sensor reading
   * @param {number} sensorDataId - Reference to sensor_data.id
   * @param {string} alertType - 'low' or 'critical'
   * @param {Array} recipients - Contact objects that will receive SMS
   * @returns {Promise<object>} Created alert
   */
  async createAlert(sensorDataId, alertType, recipients = []) {
    const recipientData = recipients.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      type: c.type
    }));

    return await this.create({
      sensor_data_id: sensorDataId,
      alert_type: alertType,
      sms_sent: false,
      sms_recipients: JSON.stringify(recipientData),
      sms_sent_at: null
    });
  }

  /**
   * Mark alert SMS as sent
   * @param {number} alertId - Alert ID
   * @returns {Promise<object>} Updated alert
   */
  async markSmsSent(alertId) {
    return await this.update(alertId, {
      sms_sent: true,
      sms_sent_at: new Date().toISOString()
    });
  }

  /**
   * Get most recent alert by type (for updating SMS status)
   * @param {string} alertType - 'low' or 'critical'
   * @returns {Promise<object|null>} Most recent alert of that type
   */
  async getMostRecentByType(alertType) {
    const query = `
      SELECT * FROM alerts 
      WHERE alert_type = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const row = await this.db.get(query, [alertType]);
    return row || null;
  }

  /**
   * Get alert with full sensor data (JOIN)
   * @param {number} alertId - Alert ID
   * @returns {Promise<object|null>} Alert with sensor details
   */
  async getAlertWithSensorData(alertId) {
    const query = `
      SELECT 
        a.*,
        sd.timestamp as sensor_timestamp,
        sd.mq6_ppm,
        sd.mq6_raw,
        sd.mq2_ppm,
        sd.mq2_raw,
        sd.gas_type,
        sd.risk_level,
        sd.gps_latitude,
        sd.gps_longitude
      FROM alerts a
      JOIN sensor_data sd ON a.sensor_data_id = sd.id
      WHERE a.id = ?
    `;

    const row = await this.db.get(query, [alertId]);
    return row ? this.formatAlert(row) : null;
  }

  /**
   * Get all alerts with sensor data (last 30 days)
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of alerts with sensor data
   */
  async getAllWithSensorData(options = {}) {
    const { 
      limit = 100, 
      offset = 0, 
      alertType = null,
      startDate = null,
      endDate = null 
    } = options;

    let query = `
      SELECT 
        a.*,
        sd.timestamp as sensor_timestamp,
        sd.mq6_ppm,
        sd.mq2_ppm,
        sd.gas_type,
        sd.risk_level,
        sd.gps_latitude,
        sd.gps_longitude
      FROM alerts a
      JOIN sensor_data sd ON a.sensor_data_id = sd.id
      WHERE 1=1
    `;
    
    const params = [];

    if (alertType) {
      query += ` AND a.alert_type = ?`;
      params.push(alertType);
    }

    if (startDate) {
      query += ` AND a.created_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      const endDateTime = endDate.includes(':') ? endDate : `${endDate} 23:59:59`;
      query += ` AND a.created_at <= ?`;
      params.push(endDateTime);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await this.db.all(query, params);
    return rows.map(row => this.formatAlert(row));
  }

  /**
   * Get recent alerts (last 7 days)
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Recent alerts
   */
  async getRecentAlerts(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.getAllWithSensorData({
      startDate: startDate.toISOString(),
      limit: 1000
    });
  }

  /**
   * Get alerts by type
   * @param {string} type - 'low' or 'critical'
   * @returns {Promise<Array>} Alerts of specified type
   */
  async getByType(type) {
    return await this.getAllWithSensorData({ alertType: type });
  }

  /**
   * Get alert statistics
   * @param {number} days - Number of days to analyze
   * @returns {Promise<object>} Alert statistics
   */
  async getStatistics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN alert_type = 'low' THEN 1 ELSE 0 END) as low_count,
        SUM(CASE WHEN alert_type = 'critical' THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN sms_sent = 1 THEN 1 ELSE 0 END) as sms_sent_count,
        AVG(sd.mq6_ppm) as avg_mq6_ppm,
        AVG(sd.mq2_ppm) as avg_mq2_ppm,
        MAX(sd.mq6_ppm) as max_mq6_ppm,
        MAX(sd.mq2_ppm) as max_mq2_ppm
      FROM alerts a
      JOIN sensor_data sd ON a.sensor_data_id = sd.id
      WHERE a.created_at >= ?
    `;

    const row = await this.db.get(query, [startDate.toISOString()]);
    return row || {};
  }

  /**
   * Delete old alerts (data retention)
   * @param {number} days - Keep alerts newer than this
   * @returns {Promise<number>} Number of deleted alerts
   */
  async deleteOlderThan(days = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const query = `DELETE FROM alerts WHERE created_at < ?`;

    const result = await this.db.run(query, [cutoffDate.toISOString()]);
    return result.changes;
  }

  /**
   * Format alert data (parse JSON recipients)
   * @param {object} row - Database row
   * @returns {object} Formatted alert
   */
  formatAlert(row) {
    if (!row) return null;

    let recipients = [];
    
    // Safely parse SMS recipients JSON
    if (row.sms_recipients) {
      try {
        // If it's already an object/array, use it
        if (typeof row.sms_recipients === 'object') {
          recipients = Array.isArray(row.sms_recipients) ? row.sms_recipients : [row.sms_recipients];
        } else {
          // Try to parse as JSON string
          recipients = JSON.parse(row.sms_recipients);
        }
      } catch (error) {
        console.error(`[ALERT] Failed to parse sms_recipients for alert ${row.id}:`, error.message);
        console.error(`[ALERT] Raw value:`, row.sms_recipients);
        recipients = [];
      }
    }

    return {
      ...row,
      sms_recipients: recipients
    };
  }
}

module.exports = new Alert();
