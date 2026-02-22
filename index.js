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
  PermissionsBitField
} = require('discord.js');
const Database = require('better-sqlite3');

// BOT OWNER ID - Can use all commands
const BOT_OWNER_ID = '1410632195210481664';

// Initialize Database
const db = new Database('database.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT PRIMARY KEY,
    middleman_role_id TEXT,
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

function isAuthorized(member, guild) {
  return member.id === BOT_OWNER_ID || member.id === guild.ownerId;
}

// Bot Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  // Register Slash Commands
  const commands = [
    new SlashCommandBuilder()
      .setName('middleman')
      .setDescription('Set the middleman role (Owner only)')
      .addRoleOption(opt => opt.setName('role').setDescription('Middleman role').setRequired(true))
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
      .setDescription('Set category for support tickets (Owner only)')
      .addChannelOption(opt => opt.setName('category').setDescription('Category for support tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('main')
      .setDescription('Send the main middleman panel (Owner only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      
    new SlashCommandBuilder()
      .setName('support')
      .setDescription('Send support ticket panel (Owner only)')
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
  
  // Check authorization (Bot owner OR Server owner)
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
          .setTitle('🎫 Request a MiddleMan')
          .setDescription(`**Welcome to our server's MM Service!**

If you are in need of an MM, please read our Middleman ToS first and then tap the **Request Middleman** button and fill out the form below.

📝 **Important Rules:**
• You **must** vouch your middleman after the trade in the #vouches channel
• Failing to vouch within **24 hours** = Blacklist from MM Service
• Creating troll tickets = Middleman ban

⚠️ **Disclaimer:**
• We are **NOT** responsible for anything that happens after the trade
• We are **NOT** responsible for any duped items

By opening a ticket or requesting a middleman, you agree to our Middleman ToS.`)
          .setColor(0x2b2d31)
          .setImage('https://i.imgur.com/QQzqfT1.png');
          
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('request_mm')
            .setLabel('Request Middleman')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Main panel sent!', ephemeral: true });
        break;
      }
      
      case 'support': {
        const embed = new EmbedBuilder()
          .setTitle('🆘 Support Ticket')
          .setDescription(`**Need Help?**

Click the button below to create a support ticket. Our staff will assist you shortly.

Please provide as much detail as possible about your issue.`)
          .setColor(0x3498db)
          .setThumbnail('https://i.imgur.com/support-icon.png');
          
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('request_support')
            .setLabel('Create Support Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Support panel sent!', ephemeral: true });
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
          .setImage('https://i.imgur.com/QQzqfT1.png');
          
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ TOS sent!', ephemeral: true });
        break;
      }
      
      case 'faq': {
        const embed = new EmbedBuilder()
          .setTitle('Eldorado - FAQ')
          .setDescription(`Eldorado is a platform that provides a secure player-to-player trading experience for buyers and sellers of online gaming products. We provide a system for secure transactions – you do the rest. We have marketplaces for 250+ games and leading titles!`)
          .setColor(0xffd700)
          .setThumbnail('https://i.imgur.com/QQzqfT1.png')
          .setImage('https://i.imgur.com/QQzqfT1.png');
          
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

// Button Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  const { customId, guild, member, channel } = interaction;
  const settings = getSettings(guild.id);
  
  try {
    if (customId === 'request_mm') {
      // Show modal
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
    
    else if (customId === 'request_support') {
      const modal = new ModalBuilder()
        .setCustomId('support_modal')
        .setTitle('Support Request');
        
      const issueInput = new TextInputBuilder()
        .setCustomId('issue')
        .setLabel('Describe your issue')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Explain what you need help with...');
        
      const priorityInput = new TextInputBuilder()
        .setCustomId('priority')
        .setLabel('Priority (Low/Medium/High)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Low, Medium, or High');
        
      modal.addComponents(
        new ActionRowBuilder().addComponents(issueInput),
        new ActionRowBuilder().addComponents(priorityInput)
      );
      
      await interaction.showModal(modal);
    }
    
    else if (customId === 'claim_ticket') {
      const ticket = getTicket(channel.id);
      if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
      
      if (!isMiddleman(member, settings)) {
        return interaction.reply({ content: '❌ Only middlemen can claim tickets.', ephemeral: true });
      }
      
      if (ticket.claimed_by) {
        const claimer = await guild.members.fetch(ticket.claimed_by).catch(() => null);
        return interaction.reply({ content: `❌ Ticket already claimed by ${claimer ? claimer.user.username : 'Unknown'}`, ephemeral: true });
      }
      
      claimTicket(channel.id, member.id);
      
      // Update permissions - Remove SEND_MESSAGES for other middlemen
      const middlemanRole = guild.roles.cache.get(settings.middleman_role_id);
      if (middlemanRole) {
        await channel.permissionOverwrites.edit(middlemanRole, {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true
        });
      }
      
      // Allow claimed middleman to send messages
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      
      // Send claim message
      const claimEmbed = new EmbedBuilder()
        .setTitle('✅ Ticket Claimed')
        .setDescription(`This ticket has been claimed by ${member}. Other staff can no longer see this ticket.\n\nClaimed by ${member.user.username}`)
        .setColor(0x00ff00);
        
      await channel.send({ embeds: [claimEmbed] });
      
      // Update buttons
      const messages = await channel.messages.fetch({ limit: 10 });
      const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket'));
      if (ticketMsg) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
        );
        await ticketMsg.edit({ components: [row] });
      }
      
      await interaction.reply({ content: '✅ You have claimed this ticket.', ephemeral: true });
      
      // Log
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
        return interaction.reply({ content: '❌ Only the claimed middleman can unclaim.', ephemeral: true });
      }
      
      unclaimTicket(channel.id);
      
      // Reset permissions - Allow all middlemen to send messages again
      const middlemanRole = guild.roles.cache.get(settings.middleman_role_id);
      if (middlemanRole) {
        await channel.permissionOverwrites.edit(middlemanRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
      }
      
      // Remove specific permissions for the ex-claimer
      await channel.permissionOverwrites.delete(member.id).catch(() => {});
      
      await channel.send({ content: `🔓 ${member} has unclaimed this ticket.` });
      
      // Update buttons back to claim
      const messages = await channel.messages.fetch({ limit: 10 });
      const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket'));
      if (ticketMsg) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
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
      
      if (!isMiddleman(member, settings) && ticket.creator_id !== member.id && !isAuthorized(member, guild)) {
        return interaction.reply({ content: '❌ Only middlemen or the ticket creator can close.', ephemeral: true });
      }
      
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...', ephemeral: true });
      
      // Log before delete
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
      
      if (!isMiddleman(member, settings)) {
        return interaction.reply({ content: '❌ Only middlemen can add users.', ephemeral: true });
      }
      
      if (ticket.claimed_by && ticket.claimed_by !== member.id) {
        return interaction.reply({ content: '❌ Only the claimed middleman can add users.', ephemeral: true });
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
      
      // Find other user
      let otherUser = null;
      if (otherUserInput.match(/^\d+$/)) {
        otherUser = await guild.members.fetch(otherUserInput).catch(() => null);
      } else {
        otherUser = guild.members.cache.find(m => m.user.username.toLowerCase() === otherUserInput.toLowerCase() || m.user.tag.toLowerCase() === otherUserInput.toLowerCase());
      }
      
      const otherUserId = otherUser ? otherUser.id : otherUserInput;
      const otherUserDisplay = otherUser ? `${otherUser.user.username} (<@${otherUser.id}>)` : otherUserInput;
      
      // Create ticket channel in MAIN category
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
      
      // Add middleman role permissions (view + send initially)
      if (settings?.middleman_role_id) {
        permissions.push({
          id: settings.middleman_role_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }
      
      // Add bot permissions
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
      
      // Send welcome message
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('👑 Welcome to your Ticket! 👑')
        .setDescription(`Hello ${member}, thanks for opening a **Middleman Service Ticket**!

A staff member will assist you shortly. Provide all trade details clearly. Fake/troll tickets will result in consequences.

Eldorado MM Service • Please wait for a middleman`)
        .setColor(0xffd700)
        .setThumbnail('https://i.imgur.com/QQzqfT1.png');
        
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
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.middleman_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      
      // Send user found message if user was found
      if (otherUser) {
        const foundEmbed = new EmbedBuilder()
          .setTitle('✅ User Found')
          .setDescription(`User <@${otherUser.id}> (ID: ${otherUser.id}) was found in the server.\n\nYou can add them to the ticket by using \`.add ${otherUser.user.username}\` or \`.add ${otherUser.id}\`, or by clicking the **Add User** button above — it will add the other trader automatically.`)
          .setColor(0x00ff00)
          .setThumbnail(otherUser.user.displayAvatarURL());
        await ticketChannel.send({ embeds: [foundEmbed] });
      }
      
      await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
      
      // Log
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
    
    else if (customId === 'support_modal') {
      const issue = fields.getTextInputValue('issue');
      const priority = fields.getTextInputValue('priority');
      
      // Create support ticket in SUPPORT category
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
      
      // Add middleman role permissions (view + send initially)
      if (settings?.middleman_role_id) {
        permissions.push({
          id: settings.middleman_role_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        });
      }
      
      // Add bot permissions
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
      
      createTicket(ticketChannel.id, guild.id, member.id, null, issue, priority, 'support');
      
      // Send welcome message
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🆘 Support Ticket')
        .setDescription(`Hello ${member}, thanks for contacting support!

A staff member will assist you shortly. Please provide any additional information if needed.`)
        .setColor(0x3498db)
        .setThumbnail('https://i.imgur.com/QQzqfT1.png');
        
      const detailsEmbed = new EmbedBuilder()
        .setTitle('📋 Issue Details')
        .addFields(
          { name: 'Issue', value: issue },
          { name: 'Priority', value: priority || 'Not specified' }
        )
        .setColor(0x2b2d31);
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      
      await ticketChannel.send({ content: `${member} <@&${settings?.middleman_role_id}>`, embeds: [welcomeEmbed, detailsEmbed], components: [row] });
      
      await interaction.reply({ content: `✅ Support ticket created: ${ticketChannel}`, ephemeral: true });
      
      // Log
      if (settings?.log_channel_id) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🆘 Support Ticket Created')
            .setDescription(`New support ticket created by ${member.user.username}`)
            .addFields(
              { name: 'Channel', value: `${ticketChannel}`, inline: true },
              { name: 'Priority', value: priority || 'Not specified', inline: true },
              { name: 'Type', value: 'Support', inline: true }
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

// Text Command Handler (Prefix commands for middlemen)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  
  const settings = getSettings(message.guild.id);
  const ticket = getTicket(message.channel.id);
  
  // Check if it's a middleman command
  const prefix = '.';
  if (!message.content.startsWith(prefix)) return;
  
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Only allow middleman commands in tickets
  const isMM = isMiddleman(message.member, settings);
  
  if (command === 'help') {
    if (!ticket && !isMM) return;
    
    const helpEmbed = new EmbedBuilder()
      .setTitle('🎫 Middleman Commands')
      .setDescription(`
**.help** - Shows this message
**.adduser <id/@user>** - Adds user to ticket
**.transfer <id/@user>** - Transfers ticket to another middleman
**.close** - Closes the ticket
**.claim** - Claims the ticket (alternative to button)
      `)
      .setColor(0x2b2d31);
    return message.reply({ embeds: [helpEmbed] });
  }
  
  if (!ticket) return; // Following commands only work in tickets
  
  // Creator can use some commands when unclaimed
  const isCreator = ticket.creator_id === message.author.id;
  const isClaimed = !!ticket.claimed_by;
  const isClaimer = ticket.claimed_by === message.author.id;
  
  if (command === 'adduser' || command === 'add') {
    // Middleman only, and only claimed middleman if claimed
    if (!isMM) return message.reply('❌ Only middlemen can use this.');
    if (isClaimed && !isClaimer && !isAuthorized(message.member, message.guild)) {
      return message.reply('❌ Only the claimed middleman can add users.');
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
    if (!isMM) return message.reply('❌ Only middlemen can use this.');
    if (isClaimed && !isClaimer && !isAuthorized(message.member, message.guild)) {
      return message.reply('❌ Only the claimed middleman can transfer.');
    }
    
    const userInput = args[0];
    if (!userInput) return message.reply('❌ Please provide a middleman ID or mention.');
    
    let targetUser = null;
    if (userInput.match(/^\d+$/)) {
      targetUser = await message.guild.members.fetch(userInput).catch(() => null);
    } else {
      const cleanInput = userInput.replace(/[<@!>]/g, '');
      targetUser = await message.guild.members.fetch(cleanInput).catch(() => null);
    }
    
    if (!targetUser) return message.reply('❌ User not found.');
    if (!isMiddleman(targetUser, settings)) return message.reply('❌ Target user is not a middleman.');
    if (targetUser.id === message.author.id) return message.reply('❌ You cannot transfer to yourself.');
    
    // Transfer
    claimTicket(message.channel.id, targetUser.id);
    
    // Remove current middleman send permissions
    if (isClaimed) {
      await message.channel.permissionOverwrites.edit(message.author.id, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
    }
    
    // Add new middleman permissions
    await message.channel.permissionOverwrites.edit(targetUser.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    
    // Update middleman role permissions (remove send for all)
    const middlemanRole = message.guild.roles.cache.get(settings.middleman_role_id);
    if (middlemanRole) {
      await message.channel.permissionOverwrites.edit(middlemanRole, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true
      });
    }
    
    message.reply(`✅ Ticket transferred to ${targetUser}. You can no longer send messages in this ticket.`);
    
    // Update buttons
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket'));
    if (ticketMsg) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('add_user').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕')
      );
      await ticketMsg.edit({ components: [row] });
    }
  }
  
  if (command === 'close') {
    if (!isMM && !isCreator && !isAuthorized(message.member, message.guild)) return message.reply('❌ Only middlemen or the creator can close.');
    
    await message.reply('🔒 Closing ticket in 5 seconds...');
    
    // Log
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
    if (!isMM) return message.reply('❌ Only middlemen can claim tickets.');
    if (isClaimed) return message.reply(`❌ Ticket already claimed by <@${ticket.claimed_by}>`);
    
    claimTicket(message.channel.id, message.author.id);
    
    // Update permissions
    const middlemanRole = message.guild.roles.cache.get(settings.middleman_role_id);
    if (middlemanRole) {
      await message.channel.permissionOverwrites.edit(middlemanRole, {
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
    
    // Update buttons
    const messages = await message.channel.messages.fetch({ limit: 10 });
    const ticketMsg = messages.find(m => m.embeds[0]?.title?.includes('Welcome to your Ticket') || m.embeds[0]?.title?.includes('Support Ticket'));
    if (ticketMsg) {
      const row = new ActionRowBuilder().addComponents(
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
