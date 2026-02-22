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
  StringSelectMenuOptionBuilder,
  PermissionsBitField
} = require('discord.js');
const Database = require('better-sqlite3');

// BOT OWNER ID - Can use all commands
const BOT_OWNER_ID = '1410632195210481664';

// BANNER IMAGE
const BANNER_IMAGE = 'https://i.postimg.cc/rmNhJMw9/10d8aff99fc9a6a3878c3333114b5752.png';

// Initialize Database
const db = new Database('database.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    middleman_role_id TEXT,
    staff_role_id TEXT,
    log_channel_id TEXT,
    main_category_id TEXT,
    support_category_id TEXT
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
`);

// Initialize Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Helper Functions
function getSettings(guildId) {
  return db.prepare('SELECT * FROM settings WHERE guild_id = ?').get(guildId);
}

function setMiddlemanRole(guildId, roleId) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE guild_id = ?').get(guildId);
  if (exists) {
    db.prepare('UPDATE settings SET middleman_role_id = ? WHERE guild_id = ?').run(roleId, guildId);
  } else {
    db.prepare('INSERT INTO settings (guild_id, middleman_role_id) VALUES (?, ?)').run(guildId, roleId);
  }
}

function setStaffRole(guildId, roleId) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE guild_id = ?').get(guildId);
  if (exists) {
    db.prepare('UPDATE settings SET staff_role_id = ? WHERE guild_id = ?').run(roleId, guildId);
  } else {
    db.prepare('INSERT INTO settings (guild_id, staff_role_id) VALUES (?, ?)').run(guildId, roleId);
  }
}

function setLogChannel(guildId, channelId) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE guild_id = ?').get(guildId);
  if (exists) {
    db.prepare('UPDATE settings SET log_channel_id = ? WHERE guild_id = ?').run(channelId, guildId);
  } else {
    db.prepare('INSERT INTO settings (guild_id, log_channel_id) VALUES (?, ?)').run(guildId, channelId);
  }
}

function setMainCategory(guildId, categoryId) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE guild_id = ?').get(guildId);
  if (exists) {
    db.prepare('UPDATE settings SET main_category_id = ? WHERE guild_id = ?').run(categoryId, guildId);
  } else {
    db.prepare('INSERT INTO settings (guild_id, main_category_id) VALUES (?, ?)').run(guildId, categoryId);
  }
}

function setSupportCategory(guildId, categoryId) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE guild_id = ?').get(guildId);
  if (exists) {
    db.prepare('UPDATE settings SET support_category_id = ? WHERE guild_id = ?').run(categoryId, guildId);
  } else {
    db.prepare('INSERT INTO settings (guild_id, support_category_id) VALUES (?, ?)').run(guildId, categoryId);
  }
}

function createTicket(channelId, guildId, creatorId, otherUserId, description, canJoinPs, type = 'main') {
  db.prepare(`
    INSERT INTO tickets (channel_id, guild_id, creator_id, claimed_by, other_user_id, description, can_join_ps, ticket_type, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `).run(channelId, guildId, creatorId, otherUserId, description, canJoinPs, type, Date.now());
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
}

function addUserToTicket(channelId, userId) {
  try {
    db.prepare('INSERT INTO ticket_users (channel_id, user_id) VALUES (?, ?)').run(channelId, userId);
  } catch (e) {}
}

function getTicketUsers(channelId) {
  return db.prepare('SELECT user_id FROM ticket_users WHERE channel_id = ?').all(channelId).map(r => r.user_id);
}

function isMiddleman(member, settings) {
  if (!settings?.middleman_role_id) return false;
  return member.roles.cache.has(settings.middleman_role_id);
}

function isStaff(member, settings) {
  if (!settings?.staff_role_id) return false;
  return member.roles.cache.has(settings.staff_role_id);
}

function isAuthorized(member, guild) {
  if (member.id === BOT_OWNER_ID) return true;
  if (member.id === guild.ownerId) return true;
  return false;
}

// Bot Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  const commands = [
    new SlashCommandBuilder()
      .setName('middleman')
      .setDescription('Set the middleman role (Owner only)')
      .addRoleOption(opt => opt.setName('role').setDescription('Middleman role').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('staffrole')
      .setDescription('Set the staff role for support/report tickets (Owner only)')
      .addRoleOption(opt => opt.setName('role').setDescription('Staff role').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('logchannel')
      .setDescription('Set the logs channel (Owner only)')
      .addChannelOption(opt => opt.setName('channel').setDescription('Logs channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('maincategory')
      .setDescription('Set category for /main tickets (Owner only)')
      .addChannelOption(opt => opt.setName('category').setDescription('Category for main tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('supportcategory')
      .setDescription('Set category for support/report tickets (Owner only)')
      .addChannelOption(opt => opt.setName('category').setDescription('Category for support tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('main')
      .setDescription('Send the main middleman panel (Owner only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('schior')
      .setDescription('Send support/report panel (Owner only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('tos')
      .setDescription('Send Terms of Service embed (Owner only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('faq')
      .setDescription('Send FAQ embed (Owner only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ];
  
  try {
    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

// Slash Command Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, guild, member } = interaction;
  const settings = getSettings(guild.id);
  
  if (!isAuthorized(member, guild)) {
    return interaction.reply({ content: '❌ Only server owner or bot owner can use this command.', ephemeral: true });
  }
  
  try {
    switch (commandName) {
      case 'middleman': {
        const role = interaction.options.getRole('role');
        setMiddlemanRole(guild.id, role.id);
        await interaction.reply({ content: `✅ Middleman role set to ${role}`, ephemeral: true });
        break;
      }
      
      case 'staffrole': {
        const role = interaction.options.getRole('role');
        setStaffRole(guild.id, role.id);
        await interaction.reply({ content: `✅ Staff role set to ${role}`, ephemeral: true });
        break;
      }
      
      case 'logchannel': {
        const channel = interaction.options.getChannel('channel');
        setLogChannel(guild.id, channel.id);
        await interaction.reply({ content: `✅ Log channel set to ${channel}`, ephemeral: true });
        break;
      }
      
      case 'maincategory': {
        const category = interaction.options.getChannel('category');
        setMainCategory(guild.id, category.id);
        await interaction.reply({ content: `✅ Main ticket category set to ${category.name}`, ephemeral: true });
        break;
      }
      
      case 'supportcategory': {
        const category = interaction.options.getChannel('category');
        setSupportCategory(guild.id, category.id);
        await interaction.reply({ content: `✅ Support ticket category set to ${category.name}`, ephemeral: true });
        break;
      }
      
      case 'main': {
        const embed = new EmbedBuilder()
          .setTitle('Eldorado Middleman Service')
          .setDescription(`Found a trade and would like to ensure a safe trading experience?
See below.

**Trade Details:**
• Item/Currency from trader 1: eg. *MFR Parrot in ADM*
• Item/Currency from trader 2: eg. *100$*

**Trade Agreement:**
• Both parties have agreed to the trade details
• Ready to proceed using middle man service

**Important Notes:**
• Both users must agree before submitting
• Fake/troll tickets will result in consequences
• Be specific – vague terms are not accepted
• Follow Discord TOS and server guidelines`)
          .setColor(0x2b2d31)
          .setImage(BANNER_IMAGE);
          
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('request_mm')
            .setLabel('Open a Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Main panel sent!', ephemeral: true });
        break;
      }
      
      case 'schior': {
        const embed = new EmbedBuilder()
          .setTitle('Welcome to Eldorado Support/Report')
          .setDescription(`**ToS:**
• Make sense if making ticket.
• Dont ping staff.
• If you got scammed, Gather proofs.
• Do not come without proof.

Hello this is Support/Report, recently got scammed? damn.. make a ticket and we will help!!`)
          .setColor(0xe74c3c)
          .setImage(BANNER_IMAGE);
          
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticket_selection')
            .setPlaceholder('Select ticket type...')
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel('Report')
                .setDescription('Report a user or issue')
                .setValue('report')
                .setEmoji('🚨'),
              new StringSelectMenuOptionBuilder()
                .setLabel('Support')
                .setDescription('Get help with something')
                .setValue('support')
                .setEmoji('🆘')
            )
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Support/Report panel sent!', ephemeral: true });
        break;
      }
      
      case 'tos': {
        const embed = new EmbedBuilder()
          .setTitle('Eldorado.gg\nEldorado TOS')
          .setDescription(`While using our Middleman Services, u must agree to a few things.

• We are not responsible if anything happens in the middle of the deal if its not the Middleman's fault. (i.e. Wrong Crypto Address/Paypal email, wrong gamepass, wrong spelling for roblox usernamed for Lims Trades)

• If one of our MM's goes afk during the middle of a ticket, it means they're busy with IRL things. Don't worry, they'll be back within the next few hours, you'll get pinged when they're there

• We arent responsible if either side of the trade goes AFK, including the returning of the items to the seller if the buyer is afk & hasn't given their part to the seller.`)
          .setColor(0x2b2d31)
          .setImage(BANNER_IMAGE);
          
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ TOS sent!', ephemeral: true });
        break;
      }
      
      case 'faq': {
        const embed = new EmbedBuilder()
          .setTitle('Eldorado - FAQ')
          .setDescription(`Eldorado is a platform that provides a secure player-to-player trading experience for buyers and sellers of online gaming products. We provide a system for secure transactions – you do the rest. We have marketplaces for 250+ games and leading titles!`)
          .setColor(0xffd700)
          .setImage(BANNER_IMAGE);
          
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Eldorado FAQ')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.eldorado.gg/faq')
            .setEmoji('🔗'),
          new ButtonBuilder()
            .setLabel('Eldorado Help Center')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.eldorado.gg/help')
            .setEmoji('🔗')
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ FAQ sent!', ephemeral: true });
        break;
      }
    }
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
  }
});

// Select Menu Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  
  const { customId, values, guild, member } = interaction;
  
  if (customId === 'ticket_selection') {
    const selected = values[0];
    
    if (selected === 'report') {
      const modal = new ModalBuilder()
        .setCustomId('report_modal')
        .setTitle('Report User');
        
      const whoInput = new TextInputBuilder()
        .setCustomId('report_who')
        .setLabel('Who are you reporting?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Username or ID');
        
      const proofInput = new TextInputBuilder()
        .setCustomId('report_proof')
        .setLabel('Do you have proofs?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Yes or No');
        
      const rulesInput = new TextInputBuilder()
        .setCustomId('report_rules')
        .setLabel('Will you stay and listen to the rules?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Yes or No');
        
      modal.addComponents(
        new ActionRowBuilder().addComponents(whoInput),
        new ActionRowBuilder().addComponents(proofInput),
        new ActionRowBuilder().addComponents(rulesInput)
      );
      
      await interaction.showModal(modal);
    }
    
    else if (selected === 'support') {
      const modal = new ModalBuilder()
        .setCustomId('support_modal_new')
        .setTitle('Support Request');
        
      const helpInput = new TextInputBuilder()
        .setCustomId('support_help')
        .setLabel('What do you need help with?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Brief description');
        
      const descInput = new TextInputBuilder()
        .setCustomId('support_desc')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Detailed explanation...');
        
      const proofInput = new TextInputBuilder()
        .setCustomId('support_proof')
        .setLabel('Do you have proofs?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Yes or No');
        
      modal.addComponents(
        new ActionRowBuilder().addComponents(helpInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(proofInput)
      );
      
      await interaction.showModal(modal);
    }
  }
});

// Button Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  const { customId, guild, member, channel } = interaction;
  const settings = getSettings(guild.id);
  
  try {
    if (customId === 'request_mm') {
      const modal = new ModalBuilder()
        .setCustomId('mm_modal')
        .setTitle('Request Middleman');
        
      const userInput = new TextInputBuilder()
        .setCustomId('other_user')
        .setLabel('User/ID of the other person')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Enter username or ID');
        
      const descInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Describe the trade');
        
      const psInput = new TextInputBuilder()
        .setCustomId('can_join_ps')
        .setLabel('Can both join ps')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Yes or No');
        
      modal.addComponents(
        new ActionRowBuilder().addComponents(userInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(psInput)
      );
      
      await interaction.showModal(modal);
    }
    
    else if (customId === 'claim_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      
      const canClaim = ticket.ticket_type === 'main' ? isMiddleman(member, settings) : isStaff(member, settings);
      if (!canClaim) {
        const roleName = ticket.ticket_type === 'main' ? 'middleman' : 'staff';
        return interaction.reply({ content: `❌ Only ${roleName} can claim tickets.`, ephemeral: true });
      }
      
      if (ticket.claimed_by) {
        const claimer = await guild.members.fetch(ticket.claimed_by).catch(() => null);
        return interaction.reply({ content: `❌ Ticket already claimed by ${claimer ? `<@${claimer.id}>` : 'Unknown'}`, ephemeral: true });
      }
      
      claimTicket(channel.id, member.id);
      
      const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
      const ticketRole = guild.roles.cache.get(roleId);
      
      if (ticketRole) {
        await channel.permissionOverwrites.edit(ticketRole, {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true
        });
      }
      
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      
      const claimEmbed = new EmbedBuilder()
        .setTitle('✅ Ticket Claimed')
        .setDescription(`This ticket has been claimed by ${member}. Other staff can no longer see this ticket.\n\nClaimed by ${member.user.username}`)
        .setColor(0x00ff00);
        
      await channel.send({ embeds: [claimEmbed] });
      
      const messages = await channel.messages.fetch({ limit: 10 });
      const ticketMsg = messages.find(m => 
        m.embeds[0]?.title?.includes('Eldorado Middleman Service') || 
        m.embeds[0]?.title?.includes('Welcome to your Ticket') ||
        m.embeds[0]?.title?.includes('Support Ticket') ||
        m.embeds[0]?.title?.includes('Report Ticket')
      );
      
      if (ticketMsg) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
          new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
        );
        await ticketMsg.edit({ components: [row] });
      }
      
      await interaction.reply({ content: '✅ You have claimed this ticket.', ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🎫 Ticket Claimed')
            .setDescription(`Ticket ${channel.name} was claimed by ${member.user.username}`)
            .setColor(0x00ff00)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
      }
    }
    
    else if (customId === 'unclaim_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      
      if (ticket.claimed_by !== member.id && !isAuthorized(member, guild)) {
        return interaction.reply({ content: '❌ Only the person who claimed this ticket can unclaim it.', ephemeral: true });
      }
      
      if (!ticket.claimed_by) {
        return interaction.reply({ content: '❌ This ticket is not claimed.', ephemeral: true });
      }
      
      unclaimTicket(channel.id);
      
      const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
      const ticketRole = guild.roles.cache.get(roleId);
      
      if (ticketRole) {
        await channel.permissionOverwrites.edit(ticketRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
      }
      
      await channel.permissionOverwrites.delete(member.id).catch(() => {});
      
      await channel.send({ content: `🔓 ${member} has unclaimed this ticket.` });
      
      const messages = await channel.messages.fetch({ limit: 10 });
      const ticketMsg = messages.find(m => 
        m.embeds[0]?.title?.includes('Eldorado Middleman Service') || 
        m.embeds[0]?.title?.includes('Welcome to your Ticket') ||
        m.embeds[0]?.title?.includes('Support Ticket') ||
        m.embeds[0]?.title?.includes('Report Ticket')
      );
      
      if (ticketMsg) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(false),
          new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
        );
        await ticketMsg.edit({ components: [row] });
      }
      
      await interaction.reply({ content: '✅ You have unclaimed this ticket.', ephemeral: true });
    }
    
    else if (customId === 'close_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      
      const canClose = ticket.ticket_type === 'main' ? 
        (isMiddleman(member, settings) || ticket.creator_id === member.id) : 
        (isStaff(member, settings) || ticket.creator_id === member.id);
        
      if (!canClose && !isAuthorized(member, guild)) {
        return interaction.reply({ content: '❌ Only staff or the ticket creator can close.', ephemeral: true });
      }
      
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...', ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setDescription(`Ticket ${channel.name} was closed by ${member.user.username}`)
            .addFields(
              { name: 'Creator', value: `<@${ticket.creator_id}>`, inline: true },
              { name: 'Claimed By', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed', inline: true }
            )
            .setColor(0xff0000)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
      }
      
      setTimeout(async () => {
        deleteTicket(channel.id);
        await channel.delete().catch(() => {});
      }, 5000);
    }
    
    else if (customId === 'add_user') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      
      const isStaffOrMM = ticket.ticket_type === 'main' ? isMiddleman(member, settings) : isStaff(member, settings);
      if (!isStaffOrMM) {
        const roleName = ticket.ticket_type === 'main' ? 'middleman' : 'staff';
        return interaction.reply({ content: `❌ Only ${roleName} can add users.`, ephemeral: true });
      }
      
      if (ticket.claimed_by && ticket.claimed_by !== member.id) {
        return interaction.reply({ content: '❌ Only the claimed staff can add users.', ephemeral: true });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('add_user_modal')
        .setTitle('Add User to Ticket');
        
      const userInput = new TextInputBuilder()
        .setCustomId('user_id')
        .setLabel('User ID or @mention')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Enter user ID or @username');
        
      modal.addComponents(new ActionRowBuilder().addComponents(userInput));
      await interaction.showModal(modal);
    }
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
  }
});

// Modal Submit Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  const { customId, guild, member, fields, channel } = interaction;
  const settings = getSettings(guild.id);
  
  try {
    if (customId === 'mm_modal') {
      const otherUserInput = fields.getTextInputValue('other_user');
      const description = fields.getTextInputValue('description');
      const canJoinPs = fields.getTextInputValue('can_join_ps');
      
      let otherUser = null;
      if (otherUserInput.match(/^\d+$/)) {
        otherUser = await guild.members.fetch(otherUserInput).catch(() => null);
      } else {
        otherUser = guild.members.cache.find(m => 
          m.user.username.toLowerCase() === otherUserInput.toLowerCase() || 
          m.user.tag.toLowerCase() === otherUserInput.toLowerCase()
        );
      }
      
      const otherUserId = otherUser ? otherUser.id : otherUserInput;
      const otherUserDisplay = otherUser ? `${otherUser.user.username} (<@${otherUser.id}>)` : otherUserInput;
      
      const category = settings?.main_category_id ? guild.channels.cache.get(settings.main_category_id) : null;
      const channelName = `mm-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      const permissions = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ];
      
      if (settings?.middleman_role_id) {
        permissions.push({
          id: settings.middleman_role_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }
      
      permissions.push({
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
      });
      
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: permissions
      });
      
      createTicket(ticketChannel.id, guild.id, member.id, otherUserId, description, canJoinPs, 'main');
      
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('👑 Welcome to your Ticket! 👑')
        .setDescription(`Hello ${member}, thanks for opening a **Middleman Service Ticket**!

A staff member will assist you shortly. Provide all trade details clearly. Fake/troll tickets will result in consequences.

Eldorado MM Service • Please wait for a middleman`)
        .setColor(0xffd700)
        .setImage(BANNER_IMAGE);
        
      const detailsEmbed = new EmbedBuilder()
        .setTitle('📋 Trade Details')
        .addFields(
          { name: 'Trade', value: description || 'N/A' },
          { name: 'Other User / Trader', value: otherUserDisplay },
          { name: 'Trade Value', value: 'N/A' },
          { name: 'Can Join Private Servers?', value: canJoinPs || 'N/A' }
        )
        .setColor(0x2b2d31);
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.middleman_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      
      if (otherUser) {
        const foundEmbed = new EmbedBuilder()
          .setTitle('✅ User Found')
          .setDescription(`User <@${otherUser.id}> (ID: ${otherUser.id}) was found in the server.\n\nYou can add them to the ticket by using \`.add ${otherUser.user.username}\` or \`.add ${otherUser.id}\`, or by clicking the **Add User** button above.`)
          .setColor(0x00ff00)
          .setThumbnail(otherUser.user.displayAvatarURL());
        await ticketChannel.send({ embeds: [foundEmbed] });
      }
      
      await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🎫 Ticket Created')
            .setDescription(`New ticket created by ${member.user.username}`)
            .addFields(
              { name: 'Channel', value: `${ticketChannel}`, inline: true },
              { name: 'Other User', value: otherUserDisplay, inline: true },
              { name: 'Type', value: 'Main', inline: true }
            )
            .setColor(0x00ff00)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
      }
    }
    
    else if (customId === 'report_modal') {
      const reportWho = fields.getTextInputValue('report_who');
      const hasProof = fields.getTextInputValue('report_proof');
      const willListen = fields.getTextInputValue('report_rules');
      
      const category = settings?.support_category_id ? guild.channels.cache.get(settings.support_category_id) : null;
      const channelName = `report-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      const permissions = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ];
      
      if (settings?.staff_role_id) {
        permissions.push({
          id: settings.staff_role_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }
      
      permissions.push({
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
      });
      
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: permissions
      });
      
      createTicket(ticketChannel.id, guild.id, member.id, null, `Reporting: ${reportWho}`, hasProof, 'report');
      
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🚨 Report Ticket')
        .setDescription(`Hello ${member}, thanks for opening a **Report Ticket**!

A staff member will assist you shortly. Please provide all evidence and be patient.`)
        .setColor(0xe74c3c)
        .setImage(BANNER_IMAGE);
        
      const detailsEmbed = new EmbedBuilder()
        .setTitle('📋 Report Details')
        .addFields(
          { name: 'Who are you reporting?', value: reportWho },
          { name: 'Do you have proofs?', value: hasProof },
          { name: 'Will you stay and listen to rules?', value: willListen }
        )
        .setColor(0x2b2d31);
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.staff_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      
      await interaction.reply({ content: `✅ Report ticket created: ${ticketChannel}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🚨 Report Ticket Created')
            .setDescription(`New report ticket created by ${member.user.username}`)
            .addFields(
              { name: 'Channel', value: `${ticketChannel}`, inline: true },
              { name: 'Reporting', value: reportWho, inline: true }
            )
            .setColor(0xe74c3c)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
      }
    }
    
    else if (customId === 'support_modal_new') {
      const helpWith = fields.getTextInputValue('support_help');
      const description = fields.getTextInputValue('support_desc');
      const hasProof = fields.getTextInputValue('support_proof');
      
      const category = settings?.support_category_id ? guild.channels.cache.get(settings.support_category_id) : null;
      const channelName = `support-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      const permissions = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ];
      
      if (settings?.staff_role_id) {
        permissions.push({
          id: settings.staff_role_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }
      
      permissions.push({
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
      });
      
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: permissions
      });
      
      createTicket(ticketChannel.id, guild.id, member.id, null, description, hasProof, 'support');
      
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🆘 Support Ticket')
        .setDescription(`Hello ${member}, thanks for contacting support!

A staff member will assist you shortly. Please provide any additional information if needed.`)
        .setColor(0x3498db)
        .setImage(BANNER_IMAGE);
        
      const detailsEmbed = new EmbedBuilder()
        .setTitle('📋 Support Details')
        .addFields(
          { name: 'What do you need help with?', value: helpWith },
          { name: 'Description', value: description },
          { name: 'Do you have proofs?', value: hasProof }
        )
        .setColor(0x2b2d31);
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.staff_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      
      await interaction.reply({ content: `✅ Support ticket created: ${ticketChannel}`, ephemeral: true });
      
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🆘 Support Ticket Created')
            .setDescription(`New support ticket created by ${member.user.username}`)
            .addFields(
              { name: 'Channel', value: `${ticketChannel}`, inline: true },
              { name: 'Issue', value: helpWith, inline: true }
            )
            .setColor(0x3498db)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
      }
    }
    
    else if (customId === 'add_user_modal') {
      const userInput = fields.getTextInputValue('user_id');
      
      let targetUser = null;
      if (userInput.match(/^\d+$/)) {
        targetUser = await guild.members.fetch(userInput).catch(() => null);
      } else {
        const cleanInput = userInput.replace(/[<@!>]/g, '');
        if (cleanInput.match(/^\d+$/)) {
          targetUser = await guild.members.fetch(cleanInput).catch(() => null);
        } else {
          targetUser = guild.members.cache.find(m => m.user.username.toLowerCase().includes(userInput.toLowerCase()));
        }
      }
      
      if (!targetUser) {
        return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      }
      
      await channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      
      addUserToTicket(channel.id, targetUser.id);
      
      await channel.send({ content: `✅ Added ${targetUser} to the ticket.` });
      await interaction.reply({ content: `✅ Added ${targetUser.user.username} to the ticket.`, ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
  }
});

// Text Command Handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  
  const settings = getSettings(message.guild.id);
  const ticket = getTicket(message.channel.id);
  
  const prefix = '.';
  if (!message.content.startsWith(prefix)) return;
  
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  const isMM = isMiddleman(message.member, settings);
  const isStaffMember = isStaff(message.member, settings);
  
  if (command === 'help') {
    if (!ticket && !isMM && !isStaffMember) return;
    
    const helpEmbed = new EmbedBuilder()
      .setTitle('🎫 Staff Commands')
      .setDescription(`
**.help** - Shows this message
**.adduser <id/@user>** - Adds user to ticket
**.transfer <id/@user>** - Transfers ticket to another staff
**.close** - Closes the ticket
**.claim** - Claims the ticket
**.unclaim** - Unclaims the ticket
      `)
      .setColor(0x2b2d31);
    return message.reply({ embeds: [helpEmbed] });
  }
  
  if (!ticket) return;
  
  const isCreator = ticket.creator_id === message.author.id;
  const isClaimed = !!ticket.claimed_by;
  const isClaimer = ticket.claimed_by === message.author.id;
  
  const canManage = ticket.ticket_type === 'main' ? isMM : isStaffMember;
  
  if (command === 'adduser' || command === 'add') {
    if (!canManage) return message.reply('❌ Only staff can use this.');
    if (isClaimed && !isClaimer && !isAuthorized(message.member, message.guild)) {
      return message.reply('❌ Only the claimed staff can add users.');
    }
    
    const userInput = args[0];
    if (!userInput) return message.reply('❌ Please provide a user ID or mention.');
    
    let targetUser = null;
    if (userInput.match(/^\d+$/)) {
      targetUser = await message.guild.members.fetch(userInput).catch(() => null);
    } else {
      const cleanInput = userInput.replace(/[<@!>]/g, '');
      if (cleanInput.match(/^\d+$/)) {
        targetUser = await message.guild.members.fetch(cleanInput).catch(() => null);
      } else {
        targetUser = message.guild.members.cache.find(m => m.user.username.toLowerCase().includes(userInput.toLowerCase()));
      }
    }
    
    if (!targetUser) return message.reply('❌ User not found.');
    
    await message.channel.permissionOverwrites.edit(targetUser.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    
    addUserToTicket(message.channel.id, targetUser.id);
    return message.reply(`✅ Added ${targetUser} to the ticket.`);
  }
  
  if (command === 'transfer') {
    if (!canManage) return message.reply('❌ Only staff can use this.');
    if (isClaimed && !isClaimer && !isAuthorized(message.member, message.guild)) {
      return message.reply('❌ Only the claimed staff can transfer.');
    }
    
    const userInput = args[0];
    if (!userInput) return message.reply('❌ Please provide a staff ID or mention.');
    
    let targetUser = null;
    if (userInput.match(/^\d+$/)) {
      targetUser = await message.guild.members.fetch(userInput).catch(() => null);
    } else {
      const cleanInput = userInput.replace(/[<@!>]/g, '');
      targetUser = await message.guild.members.fetch(cleanInput).catch(() => null);
    }
    
    if (!targetUser) return message.reply('❌ User not found.');
    
    const targetCanManage = ticket.ticket_type === 'main' ? 
      isMiddleman(targetUser, settings) : 
      isStaff(targetUser, settings);
      
    if (!targetCanManage) return message.reply('❌ Target user is not staff.');
    if (targetUser.id === message.author.id) return message.reply('❌ You cannot transfer to yourself.');
    
    claimTicket(message.channel.id, targetUser.id);
    
    if (isClaimed) {
      await message.channel.permissionOverwrites.edit(message.author.id, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
    }
    
    await message.channel.permissionOverwrites.edit(targetUser.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    
    const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
    const ticketRole = message.guild.roles.cache.get(roleId);
    
    if (ticketRole) {
      await message.channel.permissionOverwrites.edit(ticketRole, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
    }
    
    await message.reply(`✅ Ticket transferred to ${targetUser}. You can no longer send messages in this ticket.`);
    
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => 
      m.embeds[0]?.title?.includes('Eldorado Middleman Service') || 
      m.embeds[0]?.title?.includes('Welcome to your Ticket') ||
      m.embeds[0]?.title?.includes('Support Ticket') ||
      m.embeds[0]?.title?.includes('Report Ticket')
    );
    
    if (ticketMsg) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      await ticketMsg.edit({ components: [row] });
    }
  }
  
  if (command === 'close') {
    const canClose = ticket.ticket_type === 'main' ? 
      (isMM || isCreator) : 
      (isStaffMember || isCreator);
      
    if (!canClose && !isAuthorized(message.member, message.guild)) return message.reply('❌ Only staff or the creator can close.');
    
    await message.reply('🔒 Closing ticket in 5 seconds...');
    
    if (settings?.log_channel_id) {
      const logChannel = message.guild.channels.cache.get(settings.log_channel_id);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🔒 Ticket Closed')
          .setDescription(`Ticket ${message.channel.name} was closed by ${message.author.username}`)
          .setColor(0xff0000)
          .setTimestamp();
        logChannel.send({ embeds: [logEmbed] });
      }
    }
    
    setTimeout(async () => {
      deleteTicket(message.channel.id);
      await message.channel.delete().catch(() => {});
    }, 5000);
  }
  
  if (command === 'claim') {
    if (!canManage) return message.reply('❌ Only staff can claim tickets.');
    if (isClaimed) return message.reply(`❌ Ticket already claimed by <@${ticket.claimed_by}>`);
    
    claimTicket(message.channel.id, message.author.id);
    
    const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
    const ticketRole = message.guild.roles.cache.get(roleId);
    
    if (ticketRole) {
      await message.channel.permissionOverwrites.edit(ticketRole, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
    }
    
    await message.channel.permissionOverwrites.edit(message.author.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    
    const claimEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Claimed')
      .setDescription(`This ticket has been claimed by ${message.author}. Other staff can no longer see this ticket.\n\nClaimed by ${message.author.username}`)
      .setColor(0x00ff00);
      
    await message.channel.send({ embeds: [claimEmbed] });
    message.reply('✅ You have claimed this ticket.');
    
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => 
      m.embeds[0]?.title?.includes('Eldorado Middleman Service') || 
      m.embeds[0]?.title?.includes('Welcome to your Ticket') ||
      m.embeds[0]?.title?.includes('Support Ticket') ||
      m.embeds[0]?.title?.includes('Report Ticket')
    );
    
    if (ticketMsg) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      await ticketMsg.edit({ components: [row] });
    }
  }
  
  if (command === 'unclaim') {
    if (!canManage) return message.reply('❌ Only staff can unclaim tickets.');
    if (!isClaimed) return message.reply('❌ This ticket is not claimed.');
    
    if (!isClaimer && !isAuthorized(message.member, message.guild)) {
      return message.reply('❌ Only the person who claimed this ticket can unclaim it.');
    }
    
    unclaimTicket(message.channel.id);
    
    const roleId = ticket.ticket_type === 'main' ? settings?.middleman_role_id : settings?.staff_role_id;
    const ticketRole = message.guild.roles.cache.get(roleId);
    
    if (ticketRole) {
      await message.channel.permissionOverwrites.edit(ticketRole, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
    }
    
    await message.channel.permissionOverwrites.delete(message.author.id).catch(() => {});
    
    await message.channel.send({ content: `🔓 ${message.author} has unclaimed this ticket.` });
    message.reply('✅ You have unclaimed this ticket.');
    
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => 
      m.embeds[0]?.title?.includes('Eldorado Middleman Service') || 
      m.embeds[0]?.title?.includes('Welcome to your Ticket') ||
      m.embeds[0]?.title?.includes('Support Ticket') ||
      m.embeds[0]?.title?.includes('Report Ticket')
    );
    
    if (ticketMsg) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(false),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      await ticketMsg.edit({ components: [row] });
    }
  }
});

// Login
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});
