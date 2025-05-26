const moment = require('moment-timezone');
const fs = require('fs-extra');
const path = require('path');

class MessageManager {
    constructor(whatsappManager, templateManager, contactManager) {
        this.whatsappManager = whatsappManager;
        this.templateManager = templateManager;
        this.contactManager = contactManager;
        
        this.isWarmerActive = false;
        this.warmerInterval = null;
        this.messageQueue = [];
        this.config = null;
        
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const configPath = path.join(__dirname, '../../data/config.json');
            if (await fs.pathExists(configPath)) {
                this.config = await fs.readJson(configPath);
                // Add targetGroupName if it doesn't exist
                if (!this.config.targetGroupName) {
                    this.config.targetGroupName = "Watzapia";
                    await fs.writeJson(configPath, this.config, { spaces: 2 });
                }
            } else {
                this.config = {
                    warmingInterval: 30, // minutes
                    timezone: 'Asia/Jakarta',
                    maxMessagesPerDay: 50,
kingHours: {
                        start: '09:00',
                        end: '18:00'
                    },
                    enableWorkingHoursOnly: true,
                    targetGroupName: "Watzapia", // Default group name
                    sendToGroup: true // Enable sending to group by default
                };
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.config = {
                warmingInterval: 30,
                timezone: 'Asia/Jakarta',
                maxMessagesPerDay: 50,
                    start: '09:00',
                    end: '18:00'
                },
                enableWorkingHoursOnly: true,
                targetGroupName: "Watzapia", // Default group name
                sendToGroup: true // Enable sending to group by default
            };
        }
    }

    async startAutoWarmer() {
        try {
            if (this.isWarmerActive) {
                throw new Error('Auto warmer is already running');
            }

            console.log('Starting WhatsApp Auto Warmer...');
            
            // Check if there are connected contacts
            const connectedContacts = this.whatsappManager.getConnectedContacts();
            if (connectedContacts.length < 2) {
                throw new Error('At least 2 contacts must be connected to start auto warmer');
            }

            this.isWarmerActive = true;
            
            // Start the warming process
            this.scheduleNextMessage();
            
            console.log(`Auto warmer started with ${connectedContacts.length} connected contacts`);
            console.log(`Warming interval: ${this.config.warmingInterval} minutes`);
            
            return {
                success: true,
                connectedContacts: connectedContacts.length,
                interval: this.config.warmingInterval
            };
        } catch (error) {
            console.error('Error starting auto warmer:', error);
            throw error;
        }
    }

    async stopAutoWarmer() {
        try {
            if (!this.isWarmerActive) {
                throw new Error('Auto warmer is not running');
            }

            console.log('Stopping WhatsApp Auto Warmer...');
            
            this.isWarmerActive = false;
            
            if (this.warmerInterval) {
                clearTimeout(this.warmerInterval);
                this.warmerInterval = null;
            }

            console.log('Auto warmer stopped');
            
            return {
                success: true,
                queuedMessages: this.messageQueue.length
            };
        } catch (error) {
            console.error('Error stopping auto warmer:', error);
            throw error;
        }
    }

    scheduleNextMessage() {
        if (!this.isWarmerActive) {
            return;
        }

        const intervalMs = this.config.warmingInterval * 60 * 1000;
        
        this.warmerInterval = setTimeout(async () => {
            try {
                await this.processWarming();
                this.scheduleNextMessage(); // Schedule next iteration
            } catch (error) {
                console.error('Error in warming process:', error);
                // Continue scheduling even if there's an error
                this.scheduleNextMessage();
            }
        }, intervalMs);
    }

    async processWarming() {
        try {
            // Check if we're in working hours (if enabled)
            if (this.config.enableWorkingHoursOnly && !this.isWithinWorkingHours()) {
                console.log('Outside working hours, skipping warming cycle');
                return;
            }

            // Get connected contacts
            const connectedContacts = this.whatsappManager.getConnectedContacts();
            
            if (this.config.sendToGroup) {
                // For group messaging, we only need one contact to send the message
                if (connectedContacts.length < 1) {
                    console.log('No connected contacts for warming');
                    return;
                }
                
                // Select random sender
                const senderId = connectedContacts[Math.floor(Math.random() * connectedContacts.length)];
                
                // Check daily message limits
                if (await this.hasReachedDailyLimit(senderId)) {
                    console.log(`Contact ${senderId} has reached daily message limit`);
                    return;
                }
                
                // Send warming message to group
                await this.sendWarmingMessageToGroup(senderId);
            } else {
                // Original direct messaging between contacts
                if (connectedContacts.length < 2) {
                    console.log('Not enough connected contacts for warming');
                    return;
                }
                
                // Select random sender
                const senderId = connectedContacts[Math.floor(Math.random() * connectedContacts.length)];
                const possibleRecipients = connectedContacts.filter(id => id !== senderId);
                const recipientId = possibleRecipients[Math.floor(Math.random() * possibleRecipients.length)];
                
                // Check daily message limits
                if (await this.hasReachedDailyLimit(senderId)) {
                    console.log(`Contact ${senderId} has reached daily message limit`);
                    return;
                }
                
                // Send warming message to individual
                await this.sendWarmingMessage(senderId, recipientId);
            }

        } catch (error) {
            console.error('Error in warming process:', error);
        }
    }

    async sendWarmingMessage(senderId, recipientId) {
        try {
            // Get contact information
            const senderContact = await this.contactManager.getContact(senderId);
            const recipientContact = await this.contactManager.getContact(recipientId);

            if (!senderContact || !recipientContact) {
                throw new Error('Sender or recipient contact not found');
            }

            // Get active templates
            const templates = await this.templateManager.getActiveTemplates();
            if (templates.length === 0) {
                throw new Error('No active message templates available');
            }

            // Select random template
            const template = templates[Math.floor(Math.random() * templates.length)];

            // Generate message with variables
            const messageData = await this.templateManager.generateMessage(template.id, {
                name: recipientContact.name
            });

            // Format recipient phone number for WhatsApp
            const recipientNumber = this.formatPhoneNumber(recipientContact.phoneNumber);

            // Send message
            const client = this.whatsappManager.getClient(senderId);
            const result = await client.sendMessage(recipientNumber, messageData.message);

            // Update contact statistics
            await this.contactManager.updateContactMessageStats(senderId, 'sent');

            // Log the warming message
            console.log(`Warming message sent: ${senderContact.name} -> ${recipientContact.name}`);
            console.log(`Template: ${template.name}`);
            console.log(`Message: ${messageData.message}`);

            // Save to message history
            await this.saveMessageToHistory({
                type: 'warming',
                senderId,
                recipientId,
                senderName: senderContact.name,
                recipientName: recipientContact.name,
                message: messageData.message,
                templateId: template.id,
                templateName: template.name,
                messageId: result.id._serialized,
                sentAt: new Date().toISOString()
            });

            // Check if recipient has reached daily limit before scheduling reply
            if (await this.hasReachedDailyLimit(recipientId)) {
                console.log(`Contact ${recipientId} has reached daily message limit, skipping reply`);
            } else {
                // Send reply message from recipient to sender after a random delay (30-120 seconds)
                const replyDelaySeconds = Math.floor(Math.random() * 90) + 30; // Random delay between 30-120 seconds
                console.log(`Scheduling reply message in ${replyDelaySeconds} seconds`);
                
                setTimeout(async () => {
                    // Check if we're still within working hours when it's time to send the reply
                    if (this.config.enableWorkingHoursOnly && !this.isWithinWorkingHours()) {
                        console.log('Outside working hours, skipping reply message');
                        return;
                    }
                    
                    // Check again if recipient has reached daily limit
                    if (await this.hasReachedDailyLimit(recipientId)) {
                        console.log(`Contact ${recipientId} has reached daily message limit, skipping reply`);
                        return;
                    }
                    
                    await this.sendReplyMessage(recipientId, senderId, messageData.message);
                }, replyDelaySeconds * 1000);
            }

        } catch (error) {
            console.error('Error sending warming message:', error);
            throw error;
        }
    }
    
    async sendWarmingMessageToGroup(senderId) {
        try {
            // Get sender contact information
            const senderContact = await this.contactManager.getContact(senderId);
            if (!senderContact) {
                throw new Error('Sender contact not found');
            }

            // Get active templates
            const templates = await this.templateManager.getActiveTemplates();
            if (templates.length === 0) {
                throw new Error('No active message templates available');
            }

            // Select random template
            const template = templates[Math.floor(Math.random() * templates.length)];

            // Generate message with variables - use group name instead of recipient name
            const messageData = await this.templateManager.generateMessage(template.id, {
                name: this.config.targetGroupName
            });

            // Find the group and send message
            console.log(`Attempting to send message to group: ${this.config.targetGroupName}`);
            const result = await this.whatsappManager.sendMessageToGroup(
                senderId, 
                this.config.targetGroupName, 
                messageData.message
            );

            // Update contact statistics
            await this.contactManager.updateContactMessageStats(senderId, 'sent');

            // Log the warming message
            console.log(`Warming message sent to group: ${senderContact.name} -> ${this.config.targetGroupName}`);
            console.log(`Template: ${template.name}`);
            console.log(`Message: ${messageData.message}`);

            // Save to message history
            await this.saveMessageToHistory({
                type: 'group_warming',
                senderId,
                recipientId: 'group',
                senderName: senderContact.name,
                recipientName: this.config.targetGroupName,
                message: messageData.message,
                templateId: template.id,
                templateName: template.name,
                messageId: result.id._serialized,
                sentAt: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error sending warming message to group:', error);
            throw error;
        }
    }

    formatPhoneNumber(phoneNumber) {
        // // Remove all non-digit characters except +
        // let formatted = phoneNumber.replace(/[^\d+]/g, '');
        
        // // If it doesn't start with +, add country code (assuming Indonesia +62)
        // if (!formatted.startsWith('+')) {
        //     if (formatted.startsWith('0')) {
        //         formatted = '+62' + formatted.substring(1);
        //     } else {
        //         formatted = '+62' + formatted;
        //     }
        // }
        
        // Add @c.us for WhatsApp format
        return phoneNumber.replace('+', '') + '@c.us';
    }
    
    async sendReplyMessage(senderId, recipientId, originalMessage) {
        try {
            // Get contact information
            const senderContact = await this.contactManager.getContact(senderId);
            const recipientContact = await this.contactManager.getContact(recipientId);

            if (!senderContact || !recipientContact) {
                throw new Error('Sender or recipient contact not found for reply');
            }

            // Create reply templates based on the original message
            const replyTemplates = [
                `Hey ${recipientContact.name}, thanks for your message! How are you doing today?`,
                `Hi ${recipientContact.name}! Good to hear from you. What's new?`,
                `Hello ${recipientContact.name}! Thanks for reaching out. How's everything going?`,
                `${recipientContact.name}, nice to hear from you! How have you been?`
            ];

            // Select random reply template
            const replyMessage = replyTemplates[Math.floor(Math.random() * replyTemplates.length)];

            // Format recipient phone number for WhatsApp
            const recipientNumber = this.formatPhoneNumber(recipientContact.phoneNumber);

            // Send reply message
            const client = this.whatsappManager.getClient(senderId);
            const result = await client.sendMessage(recipientNumber, replyMessage);

            // Update contact statistics
            await this.contactManager.updateContactMessageStats(senderId, 'sent');

            // Log the reply message
            console.log(`Reply message sent: ${senderContact.name} -> ${recipientContact.name}`);
            console.log(`Message: ${replyMessage}`);

            // Save to message history
            await this.saveMessageToHistory({
                type: 'reply',
                senderId,
                recipientId,
                senderName: senderContact.name,
                recipientName: recipientContact.name,
                message: replyMessage,
                messageId: result.id._serialized,
                sentAt: new Date().toISOString(),
                replyToMessage: originalMessage
            });

        } catch (error) {
            console.error('Error sending reply message:', error);
            // Don't throw the error to prevent it from affecting the main flow
        }
    }

    async handleIncomingMessage(messageId, senderId, recipientId) {
        // Update contact statistics
        await this.contactManager.updateContactMessageStats(senderId, 'received');
    }

    isWithinWorkingHours() {
        const now = moment().tz(this.config.timezone);
        const currentTime = now.format('HH:mm');
        
        return currentTime >= this.config.workingHours.start && 
               currentTime <= this.config.workingHours.end;
    }

    async hasReachedDailyLimit(contactId) {
        try {
            const today = moment().tz(this.config.timezone).format('YYYY-MM-DD');
            const historyPath = path.join(__dirname, '../../data/message-history.json');
            
            if (!await fs.pathExists(historyPath)) {
                return false;
            }

            const history = await fs.readJson(historyPath);
            const todayMessages = history.filter(msg => 
                msg.senderId === contactId && 
                msg.sentAt.startsWith(today) &&
                (msg.type === 'warming' || msg.type === 'reply' || msg.type === 'group_warming')
            );

            return todayMessages.length >= this.config.maxMessagesPerDay;
        } catch (error) {
            console.error('Error checking daily limit:', error);
            return false;
        }
    }

    async saveMessageToHistory(messageData) {
        try {
            const historyPath = path.join(__dirname, '../../data/message-history.json');
            let history = [];
            
            if (await fs.pathExists(historyPath)) {
                history = await fs.readJson(historyPath);
            }
            
            history.push(messageData);
            
            // Keep only last 10000 messages
            if (history.length > 10000) {
                history = history.slice(-10000);
            }
            
            await fs.writeJson(historyPath, history, { spaces: 2 });
        } catch (error) {
            console.error('Error saving message to history:', error);
        }
    }

    getWarmerStatus() {
        const connectedContacts = this.whatsappManager.getConnectedContacts();
        
        return {
            isActive: this.isWarmerActive,
            connectedContacts: connectedContacts.length,
            queuedMessages: this.messageQueue.length,
            config: this.config,
            nextMessageIn: this.warmerInterval ? this.config.warmingInterval : null,
            withinWorkingHours: this.isWithinWorkingHours()
        };
    }

    async updateConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            
            const configPath = path.join(__dirname, '../../data/config.json');
            await fs.writeJson(configPath, this.config, { spaces: 2 });
            
            console.log('Message manager config updated');
            return this.config;
        } catch (error) {
            console.error('Error updating config:', error);
            throw error;
        }
    }
}

module.exports = MessageManager;
