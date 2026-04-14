// scripts/rep-rewards.js
// Runs every Tuesday 20:00 UTC via GitHub Actions
// Pays REP rewards to top 20% contributors from REP Rewards wallet

import { LCDClient, MnemonicKey, MsgSend, Coins } from '@terra-money/terra.js';

const WORKER_URL     = process.env.WORKER_URL;
const ACTIONS_SECRET = process.env.ACTIONS_SECRET;
const MNEMONIC       = process.env.REWARDS_MNEMONIC;
const REWARDS_WALLET = 'terra1ty6fxd9u0jzae5lpzcs56rfclxg4q32hw5x4ce';

async function main() {
  console.log('🏆 REP Rewards payout starting...');

  // 1. Fetch weekly leaderboard
  const res = await fetch(`${WORKER_URL}/rep/weekly-leaderboard?secret=${ACTIONS_SECRET}`);
  if (!res.ok) { console.error('Failed to fetch leaderboard:', await res.text()); process.exit(1); }
  const data = await res.json();

  console.log(`📊 Participants this week: ${data.totalParticipants}`);
  console.log(`📊 Min required: ${data.minParticipants}`);

  if (!data.eligible) {
    console.log(`⏳ ROLLOVER — not enough participants (${data.totalParticipants}/${data.minParticipants}). Pool carries over.`);
    return;
  }

  console.log(`✅ Eligible! Paying top ${data.topCount} wallets.`);

  // 2. Setup LCD + wallet
  const lcd = new LCDClient({
    URL: 'https://terra-classic-lcd.publicnode.com',
    chainID: 'columbus-5',
    gasPrices: { uluna: '28.325' },
    gasAdjustment: 1.4,
  });

  const mk     = new MnemonicKey({ mnemonic: MNEMONIC });
  const wallet = lcd.wallet(mk);

  // 3. Get rewards wallet balance
  const balRes  = await fetch('https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/balances/' + REWARDS_WALLET);
  const balData = await balRes.json();
  const balAmt  = parseInt(balData.balances?.find(b => b.denom === 'uluna')?.amount || '0');
  // Use full balance — this wallet IS already the 20% REP Rewards allocation from Treasury
  // Reserve ~5% as gas buffer for sending multiple txs
  const GAS_RESERVE = Math.max(1_000_000, Math.floor(balAmt * 0.05));
  const poolUluna   = Math.floor(balAmt - GAS_RESERVE);

  console.log(`💰 Rewards wallet balance: ${balAmt / 1e6} LUNC`);
  console.log(`💰 This week's pool (full balance - gas): ${poolUluna / 1e6} LUNC`);

  if (poolUluna < 1000000) {
    console.log('⚠️ Pool too small (< 1 LUNC). Skipping payout.');
    return;
  }

  // 4. Calculate proportional payouts
  const totalRep = data.totalRep;
  const payouts  = data.topWallets.map(w => ({
    wallet:  w.wallet,
    rep:     w.rep,
    share:   w.rep / totalRep,
    uluna:   Math.floor((w.rep / totalRep) * poolUluna),
  })).filter(p => p.uluna >= 1000000); // min 1 LUNC

  console.log(`📤 Sending to ${payouts.length} wallets:`);
  payouts.forEach(p => console.log(`  ${p.wallet.slice(0,16)}... | ${p.rep} REP (${(p.share*100).toFixed(1)}%) → ${p.uluna/1e6} LUNC`));

  // 5. Send payouts
  for (const payout of payouts) {
    try {
      const msg = new MsgSend(mk.accAddress, payout.wallet, new Coins({ uluna: payout.uluna }));
      const tx  = await wallet.createAndSignTx({
        msgs: [msg],
        memo: `rep-rewards:week:${new Date().toISOString().slice(0,10)}`,
      });
      const result = await lcd.tx.broadcast(tx);
      if (result.code && result.code !== 0) {
        console.error(`❌ Tx failed for ${payout.wallet}:`, result.raw_log);
        continue;
      }
      console.log(`✅ Paid ${payout.uluna/1e6} LUNC → ${payout.wallet.slice(0,16)}... | tx: ${result.txhash}`);
    } catch(err) {
      console.error(`❌ Error for ${payout.wallet}:`, err.message);
    }
  }

  console.log('🎉 REP Rewards payout complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
