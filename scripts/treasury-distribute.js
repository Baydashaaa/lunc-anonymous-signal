// ─── TREASURY DISTRIBUTION SCRIPT ───────────────────────────
// Runs every Wednesday at 20:00 UTC via GitHub Actions
// Distributes Protocol Treasury balance to 4 wallets:
//   20% → REWARDS_WALLET  (REP weekly rewards)
//   20% → RESERVE_WALLET  (protocol stability buffer)
//   50% → LIQUIDITY_WALLET (manual liquidity provision)
//   10% → DEV_WALLET       (development & operations)

import { LCDClient, MnemonicKey, MsgSend, Coin, MsgMultiSend } from '@terra-money/feather.js';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import fetch from 'node-fetch';

// ── Wallets ───────────────────────────────────────────────────
const WALLETS = {
  treasury:  'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt',
  rewards:   'terra1ty6fxd9u0jzae5lpzcs56rfclxg4q32hw5x4ce',
  reserve:   'terra10q6syec2e27x8g76a0mvm3frgvarl5dz27a2jz',
  liquidity: 'terra1gukarslv6c8n0s2259822l7059putpqxz405su',
  dev:       'terra17g55uzkm6cr5fcl3vzcrmu73v8as4yvf2kktzr',
};

// ── Distribution percentages ──────────────────────────────────
const DISTRIBUTION = {
  rewards:   0.20,
  reserve:   0.20,
  liquidity: 0.50,
  dev:       0.10,
};

// ── Network config ────────────────────────────────────────────
const LCD_ENDPOINTS = [
  'https://terra-classic-lcd.publicnode.com',
  'https://lcd.terraclassic.community',
];
const CHAIN_ID = 'columbus-5';

// ── Minimum balance to distribute (1M LUNC) ───────────────────
const MIN_BALANCE_ULUNA = 1_000_000_000_000; // 1,000,000 LUNC

// ── Gas settings ─────────────────────────────────────────────
const GAS_PRICE_ULUNA = '28.325';
const GAS_ADJUSTMENT   = 1.4;

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

async function run() {
  const mnemonic = process.env.TREASURY_MNEMONIC;
  if (!mnemonic) throw new Error('ORACLE_MNEMONIC env variable not set');

  console.log('=== Treasury Distribution Script ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Treasury: ${WALLETS.treasury}`);

  // Fetch treasury balance
  console.log('\nFetching treasury balance...');
  const balanceUluna = await fetchBalance(WALLETS.treasury);
  const balanceLunc  = Number(balanceUluna) / 1_000_000;
  console.log(`Balance: ${balanceLunc.toLocaleString()} LUNC (${balanceUluna} uluna)`);

  // Check minimum threshold
  if (balanceUluna < BigInt(MIN_BALANCE_ULUNA)) {
    console.log(`\nBalance below minimum threshold (${MIN_BALANCE_ULUNA / 1_000_000} LUNC). Skipping distribution.`);
    process.exit(0);
  }

  // Reserve ~0.5M LUNC for gas fees across all transactions
  const GAS_RESERVE = BigInt(500_000_000_000); // 500,000 LUNC
  const distributableUluna = balanceUluna - GAS_RESERVE;

  console.log(`\nDistributable amount: ${Number(distributableUluna) / 1_000_000} LUNC`);

  // Calculate amounts
  const amounts = {};
  let totalAllocated = BigInt(0);
  for (const [key, pct] of Object.entries(DISTRIBUTION)) {
    amounts[key] = BigInt(Math.floor(Number(distributableUluna) * pct));
    totalAllocated += amounts[key];
  }

  console.log('\nDistribution plan:');
  for (const [key, amt] of Object.entries(amounts)) {
    console.log(`  ${key.padEnd(12)} ${(DISTRIBUTION[key]*100).toFixed(0).padStart(3)}%  →  ${(Number(amt)/1_000_000).toLocaleString()} LUNC  →  ${WALLETS[key]}`);
  }

  // Init LCD client
  const lcd = new LCDClient({
    [CHAIN_ID]: {
      lcd:      LCD_ENDPOINTS[0],
      chainID:  CHAIN_ID,
      gasAdjustment: GAS_ADJUSTMENT,
      gasPrices: { uluna: GAS_PRICE_ULUNA },
      prefix:   'terra',
    },
  });

  // Init wallet from mnemonic
  const mk     = new MnemonicKey({ mnemonic });
  const wallet = lcd.wallet(mk);
  const sender = mk.accAddress('terra');

  if (sender !== WALLETS.treasury) {
    throw new Error(`Mnemonic address mismatch: expected ${WALLETS.treasury}, got ${sender}`);
  }

  console.log(`\nSigner: ${sender}`);

  // Build transactions — one per recipient to avoid complexity
  const recipients = [
    { key: 'rewards',   wallet: WALLETS.rewards   },
    { key: 'reserve',   wallet: WALLETS.reserve   },
    { key: 'liquidity', wallet: WALLETS.liquidity },
    { key: 'dev',       wallet: WALLETS.dev       },
  ];

  let accountInfo;
  try {
    accountInfo = await lcd.auth.accountInfo(sender);
  } catch(e) {
    throw new Error(`Failed to fetch account info: ${e.message}`);
  }

  let sequence = accountInfo.getSequenceNumber();

  for (const { key, wallet: recipient } of recipients) {
    const amount = amounts[key];
    if (amount <= BigInt(0)) {
      console.log(`\nSkipping ${key} — zero amount`);
      continue;
    }

    console.log(`\nSending ${(Number(amount)/1_000_000).toLocaleString()} LUNC to ${key} (${recipient})...`);

    try {
      const msg = new MsgSend(sender, recipient, { uluna: amount.toString() });

      const tx = await wallet.createAndSignTx({
        msgs:      [msg],
        memo:      `Treasury distribution — ${key} ${(DISTRIBUTION[key]*100).toFixed(0)}%`,
        sequence,
        chainID:   CHAIN_ID,
      });

      const result = await lcd.tx.broadcast(tx, CHAIN_ID);

      if (result.code !== 0) {
        console.error(`  ERROR: tx failed with code ${result.code}: ${result.raw_log}`);
      } else {
        console.log(`  SUCCESS: ${result.txhash}`);
        sequence++;
      }

      // Wait 6 seconds between transactions
      await new Promise(r => setTimeout(r, 6000));

    } catch(e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  console.log('\n=== Distribution complete ===');
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
