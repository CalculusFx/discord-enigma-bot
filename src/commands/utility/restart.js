import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import config from '../../config.js';
import { TTSService } from '../../services/tts/ttsService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('announce-restart')
        .setDescription('ประกาศว่าบอทกำลังรีสตาร์ท (สำหรับผู้ดูแล)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        // permission is declared on the command, but double-check at runtime
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'คุณไม่มีสิทธิ์ใช้คำสั่งนี้', flags: MessageFlags.Ephemeral });
        }

        const text = 'Enigma Bot Online Standby รอรับคำสั่ง';
        // const text = 'แจ้งเตือนระดับ 3 : ตรวจพบการทำงานผิดปกติ รหัสข้อผิดพลาด E-401 , E-504 , E-999 ไม่สามารถรีสตาร์ทได้ กรุณาติดต่อผู้ดูแลระบบเพื่อแก้ไขปัญหา';
        // const text = 'Moderation Restart Successful';
        // const text = 'Moderation Enigma Bot System is restarting, please wait...';
        // const text = 'ประกาศ: ระบบ Moderation ตรวจพบความผิดปกติ Enigma Bot กรุณารอสักครู่';

        // Prefer the invoker's voice channel if they're connected
        let voiceChannel = null;
        try {
            const invoker = interaction.guild.members.cache.get(interaction.user.id) || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (invoker && invoker.voice && invoker.voice.channel) voiceChannel = invoker.voice.channel;
        } catch {}

        // Otherwise find any occupied voice channel (non-bot members)
        if (!voiceChannel) {
            voiceChannel = interaction.guild.channels.cache.find(c => {
                const isVoice = typeof c.isVoiceBased === 'function' ? c.isVoiceBased() : (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
                return isVoice && c.members && c.members.some(m => !m.user.bot);
            });
        }

        if (!voiceChannel) {
            return interaction.deferReply({ flags: MessageFlags.Ephemeral }).then(() => interaction.editReply({ content: 'ไม่พบช่องเสียงที่สามารถเล่นประกาศได้' }));
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const tts = new TTSService();
            await tts.speak(voiceChannel, text);
            return interaction.editReply({ content: '🔊 ประกาศด้วยเสียงในช่องเสียงเรียบร้อยแล้ว' });
        } catch (err) {
            console.error('announce-restart TTS failed', err);
            try { return interaction.editReply({ content: 'ไม่สามารถเล่นเสียงประกาศได้' }); } catch { return; }
        }
    },
};
