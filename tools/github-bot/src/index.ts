import { Probot } from "probot";
import { commands, isValidBody, isValidBranchName, isValidUser } from "./tools";

export default (app: Probot) => {
  commands(app, "generate-screenshots", async (context, data) => {
    const { octokit, payload } = context;

    if (context.isBot) return;

    await octokit.rest.reactions.createForIssueComment({
      ...context.repo(),
      comment_id: context.payload.comment.id,
      content: "rocket",
    });

    await octokit.actions.createWorkflowDispatch({
      ...context.repo(),
      workflow_id: "generate-screenshots.yml",
      ref: "develop",
      inputs: {
        number: `${data.number}`,
        login: `${payload.issue.user.login}`,
      },
    });
  });

  // trigger to autoclose PR when not respecting guidelines
  app.on(["pull_request.opened", "pull_request.reopened"], async (context) => {
    const { payload, octokit } = context;
    const repository = context.repo();

    if (repository.repo !== "ledger-live") return;

    const branch = payload.pull_request.head.ref;
    const login = payload.pull_request.user.login;

    if (!isValidUser(login)) return;

    const isBranchValid = isValidBranchName(branch);
    const isBodyValid = isValidBody(payload.pull_request.body);

    if (isBranchValid && isBodyValid) return;

    let body =
      `❌ @${login}\n\n` +
      "#### Unfortunately this PR does not comply with the [Contributing Conventions](https://github.com/LedgerHQ/ledger-live/blob/develop/CONTRIBUTING.md) and will be closed automatically.\n" +
      "\n" +
      "Feel free to reopen this PR once you have browsed through the guidelines.\n" +
      "\n" +
      "-------\n" +
      "\n" +
      "Found Issues:\n";

    let comment;

    if (!isBranchValid) {
      body += `- _the branch name \`${branch}\` is invalid_\n`;
    }

    if (!isBodyValid) {
      body += `- _you overrode or did not fill in the [pull request template](https://github.com/LedgerHQ/ledger-live/blob/develop/.github/pull_request_template.md) properly_\n`;
    }
    comment = context.issue({
      body,
    });

    await octokit.issues.createComment(comment);
    await octokit.pulls.update({
      owner: repository.owner,
      repo: repository.repo,
      pull_number: payload.number,
      state: "closed",
    });
  });
};
