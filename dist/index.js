"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const FeatureFlagLabelName = "Feature Flag Rollout";
async function run() {
    const actionToken = Core.getInput('action-token');
    const github = new github_1.GitHub(actionToken);
    console.log(`Reading issue ${github_1.context.issue.number} from ${github_1.context.issue.owner}/${github_1.context.issue.repo}`);
    const issue = await github.issues.get({
        issue_number: github_1.context.issue.number,
        owner: github_1.context.issue.owner,
        repo: github_1.context.issue.repo
    });
    const hasFeatureFlagLabel = issue.data.labels.some(label => label.name === FeatureFlagLabelName);
    if (!hasFeatureFlagLabel) {
        console.log(`Issue is not labelled with '${FeatureFlagLabelName}, ignoring.`);
        return;
    }
    // Extract the FF name from the title. The title is expected to be:
    //   "Roll out FEATURE_NAME"
    const matches = issue.data.title.match(/^Roll out (.*)$/i);
    if (!matches || matches.length == 0) {
        console.log(`No feature name was found in the title, ignoring.`);
        return;
    }
    const featureName = matches[0];
    console.log(`Found issue for feature ${featureName}`);
    // Extract the FF status from the body.  The body is expected to be (in Markdown):
    //
    // - [X] Stage Name 0
    // - [ ] Stage Name 1
    // - [ ] Stage Name 2
    const stageMatches = issue.data.body.match(/^- \[(x)?\] (.*)$/i);
    if (!stageMatches || stageMatches.length == 0) {
        console.log(`No stages were found in the title, ignoring.`);
        return;
    }
    console.log(`Found ${stageMatches.length}`);
    const pathToStatusPage = Core.getInput('path-to-status-page');
    console.log(`Writing status to: ${pathToStatusPage}`);
}
run()
    .then((response) => { console.log(`Finished running: ${response}`); }, (error) => {
    console.log(`#ERROR# ${error}`);
    Core.setFailed(error.message);
});
//# sourceMappingURL=index.js.map