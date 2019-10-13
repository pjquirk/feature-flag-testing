import * as Core from "@actions/core";
import { context, GitHub } from "@actions/github";

const FeatureFlagLabelName = "Feature Flag Rollout";

interface Stage {
    name: string;
    enabled: boolean;
}

async function run() {
    const actionToken = Core.getInput('action-token');
    const github = new GitHub(actionToken);
    
    console.log(`Reading issue ${context.issue.number} from ${context.issue.owner}/${context.issue.repo}`);
    const issue = await github.issues.get({
        issue_number: context.issue.number,
        owner: context.issue.owner,
        repo: context.issue.repo
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
    const regexp = RegExp(/^- \[([\sx])\] (.*)$/,'mgi');
    const stages: Stage[] = [];
    let match : RegExpExecArray | null;

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
    let fileExists: boolean;
    let fileContents: string;
    try {
        console.log(`Retrieving contents of: ${pathToStatusPage}`);
        response = await github.repos.getContents({
            owner: context.issue.owner,
            repo: context.issue.repo,
            path: pathToStatusPage
        });
        fileExists = true;
        // Bit of a hack, the type definitions don't expose 'content'
        const data: any = response.data;
        if (!data.content) {
            Core.setFailed(`${pathToStatusPage} is not a file, stopping.`);
            return
        }
        fileContents = data.content && Buffer.from(data.content).toString();
        console.log(`${pathToStatusPage} found.`);
    }
    catch (e) {
        if (!e || !e.message || e.message === "Not Found") {
            console.log(`Failed to retrieve the status page contents: ${e.message}`);
            Core.setFailed(e.message);
            return;
        }
        // we need to create the file
        fileExists = false;
        fileContents = "";
        console.log(`${pathToStatusPage} does not exist, will create it.`);
    }
}

run()
    .then(
        (response) => { console.log(`Finished running: ${response}`) },
        (error) => { Core.setFailed(error.message) }
    );