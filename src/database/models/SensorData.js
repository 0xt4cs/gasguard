const BaseModel = require('./BaseModel');

class SensorData extends BaseModel {
  constructor() {
    super('sensor_data');
  }

  // Record new sensor reading
  async recordReading(data) {
    return await this.create({
      mq6_ppm: data.mq6.ppm,
      mq6_raw: data.mq6.raw,
      mq2_ppm: data.mq2.ppm,
      mq2_raw: data.mq2.raw,
      gas_type: data.gasType,
      risk_level: data.riskLevel,
      alert_level: data.alertLevel,
      gps_latitude: data.gps?.latitude || null,
      gps_longitude: data.gps?.longitude || null
    });
  }

  // Get recent readings
  async getRecentReadings(limit = 100) {
    return await this.findAll({
      orderBy: 'timestamp DESC',
      limit
    });
  }

  // Get readings by date range
  async getByDateRange(startDate, endDate, options = {}) {
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE timestamp >= ? AND timestamp <= ?
    `;
    const params = [startDate, endDate];

    // Alert level filter
    if (options.alertLevel) {
      sql += ` AND alert_level = ?`;
      params.push(options.alertLevel);
    }

    // Order and limit
    sql += ` ORDER BY timestamp DESC`;
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    return await this.query(sql, params);
  }

  // Get statistics
  async getStatistics(days = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sql = `
      SELECT 
        COUNT(*) as total_records,
        AVG(mq6_ppm) as avg_mq6,
        AVG(mq2_ppm) as avg_mq2,
        MAX(mq6_ppm) as max_mq6,
        MAX(mq2_ppm) as max_mq2,
        MIN(timestamp) as oldest_record,
        SUM(CASE WHEN alert_level = 'normal' THEN 1 ELSE 0 END) as normal_count,
        SUM(CASE WHEN alert_level = 'low' THEN 1 ELSE 0 END) as low_count,
        SUM(CASE WHEN alert_level = 'critical' THEN 1 ELSE 0 END) as critical_count
      FROM ${this.tableName}
      WHERE timestamp >= ?
    `;

    return await this.queryOne(sql, [cutoffDate.toISOString()]);
  }

  // Delete old data (retention policy)
  async deleteOlderThan(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;
    const result = await this.db.run(sql, [cutoffDate.toISOString()]);
    return result.changes;
  }

  // Get data for export
  async getForExport(startDate, endDate) {
    const sql = `
      SELECT 
        timestamp,
        mq6_ppm,
        mq2_ppm,
        gas_type,
        alert_level,
        gps_latitude,
        gps_longitude
      FROM ${this.tableName}
      WHERE datetime(timestamp) >= datetime(?) 
        AND datetime(timestamp) <= datetime(?)
      ORDER BY timestamp DESC
    `;
    return await this.query(sql, [startDate, endDate]);
  }
  
  // Get oldest record (for data retention)
  async getOldestRecord() {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY created_at ASC LIMIT 1`;
    return await this.queryOne(sql);
  }
}

module.exports = new SensorData();


