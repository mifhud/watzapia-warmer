# WhatsApp Auto Warmer

A comprehensive WhatsApp automation application built with Node.js and whatsapp-web.js that allows you to manage multiple WhatsApp connections and automatically send warming messages between contacts.

## Features

### 🔥 Core Features
- **Multi-Contact Management**: Add, edit, and manage multiple WhatsApp contacts
- **Auto Connection**: Connect multiple WhatsApp accounts using QR codes
- **Smart Auto Warmer**: Automatically send messages between connected contacts
- **Reply Requirement**: Ensures recipients reply before sending additional messages
- **Message Templates**: Customizable message templates with variations
- **Dynamic Variables**: Insert names, dates, and other dynamic data into messages
- **Timezone Support**: Optimized for Asia/Jakarta timezone
- **Working Hours**: Configure active hours for message sending
- **Group Messaging**: Send messages to WhatsApp groups
- **Tulilut Integration**: Integrate with Tulilut.xyz for advanced device management

### 📊 Dashboard & Monitoring
- **Real-time Status**: Monitor connection status of all contacts
- **Activity Logging**: Track all activities and message exchanges
- **Statistics Dashboard**: View contact counts, pending replies, and daily messages
- **Connection Monitoring**: Real-time updates on WhatsApp connection status

### ⚙️ Configuration
- **Customizable Intervals**: Set warming message intervals (1-1440 minutes)
- **Daily Limits**: Configure multiple message limits per contact per day
- **Reply Timeout**: Set how long to wait for replies (1-168 hours)
- **Working Hours**: Define active messaging hours
- **Spam Prevention**: Built-in safeguards to prevent spam detection
- **Scheduled Resets**: Automatically reset device settings at specified times

### 🎨 User Interface
- **Modern Web Interface**: Clean, responsive Bootstrap-based UI
- **Real-time Updates**: Socket.io for live status updates
- **QR Code Display**: Easy WhatsApp connection via QR codes
- **Mobile Responsive**: Works on desktop and mobile devices

## Installation

### Prerequisites
- Node.js (v20 or higher) OR Docker
- npm or yarn (for non-Docker installation)
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
   - Phone number with country code (required, e.g., +62812345678)
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
   - Category (greeting, check-in, casual, etc.)
   - Message variations (multiple versions for variety)
3. Use variables like `{name}`, `{timeOfDay}`, `{dayOfWeek}` for dynamic content

### 4. Starting Auto Warmer
1. Ensure at least 2 contacts are connected
2. Configure settings in the Configuration panel:
   - Warming interval (how often to send messages)
   - Maximum messages per day
   - Reply timeout
   - Working hours
3. Click "Start Auto Warmer"
4. Monitor activity in the Recent Activity panel

### 5. Configuration Options

#### Warming Settings
- **Warming Interval**: Time between warming messages (1-1440 minutes)
- **Max Messages/Day**: Maximum messages per contact per day (configurable per contact)
- **Reply Timeout**: Hours to wait for reply before sending next message (1-168)
- **Group Messaging**: Enable/disable sending messages to WhatsApp groups
- **Target Group Names**: Configure target WhatsApp group names for messaging

#### Working Hours
- **Working Hours Only**: Enable to only send messages during specified hours
- **Start/End Time**: Define the active messaging window

#### Tulilut Integration
- **Tulilut Cookie**: Set your Tulilut.xyz cookie for API integration
- **Reset Time**: Configure when to automatically reset device settings
- **Device Limits**: Automatically manage device limits based on daily message counts

## How Auto Warmer Works

1. **Contact Selection**: Randomly selects a sender from connected contacts without pending replies
2. **Recipient Selection**: Randomly selects a different connected contact or configured group as recipient
3. **Template Selection**: Chooses a random active message template
4. **Message Generation**: Creates message with dynamic variables (name, time, date)
5. **Message Sending**: Sends the message via WhatsApp
6. **Reply Tracking**: Tracks the message and waits for recipient's reply
7. **Reply Requirement**: Sender cannot send another message until recipient replies or timeout expires
8. **Daily Limit Management**: Manages daily message limits per contact, with progressive limits
9. **Device Settings**: Integrates with Tulilut.xyz to manage device settings
10. **Scheduled Resets**: Automatically resets device settings at configured times
11. **Cycle Repeat**: Process repeats based on configured interval

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
│   ├── message-history.json  # Message history
│   └── sessions/             # WhatsApp session data
├── Dockerfile                # Docker container configuration
├── docker-compose.yml        # Docker Compose configuration
├── .dockerignore             # Files to exclude from Docker build
├── truncate-logs.sh          # Script to truncate log files
└── package.json              # Node.js dependencies and scripts
```

## Data Storage

All data is stored in JSON files in the `data/` directory:

- **contacts.json**: Contact information, status, and daily message limits
- **message-templates.json**: Message templates and variations
- **config.json**: Application configuration including Tulilut integration settings
- **message-history.json**: Message sending history
- **sessions/**: WhatsApp Web session data for each contact

WhatsApp session data is stored in:
- **.wwebjs_auth/**: Authentication data for WhatsApp Web sessions
- **.wwebjs_cache/**: Cache data for WhatsApp Web sessions

## Security & Privacy

- All data is stored locally on your machine
- No data is sent to external servers
- WhatsApp sessions are encrypted and stored locally
- Message history is kept locally for tracking purposes

## Troubleshooting

### Common Issues

1. **QR Code Not Appearing**
   - Ensure Chrome/Chromium is installed
   - Check if port 3000 is available
   - Try refreshing the page
   - Verify the WhatsApp client is properly initialized

2. **Connection Fails**
   - Verify phone number format includes country code
   - Ensure WhatsApp is active on the phone
   - Check internet connection
   - Verify WhatsApp Web is not logged in elsewhere

3. **Messages Not Sending**
   - Verify at least 2 contacts are connected
   - Check if within working hours (if enabled)
   - Ensure daily message limit not reached
   - Verify Tulilut integration settings if enabled

4. **Auto Warmer Won't Start**
   - Need minimum 2 connected contacts
   - Check for active message templates
   - Verify configuration settings
   - Ensure group names are correct if sending to groups

5. **Tulilut Integration Issues**
   - Verify cookie value is correct and up-to-date
   - Check if Tulilut.xyz is accessible
   - Ensure device settings are properly configured

### Logs and Debugging

- Check browser console for frontend errors
- Server logs are displayed in the terminal
- Activity log in the web interface shows real-time events
- For Docker: Use `docker-compose logs -f` to view logs

### Docker-specific Troubleshooting

1. **Container Won't Start**
   - Check Docker logs: `docker-compose logs -f`
   - Ensure ports are not already in use
   - Verify Docker has sufficient resources
   - Check if Node.js version in Dockerfile is compatible

2. **QR Code Issues in Docker**
   - Ensure the container has all required dependencies
   - Check if Chromium is working properly in the container
   - Try rebuilding the image: `docker-compose build --no-cache`
   - Verify Puppeteer environment variables are set correctly

3. **Data Persistence Issues**
   - Verify volume mappings in docker-compose.yml
   - Check permissions on host directories
   - Ensure data directory exists on host
   - Verify .wwebjs_auth and .wwebjs_cache directories are properly mounted

4. **Performance Issues**
   - Allocate sufficient resources to the Docker container
   - Consider using a host with more CPU/RAM for multiple connections
   - Monitor container resource usage with `docker stats`

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
