require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const express = require('express');

// ========== DATABASE ==========
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

const sessionSchema = new mongoose.Schema({
  userId: String,
  start: Date,
  end: Date
});
sessionSchema.index({ start: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 }); // auto delete after 15 days
const Session = mongoose.model('Session', sessionSchema);

// ========== UTILITIES ==========
const tz = 'Asia/Ho_Chi_Minh';
const nowMs = () => new Date().getTime();
const discordTS = ms => `<t:${Math.floor(ms/1000)}:f>`;
const calcSec = (a, b) => Math.max(0, Math.floor((b - a) / 1000));
const formatDuration = sec => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
};
const sendEmbedTo = async (channelId, embed) => {
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (e) { console.error(e); }
};
const dmUser = async (userId, msg) => {
  try {
    const user = await client.users.fetch(userId);
    if (user) await user.send(msg);
  } catch {}
};

// ========== STATE MEMORY ==========
const activeStreams = new Map();
const recentToggles = new Map();

// ========== DISCORD CLIENT ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ========== ON READY ==========
client.once('ready', async () => {
  console.log(`🤖 Bot đăng nhập: ${client.user.tag}`);
  await sendEmbedTo(process.env.LOG_CHANNEL_ID, new EmbedBuilder()
    .setTitle('✅ **BOT ĐÃ KHỞI ĐỘNG**')
    .setDescription(`Bot đang hoạt động bình thường!\n🕒 ${new Date().toLocaleString('vi-VN', { timeZone: tz })}`)
    .setColor('Green')
    .setTimestamp()
  );
});

// ========== CRON: BẢNG XẾP HẠNG MỖI NGÀY ==========
cron.schedule('0 0 * * *', async () => {
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);

  const sessions = await Session.find({ start: { $gte: startOfDay, $lte: endOfDay } });
  const totals = {};
  sessions.forEach(s => {
    const sec = calcSec(s.start.getTime(), s.end?.getTime() || nowMs());
    totals[s.userId] = (totals[s.userId] || 0) + sec;
  });

  const sorted = Object.entries(totals)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 15);

  if (sorted.length) {
    const e = new EmbedBuilder()
      .setTitle('🏆 **BẢNG XẾP HẠNG STREAM HÔM NAY**')
      .setColor('Gold')
      .setTimestamp();

    sorted.forEach(([uid, sec], i) => {
      e.addFields({ name: `${i+1}. <@${uid}>`, value: `⏱️ ${formatDuration(sec)}`, inline: false });
    });

    await sendEmbedTo(process.env.DAILY_CHANNEL_ID, e);
  }

  console.log('📊 Leaderboard sent, resetting daily tracking.');
}, { timezone: tz });

// ========== VOICE STATE UPDATE ==========
client.on('voiceStateUpdate', async (oldState, newState) => {
  const user = (newState.member && newState.member.user) ? newState.member.user : null;
  if (!user || user.bot) return;

  const wasStreaming = !!oldState.streaming;
  const isStreaming = !!newState.streaming;
  const now = nowMs();

  const oldInVC = !!oldState.channelId;
  const newInVC = !!newState.channelId;

  // ===== 1️⃣ BẮT ĐẦU STREAM =====
  if (!wasStreaming && isStreaming) {
    activeStreams.set(user.id, { startMs: now });

    // theo dõi toggle để phát hiện bật/tắt liên tục
    const arr = (recentToggles.get(user.id) || []);
    arr.push(now);
    const pruned = arr.filter(t => now - t <= 5 * 60 * 1000);
    recentToggles.set(user.id, pruned);

    if (pruned.length >= 3 && pruned.length <= 5) {
      const e = new EmbedBuilder()
        .setTitle('⚠️ **CẢNH BÁO: BẬT/TẮT STREAM NHIỀU LẦN**')
        .setDescription(`<@${user.id}> bật/tắt stream **${pruned.length} lần** trong **5 phút**.`)
        .setColor('Orange')
        .setTimestamp();
      await sendEmbedTo(process.env.ADMIN_CHANNEL_ID, e);
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
    await sendEmbedTo(process.env.LOG_CHANNEL_ID, startEmbed);
  }

  // ===== 2️⃣ KẾT THÚC STREAM (kể cả rời kênh) =====
  const disconnectedWhileStreaming = wasStreaming && !newInVC;
  if ((wasStreaming && !isStreaming) || disconnectedWhileStreaming) {
    const active = activeStreams.get(user.id);
    if (!active) return;

    const startMs = active.startMs;
    const endMs = now;
    const durSec = calcSec(startMs, endMs);
    const durStr = formatDuration(durSec);

    await Session.create({ userId: user.id, start: new Date(startMs), end: new Date(endMs) });
    activeStreams.delete(user.id);

    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const todaySessions = await Session.find({ userId: user.id, start: { $gte: startOfDay } });
    const totalTodaySec = todaySessions.reduce((acc, s) => acc + calcSec(s.start.getTime(), s.end?.getTime() || now), 0);
    const totalTodayStr = formatDuration(totalTodaySec);

    const endEmbed = new EmbedBuilder()
      .setTitle('🔴 **KẾT THÚC STREAM**')
      .setDescription(
        `👤 **Người dùng:** <@${user.id}>\n` +
        `🟩 **Bắt đầu:** ${discordTS(startMs)}\n` +
        `🔴 **Kết thúc:** ${discordTS(endMs)}\n` +
        `⏱️ **Thời lượng phiên này:** **${durStr}**\n` +
        `📊 **Tổng hôm nay:** **${totalTodayStr}**`
      )
      .setColor('Red')
      .setTimestamp();
    await sendEmbedTo(process.env.LOG_CHANNEL_ID, endEmbed);

    if (durSec < 5 * 60) {
      const warn = new EmbedBuilder()
        .setTitle('⚠️ **CẢNH BÁO STREAM NGẮN (<5 phút)**')
        .setDescription(
          `<@${user.id}> kết thúc stream chỉ **${durStr}**.\n` +
          `🟩 **Bắt đầu:** ${discordTS(startMs)}\n` +
          `🔴 **Kết thúc:** ${discordTS(endMs)}\n` +
          `📊 **Tổng hôm nay:** **${totalTodayStr}**`
        )
        .setColor('Orange')
        .setTimestamp();
      await sendEmbedTo(process.env.ADMIN_CHANNEL_ID, warn);
    }
  }
});

// ========== ADMIN COMMANDS ==========
client.on('messageCreate', async msg => {
  if (msg.author.bot || msg.channel.id !== process.env.COMMAND_CHANNEL_ID) return;

  const [cmd] = msg.content.trim().split(/\s+/);

  if (cmd === '!time' || cmd === '!time3' || cmd === '!time7') {
    const days = cmd === '!time' ? 1 : cmd === '!time3' ? 3 : 7;
    const target = msg.mentions.users.first() || msg.author;
    const embeds = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const sessions = await Session.find({ userId: target.id, start: { $gte: d, $lt: next } });
      if (!sessions.length) continue;

      const total = sessions.reduce((a,s)=>a+calcSec(s.start.getTime(), s.end?.getTime()||nowMs()),0);
      const e = new EmbedBuilder()
        .setTitle(`📅 **${d.toLocaleDateString('vi-VN')}**`)
        .setColor('Blue')
        .setDescription(`Tổng thời gian: **${formatDuration(total)}**`)
        .addFields(
          sessions.map((s,i)=>({
            name:`Phiên #${i+1}`,
            value:`🟩 **Bắt đầu:** ${discordTS(s.start.getTime())}\n🔴 **Kết thúc:** ${discordTS(s.end.getTime())}\n⏱️ **Thời lượng:** ${formatDuration(calcSec(s.start.getTime(), s.end.getTime()))}`,
            inline:false
          }))
        );
      embeds.push(e);
    }

    if (embeds.length === 0) {
      msg.reply({ content: `❌ Không có dữ liệu trong ${days} ngày gần đây cho ${target}.`, flags: MessageFlags.Ephemeral });
    } else {
      for (const e of embeds.reverse()) await msg.channel.send({ embeds: [e] });
    }
  }

  if (cmd === '!top' || cmd === '!top7' || cmd === '!top15') {
    const days = cmd === '!top' ? 1 : cmd === '!top7' ? 7 : 15;

    const since = new Date();
    since.setUTCHours(0 - 7, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const sessions = await Session.find({ start: { $gte: since } });
    const totals = {};
    sessions.forEach(s => {
      const sec = calcSec(s.start.getTime(), s.end?.getTime() || nowMs());
      totals[s.userId] = (totals[s.userId] || 0) + sec;
    });

    const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,15);
    if (!sorted.length)
      return msg.reply({ content: `❌ Không có dữ liệu xếp hạng trong ${days} ngày qua.`, flags: MessageFlags.Ephemeral });

    const e = new EmbedBuilder()
      .setTitle(`🏆 **TOP ${days} NGÀY GẦN ĐÂY**`)
      .setColor('Gold')
      .setTimestamp();

    sorted.forEach(([uid, sec], i) => {
      e.addFields({ name: `${i+1}. <@${uid}>`, value: `⏱️ ${formatDuration(sec)}`, inline: false });
    });

    msg.channel.send({ embeds: [e] });
  }
});

// ========== KEEP-ALIVE SERVER ==========
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Discord đang chạy!'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`🌐 Server online on port ${PORT}`));

// ========== LOGIN ==========
client.login(process.env.DISCORD_TOKEN);
