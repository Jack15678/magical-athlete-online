import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// A reviewed commit can request a focused feature check without disabling the
// build/type/packaging checks. Manual dispatch always overrides that request.
const requested = process.env.REQUESTED_SUITE?.trim();
const message = execFileSync('git', ['show', '-s', '--format=%B', process.env.HEAD_SHA || 'HEAD'], { encoding: 'utf8' });
const suite = requested || (/^Validation-Scope:\s*ability-interactions\s*$/m.test(message) ? 'ability-interactions' : 'eight-only');
if (!['all', 'eight-only', 'ability-interactions'].includes(suite)) throw new Error(`Unknown validation suite: ${suite}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `suite=${suite}\n`);
console.log(`Validation suite: ${suite}`);
