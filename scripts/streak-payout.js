// scripts/streak-payout.js
import { LCDClient, MnemonicKey, MsgSend, Coins } from '@terra-money/terra.js';

const WORKER_URL     = process.env.WORKER_URL;
const ACTIONS_SECRET = process.env.ACTIONS_SECRET;
const MNEMONIC       = process.env.RESERVE_MNEMONIC;

async function main() {
  const res = await fetch(`${WORKER_URL}/streak/pending-payouts?secret=${ACTIONS_SECRET}`);
  if (!res.ok) { console.error('Failed to fetch payouts:', await res.text()); process.exit(1); }
  const { payouts } = await res.json();

  if (!payouts.length) { console.log('No pending streak payouts.'); return; }
  console.log(`Found ${payouts.length} pending payout(s).`);

  const lcd = new LCDClient({
    URL: 'https://terra-classic-lcd.publicnode.com',
    chainID: 'columbus-5',
    gasPrices: { uluna: '28.325' },
    gasAdjustment: 1.4,
  });

  const mk     = new MnemonicKey({ mnemonic: MNEMONIC });
  const wallet = lcd.wallet(mk);

  for (const payout of payouts) {
    try {
      console.log(`Processing payout for ${payout.wallet} (milestone ${payout.milestone})`);

      const msg = new MsgSend(
        mk.accAddress,
        payout.to,
        new Coins({ uluna: payout.amount })
      );

      const tx = await wallet.createAndSignTx({
        msgs: [msg],
        memo: `streak:milestone:${payout.milestone}:${payout.wallet.slice(0, 16)}`,
      });

      const result = await lcd.tx.broadcast(tx);

      if (result.code && result.code !== 0) {
        console.error(`Tx failed for ${payout.wallet}:`, result.raw_log);
        continue;
      }

      console.log(`✅ Paid ${payout.amount / 1e6} LUNC → ${payout.to} | tx: ${result.txhash}`);

      const markRes = await fetch(`${WORKER_URL}/streak/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: payout.key, txHash: result.txhash, secret: ACTIONS_SECRET }),
      });
      if (!markRes.ok) console.error('Failed to mark paid:', await markRes.text());

    } catch (err) {
      console.error(`Error processing payout for ${payout.wallet}:`, err.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
