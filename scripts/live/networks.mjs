export const networks = {
  ethereum: {
    chainId: 'eip155:1', rpcChainId: '0x1', graphNetwork: 'mainnet', name: 'Ethereum mainnet',
    token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', rpcEnv: 'ETHEREUM_RPC_URL',
    publicRpc: 'https://ethereum-rpc.publicnode.com',
  },
  base: {
    chainId: 'eip155:8453', rpcChainId: '0x2105', graphNetwork: 'base', name: 'Base mainnet',
    token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', rpcEnv: 'BASE_RPC_URL',
    publicRpc: 'https://mainnet.base.org',
  },
};
export const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
