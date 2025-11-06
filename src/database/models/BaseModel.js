const db = require('../connection');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  // Find by ID
  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    return await this.db.get(sql, [id]);
  }

  // Find all records
  async findAll(options = {}) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];

    // Add WHERE clause
    if (options.where) {
      const conditions = Object.keys(options.where).map(key => `${key} = ?`);
      sql += ` WHERE ${conditions.join(' AND ')}`;
      params.push(...Object.values(options.where));
    }

    // Add ORDER BY
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    // Add LIMIT
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    // Add OFFSET
    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return await this.db.all(sql, params);
  }

  // Find one record
  async findOne(where) {
    const conditions = Object.keys(where).map(key => `${key} = ?`);
    const sql = `SELECT * FROM ${this.tableName} WHERE ${conditions.join(' AND ')} LIMIT 1`;
    return await this.db.get(sql, Object.values(where));
  }

  // Create new record
  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    const result = await this.db.run(sql, values);
    
    return await this.findById(result.lastID);
  }

  // Update record by ID
  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    await this.db.run(sql, [...values, id]);
    
    return await this.findById(id);
  }

  // Delete record by ID
  async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  // Count records
  async count(where = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => `${key} = ?`);
      sql += ` WHERE ${conditions.join(' AND ')}`;
      params.push(...Object.values(where));
    }

    const result = await this.db.get(sql, params);
    return result.count;
  }

  // Execute raw SQL query
  async query(sql, params = []) {
    return await this.db.all(sql, params);
  }

  // Execute raw SQL (single row)
  async queryOne(sql, params = []) {
    return await this.db.get(sql, params);
  }
}

module.exports = BaseModel;


