const fs = require('fs-extra');
const path = require('path');

class Config {
    constructor() {
        this.configUpdateCallbacks = [];
        this.configFile = path.join(__dirname, '../../data/config.json');
        this.defaultConfig = {
            // Warming settings
            minWarmingInterval: 15, // seconds
            maxWarmingInterval: 45, // seconds
            timezone: 'Asia/Jakarta',
            maxMessagesPerDay: 50,
            timeoutSeconds: 60, // seconds to pause if max message limit is reached
            maxMessageTimeout: 5, // max messages per timeout period

            // Working hours
            workingHours: {
                start: '09:00',
                end: '18:00'
            },
            enableWorkingHoursOnly: true,
            
            // Message settings
            messageVariationEnabled: true,
            dynamicDataEnabled: true,
            
            // Connection settings
            autoReconnect: true,
            reconnectDelay: 5, // minutes
            maxReconnectAttempts: 3,
            
            // Logging settings
            enableDetailedLogging: true,
            logRetentionDays: 30,
            
            // Security settings
            enableRateLimiting: true,
            maxRequestsPerMinute: 60,
            
            // UI settings
            theme: 'light',
            autoRefresh: true,
            refreshInterval: 30, // seconds
            
            // Notification settings
            enableNotifications: true,
            notifyOnConnection: true,
            notifyOnDisconnection: true,
            notifyOnMessage: false,
            notifyOnError: true,
            
            // Advanced settings
            enableSpamPrevention: true,
            minMessageInterval: 5, // minutes
            maxConsecutiveMessages: 3,
            cooldownPeriod: 60, // minutes
            
            // Export/Import settings
            enableAutoBackup: true,
            backupInterval: 24, // hours
            maxBackupFiles: 7,
            
            // Group settings
            targetGroupName1: "Watzapia",
            targetGroupName2: "Watzapia 2"
        };
    }

    async getConfig() {
        try {
            if (!await fs.pathExists(this.configFile)) {
                await this.saveConfig(this.defaultConfig);
                return this.defaultConfig;
            }
            
            const config = await fs.readJson(this.configFile);
            
            // Merge with default config to ensure all properties exist
            const mergedConfig = { ...this.defaultConfig, ...config };
            
            // Save merged config to update any missing properties
            if (Object.keys(mergedConfig).length !== Object.keys(config).length) {
                await this.saveConfig(mergedConfig);
            }
            
            return mergedConfig;
        } catch (error) {
            console.error('Error reading config file:', error);
            return this.defaultConfig;
        }
    }

    async updateConfig(updates) {
        try {
            const currentConfig = await this.getConfig();
            
            // Validate updates
            const validatedUpdates = this.validateConfigUpdates(updates);
            
            const newConfig = { ...currentConfig, ...validatedUpdates };
            
            await this.saveConfig(newConfig);
            
            console.log('Configuration updated successfully');
            return newConfig;
        } catch (error) {
            console.error('Error updating config:', error);
            throw error;
        }
    }

    validateConfigUpdates(updates) {
        const validated = {};
        
        // Validate min warming interval
        if (updates.minWarmingInterval !== undefined) {
            const minInterval = parseInt(updates.minWarmingInterval);
            if (isNaN(minInterval) || minInterval < 1 || minInterval > 1440) {
                throw new Error('Min warming interval must be between 1 and 1440 minutes');
            }
            validated.minWarmingInterval = minInterval;
        }
        
        // Validate max warming interval
        if (updates.maxWarmingInterval !== undefined) {
            const maxInterval = parseInt(updates.maxWarmingInterval);
            if (isNaN(maxInterval) || maxInterval < 1 || maxInterval > 1440) {
                throw new Error('Max warming interval must be between 1 and 1440 minutes');
            }
            validated.maxWarmingInterval = maxInterval;
        }
        
        // Validate min and max warming interval relationship
        if (updates.minWarmingInterval !== undefined && updates.maxWarmingInterval !== undefined) {
            const minInterval = parseInt(updates.minWarmingInterval);
            const maxInterval = parseInt(updates.maxWarmingInterval);
            if (minInterval > maxInterval) {
                throw new Error('Min warming interval cannot be greater than max warming interval');
            }
        }
        

        
        // Validate timezone
        if (updates.timezone !== undefined) {
            if (typeof updates.timezone !== 'string' || updates.timezone.trim() === '') {
                throw new Error('Timezone must be a valid string');
            }
            validated.timezone = updates.timezone.trim();
        }
        
        // Validate max messages per day
        if (updates.maxMessagesPerDay !== undefined) {
            const maxMessages = parseInt(updates.maxMessagesPerDay);
            if (isNaN(maxMessages) || maxMessages < 1 || maxMessages > 9999999999) {
                throw new Error('Max messages per day must be between 1 and 9999999999');
            }
            validated.maxMessagesPerDay = maxMessages;
        }
        
        // Validate timeout seconds
        if (updates.timeoutSeconds !== undefined) {
            const timeoutSeconds = parseInt(updates.timeoutSeconds);
            if (isNaN(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
                throw new Error('Timeout seconds must be between 1 and 3600');
            }
            validated.timeoutSeconds = timeoutSeconds;
        }
        
        // Validate max message timeout
        if (updates.maxMessageTimeout !== undefined) {
            const maxMessageTimeout = parseInt(updates.maxMessageTimeout);
            if (isNaN(maxMessageTimeout) || maxMessageTimeout < 1 || maxMessageTimeout > 100) {
                throw new Error('Max message timeout must be between 1 and 100');
            }
            validated.maxMessageTimeout = maxMessageTimeout;
        }
        
        
        // Validate working hours
        if (updates.workingHours !== undefined) {
            if (typeof updates.workingHours !== 'object') {
                throw new Error('Working hours must be an object');
            }
            
            const { start, end } = updates.workingHours;
            if (start && !this.isValidTime(start)) {
                throw new Error('Working hours start time must be in HH:MM format');
            }
            if (end && !this.isValidTime(end)) {
                throw new Error('Working hours end time must be in HH:MM format');
            }
            
            validated.workingHours = updates.workingHours;
        }
        
        // Validate boolean fields
        const booleanFields = [
            'enableWorkingHoursOnly',
            'messageVariationEnabled',
            'dynamicDataEnabled',
            'autoReconnect',
            'enableDetailedLogging',
            'enableRateLimiting',
            'autoRefresh',
            'enableNotifications',
            'notifyOnConnection',
            'notifyOnDisconnection',
            'notifyOnMessage',
            'notifyOnError',
            'enableSpamPrevention',
            'enableAutoBackup'
        ];
        
        booleanFields.forEach(field => {
            if (updates[field] !== undefined) {
                validated[field] = Boolean(updates[field]);
            }
        });
        
        // Validate numeric fields with ranges
        const numericFields = {
            reconnectDelay: { min: 1, max: 60 },
            maxReconnectAttempts: { min: 1, max: 10 },
            logRetentionDays: { min: 1, max: 365 },
            maxRequestsPerMinute: { min: 1, max: 1000 },
            refreshInterval: { min: 5, max: 300 },
            minMessageInterval: { min: 1, max: 60 },
            maxConsecutiveMessages: { min: 1, max: 10 },
            cooldownPeriod: { min: 10, max: 1440 },
            backupInterval: { min: 1, max: 168 },
            maxBackupFiles: { min: 1, max: 30 }
        };
        
        Object.entries(numericFields).forEach(([field, range]) => {
            if (updates[field] !== undefined) {
                const value = parseInt(updates[field]);
                if (isNaN(value) || value < range.min || value > range.max) {
                    throw new Error(`${field} must be between ${range.min} and ${range.max}`);
                }
                validated[field] = value;
            }
        });
        
        // Validate theme
        if (updates.theme !== undefined) {
            const validThemes = ['light', 'dark'];
            if (!validThemes.includes(updates.theme)) {
                throw new Error('Theme must be either "light" or "dark"');
            }
            validated.theme = updates.theme;
        }
        
        // Validate targetGroupName1
        if (updates.targetGroupName1 !== undefined) {
            if (typeof updates.targetGroupName1 !== 'string') {
                throw new Error('Target Group Name 1 must be a string');
            }
            validated.targetGroupName1 = updates.targetGroupName1;
        }
        
        // Validate targetGroupName2
        if (updates.targetGroupName2 !== undefined) {
            if (typeof updates.targetGroupName2 !== 'string') {
                throw new Error('Target Group Name 2 must be a string');
            }
            validated.targetGroupName2 = updates.targetGroupName2;
        }
        
        return validated;
    }

    isValidTime(timeString) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        return timeRegex.test(timeString);
    }

    async saveConfig(config) {
        try {
            await fs.ensureDir(path.dirname(this.configFile));
            await fs.writeJson(this.configFile, config, { spaces: 2 });
            
            // Notify all registered callbacks about the config update
            this.notifyConfigUpdated(config);
        } catch (error) {
            console.error('Error saving config file:', error);
            throw error;
        }
    }
    
    // Register a callback to be called when config is updated
    onConfigUpdate(callback) {
        if (typeof callback === 'function') {
            this.configUpdateCallbacks.push(callback);
        }
    }
    
    // Remove a previously registered callback
    offConfigUpdate(callback) {
        this.configUpdateCallbacks = this.configUpdateCallbacks.filter(cb => cb !== callback);
    }
    
    // Notify all registered callbacks about config updates
    notifyConfigUpdated(config) {
        for (const callback of this.configUpdateCallbacks) {
            try {
                callback(config);
            } catch (error) {
                console.error('Error in config update callback:', error);
            }
        }
    }

    async resetConfig() {
        try {
            await this.saveConfig(this.defaultConfig);
            console.log('Configuration reset to defaults');
            return this.defaultConfig;
        } catch (error) {
            console.error('Error resetting config:', error);
            throw error;
        }
    }

    async exportConfig() {
        try {
            const config = await this.getConfig();
            return {
                exportDate: new Date().toISOString(),
                version: '1.0.0',
                config: config
            };
        } catch (error) {
            console.error('Error exporting config:', error);
            throw error;
        }
    }

    async importConfig(importData) {
        try {
            if (!importData.config || typeof importData.config !== 'object') {
                throw new Error('Invalid import data format');
            }
            
            // Validate the imported config
            const validatedConfig = this.validateConfigUpdates(importData.config);
            
            // Merge with current config
            const currentConfig = await this.getConfig();
            const newConfig = { ...currentConfig, ...validatedConfig };
            
            await this.saveConfig(newConfig);
            
            console.log('Configuration imported successfully');
            return newConfig;
        } catch (error) {
            console.error('Error importing config:', error);
            throw error;
        }
    }

    async getConfigSchema() {
        return {
            minWarmingInterval: {
                type: 'number',
                min: 1,
                max: 1440,
                unit: 'minutes',
                description: 'Minimum interval between warming messages'
            },
            maxWarmingInterval: {
                type: 'number',
                min: 1,
                max: 1440,
                unit: 'minutes',
                description: 'Maximum interval between warming messages'
            },
            timezone: {
                type: 'string',
                description: 'Timezone for scheduling (e.g., Asia/Jakarta)'
            },
            maxMessagesPerDay: {
                type: 'number',
                min: 1,
                max: 9999999999,
                description: 'Maximum messages per contact per day'
            },
            timeoutSeconds: {
                type: 'number',
                min: 1,
                max: 3600,
                description: 'Seconds to pause if max message limit is reached'
            },
            maxMessageTimeout: {
                type: 'number',
                min: 1,
                max: 100,
                description: 'Maximum messages allowed per timeout period'
            },

            workingHours: {
                type: 'object',
                properties: {
                    start: { type: 'string', format: 'HH:MM' },
                    end: { type: 'string', format: 'HH:MM' }
                },
                description: 'Working hours for sending messages'
            },
            enableWorkingHoursOnly: {
                type: 'boolean',
                description: 'Only send messages during working hours'
            },
            targetGroupName1: {
                type: 'string',
                description: 'Name of the target WhatsApp group'
            }
        };
    }
}

module.exports = Config;
