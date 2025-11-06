const BaseModel = require('./BaseModel');

class SystemLog extends BaseModel {
  constructor() {
    super('system_logs');
  }

  // Add log entry
  async log(level, category, message, options = {}) {
    return await this.create({
      level,
      category,
      message,
      source: options.source || null,
      user: options.user || null,
      data: options.data ? JSON.stringify(options.data) : null
    });
  }

  // Add info log
  async info(category, message, options = {}) {
    return await this.log('info', category, message, options);
  }

  // Add warning log
  async warning(category, message, options = {}) {
    return await this.log('warning', category, message, options);
  }

  // Add error log
  async error(category, message, options = {}) {
    return await this.log('error', category, message, options);
  }

  // Add critical log
  async critical(category, message, options = {}) {
    return await this.log('critical', category, message, options);
  }

  // Get logs with filters
  async getLogs(options = {}) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];
    const conditions = [];

    // Level filter
    if (options.level) {
      conditions.push('level = ?');
      params.push(options.level);
    }

    // Category filter
    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    // Date range
    if (options.startDate) {
      conditions.push('timestamp >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push('timestamp <= ?');
      params.push(options.endDate);
    }

    // Search
    if (options.search) {
      conditions.push('(message LIKE ? OR source LIKE ? OR user LIKE ?)');
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Add WHERE clause
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Order and limit
    sql += ` ORDER BY timestamp DESC`;
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    return await this.query(sql, params);
  }

  // Get log counts by level
  async getCountsByLevel(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sql = `
      SELECT 
        level,
        COUNT(*) as count
      FROM ${this.tableName}
      WHERE timestamp >= ?
      GROUP BY level
    `;

    return await this.query(sql, [cutoffDate.toISOString()]);
  }

  // Delete old logs
  async deleteOlderThan(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;
    const result = await this.db.run(sql, [cutoffDate.toISOString()]);
    return result.changes;
  }

  // Get logs for export
  async getForExport(options = {}) {
    let sql = `
      SELECT 
        timestamp,
        level,
        category,
        message,
        source,
        user
      FROM ${this.tableName}
    `;
    const params = [];
    const conditions = [];

    if (options.level) {
      conditions.push('level = ?');
      params.push(options.level);
    }

    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (options.startDate) {
      conditions.push('timestamp >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      // Append end of day (23:59:59) to include all records from that date
      const endDateTime = options.endDate.includes(':') ? options.endDate : `${options.endDate} 23:59:59`;
      conditions.push('timestamp <= ?');
      params.push(endDateTime);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY timestamp DESC`;

    return await this.query(sql, params);
  }
}

module.exports = new SystemLog();


