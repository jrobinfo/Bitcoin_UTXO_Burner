#!/usr/bin/env node

/**
 * Bitcoin UTXO Burner - Pure JavaScript Implementation
 * Uses bitcoinjs-lib directly with regtest, no Bitcoin Core required
 */

const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const { burnBitcoin } = require('./bitcoin-utxo-burner');
const crypto = require('crypto');

// Set up the ECPair factory to work with bitcoinjs
const ECPair = ECPairFactory(ecc);

// Use regtest network
const NETWORK = bitcoin.networks.regtest;

// Create a mock regtest environment
const mockRegtest = () => {
  // Keep track of unspent outputs
  const utxos = new Map();
  // Keep track of transactions
  const transactions = new Map();
  // Keep track of the current chain height
  let blockHeight = 0;
  // Mempool transactions
  const mempool = new Set();
  
  // Generate a wallet with a key pair
  const generateWallet = () => {
    // Create a native SegWit (bech32) address
    const keyPair = ECPair.makeRandom({ network: NETWORK });
    const { address } = bitcoin.payments.p2wpkh({ 
      pubkey: keyPair.publicKey, 
      network: NETWORK 
    });
    
    return {
      address,
      privateKeyWIF: keyPair.toWIF()
    };
  };
  
  // Create a funded wallet
  const createFundedWallet = (amountInBTC = 1.0) => {
    // 1. Generate a wallet
    const wallet = generateWallet();
    
    // 2. Create a coinbase transaction sending funds to the address
    // Generate a proper hex txid
    const txid = crypto.randomBytes(32).toString('hex');
    const vout = 0;
    
    // Store this as a UTXO
    const amountInSatoshis = Math.floor(amountInBTC * 100000000);
    
    // Create the payment object for the correct address type
    const payment = bitcoin.payments.p2pkh({ 
      pubkey: ECPair.fromWIF(wallet.privateKeyWIF, NETWORK).publicKey, 
      network: NETWORK 
    });
    
    const scriptPubKey = payment.output.toString('hex');
    
    // Create mock transaction
    const mockTx = {
      txid,
      hash: txid,
      version: 2,
      size: 222,
      vsize: 222,
      weight: 888,
      locktime: 0,
      vin: [{
        txid: "0000000000000000000000000000000000000000000000000000000000000000",
        vout: 0,
        scriptSig: { asm: "", hex: "" },
        sequence: 4294967295
      }],
      vout: [{
        value: amountInBTC,
        n: vout,
        scriptPubKey: {
          asm: `OP_DUP OP_HASH160 ${wallet.address} OP_EQUALVERIFY OP_CHECKSIG`,
          hex: scriptPubKey,
          type: "pubkeyhash",
          reqSigs: 1,
          addresses: [wallet.address],
          address: wallet.address
        }
      }]
    };
    
    // Store the transaction
    transactions.set(txid, mockTx);
    
    // Store the UTXO
    utxos.set(`${txid}:${vout}`, {
      txid,
      vout,
      address: wallet.address,
      amount: amountInSatoshis,
      scriptPubKey,
      confirmations: 1
    });
    
    // Increment block height to simulate confirmation
    blockHeight++;
    
    return { ...wallet, txid, vout, amount: amountInBTC };
  };
  
  // Mine a specific number of blocks (simulated)
  const mineBlocks = (count = 1) => {
    // Just increment the block height
    blockHeight += count;
    // Confirm all transactions in mempool
    mempool.forEach(txid => {
      const tx = transactions.get(txid);
      if (tx) {
        // Find outputs and add them as UTXOs
        tx.vout.forEach((output, vout) => {
          if (output.scriptPubKey.address) {
            utxos.set(`${txid}:${vout}`, {
              txid,
              vout,
              address: output.scriptPubKey.address,
              amount: output.value * 100000000, // Convert to satoshis
              scriptPubKey: output.scriptPubKey.hex,
              confirmations: 1
            });
          }
        });
        
        // Find inputs and remove them from UTXOs
        tx.vin.forEach(input => {
          if (input.txid && input.txid !== "0000000000000000000000000000000000000000000000000000000000000000") {
            utxos.delete(`${input.txid}:${input.vout}`);
          }
        });
      }
    });
    // Clear mempool
    mempool.clear();
    
    return Array(count).fill().map(() => `block${blockHeight}`);
  };
  
  // Get UTXO info from the mock environment
  const getUTXOInfo = (txid, vout, address) => {
    const key = `${txid}:${vout}`;
    const utxo = utxos.get(key);
    
    if (!utxo) {
      throw new Error(`UTXO ${key} not found`);
    }
    
    if (address && utxo.address !== address) {
      throw new Error(`UTXO ${key} does not belong to address ${address}`);
    }
    
    console.log(`Found UTXO: ${txid}:${vout} for address ${address || 'unknown'}`);
    console.log(`UTXO amount: ${utxo.amount} satoshis`);
    console.log(`UTXO scriptPubKey: ${utxo.scriptPubKey}`);
    
    return {
      value: utxo.amount, // Already in satoshis
      scriptPubKey: utxo.scriptPubKey
    };
  };
  
  // Broadcast transaction to the mock network
  const broadcastTransaction = (txHex) => {
    // Decode the transaction
    const tx = bitcoin.Transaction.fromHex(txHex);
    const txid = tx.getId();
    
    console.log(`Broadcasting transaction ${txid} with ${tx.ins.length} inputs and ${tx.outs.length} outputs`);
    
    // Create the detailed transaction object
    const decodedTx = {
      txid,
      hash: txid,
      version: tx.version,
      size: txHex.length / 2,
      vsize: txHex.length / 2,
      weight: txHex.length / 2 * 4,
      locktime: tx.locktime,
      vin: tx.ins.map(input => ({
        txid: Buffer.from(input.hash).reverse().toString('hex'),
        vout: input.index,
        scriptSig: { 
          asm: "", 
          hex: input.script.toString('hex') 
        },
        sequence: input.sequence,
        txinwitness: input.witness.map(w => w.toString('hex'))
      })),
      vout: tx.outs.map((output, index) => {
        // Try to decode the output script
        let address = null;
        let type = "nonstandard";
        
        if (output.script[0] === 0x6a) {
          // OP_RETURN
          type = "nulldata";
          console.log(`Output #${index} is OP_RETURN`);
          if (output.script.length > 1) {
            const data = output.script.slice(2).toString('utf8');
            console.log(`OP_RETURN data: ${data}`);
          }
        } else {
          try {
            // Try to identify the output type and extract address
            if (bitcoin.payments.p2pkh({ output: output.script, network: NETWORK }).address) {
              address = bitcoin.payments.p2pkh({ output: output.script, network: NETWORK }).address;
              type = "pubkeyhash";
            } else if (bitcoin.payments.p2wpkh({ output: output.script, network: NETWORK }).address) {
              address = bitcoin.payments.p2wpkh({ output: output.script, network: NETWORK }).address;
              type = "witness_v0_keyhash";
            }
          } catch (error) {
            // If we can't determine the address, just keep it as nonstandard
          }
        }
        
        return {
          value: output.value / 100000000, // Convert to BTC
          n: index,
          scriptPubKey: {
            asm: type === "nulldata" ? "OP_RETURN <data>" : `<script>`,
            hex: output.script.toString('hex'),
            type,
            addresses: address ? [address] : undefined,
            address
          }
        };
      })
    };
    
    // Add to transactions map and mempool
    transactions.set(txid, decodedTx);
    mempool.add(txid);
    
    return txid;
  };
  
  return {
    generateWallet,
    createFundedWallet,
    mineBlocks,
    getUTXOInfo,
    broadcastTransaction,
    getTransaction: (txid) => transactions.get(txid) || null
  };
};

/**
 * Run a pure JavaScript regtest demonstration
 */
async function runJsRegtestDemo() {
  console.log('='.repeat(80));
  console.log('Bitcoin UTXO Burner - Pure JavaScript Implementation');
  console.log('='.repeat(80));
  
  try {
    // Create the mock regtest environment
    const regtest = mockRegtest();
    
    // 1. Create a funded wallet with 1 BTC
    console.log('\nCreating funded wallet...');
    const { address, privateKeyWIF, txid, vout, amount } = regtest.createFundedWallet(1.0);
    console.log(`Generated address: ${address}`);
    console.log(`Private key (WIF): ${privateKeyWIF}`);
    console.log(`Initial UTXO: ${txid}:${vout} (${amount} BTC)`);
    
    // 2. Mine some blocks to confirm the funding
    console.log('\nMining blocks...');
    regtest.mineBlocks(6);
    console.log('Mined 6 blocks');
    
    // 3. Create the burn transaction
    console.log('\nCreating burn transaction...');
    const burnMessage = "Modern JavaScript burning demonstration";
    console.log(`Burn message: "${burnMessage}"`);
    
    const txHex = await burnBitcoin(
      privateKeyWIF,
      txid,
      vout,
      1, // Fee rate
      {
        network: NETWORK,
        getUTXOInfoFn: regtest.getUTXOInfo,
        burnMessage
      }
    );
    
    console.log('\nBurn transaction created successfully!');
    
    // 4. Broadcast the transaction
    console.log('\nBroadcasting burn transaction...');
    const burnTxId = regtest.broadcastTransaction(txHex);
    console.log(`Burn transaction broadcast! TxID: ${burnTxId}`);
    
    // 5. Mine a block to confirm
    console.log('\nMining a block to confirm the burn...');
    regtest.mineBlocks(1);
    console.log('Burn transaction confirmed in block');
    
    // 6. Verify the burn
    console.log('\nVerifying burn transaction...');
    const burnTx = regtest.getTransaction(burnTxId);
    
    // Check for OP_RETURN output
    let burnVerified = false;
    for (const output of burnTx.vout) {
      if (output.scriptPubKey.type === 'nulldata') {
        burnVerified = true;
        console.log('Found OP_RETURN output in transaction - UTXO successfully burned!');
        console.log(`Script: ${output.scriptPubKey.hex}`);
        break;
      }
    }
    
    if (!burnVerified) {
      console.log('Warning: Could not verify OP_RETURN output in burn transaction');
    }
    
    console.log('\n=== JavaScript regtest demonstration completed successfully! ===');
    console.log(`\nSummary:
    - Generated address: ${address}
    - Private key WIF: ${privateKeyWIF}
    - Burned UTXO: ${txid}:${vout} (${amount} BTC)
    - Burn transaction ID: ${burnTxId}
    - Status: ${burnVerified ? 'Successfully verified' : 'Verification failed'}
    `);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the demo if this script is executed directly
if (require.main === module) {
  runJsRegtestDemo()
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
} else {
  // Export for testing
  module.exports = { runJsRegtestDemo };
} 