const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ContactManager {
    constructor() {
        this.contactsFile = path.join(__dirname, '../../data/contacts.json');
    }

    async getAllContacts() {
        try {
            if (!await fs.pathExists(this.contactsFile)) {
                return [];
            }
            return await fs.readJson(this.contactsFile);
        } catch (error) {
            console.error('Error reading contacts file:', error);
            return [];
        }
    }

    async getContact(contactId) {
        try {
            const contacts = await this.getAllContacts();
            return contacts.find(contact => contact.id === contactId);
        } catch (error) {
            console.error('Error getting contact:', error);
            return null;
        }
    }

    async addContact(contactData) {
        try {
            // Validate required fields
            if (!contactData.name || !contactData.phoneNumber) {
                throw new Error('Name and phone number are required');
            }

            // Validate phone number format (basic validation)
            const phoneRegex = /^\+?[1-9]\d{1,14}$/;
            if (!phoneRegex.test(contactData.phoneNumber.replace(/\s+/g, ''))) {
                throw new Error('Invalid phone number format');
            }

            const contacts = await this.getAllContacts();
            
            // Check if phone number already exists
            const existingContact = contacts.find(contact => 
                contact.phoneNumber === contactData.phoneNumber
            );
            if (existingContact) {
                throw new Error('Contact with this phone number already exists');
            }

            // Create new contact
            const newContact = {
                id: uuidv4(),
                name: contactData.name.trim(),
                phoneNumber: contactData.phoneNumber.trim(),
                email: contactData.email ? contactData.email.trim() : '',
                notes: contactData.notes ? contactData.notes.trim() : '',
                status: 'disconnected',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastConnected: null,
                lastDisconnected: null,
                isActive: true,
                push: contactData.push !== undefined ? contactData.push : true,
                warmer: contactData.warmer !== undefined ? contactData.warmer : true,
                timeoutSeconds: contactData.timeoutSeconds !== undefined ? parseInt(contactData.timeoutSeconds) : 60,
                maxMessageTimeout: contactData.maxMessageTimeout !== undefined ? parseInt(contactData.maxMessageTimeout) : 5,
                maxMessagesPerDay: contactData.maxMessagesPerDay !== undefined ? parseInt(contactData.maxMessagesPerDay) : 0,
                // Multiple daily message limits with timeouts
                dailyMessageLimits: contactData.dailyMessageLimits || [
                    { limit: 0, timeoutMinutes: 0 } // Default: no limit, no timeout
                ],
                currentDailyLimitIndex: 0, // Track which limit is currently active
            };

            contacts.push(newContact);
            await this.saveContacts(contacts);

            console.log(`Contact added: ${newContact.name} (${newContact.phoneNumber})`);
            return newContact;
        } catch (error) {
            console.error('Error adding contact:', error);
            throw error;
        }
    }

    async updateContact(contactId, updateData) {
        try {
            const contacts = await this.getAllContacts();
            const contactIndex = contacts.findIndex(contact => contact.id === contactId);
            
            if (contactIndex === -1) {
                throw new Error('Contact not found');
            }

            // Validate phone number if it's being updated
            if (updateData.phoneNumber) {
                const phoneRegex = /^\+?[1-9]\d{1,14}$/;
                if (!phoneRegex.test(updateData.phoneNumber.replace(/\s+/g, ''))) {
                    throw new Error('Invalid phone number format');
                }

                // Check if new phone number already exists (excluding current contact)
                const existingContact = contacts.find(contact => 
                    contact.phoneNumber === updateData.phoneNumber && contact.id !== contactId
                );
                if (existingContact) {
                    throw new Error('Contact with this phone number already exists');
                }
            }

            // Update contact
            const updatedContact = {
                ...contacts[contactIndex],
                ...updateData,
                updatedAt: new Date().toISOString()
            };

            // Ensure certain fields are properly formatted
            if (updatedContact.name) {
                updatedContact.name = updatedContact.name.trim();
            }
            if (updatedContact.phoneNumber) {
                updatedContact.phoneNumber = updatedContact.phoneNumber.trim();
            }
            if (updatedContact.email) {
                updatedContact.email = updatedContact.email.trim();
            }

            contacts[contactIndex] = updatedContact;
            await this.saveContacts(contacts);

            console.log(`Contact updated: ${updatedContact.name} (${updatedContact.phoneNumber})`);
            return updatedContact;
        } catch (error) {
            console.error('Error updating contact:', error);
            throw error;
        }
    }

    async deleteContact(contactId) {
        try {
            const contacts = await this.getAllContacts();
            const contactIndex = contacts.findIndex(contact => contact.id === contactId);
            
            if (contactIndex === -1) {
                throw new Error('Contact not found');
            }

            const deletedContact = contacts[contactIndex];
            contacts.splice(contactIndex, 1);
            await this.saveContacts(contacts);

            console.log(`Contact deleted: ${deletedContact.name} (${deletedContact.phoneNumber})`);
            return true;
        } catch (error) {
            console.error('Error deleting contact:', error);
            throw error;
        }
    }

    async getActiveContacts() {
        try {
            const contacts = await this.getAllContacts();
            return contacts.filter(contact => contact.isActive);
        } catch (error) {
            console.error('Error getting active contacts:', error);
            return [];
        }
    }

    async getConnectedContacts() {
        try {
            const contacts = await this.getAllContacts();
            return contacts.filter(contact => contact.status === 'connected');
        } catch (error) {
            console.error('Error getting connected contacts:', error);
            return [];
        }
    }

    async getContactByPhoneNumber(phoneNumber) {
        try {
            const contacts = await this.getAllContacts();
            return contacts.find(contact => contact.phoneNumber === phoneNumber);
        } catch (error) {
            console.error('Error getting contact by phone number:', error);
            return null;
        }
    }

    async saveContacts(contacts) {
        try {
            await fs.ensureDir(path.dirname(this.contactsFile));
            await fs.writeJson(this.contactsFile, contacts, { spaces: 2 });
        } catch (error) {
            console.error('Error saving contacts file:', error);
            throw error;
        }
    }

    async exportContacts() {
        try {
            const contacts = await this.getAllContacts();
            const exportData = {
                exportDate: new Date().toISOString(),
                totalContacts: contacts.length,
                contacts: contacts
            };
            return exportData;
        } catch (error) {
            console.error('Error exporting contacts:', error);
            throw error;
        }
    }

    async importContacts(importData) {
        try {
            if (!importData.contacts || !Array.isArray(importData.contacts)) {
                throw new Error('Invalid import data format');
            }

            const existingContacts = await this.getAllContacts();
            const importedContacts = [];
            const skippedContacts = [];

            for (const contactData of importData.contacts) {
                try {
                    // Check if contact already exists
                    const existingContact = existingContacts.find(contact => 
                        contact.phoneNumber === contactData.phoneNumber
                    );

                    if (existingContact) {
                        skippedContacts.push({
                            phoneNumber: contactData.phoneNumber,
                            reason: 'Phone number already exists'
                        });
                        continue;
                    }

                    // Add contact
                    const newContact = await this.addContact(contactData);
                    importedContacts.push(newContact);
                } catch (error) {
                    skippedContacts.push({
                        phoneNumber: contactData.phoneNumber,
                        reason: error.message
                    });
                }
            }

            return {
                imported: importedContacts.length,
                skipped: skippedContacts.length,
                importedContacts,
                skippedContacts
            };
        } catch (error) {
            console.error('Error importing contacts:', error);
            throw error;
        }
    }
}

module.exports = ContactManager;
