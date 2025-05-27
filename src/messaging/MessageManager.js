const moment = require('moment-timezone');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

class MessageManager {
    constructor(whatsappManager, templateManager, contactManager) {
        this.whatsappManager = whatsappManager;
        this.templateManager = templateManager;
        this.contactManager = contactManager;
        
        this.isWarmerActive = false;
        this.warmerInterval = null;
        this.messageQueue = [];
        this.config = null;
        
        // Message timeout tracking
        this.messagesSentInTimeout = 0;
        this.isInTimeoutPause = false;
        
        // Tracking for balanced odd/even distribution
        this.lastRandomWasEven = null;
        this.evenCount = 0;
        this.oddCount = 0;
        
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const configPath = path.join(__dirname, '../../data/config.json');
            if (await fs.pathExists(configPath)) {
                this.config = await fs.readJson(configPath);
                // Add targetGroupName1 if it doesn't exist
                if (!this.config.targetGroupName1) {
                    this.config.targetGroupName1 = this.config.targetGroupName || "Watzapia";
                    // Remove old property if it exists
                    if (this.config.targetGroupName) {
                        delete this.config.targetGroupName;
                    }
                    await fs.writeJson(configPath, this.config, { spaces: 2 });
                }
                
                // Add targetGroupName2 if it doesn't exist
                if (!this.config.targetGroupName2) {
                    this.config.targetGroupName2 = "";
                    await fs.writeJson(configPath, this.config, { spaces: 2 });
                }
            } else {
                this.config = {
                    minWarmingInterval: 15, // seconds
                    maxWarmingInterval: 45, // seconds
                    timezone: 'Asia/Jakarta',
                    maxMessagesPerDay: 50,
                    workingHours: {
                        start: '09:00',
                        end: '18:00'
                    },
                    enableWorkingHoursOnly: true,
                    targetGroupName1: "Watzapia", // Default group name
                    targetGroupName2: "", // Second group name
                    sendToGroup: true, // Enable sending to group by default
                    tulilutCookie: "", // Cookie for tulilut.xyz
                };
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.config = {
                minWarmingInterval: 15, // seconds
                maxWarmingInterval: 45, // seconds
                timezone: 'Asia/Jakarta',
                maxMessagesPerDay: 50,
                workingHours: {
                    start: '09:00',
                    end: '18:00'
                },
                enableWorkingHoursOnly: true,
                targetGroupName1: "Watzapia", // Default group name
                targetGroupName2: "", // Second group name
                sendToGroup: true, // Enable sending to group by default
                tulilutCookie: "", // Cookie for tulilut.xyz
            };
        }
    }

    /**
     * Updates device settings on tulilut.xyz
     * @param {string} contactName - The contact name to update settings for
     * @param {string} csrfToken - The CSRF token for the request
     * @param {string} cookie - The cookie value for authentication
     * @returns {Promise<boolean>} - True if successful, false otherwise
     */
    async updateTulilutDeviceSettings(contactName, csrfToken, cookie) {
        try {
            console.log(`Updating tulilut.xyz device settings for ${contactName}...`);
            
            const url = 'https://tulilut.xyz/app/device/device-settings-update';
            
            const payload = new URLSearchParams();
            payload.append('id', contactName);
            
            // Set all limits to 1 and active
            for (let i = 1; i <= 7; i++) {
                payload.append(`limits[${i}][active]`, 'on');
                payload.append(`limits[${i}][limit]`, '1');
            }
            
            const response = await axios.post(url, payload, {
                headers: {
                    'Cookie': cookie,
                    'X-Csrf-Token': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            if (response.status === 200) {
                console.log(`Successfully updated device settings for ${contactName}`);
                return true;
            } else {
                console.error(`Failed to update device settings for ${contactName}: ${response.statusText}`);
                return false;
            }
        } catch (error) {
            console.error(`Error updating tulilut.xyz device settings for ${contactName}:`, error.message);
            return false;
        }
    }
    
    /**
     * Fetches the CSRF token from tulilut.xyz dashboard
     * @param {string} cookie - The cookie value for authentication
     * @returns {Promise<string|null>} - The CSRF token or null if not found
     */
    async fetchTulilutCsrfToken(cookie) {
        try {
            console.log('Fetching CSRF token from tulilut.xyz dashboard...');
            
            const response = await axios.get('https://tulilut.xyz/app/dashboard', {
                headers: {
                    'Cookie': cookie
                }
            });
            
            if (response.status === 200) {
                // Extract CSRF token from HTML response
                const html = response.data;
                const csrfTokenMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/i);
                
                if (csrfTokenMatch && csrfTokenMatch[1]) {
                    const csrfToken = csrfTokenMatch[1];
                    console.log('Successfully retrieved CSRF token');
                    return csrfToken;
                } else {
                    console.error('CSRF token not found in the response');
                    return null;
                }
            } else {
                console.error(`Failed to fetch dashboard: ${response.statusText}`);
                return null;
            }
        } catch (error) {
            console.error('Error fetching tulilut.xyz CSRF token:', error.message);
            return null;
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

            // Check if tulilut cookie is configured
            if (this.config.tulilutCookie) {
                try {
                    console.log('Tulilut cookie found, updating device settings...');
                    
                    // Step 1: Fetch CSRF token
                    const csrfToken = await this.fetchTulilutCsrfToken(this.config.tulilutCookie);
                    
                    if (csrfToken) {
                        // Step 2: Update device settings for each contact
                        for (const contactId of connectedContacts) {
                            const contact = await this.contactManager.getContact(contactId);
                            if (contact) {
                                await this.updateTulilutDeviceSettings(
                                    contact.name, 
                                    csrfToken, 
                                    this.config.tulilutCookie
                                );
                            }
                        }
                        console.log('Tulilut device settings update completed');
                    } else {
                        console.error('Failed to fetch CSRF token, skipping tulilut device settings update');
                    }
                } catch (tulilutError) {
                    console.error('Error updating tulilut device settings:', tulilutError);
                    // Continue with auto warmer even if tulilut update fails
                }
            } else {
                console.log('Tulilut cookie not configured, skipping device settings update');
            }

            this.isWarmerActive = true;
            this.messagesSentInTimeout = 0;
            this.isInTimeoutPause = false;
            
            // Start the warming process
            this.scheduleNextMessage();
            
            // Get min and max warming intervals
            const minInterval = this.config.minWarmingInterval || 15;
            const maxInterval = this.config.maxWarmingInterval || 45;
            
            console.log(`Auto warmer started with ${connectedContacts.length} connected contacts`);
            console.log(`Warming interval range: ${minInterval}-${maxInterval} seconds`);
            
            return {
                success: true,
                connectedContacts: connectedContacts.length,
                minInterval: minInterval,
                maxInterval: maxInterval
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

        // Get timeout configuration
        const timeoutSeconds = this.config.timeoutSeconds || 60;
        const maxMessageTimeout = this.config.maxMessageTimeout || 5;
        
        // Check if we need to pause due to reaching message limit
        if (this.messagesSentInTimeout >= maxMessageTimeout) {
            console.log(`Reached max messages per timeout (${this.messagesSentInTimeout}/${maxMessageTimeout}). Pausing for ${timeoutSeconds} seconds.`);
            this.isInTimeoutPause = true;
            
            // Set a timeout to resume after the pause
            setTimeout(() => {
                console.log(`Timeout pause completed. Resetting message counter.`);
                this.messagesSentInTimeout = 0;
                this.isInTimeoutPause = false;
                this.scheduleNextMessage(); // Resume scheduling
            }, timeoutSeconds * 1000);
            
            return; // Exit without scheduling next message
        }
        
        // Get min and max warming intervals
        const minInterval = this.config.minWarmingInterval || 15;
        const maxInterval = this.config.maxWarmingInterval || 45;
        
        // Generate a random interval between min and max (inclusive)
        const randomInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        
        console.log(`Using random warming interval: ${randomInterval} seconds (range: ${minInterval}-${maxInterval})`);
        
        const intervalMs = randomInterval * 1000;
        
        this.warmerInterval = setTimeout(async () => {
            try {
                // Generate a balanced random value ensuring even distribution of odd/even outcomes
                const randomBalancedValue = this.getBalancedRandomValue();
                if (randomBalancedValue % 2 === 0) {
                    // Even value - execute processWarming
                    console.log(`Even value (${randomBalancedValue}) - executing processWarming`);
                    await this.processWarming();
                    // Note: messagesSentInTimeout is now incremented inside processWarming for each message
                    console.log(`Messages sent in current timeout: ${this.messagesSentInTimeout}/${maxMessageTimeout}`);
                } else {
                    // Odd value - execute processWarmingGroup
                    console.log(`Odd value (${randomBalancedValue}) - executing processWarmingGroup`);
                    await this.processWarmingGroup();
                    // Note: messagesSentInTimeout is now incremented inside processWarmingGroup for each message
                    console.log(`Messages sent in current timeout: ${this.messagesSentInTimeout}/${maxMessageTimeout}`);
                }
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
            
            // Original direct messaging between contacts
            if (connectedContacts.length < 2) {
                console.log('Not enough connected contacts for warming');
                return;
            }
            
            // Track if at least one message was sent
            let messageSent = false;
            
            // Get timeout configuration
            const maxMessageTimeout = this.config.maxMessageTimeout || 5;
            
            // Try to send a message from each connected contact
            for (const senderId of connectedContacts) {
                // Check if we've reached the max messages per timeout
                if (this.messagesSentInTimeout >= maxMessageTimeout) {
                    console.log(`Reached max messages per timeout (${this.messagesSentInTimeout}/${maxMessageTimeout}). Stopping this warming cycle.`);
                    break;
                }
                
                try {
                    // Check daily message limits for this sender
                    if (await this.hasReachedDailyLimit(senderId)) {
                        console.log(`Contact ${senderId} has reached daily message limit, skipping`);
                        continue;
                    }
                    
                    // Get possible recipients (all contacts except the sender)
                    const possibleRecipients = connectedContacts.filter(id => id !== senderId);
                    
                    // Select a random recipient
                    const recipientId = possibleRecipients[Math.floor(Math.random() * possibleRecipients.length)];
                    
                    // Send warming message to individual
                    await this.sendWarmingMessage(senderId, recipientId);
                    messageSent = true;
                    
                    // Increment message counter for timeout tracking
                    this.messagesSentInTimeout++;
                    
                    // Log success
                    console.log(`Successfully sent warming message from contact ${senderId}`);
                } catch (senderError) {
                    console.error(`Error sending message from contact ${senderId}:`, senderError);
                    // Continue with next sender
                }
            }
            
            if (!messageSent) {
                console.log('No messages were sent - all contacts may have reached their daily limits');
            }

        } catch (error) {
            console.error('Error in warming process:', error);
        }
    }

    /**
     * Generates a random value between 1 and 10 with a balanced distribution of odd and even outcomes
     * This ensures that over time, both processWarming and processWarmingGroup are called equally
     * @returns {number} A random integer between 1 and 10
     */
    getBalancedRandomValue() {
        // If we have no history or the counts are equal, use pure random
        if (this.lastRandomWasEven === null || this.evenCount === this.oddCount) {
            const randomVal = Math.floor(Math.random() * 10) + 1;
            // Update tracking
            this.lastRandomWasEven = randomVal % 2 === 0;
            this.lastRandomWasEven ? this.evenCount++ : this.oddCount++;
            return randomVal;
        }
        
        // If we have more even numbers, force an odd number
        if (this.evenCount > this.oddCount) {
            // Generate odd number (1,3,5,7,9)
            const oddValues = [1, 3, 5, 7, 9];
            const randomVal = oddValues[Math.floor(Math.random() * oddValues.length)];
            this.lastRandomWasEven = false;
            this.oddCount++;
            return randomVal;
        } else {
            // Generate even number (2,4,6,8,10)
            const evenValues = [2, 4, 6, 8, 10];
            const randomVal = evenValues[Math.floor(Math.random() * evenValues.length)];
            this.lastRandomWasEven = true;
            this.evenCount++;
            return randomVal;
        }
    }

    async processWarmingGroup() {
        try {
            // Check if we're in working hours (if enabled)
            if (this.config.enableWorkingHoursOnly && !this.isWithinWorkingHours()) {
                console.log('Outside working hours, skipping warming cycle');
                return;
            }

            // Get connected contacts
            const connectedContacts = this.whatsappManager.getConnectedContacts();
            
            if (this.config.sendToGroup) {
                // For group messaging, we need at least one contact
                if (connectedContacts.length < 1) {
                    console.log('No connected contacts for warming');
                    return;
                }
                
                // Track if at least one message was sent
                let messageSent = false;
                
                // Get timeout configuration
                const maxMessageTimeout = this.config.maxMessageTimeout || 5;
                
                // Try to send a message from each connected contact
                for (const senderId of connectedContacts) {
                    // Check if we've reached the max messages per timeout
                    if (this.messagesSentInTimeout >= maxMessageTimeout) {
                        console.log(`Reached max messages per timeout (${this.messagesSentInTimeout}/${maxMessageTimeout}). Stopping this warming cycle.`);
                        break;
                    }
                    
                    try {
                        // Check daily message limits for this sender
                        if (await this.hasReachedDailyLimit(senderId)) {
                            console.log(`Contact ${senderId} has reached daily message limit, skipping`);
                            continue;
                        }
                        
                        // Randomly choose which group to send to
                        const randomValBetween1To5 = Math.floor(Math.random() * 5) + 1;
                        if (randomValBetween1To5 % 2 === 0) {
                            // Send warming message to first group
                            if (this.config.targetGroupName1 && this.config.targetGroupName1.trim() !== '') {
                                await this.sendWarmingMessageToGroup(senderId, this.config.targetGroupName1);
                                messageSent = true;
                                // Increment message counter for timeout tracking
                                this.messagesSentInTimeout++;
                                console.log(`Successfully sent group warming message from contact ${senderId} to group ${this.config.targetGroupName1}`);
                            }
                        } else {
                            // Send warming message to second group if configured
                            if (this.config.targetGroupName2 && this.config.targetGroupName2.trim() !== '') {
                                await this.sendWarmingMessageToGroup(senderId, this.config.targetGroupName2);
                                messageSent = true;
                                // Increment message counter for timeout tracking
                                this.messagesSentInTimeout++;
                                console.log(`Successfully sent group warming message from contact ${senderId} to group ${this.config.targetGroupName2}`);
                            }
                        }
                    } catch (senderError) {
                        console.error(`Error sending group message from contact ${senderId}:`, senderError);
                        // Continue with next sender
                    }
                }
                
                if (!messageSent) {
                    console.log('No group messages were sent - all contacts may have reached their daily limits or no valid groups configured');
                }
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
                // Send reply message from recipient to sender after a random delay (30-60 seconds)
                const replyDelaySeconds = Math.floor(Math.random() * 31) + 30; // Random delay between 30-60 seconds
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
    
    async sendWarmingMessageToGroup(senderId, targetGroupName1) {
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
                name: targetGroupName1
            });

            // Find the group and send message
            console.log(`Attempting to send message to group: ${targetGroupName1}`);
            const result = await this.whatsappManager.sendMessageToGroup(
                senderId, 
                targetGroupName1, 
                messageData.message
            );

            // Update contact statistics
            await this.contactManager.updateContactMessageStats(senderId, 'sent');

            // Log the warming message
            console.log(`Warming message sent to group: ${senderContact.name} -> ${targetGroupName1}`);
            console.log(`Template: ${template.name}`);
            console.log(`Message: ${messageData.message}`);

            // Save to message history
            await this.saveMessageToHistory({
                type: 'group_warming',
                senderId,
                recipientId: 'group',
                senderName: senderContact.name,
                recipientName: targetGroupName1,
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
            nextMessageIn: this.warmerInterval ? Math.floor(Math.random() * (this.config.maxWarmingInterval - this.config.minWarmingInterval + 1)) + this.config.minWarmingInterval : null,
            withinWorkingHours: this.isWithinWorkingHours(),
            messagesSentInTimeout: this.messagesSentInTimeout,
            maxMessageTimeout: this.config.maxMessageTimeout || 5,
            isInTimeoutPause: this.isInTimeoutPause,
            timeoutSeconds: this.config.timeoutSeconds || 60
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
