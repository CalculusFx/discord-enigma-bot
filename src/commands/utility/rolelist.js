import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rolelist')
        .setDescription('แสดงรายการยศทั้งหมดในเซิร์ฟเวอร์'),

    async execute(interaction) {
        await interaction.deferReply();

        const guild = interaction.guild;
        const botHighestPos = guild.members.me.roles.highest.position;

        const roles = guild.roles.cache
            .filter(r =>
                r.id !== guild.id &&   // ตัด @everyone
                !r.managed             // ตัด role ที่บอท/integration จัดการ
            )
            .sort((a, b) => b.position - a.position);

        if (!roles.size) {
            return interaction.editReply({ content: 'ไม่พบยศในเซิร์ฟเวอร์' });
        }

        const requestable = [];
        const restricted = [];

        for (const role of roles.values()) {
            if (role.position >= botHighestPos) {
                restricted.push(`🔒 ${role.name}`);
            } else {
                requestable.push(`<@&${role.id}> — \`${role.name}\``);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`🏷️ ยศทั้งหมดใน ${guild.name}`)
            .setFooter({ text: `รวม ${roles.size} ยศ • ใช้ /rolerequest เพื่อขอยศ` })
            .setTimestamp();

        if (requestable.length) {
            const chunks = chunkArray(requestable, 20);
            chunks.forEach((chunk, i) => {
                embed.addFields({
                    name: chunks.length > 1 ? `✅ ขอได้ (${i + 1}/${chunks.length})` : '✅ ขอได้',
                    value: chunk.join('\n'),
                    inline: false,
                });
            });
        }

        if (restricted.length) {
            embed.addFields({
                name: '🔒 ขอไม่ได้ (สูงกว่ายศบอท)',
                value: restricted.join('\n'),
                inline: false,
            });
        }

        return interaction.editReply({ embeds: [embed] });
    },
};

function chunkArray(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
}
