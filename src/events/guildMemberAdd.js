import { Events, EmbedBuilder } from 'discord.js';
import config from '../config.js';

const PHD_QUESTIONS = [
    "ให้ G เป็น p-group จำกัด และ Z(G) คือ center ของ G จงพิสูจน์ว่า ถ้า G/Z(G) เป็น cyclic แล้ว G ต้องเป็น abelian",
    "ให้ f: R^n -> R เป็นฟังก์ชันนูน (convex) และ df(x) คือ subdifferential ที่จุด x จงแสดงว่า df(x) เป็น nonempty convex compact set สำหรับทุก x ใน int(dom f)",
    "ให้ (M, g) เป็น Riemannian manifold มิติ n และ Ric(g) >= (n-1)kg สำหรับ k > 0 จงพิสูจน์ว่า diam(M) <= pi/sqrt(k) โดยใช้ Myers theorem",
    "ให้ zeta(s) คือ Riemann zeta function จงพิสูจน์ว่า sum_{p prime} 1/p diverges โดยอาศัยการแยกตัวประกอบ Euler product",
    "ให้ H เป็น Hilbert space และ T: H -> H เป็น compact self-adjoint operator จงพิสูจน์ว่า T มี eigenvalue และ eigenvector ที่สอดคล้องกับ spectral theorem",
    "ให้ X เป็น Banach space และ T อยู่ใน B(X) จงแสดงว่า spectrum σ(T) เป็น compact nonempty subset ของ C และ r(T) = lim_{n->inf} ||T^n||^{1/n}",
    "พิจารณา SDE: dX_t = u(X_t)dt + s(X_t)dW_t จงหาเงื่อนไขที่ทำให้ strong solution มีเอกลักษณ์โดยใช้ Lipschitz condition และพิสูจน์ Ito formula",
    "ให้ Gamma เป็น discrete group กระทำบน hyperbolic space H^n อย่าง properly discontinuously จงแสดงว่า M = H^n/Gamma เป็น hyperbolic manifold และคำนวณ fundamental domain",
    "จงพิสูจน์ Hahn-Banach theorem: ถ้า p: X -> R เป็น sublinear functional และ f: Y -> R บน subspace Y ⊆ X โดย f(x) <= p(x) แล้วมี extension F: X -> R ที่ F|_Y = f และ F(x) <= p(x)",
    "ให้ A เป็น C*-algebra จงพิสูจน์ว่า homomorphism ระหว่าง C*-algebra ทุกตัวเป็น isometry และนำไปสู่การพิสูจน์ Gelfand-Naimark theorem",
    "จงพิสูจน์ว่า int_0^1 (x^a - x^b)/ln(x) dx = ln((b+1)/(a+1)) โดยใช้ differentiation under the integral sign",
    "ให้ E/F เป็น Galois extension ที่มี Galois group Gal(E/F) isomorphic กับ S_4 จงหาจำนวน intermediate field ทั้งหมดโดยใช้ Galois correspondence และ subgroup lattice ของ S_4",
    "พิสูจน์ว่าทุก simply connected complete Riemannian manifold ที่มี sectional curvature = 0 ทุกจุด isometric กับ Euclidean space R^n ตาม Hadamard theorem",
    "ให้ f อยู่ใน L^2(R) จงพิสูจน์ว่า ||f_hat||_{L^2} = ||f||_{L^2} ตาม Parseval theorem และแสดงว่า Fourier transform เป็น unitary operator บน L^2(R)",
    "จงพิสูจน์ prime number theorem: pi(x) ~ x/ln(x) เมื่อ x -> inf โดยใช้ zero-free region ของ Riemann zeta function",
    "ให้ (X, A, mu) เป็น probability space และ {X_n} เป็น martingale bounded ใน L^2 จงพิสูจน์ว่า X_n -> X_inf a.s. และใน L^2 โดยใช้ Doob martingale convergence theorem",
    "ให้ M เป็น smooth manifold มิติ n จงพิสูจน์ de Rham theorem: H^k_dR(M) isomorphic H^k(M; R) โดยใช้ Mayer-Vietoris sequence",
    "จงคำนวณ int_{-inf}^{inf} e^{-x^2} cos(2ax) dx = sqrt(pi) * e^{-a^2} โดยใช้ contour integration ใน complex plane",
    "ให้ R เป็น Noetherian ring และ M เป็น finitely generated R-module จงพิสูจน์ว่า M มี finite projective resolution และนำไปสู่การนิยาม global dimension ของ R",
    "พิจารณา Schrodinger equation: i*hbar * d(psi)/dt = H_hat * psi จงพิสูจน์ว่า ||psi(t)||^2 = ||psi(0)||^2 โดยใช้ self-adjointness ของ Hamiltonian",
];

const usedIndices = new Set();

function getRandomQuestion() {
    if (usedIndices.size >= PHD_QUESTIONS.length) usedIndices.clear();
    let idx;
    do { idx = Math.floor(Math.random() * PHD_QUESTIONS.length); } while (usedIndices.has(idx));
    usedIndices.add(idx);
    return PHD_QUESTIONS[idx];
}

export default {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        try {
            let target = null;

            const preferredChannelId = '1136020567158440088';
            try {
                target = member.guild.channels.cache.get(preferredChannelId) || await member.guild.channels.fetch(preferredChannelId).catch(() => null);
            } catch (e) {
                target = null;
            }

            if (!target) {
                try { target = member.guild.systemChannel || null; } catch (e) { target = null; }
            }

            if (!target && config.moderation.logChannelId) {
                try {
                    target = member.guild.channels.cache.get(config.moderation.logChannelId) || await member.guild.channels.fetch(config.moderation.logChannelId).catch(() => null);
                } catch (e) {
                    target = null;
                }
            }
            if (!target) {
                target = member.guild.channels.cache.find(c => c.isTextBased && c.viewable && c.permissionsFor(member.guild.members.me).has('SendMessages')) || null;
            }

            if (!target) return;

            const memberCount = member.guild.memberCount;
            const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });
            const guildIconUrl = member.guild.iconURL({ size: 256, extension: 'png' });
            const joinedAt = `<t:${Math.floor(Date.now() / 1000)}:R>`;
            const question = getRandomQuestion();

            const embed = new EmbedBuilder()
                .setColor(0x4c8ef7)
                .setAuthor({
                    name: `${member.guild.name}  ·  ยินดีต้อนรับสมาชิกใหม่`,
                    iconURL: guildIconUrl || undefined,
                })
                .setTitle(`${member.user.username}  เข้าร่วมแล้ว! 🎉`)
                .setDescription(
                    `${member.user} ยินดีต้อนรับสู่เซิร์ฟเวอร์ครับ หวังว่าจะสนุกที่นี่ 🙏\n` +
                    `**สมาชิกลำดับที่** \`${memberCount}\`  ·  **เข้าร่วม** ${joinedAt}\n` +
                    `\n` +
                    `## 📌 กฎของชุมชน\n` +
                    `\`\`\`\n` +
                    `เคารพสมาชิกทุกคน\n` +
                    `ห้ามเนื้อหาไม่เหมาะสม / การพนัน\n` +
                    `ละเมิดซ้ำ → ระงับสิทธิ์ชั่วคราว\n` +
                    `\`\`\`\n` +
                    `## 🔐 ยืนยันตัวตน\n` +
                    `ตอบคำถามด้านล่างเพื่อยืนยันว่าคุณเป็นมนุษย์\n` +
                    `\`\`\`\n` +
                    `${question}\n` +
                    `\`\`\``
                )
                .setThumbnail(avatarUrl)
                .setImage(member.guild.bannerURL({ size: 1024 }) || null)
                .setFooter({
                    text: 'ระบบยืนยันตัวตนอัตโนมัติ',
                    iconURL: guildIconUrl || undefined,
                })
                .setTimestamp();

            await target.send({ content: `ยินดีต้อนรับ ${member} เข้าสู่เซิร์ฟเวอร์ครับ 👋`, embeds: [embed] }).catch(() => null);
        } catch (err) {
            console.warn('[Welcome] Failed to deliver welcome message:', err?.message || err);
        }
    }
};
