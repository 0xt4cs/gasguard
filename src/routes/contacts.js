const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const { Contact, SystemLog } = require('../database/models');

const router = express.Router();

// Get all contacts (internal + external)
router.get('/', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const internalContacts = await Contact.getInternalContacts(req.user.id);
    const externalContacts = await Contact.getExternalContacts();
    
    res.json({
      success: true,
      contacts: {
        internal: internalContacts,
        external: externalContacts
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});

// Get internal contacts (nearby responders)
router.get('/internal', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.getInternalContacts(req.user.id);
    res.json({ success: true, contacts });
  } catch (error) {
    console.error('Get internal contacts error:', error);
    res.status(500).json({ error: 'Failed to retrieve internal contacts' });
  }
});

// Create internal contact (nearby responder)
router.post('/internal', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { name, phone, alternatePhone } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    const newContact = await Contact.createInternal(req.user.id, {
      name,
      phone,
      alternate_phone: alternatePhone || null
    });
    
    await SystemLog.info('system', `Internal contact created: ${name}`, {
      source: 'contacts.internal.create',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Contact created successfully',
      contact: newContact
    });
  } catch (error) {
    console.error('Create internal contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update internal contact
router.put('/internal/:id', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, alternatePhone } = req.body;
    
    // Verify ownership
    const existing = await Contact.findById(id);
    if (!existing || existing.user_id !== req.user.id || existing.type !== 'INTERNAL') {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (alternatePhone !== undefined) updateData.alternate_phone = alternatePhone || null;
    
    const updatedContact = await Contact.update(id, updateData);
    
    await SystemLog.info('system', `Internal contact updated: ${name || existing.name}`, {
      source: 'contacts.internal.update',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Contact updated successfully',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Update internal contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete internal contact
router.delete('/internal/:id', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ownership
    const existing = await Contact.findById(id);
    if (!existing || existing.user_id !== req.user.id || existing.type !== 'INTERNAL') {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    await Contact.delete(id);
    
    await SystemLog.info('system', `Internal contact deleted: ${existing.name}`, {
      source: 'contacts.internal.delete',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    console.error('Delete internal contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Get external contacts (emergency services)
router.get('/external', AuthMiddleware.requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.getExternalContacts();
    res.json({ success: true, contacts });
  } catch (error) {
    console.error('Get external contacts error:', error);
    res.status(500).json({ error: 'Failed to retrieve external contacts' });
  }
});

// Create external contact (admin only - emergency services)
router.post('/external', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { name, phone, alternatePhone } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    const newContact = await Contact.createExternal({
      name,
      phone,
      alternate_phone: alternatePhone || null
    });
    
    await SystemLog.info('system', `External contact created: ${name}`, {
      source: 'contacts.external.create',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'External contact created successfully',
      contact: newContact
    });
  } catch (error) {
    console.error('Create external contact error:', error);
    res.status(500).json({ error: 'Failed to create external contact' });
  }
});

// Update external contact (admin only)
router.put('/external/:id', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, alternatePhone } = req.body;
    
    const existing = await Contact.findById(id);
    if (!existing || existing.type !== 'EXTERNAL') {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (alternatePhone !== undefined) updateData.alternate_phone = alternatePhone || null;
    
    const updatedContact = await Contact.update(id, updateData);
    
    await SystemLog.info('system', `External contact updated: ${name || existing.name}`, {
      source: 'contacts.external.update',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'External contact updated successfully',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Update external contact error:', error);
    res.status(500).json({ error: 'Failed to update external contact' });
  }
});

// Delete external contact (admin only)
router.delete('/external/:id', AuthMiddleware.requireAuth, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const existing = await Contact.findById(id);
    if (!existing || existing.type !== 'EXTERNAL') {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    await Contact.delete(id);
    
    await SystemLog.info('system', `External contact deleted: ${existing.name}`, {
      source: 'contacts.external.delete',
      user: req.user.username
    });
    
    res.json({
      success: true,
      message: 'External contact deleted successfully'
    });
  } catch (error) {
    console.error('Delete external contact error:', error);
    res.status(500).json({ error: 'Failed to delete external contact' });
  }
});

module.exports = (db = null) => router;
