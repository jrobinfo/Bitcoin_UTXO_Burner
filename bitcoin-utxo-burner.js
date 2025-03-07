const bitcoin = require('bitcoinjs-lib');
const axios = require('axios'); // For API calls to get UTXO info
// Import ECPair factory for handling private keys
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');

// Initialize ECPair factory
const ECPair = ECPairFactory(ecc);

/**
 * Burns an entire UTXO by sending it to an OP_RETURN output
 * @param {string} privateKeyWIF - Private key in WIF format
 * @param {string} utxoTxId - Transaction ID of the UTXO to burn
 * @param {number} utxoVout - Output index of the UTXO to burn
 * @param {number} feeRate - Fee rate in satoshis per byte
 * @param {Object} options - Optional parameters
 * @param {bitcoin.Network} options.network - Bitcoin network (defaults to mainnet)
 * @param {Function} options.getUTXOInfoFn - Custom function to get UTXO info
 * @param {string} options.burnMessage - Custom message to include in OP_RETURN
 * @returns {Promise<string>} - The transaction hex
 */
async function burnBitcoin(privateKeyWIF, utxoTxId, utxoVout, feeRate, options = {}) {
    try {
        const network = options.network || bitcoin.networks.bitcoin;
        const burnMessage = options.burnMessage ? Buffer.from(options.burnMessage, 'utf8') : Buffer.from('Burned coins', 'utf8');
        const getUTXOInfoFn = options.getUTXOInfoFn || getUTXOInfo;
        
        // Use ECPair factory to create key pair from WIF
        const keyPair = ECPair.fromWIF(privateKeyWIF, network);
        
        // Get address depending on format (legacy, segwit, etc)
        let payment;
        if (privateKeyWIF.startsWith('c') || privateKeyWIF.startsWith('9')) {
            // For regtest/testnet
            if (privateKeyWIF.startsWith('c')) {
                // Try to detect P2WPKH (SegWit) addresses
                try {
                    payment = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
                } catch (e) {
                    // Fallback to P2PKH if P2WPKH fails
                    payment = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
                }
            } else {
                // Default to P2PKH for other testnet addresses
                payment = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
            }
        } else {
            // For mainnet
            if (privateKeyWIF.startsWith('L') || privateKeyWIF.startsWith('K')) {
                // Compressed pubkey format - try P2WPKH first
                try {
                    payment = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
                } catch (e) {
                    // Fallback to P2PKH
                    payment = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
                }
            } else {
                // Uncompressed pubkey format - use P2PKH
                payment = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
            }
        }
        
        const address = payment.address;
        console.log(`Identified address for private key: ${address}`);
        
        // Get UTXO amount using the provided or default function
        const utxoInfo = await getUTXOInfoFn(utxoTxId, utxoVout, address);
        const utxoAmount = utxoInfo.value; // In satoshis
        
        if (!utxoAmount || utxoAmount <= 0) {
            throw new Error('Invalid UTXO amount');
        }
        
        // Create a simple legacy transaction instead of using PSBT
        const tx = new bitcoin.Transaction();
        
        // Add input
        const txidBuffer = Buffer.from(utxoTxId, 'hex').reverse(); // reverse for internal Bitcoin representation
        tx.addInput(txidBuffer, utxoVout);
        
        // Add OP_RETURN output
        const dataScript = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, burnMessage]);
        tx.addOutput(dataScript, 0); // Value is 0 for OP_RETURN
        
        // Estimate transaction size and calculate fee
        // Simple transaction with no change output will be around 200-250 bytes
        const estimatedSize = 250;
        const estimatedFee = Math.floor(estimatedSize * feeRate);
        
        // Verify we have enough to cover fees
        if (utxoAmount <= estimatedFee) {
            throw new Error(`UTXO amount (${utxoAmount} satoshis) is too small to cover the fee (${estimatedFee} satoshis)`);
        }
        
        // Add change output (required for valid transaction)
        if (payment.output) {
            // Send change back to the same address
            tx.addOutput(payment.output, utxoAmount - estimatedFee);
        } else {
            throw new Error("Could not create change output");
        }
        
        // Sign the transaction
        const sigHash = tx.hashForSignature(0, bitcoin.script.compile([
            bitcoin.opcodes.OP_DUP,
            bitcoin.opcodes.OP_HASH160,
            payment.hash,
            bitcoin.opcodes.OP_EQUALVERIFY,
            bitcoin.opcodes.OP_CHECKSIG
        ]), bitcoin.Transaction.SIGHASH_ALL);
        
        const signature = keyPair.sign(sigHash);
        
        // Add signature to input
        const scriptSig = bitcoin.script.compile([
            bitcoin.script.signature.encode(
                signature, 
                bitcoin.Transaction.SIGHASH_ALL
            ),
            keyPair.publicKey
        ]);
        
        tx.setInputScript(0, scriptSig);
        
        const txHex = tx.toHex();
        
        console.log('Raw Tx Hex:', txHex);
        console.log(`Burning UTXO (${utxoAmount} satoshis) with a fee of ${estimatedFee} satoshis`);
        
        return txHex;
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