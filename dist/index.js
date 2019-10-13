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
    const featureName = matches[1];
    console.log(`Found issue for feature ${featureName}`);
    // Extract the FF status from the body.  The body is expected to be (in Markdown):
    //
    // - [X] Stage Name 0
    // - [ ] Stage Name 1
    // - [ ] Stage Name 2
    const regexp = RegExp(/^- \[([\sx])\] (.*)$/, 'mgi');
    const stages = [];
    let match;
    while ((match = regexp.exec(issue.data.body)) !== null) {
        stages.push({
            name: match[2],
            enabled: match[1].toLowerCase() === 'x'
        });
    }
    if (!stages || stages.length == 0) {
        console.log(`No stages were found in the body, ignoring.`);
        return;
    }
    console.log(`Found ${stages.length} stages`);
    const pathToStatusPage = Core.getInput('path-to-status-page');
    let response;
    let params = {
        featureName: featureName,
        fileContents: "",
        fileExists: false,
        github: github,
        pathToStatusPage: pathToStatusPage,
        stages: stages,
        issue: github_1.context.issue
    };
    try {
        console.log(`Retrieving contents of: ${pathToStatusPage}`);
        response = await github.repos.getContents({
            owner: github_1.context.issue.owner,
            repo: github_1.context.issue.repo,
            path: pathToStatusPage
        });
        params.fileExists = true;
        // Bit of a hack, the type definitions don't expose 'content'
        const data = response.data;
        if (!data.content) {
            Core.setFailed(`${pathToStatusPage} is not a file, stopping.`);
            return;
        }
        params.fileContents = data.content && Buffer.from(data.content).toString();
        console.log(`${pathToStatusPage} found.`);
    }
    catch (e) {
        if (!e || !e.message || e.message !== "Not Found") {
            console.log(`Failed to retrieve the status page contents: ${e.message}`);
            Core.setFailed(e.message);
            return;
        }
        // we need to create the file
        params.fileExists = false;
        params.fileContents = "";
        console.log(`${pathToStatusPage} does not exist, will create it.`);
    }
    if (params.fileExists) {
        await updateStatus(params);
    }
    else {
        await createStatus(params);
    }
}
async function updateStatus(params) {
}
async function createStatus(params) {
    // Table should look like:
    // |  | stage 0 | stage 1 | stage 2 |
    // | --- | --- | --- | --- |
    // | feature name | :white_check_mark: |  |  | 
    const markup = `| Feature Flag | ${params.stages.map(s => s.name).join(" | ")} |
        | --- | ${params.stages.map(s => "---").join(" | ")} |
        | ${params.featureName} | ${params.stages.map(getStageStatus).join(" | ")} | `;
    // Write the markup to the repo
    const response = await params.github.repos.createFile({
        owner: params.issue.owner,
        repo: params.issue.repo,
        path: params.pathToStatusPage,
        message: `Updating feature flag status page for '${params.featureName}'`,
        content: atob(markup)
    });
    console.log("Created status page");
}
function getStageStatus(stage) {
    return stage.enabled ? ":white_check_mark:" : " ";
}
run()
    .then((response) => { console.log(`Finished running: ${response}`); }, (error) => { Core.setFailed(error.message); });
//# sourceMappingURL=index.js.map