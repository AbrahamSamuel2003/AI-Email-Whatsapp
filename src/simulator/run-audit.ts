import { LogAuditorAgent } from '../services/monitoring/log-auditor.agent.js';

async function runAudit() {
  console.log('\nScanning system health and diagnostic logs...\n');
  const summary = await LogAuditorAgent.formatTerminalAudit();
  console.log(summary);
  process.exit(0);
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
