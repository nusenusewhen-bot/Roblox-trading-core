require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
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
  console.log(`📍 Bot Address: ${wallet.getAddress()}`);
  console.log(`💰 Fee Address: ${FEE_ADDRESS}`);
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
    .setDescription('Check bot wallet balance (Owner only)'),
  new SlashCommandBuilder()
    .setName('address')
    .setDescription('Get the bot LTC address (Owner only)'),
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send ALL LTC to fee address (Owner only)')
    .addStringOption(opt => 
      opt.setName('confirm')
         .setDescription('Type "y" to confirm or "n" to cancel')
         .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('mybal')
    .setDescription('Check fee address balance and history (Owner only)'),
  new SlashCommandBuilder()
    .setName('nton')
    .setDescription('Get the fee address (Owner only)')
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
        .setTitle('💰 Bot Wallet Balance')
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
        .setTitle('📍 Bot LTC Address')
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
      const confirm = interaction.options.getString('confirm').toLowerCase().trim();
      
      if (confirm === 'n') {
        return interaction.reply({
          content: '❌ Transaction cancelled.',
          ephemeral: true
        });
      }
      
      if (confirm !== 'y') {
        return interaction.reply({
          content: '❌ Invalid option. Type "y" to confirm or "n" to cancel.',
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

    else if (commandName === 'mybal') {
      await interaction.deferReply({ ephemeral: true });

      const [addressData, ltcPrice, txHistory] = await Promise.all([
        axios.get(`https://litecoinspace.org/api/address/${FEE_ADDRESS}`, { timeout: 10000 }),
        wallet.getLTCPrice(),
        wallet.getTransactionHistory(FEE_ADDRESS)
      ]);

      const data = addressData.data;
      const confirmedSats = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0);
      const unconfirmedSats = (data.mempool_stats?.funded_txo_sum || 0) - (data.mempool_stats?.spent_txo_sum || 0);
      
      const confirmedLTC = confirmedSats / 100000000;
      const unconfirmedLTC = unconfirmedSats / 100000000;
      const confirmedUSD = (confirmedLTC * ltcPrice).toFixed(2);
      const unconfirmedUSD = (unconfirmedLTC * ltcPrice).toFixed(2);

      let txList = '';
      const recentTxs = txHistory.slice(0, 10);
      
      if (recentTxs.length === 0) {
        txList = 'No transactions found';
      } else {
        for (const tx of recentTxs) {
          const sign = tx.type === 'received' ? '+' : '-';
          const amount = Math.abs(tx.amount).toFixed(8);
          const shortTxid = `${tx.txid.substring(0, 8)}...${tx.txid.substring(tx.txid.length - 8)}`;
          txList += `${sign} ${amount} LTC | \`${shortTxid}\`\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('💰 Fee Address Status')
        .setDescription(`\`${FEE_ADDRESS}\``)
        .setColor(0x9b59b6)
        .addFields(
          { 
            name: '1️⃣ Balance', 
            value: `${confirmedLTC.toFixed(8)} LTC\n≈ $${confirmedUSD}`, 
            inline: false 
          },
          { 
            name: '2️⃣ Unconfirmed', 
            value: `${unconfirmedLTC.toFixed(8)} LTC\n≈ $${unconfirmedUSD}`, 
            inline: false 
          },
          { 
            name: '3️⃣ LTC Price', 
            value: `$${ltcPrice.toFixed(2)} USD`, 
            inline: false 
          },
          {
            name: '📜 Recent Activity (Last 10)',
            value: txList || 'No transactions',
            inline: false
          }
        )
        .setFooter({ text: '+ = Received | - = Sent' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    else if (commandName === 'nton') {
      const embed = new EmbedBuilder()
        .setTitle('💸 Fee Address')
        .setDescription(`\`${FEE_ADDRESS}\``)
        .setColor(0xe74c3c)
        .addFields(
          { name: 'Purpose', value: 'All /send commands transfer to this address', inline: false },
          { name: 'Copy', value: `\`${FEE_ADDRESS}\``, inline: false }
        )
        .setFooter({ text: 'Use /mybal to check this address balance' });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
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
