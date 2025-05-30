// WhatsApp Auto Warmer Frontend Application
class WhatsAppAutoWarmer {
    constructor() {
        this.socket = io();
        this.contacts = [];
        this.templates = [];
        this.config = {};
        this.warmerStatus = { isActive: false };
        this.currentQRContactId = null; // Track the current contact ID for QR code

        this.initializeEventListeners();
        this.setupSocketListeners();
        this.loadInitialData();
        this.startPeriodicUpdates();
    }

    initializeEventListeners() {
        // Contact form submission
        document.getElementById('add-contact-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addContact();
        });
        
        // Edit contact form submission
        document.getElementById('edit-contact-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateContact();
        });

        // Template form submission
        document.getElementById('add-template-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTemplate();
        });

        // Configuration form submission
        document.getElementById('config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateConfiguration();
        });

        // Direct message form submission
        document.getElementById('direct-message-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendDirectMessage();
        });

        // Auto warmer controls
        document.getElementById('start-warmer-btn').addEventListener('click', () => {
            this.startAutoWarmer();
        });

        document.getElementById('stop-warmer-btn').addEventListener('click', () => {
            this.stopAutoWarmer();
        });

        // Template message variations
        document.getElementById('add-message-variation').addEventListener('click', () => {
            this.addMessageVariation();
        });

        // Dynamic event delegation for contact actions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('connect-btn')) {
                const contactId = e.target.dataset.contactId;
                this.connectContact(contactId);
            } else if (e.target.classList.contains('disconnect-btn')) {
                const contactId = e.target.dataset.contactId;
                this.disconnectContact(contactId);
            } else if (e.target.classList.contains('delete-contact-btn')) {
                const contactId = e.target.dataset.contactId;
                this.deleteContact(contactId);
            } else if (e.target.classList.contains('edit-contact-btn')) {
                const contactId = e.target.dataset.contactId;
                this.openEditContactModal(contactId);
            } else if (e.target.classList.contains('remove-message')) {
                this.removeMessageVariation(e.target);
            }
        });
        
        // Stop Session button in QR code modal
        document.getElementById('stop-session-btn').addEventListener('click', () => {
            if (this.currentQRContactId) {
                this.disconnectContact(this.currentQRContactId);
                const modal = bootstrap.Modal.getInstance(document.getElementById('qrModal'));
                if (modal) {
                    modal.hide();
                }
                this.currentQRContactId = null; // Clear the current contact ID
                this.showAlert('WhatsApp session stopped', 'info');
            }
        });
        
        // Clear current contact ID when QR modal is closed
        document.getElementById('qrModal').addEventListener('hidden.bs.modal', () => {
            this.currentQRContactId = null;
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.addActivityLog('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.addActivityLog('Disconnected from server', 'error');
        });

        this.socket.on('qr_code', (data) => {
            console.log("Consumed QR code event:", data);
            this.showQRCode(data);
        });

        this.socket.on('connection_status', (data) => {
            this.updateConnectionStatus(data);
        });

        this.socket.on('connection_status_update', (data) => {
            this.updateConnectionStatus(data);
        });

        this.socket.on('message_received', (data) => {
            this.handleMessageReceived(data);
        });

        this.socket.on('message_sent', (data) => {
            this.handleMessageSent(data);
        });
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadContacts(),
                this.loadTemplates(),
                this.loadConfiguration(),
                this.loadWarmerStatus()
            ]);
            this.updateDashboard();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showAlert('Error loading initial data', 'danger');
        }
    }

    async loadContacts() {
        try {
            const response = await fetch('/api/contacts');
            if (!response.ok) throw new Error('Failed to load contacts');

            this.contacts = await response.json();
            this.renderContacts();
        } catch (error) {
            console.error('Error loading contacts:', error);
            this.showAlert('Error loading contacts', 'danger');
        }
    }

    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            if (!response.ok) throw new Error('Failed to load templates');

            this.templates = await response.json();
            this.renderTemplates();
        } catch (error) {
            console.error('Error loading templates:', error);
            this.showAlert('Error loading templates', 'danger');
        }
    }

    async loadConfiguration() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to load configuration');

            this.config = await response.json();
            this.populateConfigForm();
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.showAlert('Error loading configuration', 'danger');
        }
    }

    async loadWarmerStatus() {
        try {
            const response = await fetch('/api/warmer/status');
            if (!response.ok) throw new Error('Failed to load warmer status');

            this.warmerStatus = await response.json();
            this.updateWarmerUI();
        } catch (error) {
            console.error('Error loading warmer status:', error);
        }
    }

    renderContacts() {
        const tbody = document.getElementById('contacts-tbody');
        tbody.innerHTML = '';
        
        // Also update the direct message contact dropdown
        const directMessageContactSelect = document.getElementById('direct-message-contact');
        if (directMessageContactSelect) {
            // Clear all options except the first one
            while (directMessageContactSelect.options.length > 1) {
                directMessageContactSelect.remove(1);
            }
            
            // Add connected contacts to the dropdown
            const connectedContacts = this.contacts.filter(contact => contact.status === 'connected');
            connectedContacts.forEach(contact => {
                const option = document.createElement('option');
                option.value = contact.id;
                option.textContent = `${contact.name} (${contact.phoneNumber})`;
                directMessageContactSelect.appendChild(option);
            });
        }

        this.contacts.forEach(contact => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${this.escapeHtml(contact.name)}</strong>
                    ${contact.email ? `<br><small class="text-muted">${this.escapeHtml(contact.email)}</small>` : ''}
                </td>
                <td>${this.escapeHtml(contact.phoneNumber)}</td>
                <td>
                    <span class="status-badge status-${contact.status}">
                        ${contact.status}
                    </span>
                </td>
                <td>
                    ${contact.lastConnected ?
                        new Date(contact.lastConnected).toLocaleString() :
                        '<span class="text-muted">Never</span>'
                    }
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        ${contact.status === 'connected' ?
                            `<button class="btn btn-outline-danger disconnect-btn" data-contact-id="${contact.id}">
                                <i class="fas fa-unlink"></i> Disconnect
                            </button>` :
                            `<button class="btn btn-outline-success connect-btn" data-contact-id="${contact.id}">
                                <i class="fas fa-link"></i> Connect
                            </button>`
                        }
                        <button class="btn btn-outline-primary edit-contact-btn" data-contact-id="${contact.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger delete-contact-btn" data-contact-id="${contact.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                        ${contact.push ? 
                            `<span class="badge bg-info ms-1" title="Push notifications enabled"><i class="fas fa-bell"></i></span>` : 
                            `<span class="badge bg-secondary ms-1" title="Push notifications disabled"><i class="fas fa-bell-slash"></i></span>`
                        }
                        ${contact.warmer ? 
                            `<span class="badge bg-success ms-1" title="Auto warming enabled"><i class="fas fa-fire"></i></span>` : 
                            `<span class="badge bg-secondary ms-1" title="Auto warming disabled"><i class="fas fa-fire-alt"></i></span>`
                        }
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderTemplates() {
        const container = document.getElementById('templates-container');
        container.innerHTML = '';

        if (this.templates.length === 0) {
            container.innerHTML = '<p class="text-muted">No templates available. Add your first template to get started.</p>';
            return;
        }

        this.templates.forEach(template => {
            const templateCard = document.createElement('div');
            templateCard.className = 'template-card';
            templateCard.innerHTML = `
                <div class="template-header">
                    <div>
                        <span class="template-name">${this.escapeHtml(template.name)}</span>
                        <span class="template-category ms-2">${this.escapeHtml(template.category)}</span>
                    </div>
                    <div>
                        <span class="badge bg-${template.isActive ? 'success' : 'secondary'}">
                            ${template.isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                </div>
                <div class="template-messages">
                    ${template.templates.map(msg =>
                        `<div class="template-message">${this.escapeHtml(msg)}</div>`
                    ).join('')}
                </div>
                <div class="template-stats">
                    <small>
                        Used ${template.usageCount || 0} times
                        ${template.lastUsed ? ` • Last used: ${new Date(template.lastUsed).toLocaleDateString()}` : ''}
                    </small>
                </div>
            `;
            container.appendChild(templateCard);
        });
    }

    populateConfigForm() {
        document.getElementById('min-warming-interval').value = this.config.minWarmingInterval || 15;
        document.getElementById('max-warming-interval').value = this.config.maxWarmingInterval || 45;
        document.getElementById('max-messages').value = this.config.maxMessagesPerDay || 50;
        document.getElementById('targetGroupName1').value = this.config.targetGroupName1 || '';
        document.getElementById('targetGroupName2').value = this.config.targetGroupName2 || '';
        document.getElementById('tulilutCookie').value = this.config.tulilutCookie || '';
        document.getElementById('tulilutResetTime').value = this.config.tulilutResetTime || '23:59';
        document.getElementById('min-reply-delay').value = this.config.minReplyDelay || 30;
        document.getElementById('max-reply-delay').value = this.config.maxReplyDelay || 60;
        document.getElementById('working-hours-only').checked = this.config.enableWorkingHoursOnly || false;

        if (this.config.workingHours) {
            document.getElementById('work-start').value = this.config.workingHours.start || '09:00';
            document.getElementById('work-end').value = this.config.workingHours.end || '18:00';
        }
    }

    updateDashboard() {
        const totalContacts = this.contacts.length;
        const connectedContacts = this.contacts.filter(c => c.status === 'connected').length;

        document.getElementById('total-contacts').textContent = totalContacts;
        document.getElementById('connected-contacts').textContent = connectedContacts;
    }

    updateWarmerUI() {
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        const warmerStatus = document.getElementById('warmer-status');
        const startBtn = document.getElementById('start-warmer-btn');
        const stopBtn = document.getElementById('stop-warmer-btn');
        const warmerInfo = document.getElementById('warmer-info');

        // Check if all elements exist before proceeding
        if (!statusIndicator || !statusText || !warmerStatus || !startBtn || !stopBtn || !warmerInfo) {
            console.error('One or more UI elements not found for warmer status update');
            return;
        }

        // Ensure warmerStatus object is initialized
        if (!this.warmerStatus) {
            this.warmerStatus = { isActive: false };
        }

        if (this.warmerStatus.isActive) {
            statusIndicator.innerHTML = '<i class="fas fa-circle text-success me-1"></i>';
            statusText.textContent = 'Running';

            warmerStatus.innerHTML = `
                <i class="fas fa-play-circle fa-3x text-success"></i>
                <p class="mt-2 mb-0">Running</p>
            `;
            warmerStatus.classList.add('active');

            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            warmerInfo.style.display = 'block';

            const warmerMinInterval = document.getElementById('warmer-min-interval');
            const warmerMaxInterval = document.getElementById('warmer-max-interval');
            const warmerConnected = document.getElementById('warmer-connected');

            if (warmerMinInterval) {
                warmerMinInterval.textContent = this.warmerStatus.minInterval || 
                    (this.warmerStatus.config ? this.warmerStatus.config.minWarmingInterval : 15) || 15;
            }
            
            if (warmerMaxInterval) {
                warmerMaxInterval.textContent = this.warmerStatus.maxInterval || 
                    (this.warmerStatus.config ? this.warmerStatus.config.maxWarmingInterval : 45) || 45;
            }
            
            if (warmerConnected) {
                warmerConnected.textContent = this.warmerStatus.connectedContacts || 0;
            }
        } else {
            statusIndicator.innerHTML = '<i class="fas fa-circle text-danger me-1"></i>';
            statusText.textContent = 'Stopped';

            warmerStatus.innerHTML = `
                <i class="fas fa-stop-circle fa-3x text-danger"></i>
                <p class="mt-2 mb-0">Stopped</p>
            `;
            warmerStatus.classList.remove('active');

            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
            warmerInfo.style.display = 'none';
        }
    }

    // Contact Management Methods
    async addContact() {
        try {
            const formData = {
                name: document.getElementById('contact-name').value.trim(),
                phoneNumber: document.getElementById('contact-phone').value.trim(),
                email: document.getElementById('contact-email').value.trim(),
                notes: document.getElementById('contact-notes').value.trim(),
                push: document.getElementById('contact-push').checked,
                warmer: document.getElementById('contact-warmer').checked,
                timeoutSeconds: parseInt(document.getElementById('contact-timeout-seconds').value),
                maxMessageTimeout: parseInt(document.getElementById('contact-max-message-timeout').value),
                maxMessagesPerDay: parseInt(document.getElementById('contact-max-messages-per-day').value)
            };

            if (!formData.name || !formData.phoneNumber) {
                this.showAlert('Name and phone number are required', 'warning');
                return;
            }

            const response = await fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add contact');
            }

            const newContact = await response.json();
            this.contacts.push(newContact);
            this.renderContacts();
            this.updateDashboard();

            // Close modal and reset form
            const modal = bootstrap.Modal.getInstance(document.getElementById('addContactModal'));
            modal.hide();
            document.getElementById('add-contact-form').reset();

            this.showAlert(`Contact "${newContact.name}" added successfully`, 'success');
            this.addActivityLog(`Added contact: ${newContact.name}`, 'success');
        } catch (error) {
            console.error('Error adding contact:', error);
            this.showAlert(error.message, 'danger');
        }
    }

    async connectContact(contactId) {
        try {
            const contact = this.contacts.find(c => c.id === contactId);
            if (!contact) {
                throw new Error('Contact not found');
            }

            // Update UI to show connecting state
            this.updateContactStatus(contactId, 'connecting');
            this.addActivityLog(`Connecting ${contact.name}...`, 'info');

            const response = await fetch(`/api/whatsapp/connect/${contactId}`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to connect contact');
            }

            this.showAlert(`Connecting ${contact.name}... Please scan the QR code when it appears.`, 'info');
        } catch (error) {
            console.error('Error connecting contact:', error);
            this.showAlert(error.message, 'danger');
            this.updateContactStatus(contactId, 'disconnected');
        }
    }

    async disconnectContact(contactId) {
        try {
            const contact = this.contacts.find(c => c.id === contactId);
            if (!contact) {
                throw new Error('Contact not found');
            }

            const response = await fetch(`/api/whatsapp/disconnect/${contactId}`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to disconnect contact');
            }

            this.updateContactStatus(contactId, 'disconnected');
            this.showAlert(`${contact.name} disconnected successfully`, 'success');
            this.addActivityLog(`Disconnected ${contact.name}`, 'warning');
        } catch (error) {
            console.error('Error disconnecting contact:', error);
            this.showAlert(error.message, 'danger');
        }
    }

    async deleteContact(contactId) {
        try {
            const contact = this.contacts.find(c => c.id === contactId);
            if (!contact) {
                throw new Error('Contact not found');
            }

            if (!confirm(`Are you sure you want to delete "${contact.name}"? This action cannot be undone.`)) {
                return;
            }

            const response = await fetch(`/api/contacts/${contactId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete contact');
            }

            this.contacts = this.contacts.filter(c => c.id !== contactId);
            this.renderContacts();
            this.updateDashboard();

            this.showAlert(`Contact "${contact.name}" deleted successfully`, 'success');
            this.addActivityLog(`Deleted contact: ${contact.name}`, 'warning');
        } catch (error) {
            console.error('Error deleting contact:', error);
            this.showAlert(error.message, 'danger');
        }
    }
    
    openEditContactModal(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) {
            this.showAlert('Contact not found', 'danger');
            return;
        }

        // Populate the edit form with contact data
        document.getElementById('edit-contact-id').value = contact.id;
        document.getElementById('edit-contact-name').value = contact.name || '';
        document.getElementById('edit-contact-phone').value = contact.phoneNumber || '';
        document.getElementById('edit-contact-email').value = contact.email || '';
        document.getElementById('edit-contact-notes').value = contact.notes || '';
        document.getElementById('edit-contact-timeout-seconds').value = contact.timeoutSeconds || 60;
        document.getElementById('edit-contact-max-message-timeout').value = contact.maxMessageTimeout || 5;
        document.getElementById('edit-contact-max-messages-per-day').value = contact.maxMessagesPerDay || 0;
        document.getElementById('edit-contact-push').checked = contact.push !== false; // Default to true if undefined
        document.getElementById('edit-contact-warmer').checked = contact.warmer !== false; // Default to true if undefined

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('editContactModal'));
        modal.show();
    }

    async updateContact() {
        try {
            const contactId = document.getElementById('edit-contact-id').value;
            const formData = {
                name: document.getElementById('edit-contact-name').value.trim(),
                phoneNumber: document.getElementById('edit-contact-phone').value.trim(),
                email: document.getElementById('edit-contact-email').value.trim(),
                notes: document.getElementById('edit-contact-notes').value.trim(),
                push: document.getElementById('edit-contact-push').checked,
                warmer: document.getElementById('edit-contact-warmer').checked,
                timeoutSeconds: parseInt(document.getElementById('edit-contact-timeout-seconds').value),
                maxMessageTimeout: parseInt(document.getElementById('edit-contact-max-message-timeout').value),
                maxMessagesPerDay: parseInt(document.getElementById('edit-contact-max-messages-per-day').value)
            };

            if (!formData.name || !formData.phoneNumber) {
                this.showAlert('Name and phone number are required', 'warning');
                return;
            }

            const response = await fetch(`/api/contacts/${contactId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update contact');
            }

            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editContactModal'));
            if (modal) {
                modal.hide();
            }

            this.showAlert('Contact updated successfully', 'success');
            this.addActivityLog(`Updated contact: ${formData.name}`, 'info');
            this.loadContacts();
        } catch (error) {
            console.error('Error updating contact:', error);
            this.showAlert(error.message || 'Error updating contact', 'danger');
        }
    }

    updateContactStatus(contactId, status) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (contact) {
            contact.status = status;
            this.renderContacts();
            this.updateDashboard();
        }
    }

    // Template Management Methods
    async addTemplate() {
        try {
            const messageInputs = document.querySelectorAll('.template-message');
            const messages = Array.from(messageInputs)
                .map(input => input.value.trim())
                .filter(msg => msg.length > 0);

            if (messages.length === 0) {
                this.showAlert('At least one message variation is required', 'warning');
                return;
            }

            const formData = {
                name: document.getElementById('template-name').value.trim(),
                category: document.getElementById('template-category').value,
                templates: messages
            };

            if (!formData.name) {
                this.showAlert('Template name is required', 'warning');
                return;
            }

            const response = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add template');
            }

            const newTemplate = await response.json();
            this.templates.push(newTemplate);
            this.renderTemplates();

            // Close modal and reset form
            const modal = bootstrap.Modal.getInstance(document.getElementById('addTemplateModal'));
            modal.hide();
            this.resetTemplateForm();

            this.showAlert(`Template "${newTemplate.name}" added successfully`, 'success');
            this.addActivityLog(`Added template: ${newTemplate.name}`, 'success');
        } catch (error) {
            console.error('Error adding template:', error);
            this.showAlert(error.message, 'danger');
        }
    }

    addMessageVariation() {
        const container = document.getElementById('template-messages-container');
        const variationDiv = document.createElement('div');
        variationDiv.className = 'input-group mb-2';
        variationDiv.innerHTML = `
            <input type="text" class="form-control template-message" placeholder="Enter message variation..." required>
            <button type="button" class="btn btn-outline-danger remove-message">
                <i class="fas fa-minus"></i>
            </button>
        `;
        container.appendChild(variationDiv);

        // Update remove button states
        this.updateRemoveButtonStates();
    }

    removeMessageVariation(button) {
        const container = document.getElementById('template-messages-container');
        const variationDiv = button.closest('.input-group');

        if (container.children.length > 1) {
            variationDiv.remove();
            this.updateRemoveButtonStates();
        }
    }

    updateRemoveButtonStates() {
        const removeButtons = document.querySelectorAll('.remove-message');
        removeButtons.forEach(button => {
            button.disabled = removeButtons.length <= 1;
        });
    }

    resetTemplateForm() {
        document.getElementById('add-template-form').reset();
        const container = document.getElementById('template-messages-container');
        container.innerHTML = `
            <div class="input-group mb-2">
                <input type="text" class="form-control template-message" placeholder="Enter message variation..." required>
                <button type="button" class="btn btn-outline-danger remove-message" disabled>
                    <i class="fas fa-minus"></i>
                </button>
            </div>
        `;
    }

    // Auto Warmer Control Methods
    async   startAutoWarmer() {
        try {
            const connectedContacts = this.contacts.filter(c => c.status === 'connected').length;

            if (connectedContacts < 2) {
                this.showAlert('At least 2 contacts must be connected to start auto warmer', 'warning');
                return;
            }

            // Update UI immediately to show the stop button
            this.warmerStatus.isActive = true;
            this.updateWarmerUI();

            const response = await fetch('/api/warmer/start', {
                method: 'POST'
            });

            if (!response.ok) {
                // Revert UI changes if the API call fails
                this.warmerStatus.isActive = false;
                this.updateWarmerUI();
                
                const error = await response.json();
                throw new Error(error.error || 'Failed to start auto warmer');
            }

            const result = await response.json();
            
            this.showAlert('Auto warmer started successfully', 'success');
            this.addActivityLog('Auto warmer started', 'success');
        } catch (error) {
            console.error('Error starting auto warmer:', error);
            this.showAlert(error.message, 'danger');
        }
    }

    async stopAutoWarmer() {
        try {
            // Ensure warmerStatus is initialized
            if (!this.warmerStatus) {
                this.warmerStatus = { isActive: false };
            }
            
            // Update UI immediately to show the start button
            this.warmerStatus.isActive = false;
            
            // Update UI safely
            try {
                this.updateWarmerUI();
            } catch (uiError) {
                console.error('Error updating UI after stopping warmer:', uiError);
            }
            
            const response = await fetch('/api/warmer/stop', {
                method: 'POST'
            });

            if (!response.ok) {
                // Revert UI changes if the API call fails
                this.warmerStatus.isActive = true;
                this.updateWarmerUI();
                
                const error = await response.json();
                throw new Error(error.error || 'Failed to stop auto warmer');
            }

            const result = await response.json();

            this.showAlert('Auto warmer stopped successfully', 'success');
            this.addActivityLog('Auto warmer stopped', 'warning');
        } catch (error) {
            console.error('Error stopping auto warmer:', error);
            this.showAlert(error.message || 'Failed to stop auto warmer', 'danger');
        }
    }

    // Configuration Methods
    async updateConfiguration() {
        try {
            const formData = {
                minWarmingInterval: parseInt(document.getElementById('min-warming-interval').value),
                maxWarmingInterval: parseInt(document.getElementById('max-warming-interval').value),
                maxMessagesPerDay: parseInt(document.getElementById('max-messages').value),
                targetGroupName1: document.getElementById('targetGroupName1').value,
                targetGroupName2: document.getElementById('targetGroupName2').value,
                tulilutCookie: document.getElementById('tulilutCookie').value,
                tulilutResetTime: document.getElementById('tulilutResetTime').value,
                minReplyDelay: parseInt(document.getElementById('min-reply-delay').value),
                maxReplyDelay: parseInt(document.getElementById('max-reply-delay').value),
                enableWorkingHoursOnly: document.getElementById('working-hours-only').checked,
                workingHours: {
                    start: document.getElementById('work-start').value,
                    end: document.getElementById('work-end').value
                }
            };

            const response = await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update configuration');
            }

            this.config = await response.json();
            this.showAlert('Configuration updated successfully', 'success');
            this.addActivityLog('Configuration updated', 'info');
        } catch (error) {
            console.error('Error updating configuration:', error);
            this.showAlert(error.message, 'danger');
        }
    }

    // Socket Event Handlers
    showQRCode(data) {
        const modal = new bootstrap.Modal(document.getElementById('qrModal'));
        document.getElementById('qr-contact-name').textContent = data.contactName;
        document.getElementById('qr-code-image').src = data.qrCode;
        this.currentQRContactId = data.contactId; // Store the current contact ID
        modal.show();

        this.addActivityLog(`QR code generated for ${data.contactName}`, 'info');
    }

    updateConnectionStatus(data) {
        this.updateContactStatus(data.contactId, data.status);

        const contact = this.contacts.find(c => c.id === data.contactId);
        if (contact) {
            let message = '';
            let type = 'info';

            switch (data.status) {
                case 'connected':
                    message = `${contact.name} connected successfully`;
                    type = 'success';
                    break;
                case 'disconnected':
                    message = `${contact.name} disconnected`;
                    type = 'warning';
                    break;
                case 'auth_failed':
                    message = `Authentication failed for ${contact.name}`;
                    type = 'error';
                    break;
                case 'qr_ready':
                    message = `QR code ready for ${contact.name}`;
                    type = 'info';
                    break;
            }

            if (message) {
                this.addActivityLog(message, type);
            }
        }

        this.updateDashboard();
    }

    handleMessageReceived(data) {
        this.addActivityLog(`Message received from ${data.from}`, 'info');
        this.updateDashboard();
    }

    handleMessageSent(data) {
        this.addActivityLog(`Message sent to ${data.to}`, 'success');
        this.updateDashboard();
    }

    // Utility Methods
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alert-container');
        const alertId = 'alert-' + Date.now();

        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" id="${alertId}" role="alert">
                ${this.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        alertContainer.insertAdjacentHTML('beforeend', alertHtml);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const alertElement = document.getElementById(alertId);
            if (alertElement) {
                const alert = bootstrap.Alert.getOrCreateInstance(alertElement);
                alert.close();
            }
        }, 5000);
    }

    addActivityLog(message, type = 'info') {
        const activityLog = document.getElementById('activity-log');
        const timestamp = new Date().toLocaleTimeString();

        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${type} fade-in`;
        activityItem.innerHTML = `
            <div>${this.escapeHtml(message)}</div>
            <div class="activity-time">${timestamp}</div>
        `;

        activityLog.insertBefore(activityItem, activityLog.firstChild);

        // Keep only last 50 items
        while (activityLog.children.length > 50) {
            activityLog.removeChild(activityLog.lastChild);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async sendDirectMessage() {
        try {
            const contactId = document.getElementById('direct-message-contact').value;
            const phoneNumber = document.getElementById('direct-message-phone').value;
            const message = document.getElementById('direct-message-text').value;
            
            if (!contactId) {
                this.showAlert('Please select a connected contact', 'warning');
                return;
            }
            
            if (!phoneNumber) {
                this.showAlert('Please enter a recipient phone number', 'warning');
                return;
            }
            
            if (!message) {
                this.showAlert('Please enter a message', 'warning');
                return;
            }
            
            // Format phone number if needed (remove spaces, dashes, etc.)
            let formattedPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            
            // Basic validation for phone number
            if (formattedPhoneNumber.length < 10) {
                this.showAlert('Phone number appears to be too short. Please include country code (e.g., 62 for Indonesia)', 'warning');
                return;
            }
            
            // Show loading state
            const submitButton = document.querySelector('#direct-message-form button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Sending...';
            
            // Send the message
            const response = await fetch('/api/message/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contactId,
                    phoneNumber: formattedPhoneNumber,
                    message
                })
            });
            
            // Reset button state
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send message');
            }
            
            const result = await response.json();
            
            // Clear the form
            document.getElementById('direct-message-phone').value = '';
            document.getElementById('direct-message-text').value = '';
            
            // Show success message
            this.showAlert('Message sent successfully', 'success');
            this.addActivityLog(`Message sent to ${formattedPhoneNumber}`, 'success');
        } catch (error) {
            console.error('Error sending direct message:', error);
            this.showAlert(`Error sending message: ${error.message}`, 'danger');
        }
    }

    startPeriodicUpdates() {
        // Update dashboard every 30 seconds
        setInterval(() => {
            // this.loadWarmerStatus();
            this.updateDashboard();
        }, 30000);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WhatsAppAutoWarmer();
});
