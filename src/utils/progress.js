/**
 * 8-Bit Retro ASCII Loading Bar & Progress Tracker
 * Format tampilan bersih tanpa emoji, terinspirasi gaya arcade/terminal klasik
 */

export function render8BitBar(percent, statusLabel = 'DOWNLOADING', title = 'DOWNLOAD') {
  const totalBlocks = 12;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filledBlocks = Math.round((clamped / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  const bar = '▓'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

  let out = `<b>[ 8-BIT ${title.toUpperCase()} PROGRESS ]</b>\n\n`;
  out += `<code>[${bar}] ${clamped}%</code>\n`;
  out += `STATUS: <code>[${statusLabel}]</code>\n`;
  out += `<i>Media sedang diproses, mohon tunggu...</i>`;
  return out;
}

export async function create8BitProgressTracker({ ctx, reply, title = 'MEDIA' }) {
  let progressMsg = null;
  let currentPercent = 15;
  const stages = [
    { p: 20, label: 'CONNECTING' },
    { p: 40, label: 'FETCHING' },
    { p: 65, label: 'PROCESSING' },
    { p: 85, label: 'ENCODING' },
  ];
  let stageIdx = 0;

  const initialText = render8BitBar(15, 'STARTING', title);

  // Kirim pesan progress awal
  if (ctx?.reply) {
    try {
      progressMsg = await ctx.reply(initialText, { parse_mode: 'HTML' });
    } catch {}
  } else if (reply) {
    try {
      await reply(initialText.replace(/<[^>]*>/g, ''));
    } catch {}
  }

  // Interval timer animasi progress 8-bit
  const interval = setInterval(async () => {
    if (stageIdx < stages.length) {
      const stage = stages[stageIdx];
      currentPercent = stage.p;
      stageIdx++;

      if (progressMsg && ctx?.api && ctx?.chat?.id) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            render8BitBar(currentPercent, stage.label, title),
            { parse_mode: 'HTML' }
          );
        } catch {}
      }
    }
  }, 850);

  return {
    async finish(successLabel = 'COMPLETED') {
      clearInterval(interval);
      if (progressMsg && ctx?.api && ctx?.chat?.id) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            render8BitBar(100, successLabel, title),
            { parse_mode: 'HTML' }
          );
        } catch {}
      }
    },
    async fail(errMessage) {
      clearInterval(interval);
      if (progressMsg && ctx?.api && ctx?.chat?.id) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `<b>[ 8-BIT ${title.toUpperCase()} PROGRESS ]</b>\n\n<code>[FAILED]</code>\n<i>${errMessage}</i>`,
            { parse_mode: 'HTML' }
          );
        } catch {}
      }
    },
    async delete() {
      clearInterval(interval);
      if (progressMsg && ctx?.api && ctx?.chat?.id) {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id);
        } catch {}
      }
    },
  };
}
