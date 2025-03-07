# Bitcoin UTXO Burner

A Node.js tool for permanently burning Bitcoin by sending UTXOs to OP_RETURN outputs.

## Overview

This utility allows users to permanently remove Bitcoin from circulation by creating transactions that send the entire value of a UTXO (minus network fees) to an OP_RETURN output. This effectively makes the Bitcoin unspendable, "burning" it permanently.

## Warning

**USE AT YOUR OWN RISK**: Burning Bitcoin is irreversible. Once a transaction is confirmed, the funds cannot be recovered. This tool should only be used by users who fully understand the implications and have verified the code thoroughly.

## Features

- Burn an entire UTXO to an OP_RETURN output
- Customize the burn message
- Automatically calculates and deducts network fees
- Produces raw transaction hex that can be broadcast through various services

## Prerequisites

- Node.js (v12.0.0 or higher)
- npm (v6.0.0 or higher)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/Bitcoin_UTXO_Burner.git
cd Bitcoin_UTXO_Burner

# Install dependencies
npm install
```

## Usage

```javascript
const { burnBitcoin } = require('./bitcoin-utxo-burner');

// Parameters:
// 1. Private key in WIF format
// 2. Transaction ID of the UTXO to burn
// 3. Output index of the UTXO to burn
// 4. Fee rate in satoshis per byte
burnBitcoin('YOUR_PRIVATE_KEY_WIF', 'TX_ID', 0, 2)
  .then(txHex => {
    console.log('Transaction created successfully');
    console.log('Raw transaction hex:', txHex);
    // Broadcast the transaction using a service like Blockstream.info
  })
  .catch(err => console.error('Burn failed:', err));
```

## Broadcasting the Transaction

After generating the transaction hex, you can broadcast it using:

1. A Bitcoin node with the `sendrawtransaction` RPC command
2. A block explorer's API service like Blockstream.info
3. Any other Bitcoin transaction broadcasting service

## Security Considerations

- Never share your private keys
- Test with minimal amounts before burning significant funds
- Verify all transaction details before broadcasting
- Consider running the code on an air-gapped computer for extra security

## How It Works

1. The script takes a transaction input (UTXO) owned by the provided private key
2. It creates a transaction with an OP_RETURN output (with zero value)
3. Network fees are calculated and subtracted from the input amount
4. The remaining amount is effectively burned as it becomes unspendable

## Customization

You can customize the burn message by modifying the `burnMessage` variable in the `burnBitcoin` function:

```javascript
const burnMessage = Buffer.from('Your custom message here', 'utf8');
```

## Dependencies

- [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) - For Bitcoin transaction creation
- [axios](https://github.com/axios/axios) - For API requests to fetch UTXO data

## License

MIT

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk. The author(s) disclaim all liability for any loss of Bitcoin resulting from the use of this tool. 