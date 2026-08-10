#!/usr/bin/env node

/**
 * Arc Commerce CLI & Webhook Simulation Utility
 * Supports Circle USDC checkout testing and agent credit ledger
 */

const packages = [
  { id: 'tier-starter', name: 'Starter Agent Pack', priceUsdc: '5.00', credits: 500 },
  { id: 'tier-pro', name: 'Pro Agent Pack', priceUsdc: '20.00', credits: 2500 },
  { id: 'tier-enterprise', name: 'Enterprise Fleet Pack', priceUsdc: '100.00', credits: 15000 },
];

const args = process.argv.slice(2);
const command = args[0] || 'help';

function main() {
  switch (command.toLowerCase()) {
    case 'packages': {
      console.log('\n📦 Available Arc Agent Credit Packages:');
      packages.forEach(p => {
        console.log(`  • [${p.id}] ${p.name} - ${p.priceUsdc} USDC (${p.credits} credits)`);
      });
      console.log('');
      break;
    }

    case 'checkout': {
      const pkgId = args[1] || 'tier-pro';
      const pkg = packages.find(p => p.id === pkgId) || packages[1];
      const sessionId = 'cs_' + Math.random().toString(36).substring(2, 14);
      console.log(`\n💳 Created Checkout Session:`);
      console.log(`  Session ID:      ${sessionId}`);
      console.log(`  Package:         ${pkg.name}`);
      console.log(`  Amount Due:      ${pkg.priceUsdc} USDC`);
      console.log(`  Credits Granted: ${pkg.credits}\n`);
      break;
    }

    case 'help':
    default: {
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║               ⚡ ARC COMMERCE CLI (CIRCLE / ARC)                 ║
║  USDC Payments & Agent Credit Purchasing for Arc Blockchain      ║
╚══════════════════════════════════════════════════════════════════╝

Commands:
  node cli/arc-commerce.js packages        List available credit packages
  node cli/arc-commerce.js checkout [tier] Simulate creating a USDC checkout session
      `);
      break;
    }
  }
}

main();
