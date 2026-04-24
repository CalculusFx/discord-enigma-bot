import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('ส่งข้อความถึงผู้ใช้โดยตรงผ่านบอท')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('ผู้ใช้ที่ต้องการส่งข้อความถึง')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('ข้อความที่ต้องการส่ง')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('password')
                .setDescription('รหัสผ่าน')
                .setRequired(true)
        ),

    async execute(interaction) {
        const password = interaction.options.getString('password');
        if (password !== config.admin.password) {
            return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: 64 });
        }

        const target = interaction.options.getUser('user');
        const message = interaction.options.getString('message');

        if (target.bot) {
            return interaction.reply({ content: '❌ ไม่สามารถส่งข้อความถึงบอทได้', flags: 64 });
        }

        const embed = new EmbedBuilder()
            .setColor(0x4c8ef7)
            .setAuthor({
                name: 'Enigma Bot',
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setDescription(message)
            .setFooter({ text: interaction.guild?.name ?? 'Private Message' })
            .setTimestamp();

        const sent = await target.send({ embeds: [embed] }).catch(() => null);

        if (!sent) {
            return interaction.reply({ content: `❌ ไม่สามารถส่ง DM ถึง ${target} ได้ (อาจปิด DM ไว้)`, flags: 64 });
        }

        return interaction.reply({ content: `✅ ส่งข้อความถึง ${target} เรียบร้อยแล้วครับ`, flags: 64 });
    },
};
