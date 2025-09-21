// Debug utilities for troubleshooting SIWE integration issues

export function debugNetworkAndContract(provider, contractAddress, walletAddress) {
    return new Promise(async (resolve) => {
        try {
            const network = await provider.getNetwork();
            const code = contractAddress ? await provider.getCode(contractAddress) : '0x';
            const balance = walletAddress ? await provider.getBalance(walletAddress) : '0';

            const debug = {
                network: {
                    name: network.name,
                    chainId: network.chainId,
                    ensAddress: network.ensAddress
                },
                addresses: {
                    contract: contractAddress,
                    wallet: walletAddress,
                    contractHasCode: code !== '0x',
                    codeLength: code.length
                },
                balances: {
                    ethBalance: balance.toString()
                },
                timestamp: new Date().toISOString()
            };

            console.log('🔍 Network & Contract Debug Info:', debug);
            resolve(debug);
        } catch (error) {
            console.error('❌ Debug failed:', error);
            resolve({ error: error.message });
        }
    });
}

export function logBalanceError(error, context) {
    console.group('💥 Balance Error Details');
    console.error('Error:', error);
    console.log('Context:', context);
    console.log('Suggestions:');

    if (error.message.includes('could not decode result data')) {
        console.log('  • Contract may not exist at this address on current network');
        console.log('  • Check if you\'re on the correct network (mainnet vs testnet)');
        console.log('  • Verify the contract address is correct');
    }

    if (error.message.includes('BAD_DATA')) {
        console.log('  • Contract returned empty data (0x)');
        console.log('  • Contract may not be deployed');
        console.log('  • Function signature may be wrong');
    }

    if (context?.contractAddress) {
        console.log(`  • Contract Address: ${context.contractAddress}`);
        console.log(`  • Check on block explorer for your network`);
    }

    console.groupEnd();
}
