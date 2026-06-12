//  © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
//  This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
//  http: // aws.amazon.com/agreement or other written agreement between Customer and either
//  Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
// CloudTrail Lake is no longer available to new AWS customers. When deployed
// with CloudTrailAuditLogs="disabled", EVENT_DATA_STORE contains the literal "disabled".
const RAW_EVENT_DATA_STORE = process.env.EVENT_DATA_STORE || "";
const AUDIT_DISABLED = RAW_EVENT_DATA_STORE === "" || RAW_EVENT_DATA_STORE === "disabled";
const EventDataStore = AUDIT_DISABLED ? null : RAW_EVENT_DATA_STORE.split("/").pop();
const REGION = process.env.REGION;
const {
    CloudTrailClient,
    paginateGetQueryResults,
  } = require("@aws-sdk/client-cloudtrail");
  const client = new CloudTrailClient({ region: REGION });


const get_query = async (queryId) => {
try {
    const output = [];
    const input = {
    EventDataStore: EventDataStore,
    QueryId: queryId,
    };
    const paginatorConfig = {
    client: new CloudTrailClient({ region: REGION }),
    };
    const paginator = paginateGetQueryResults(paginatorConfig, input);
    for await (const page of paginator) {
    // page contains a single paginated output.
    for (const data of page.QueryResultRows) {
        const logs = {};
        for (const log of data) {
        for (const [k, v] of Object.entries(log)) {
            logs[k] = v;
        }
        }
        output.push(logs);
    }
    }
    console.log(output);
    return output;
} catch (err) {
    console.log("Error", err);
}
};
  
exports.handler = async (event) => {
    const queryId = event["arguments"]["queryId"]
    if (AUDIT_DISABLED || queryId === "disabled") {
        console.log("CloudTrail Lake audit is disabled - returning empty result");
        return [];
    }
    return get_query(queryId);
};
