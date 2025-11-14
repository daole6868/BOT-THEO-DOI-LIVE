// index.js
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder
} = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');

// ====== CONFIG / VALIDATION ======
const REQUIRED_ENVS = [
  'MONGODB_URI',
  'DISCORD_TOKEN',
  'LOG_CHANNEL_ID',
  'ADMIN_CHANNEL_ID',
  'DAILY_CHANNEL_ID',
  'COMMAND_CHANNEL_ID'
];
for (const k of REQUIRED_ENVS) {
  if (!process.env[k]) {
    console.error(`❌ Missing env: ${k}. Please add to .env and restart.`);
    process.exit(1);
  }
}

const tz = 'Asia/Ho_Chi_Minh';
const PORT = process.env.PORT || 10000;

// ====== MONGODB ======
mongoose.connect(process.env.MONGODB_URI, {
  // You may add options here if needed
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  });

// Session schema: auto-delete documents after 15 days (TTL index)
const sessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  start: { type: Date, required: true },
  end: { type: Date, default: null }
});
sessionSchema.index({ start: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 });
const Session = mongoose.model('Session', sessionSchema);

// ====== UTILITIES ======
const nowMs = () => Date.now();
const discordTS = ms => `<t:${Math.floor(ms/1000)}:f>`;
const calcSec = (a, b) => Math.max(0, Math.floor((b - a) / 1000));
const formatDuration = sec => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
};

// Safe send embed to channel id (no crash if fails)
const safeSendEmbed = async (channelId, embed) => {
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch) {
      console.warn('⚠️ Channel not found:', channelId);
      return null;
    }
    if (ch.isTextBased && ch.isTextBased()) {
      return await ch.send({ embeds: [embed] });
    }
    // For older discord.js this check might differ; fallback:
    if (typeof ch.send === 'function') {
      return await ch.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('❌ Error sending embed to', channelId, err);
  }
  return null;
};

// DM user safely (don't throw)
const safeDM = async (userId, content) => {
  try {
    const user = await client.users.fetch(userId);
    if (user) return user.send(content).catch(()=>{});
  } catch (e) { /* ignore */ }
};

// ====== STATE ======
const activeStreams = new Map();     // userId -> { startMs }
const recentToggles = new Map();     // userId -> [timestamps]

// ====== DISCORD CLIENT ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ====== ON READY ======
client.once('ready', async () => {
  console.log(`🤖 Bot đăng nhập: ${client.user.tag}`);
  const startEmbed = new EmbedBuilder()
    .setTitle('✅ **BOT ĐÃ KHỞI ĐỘNG**')
    .setDescription(`Bot đang hoạt động bình thường!\n🕒 ${new Date().toLocaleString('vi-VN', { timeZone: tz })}`)
    .setColor('Green')
    .setTimestamp();
  await safeSendEmbed(process.env.LOG_CHANNEL_ID, startEmbed);
});

// ====== DAILY LEADERBOARD (cron at 00:00 server time) ======
cron.schedule('0 0 * * *', async () => {
  try {
    // compute local start and end of today (server local time)
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23,59,59,999);

    const sessions = await Session.find({ start: { $gte: startOfDay, $lte: endOfDay } }).lean();
    const totals = {};
    sessions.forEach(s => {
      const startMs = s.start ? s.start.getTime() : nowMs();
      const endMs = s.end ? s.end.getTime() : nowMs();
      const sec = calcSec(startMs, endMs);
      totals[s.userId] = (totals[s.userId] || 0) + sec;
    });

    const sorted = Object.entries(totals)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 15);

    if (sorted.length) {
      const e = new EmbedBuilder()
        .setTitle('🏆 **BẢNG XẾP HẠNG STREAM HÔM NAY**')
        .setColor('Gold')
        .setTimestamp();

      sorted.forEach(([uid, sec], i) => {
        e.addFields({ name: `${i+1}. <@${uid}>`, value: `⏱️ ${formatDuration(sec)}`, inline: false });
      });

      await safeSendEmbed(process.env.DAILY_CHANNEL_ID, e);
    }

    console.log('📊 Leaderboard cron finished.');
  } catch (err) {
    console.error('❌ Error in daily leaderboard cron:', err);
  }
}, { timezone: tz });

// ====== VOICE STATE HANDLING ======
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    if (!member) return;
    const user = member.user;
    if (!user || user.bot) return;

    const wasStreaming = !!(oldState && oldState.streaming);
    const isStreaming = !!(newState && newState.streaming);
    const now = nowMs();

    const oldInVC = !!(oldState && oldState.channelId);
    const newInVC = !!(newState && newState.channelId);

    // START STREAM
    if (!wasStreaming && isStreaming) {
      activeStreams.set(user.id, { startMs: now });

      // track toggles (only keep last 5 minutes)
      const arr = recentToggles.get(user.id) || [];
      arr.push(now);
      const pruned = arr.filter(t => now - t <= 5 * 60 * 1000);
      recentToggles.set(user.id, pruned);

      if (pruned.length >= 3 && pruned.length <= 10) {
        const warn = new EmbedBuilder()
          .setTitle('⚠️ **CẢNH BÁO: BẬT/TẮT STREAM NHIỀU LẦN**')
          .setDescription(`<@${user.id}> bật/tắt stream **${pruned.length} lần** trong **5 phút**.`)
          .setColor('Orange')
          .setTimestamp();
        safeSendEmbed(process.env.ADMIN_CHANNEL_ID, warn);
      }

      const startEmbed = new EmbedBuilder()
        .setTitle('🟢 **BẮT ĐẦU STREAM**')
        .setDescription(
          `👤 **Người dùng:** <@${user.id}>\n` +
          `🎮 **Kênh:** ${newState.channel?.name || 'Không xác định'}\n` +
          `🕒 **Bắt đầu:** ${discordTS(now)}`
        )
        .setColor('Green')
        .setTimestamp();
      safeSendEmbed(process.env.LOG_CHANNEL_ID, startEmbed);
    }

    // END STREAM OR DISCONNECT WHILE STREAMING
    const disconnectedWhileStreaming = wasStreaming && !newInVC;
    if ((wasStreaming && !isStreaming) || disconnectedWhileStreaming) {
      const active = activeStreams.get(user.id);
      if (!active) return;

      const startMs = active.startMs;
      const endMs = now;
      const durSec = calcSec(startMs, endMs);
      const durStr = formatDuration(durSec);

      // persist session safely
      try {
        await Session.create({ userId: user.id, start: new Date(startMs), end: new Date(endMs) });
      } catch (dbErr) {
        console.error('❌ Error saving session to DB:', dbErr);
      }

      activeStreams.delete(user.id);

      // compute total today safely
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      const todaySessions = await Session.find({ userId: user.id, start: { $gte: startOfDay } }).lean();
      const totalTodaySec = todaySessions.reduce((acc, s) => {
        const sStart = s.start ? s.start.getTime() : startMs;
        const sEnd = s.end ? s.end.getTime() : endMs;
        return acc + calcSec(sStart, sEnd);
      }, 0);
      const totalTodayStr = formatDuration(totalTodaySec);

      const endEmbed = new EmbedBuilder()
        .setTitle('🔴 **KẾT THÚC STREAM**')
        .setDescription(
          `👤 **Người dùng:** <@${user.id}>\n` +
          `🟩 **Bắt đầu:** ${discordTS(startMs)}\n` +
          `🔴 **Kết thúc:** ${discordTS(endMs)}\n` +
          `⏱️ **Phiên này:** **${durStr}**\n` +
          `📊 **Tổng hôm nay:** **${totalTodayStr}**`
        )
        .setColor('Red')
        .setTimestamp();
      safeSendEmbed(process.env.LOG_CHANNEL_ID, endEmbed);

      if (durSec < 5 * 60) {
        const shortWarn = new EmbedBuilder()
          .setTitle('⚠️ **CẢNH BÁO STREAM NGẮN (<5 phút)**')
          .setDescription(
            `<@${user.id}> kết thúc stream chỉ **${durStr}**.\n` +
            `🟩 **Bắt đầu:** ${discordTS(startMs)}\n` +
            `🔴 **Kết thúc:** ${discordTS(endMs)}\n` +
            `📊 **Tổng hôm nay:** **${totalTodayStr}**`
          )
          .setColor('Orange')
          .setTimestamp();
        safeSendEmbed(process.env.ADMIN_CHANNEL_ID, shortWarn);
      }
    }

  } catch (err) {
    console.error('❌ Error in voiceStateUpdate:', err);
  }
});

// ====== ADMIN COMMANDS (messageCreate) ======
client.on('messageCreate', async msg => {
  try {
    if (msg.author.bot || msg.channel.id !== process.env.COMMAND_CHANNEL_ID) return;

    const [cmd] = msg.content.trim().split(/\s+/);

    // Helper: ephemeral-like reply (reply then delete after 12s)
    const ephemeralReply = async (message, ttlMs = 12_000) => {
      try {
        const r = await msg.reply({ content: message, allowedMentions: { repliedUser: false } });
        setTimeout(() => {
          r.delete().catch(()=>{});
        }, ttlMs);
      } catch (e) {
        // fallback: send normal message
        msg.channel.send({ content: message }).catch(()=>{});
      }
    };

    if (cmd === '!time' || cmd === '!time3' || cmd === '!time7') {
      const days = cmd === '!time' ? 1 : cmd === '!time3' ? 3 : 7;
      const target = msg.mentions.users.first() || msg.author;
      const embeds = [];

      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() - i);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);

        const sessions = await Session.find({ userId: target.id, start: { $gte: d, $lt: next } }).lean();
        if (!sessions.length) continue;

        const total = sessions.reduce((a,s)=>a+calcSec(s.start.getTime(), s.end?.getTime()||nowMs()),0);
        const e = new EmbedBuilder()
          .setTitle(`📅 **${d.toLocaleDateString('vi-VN')}**`)
          .setColor('Blue')
          .setDescription(`Tổng thời gian: **${formatDuration(total)}**`)
          .addFields(
            sessions.map((s,i)=>({
              name:`Phiên #${i+1}`,
              value:`🟩 **Bắt đầu:** ${discordTS(s.start.getTime())}\n🔴 **Kết thúc:** ${s.end ? discordTS(s.end.getTime()) : 'Đang diễn ra'}\n⏱️ **Thời lượng:** ${formatDuration(calcSec(s.start.getTime(), s.end ? s.end.getTime() : nowMs()))}`,
              inline:false
            }))
          );
        embeds.push(e);
      }

      if (embeds.length === 0) {
        return ephemeralReply(`❌ Không có dữ liệu trong ${days} ngày gần đây cho ${target}.`);
      } else {
        // send embeds (reverse so oldest first)
        for (const e of embeds.reverse()) {
          await msg.channel.send({ embeds: [e] }).catch(()=>{});
        }
      }
    }

    if (cmd === '!top' || cmd === '!top7' || cmd === '!top15') {
      const days = cmd === '!top' ? 1 : cmd === '!top7' ? 7 : 15;

      const since = new Date();
      since.setHours(0,0,0,0);
      since.setDate(since.getDate() - (days - 1));

      const sessions = await Session.find({ start: { $gte: since } }).lean();
      const totals = {};
      sessions.forEach(s => {
        const sec = calcSec(s.start.getTime(), s.end?.getTime() || nowMs());
        totals[s.userId] = (totals[s.userId] || 0) + sec;
      });

      const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,15);
      if (!sorted.length) {
        return msg.reply({ content: `❌ Không có dữ liệu xếp hạng trong ${days} ngày qua.`, allowedMentions: { repliedUser: false } });
      }

      const e = new EmbedBuilder()
        .setTitle(`🏆 **TOP ${days} NGÀY GẦN ĐÂY**`)
        .setColor('Gold')
        .setTimestamp();

      sorted.forEach(([uid, sec], i) => {
        e.addFields({ name: `${i+1}. <@${uid}>`, value: `⏱️ ${formatDuration(sec)}`, inline: false });
      });

      msg.channel.send({ embeds: [e] }).catch(()=>{});
    }

  } catch (err) {
    console.error('❌ Error handling messageCreate:', err);
  }
});

// ====== EXPRESS KEEP-ALIVE ======
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Discord đang chạy!'));
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.listen(PORT, ()=>console.log(`🌐 Server online on port ${PORT}`));

// ====== GLOBAL ERROR HANDLERS ======
client.on('error', (err) => console.error('Discord client error:', err));
client.on('shardError', err => console.error('Shard error:', err));
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception thrown:', err);
  // optionally exit process or attempt graceful shutdown
});

// ====== LOGIN ======
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Discord login failed:', err);
  process.exit(1);
});
