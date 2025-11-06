const BaseModel = require('./BaseModel');

class Contact extends BaseModel {
  constructor() {
    super('contacts');
  }

  // Get all contacts for a user (both internal and external)
  async getByUserId(userId) {
    return await this.findAll({
      where: { user_id: userId },
      orderBy: 'type ASC, name ASC'
    });
  }

  // Get INTERNAL contacts for a user (nearby responders)
  async getInternalContacts(userId) {
    return await this.findAll({
      where: { user_id: userId, type: 'INTERNAL' },
      orderBy: 'name ASC'
    });
  }

  // Get EXTERNAL contacts (public emergency services)
  async getExternalContacts() {
    return await this.findAll({
      where: { type: 'EXTERNAL', is_public: 1 },
      orderBy: 'name ASC'
    });
  }

  // Get all emergency contacts (external services)
  async getEmergencyContacts() {
    return await this.getExternalContacts();
  }

  // Create internal contact for user
  async createInternal(userId, contactData) {
    return await this.create({
      ...contactData,
      user_id: userId,
      type: 'INTERNAL',
      is_public: 0
    });
  }

  // Create external contact (public emergency service)
  async createExternal(contactData) {
    return await this.create({
      ...contactData,
      user_id: null,
      type: 'EXTERNAL',
      is_public: 1
    });
  }

  // Verify contact ownership (for internal contacts)
  async verifyOwnership(contactId, userId) {
    const contact = await this.findById(contactId);
    return contact && contact.user_id === userId;
  }
}

module.exports = {
  Contact: new Contact(),
  // Backwards compatibility aliases (deprecated)
  ContactInternal: new Contact(),
  ContactExternal: new Contact()
};


