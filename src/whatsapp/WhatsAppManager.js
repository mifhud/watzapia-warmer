const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs-extra');
const ContactManager = require('../contacts/ContactManager');

class WhatsAppManager {
    constructor(io) {
        this.io = io;
        this.clients = new Map(); // contactId -> client instance
        this.qrCodes = new Map(); // contactId -> qr code data
        this.connectionStatus = new Map(); // contactId -> status
        this.disconnectedContacts = new Set(); // Track contacts that have been disconnected
        this.contactManager = new ContactManager();
    }

    async connectContact(contactId) {
        try {
            if (this.clients.has(contactId)) {
                throw new Error('Contact is already connected or connecting');
            }

            const contact = await this.contactManager.getContact(contactId);
            if (!contact) {
                throw new Error('Contact not found');
            }

            console.log(`Connecting WhatsApp for contact: ${contact.name} (${contact.phoneNumber})`);

            // Reset disconnected flag when user explicitly tries to connect
            this.disconnectedContacts.delete(contactId);

            // Create WhatsApp client with LocalAuth
            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: contactId,
                }),
                puppeteer: {
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                },
                restartOnAuthFail: false // Prevent automatic reconnection attempts
            });

            this.clients.set(contactId, client);
            this.updateConnectionStatus(contactId, 'connecting');

            client.on('qr', async (qr) => {
                console.log(`QR Code generated for ${contact.name}`);
                
                // Check if the contact has been disconnected
                if (this.disconnectedContacts.has(contactId)) {
                    console.log(`Ignoring QR code for ${contact.name} as it was previously disconnected`);
                    return;
                }
                
                try {
                    const qrCodeDataURL = await qrcode.toDataURL(qr);
                    this.qrCodes.set(contactId, qrCodeDataURL);
                    this.updateConnectionStatus(contactId, 'qr_ready');

                    // Emit QR code to frontend
                    this.io.emit('qr_code', {
                        contactId,
                        qrCode: qrCodeDataURL,
                        contactName: contact.name
                    });
                } catch (error) {
                    console.error('Failed to generate QR code:', error);
                }
            });

            client.on('ready', async () => {
                console.log(`WhatsApp client ready for ${contact.name}`);
                this.updateConnectionStatus(contactId, 'connected');
                this.qrCodes.delete(contactId);

                // Update contact status in database
                await this.contactManager.updateContact(contactId, {
                    status: 'connected',
                    lastConnected: new Date().toISOString()
                });

                this.io.emit('connection_status', {
                    contactId,
                    status: 'connected',
                    contactName: contact.name
                });
            });

            client.on('authenticated', () => {
                console.log(`WhatsApp authenticated for ${contact.name}`);
                this.updateConnectionStatus(contactId, 'authenticated');
            });

            client.on('auth_failure', async (msg) => {
                console.error(`Authentication failed for ${contact.name}:`, msg);
                this.updateConnectionStatus(contactId, 'auth_failed', msg);
                this.clients.delete(contactId);
                
                // Destroy the client to ensure it doesn't try to reconnect
                try {
                    await client.destroy();
                    console.log(`Client for ${contact.name} has been destroyed after auth failure`);
                } catch (destroyError) {
                    console.error(`Error destroying client for ${contact.name} after auth failure:`, destroyError);
                }
            });

            client.on('disconnected', async (reason) => {
                console.log(`WhatsApp disconnected for ${contact.name}:`, reason);
                
                // Mark this contact as disconnected to prevent showing QR code again
                this.disconnectedContacts.add(contactId);
                
                this.updateConnectionStatus(contactId, 'disconnected', reason);
                this.clients.delete(contactId);
                this.qrCodes.delete(contactId);

                // Update contact status in database
                await this.contactManager.updateContact(contactId, {
                    status: 'disconnected',
                    lastDisconnected: new Date().toISOString()
                });

                this.io.emit('connection_status', {
                    contactId,
                    status: 'disconnected',
                    contactName: contact.name,
                    reason
                });
                
                // Prevent client from attempting to reconnect
                client.options.restartOnAuthFail = false;
                
                // Destroy the client to ensure it doesn't try to reconnect
                try {
                    await client.destroy();
                    console.log(`Client for ${contact.name} has been destroyed to prevent reconnection`);
                } catch (destroyError) {
                    console.error(`Error destroying client for ${contact.name}:`, destroyError);
                }
            });

            client.on('message', async (message) => {
                // Handle incoming messages for reply tracking
                this.handleIncomingMessage(contactId, message);
            });

            client.on('message_create', async (message) => {
                // Handle outgoing messages
                if (message.fromMe) {
                    this.handleOutgoingMessage(contactId, message);
                }
            });

            await client.initialize();

            // // Set up event handlers
            // this.setupClientEventHandlers(client, contactId, contact);

            // // Initialize the client
            // await client.initialize();

        } catch (error) {
            console.error(`Failed to connect contact ${contactId}:`, error);
            this.updateConnectionStatus(contactId, 'error', error.message);
            this.clients.delete(contactId);
            throw error;
        }
    }

    setupClientEventHandlers(client, contactId, contact) {
        client.on('qr', async (qr) => {
            console.log(`QR Code generated for ${contact.name}`);
            
            // Check if the contact has been disconnected
            if (this.disconnectedContacts.has(contactId)) {
                console.log(`Ignoring QR code for ${contact.name} as it was previously disconnected`);
                return;
            }
            
            try {
                const qrCodeDataURL = await qrcode.toDataURL(qr);
                this.qrCodes.set(contactId, qrCodeDataURL);
                this.updateConnectionStatus(contactId, 'qr_ready');

                // Emit QR code to frontend
                this.io.emit('qr_code', {
                    contactId,
                    qrCode: qrCodeDataURL,
                    contactName: contact.name
                });
            } catch (error) {
                console.error('Failed to generate QR code:', error);
            }
        });

        client.on('ready', async () => {
            console.log(`WhatsApp client ready for ${contact.name}`);
            this.updateConnectionStatus(contactId, 'connected');
            this.qrCodes.delete(contactId);

            // Update contact status in database
            await this.contactManager.updateContact(contactId, {
                status: 'connected',
                lastConnected: new Date().toISOString()
            });

            this.io.emit('connection_status', {
                contactId,
                status: 'connected',
                contactName: contact.name
            });
        });

        client.on('authenticated', () => {
            console.log(`WhatsApp authenticated for ${contact.name}`);
            this.updateConnectionStatus(contactId, 'authenticated');
        });

        client.on('auth_failure', async (msg) => {
            console.error(`Authentication failed for ${contact.name}:`, msg);
            this.updateConnectionStatus(contactId, 'auth_failed', msg);
            this.clients.delete(contactId);
            
            // Destroy the client to ensure it doesn't try to reconnect
            try {
                await client.destroy();
                console.log(`Client for ${contact.name} has been destroyed after auth failure`);
            } catch (destroyError) {
                console.error(`Error destroying client for ${contact.name} after auth failure:`, destroyError);
            }
        });

        client.on('disconnected', async (reason) => {
            console.log(`WhatsApp disconnected for ${contact.name}:`, reason);
            
            // Mark this contact as disconnected to prevent showing QR code again
            this.disconnectedContacts.add(contactId);
            
            this.updateConnectionStatus(contactId, 'disconnected', reason);
            this.clients.delete(contactId);
            this.qrCodes.delete(contactId);

            // Update contact status in database
            await this.contactManager.updateContact(contactId, {
                status: 'disconnected',
                lastDisconnected: new Date().toISOString()
            });

            this.io.emit('connection_status', {
                contactId,
                status: 'disconnected',
                contactName: contact.name,
                reason
            });
            
            // Prevent client from attempting to reconnect
            client.options.restartOnAuthFail = false;
            
            // Destroy the client to ensure it doesn't try to reconnect
            try {
                await client.destroy();
                console.log(`Client for ${contact.name} has been destroyed to prevent reconnection`);
            } catch (destroyError) {
                console.error(`Error destroying client for ${contact.name}:`, destroyError);
            }
        });

        client.on('message', async (message) => {
            // Handle incoming messages for reply tracking
            this.handleIncomingMessage(contactId, message);
        });

        client.on('message_create', async (message) => {
            // Handle outgoing messages
            if (message.fromMe) {
                this.handleOutgoingMessage(contactId, message);
            }
        });
    }

    async handleIncomingMessage(contactId, message) {
        try {
            const messageData = {
                contactId,
                messageId: message.id._serialized,
                from: message.from,
                to: message.to,
                body: message.body,
                timestamp: new Date(message.timestamp * 1000).toISOString(),
                type: 'incoming'
            };

            // Emit to frontend for real-time updates
            this.io.emit('message_received', messageData);
        } catch (error) {
            console.error('Error handling incoming message:', error);
        }
    }

    async handleOutgoingMessage(contactId, message) {
        try {
            const messageData = {
                contactId,
                messageId: message.id._serialized,
                from: message.from,
                to: message.to,
                body: message.body,
                timestamp: new Date(message.timestamp * 1000).toISOString(),
                type: 'outgoing'
            };

            // Emit to frontend for real-time updates
            this.io.emit('message_sent', messageData);
        } catch (error) {
            console.error('Error handling outgoing message:', error);
        }
    }

    async disconnectContact(contactId) {
        try {
            const client = this.clients.get(contactId);
            if (!client) {
                throw new Error('Contact is not connected');
            }

            console.log(`Disconnecting WhatsApp for contact: ${contactId}`);
            
            // Mark this contact as disconnected to prevent showing QR code again
            this.disconnectedContacts.add(contactId);

            await client.destroy();
            this.clients.delete(contactId);
            this.qrCodes.delete(contactId);
            this.updateConnectionStatus(contactId, 'disconnected');

            // Update contact status in database
            const contact = await this.contactManager.getContact(contactId);
            if (contact) {
                await this.contactManager.updateContact(contactId, {
                    status: 'disconnected',
                    lastDisconnected: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error(`Failed to disconnect contact ${contactId}:`, error);
            throw error;
        }
    }

    async disconnectAll() {
        console.log('Disconnecting all WhatsApp clients...');
        const disconnectPromises = [];

        for (const contactId of this.clients.keys()) {
            disconnectPromises.push(this.disconnectContact(contactId));
        }

        await Promise.allSettled(disconnectPromises);
    }

    updateConnectionStatus(contactId, status, message = null) {
        this.connectionStatus.set(contactId, {
            status,
            message,
            timestamp: new Date().toISOString()
        });

        // Emit status update to frontend
        this.io.emit('connection_status_update', {
            contactId,
            status,
            message,
            timestamp: new Date().toISOString()
        });
    }

    getClient(contactId) {
        return this.clients.get(contactId);
    }

    getConnectionStatus(contactId) {
        return this.connectionStatus.get(contactId);
    }

    getQRCode(contactId) {
        return this.qrCodes.get(contactId);
    }

    getConnectedContacts() {
        const connected = [];
        for (const [contactId, status] of this.connectionStatus.entries()) {
            if (status.status === 'connected') {
                connected.push(contactId);
            }
        }
        return connected;
    }

    async findGroupByName(contactId, groupName) {
        try {
            const client = this.getClient(contactId);
            if (!client) {
                throw new Error('WhatsApp client not connected for this contact');
            }

            // Get all chats
            const chats = await client.getChats();
            
            // Filter to find the group with the specified name
            const group = chats.find(chat => 
                chat.name && 
                chat.name.toLowerCase() === groupName.toLowerCase()
            );

            return group;
        } catch (error) {
            console.error(`Failed to find group ${groupName} for contact ${contactId}:`, error);
            throw error;
        }
    }

    async sendMessage(contactId, to, message) {
        try {
            const client = this.getClient(contactId);
            if (!client) {
                throw new Error('WhatsApp client not connected for this contact');
            }

            // Format the phone number correctly for WhatsApp Web API
            // Remove any non-numeric characters
            let formattedNumber = to.replace(/\D/g, '');
            
            // Make sure the number has the correct format for WhatsApp
            // If it starts with '0', remove it and make sure country code is present
            if (formattedNumber.startsWith('0')) {
                formattedNumber = formattedNumber.substring(1);
            }
            
            // Add '@c.us' suffix which is required by WhatsApp Web API
            const whatsappId = `${formattedNumber}@c.us`;
            
            console.log(`Sending message to formatted number: ${whatsappId}`);
            const result = await client.sendMessage(whatsappId, message);
            return result;
        } catch (error) {
            console.error(`Failed to send message from ${contactId} to ${to}:`, error);
            throw error;
        }
    }
    
    async sendMessageToGroup(contactId, groupName, message) {
        try {
            const group = await this.findGroupByName(contactId, groupName);
            if (!group) {
                throw new Error(`Group "${groupName}" not found for contact ${contactId}`);
            }
            
            const client = this.getClient(contactId);
            const result = await client.sendMessage(group.id._serialized, message);
            return result;
        } catch (error) {
            console.error(`Failed to send message to group ${groupName} from ${contactId}:`, error);
            throw error;
        }
    }
}

module.exports = WhatsAppManager;
