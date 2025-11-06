const BaseModel = require('./BaseModel');

class CalibrationData extends BaseModel {
  constructor() {
    super('calibration_data');
  }

  // Get calibration for specific sensor
  async getBySensor(sensor) {
    return await this.findOne({ sensor });
  }

  // Update calibration
  async updateCalibration(sensor, data) {
    const existing = await this.getBySensor(sensor);
    if (existing) {
      return await this.update(existing.id, {
        ...data,
        last_calibration: new Date().toISOString()
      });
    }
    return await this.create({ ...data, sensor });
  }

  // Increment manual calibration count
  async incrementCalibrationCount(sensor) {
    const existing = await this.getBySensor(sensor);
    if (existing) {
      return await this.update(existing.id, {
        manual_calibration_count: existing.manual_calibration_count + 1,
        last_calibration: new Date().toISOString()
      });
    }
  }

  // Update sensor status
  async updateStatus(sensor, status, degradation, drift) {
    const existing = await this.getBySensor(sensor);
    if (existing) {
      return await this.update(existing.id, {
        status,
        degradation,
        drift
      });
    }
  }
}

class CalibrationHistory extends BaseModel {
  constructor() {
    super('calibration_history');
  }

  // Add calibration history record
  async addRecord(sensor, data) {
    return await this.create({
      calibration_id: data.calibrationId || null,
      sensor,
      type: data.type || 'manual',
      baseline_resistance: data.baselineResistance,
      sensitivity_factor: data.sensitivityFactor,
      drift_before: data.driftBefore || 0,
      drift_after: data.driftAfter || 0,
      performed_by: data.performedBy || null,
      status: data.status || 'success'
    });
  }

  // Get history for sensor
  async getBySensor(sensor, limit = 10) {
    return await this.findAll({
      where: { sensor },
      orderBy: 'timestamp DESC',
      limit
    });
  }

  // Get all calibration history
  async getAllHistory(limit = 50) {
    return await this.findAll({
      orderBy: 'timestamp DESC',
      limit
    });
  }

  // Get calibration history with user information
  async getHistoryWithUsers(limit = 50) {
    const query = `
      SELECT 
        ch.*,
        u.username as performed_by_username,
        cd.sensor as calibration_sensor
      FROM calibration_history ch
      LEFT JOIN users u ON ch.performed_by = u.id
      LEFT JOIN calibration_data cd ON ch.calibration_id = cd.id
      ORDER BY ch.timestamp DESC
      LIMIT ?
    `;
    
    return await this.db.all(query, [limit]);
  }
}

module.exports = {
  CalibrationData: new CalibrationData(),
  CalibrationHistory: new CalibrationHistory()
};


module.exports = {
  CalibrationData: new CalibrationData(),
  CalibrationHistory: new CalibrationHistory()
};


