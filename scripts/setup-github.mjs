// Applies the repository settings the branch flow relies on, with the maintainer's own gh login.
// Safe to run again, and --dry-run shows the changes without making them: npm run setup:github -- --dry-run
import { execFileSync } from 'node:child_process';

const REPOSITORY = 'Weslley08/ulanzi-deck-system-monitor-pro';
const ENVIRONMENT = 'release-validation';
const RELEASE_PATTERN = 'release/v*';

// A required check that never reports blocks every merge, so these are the names seen on a real pull request.
// CodeQL reports even where its base was never analyzed: it did on the first pull request to develop.
const CHECKS = ['Test (windows-latest)', 'Test (macos-latest)', 'Test (ubuntu-latest)', 'Coverage', 'Package', 'Security', 'analyze', 'CodeQL', 'review', 'Workflows', 'Branch flow'];

const dryRun = process.argv.includes('--dry-run');

function gh(args, body) {
  const input = body === undefined ? undefined : JSON.stringify(body);
  return execFileSync('gh', [...args, ...(input ? ['--input', '-'] : [])], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] });
}

/** Anything that changes the repository goes through here. */
function change(description, args, body) {
  if (dryRun) {
    console.log(`Would: ${description}\n  gh ${args.join(' ')}${body ? `\n  ${JSON.stringify(body)}` : ''}`);
    return;
  }
  gh(args, body);
  console.log(`Done: ${description}`);
}

// Not strict: main holds merge commits that develop never gets, so "up to date with the base" could never be true.
const protection = (contexts) => ({
  required_status_checks: { strict: false, contexts },
  enforce_admins: true,
  required_pull_request_reviews: { required_approving_review_count: 0 },
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
});

function findReleaseRule() {
  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { id branchProtectionRules(first: 50) { nodes { id pattern } } }
  }`;
  const [owner, name] = REPOSITORY.split('/');
  const { data } = JSON.parse(gh(['api', 'graphql'], { query, variables: { owner, name } }));
  return { repositoryId: data.repository.id, rule: data.repository.branchProtectionRules.nodes.find(({ pattern }) => pattern === RELEASE_PATTERN) };
}

/** The REST API takes no wildcards, so a rule for every release branch has to go through GraphQL. */
function protectReleaseBranches() {
  const { repositoryId, rule } = findReleaseRule();
  const settings = {
    requiresApprovingReviews: true,
    requiredApprovingReviewCount: 0,
    requiresStatusChecks: true,
    requiresStrictStatusChecks: false,
    requiredStatusCheckContexts: CHECKS,
    isAdminEnforced: true,
    allowsForcePushes: false,
    // Publishing deletes the release branch.
    allowsDeletions: true,
  };
  const mutation = rule
    ? { query: 'mutation($input: UpdateBranchProtectionRuleInput!) { updateBranchProtectionRule(input: $input) { clientMutationId } }', variables: { input: { branchProtectionRuleId: rule.id, pattern: RELEASE_PATTERN, ...settings } } }
    : { query: 'mutation($input: CreateBranchProtectionRuleInput!) { createBranchProtectionRule(input: $input) { clientMutationId } }', variables: { input: { repositoryId, pattern: RELEASE_PATTERN, ...settings } } };
  change(`protect ${RELEASE_PATTERN}`, ['api', 'graphql'], mutation);
}

function environmentHasPolicy() {
  try {
    const { branch_policies: policies } = JSON.parse(gh(['api', `repos/${REPOSITORY}/environments/${ENVIRONMENT}/deployment-branch-policies`]));
    return policies.some(({ name }) => name === RELEASE_PATTERN);
  } catch {
    return false;
  }
}

change('allow merge commits only, and turn on auto-merge', ['api', '-X', 'PATCH', `repos/${REPOSITORY}`], {
  allow_merge_commit: true,
  allow_squash_merge: false,
  allow_rebase_merge: false,
  allow_auto_merge: true,
});
change(`create the ${ENVIRONMENT} environment`, ['api', '-X', 'PUT', `repos/${REPOSITORY}/environments/${ENVIRONMENT}`], {
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
});
if (!environmentHasPolicy()) {
  change(`give that environment to ${RELEASE_PATTERN} only`, ['api', '-X', 'POST', `repos/${REPOSITORY}/environments/${ENVIRONMENT}/deployment-branch-policies`], { name: RELEASE_PATTERN, type: 'branch' });
}
for (const branch of ['develop', 'main']) {
  change(`protect ${branch}`, ['api', '-X', 'PUT', `repos/${REPOSITORY}/branches/${branch}/protection`], protection(CHECKS));
}
protectReleaseBranches();
