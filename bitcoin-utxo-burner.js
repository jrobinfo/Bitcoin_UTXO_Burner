const bitcoin = require('bitcoinjs-lib');
const axios = require('axios'); // For API calls to get UTXO info

/**
 * Burns an entire UTXO by sending it to an OP_RETURN output
 * @param {string} privateKeyWIF - Private key in WIF format
 * @param {string} utxoTxId - Transaction ID of the UTXO to burn
 * @param {number} utxoVout - Output index of the UTXO to burn
 * @param {number} feeRate - Fee rate in satoshis per byte
 * @returns {Promise<string>} - The transaction hex
 */
async function burnBitcoin(privateKeyWIF, utxoTxId, utxoVout, feeRate) {
    try {
        const network = bitcoin.networks.bitcoin;
        const keyPair = bitcoin.ECPair.fromWIF(privateKeyWIF, network);
        const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
        
        // Get UTXO amount (in practice, you would use a Bitcoin API or your node)
        const utxoInfo = await getUTXOInfo(utxoTxId, utxoVout, address);
        const utxoAmount = utxoInfo.value; // In satoshis
        
        if (!utxoAmount || utxoAmount <= 0) {
            throw new Error('Invalid UTXO amount');
        }
        
        const txb = new bitcoin.TransactionBuilder(network);
        txb.addInput(utxoTxId, utxoVout);
        
        // Create OP_RETURN burn output
        const burnMessage = Buffer.from('Burned coins', 'utf8');
        const dataScript = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, burnMessage]);
        txb.addOutput(dataScript, 0); // Value is 0 for OP_RETURN
        
        // Estimate transaction size and calculate fee
        const estimatedSize = txb.buildIncomplete().toHex().length / 2 + 150; // Add buffer for signatures
        const estimatedFee = Math.floor(estimatedSize * feeRate);
        
        // Verify we have enough to cover fees
        if (utxoAmount <= estimatedFee) {
            throw new Error(`UTXO amount (${utxoAmount} satoshis) is too small to cover the fee (${estimatedFee} satoshis)`);
        }
        
        // Sign the transaction
        txb.sign(0, keyPair);
        const tx = txb.build();
        const txHex = tx.toHex();
        
        console.log('Raw Tx Hex:', txHex);
        console.log(`Burning entire UTXO (${utxoAmount} satoshis) minus fee (${estimatedFee} satoshis)`);
        console.log(`Total burned: ${utxoAmount - estimatedFee} satoshis`);
        
        return txHex; // This can be broadcast via a service like Blockstream.info
    } catch (error) {
        throw new Error(`Failed to create burn transaction: ${error.message}`);
    }
}

/**
 * Gets UTXO information using a Bitcoin API
 * In production, replace this with your preferred Bitcoin API or node connection
 */
async function getUTXOInfo(txid, vout, address) {
    try {
        // Example using Blockstream API - replace with your preferred service
        const response = await axios.get(`https://blockstream.info/api/tx/${txid}`);
        
        if (!response.data || !response.data.vout || !response.data.vout[vout]) {
            throw new Error('UTXO not found');
        }
        
        const output = response.data.vout[vout];
        
        // Verify the UTXO belongs to the address
        if (output.scriptpubkey_address !== address) {
            throw new Error('UTXO does not belong to the provided address');
        }
        
        return {
            value: output.value, // In satoshis
            scriptPubKey: output.scriptpubkey
        };
    } catch (error) {
        throw new Error(`Failed to fetch UTXO data: ${error.message}`);
    }
}

// Example usage (replace with real values)
// burnBitcoin('YOUR_WIF_KEY', 'PREVIOUS_TX_HASH', 0, 1)
//     .then(txHex => console.log('Transaction created successfully'))
//     .catch(err => console.error('Burn failed:', err));

module.exports = { burnBitcoin };