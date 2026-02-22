require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  Events,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const Database = require('better-sqlite3');

const BOT_OWNER_ID = '1298640383688970293';
const MMINFO_IMAGE = 'https://i.postimg.cc/kXLx2GQV/image-34.png';

const db = new Database('database.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    middleman_role_id TEXT,
    staff_role_id TEXT,
    log_channel_id TEXT,
    main_category_id TEXT,
    support_category_id TEXT,
    slave_role_id TEXT
  );
  
  CREATE TABLE IF NOT EXISTS tickets (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT,
    creator_id TEXT,
    claimed_by TEXT,
    other_user_id TEXT,
    description TEXT,
    can_join_ps TEXT,
    ticket_type TEXT DEFAULT 'main',
    created_at INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS ticket_users (
    channel_id TEXT,
    user_id TEXT,
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS mercy_clicks (
    user_id TEXT PRIMARY KEY,
    clicked TEXT,
    joined INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS fee_selections (
    channel_id TEXT PRIMARY KEY,
    selected TEXT,
    clicked_by TEXT
  );

  CREATE TABLE IF NOT EXISTS confirm_deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT,
    user_id TEXT,
    confirmed TEXT,
    UNIQUE(channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS vouch_counts (
    user_id TEXT PRIMARY KEY,
    amount INTEGER DEFAULT 0,
    last_updated INTEGER
  );

  CREATE TABLE IF NOT EXISTS mminfo_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT,
    user_id TEXT,
    understood TEXT,
    UNIQUE(channel_id, user_id)
  );
`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

function getSettings(guildId) {
  return db.prepare('SELECT * FROM settings WHERE guild_id = ?').get(guildId);
}

function setSetting(guildId, key, value) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE guild_id = ?').get(guildId);
  if (exists) {
    db.prepare(`UPDATE settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
  } else {
    db.prepare(`INSERT INTO settings (guild_id, ${key}) VALUES (?, ?)`).run(guildId, value);
  }
}

function createTicket(channelId, guildId, creatorId, otherUserId, description, canJoinPs, type = 'main') {
  db.prepare(`INSERT INTO tickets (channel_id, guild_id, creator_id, claimed_by, other_user_id, description, can_join_ps, ticket_type, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`).run(channelId, guildId, creatorId, otherUserId, description, canJoinPs, type, Date.now());
}

function getTicket(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function claimTicket(channelId, middlemanId) {
  db.prepare('UPDATE tickets SET claimed_by = ? WHERE channel_id = ?').run(middlemanId, channelId);
}

function unclaimTicket(channelId) {
  db.prepare('UPDATE tickets SET claimed_by = NULL WHERE channel_id = ?').run(channelId);
}

function deleteTicket(channelId) {
  db.prepare('DELETE FROM ticket_users WHERE channel_id = ?').run(channelId);
  db.prepare('DELETE FROM tickets WHERE channel_id = ?').run(channelId);
  db.prepare('DELETE FROM fee_selections WHERE channel_id = ?').run(channelId);
  db.prepare('DELETE FROM confirm_deals WHERE channel_id = ?').run(channelId);
  db.prepare('DELETE FROM mminfo_clicks WHERE channel_id = ?').run(channelId);
}

function addUserToTicket(channelId, userId) {
  try { db.prepare('INSERT INTO ticket_users (channel_id, user_id) VALUES (?, ?)').run(channelId, userId); } catch (e) {}
}

function isMiddleman(member, settings) {
  return settings?.middleman_role_id ? member.roles.cache.has(settings.middleman_role_id) : false;
}

function isStaff(member, settings) {
  return settings?.staff_role_id ? member.roles.cache.has(settings.staff_role_id) : false;
}

function isAuthorized(member, guild) {
  return member.id === BOT_OWNER_ID || member.id === guild.ownerId;
}

function hasClickedMercy(userId) {
  return db.prepare('SELECT 1 FROM mercy_clicks WHERE user_id = ?').get(userId);
}

function setMercyClicked(userId, joined) {
  db.prepare('INSERT OR REPLACE INTO mercy_clicks (user_id, clicked, joined) VALUES (?, ?, ?)').run(userId, 'yes', joined ? 1 : 0);
}

function getFeeSelection(channelId) {
  return db.prepare('SELECT * FROM fee_selections WHERE channel_id = ?').get(channelId);
}

function setFeeSelection(channelId, selected, clickedBy) {
  db.prepare('INSERT OR REPLACE INTO fee_selections (channel_id, selected, clicked_by) VALUES (?, ?, ?)').run(channelId, selected, clickedBy);
}

function getConfirmDeals(channelId) {
  return db.prepare('SELECT * FROM confirm_deals WHERE channel_id = ?').all(channelId);
}

function hasUserConfirmed(channelId, userId) {
  return db.prepare('SELECT 1 FROM confirm_deals WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
}

function setConfirmDeal(channelId, userId, confirmed) {
  db.prepare('INSERT OR IGNORE INTO confirm_deals (channel_id, user_id, confirmed) VALUES (?, ?, ?)').run(channelId, userId, confirmed);
}

function getVouchCount(userId) {
  const result = db.prepare('SELECT amount FROM vouch_counts WHERE user_id = ?').get(userId);
  return result ? result.amount : 0;
}

function setVouchCount(userId, amount) {
  db.prepare('INSERT OR REPLACE INTO vouch_counts (user_id, amount, last_updated) VALUES (?, ?, ?)').run(userId, amount, Date.now());
}

function getMminfoClicks(channelId) {
  return db.prepare('SELECT * FROM mminfo_clicks WHERE channel_id = ?').all(channelId);
}

function hasUserMminfoClicked(channelId, userId) {
  return db.prepare('SELECT 1 FROM mminfo_clicks WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
}

function setMminfoClick(channelId, userId, understood) {
  db.prepare('INSERT OR IGNORE INTO mminfo_clicks (channel_id, user_id, understood) VALUES (?, ?, ?)').run(channelId, userId, understood);
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  const commands = [
    new SlashCommandBuilder().setName('middleman').setDescription('Set middleman role (Owner)').addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('staffrole').setDescription('Set staff role (Owner)').addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('logchannel').setDescription('Set logs channel (Owner)').addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('maincategory').setDescription('Set main category (Owner)').addChannelOption(o => o.setName('category').setDescription('Category').setRequired(true).addChannelTypes(ChannelType.GuildCategory)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('supportcategory').setDescription('Set support category (Owner)').addChannelOption(o => o.setName('category').setDescription('Category').setRequired(true).addChannelTypes(ChannelType.GuildCategory)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('main').setDescription('Send MM panel (Owner)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('schior').setDescription('Send support panel (Owner)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('tos').setDescription('Send TOS (Owner)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('faq').setDescription('Send FAQ (Owner)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('site').setDescription('Get Amz website'),
    new SlashCommandBuilder().setName('trustpilot').setDescription('Get Trustpilot link'),
    new SlashCommandBuilder().setName('slaverole').setDescription('Set mercy/slave role (Owner)').addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ];
  
  await client.application.commands.set(commands);
  console.log('✅ Commands registered');
});

// SLASH COMMANDS
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, guild, member } = interaction;
  const settings = getSettings(guild.id);
  const ownerOnly = ['middleman', 'staffrole', 'logchannel', 'maincategory', 'supportcategory', 'main', 'schior', 'tos', 'faq', 'slaverole'];
  
  if (ownerOnly.includes(commandName) && !isAuthorized(member, guild)) {
    return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
  }
  
  try {
    switch (commandName) {
      case 'middleman':
        setSetting(guild.id, 'middleman_role_id', interaction.options.getRole('role').id);
        return interaction.reply({ content: '✅ Middleman role set.', ephemeral: true });
        
      case 'staffrole':
        setSetting(guild.id, 'staff_role_id', interaction.options.getRole('role').id);
        return interaction.reply({ content: '✅ Staff role set.', ephemeral: true });
        
      case 'logchannel':
        setSetting(guild.id, 'log_channel_id', interaction.options.getChannel('channel').id);
        return interaction.reply({ content: '✅ Log channel set.', ephemeral: true });
        
      case 'maincategory':
        setSetting(guild.id, 'main_category_id', interaction.options.getChannel('category').id);
        return interaction.reply({ content: '✅ Main category set.', ephemeral: true });
        
      case 'supportcategory':
        setSetting(guild.id, 'support_category_id', interaction.options.getChannel('category').id);
        return interaction.reply({ content: '✅ Support category set.', ephemeral: true });
        
      case 'slaverole':
        setSetting(guild.id, 'slave_role_id', interaction.options.getRole('role').id);
        return interaction.reply({ content: '✅ Mercy role set.', ephemeral: true });
        
      case 'main': {
        const embed = new EmbedBuilder()
          .setTitle('Amz Middleman Service')
          .setDescription(`Found a trade and would like to ensure a safe trading experience?\nSee below.\n\n**Trade Details:**\n• Item/Currency from trader 1: eg. *MFR Parrot in ADM*\n• Item/Currency from trader 2: eg. *100$*\n\n**Trade Agreement:**\n• Both parties have agreed to the trade details\n• Ready to proceed using middle man service\n\n**Important Notes:**\n• Both users must agree before submitting\n• Fake/troll tickets will result in consequences\n• Be specific – vague terms are not accepted\n• Follow Discord TOS and server guidelines`)
          .setColor(0x2b2d31);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('request_mm').setLabel('Open a Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Panel sent.', ephemeral: true });
      }
      
      case 'schior': {
        const embed = new EmbedBuilder()
          .setTitle('Welcome to Amz Support/Report')
          .setDescription(`**ToS:**\n• Make sense if making ticket.\n• Dont ping staff.\n• If you got scammed, Gather proofs.\n• Do not come without proof.\n\nHello this is Support/Report, recently got scammed? damn.. make a ticket and we will help!!`)
          .setColor(0xe74c3c);
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticket_selection')
            .setPlaceholder('Select ticket type...')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('Report').setDescription('Report a user').setValue('report').setEmoji('🚨'),
              new StringSelectMenuOptionBuilder().setLabel('Support').setDescription('Get help').setValue('support').setEmoji('🆘')
            )
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Panel sent.', ephemeral: true });
      }
      
      case 'tos': {
        const embed = new EmbedBuilder()
          .setTitle('Amz.gg\nAmz TOS')
          .setDescription("While using our Middleman Services, u must agree to a few things.\n\n• We are not responsible if anything happens in the middle of the deal if its not the Middleman's fault. (i.e. Wrong Crypto Address/Paypal email, wrong gamepass, wrong spelling for roblox username for Lims Trades)\n\n• If one of our MM's goes afk during the middle of a ticket, it means they're busy with IRL things. Don't worry, they'll be back within the next few hours, you'll get pinged when they're there\n\n• We aren't responsible if either side of the trade goes AFK, including the returning of the items to the seller if the buyer is afk & hasn't given their part to the seller.")
          .setColor(0x2b2d31);
        await interaction.channel.send({ embeds: [embed] });
        return interaction.reply({ content: '✅ TOS sent.', ephemeral: true });
      }
      
      case 'faq': {
        const embed = new EmbedBuilder()
          .setTitle('Amz - FAQ')
          .setDescription(`Amz is a platform that provides a secure player-to-player trading experience for buyers and sellers of online gaming products. We provide a system for secure transactions – you do the rest. We have marketplaces for 250+ games and leading titles!`)
          .setColor(0xffd700);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Amz FAQ').setStyle(ButtonStyle.Link).setURL('https://www.amz.gg/faq').setEmoji('🔗'),
          new ButtonBuilder().setLabel('Help Center').setStyle(ButtonStyle.Link).setURL('https://www.amz.gg/help').setEmoji('🔗')
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ FAQ sent.', ephemeral: true });
      }
      
      case 'site': {
        const embed = new EmbedBuilder()
          .setTitle('Amz.gg')
          .setDescription('https://amz.gg/')
          .setColor(0x00b67a);
        await interaction.channel.send({ embeds: [embed] });
        return interaction.reply({ content: '✅ Site sent.', ephemeral: true });
      }
        
      case 'trustpilot': {
        const embed = new EmbedBuilder()
          .setTitle('Amz.gg - Trustpilot')
          .setDescription('Amz is rated "Excellent" with 4.4 / 5 on Trustpilot\nDo you agree with Amz\'s TrustScore? Voice your opinion today and hear what 40,984 customers have already said.')
          .setColor(0x00b67a);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Amz - Trustpilot').setStyle(ButtonStyle.Link).setURL('https://www.trustpilot.com/review/amz.gg').setEmoji('🔗')
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Trustpilot sent.', ephemeral: true });
      }
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: '❌ Error.', ephemeral: true });
  }
});

// SELECT MENUS
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  
  const { customId, values, guild, member } = interaction;
  
  if (customId === 'ticket_selection') {
    const selected = values[0];
    
    if (selected === 'report') {
      const modal = new ModalBuilder()
        .setCustomId('report_modal')
        .setTitle('Report User');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report_who').setLabel('Who are you reporting?').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Username or ID')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report_proof').setLabel('Do you have proofs?').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Yes or No')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report_rules').setLabel('Will you stay and listen to rules?').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Yes or No'))
      );
      return interaction.showModal(modal);
    }
    
    if (selected === 'support') {
      const modal = new ModalBuilder()
        .setCustomId('support_modal_new')
        .setTitle('Support Request');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('support_help').setLabel('What do you need help with?').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('support_desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('support_proof').setLabel('Do you have proofs?').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Yes or No'))
      );
      return interaction.showModal(modal);
    }
  }
});

// BUTTONS
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  const { customId, guild, member, channel } = interaction;
  const settings = getSettings(guild.id);
  
  try {
    if (customId === 'request_mm') {
      const modal = new ModalBuilder()
        .setCustomId('mm_modal')
        .setTitle('Request Middleman');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('other_user').setLabel('User/ID of other person').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('can_join_ps').setLabel('Can both join ps').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Yes or No'))
      );
      return interaction.showModal(modal);
    }
    
    if (customId === 'claim_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Not a ticket.', ephemeral: true });
      
      const canClaim = ticket.ticket_type === 'main' ? isMiddleman(member, settings) : isStaff(member, settings);
      if (!canClaim) return interaction.reply({ content: `❌ Only ${ticket.ticket_type === 'main' ? 'middleman' : 'staff'} can claim.`, ephemeral: true });
      
      if (ticket.claimed_by) {
        const claimer = await guild.members.fetch(ticket.claimed_by).catch(() => null);
        return interaction.reply({ content: `❌ Already claimed by ${claimer ? `<@${claimer.id}>` : 'Unknown'}`, ephemeral: true });
      }
      
      claimTicket(channel.id, member.id);
      
      const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
      const ticketRole = guild.roles.cache.get(roleId);
      if (ticketRole) await channel.permissionOverwrites.edit(ticketRole, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
      await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      
      // Update button to show claimed state - grey/disabled
      const messages = await channel.messages.fetch({ limit: 10 });
      const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket') || m.embeds[0]?.title?.includes('Report Ticket'));
      if (ticketMsg) {
        await ticketMsg.edit({ components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel(`Claimed by ${member.user.username}`).setStyle(ButtonStyle.Secondary).setEmoji('🔒').setDisabled(true),
          new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Danger).setEmoji('🔓'),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
        )] });
      }
      
      await interaction.reply({ content: `✅ Claimed by ${member.user.username}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Claimed').setDescription(`${channel.name} claimed by ${member.user.username}`).setColor(0x00ff00).setTimestamp()] });
      }
    }
    
    if (customId === 'unclaim_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Not a ticket.', ephemeral: true });
      if (!ticket.claimed_by) return interaction.reply({ content: '❌ Not claimed.', ephemeral: true });
      if (ticket.claimed_by !== member.id) return interaction.reply({ content: '❌ Only the claimer can unclaim.', ephemeral: true });
      
      unclaimTicket(channel.id);
      
      const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
      const ticketRole = guild.roles.cache.get(roleId);
      if (ticketRole) await channel.permissionOverwrites.edit(ticketRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await channel.permissionOverwrites.delete(member.id).catch(() => {});
      
      // Reset button to unclaimed state - green
      const messages = await channel.messages.fetch({ limit: 10 });
      const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket') || m.embeds[0]?.title?.includes('Report Ticket'));
      if (ticketMsg) {
        await ticketMsg.edit({ components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
        )] });
      }
      
      return interaction.reply({ content: '✅ Unclaimed.', ephemeral: true });
    }
    
    if (customId === 'close_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Not a ticket.', ephemeral: true });
      
      const canClose = ticket.ticket_type === 'main' ? (isMiddleman(member, settings) || ticket.creator_id === member.id) : (isStaff(member, settings) || ticket.creator_id === member.id);
      if (!canClose && !isAuthorized(member, guild)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      
      await interaction.reply({ content: '🔒 Closing in 5s...', ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Closed').setDescription(`${channel.name} closed by ${member.user.username}`).setColor(0xff0000).setTimestamp()] });
      }
      
      setTimeout(async () => {
        deleteTicket(channel.id);
        await channel.delete().catch(() => {});
      }, 5000);
    }
    
    if (customId === 'add_user') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ Not a ticket.', ephemeral: true });
      
      const isStaffOrMM = ticket.ticket_type === 'main' ? isMiddleman(member, settings) : isStaff(member, settings);
      if (!isStaffOrMM) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
      if (ticket.claimed_by && ticket.claimed_by !== member.id) return interaction.reply({ content: '❌ Only claimer can add.', ephemeral: true });
      
      const modal = new ModalBuilder().setCustomId('add_user_modal').setTitle('Add User');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    // MERCY SYSTEM BUTTONS
    if (customId.startsWith('mercy_join_')) {
      const targetUserId = customId.replace('mercy_join_', '');
      
      if (member.id !== targetUserId) {
        return interaction.reply({ content: '❌ Only the mercied user can click this.', ephemeral: true });
      }
      
      if (hasClickedMercy(member.id)) {
        return interaction.reply({ content: '❌ Already clicked.', ephemeral: true });
      }
      
      setMercyClicked(member.id, true);
      
      if (settings?.slave_role_id) {
        const slaveRole = guild.roles.cache.get(settings.slave_role_id);
        if (slaveRole) {
          await member.roles.add(slaveRole).catch(() => {});
        }
      }
      
      await channel.send(`**Amz's Dark Side** ${member} has accepted his fate and wants to earn much more.\n\n-# credits to schior heh`);
      return interaction.reply({ content: '✅ Welcome to the dark side.', ephemeral: true });
    }
    
    if (customId.startsWith('mercy_no_')) {
      const targetUserId = customId.replace('mercy_no_', '');
      
      if (member.id !== targetUserId) {
        return interaction.reply({ content: '❌ Only the mercied user can click this.', ephemeral: true });
      }
      
      if (hasClickedMercy(member.id)) {
        return interaction.reply({ content: '❌ Already clicked.', ephemeral: true });
      }
      
      setMercyClicked(member.id, false);
      
      await channel.send(`**Amz's Dark Side** ${member} was NOT interessted in Amz, kick that motherfucker bitch.`);
      return interaction.reply({ content: '❌ Rejected.', ephemeral: true });
    }

    // FEE SELECTION BUTTONS
    if (customId.startsWith('fee_50_')) {
      const channelId = customId.replace('fee_50_', '');
      
      const existing = getFeeSelection(channelId);
      if (existing) {
        return interaction.reply({ content: `❌ Already selected: ${existing.selected} by <@${existing.clicked_by}>`, ephemeral: true });
      }
      
      setFeeSelection(channelId, '50/50', member.id);
      await channel.send(`**Fee Selected:** 50/50 split\nSelected by: ${member}`);
      return interaction.reply({ content: '✅ 50/50 selected.', ephemeral: true });
    }
    
    if (customId.startsWith('fee_100_')) {
      const channelId = customId.replace('fee_100_', '');
      
      const existing = getFeeSelection(channelId);
      if (existing) {
        return interaction.reply({ content: `❌ Already selected: ${existing.selected} by <@${existing.clicked_by}>`, ephemeral: true });
      }
      
      setFeeSelection(channelId, '100%', member.id);
      await channel.send(`**Fee Selected:** 100%\nSelected by: ${member}`);
      return interaction.reply({ content: '✅ 100% selected.', ephemeral: true });
    }

    // CONFIRM DEAL BUTTONS - Max 2 people
    if (customId.startsWith('confirm_yes_')) {
      const channelId = customId.replace('confirm_yes_', '');
      
      const deals = getConfirmDeals(channelId);
      if (deals.length >= 2) {
        return interaction.reply({ content: '❌ Maximum 2 people have already confirmed.', ephemeral: true });
      }
      
      if (hasUserConfirmed(channelId, member.id)) {
        return interaction.reply({ content: '❌ You already confirmed.', ephemeral: true });
      }
      
      setConfirmDeal(channelId, member.id, 'confirmed');
      
      const newCount = deals.length + 1;
      await channel.send(`**Deal Confirmed!** ✅ (${newCount}/2)\nConfirmed by: ${member}`);
      
      if (newCount >= 2) {
        await channel.send('✅ **Both parties have confirmed! Deal is locked in.**');
      }
      
      return interaction.reply({ content: '✅ Deal confirmed.', ephemeral: true });
    }
    
    if (customId.startsWith('confirm_no_')) {
      const channelId = customId.replace('confirm_no_', '');
      
      const deals = getConfirmDeals(channelId);
      if (deals.length >= 2) {
        return interaction.reply({ content: '❌ Maximum 2 people have already responded.', ephemeral: true });
      }
      
      if (hasUserConfirmed(channelId, member.id)) {
        return interaction.reply({ content: '❌ You already responded.', ephemeral: true });
      }
      
      setConfirmDeal(channelId, member.id, 'cancelled');
      await channel.send(`**Deal Cancelled!** ❌\nCancelled by: ${member}\n\nThe deal has been cancelled.`);
      return interaction.reply({ content: '❌ Deal cancelled.', ephemeral: true });
    }

    // MMINFO BUTTONS - Max 2 people
    if (customId.startsWith('mminfo_understood_')) {
      const channelId = customId.replace('mminfo_understood_', '');
      
      const clicks = getMminfoClicks(channelId);
      if (clicks.length >= 2) {
        return interaction.reply({ content: '❌ Maximum 2 people have already responded.', ephemeral: true });
      }
      
      if (hasUserMminfoClicked(channelId, member.id)) {
        return interaction.reply({ content: '❌ You already responded.', ephemeral: true });
      }
      
      setMminfoClick(channelId, member.id, 'yes');
      
      const newCount = clicks.length + 1;
      await channel.send(`✅ ${member} understood the MM info (${newCount}/2)`);
      
      if (newCount >= 2) {
        await channel.send('✅ **Both parties understand the process!**');
      }
      
      return interaction.reply({ content: '✅ Marked as understood.', ephemeral: true });
    }
    
    if (customId.startsWith('mminfo_notunderstood_')) {
      const channelId = customId.replace('mminfo_notunderstood_', '');
      
      const clicks = getMminfoClicks(channelId);
      if (clicks.length >= 2) {
        return interaction.reply({ content: '❌ Maximum 2 people have already responded.', ephemeral: true });
      }
      
      if (hasUserMminfoClicked(channelId, member.id)) {
        return interaction.reply({ content: '❌ You already responded.', ephemeral: true });
      }
      
      setMminfoClick(channelId, member.id, 'no');
      
      const newCount = clicks.length + 1;
      await channel.send(`❓ ${member} didn't understand the MM info (${newCount}/2) - Middleman please explain!`);
      
      return interaction.reply({ content: '❓ Middleman will explain further.', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: '❌ Error.', ephemeral: true });
  }
});

// MODALS
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  const { customId, guild, member, fields } = interaction;
  const settings = getSettings(guild.id);
  
  try {
    if (customId === 'mm_modal') {
      const otherUserInput = fields.getTextInputValue('other_user');
      const description = fields.getTextInputValue('description');
      const canJoinPs = fields.getTextInputValue('can_join_ps');
      
      let otherUser = null;
      if (otherUserInput.match(/^\d+$/)) otherUser = await guild.members.fetch(otherUserInput).catch(() => null);
      else otherUser = guild.members.cache.find(m => m.user.username.toLowerCase() === otherUserInput.toLowerCase());
      
      const otherUserId = otherUser ? otherUser.id : otherUserInput;
      const otherUserDisplay = otherUser ? `${otherUser.user.username} (<@${otherUser.id}>)` : otherUserInput;
      
      const category = settings?.main_category_id ? guild.channels.cache.get(settings.main_category_id) : null;
      const channelName = `mm-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      const permissions = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ];
      if (settings?.middleman_role_id) permissions.push({ id: settings.middleman_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      permissions.push({ id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] });
      
      const ticketChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category, permissionOverwrites: permissions });
      createTicket(ticketChannel.id, guild.id, member.id, otherUserId, description, canJoinPs, 'main');
      
      const welcomeEmbed = new EmbedBuilder().setTitle('👑 Welcome to your Ticket! 👑').setDescription(`Hello ${member}, thanks for opening a **Middleman Service Ticket**!\n\nA staff member will assist you shortly. Provide all trade details clearly. Fake/troll tickets will result in consequences.\n\nAmz MM Service • Please wait for a middleman`).setColor(0xffd700);
      const detailsEmbed = new EmbedBuilder().setTitle('📋 Trade Details').addFields(
        { name: 'Trade', value: description || 'N/A' },
        { name: 'Other User', value: otherUserDisplay },
        { name: 'Trade Value', value: 'N/A' },
        { name: 'Can Join PS?', value: canJoinPs || 'N/A' }
      ).setColor(0x2b2d31);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.middleman_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      if (otherUser) await ticketChannel.send({ embeds: [new EmbedBuilder().setTitle('✅ User Found').setDescription(`User <@${otherUser.id}> found.\n\nUse \`.add ${otherUser.user.username}\` or click **Add User**.`).setColor(0x00ff00).setThumbnail(otherUser.user.displayAvatarURL())] });
      
      await interaction.reply({ content: `✅ Created: ${ticketChannel}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Created').setDescription(`Ticket ${ticketChannel} by ${member.user.username}`).addFields({ name: 'Other', value: otherUserDisplay }).setColor(0x00ff00).setTimestamp()] });
      }
    }
    
    if (customId === 'report_modal') {
      const reportWho = fields.getTextInputValue('report_who');
      const hasProof = fields.getTextInputValue('report_proof');
      const willListen = fields.getTextInputValue('report_rules');
      
      const category = settings?.support_category_id ? guild.channels.cache.get(settings.support_category_id) : null;
      const channelName = `report-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      const permissions = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ];
      if (settings?.staff_role_id) permissions.push({ id: settings.staff_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      permissions.push({ id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] });
      
      const ticketChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category, permissionOverwrites: permissions });
      createTicket(ticketChannel.id, guild.id, member.id, null, `Reporting: ${reportWho}`, hasProof, 'report');
      
      const welcomeEmbed = new EmbedBuilder().setTitle('🚨 Report Ticket').setDescription(`Hello ${member}, thanks for opening a **Report Ticket**!\n\nA staff member will assist you shortly.`).setColor(0xe74c3c);
      const detailsEmbed = new EmbedBuilder().setTitle('📋 Report Details').addFields(
        { name: 'Who', value: reportWho },
        { name: 'Proofs?', value: hasProof },
        { name: 'Listen to rules?', value: willListen }
      ).setColor(0x2b2d31);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.staff_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      await interaction.reply({ content: `✅ Created: ${ticketChannel}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🚨 Report').setDescription(`Report by ${member.user.username}\nReporting: ${reportWho}`).setColor(0xe74c3c).setTimestamp()] });
      }
    }
    
    if (customId === 'support_modal_new') {
      const helpWith = fields.getTextInputValue('support_help');
      const description = fields.getTextInputValue('support_desc');
      const hasProof = fields.getTextInputValue('support_proof');
      
      const category = settings?.support_category_id ? guild.channels.cache.get(settings.support_category_id) : null;
      const channelName = `support-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      const permissions = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ];
      if (settings?.staff_role_id) permissions.push({ id: settings.staff_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      permissions.push({ id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] });
      
      const ticketChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category, permissionOverwrites: permissions });
      createTicket(ticketChannel.id, guild.id, member.id, null, description, hasProof, 'support');
      
      const welcomeEmbed = new EmbedBuilder().setTitle('🆘 Support Ticket').setDescription(`Hello ${member}, thanks for contacting support!\n\nA staff member will assist you shortly.`).setColor(0x3498db);
      const detailsEmbed = new EmbedBuilder().setTitle('📋 Support Details').addFields(
        { name: 'Help with', value: helpWith },
        { name: 'Description', value: description },
        { name: 'Proofs?', value: hasProof }
      ).setColor(0x2b2d31);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.staff_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      await interaction.reply({ content: `✅ Created: ${ticketChannel}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🆘 Support').setDescription(`Support by ${member.user.username}\nIssue: ${helpWith}`).setColor(0x3498db).setTimestamp()] });
      }
    }
    
    if (customId === 'add_user_modal') {
      const userInput = fields.getTextInputValue('user_id');
      
      let targetUser = null;
      if (userInput.match(/^\d+$/)) targetUser = await guild.members.fetch(userInput).catch(() => null);
      else {
        const clean = userInput.replace(/[<@!>]/g, '');
        if (clean.match(/^\d+$/)) targetUser = await guild.members.fetch(clean).catch(() => null);
        else targetUser = guild.members.cache.find(m => m.user.username.toLowerCase().includes(userInput.toLowerCase()));
      }
      
      if (!targetUser) return interaction.reply({ content: '❌ Not found.', ephemeral: true });
      
      await interaction.channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      addUserToTicket(interaction.channel.id, targetUser.id);
      
      await interaction.channel.send({ content: `✅ Added ${targetUser}.` });
      return interaction.reply({ content: `✅ Added ${targetUser.user.username}.`, ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: '❌ Error.', ephemeral: true });
  }
});

// MESSAGE COMMANDS
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  
  const settings = getSettings(message.guild.id);
  const ticket = getTicket(message.channel.id);
  
  if (!message.content.startsWith('.')) return;
  
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  const isMM = isMiddleman(message.member, settings);
  const isStaffMember = isStaff(message.member, settings);
  
  // MMINFO COMMAND - Only middleman can use
  if (command === 'mminfo') {
    if (!isMM) {
      return message.reply('❌ Only middleman can use this command.');
    }
    
    const mminfoEmbed = new EmbedBuilder()
      .setTitle('📋 Middleman Process Information')
      .setDescription(`**Welcome to Amz Middleman Service!**

**How It Works:**
1. **Both traders** confirm they understand the process
2. **Seller** sends item/currency to Middleman
3. **Buyer** sends payment to Middleman
4. Middleman verifies both sides received
5. Middleman distributes to respective parties

**Example Trade (SAB - Stand And Bang):**
• **Trader A** has: 1000 SAB Cash
• **Trader B** has: $50 PayPal
• Middleman holds both until confirmed
• Then distributes to complete trade

**Important:**
• Never send directly to other trader
• Always send to Middleman first
• Wait for confirmation before proceeding
• Ask questions if unclear

**Fees:**
• 50/50 Split - Both pay half
• 100% - One side pays all

Please confirm you understand this process:`)
      .setColor(0x3498db)
      .setImage(MMINFO_IMAGE);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mminfo_understood_${message.channel.id}`)
        .setLabel('Understood')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`mminfo_notunderstood_${message.channel.id}`)
        .setLabel('Didn\'t Understand')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❓')
    );
    
    await message.channel.send({ embeds: [mminfoEmbed], components: [row] });
    return;
  }

  // MERCY COMMAND - Only middleman can use
  if (command === 'mercy') {
    if (!isMM) {
      return message.reply('❌ Only middleman can use this command.');
    }
    
    const targetUser = message.mentions.members.first();
    if (!targetUser) return message.reply('❌ Mention a user to mercy.');
    
    const mercyEmbed = new EmbedBuilder()
      .setTitle('**Amz\'s Dark Side**')
      .setDescription(`Hello ${targetUser}, we got unfortunate news, you just got mercied, "what… WDYM" is probably what your thinking, well. We know how you can earn all your mercys back.\n\nNow that you are a mercy.\n• Find a trade.\n• Use our MM Service \n• We mercy him \n• And split 50/50\n\nIf you want you can explore our channels and learn more about mercy.`)
      .setColor(0x000000);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mercy_join_${targetUser.id}`)
        .setLabel('Join us')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`mercy_no_${targetUser.id}`)
        .setLabel('Not interessted')
        .setStyle(ButtonStyle.Danger)
    );
    
    await message.channel.send({ content: `${targetUser}`, embeds: [mercyEmbed], components: [row] });
    return;
  }

  // FEE COMMAND - Only middleman can use
  if (command === 'fee') {
    if (!isMM) {
      return message.reply('❌ Only middleman can use this command.');
    }
    
    const feeEmbed = new EmbedBuilder()
      .setTitle('**Fee Selection**')
      .setDescription('Which % do yall choose?')
      .setColor(0xffd700);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fee_50_${message.channel.id}`)
        .setLabel('50 / 50')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`fee_100_${message.channel.id}`)
        .setLabel('100%')
        .setStyle(ButtonStyle.Danger)
    );
    
    await message.channel.send({ embeds: [feeEmbed], components: [row] });
    return;
  }

  // CONFIRM COMMAND - Only middleman can use
  if (command === 'confirm') {
    if (!isMM) {
      return message.reply('❌ Only middleman can use this command.');
    }
    
    const confirmEmbed = new EmbedBuilder()
      .setTitle('**Confirm the deal**')
      .setDescription('Both traders must confirm to lock in the deal.\n\n**Max 2 confirmations required.**')
      .setColor(0x00ff00);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_yes_${message.channel.id}`)
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`confirm_no_${message.channel.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );
    
    await message.channel.send({ embeds: [confirmEmbed], components: [row] });
    return;
  }

  // VOUCH COMMAND - Only middleman can use
  if (command === 'vouch') {
    if (!isMM) {
      return message.reply('❌ Only middleman can use this command.');
    }
    
    const targetUser = message.mentions.members.first();
    if (!targetUser) return message.reply('❌ Mention a user to vouch.');
    
    const currentVouches = getVouchCount(targetUser.id);
    const newAmount = currentVouches + 1;
    setVouchCount(targetUser.id, newAmount);
    
    const vouchEmbed = new EmbedBuilder()
      .setTitle('✅ Vouch Added')
      .setDescription(`${targetUser} now has **${newAmount}** vouches!`)
      .setColor(0x00ff00)
      .setTimestamp();
    
    await message.channel.send({ embeds: [vouchEmbed] });
    return;
  }

  // VOUCHCONFIG COMMAND - Only middleman can use
  if (command === 'vouchconfig') {
    if (!isMM) {
      return message.reply('❌ Only middleman can use this command.');
    }
    
    const targetUser = message.mentions.members.first();
    if (!targetUser) return message.reply('❌ Mention a user.');
    
    const amount = parseInt(args[1]);
    if (isNaN(amount)) return message.reply('❌ Provide a valid amount.');
    
    setVouchCount(targetUser.id, amount);
    
    const configEmbed = new EmbedBuilder()
      .setTitle('✅ Vouch Count Updated')
      .setDescription(`${targetUser} now has **${amount}** vouches.`)
      .setColor(0x3498db)
      .setTimestamp();
    
    await message.channel.send({ embeds: [configEmbed] });
    return;
  }

  // VOUCHES COMMAND - Anyone can use
  if (command === 'vouches') {
    let targetUser = message.mentions.members.first();
    if (!targetUser) targetUser = message.member;
    
    const amount = getVouchCount(targetUser.id);
    
    const vouchesEmbed = new EmbedBuilder()
      .setTitle(`📋 Vouches for ${targetUser.user.username}`)
      .setDescription(`${targetUser} has **${amount}** vouches.`)
      .setColor(0x3498db)
      .setThumbnail(targetUser.user.displayAvatarURL());
    
    return message.reply({ embeds: [vouchesEmbed] });
  }
  
  if (command === 'help') {
    if (!ticket && !isMM && !isStaffMember) return;
    return message.reply({ embeds: [new EmbedBuilder().setTitle('🎫 Commands').setDescription('**.help** - This\n**.adduser <id>** - Add user\n**.transfer <id>** - Transfer\n**.close** - Close\n**.claim** - Claim\n**.unclaim** - Unclaim\n**.mminfo** - MM process info\n**.mercy @user** - Mercy system\n**.fee** - Fee selection\n**.confirm** - Confirm deal\n**.vouch @user** - Add vouch\n**.vouchconfig @user (amount)** - Set vouch count\n**.vouches [@user]** - View vouches').setColor(0x2b2d31)] });
  }
  
  if (!ticket) return;
  
  const isCreator = ticket.creator_id === message.author.id;
  const isClaimed = !!ticket.claimed_by;
  const isClaimer = ticket.claimed_by === message.author.id;
  const canManage = ticket.ticket_type === 'main' ? isMM : isStaffMember;
  
  if (command === 'adduser' || command === 'add') {
    if (!canManage) return message.reply('❌ No permission.');
    if (isClaimed && !isClaimer) return message.reply('❌ Only claimer can add.');
    
    const userInput = args[0];
    if (!userInput) return message.reply('❌ Provide user.');
    
    let targetUser = null;
    if (userInput.match(/^\d+$/)) targetUser = await message.guild.members.fetch(userInput).catch(() => null);
    else {
      const clean = userInput.replace(/[<@!>]/g, '');
      if (clean.match(/^\d+$/)) targetUser = await message.guild.members.fetch(clean).catch(() => null);
      else targetUser = message.guild.members.cache.find(m => m.user.username.toLowerCase().includes(userInput.toLowerCase()));
    }
    
    if (!targetUser) return message.reply('❌ Not found.');
    await message.channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    addUserToTicket(message.channel.id, targetUser.id);
    return message.reply(`✅ Added ${targetUser}.`);
  }
  
  if (command === 'transfer') {
    if (!canManage) return message.reply('❌ No permission.');
    if (isClaimed && !isClaimer) return message.reply('❌ Only claimer can transfer.');
    
    const userInput = args[0];
    if (!userInput) return message.reply('❌ Provide user.');
    
    let targetUser = null;
    if (userInput.match(/^\d+$/)) targetUser = await message.guild.members.fetch(userInput).catch(() => null);
    else {
      const clean = userInput.replace(/[<@!>]/g, '');
      targetUser = await message.guild.members.fetch(clean).catch(() => null);
    }
    
    if (!targetUser) return message.reply('❌ Not found.');
    
    const targetCanManage = ticket.ticket_type === 'main' ? isMiddleman(targetUser, settings) : isStaff(targetUser, settings);
    if (!targetCanManage) return message.reply('❌ Not staff.');
    if (targetUser.id === message.author.id) return message.reply('❌ Cant transfer to self.');
    
    claimTicket(message.channel.id, targetUser.id);
    
    if (isClaimed) await message.channel.permissionOverwrites.edit(message.author.id, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
    await message.channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    
    const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
    const ticketRole = message.guild.roles.cache.get(roleId);
    if (ticketRole) await message.channel.permissionOverwrites.edit(ticketRole, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
    
    await message.reply(`✅ Transferred to ${targetUser}. You cannot type now.`);
    
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket') || m.embeds[0]?.title?.includes('Report Ticket'));
    if (ticketMsg) {
      await ticketMsg.edit({ components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel(`Claimed by ${targetUser.user.username}`).setStyle(ButtonStyle.Secondary).setEmoji('🔒').setDisabled(true),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Danger).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      )] });
    }
  }
  
  if (command === 'close') {
    const canClose = ticket.ticket_type === 'main' ? (isMM || isCreator) : (isStaffMember || isCreator);
    if (!canClose && !isAuthorized(message.member, message.guild)) return message.reply('❌ No permission.');
    
    await message.reply('🔒 Closing in 5s...');
    
    if (settings?.log_channel_id) {
      const logChannel = message.guild.channels.cache.get(settings.log_channel_id);
      if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Closed').setDescription(`${message.channel.name} closed by ${message.author.username}`).setColor(0xff0000).setTimestamp()] });
    }
    
    setTimeout(async () => {
      deleteTicket(message.channel.id);
      await message.channel.delete().catch(() => {});
    }, 5000);
  }
  
  if (command === 'claim') {
    if (!canManage) return message.reply('❌ No permission.');
    if (isClaimed) return message.reply(`❌ Claimed by <@${ticket.claimed_by}>`);
    
    claimTicket(message.channel.id, message.author.id);
    
    const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
    const ticketRole = message.guild.roles.cache.get(roleId);
    if (ticketRole) await message.channel.permissionOverwrites.edit(ticketRole, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
    await message.channel.permissionOverwrites.edit(message.author.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    
    // Update button to show claimed state - grey/disabled
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket') || m.embeds[0]?.title?.includes('Report Ticket'));
    if (ticketMsg) {
      await ticketMsg.edit({ components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel(`Claimed by ${message.author.username}`).setStyle(ButtonStyle.Secondary).setEmoji('🔒').setDisabled(true),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Danger).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      )] });
    }
    
    message.reply('✅ Claimed.');
  }
  
  if (command === 'unclaim') {
    if (!canManage) return message.reply('❌ No permission.');
    if (!isClaimed) return message.reply('❌ Not claimed.');
    if (!isClaimer) return message.reply('❌ Only claimer can unclaim.');
    
    unclaimTicket(message.channel.id);
    
    const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
    const ticketRole = message.guild.roles.cache.get(roleId);
    if (ticketRole) await message.channel.permissionOverwrites.edit(ticketRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    await message.channel.permissionOverwrites.delete(message.author.id).catch(() => {});
    
    // Reset button to unclaimed state - green
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket') || m.embeds[0]?.title?.includes('Report Ticket'));
    if (ticketMsg) {
      await ticketMsg.edit({ components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      )] });
    }
    
    message.reply('✅ Unclaimed.');
  }
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Login failed:', err);
  process.exit(1);
});
