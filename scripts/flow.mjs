const base=process.env.PR_BASE||'',head=process.env.PR_HEAD||'',body=process.env.PR_BODY||'';
const work=/^(feature|feat|fix|chore|docs|refactor|test|ci|build|perf)\//,release=/^release\/v\d+\.\d+\.\d+$/;
if(process.argv[2]!=='check-pull-request')throw Error('unsupported command');
const valid=(base==='develop'&&work.test(head))||(base==='main'&&release.test(head));
if(!valid)throw Error(`invalid branch flow: ${head} -> ${base}; required work -> develop or release/vX.Y.Z -> main`);
if(base==='main'&&!/\[[xX]\].*docs\/VERIFY\.md/.test(body))throw Error('release PR must include checked docs/VERIFY.md confirmation');
console.log('branch rules passed');
