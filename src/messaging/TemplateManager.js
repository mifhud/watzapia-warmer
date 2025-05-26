const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

class TemplateManager {
    constructor() {
        this.templatesFile = path.join(__dirname, '../../data/message-templates.json');
        this.initializeDefaultTemplates();
    }

    async initializeDefaultTemplates() {
        try {
            if (!await fs.pathExists(this.templatesFile)) {
                const defaultTemplates = [
                    {
                        id: uuidv4(),
                        name: 'Morning Greeting',
                        category: 'greeting',
                        templates: [
                            'Good morning {name}! Hope you have a wonderful day ahead! 🌅',
                            'Morning {name}! Wishing you a productive day! ☀️',
                            'Hey {name}, good morning! Hope everything is going well! 🌞'
                        ],
                        variables: ['name'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: uuidv4(),
                        name: 'Afternoon Check-in',
                        category: 'check-in',
                        templates: [
                            'Hi {name}, how\'s your day going so far? 😊',
                            'Hey {name}! Hope you\'re having a great afternoon! 🌤️',
                            'Good afternoon {name}! Just checking in to see how things are! 👋'
                        ],
                        variables: ['name'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: uuidv4(),
                        name: 'Evening Greeting',
                        category: 'greeting',
                        templates: [
                            'Good evening {name}! Hope you had a great day! 🌆',
                            'Evening {name}! How was your day today? 🌇',
                            'Hey {name}, good evening! Hope you\'re winding down nicely! 🌙'
                        ],
                        variables: ['name'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: uuidv4(),
                        name: 'Weekly Check-in',
                        category: 'check-in',
                        templates: [
                            'Hi {name}! How has your week been going? It\'s {dayOfWeek} already! 📅',
                            'Hey {name}! Hope you\'re having a good {dayOfWeek}! 🗓️',
                            'Good {timeOfDay} {name}! Can\'t believe it\'s {dayOfWeek} already! Time flies! ⏰'
                        ],
                        variables: ['name', 'dayOfWeek', 'timeOfDay'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: uuidv4(),
                        name: 'Casual Chat',
                        category: 'casual',
                        templates: [
                            'Hey {name}! What\'s new with you? 😄',
                            'Hi {name}! Hope all is well on your end! 👍',
                            'Hey there {name}! Just wanted to say hi! 👋',
                            'Hi {name}! How are things going? 🤔'
                        ],
                        variables: ['name'],
                        isActive: true,
                        createdAt: new Date().toISOString()
                    }
                ];

                await this.saveTemplates(defaultTemplates);
                console.log('Default message templates initialized');
            }
        } catch (error) {
            console.error('Error initializing default templates:', error);
        }
    }

    async getAllTemplates() {
        try {
            if (!await fs.pathExists(this.templatesFile)) {
                return [];
            }
            return await fs.readJson(this.templatesFile);
        } catch (error) {
            console.error('Error reading templates file:', error);
            return [];
        }
    }

    async getTemplate(templateId) {
        try {
            const templates = await this.getAllTemplates();
            return templates.find(template => template.id === templateId);
        } catch (error) {
            console.error('Error getting template:', error);
            return null;
        }
    }

    async addTemplate(templateData) {
        try {
            // Validate required fields
            if (!templateData.name || !templateData.templates || !Array.isArray(templateData.templates)) {
                throw new Error('Name and templates array are required');
            }

            if (templateData.templates.length === 0) {
                throw new Error('At least one template message is required');
            }

            const templates = await this.getAllTemplates();
            
            // Check if template name already exists
            const existingTemplate = templates.find(template => 
                template.name.toLowerCase() === templateData.name.toLowerCase()
            );
            if (existingTemplate) {
                throw new Error('Template with this name already exists');
            }

            // Extract variables from templates
            const variables = this.extractVariables(templateData.templates);

            // Create new template
            const newTemplate = {
                id: uuidv4(),
                name: templateData.name.trim(),
                category: templateData.category ? templateData.category.trim() : 'general',
                templates: templateData.templates.map(t => t.trim()),
                variables: variables,
                isActive: templateData.isActive !== undefined ? templateData.isActive : true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                usageCount: 0,
                lastUsed: null
            };

            templates.push(newTemplate);
            await this.saveTemplates(templates);

            console.log(`Template added: ${newTemplate.name}`);
            return newTemplate;
        } catch (error) {
            console.error('Error adding template:', error);
            throw error;
        }
    }

    async updateTemplate(templateId, updateData) {
        try {
            const templates = await this.getAllTemplates();
            const templateIndex = templates.findIndex(template => template.id === templateId);
            
            if (templateIndex === -1) {
                throw new Error('Template not found');
            }

            // Validate name uniqueness if name is being updated
            if (updateData.name) {
                const existingTemplate = templates.find(template => 
                    template.name.toLowerCase() === updateData.name.toLowerCase() && 
                    template.id !== templateId
                );
                if (existingTemplate) {
                    throw new Error('Template with this name already exists');
                }
            }

            // Update variables if templates are being updated
            if (updateData.templates) {
                updateData.variables = this.extractVariables(updateData.templates);
            }

            // Update template
            const updatedTemplate = {
                ...templates[templateIndex],
                ...updateData,
                updatedAt: new Date().toISOString()
            };

            templates[templateIndex] = updatedTemplate;
            await this.saveTemplates(templates);

            console.log(`Template updated: ${updatedTemplate.name}`);
            return updatedTemplate;
        } catch (error) {
            console.error('Error updating template:', error);
            throw error;
        }
    }

    async deleteTemplate(templateId) {
        try {
            const templates = await this.getAllTemplates();
            const templateIndex = templates.findIndex(template => template.id === templateId);
            
            if (templateIndex === -1) {
                throw new Error('Template not found');
            }

            const deletedTemplate = templates[templateIndex];
            templates.splice(templateIndex, 1);
            await this.saveTemplates(templates);

            console.log(`Template deleted: ${deletedTemplate.name}`);
            return true;
        } catch (error) {
            console.error('Error deleting template:', error);
            throw error;
        }
    }

    async getActiveTemplates() {
        try {
            const templates = await this.getAllTemplates();
            return templates.filter(template => template.isActive);
        } catch (error) {
            console.error('Error getting active templates:', error);
            return [];
        }
    }

    async getTemplatesByCategory(category) {
        try {
            const templates = await this.getAllTemplates();
            return templates.filter(template => 
                template.category === category && template.isActive
            );
        } catch (error) {
            console.error('Error getting templates by category:', error);
            return [];
        }
    }

    async generateMessage(templateId, variables = {}) {
        try {
            const template = await this.getTemplate(templateId);
            if (!template) {
                throw new Error('Template not found');
            }

            if (!template.isActive) {
                throw new Error('Template is not active');
            }

            // Select a random template variation
            const templateText = template.templates[Math.floor(Math.random() * template.templates.length)];

            // Replace variables with actual values
            let message = templateText;
            
            // Add default variables
            const defaultVariables = this.getDefaultVariables();
            const allVariables = { ...defaultVariables, ...variables };

            for (const [key, value] of Object.entries(allVariables)) {
                const regex = new RegExp(`{${key}}`, 'g');
                message = message.replace(regex, value);
            }

            // Update usage statistics
            await this.updateTemplateUsage(templateId);

            return {
                message,
                templateId,
                templateName: template.name,
                variables: allVariables
            };
        } catch (error) {
            console.error('Error generating message:', error);
            throw error;
        }
    }

    getDefaultVariables() {
        const now = moment().tz('Asia/Jakarta');
        const hour = now.hour();
        
        let timeOfDay = 'day';
        if (hour < 12) {
            timeOfDay = 'morning';
        } else if (hour < 17) {
            timeOfDay = 'afternoon';
        } else {
            timeOfDay = 'evening';
        }

        return {
            date: now.format('YYYY-MM-DD'),
            time: now.format('HH:mm'),
            dayOfWeek: now.format('dddd'),
            month: now.format('MMMM'),
            year: now.format('YYYY'),
            timeOfDay: timeOfDay,
            timestamp: now.toISOString()
        };
    }

    extractVariables(templates) {
        const variables = new Set();
        const variableRegex = /{([^}]+)}/g;

        templates.forEach(template => {
            let match;
            while ((match = variableRegex.exec(template)) !== null) {
                variables.add(match[1]);
            }
        });

        return Array.from(variables);
    }

    async updateTemplateUsage(templateId) {
        try {
            const template = await this.getTemplate(templateId);
            if (template) {
                await this.updateTemplate(templateId, {
                    usageCount: (template.usageCount || 0) + 1,
                    lastUsed: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error updating template usage:', error);
        }
    }

    async saveTemplates(templates) {
        try {
            await fs.ensureDir(path.dirname(this.templatesFile));
            await fs.writeJson(this.templatesFile, templates, { spaces: 2 });
        } catch (error) {
            console.error('Error saving templates file:', error);
            throw error;
        }
    }

    async getTemplateStats() {
        try {
            const templates = await this.getAllTemplates();
            
            const stats = {
                total: templates.length,
                active: templates.filter(t => t.isActive).length,
                inactive: templates.filter(t => !t.isActive).length,
                totalUsage: templates.reduce((sum, t) => sum + (t.usageCount || 0), 0),
                categories: {}
            };

            // Count templates by category
            templates.forEach(template => {
                const category = template.category || 'general';
                stats.categories[category] = (stats.categories[category] || 0) + 1;
            });

            return stats;
        } catch (error) {
            console.error('Error getting template stats:', error);
            return {
                total: 0,
                active: 0,
                inactive: 0,
                totalUsage: 0,
                categories: {}
            };
        }
    }
}

module.exports = TemplateManager;
