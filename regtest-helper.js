const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');

const ECPair = ECPairFactory(ecc);
const REGTEST_API_BASE = 'http://localhost:18443/'; // Default regtest RPC port

/**
 * Creates a helper for interacting with a local Bitcoin regtest node
 * @param {Object} options - Configuration options
 * @param {string} options.rpcUser - Bitcoin node RPC username
 * @param {string} options.rpcPassword - Bitcoin node RPC password
 * @param {string} options.rpcUrl - Bitcoin node RPC URL (defaults to http://localhost:18443/)
 * @returns {Object} - Helper methods for regtest operations
 */
function createRegtestHelper({ rpcUser, rpcPassword, rpcUrl = REGTEST_API_BASE }) {
  const auth = { username: rpcUser, password: rpcPassword };
  
  /**
   * Makes an RPC call to the Bitcoin regtest node
   * @param {string} method - RPC method name
   * @param {Array} params - RPC method parameters
   * @returns {Promise<any>} - RPC response
   */
  async function callRpc(method, params = []) {
    try {
      const response = await axios.post(rpcUrl, {
        jsonrpc: '1.0',
        id: 'regtest-helper',
        method,
        params
      }, {
        auth,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(response.data.error)}`);
      }
      
      return response.data.result;
    } catch (error) {
      throw new Error(`RPC call failed: ${error.message}`);
    }
  }
  
  /**
   * Generates a new Bitcoin address with private key
   * @returns {Object} Object containing address and private key in WIF format
   */
  function generateAddress() {
    const keyPair = ECPair.makeRandom({ network: bitcoin.networks.regtest });
    const { address } = bitcoin.payments.p2pkh({ 
      pubkey: keyPair.publicKey, 
      network: bitcoin.networks.regtest 
    });
    
    return {
      address,
      privateKeyWIF: keyPair.toWIF()
    };
  }
  
  /**
   * Sends Bitcoin to an address on regtest
   * @param {string} address - Address to send to
   * @param {number} amount - Amount in BTC (not satoshis)
   * @returns {Promise<string>} - Transaction ID
   */
  async function sendToAddress(address, amount) {
    return callRpc('sendtoaddress', [address, amount]);
  }
  
  /**
   * Gets UTXO information for a specific transaction and output
   * @param {string} txid - Transaction ID
   * @param {number} vout - Output index
   * @param {string} address - Bitcoin address (for verification)
   * @returns {Promise<Object>} - UTXO information
   */
  async function getUTXOInfo(txid, vout, address) {
    const tx = await callRpc('getrawtransaction', [txid, true]);
    
    if (!tx || !tx.vout || !tx.vout[vout]) {
      throw new Error('UTXO not found');
    }
    
    const output = tx.vout[vout];
    const outputAddresses = output.scriptPubKey.addresses || [];
    
    // Verify the UTXO belongs to the address if provided
    if (address && !outputAddresses.includes(address)) {
      throw new Error('UTXO does not belong to the provided address');
    }
    
    return {
      value: Math.round(output.value * 1e8), // Convert BTC to satoshis
      scriptPubKey: output.scriptPubKey.hex
    };
  }
  
  /**
   * Mines a specific number of blocks
   * @param {number} blocks - Number of blocks to mine
   * @returns {Promise<string[]>} - Array of block hashes
   */
  async function generateBlocks(blocks) {
    // First get a mining address
    const miningAddress = await callRpc('getnewaddress');
    return callRpc('generatetoaddress', [blocks, miningAddress]);
  }
  
  /**
   * Broadcasts a raw transaction to the network
   * @param {string} txHex - Raw transaction hex
   * @returns {Promise<string>} - Transaction ID
   */
  async function broadcastTransaction(txHex) {
    return callRpc('sendrawtransaction', [txHex]);
  }
  
  /**
   * Gets information about a transaction
   * @param {string} txid - Transaction ID
   * @returns {Promise<Object>} - Transaction information
   */
  async function getTransaction(txid) {
    return callRpc('getrawtransaction', [txid, true]);
  }
  
  return {
    generateAddress,
    sendToAddress,
    getUTXOInfo,
    generateBlocks,
    broadcastTransaction,
    getTransaction,
    callRpc
  };
}

module.exports = { createRegtestHelper, NETWORK: bitcoin.networks.regtest }; 