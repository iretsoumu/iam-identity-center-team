//  © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
//  This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
//  http: // aws.amazon.com/agreement or other written agreement between Customer and either
//  Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.

// EVENT_DATA_STORE carries the audit backend descriptor produced by the
// cloudtrailLake custom resource:
//   - "disabled"            -> session activity logging is turned off
//   - "cwlogs:<logGroup>"   -> query Amazon CloudWatch Logs (CloudTrail Lake successor)
//   - "<eds-id-or-arn>"     -> query a CloudTrail Lake event data store
const RAW_EVENT_DATA_STORE = process.env.EVENT_DATA_STORE || "";
const AUDIT_DISABLED = RAW_EVENT_DATA_STORE === "" || RAW_EVENT_DATA_STORE === "disabled";
const IS_CWLOGS = RAW_EVENT_DATA_STORE.startsWith("cwlogs:");
const EventDataStore = (AUDIT_DISABLED || IS_CWLOGS) ? null : RAW_EVENT_DATA_STORE.split("/").pop();
const REGION = process.env.REGION;

// Normalize a CloudWatch Logs Insights results row ([{field,value},...]) into the
// flat { eventID, eventName, eventSource, eventTime } shape the UI expects.
// Drops @-prefixed metadata fields (e.g. @ptr) that Logs Insights always appends.
const normalizeCwRow = (row) =>
  row.reduce((obj, { field, value }) => {
    if (field && !field.startsWith("@")) obj[field] = value;
    return obj;
  }, {});

const get_query_cloudtrail = async (queryId) => {
  try {
    const { CloudTrailClient, paginateGetQueryResults } = require("@aws-sdk/client-cloudtrail");
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
    return [];
  }
};

const get_query_cwlogs = async (queryId) => {
  try {
    const { CloudWatchLogsClient, GetQueryResultsCommand } = require("@aws-sdk/client-cloudwatch-logs");
    const client = new CloudWatchLogsClient({ region: REGION });
    const response = await client.send(new GetQueryResultsCommand({ queryId }));
    // status: Scheduled | Running | Complete | Failed | Cancelled | Timeout | Unknown
    const output = (response.results || []).map(normalizeCwRow);
    console.log(output);
    return output;
  } catch (err) {
    // Insights results expire after a retention window; an expired/unknown
    // queryId surfaces here. Return empty so the UI shows "no logs" rather than erroring.
    console.log("Error", err);
    return [];
  }
};

exports.handler = async (event) => {
  const queryId = event["arguments"]["queryId"];
  if (AUDIT_DISABLED || queryId === "disabled") {
    console.log("Session activity audit is disabled - returning empty result");
    return [];
  }
  if (IS_CWLOGS) {
    return get_query_cwlogs(queryId);
  }
  return get_query_cloudtrail(queryId);
};
