// ─── TREASURY DISTRIBUTION SCRIPT ───────────────────────────
// Uses @cosmjs for signing — no feather.js dependency
// Distributes Protocol Treasury balance to 4 wallets:
//   20% → REWARDS_WALLET   (REP weekly rewards)
//   20% → RESERVE_WALLET   (protocol stability buffer)
//   50% → LIQUIDITY_WALLET (manual liquidity provision)
//   10% → DEV_WALLET        (development & operations)

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';

const WALLETS = {
  treasury:  'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt',
  rewards:   'terra1ty6fxd9u0jzae5lpzcs56rfclxg4q32hw5x4ce',
  reserve:   'terra10q6syec2e27x8g76a0mvm3frgvarl5dz27a2jz',
  liquidity: 'terra1gukarslv6c8n0s2259822l7059putpqxz405su',
  dev:       'terra17g55uzkm6cr5fcl3vzcrmu73v8as4yvf2kktzr',
};

const DISTRIBUTION = {
  rewards:   0.20,
  reserve:   0.20,
  liquidity: 0.50,
  dev:       0.10,
};

const RPC_ENDPOINTS = [
  'https://terra-classic-rpc.publicnode.com',
  'https://rpc.terraclassic.community',
];
const LCD_ENDPOINTS = [
  'https://terra-classic-lcd.publicnode.com',
  'https://lcd.terraclassic.community',
];
const GAS_PRICE   = GasPrice.fromString('28.325uluna');
const GAS_RESERVE = 500_000_000; // 500 LUNC reserved for gas
const MIN_BALANCE = 100_000_000_000; // 100,000 LUNC minimum

async function fetchBalance(address) {
  for (const lcd of LCD_ENDPOINTS) {
    try {
      const res  = await fetch(`${lcd}/cosmos/bank/v1beta1/balances/${address}`);
      if (!res.ok) continue;
      const data = await res.json();
      const amt  = data.balances?.find(b => b.denom === 'uluna')?.amount || '0';
      return BigInt(amt);
    } catch(e) {
      console.warn(`LCD ${lcd} failed:`, e.message);
    }
  }
  throw new Error('All LCD endpoints failed');
}

async function getClient(mnemonic) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'terra' });
  const [account] = await wallet.getAccounts();
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const client = await SigningStargateClient.connectWithSigner(rpc, wallet, { gasPrice: GAS_PRICE });
      console.log(`Connected: ${rpc}`);
      return { client, address: account.address };
    } catch(e) {
      console.warn(`RPC ${rpc} failed:`, e.message);
    }
  }
  throw new Error('All RPC endpoints failed');
}

async function run() {
  const mnemonic = process.env.TREASURY_MNEMONIC;
  if (!mnemonic) throw new Error('TREASURY_MNEMONIC not set');

  console.log('=== Treasury Distribution ===');
  console.log(`Date: ${new Date().toISOString()}`);

  const balanceUluna = await fetchBalance(WALLETS.treasury);
  console.log(`Balance: ${(Number(balanceUluna)/1_000_000).toLocaleString()} LUNC`);

  if (balanceUluna < BigInt(MIN_BALANCE)) {
    console.log('Below minimum threshold (1,000,000 LUNC). Skipping.');
    process.exit(0);
  }

  const distributable = balanceUluna - BigInt(GAS_RESERVE);
  const amounts = {};
  for (const [key, pct] of Object.entries(DISTRIBUTION)) {
    amounts[key] = BigInt(Math.floor(Number(distributable) * pct));
  }

  console.log('\nPlan:');
  for (const [key, amt] of Object.entries(amounts)) {
    console.log(`  ${key.padEnd(12)} ${DISTRIBUTION[key]*100}%  →  ${(Number(amt)/1_000_000).toLocaleString()} LUNC  →  ${WALLETS[key]}`);
  }

  const { client, address } = await getClient(mnemonic);
  if (address !== WALLETS.treasury) throw new Error(`Address mismatch: got ${address}`);
  console.log(`\nSigner: ${address}`);

  let ok = 0;
  for (const [key, to] of [['rewards', WALLETS.rewards], ['reserve', WALLETS.reserve], ['liquidity', WALLETS.liquidity], ['dev', WALLETS.dev]]) {
    const amount = amounts[key];
    if (!amount || amount <= 0n) continue;
    console.log(`\nSending ${(Number(amount)/1_000_000).toLocaleString()} LUNC → ${key}...`);
    try {
      const res = await client.sendTokens(address, to, [{ denom: 'uluna', amount: amount.toString() }], 'auto', `Treasury: ${key} ${DISTRIBUTION[key]*100}%`);
      if (res.code && res.code !== 0) { console.error(`  ERROR ${res.code}: ${res.rawLog}`); }
      else { console.log(`  OK: ${res.transactionHash}`); ok++; }
    } catch(e) { console.error(`  FAILED: ${e.message}`); }
    await new Promise(r => setTimeout(r, 6000));
  }

  console.log(`\n=== Done: ${ok}/4 successful ===`);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
