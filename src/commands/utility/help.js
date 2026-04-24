import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('แสดงคำสั่งทั้งหมดของบอท'),
    async execute(interaction, client) {
        const cmds = Array.from(client.commands.values()).map(c => ({ name: c.data?.name, desc: c.data?.description }));

        const music = ['play','queue','skip','stop','pause','resume','volume','nowplaying','loop','shuffle'];
        const admin = ['moderation','patterns','settings','tts-admin','tts-status'];

        const musicLines = [];
        const adminLines = [];
        const otherLines = [];

        for (const c of cmds) {
            const n = c.name;
            const d = c.desc || '';
            if (!n) continue;
            if (music.includes(n)) musicLines.push(`/${n} — ${d}`);
            else if (admin.includes(n)) adminLines.push(`/${n} — ${d}`);
            else otherLines.push(`/${n} — ${d}`);
        }

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📘 คำสั่งทั้งหมด')
            .setDescription('รายการคำสั่งที่สามารถใช้งานได้')
            .addFields(
                { name: '🎵 เพลง', value: musicLines.length ? musicLines.join('\n') : 'ไม่มีคำสั่ง', inline: false },
                { name: '🛡️ การจัดการ (Admin)', value: adminLines.length ? adminLines.join('\n') : 'ไม่มีคำสั่ง', inline: false },
                { name: '⚙️ อื่นๆ', value: otherLines.length ? otherLines.join('\n') : 'ไม่มีคำสั่ง', inline: false },
            )
            .setFooter({ text: 'Bot created with ❤️' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
