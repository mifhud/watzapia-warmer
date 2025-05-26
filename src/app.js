const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');

const WhatsAppManager = require('./whatsapp/WhatsAppManager');
const ContactManager = require('./contacts/ContactManager');
const MessageManager = require('./messaging/MessageManager');
const TemplateManager = require('./messaging/TemplateManager');
const Config = require('./config/Config');

class WhatsAppAutoWarmer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server);
        this.port = process.env.PORT || 3000;
        
        // Initialize managers
        this.config = new Config();
        this.contactManager = new ContactManager();
        this.templateManager = new TemplateManager();
        this.whatsappManager = new WhatsAppManager(this.io);
        this.messageManager = new MessageManager(this.whatsappManager, this.templateManager, this.contactManager);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.ensureDataDirectories();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    setupRoutes() {
        // Serve main page
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // Contact management routes
        this.app.get('/api/contacts', async (req, res) => {
            try {
                const contacts = await this.contactManager.getAllContacts();
                res.json(contacts);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/contacts', async (req, res) => {
            try {
                const contact = await this.contactManager.addContact(req.body);
                res.json(contact);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        this.app.put('/api/contacts/:id', async (req, res) => {
            try {
                const contact = await this.contactManager.updateContact(req.params.id, req.body);
                res.json(contact);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        this.app.delete('/api/contacts/:id', async (req, res) => {
            try {
                await this.contactManager.deleteContact(req.params.id);
                res.json({ success: true });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // WhatsApp connection routes
        this.app.post('/api/whatsapp/connect/:contactId', async (req, res) => {
            try {
                await this.whatsappManager.connectContact(req.params.contactId);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/whatsapp/disconnect/:contactId', async (req, res) => {
            try {
                await this.whatsappManager.disconnectContact(req.params.contactId);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Message template routes
        this.app.get('/api/templates', async (req, res) => {
            try {
                const templates = await this.templateManager.getAllTemplates();
                res.json(templates);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/templates', async (req, res) => {
            try {
                const template = await this.templateManager.addTemplate(req.body);
                res.json(template);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });

        // Auto warmer control routes
        this.app.post('/api/warmer/start', async (req, res) => {
            try {
                await this.messageManager.startAutoWarmer();
                res.json({ success: true, message: 'Auto warmer started' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/warmer/stop', async (req, res) => {
            try {
                await this.messageManager.stopAutoWarmer();
                res.json({ success: true, message: 'Auto warmer stopped' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/warmer/status', async (req, res) => {
            try {
                const status = this.messageManager.getWarmerStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Configuration routes
        this.app.get('/api/config', async (req, res) => {
            try {
                const config = await this.config.getConfig();
                res.json(config);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.put('/api/config', async (req, res) => {
            try {
                const config = await this.config.updateConfig(req.body);
                res.json(config);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }

    async ensureDataDirectories() {
        const dataDir = path.join(__dirname, '../data');
        await fs.ensureDir(dataDir);
        
        // Initialize default files if they don't exist
        const defaultFiles = {
            'contacts.json': [],
            'message-templates.json': [],
            'config.json': {
                warmingInterval: 30, // minutes
                timezone: 'Asia/Jakarta'maxMessagesPerDay: 50
            },
            'message-history.json': []
        };

        for (const [filename, defaultContent] of Object.entries(defaultFiles)) {
            const filePath = path.join(dataDir, filename);
            if (!await fs.pathExists(filePath)) {
                await fs.writeJson(filePath, defaultContent, { spaces: 2 });
            }
        }
    }

    async start() {
        try {
            await this.ensureDataDirectories();
            
            this.server.listen(this.port, () => {
                console.log(`WhatsApp Auto Warmer running on http://localhost:${this.port}`);
                console.log('Press Ctrl+C to stop the server');
            });
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    async stop() {
        console.log('Shutting down WhatsApp Auto Warmer...');
        await this.whatsappManager.disconnectAll();
        await this.messageManager.stopAutoWarmer();
        this.server.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    if (global.app) {
        await global.app.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (global.app) {
        await global.app.stop();
    }
    process.exit(0);
});

// Start the application
if (require.main === module) {
    const app = new WhatsAppAutoWarmer();
    global.app = app;
    app.start().catch(console.error);
}

module.exports = WhatsAppAutoWarmer;
