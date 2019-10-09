import * as Core from "@actions/core";
import { context, GitHub } from "@actions/github";

const FeatureFlagLabelName = "Feature Flag Rollout";

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
    const match = issue.data.title.match(/^Roll out (.*)$/i);
    if (!match || match.length == 0) {
        console.log(`No feature name was found in the title, ignoring.`);
        return;
    }
    const featureName = match[0];
    console.log(`Found issue for feature ${featureName}`)

    // Extract the FF status from the body.  The body is expected to be (in Markdown):
    //
    // - [X] Stage Name 0
    // - [ ] Stage Name 1
    // - [ ] Stage Name 2
    

    const pathToStatusPage = Core.getInput('path-to-status-page');
    console.log(`Writing status to: ${pathToStatusPage}`);
    
}

run()
    .then(
        (response) => { console.log(`Finished running: ${response}`) },
        (error) => { 
            console.log(`#ERROR# ${error}`);
            Core.setFailed(error.message);
        }
    )