# Discord Music & Moderation Bot 🎵🛡️

A comprehensive Discord bot featuring music playback, TTS voice announcements, and AI-powered content moderation.

## ✨ Features

### 🎵 Music Player
- Play music from **YouTube**, **Spotify**, **SoundCloud**, and more
- Queue management with skip, pause, resume, loop
- Volume control
- Now playing display with progress bar
- Shuffle functionality

### 🔊 Voice Announcements (TTS)
- Announces when users join/leave voice channels
- Supports multiple languages (Thai, English, Japanese, Korean, Chinese)
- Configurable per server

### 🛡️ Content Moderation
- **AI-powered** content analysis using OpenAI
- Filter gambling, adult, illegal, and scam content
- Block suspicious domains
- Auto-delete violating messages
- Moderation logging
- **Self-learning** - learns from detected violations

### 📊 Admin Features
- Per-server configuration
- Customizable blocked domains
- Moderation statistics
- Log channel setup

## 📋 Requirements

- Node.js 18.0.0 or higher
- FFmpeg installed on your system
- Discord Bot Token
- OpenAI API Key (optional, for AI moderation)
- Spotify API credentials (optional, for Spotify support)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd "Bot For Discoard"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install FFmpeg** (required for music playback)
   
   **macOS:**
   ```bash
   brew install ffmpeg
   ```
   
   **Ubuntu/Debian:**
   ```bash
   sudo apt install ffmpeg
   ```
   
   **Windows:**
   Download from [FFmpeg website](https://ffmpeg.org/download.html)

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your credentials:
   - `DISCORD_TOKEN` - Your Discord bot token
   - `CLIENT_ID` - Your Discord application client ID
   - `OPENAI_API_KEY` - OpenAI API key (optional)
   - Other settings as needed

5. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

6. **Start the bot**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## 📝 Commands

### Music Commands
| Command | Description |
|---------|-------------|
| `/play <query>` | Play a song or add to queue |
| `/queue [page]` | View the current queue |
| `/skip` | Skip the current song |
| `/stop` | Stop playback and clear queue |
| `/pause` | Pause the current song |
| `/resume` | Resume playback |
| `/volume <0-100>` | Set the volume |
| `/nowplaying` | Show current song info |
| `/loop <mode>` | Set loop mode |
| `/shuffle` | Shuffle the queue |

### Utility Commands
| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/ping` | Check bot latency |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/settings view` | View current settings |
| `/settings tts <on/off>` | Enable/disable TTS |
| `/settings moderation <on/off>` | Enable/disable moderation |
| `/settings log-channel <channel>` | Set log channel |
| `/settings tts-language <lang>` | Set TTS language |
| `/moderation status` | View moderation status |
| `/moderation block-domain <domain>` | Block a domain |
| `/moderation list-domains` | List blocked domains |

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Discord bot token |
| `CLIENT_ID` | ✅ | Discord application ID |
| `GUILD_ID` | ❌ | Guild ID for dev commands |
| `OPENAI_API_KEY` | ❌ | OpenAI API key for AI moderation |
| `SPOTIFY_CLIENT_ID` | ❌ | Spotify client ID |
| `SPOTIFY_CLIENT_SECRET` | ❌ | Spotify client secret |
| `TTS_ENABLED` | ❌ | Enable TTS (default: true) |
| `TTS_LANGUAGE` | ❌ | TTS language (default: th) |
| `MODERATION_ENABLED` | ❌ | Enable moderation (default: true) |
| `LOG_CHANNEL_ID` | ❌ | Channel for moderation logs |

## 🔧 Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" tab and create a bot
4. Copy the token to your `.env` file
5. Enable these **Privileged Gateway Intents**:
   - ✅ PRESENCE INTENT
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
6. Go to "OAuth2" > "URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: `Administrator` (or customize as needed)
9. Copy the URL and invite the bot to your server

## 📁 Project Structure

```
├── src/
│   ├── index.js              # Bot entry point
│   ├── config.js             # Configuration
│   ├── deploy-commands.js    # Command deployment
│   ├── commands/
│   │   ├── music/            # Music commands
│   │   ├── moderation/       # Moderation commands
│   │   └── utility/          # Utility commands
│   ├── events/               # Event handlers
│   └── services/
│       ├── database.js       # SQLite database
│       ├── tts/              # TTS service
│       └── moderation/       # Moderation service
├── data/                     # Database files
├── temp/                     # Temporary TTS files
├── .env.example              # Environment template
└── package.json
```

## 🤖 AI Moderation

When OpenAI API key is provided, the bot uses GPT-3.5 to analyze messages for:
- Gambling content
- Adult/NSFW content
- Illegal substances
- Scams and fraud
- Spam

The bot also **learns** from detected violations to improve future detection.

## 🔒 Security

- Never commit your `.env` file
- Keep your bot token secret
- Regularly rotate API keys
- Review bot permissions regularly

## 📜 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
# discord-enigma-bot
# discord-enigma-bot
