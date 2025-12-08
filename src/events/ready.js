import { Events } from 'discord.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log('═'.repeat(50));
        console.log(`🤖 Bot is online as ${client.user.tag}`);
        console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
        console.log(`🎵 Music player ready`);
        console.log(`🛡️ Moderation service active`);
        console.log('═'.repeat(50));

        // Set bot status
        client.user.setPresence({
            activities: [{ name: '🎵 /play | /help', type: 2 }],
            status: 'online',
        });
    },
};
