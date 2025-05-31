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
        
        // Per-contact message timeout tracking
        this.contactMessageCounts = {};
        this.contactTimeoutTimers = {};
        
        // Tracking for balanced odd/even distribution
        this.lastRandomWasEven = null;
        this.evenCount = 0;
        this.oddCount = 0;
        
        // Tulilut reset scheduler
        this.tulilutResetScheduler = null;
        
        this.loadConfig();
    }

    /**
     * Sets up the scheduler for resetting tulilut device settings
     * @private
     */
    setupTulilutResetScheduler() {
        // Clear any existing scheduler
        if (this.tulilutResetScheduler) {
            clearTimeout(this.tulilutResetScheduler);
            this.tulilutResetScheduler = null;
        }
        
        // If no reset time is configured, don't set up the scheduler
        if (!this.config || !this.config.tulilutResetTime) {
            console.log('Tulilut reset scheduler not set up: no reset time configured');
            return;
        }
        
        // Calculate the time until the next reset
        const now = moment().tz(this.config.timezone || 'Asia/Jakarta');
        const resetTimeParts = this.config.tulilutResetTime.split(':');
        const resetHour = parseInt(resetTimeParts[0]);
        const resetMinute = parseInt(resetTimeParts[1]);
        
        // Create a moment object for today's reset time
        const resetTime = moment().tz(this.config.timezone || 'Asia/Jakarta')
            .hour(resetHour)
            .minute(resetMinute)
            .second(0)
            .millisecond(0);
        
        // If the reset time has already passed today, schedule for tomorrow
        if (now.isAfter(resetTime)) {
            resetTime.add(1, 'day');
        }
        
        // Calculate milliseconds until the reset time
        const msUntilReset = resetTime.diff(now);
        
        console.log(`Tulilut reset scheduler set up for ${resetTime.format('YYYY-MM-DD HH:mm:ss')} (${msUntilReset}ms from now)`);
        
        // Set up the scheduler
        this.tulilutResetScheduler = setTimeout(() => {
            this.resetTulilutDeviceSettings().catch(error => {
                console.error('Error in scheduled tulilut device settings reset:', error);
            });
            
            // Set up the next day's scheduler
            this.setupTulilutResetScheduler();
        }, msUntilReset);
    }
    
    /**
     * Resets tulilut device settings to limit 1 for all connected contacts
     * @returns {Promise<void>}
     */
    async resetTulilutDeviceSettings() {
        try {
            console.log('Running scheduled tulilut device settings reset...');
            
            // Check if tulilut cookie is configured
            if (!this.config.tulilutCookie) {
                console.log('Tulilut cookie not configured, skipping device settings reset');
                return;
            }
            
            // Get connected contacts
            const connectedContacts = this.whatsappManager.getConnectedContacts();
            if (connectedContacts.length === 0) {
                console.log('No connected contacts, skipping tulilut device settings reset');
                return;
            }
            
            // Fetch CSRF token
            const csrfToken = await this.fetchTulilutCsrfToken(this.config.tulilutCookie);
            if (!csrfToken) {
                console.error('Failed to fetch CSRF token, skipping tulilut device settings reset');
                return;
            }
            
            // Update device settings for each contact with limit 1
            for (const contactId of connectedContacts) {
                // Skip contacts that are in timeout
                if (this.isContactInTimeout(contactId)) {
                    const contact = await this.contactManager.getContact(contactId);
                    console.log(`Contact ${contact ? contact.name : contactId} is in timeout, skipping Tulilut device settings reset`);
                    continue;
                }
                
                const contact = await this.contactManager.getContact(contactId);
                if (contact) {
                    // Force limit to 1 by passing null for phoneNumber
                    await this.updateTulilutDeviceSettings(
                        contact.name, 
                        csrfToken, 
                        this.config.tulilutCookie,
                        null, // This will force limit to 1
                        contact // Pass the contact object to check maxMessagesPerDay
                    );
                }
            }
            
            console.log('Tulilut device settings reset completed successfully');
        } catch (error) {
            console.error('Error resetting tulilut device settings:', error);
            throw error;
        }
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
                
                // Add tulilutCookie if it doesn't exist
                if (this.config.tulilutCookie === undefined) {
                    this.config.tulilutCookie = "";
                    await fs.writeJson(configPath, this.config, { spaces: 2 });
                }
                
                // Set up the tulilut reset scheduler
                this.setupTulilutResetScheduler();
            } else {
                this.config = {
                    minWarmingInterval: 15, // seconds
                    maxWarmingInterval: 45, // seconds
                    timezone: 'Asia/Jakarta',
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
     * Fetches the current success count for a contact from tulilut.xyz
     * @param {string} contactName - The contact name to fetch data for
     * @param {string} phoneNumber - The phone number to match in the receiver field
     * @param {string} cookie - The cookie value for authentication
     * @returns {Promise<number>} - The current success count or 0 if not found
     */
    async fetchTulilutSuccessCount(contactName, phoneNumber, cookie) {
        try {
            console.log(`Fetching success count for ${contactName} (${phoneNumber})...`);
            
            // Get current date in YYYY-MM-DD format
            const currentDate = moment().tz(this.config.timezone).format('YYYY-MM-DD');
            
            // Construct the URL with the current date
            const url = `https://tulilut.xyz/app/history?receiver=&date=${currentDate}&draw=1&columns%5B0%5D%5Bdata%5D=responsive_id&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=receiver&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=success&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=amount&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=status&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc&start=0&length=20&search%5Bvalue%5D=&search%5Bregex%5D=false&_=${Date.now()}`;
            
            const response = await axios.get(url, {
                headers: {
                    'Cookie': cookie,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (response.status === 200 && response.data && response.data.data) {
                // Extract the phone number without any non-digit characters for comparison
                const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
                
                // Find the matching receiver entry
                const matchingEntry = response.data.data.find(entry => {
                    // Clean the receiver string to extract just the phone number part
                    const receiverPhoneMatch = entry.receiver.match(/(\d+)/);
                    if (receiverPhoneMatch) {
                        const receiverPhone = receiverPhoneMatch[0];
                        return receiverPhone.includes(cleanPhoneNumber) || cleanPhoneNumber.includes(receiverPhone);
                    }
                    return false;
                });
                
                if (matchingEntry) {
                    console.log(`Found matching entry for ${contactName}: success count = ${matchingEntry.success}`);
                    return matchingEntry.success || 0;
                } else {
                    console.log(`No matching entry found for ${contactName} with phone ${phoneNumber}`);
                    return 0;
                }
            } else {
                console.error(`Failed to fetch success count: ${response.statusText}`);
                return 0;
            }
        } catch (error) {
            console.error(`Error fetching tulilut.xyz success count for ${contactName}:`, error.message);
            return 0;
        }
    }

    /**
     * Updates device settings on tulilut.xyz
     * @param {string} contactName - The contact name to update settings for
     * @param {string} csrfToken - The CSRF token for the request
     * @param {string} cookie - The cookie value for authentication
     * @param {string} phoneNumber - The phone number to match in the receiver field
     * @param {object} contact - The contact object (optional)
     * @returns {Promise<boolean>} - True if successful, false otherwise
     */
    async updateTulilutDeviceSettings(contactName, csrfToken, cookie, phoneNumber = null, contact = null) {
        try {
            console.log(`Checking tulilut.xyz device settings for ${contactName}...`);
            
            // Default limit value
            let limitValue = 1;
            let successCount = 0;
            
            // If phone number is provided and not null, check the current success count
            if (phoneNumber && phoneNumber !== null && cookie) {
                successCount = await this.fetchTulilutSuccessCount(contactName, phoneNumber, cookie);
                
                // Check if the contact has daily message limits configured
                if (contact && contact.dailyMessageLimits && contact.dailyMessageLimits.length > 0) {
                    // Get the current active limit
                    const currentLimitIndex = contact.currentDailyLimitIndex || 0;
                    const currentLimit = contact.dailyMessageLimits[currentLimitIndex];
                    
                    // If the current limit is defined and greater than 0, check if it's been exceeded
                    if (currentLimit && currentLimit.limit > 0) {
                        if (successCount >= currentLimit.limit) {
                            console.log(`Contact ${contactName} has reached daily limit ${currentLimitIndex + 1} of ${currentLimit.limit} messages (current: ${successCount}).`);
                            
                            // Check if there are more limits available
                            if (currentLimitIndex < contact.dailyMessageLimits.length - 1) {
                                console.log(`Moving to next daily limit after timeout of ${currentLimit.timeoutMinutes} minutes.`);
                                
                                // Schedule the advancement to the next limit
                                setTimeout(async () => {
                                    try {
                                        // Get the contact ID from the name
                                        const contacts = await this.contactManager.getAllContacts();
                                        const matchingContact = contacts.find(c => c.name === contactName);
                                        
                                        if (matchingContact) {
                                            // Update the contact's current limit index
                                            await this.contactManager.updateContact(matchingContact.id, {
                                                currentDailyLimitIndex: currentLimitIndex + 1
                                            });
                                            
                                            console.log(`Advanced ${contactName} to daily limit ${currentLimitIndex + 2}`);
                                        }
                                    } catch (error) {
                                        console.error(`Error advancing daily limit for ${contactName}:`, error);
                                    }
                                }, currentLimit.timeoutMinutes * 60 * 1000); // Convert minutes to milliseconds
                                
                                // Skip device settings update for now
                                return false;
                            } else {
                                console.log(`All daily limits have been reached for ${contactName}. Skipping device settings update.`);
                                return false;
                            }
                        } else {
                            console.log(`Contact ${contactName} has sent ${successCount}/${currentLimit.limit} messages for limit ${currentLimitIndex + 1}.`);
                        }
                    }
                }
                // For backward compatibility, also check the legacy maxMessagesPerDay
                else if (contact && contact.maxMessagesPerDay > 0) {
                    if (successCount >= contact.maxMessagesPerDay) {
                        console.log(`Contact ${contactName} has reached daily limit of ${contact.maxMessagesPerDay} messages (current: ${successCount}). Skipping device settings update.`);
                        return false;
                    } else {
                        console.log(`Contact ${contactName} has sent ${successCount}/${contact.maxMessagesPerDay} messages today.`);
                    }
                }
                
                // Increment the success count by 1 (minimum 1)
                limitValue = Math.max(1, successCount + 1);
                console.log(`Setting limit value to ${limitValue} based on current success count of ${successCount}`);
            } else {
                console.log(`Setting limit value to 1 for ${contactName} (forced reset)`);
            }
            
            // Proceed with the update
            console.log(`Updating tulilut.xyz device settings for ${contactName}...`);
            
            const url = 'https://tulilut.xyz/app/device/device-settings-update';
            const payload = new URLSearchParams();
            payload.append('id', contactName);
            
            // Set all limits to the calculated value and active
            for (let i = 1; i <= 7; i++) {
                payload.append(`limits[${i}][active]`, 'on');
                payload.append(`limits[${i}][limit]`, limitValue.toString());
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
                console.log(`Successfully updated device settings for ${contactName} with limit value ${limitValue}`);
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
                                    this.config.tulilutCookie,
                                    contact.phoneNumber,
                                    contact // Pass the contact object to check maxMessagesPerDay
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
            // Reset per-contact message tracking
            this.contactMessageCounts = {};
            
            // Clear any existing timeout timers
            Object.keys(this.contactTimeoutTimers).forEach(contactId => {
                clearTimeout(this.contactTimeoutTimers[contactId]);
            });
            this.contactTimeoutTimers = {};
            
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

    /**
     * Checks if a contact has reached their message timeout limit
     * @param {string} contactId - The ID of the contact to check
     * @returns {boolean} - True if the contact is in timeout, false otherwise
     */
    isContactInTimeout(contactId) {
        return !!this.contactTimeoutTimers[contactId];
    }
    
    /**
     * Increments the message count for a contact and checks if they need to enter timeout
     * @param {string} contactId - The ID of the contact
     * @param {Object} contact - The contact object
     * @returns {boolean} - True if the contact can send messages, false if in timeout
     */
    async trackContactMessage(contactId, contact) {
        // If contact is already in timeout, they can't send messages
        if (this.isContactInTimeout(contactId)) {
            return false;
        }
        
        // Initialize message count if not exists
        if (!this.contactMessageCounts[contactId]) {
            this.contactMessageCounts[contactId] = 0;
        }
        
        // Get contact's timeout settings (or use defaults)
        const maxMessageTimeout = contact.maxMessageTimeout || 5;
        const timeoutSeconds = contact.timeoutSeconds || 60;
        
        // Check if contact has reached their message limit
        if (this.contactMessageCounts[contactId] >= maxMessageTimeout) {
            console.log(`Contact ${contact.name} reached max messages (${this.contactMessageCounts[contactId]}/${maxMessageTimeout}). Pausing for ${timeoutSeconds} seconds.`);
            
            // Set timeout for this contact
            this.contactTimeoutTimers[contactId] = setTimeout(() => {
                console.log(`Timeout completed for contact ${contact.name}. Resetting message counter.`);
                this.contactMessageCounts[contactId] = 0;
                delete this.contactTimeoutTimers[contactId];
            }, timeoutSeconds * 1000);
            
            return false; // Contact is now in timeout
        }
        
        // Increment message count
        this.contactMessageCounts[contactId]++;

        return true; // Contact can send messages
    }
    
    scheduleNextMessage() {
        if (!this.isWarmerActive) {
            return;
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
                } else {
                    // Odd value - execute processWarmingGroup
                    console.log(`Odd value (${randomBalancedValue}) - executing processWarmingGroup`);
                    await this.processWarmingGroup();
                }

                // Check if tulilut cookie is configured to update device settings periodically
                if (this.config.tulilutCookie) {
                    try {
                        // Update Tulilut device settings for all connected contacts
                        const connectedContacts = this.whatsappManager.getConnectedContacts();
                        if (connectedContacts.length > 0) {
                            // Fetch CSRF token
                            const csrfToken = await this.fetchTulilutCsrfToken(this.config.tulilutCookie);
                            
                            if (csrfToken) {
                                console.log('Periodically updating Tulilut device settings for all connected contacts...');
                                
                                // Update device settings for each contact with incremented success count
                                for (const contactId of connectedContacts) {
                                    // Skip contacts that are in timeout
                                    if (this.isContactInTimeout(contactId)) {
                                        const contact = await this.contactManager.getContact(contactId);
                                        console.log(`Contact ${contact ? contact.name : contactId} is in timeout, skipping Tulilut device settings update`);
                                        continue;
                                    }
                                    
                                    const contact = await this.contactManager.getContact(contactId);
                                    if (contact && contact.push) {
                                        await this.updateTulilutDeviceSettings(
                                            contact.name, 
                                            csrfToken, 
                                            this.config.tulilutCookie,
                                            contact.phoneNumber,
                                            contact // Pass the contact object to check maxMessagesPerDay
                                        );
                                    }
                                }
                            }
                        }
                    } catch (tulilutError) {
                        console.error('Error updating Tulilut device settings during warming cycle:', tulilutError);
                        // Continue with warming process even if Tulilut update fails
                    }
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
            let connectedContacts = this.whatsappManager.getConnectedContacts();
            
            // Filter out contacts that have warmer set to false
            const allContacts = await this.contactManager.getAllContacts();
            connectedContacts = connectedContacts.filter(contactId => {
                const contact = allContacts.find(c => c.id === contactId);
                return contact && contact.warmer !== false;
            });
            
            console.log(`Found ${connectedContacts.length} connected contacts with warming enabled`);
            
            // Original direct messaging between contacts
            if (connectedContacts.length < 2) {
                console.log('Not enough contacts with warming enabled for warming process');
                return;
            }
            
            // Track if at least one message was sent
            let messageSent = false;
            
            // Try to send a message from each connected contact
            for (const senderId of connectedContacts) {
                // Get the contact object
                const senderContact = await this.contactManager.getContact(senderId);
                if (!senderContact) {
                    console.log(`Contact with ID ${senderId} not found, skipping`);
                    continue;
                }
                
                // Check if this contact is in timeout
                if (this.isContactInTimeout(senderId)) {
                    console.log(`Contact ${senderContact.name} is in timeout, skipping`);
                    continue;
                }
                
                try {                    
                    // Get possible recipients (all contacts except the sender)
                    const possibleRecipients = connectedContacts.filter(id => id !== senderId);
                    
                    // Sort possible recipients by phone number
                    const sortedRecipients = [...possibleRecipients];
                    const recipientContacts = await Promise.all(
                        sortedRecipients.map(id => this.contactManager.getContact(id))
                    );
                    
                    // Create a mapping of IDs to contacts for sorting
                    const contactMap = {};
                    recipientContacts.forEach(contact => {
                        if (contact) {
                            contactMap[contact.id] = contact;
                        }
                    });
                    
                    // Sort the recipient IDs by phone number
                    sortedRecipients.sort((a, b) => {
                        const contactA = contactMap[a];
                        const contactB = contactMap[b];
                        if (contactA && contactB) {
                            return contactA.phoneNumber.localeCompare(contactB.phoneNumber);
                        }
                        return 0;
                    });
                    
                    // Get sender contact to determine its phone number
                    const senderContact = await this.contactManager.getContact(senderId);
                    if (!senderContact) {
                        throw new Error(`Sender contact ${senderId} not found`);
                    }
                    
                    // Find the recipient with the next higher phone number
                    // For circular pattern: 1 sends to 2, 2 sends to 3, 3 sends to 1
                    let recipientId = null;
                    
                    // Create a sorted array of all contacts by phone number
                    const allContacts = [...Object.values(contactMap)];
                    allContacts.push(senderContact); // Include sender for complete circle
                    
                    // Sort all contacts by phone number
                    allContacts.sort((a, b) => {
                        return a.phoneNumber.localeCompare(b.phoneNumber);
                    });
                    
                    // Find the sender's position in the sorted array
                    const senderIndex = allContacts.findIndex(contact => contact.id === senderId);
                    
                    if (senderIndex === -1) {
                        throw new Error(`Could not find sender ${senderId} in sorted contacts`);
                    }
                    
                    // Get the next contact in the circle (wrapping around if needed)
                    const nextContactIndex = (senderIndex + 1) % allContacts.length;
                    const nextContact = allContacts[nextContactIndex];
                    
                    // If the next contact is the sender itself (in case there's only one contact),
                    // we can't send a message
                    if (nextContact.id === senderId) {
                        throw new Error(`Cannot send message to self (only one contact available)`);
                    }
                    
                    recipientId = nextContact.id;
                    
                    console.log(`Selected next recipient for ${senderId} (phone: ${senderContact.phoneNumber}): ${recipientId} (phone: ${nextContact.phoneNumber}) - circular pattern`);
                    
                    // Track this message for the contact's timeout
                    const canSendMessage = await this.trackContactMessage(senderId, senderContact);
                    
                    if (!canSendMessage) {
                        console.log(`Contact ${senderContact.name} has reached message limit, skipping`);
                        continue;
                    }
                    
                    // Send warming message to individual
                    await this.sendWarmingMessage(senderId, recipientId);
                    messageSent = true;
                    
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
            let connectedContacts = this.whatsappManager.getConnectedContacts();
            
            // Filter out contacts that have warmer set to false
            const allContacts = await this.contactManager.getAllContacts();
            connectedContacts = connectedContacts.filter(contactId => {
                const contact = allContacts.find(c => c.id === contactId);
                return contact && contact.warmer !== false;
            });
            
            console.log(`Found ${connectedContacts.length} connected contacts with warming enabled for group messaging`);
            
            if (this.config.sendToGroup) {
                // For group messaging, we need at least one contact
                if (connectedContacts.length < 1) {
                    console.log('No connected contacts for warming');
                    return;
                }
                
                // Track if at least one message was sent
                let messageSent = false;
                
                // Try to send a message from each connected contact
                for (const senderId of connectedContacts) {
                    // Get the contact object
                    const senderContact = await this.contactManager.getContact(senderId);
                    if (!senderContact) {
                        console.log(`Contact with ID ${senderId} not found, skipping`);
                        continue;
                    }
                    
                    // Check if this contact is in timeout
                    if (this.isContactInTimeout(senderId)) {
                        console.log(`Contact ${senderContact.name} is in timeout, skipping`);
                        continue;
                    }
                    
                    try {
                        // Randomly choose which group to send to
                        const randomValBetween1To5 = Math.floor(Math.random() * 5) + 1;
                        if (randomValBetween1To5 % 2 === 0) {
                            // Send warming message to first group
                            if (this.config.targetGroupName1 && this.config.targetGroupName1.trim() !== '') {
                                // Track this message for the contact's timeout
                                const canSendMessage = await this.trackContactMessage(senderId, senderContact);
                                
                                if (!canSendMessage) {
                                    console.log(`Contact ${senderContact.name} has reached message limit, skipping`);
                                    continue;
                                }
                                
                                await this.sendWarmingMessageToGroup(senderId, this.config.targetGroupName1);
                                messageSent = true;
                                console.log(`Successfully sent group warming message from contact ${senderId} to group ${this.config.targetGroupName1}`);
                            }
                        } else {
                            // Send warming message to second group if configured
                            if (this.config.targetGroupName2 && this.config.targetGroupName2.trim() !== '') {
                                // Track this message for the contact's timeout
                                const canSendMessage = await this.trackContactMessage(senderId, senderContact);
                                
                                if (!canSendMessage) {
                                    console.log(`Contact ${senderContact.name} has reached message limit, skipping`);
                                    continue;
                                }
                                
                                await this.sendWarmingMessageToGroup(senderId, this.config.targetGroupName2);
                                messageSent = true;
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
            await client.sendMessage(recipientNumber, messageData.message);

            // Log the warming message
            console.log(`Warming message sent: ${senderContact.name} -> ${recipientContact.name}`);
            console.log(`Template: ${template.name}`);
            console.log(`Message: ${messageData.message}`);

            // Send reply message from recipient to sender after a random delay
            const minDelay = this.config.minReplyDelay || 30; // Default to 30 seconds if not configured
            const maxDelay = this.config.maxReplyDelay || 60; // Default to 60 seconds if not configured
            const delayRange = maxDelay - minDelay;
            const replyDelaySeconds = Math.floor(Math.random() * (delayRange + 1)) + minDelay;
            console.log(`Scheduling reply message in ${replyDelaySeconds} seconds (range: ${minDelay}-${maxDelay}s)`);
            
            setTimeout(async () => {
                // Check if we're still within working hours when it's time to send the reply
                if (this.config.enableWorkingHoursOnly && !this.isWithinWorkingHours()) {
                    console.log('Outside working hours, skipping reply message');
                    return;
                }
                
                await this.sendReplyMessage(recipientId, senderId, messageData.message);
            }, replyDelaySeconds * 1000);

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
            await this.whatsappManager.sendMessageToGroup(
                senderId, 
                targetGroupName1, 
                messageData.message
            );

            // Log the warming message
            console.log(`Warming message sent to group: ${senderContact.name} -> ${targetGroupName1}`);
            console.log(`Template: ${template.name}`);
            console.log(`Message: ${messageData.message}`);
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
        return phoneNumber + '@c.us';
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
            await client.sendMessage(recipientNumber, replyMessage);

            // Log the reply message
            console.log(`Reply message sent: ${senderContact.name} -> ${recipientContact.name}`);
            console.log(`Message: ${replyMessage}`);
        } catch (error) {
            console.error('Error sending reply message:', error);
            // Don't throw the error to prevent it from affecting the main flow
        }
    }

    isWithinWorkingHours() {
        const now = moment().tz(this.config.timezone);
        const currentTime = now.format('HH:mm');
        
        return currentTime >= this.config.workingHours.start && 
               currentTime <= this.config.workingHours.end;
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
            
            // Set up the tulilut reset scheduler if the reset time has changed
            if (newConfig.tulilutResetTime !== undefined) {
                this.setupTulilutResetScheduler();
            }
            
            console.log('Message manager config updated');
            return this.config;
        } catch (error) {
            console.error('Error updating config:', error);
            throw error;
        }
    }
}

module.exports = MessageManager;
