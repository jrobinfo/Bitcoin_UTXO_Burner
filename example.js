const { burnBitcoin } = require('./bitcoin-utxo-burner');

// Replace these values with your actual Bitcoin private key and UTXO details
const privateKeyWIF = 'YOUR_PRIVATE_KEY_WIF';
const utxoTxId = 'YOUR_UTXO_TRANSACTION_ID';
const utxoVout = 0; // The output index in the transaction
const feeRate = 2; // Fee rate in satoshis per byte

/**
 * Warning: This is an example only. 
 * Running this with real values will burn your Bitcoin permanently.
 * Only use this with small test amounts that you are willing to lose.
 */
async function runExample() {
  try {
    console.log('Creating Bitcoin burn transaction...');
    console.log('WARNING: This will permanently burn the Bitcoin in the specified UTXO!');
    console.log('UTXO:', utxoTxId, utxoVout);
    
    // Uncomment the following lines to execute the burn
    // const txHex = await burnBitcoin(privateKeyWIF, utxoTxId, utxoVout, feeRate);
    // console.log('Transaction created successfully!');
    // console.log('Raw transaction hex:', txHex);
    // console.log('Broadcast this transaction using a service like Blockstream.info');
    
    console.log('Example completed without burning coins (transaction not created)');
    console.log('To actually burn coins, uncomment the execution code in this example');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

runExample(); 