require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { SingleWallet } = require('./wallet.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const OWNER_ID = process.env.OWNER_ID;
const FEE_ADDRESS = process.env.FEE_ADDRESS;

// Initialize wallet
let wallet;
try {
  const mnemonic = process.env.WALLET_MNEMONIC;
  
  if (!mnemonic) {
    console.error('❌ WALLET_MNEMONIC not found in .env');
    process.exit(1);
  }
  
  wallet = new SingleWallet(mnemonic);
  console.log(`✅ Wallet initialized`);
  console.log(`📍 Permanent Address: ${wallet.getAddress()}`);
} catch (err) {
  console.error('❌ Wallet initialization failed:', err.message);
  process.exit(1);
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check wallet balance (Owner only)'),
  new SlashCommandBuilder()
    .setName('address')
    .setDescription('Get the bot LTC address (Owner only)'),
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send ALL LTC to fee address (Owner only)')
    .addStringOption(opt => 
      opt.setName('confirm')
         .setDescription('Type "CONFIRM" to send everything')
         .setRequired(true)
    )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  
  try {
    await client.application.commands.set(commands);
    console.log('✅ Commands registered');
  } catch (err) {
    console.error('❌ Command registration failed:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, user } = interaction;

  if (!isOwner(user.id)) {
    return interaction.reply({
      content: '❌ **Owner only** - You do not have permission.',
      ephemeral: true
    });
  }

  try {
    if (commandName === 'balance') {
      await interaction.deferReply({ ephemeral: true });
      
      const [balanceData, ltcPrice] = await Promise.all([
        wallet.getBalance(),
        wallet.getLTCPrice()
      ]);

      const confirmedUSD = (balanceData.confirmed * ltcPrice).toFixed(2);
      const unconfirmedUSD = (balanceData.unconfirmed * ltcPrice).toFixed(2);
      const totalUSD = (balanceData.total * ltcPrice).toFixed(2);

      const embed = new EmbedBuilder()
        .setTitle('💰 Wallet Balance')
        .setColor(0x00FF00)
        .addFields(
          { 
            name: 'Confirmed', 
            value: `${balanceData.confirmed.toFixed(8)} LTC\n≈ $${confirmedUSD}`, 
            inline: true 
          },
          { 
            name: 'Unconfirmed', 
            value: `${balanceData.unconfirmed.toFixed(8)} LTC\n≈ $${unconfirmedUSD}`, 
            inline: true 
          },
          { 
            name: 'Total', 
            value: `${balanceData.total.toFixed(8)} LTC\n≈ $${totalUSD}`, 
            inline: false 
          }
        )
        .setFooter({ text: `Address: ${wallet.getAddress()}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'address') {
      const addr = wallet.getAddress();
      
      const embed = new EmbedBuilder()
        .setTitle('📍 Your Permanent LTC Address')
        .setDescription(`\`${addr}\``)
        .setColor(0x3498db)
        .addFields(
          { name: 'Network', value: 'Litecoin (LTC)', inline: true },
          { name: 'Type', value: 'Native SegWit', inline: true }
        )
        .setFooter({ text: 'This address never changes. Always use this one.' });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    else if (commandName === 'send') {
      const confirm = interaction.options.getString('confirm');
      
      if (confirm !== 'CONFIRM') {
        return interaction.reply({
          content: '❌ Type "CONFIRM" to send all funds.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const balance = await wallet.getBalance();
      if (balance.confirmed <= 0) {
        return interaction.editReply('❌ No confirmed balance available.');
      }

      const result = await wallet.sendAll(FEE_ADDRESS, 1000);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Transaction Sent')
        .setColor(0x00FF00)
        .addFields(
          { name: 'Amount', value: `${result.amount.toFixed(8)} LTC`, inline: true },
          { name: 'Fee', value: `${result.fee.toFixed(8)} LTC`, inline: true },
          { name: 'To', value: `\`${result.to}\``, inline: false },
          { name: 'Transaction ID', value: `\`${result.txid}\``, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (error) {
    console.error(`[Error] ${commandName}:`, error);
    const errorMsg = error.message || 'Unknown error';
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`❌ Error: ${errorMsg}`).catch(() => {});
    } else {
      await interaction.reply({ content: `❌ Error: ${errorMsg}`, ephemeral: true }).catch(() => {});
    }
  }
});

client.on('error', (err) => console.error('[Discord Error]', err));
process.on('unhandledRejection', (err) => console.error('[Unhandled]', err));

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});
