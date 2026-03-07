const bip39 = require('bip39');
const bip32 = require('bip32');
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const tinysecp = require('tiny-secp256k1');

bitcoin.initEccLib(tinysecp);

const LITECOIN_NETWORK = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0
};

const LITECOINSPACE_API = 'https://litecoinspace.org/api';

class SingleWallet {
  constructor(mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic provided');
    }
    
    this.mnemonic = mnemonic;
    this.seed = bip39.mnemonicToSeedSync(mnemonic);
    this.root = bip32.BIP32Factory(tinysecp).fromSeed(this.seed, LITECOIN_NETWORK);
    
    // ALWAYS index 0 - permanent address
    this.node = this.root.derivePath("m/84'/2'/0'/0/0");
    this.address = bitcoin.payments.p2wpkh({
      pubkey: this.node.publicKey,
      network: LITECOIN_NETWORK
    }).address;
    
    console.log(`[Wallet] Permanent Address: ${this.address}`);
  }

  getAddress() {
    return this.address;
  }

  getPrivateKey() {
    return this.node.toWIF();
  }

  async getBalance() {
    try {
      const response = await axios.get(`${LITECOINSPACE_API}/address/${this.address}`, {
        timeout: 10000
      });
      
      const data = response.data;
      const confirmedSats = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0);
      const unconfirmedSats = (data.mempool_stats?.funded_txo_sum || 0) - (data.mempool_stats?.spent_txo_sum || 0);
      
      return {
        confirmed: confirmedSats / 100000000,
        unconfirmed: unconfirmedSats / 100000000,
        total: (confirmedSats + unconfirmedSats) / 100000000
      };
    } catch (error) {
      console.error('[Wallet] Balance error:', error.message);
      throw new Error('Failed to fetch balance');
    }
  }

  async getLTCPrice() {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd', {
        timeout: 10000
      });
      return response.data.litecoin.usd;
    } catch (error) {
      console.error('[Wallet] Price error:', error.message);
      return 0;
    }
  }

  async getUTXOs() {
    try {
      const response = await axios.get(`${LITECOINSPACE_API}/address/${this.address}/utxo`, {
        timeout: 10000
      });
      
      return response.data.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        confirmed: utxo.status?.confirmed || false
      }));
    } catch (error) {
      console.error('[Wallet] UTXO error:', error.message);
      throw new Error('Failed to fetch UTXOs');
    }
  }

  // Get transaction history for an address
  async getTransactionHistory(address) {
    try {
      const response = await axios.get(`${LITECOINSPACE_API}/address/${address}/txs`, {
        timeout: 15000
      });
      
      const transactions = [];
      
      for (const tx of response.data) {
        let received = 0;
        let sent = 0;
        
        // Check inputs (sent)
        for (const input of tx.vin) {
          if (input.prevout?.scriptpubkey_address === address) {
            sent += input.prevout.value;
          }
        }
        
        // Check outputs (received)
        for (const output of tx.vout) {
          if (output.scriptpubkey_address === address) {
            received += output.value;
          }
        }
        
        const netAmount = received - sent;
        
        transactions.push({
          txid: tx.txid,
          amount: netAmount / 100000000, // Convert to LTC
          type: netAmount > 0 ? 'received' : 'sent',
          confirmed: tx.status?.confirmed || false,
          blockTime: tx.status?.block_time || null
        });
      }
      
      return transactions;
    } catch (error) {
      console.error('[Wallet] Transaction history error:', error.message);
      throw new Error('Failed to fetch transaction history');
    }
  }

  async sendAll(toAddress, feeSats = 1000) {
    try {
      const utxos = await this.getUTXOs();
      const confirmedUtxos = utxos.filter(u => u.confirmed);
      
      if (confirmedUtxos.length === 0) {
        throw new Error('No confirmed UTXOs available');
      }

      const totalInput = confirmedUtxos.reduce((sum, u) => sum + u.value, 0);
      
      if (totalInput <= feeSats) {
        throw new Error(`Insufficient funds. Have: ${totalInput} sats, need ${feeSats} for fee`);
      }

      const outputValue = totalInput - feeSats;

      const psbt = new bitcoin.Psbt({ network: LITECOIN_NETWORK });
      
      for (const utxo of confirmedUtxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: bitcoin.payments.p2wpkh({
              pubkey: this.node.publicKey,
              network: LITECOIN_NETWORK
            }).output,
            value: utxo.value
          }
        });
      }

      psbt.addOutput({
        address: toAddress,
        value: outputValue
      });

      for (let i = 0; i < confirmedUtxos.length; i++) {
        psbt.signInput(i, this.node);
      }

      psbt.finalizeAllInputs();
      const txHex = psbt.extractTransaction().toHex();
      const txid = psbt.extractTransaction().getId();

      const broadcast = await axios.post(`${LITECOINSPACE_API}/tx`, txHex, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 15000
      });

      return {
        txid: broadcast.data || txid,
        amount: outputValue / 100000000,
        fee: feeSats / 100000000,
        from: this.address,
        to: toAddress
      };
    } catch (error) {
      console.error('[Wallet] Send error:', error.message);
      if (error.response?.data) {
        throw new Error(`Broadcast failed: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}

module.exports = { SingleWallet };
