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
const StatusHeader = "# Feature Flags Status";
const FeatureFlagTitleCell = "Feature Flag";
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
    let params = {
        featureName: featureName,
        fileContents: "",
        fileExists: false,
        github: github,
        pathToStatusPage: pathToStatusPage,
        stages: stages,
        issue: github_1.context.issue
    };
    let fileSha;
    try {
        console.log(`Retrieving contents of: ${pathToStatusPage}`);
        const getContentsResponse = await github.repos.getContents({
            owner: github_1.context.issue.owner,
            repo: github_1.context.issue.repo,
            path: pathToStatusPage
        });
        params.fileExists = true;
        // Bit of a hack, the type definitions don't expose 'content'
        const data = getContentsResponse.data;
        if (!data.content) {
            Core.setFailed(`${pathToStatusPage} is not a file, stopping.`);
            return;
        }
        params.fileContents = data.content && Buffer.from(data.content, 'base64').toString('ascii');
        fileSha = data.sha;
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
    const newContents = (params.fileExists) ?
        await updateStatus(params) :
        await createStatus(params);
    if (!newContents) {
        console.log("Could not update the status page");
        return;
    }
    // Write the markup to the repo
    console.log(`Writing new status page to ${params.pathToStatusPage}...`);
    await params.github.repos.createOrUpdateFile({
        owner: params.issue.owner,
        repo: params.issue.repo,
        path: params.pathToStatusPage,
        message: `Updating feature flag status page for '${params.featureName}'`,
        sha: fileSha,
        content: Buffer.from(newContents).toString('base64')
    });
}
function updateStatus(params) {
    // Find the header, our table is right below it
    const lines = params.fileContents.split('\n');
    const headerIndex = lines.indexOf(StatusHeader);
    if (headerIndex < 0) {
        Core.setFailed("Could not find the table header");
        return;
    }
    // Needs to be at least a header row and divders
    if (headerIndex > lines.length - 3) {
        Core.setFailed("Not enough lines for a status table");
        return;
    }
    // Make sure all of our stages exist
    const headerRow = lines[headerIndex + 1];
    const headers = headerRow.split("|").map(h => h.trim()).filter(h => h.length > 0);
    const headersLower = headers.map(h => h.toLowerCase());
    // Just add the new stages to the end
    const missingStageNames = params.stages.map(s => s.name)
        .filter(name => !headersLower.includes(name.toLowerCase()));
    headers.push(...missingStageNames);
    // Update the headers
    lines[headerIndex + 1] = `| ${headers.join(" | ")} |`;
    lines[headerIndex + 2] = `| ${headers.map(h => "---").join(" | ")} |`;
    // Find the row for our feature
    const updatedLine = `| ${headers.map(h => getCellContentsForHeader(h, params)).join(" | ")} |`;
    console.log("Updated line: " + updatedLine);
    const featureRowIndex = lines.findIndex(l => l.indexOf(params.featureName) >= 0);
    if (featureRowIndex >= 0) {
        console.log(`Found ${params.featureName} in table`);
        lines[featureRowIndex] = updatedLine;
    }
    else {
        console.log(`Did not find ${params.featureName} in table, adding a row`);
        lines.push(updatedLine);
    }
    return lines.join('\n');
}
function getCellContentsForHeader(header, params) {
    const stage = params.stages.find(s => s.name.toLowerCase() === header.toLowerCase());
    if (!stage) {
        return "";
    }
    return getStageStatus(stage);
}
function createStatus(params) {
    // Table should look like:
    // |  | stage 0 | stage 1 | stage 2 |
    // | --- | --- | --- | --- |
    // | feature name | :white_check_mark: |  |  | 
    return `${StatusHeader}
| ${FeatureFlagTitleCell} | ${params.stages.map(s => s.name).join(" | ")} |
| --- | ${params.stages.map(s => "---").join(" | ")} |
| ${params.featureName} | ${params.stages.map(getStageStatus).join(" | ")} | `;
}
function getStageStatus(stage) {
    return stage.enabled ? ":white_check_mark:" : " ";
}
run()
    .then((response) => { console.log(`Finished running: ${response}`); }, (error) => { Core.setFailed(error.message); });
//# sourceMappingURL=index.js.map