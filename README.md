# WhatsApp Auto Warmer

A comprehensive WhatsApp automation application built with Node.js and whatsapp-web.js that allows you to manage multiple WhatsApp connections and automatically send warming messages between contacts.

## Features

### 🔥 Core Features
- **Multi-Contact Management**: Add, edit, and manage multiple WhatsApp contacts
- **Auto Connection**: Connect multiple WhatsApp accounts using QR codes
- **Smart Auto Warmer**: Automatically send messages between connected contacts
- **Message Templates**: Customizable message templates with variations
- **Working Hours**: Configure active hours for message sending
- **Group Messaging**: Send messages to WhatsApp groups
- **Tulilut Integration**: Integrate with Tulilut.xyz for device management

### 📊 Dashboard & Monitoring
- **Real-time Status**: Monitor connection status of all contacts
- **Activity Logging**: Track message exchanges and connection events
- **Connection Monitoring**: Real-time updates on WhatsApp connection status

### ⚙️ Configuration
- **Customizable Intervals**: Set warming message intervals (in seconds)
- **Working Hours**: Define active messaging hours
- **Tulilut Settings**: Configure Tulilut.xyz integration for device management
- **Scheduled Resets**: Automatically reset device settings at specified times

### 🎨 User Interface
- **Modern Web Interface**: Clean, responsive Bootstrap-based UI
- **Real-time Updates**: Socket.io for live status updates
- **QR Code Display**: Easy WhatsApp connection via QR codes
- **Mobile Responsive**: Works on desktop and mobile devices

## Installation

### Prerequisites
- Node.js (v20 or higher) OR Docker
- npm (for non-Docker installation)
- Chrome/Chromium browser (for WhatsApp Web, automatically installed in Docker)

### Setup Instructions (Standard)

1. **Clone or download the project**
   ```bash
   cd whatsapp-auto-warmer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Access the web interface**
   Open your browser and go to: `http://localhost:3000`

### Setup Instructions (Docker)

1. **Clone or download the project**
   ```bash
   cd whatsapp-auto-warmer
   ```

2. **Build and start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Access the web interface**
   Open your browser and go to: `http://localhost:3000`

4. **View logs (optional)**
   ```bash
   docker-compose logs -f
   ```

5. **Stop the application**
   ```bash
   docker-compose down
   ```

## Usage Guide

### 1. Adding Contacts
1. Click "Add Contact" button
2. Enter contact details:
   - Name (required)
   - Phone number with country code (required, e.g., 62812345678)
   - Email (optional)
   - Notes (optional)
3. Click "Add Contact" to save

### 2. Connecting WhatsApp Accounts
1. Click "Connect" button next to a contact
2. Scan the QR code with WhatsApp on the phone for that contact
3. Wait for connection confirmation
4. Repeat for all contacts you want to connect

### 3. Managing Message Templates
1. Click "Add Template" button
2. Enter template details:
   - Template name
   - Message variations (multiple versions for variety)
3. Add multiple message variations for more natural conversations

### 4. Starting Auto Warmer
1. Ensure at least 2 contacts are connected
2. Configure settings in the Configuration panel:
   - Warming interval (min and max seconds between messages)
   - Working hours
   - Group messaging settings
3. Click "Start Auto Warmer"
4. Monitor connection status and activity

### 5. Configuration Options

#### Warming Settings
- **Min/Max Warming Interval**: Time range between warming messages (in seconds)
- **Group Messaging**: Enable/disable sending messages to WhatsApp groups
- **Target Group Names**: Configure target WhatsApp group names for messaging

#### Working Hours
- **Working Hours Only**: Enable to only send messages during specified hours
- **Start/End Time**: Define the active messaging window

#### Tulilut Integration
- **Tulilut Cookie**: Set your Tulilut.xyz cookie for API integration
- **Reset Time**: Configure when to automatically reset device settings

## How Auto Warmer Works

1. **Contact Selection**: Randomly selects a sender from connected contacts
2. **Recipient Selection**: Randomly selects a different connected contact or configured group as recipient
3. **Template Selection**: Chooses a random message template
4. **Message Sending**: Sends the message via WhatsApp
5. **Interval Management**: Waits for the configured interval before sending the next message
6. **Working Hours**: Only sends messages during configured working hours (if enabled)
7. **Tulilut Integration**: Manages device settings via Tulilut.xyz (if configured)
8. **Scheduled Resets**: Automatically resets device settings at configured times
9. **Cycle Repeat**: Process repeats based on configured interval

## File Structure

```
whatsapp-auto-warmer/
├── src/
│   ├── app.js                 # Main application entry point
│   ├── whatsapp/
│   │   └── WhatsAppManager.js # WhatsApp connection management
│   ├── contacts/
│   │   └── ContactManager.js  # Contact management
│   ├── messaging/
│   │   ├── MessageManager.js  # Auto warmer logic
│   │   └── TemplateManager.js # Message template management
│   ├── config/
│   │   └── Config.js          # Configuration management
│   ├── server/                # Server-related functionality
│   └── utils/                 # Utility functions
├── public/
│   ├── index.html            # Web interface
│   ├── css/style.css         # Styling
│   └── js/app.js             # Frontend JavaScript
├── data/                     # JSON data storage
│   ├── contacts.json         # Contact information
│   ├── message-templates.json # Message templates
│   ├── config.json           # Application configuration
├── Dockerfile                # Docker container configuration
├── docker-compose.yml        # Docker Compose configuration
├── .dockerignore             # Files to exclude from Docker build
├── truncate-logs.sh          # Script to truncate log files
└── package.json              # Node.js dependencies and scripts
```

## Data Storage

All data is stored in JSON files in the `data/` directory:

- **contacts.json**: Contact information and connection status
- **message-templates.json**: Message templates and variations
- **config.json**: Application configuration including Tulilut integration settings

WhatsApp session data is stored in:
- **.wwebjs_auth/**: Authentication data for WhatsApp Web sessions
- **.wwebjs_cache/**: Cache data for WhatsApp Web sessions

## Security & Privacy

- All data is stored locally on your machine
- No data is sent to external servers (except to Tulilut.xyz if that integration is enabled)
- WhatsApp sessions are encrypted and stored locally

## Troubleshooting

### Common Issues

1. **QR Code Not Appearing**
   - Ensure Chrome/Chromium is installed
   - Check if port 3000 is available
   - Try refreshing the page
   - Verify the WhatsApp client is properly initialized

2. **Connection Fails**
   - Verify phone number format includes country code (e.g., 62812345678)
   - Ensure WhatsApp is active on the phone
   - Check internet connection
   - Verify WhatsApp Web is not logged in elsewhere

3. **Messages Not Sending**
   - Verify at least 2 contacts are connected
   - Check if within working hours (if enabled)
   - Verify group names are correct if sending to groups

4. **Auto Warmer Won't Start**
   - Need minimum 2 connected contacts
   - Check for active message templates
   - Verify configuration settings

5. **Tulilut Integration Issues**
   - Verify cookie value is correct and up-to-date
   - Check if Tulilut.xyz is accessible

### Logs and Debugging

- Check browser console for frontend errors
- Server logs are displayed in the terminal
- For Docker: Use `docker-compose logs -f` to view logs

### Docker-specific Troubleshooting

1. **Container Won't Start**
   - Check Docker logs: `docker-compose logs -f`
   - Ensure ports are not already in use
   - Verify Docker has sufficient resources

2. **QR Code Issues in Docker**
   - Ensure the container has all required dependencies
   - Check if Chromium is working properly in the container
   - Try rebuilding the image: `docker-compose build --no-cache`

3. **Data Persistence Issues**
   - Verify volume mappings in docker-compose.yml
   - Check permissions on host directories
   - Ensure data directory exists on host
   - Verify .wwebjs_auth and .wwebjs_cache directories are properly mounted

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the browser console and server logs
3. Ensure all requirements are met
4. Verify WhatsApp Web is working normally in your browser

## License

This project is licensed under the ISC License.

## Disclaimer

This tool is for educational and legitimate business purposes only. Users are responsible for complying with WhatsApp's Terms of Service and applicable laws. Use responsibly and respect others' privacy.
