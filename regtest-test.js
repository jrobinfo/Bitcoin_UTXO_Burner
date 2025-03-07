#!/usr/bin/env node

const { burnBitcoin } = require('./bitcoin-utxo-burner');
const { createRegtestHelper, NETWORK } = require('./regtest-helper');

// Bitcoin regtest node configuration
// These should match your local Bitcoin Core regtest settings
const RPC_USER = 'rpcuser';       // Update with your Bitcoin Core RPC username
const RPC_PASSWORD = 'rpcpassword'; // Update with your Bitcoin Core RPC password
const RPC_URL = 'http://localhost:18443/';

// Create regtest helper
const regtest = createRegtestHelper({
  rpcUser: RPC_USER,
  rpcPassword: RPC_PASSWORD,
  rpcUrl: RPC_URL
});

/**
 * Full test of the UTXO burning process on regtest
 */
async function runRegtestDemo() {
  try {
    console.log('Starting Bitcoin UTXO Burner regtest demonstration\n');
    
    // 1. Generate a new address and private key
    console.log('Generating new test address...');
    const { address, privateKeyWIF } = regtest.generateAddress();
    console.log(`Generated address: ${address}`);
    console.log(`Private key (WIF): ${privateKeyWIF}\n`);
    
    // 2. Mine some blocks to get spendable coins
    console.log('Mining blocks to get funds...');
    await regtest.generateBlocks(101); // Need 101 blocks for coinbase to be spendable
    console.log('Successfully mined 101 blocks\n');
    
    // 3. Send coins to our generated address
    console.log(`Sending 1 BTC to address ${address}...`);
    const amountBTC = 1; // 1 BTC
    const txid = await regtest.sendToAddress(address, amountBTC);
    console.log(`Transaction sent: ${txid}`);
    
    // Mine a block to confirm the transaction
    await regtest.generateBlocks(1);
    console.log('Transaction confirmed in block\n');
    
    // 4. Get transaction details to identify the UTXO
    console.log('Getting transaction details...');
    const tx = await regtest.getTransaction(txid);
    
    // Find the output index (vout) that matches our address
    let vout = null;
    for (let i = 0; i < tx.vout.length; i++) {
      const output = tx.vout[i];
      const outputAddresses = output.scriptPubKey.addresses || [];
      if (outputAddresses.includes(address)) {
        vout = i;
        break;
      }
    }
    
    if (vout === null) {
      throw new Error('Could not find UTXO for our address');
    }
    
    console.log(`Found UTXO at output index: ${vout}`);
    console.log(`UTXO amount: ${tx.vout[vout].value} BTC\n`);
    
    // 5. Create the burn transaction
    console.log('Creating Bitcoin burn transaction...');
    const txHex = await burnBitcoin(
      privateKeyWIF,
      txid,
      vout,
      1, // Fee rate (1 sat/byte is enough for regtest)
      {
        network: NETWORK, // Use regtest network
        getUTXOInfoFn: regtest.getUTXOInfo, // Use our regtest UTXO info function
        burnMessage: 'Regtest burning demonstration'
      }
    );
    
    console.log('\nBurn transaction created successfully!');
    
    // 6. Broadcast the transaction
    console.log('\nBroadcasting burn transaction...');
    const burnTxId = await regtest.broadcastTransaction(txHex);
    console.log(`Burn transaction broadcast! TxID: ${burnTxId}`);
    
    // 7. Mine a block to confirm the burn transaction
    console.log('\nMining a block to confirm the burn...');
    await regtest.generateBlocks(1);
    console.log('Burn transaction confirmed in block');
    
    // 8. Verify the burn transaction
    console.log('\nRetrieving and verifying burn transaction...');
    const burnTx = await regtest.getTransaction(burnTxId);
    
    // Check for OP_RETURN output
    let burnVerified = false;
    for (const output of burnTx.vout) {
      if (output.scriptPubKey.type === 'nulldata') {
        burnVerified = true;
        console.log('Found OP_RETURN output in transaction - UTXO successfully burned!');
        console.log(`Script: ${output.scriptPubKey.asm}`);
        break;
      }
    }
    
    if (!burnVerified) {
      console.log('Warning: Could not verify OP_RETURN output in burn transaction');
    }
    
    console.log('\nRegtest demonstration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run the demo if this script is executed directly
if (require.main === module) {
  runRegtestDemo()
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
} else {
  // Export for testing
  module.exports = { runRegtestDemo };
} 