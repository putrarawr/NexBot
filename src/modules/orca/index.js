import { registerCommand } from '../../bot/handler.js';
import { runOrcaAgent, getAgentMode, setAgentMode, orcaTools } from './runner.js';
import { logger } from '../../utils/logger.js';

function isAuthorizedOwner({ ctx, sender, config, platform }) {
  if (platform === 'telegram' && ctx?.from?.id) {
    const userId = String(ctx.from.id);
    const ownerId = String(config.telegramOwnerId || process.env.TELEGRAM_OWNER_ID || '8244607780');
    return userId === ownerId;
  }

  if (sender) {
    const senderClean = String(sender).replace(/[^0-9]/g, '');
    const ownerClean = String(config.ownerNumber || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    return ownerClean && senderClean.includes(ownerClean);
  }

  return false;
}

export function registerOrcaCommands() {
  // 1. Command: Orca Autonomous Agent (/orca)
  registerCommand({
    name: 'orca',
    aliases: ['agent', 'dev', 'coder'],
    category: 'programming',
    description: 'Autonomous cloud dev agent untuk coding & perbaikan sistem di server',
    usage: '/orca <deskripsi tugas>',
    async execute({ fullText, reply, ctx, sender, platform, config }) {
      if (!isAuthorizedOwner({ ctx, sender, config, platform })) {
        return reply('[!] Akses ditolak. Fitur Orca Cloud Agent hanya dapat diakses oleh Owner bot.');
      }

      const task = fullText?.trim();
      if (!task) {
        const mode = getAgentMode();
        return reply(`[ORCA DEV AGENT]\n\nMode aktif: <b>${mode.toUpperCase()}</b>\n\nContoh penggunaan:\n• <code>/orca buatkan fungsi helper kalkulator di src/utils/calc.js</code>\n• <code>/orca cek status git dan jalankan npm test</code>\n• <code>/mode vibecode</code> untuk beralih ke VibeCode mode.`);
      }

      let progressMsg = null;
      if (platform === 'telegram' && ctx?.reply) {
        try {
          progressMsg = await ctx.reply(`[ORCA: ${getAgentMode().toUpperCase()}] Menerima tugas... Mohon tunggu.`);
        } catch {}
      }

      const onProgress = async (text) => {
        if (progressMsg && ctx?.api && ctx?.chat?.id) {
          try {
            await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id, text, { parse_mode: 'HTML' });
          } catch {}
        }
      };

      try {
        const result = await runOrcaAgent({ task, onProgress });
        let out = `<b>[ ORCA AGENT: ${result.mode.toUpperCase()} MODE ]</b>\n\n`;
        out += `${result.response}\n\n`;
        out += `<i>Selesai dalam ${result.steps} langkah.</i>`;
        await reply(out);
      } catch (err) {
        logger.error('Error saat menjalankan Orca agent:', err.message);
        await reply(`[!] Orca agent gagal menjalankan tugas: ${err.message}`);
      }
    },
  });

  // 2. Command: VibeCode Mode Runner (/vibecode / /vibe)
  registerCommand({
    name: 'vibecode',
    aliases: ['vibe', 'vibing', 'cook'],
    category: 'programming',
    description: 'Jalankan coding agent dalam VibeCode mode (cepat, intuitif, hacker style)',
    usage: '/vibecode <tugas>',
    async execute({ fullText, reply, ctx, sender, platform, config }) {
      if (!isAuthorizedOwner({ ctx, sender, config, platform })) {
        return reply('[!] Akses ditolak. Fitur VibeCode hanya untuk Owner bot.');
      }

      const task = fullText?.trim();
      if (!task) {
        return reply('[VIBECODE MODE]\n\nMasukkan ide atau tugas coding yang mau di-cook!\nContoh: <code>/vibecode refactor logger dan buat outputnya lebih aesthetic</code>');
      }

      let progressMsg = null;
      if (platform === 'telegram' && ctx?.reply) {
        try {
          progressMsg = await ctx.reply('[VIBECODE] Let\'s cook! Memulai proses...');
        } catch {}
      }

      const onProgress = async (text) => {
        if (progressMsg && ctx?.api && ctx?.chat?.id) {
          try {
            await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id, text, { parse_mode: 'HTML' });
          } catch {}
        }
      };

      try {
        const result = await runOrcaAgent({ task, mode: 'vibecode', onProgress });
        let out = `<b>[ VIBECODE COMPLETED ]</b>\n\n`;
        out += `${result.response}\n\n`;
        out += `<i>Vibe check passed in ${result.steps} steps!</i>`;
        await reply(out);
      } catch (err) {
        logger.error('Error saat VibeCode:', err.message);
        await reply(`[!] VibeCode failed: ${err.message}`);
      }
    },
  });

  // 3. Command: Autonomous Bug Fixer (/fix)
  registerCommand({
    name: 'fix',
    aliases: ['bugfix', 'repair', 'patch'],
    category: 'programming',
    description: 'Perbaikan bug otonom (investigasi -> edit kode -> test -> push GitHub)',
    usage: '/fix <keluhan/masalah>',
    async execute({ fullText, reply, ctx, sender, platform, config }) {
      if (!isAuthorizedOwner({ ctx, sender, config, platform })) {
        return reply('[!] Akses ditolak. Fitur /fix hanya dapat diakses oleh Owner.');
      }

      const issue = fullText?.trim();
      if (!issue) {
        return reply('[AUTONOMOUS BUG FIXER]\n\nSebutkan masalah atau bug yang ingin diperbaiki.\nContoh: <code>/fix audio telegram format m4a kadang tidak terbaca</code>');
      }

      const fixPrompt = `Investigasi dan perbaiki bug berikut: "${issue}".\nLangkah wajib:\n1. Cari dan baca file terkait.\n2. Lakukan patch perbaikan.\n3. Jalankan 'npm test' via execBash untuk verifikasi.\n4. Jika test lolos, lakukan gitCommitAndPush.`;

      let progressMsg = null;
      if (platform === 'telegram' && ctx?.reply) {
        try {
          progressMsg = await ctx.reply('[AUTONOMOUS FIXER] Memulai investigasi bug...');
        } catch {}
      }

      const onProgress = async (text) => {
        if (progressMsg && ctx?.api && ctx?.chat?.id) {
          try {
            await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id, text, { parse_mode: 'HTML' });
          } catch {}
        }
      };

      try {
        const result = await runOrcaAgent({ task: fixPrompt, mode: 'normal', onProgress });
        let out = `<b>[ PERBAIKAN BUG OTONOM SELESAI ]</b>\n\n`;
        out += `${result.response}`;
        await reply(out);
      } catch (err) {
        logger.error('Error saat /fix:', err.message);
        await reply(`[!] Gagal menjalankan perbaikan bug: ${err.message}`);
      }
    },
  });

  // 4. Command: Mode Switcher (/mode)
  registerCommand({
    name: 'mode',
    aliases: ['agentmode', 'setmode'],
    category: 'programming',
    description: 'Ganti mode kerja Orca Agent (normal / vibecode)',
    usage: '/mode [normal | vibecode]',
    async execute({ args, reply, ctx, sender, platform, config }) {
      if (!isAuthorizedOwner({ ctx, sender, config, platform })) {
        return reply('[!] Akses ditolak. Pengaturan mode hanya untuk Owner.');
      }

      const target = args[0]?.toLowerCase();
      if (target === 'vibecode' || target === 'vibe') {
        setAgentMode('vibecode');
        return reply('[MODE BERHASIL DIUBAH]\n\nMode Orca sekarang: <b>VIBECODE</b>\nGaya coding cepat, santai, intuitif, dan hacker style.');
      }

      if (target === 'normal') {
        setAgentMode('normal');
        return reply('[MODE BERHASIL DIUBAH]\n\nMode Orca sekarang: <b>NORMAL</b>\nGaya coding teliti, sistematis, evidence-based, dan selalu menjalankan test.');
      }

      const current = getAgentMode();
      return reply(`[STATUS MODE ORCA]\n\nMode saat ini: <b>${current.toUpperCase()}</b>\n\nUntuk mengganti mode:\n• <code>/mode vibecode</code>\n• <code>/mode normal</code>`);
    },
  });

  // 5. Command: Terminal Shell Direct Execution (/sh)
  registerCommand({
    name: 'sh',
    aliases: ['bash', 'terminal', 'cmd'],
    category: 'programming',
    description: 'Menjalankan command shell terminal langsung di server (Owner Only)',
    usage: '/sh <perintah shell>',
    async execute({ fullText, reply, ctx, sender, platform, config }) {
      if (!isAuthorizedOwner({ ctx, sender, config, platform })) {
        return reply('[!] Akses ditolak. Akses shell terminal khusus Owner bot.');
      }

      const cmd = fullText?.trim();
      if (!cmd) {
        return reply('[TERMINAL SHELL]\n\nMasukkan perintah yang ingin dijalankan di server.\nContoh: <code>/sh git status</code> atau <code>/sh npm test</code>');
      }

      try {
        const out = await orcaTools.execBash({ command: cmd });
        await reply(`<code>[SHELL: ${cmd}]</code>\n\n<pre>${out}</pre>`);
      } catch (err) {
        await reply(`[!] Shell Error: ${err.message}`);
      }
    },
  });
}
