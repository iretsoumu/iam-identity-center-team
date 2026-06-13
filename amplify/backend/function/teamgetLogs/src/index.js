//  © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
//  This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
//  http: // aws.amazon.com/agreement or other written agreement between Customer and either
//  Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.

/* Amplify Params - DO NOT EDIT
	API_TEAM_GRAPHQLAPIENDPOINTOUTPUT
	API_AWSPIM_GRAPHQLAPIIDOUTPUT
	ENV
	REGION
Amplify Params - DO NOT EDIT */
import crypto from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { default as fetch, Request } from 'node-fetch';

import {
  CloudTrailClient,
  StartQueryCommand,
  DescribeQueryCommand,
} from "@aws-sdk/client-cloudtrail"

import {
  CloudWatchLogsClient,
  StartQueryCommand as CwStartQueryCommand,
  GetQueryResultsCommand as CwGetQueryResultsCommand,
} from "@aws-sdk/client-cloudwatch-logs"

const { Sha256 } = crypto;
const REGION = process.env.REGION;

// EVENT_DATA_STORE carries the audit backend descriptor produced by the
// cloudtrailLake custom resource:
//   - "disabled"            -> session activity logging is turned off
//   - "cwlogs:<logGroup>"   -> query Amazon CloudWatch Logs (CloudTrail Lake successor)
//   - "<eds-id-or-arn>"     -> query a CloudTrail Lake event data store
const RAW_EVENT_DATA_STORE = process.env.EVENT_DATA_STORE || "";
const AUDIT_DISABLED = RAW_EVENT_DATA_STORE === "" || RAW_EVENT_DATA_STORE === "disabled";
const IS_CWLOGS = RAW_EVENT_DATA_STORE.startsWith("cwlogs:");
const LOG_GROUP_NAME = IS_CWLOGS ? RAW_EVENT_DATA_STORE.slice("cwlogs:".length) : null;
const EventDataStore = (AUDIT_DISABLED || IS_CWLOGS) ? null : RAW_EVENT_DATA_STORE.split("/").pop();
const GRAPHQL_ENDPOINT = process.env.API_TEAM_GRAPHQLAPIENDPOINTOUTPUT;

const client = new CloudTrailClient({ region: REGION });
const cwClient = new CloudWatchLogsClient({ region: REGION });

const query = /* GraphQL */ `
  mutation UpdateSessions(
    $input: UpdateSessionsInput!
    $condition: ModelSessionsConditionInput
  ) {
    updateSessions(input: $input, condition: $condition) {
      id
      startTime
      endTime
      username
      accountId
      role
      approver_ids
      queryId
      createdAt
      updatedAt
      owner
    }
  }
`;

/**
 * @type {import('@types/aws-lambda').APIGatewayProxyHandler}
 */

const updateItem = async (id, queryId) => {
  const variables = {
    input: {
      id: id,
      queryId: queryId
    }
  }

  const endpoint = new URL(GRAPHQL_ENDPOINT);

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: REGION,
    service: 'appsync',
    sha256: Sha256
  });

  const requestToBeSigned = new HttpRequest({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: endpoint.host
    },
    hostname: endpoint.host,
    body: JSON.stringify({ query, variables }),
    path: endpoint.pathname
  });

  const signed = await signer.sign(requestToBeSigned);
  const request = new Request(endpoint, signed);

  let statusCode = 200;
  let body;
  let response;

  try {
    response = await fetch(request);
    body = await response.json();
    console.log(body);
    if (body.errors) statusCode = 400;
  } catch (error) {
    statusCode = 400;
    body = {
      errors: [
        {
          status: response.status,
          message: error.message,
          stack: error.stack
        }
      ]
    };
  }

  return {
    statusCode,
    body: JSON.stringify(body)
  };
};

// ---------- CloudTrail Lake backend ----------

const get_query_status = async (queryId) => {
  try {
    const input = {
      EventDataStore: EventDataStore,
      QueryId: queryId,
    };
    const command = new DescribeQueryCommand(input);
    const response = await client.send(command);
    return response.QueryStatus;
  } catch (err) {
    console.log("Error", err);
  }
};

const start_query = async (event) => {
  const startTime = event["startTime"]["S"];
  const endTime = event["endTime"]["S"];
  const  username = event["username"]["S"].replace('idc_', '');
  const accountId = event["accountId"]["S"];
  const role = event["role"]["S"];
  try {
    const input = {
      QueryStatement: `SELECT eventID, eventName, eventSource, eventTime FROM ${EventDataStore} WHERE eventTime > '${startTime}' AND eventTime < '${endTime}' AND lower(useridentity.principalId) LIKE '%:${username}%' AND useridentity.sessionContext.sessionIssuer.arn LIKE '%${role}%' AND recipientAccountId='${accountId}'`,
    };
    const command = new StartQueryCommand(input);
    const response = await client.send(command);
    return response.QueryId;
  } catch (err) {
    console.log("Error", err);
  }
};

// ---------- CloudWatch Logs backend (CloudTrail Lake successor) ----------

// Escape values interpolated into a Logs Insights quoted-string match.
const escapeForQuery = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const start_query_cwlogs = async (event) => {
  const startTime = event["startTime"]["S"];
  const endTime = event["endTime"]["S"];
  const username = event["username"]["S"].replace('idc_', '');
  const accountId = event["accountId"]["S"];
  const role = event["role"]["S"];
  // Logs Insights takes the time range as epoch seconds (not in the query string).
  const startEpoch = Math.floor(Date.parse(startTime) / 1000);
  const endEpoch = Math.floor(Date.parse(endTime) / 1000);
  // Equivalent of the CloudTrail Lake SQL. CloudTrail events in CloudWatch Logs use
  // camelCase field names (userIdentity, not useridentity). `like "..."` is a
  // case-sensitive substring match.
  const queryString =
    `fields eventID, eventName, eventSource, eventTime` +
    ` | filter userIdentity.principalId like "${escapeForQuery(':' + username)}"` +
    ` and userIdentity.sessionContext.sessionIssuer.arn like "${escapeForQuery(role)}"` +
    ` and recipientAccountId = "${escapeForQuery(accountId)}"` +
    ` | sort eventTime desc | limit 10000`;
  try {
    const command = new CwStartQueryCommand({
      logGroupName: LOG_GROUP_NAME,
      startTime: startEpoch,
      endTime: endEpoch,
      queryString: queryString,
      limit: 10000,
    });
    const response = await cwClient.send(command);
    return response.queryId;
  } catch (err) {
    console.log("Error", err);
  }
};

const cw_query_status = async (queryId) => {
  try {
    const command = new CwGetQueryResultsCommand({ queryId });
    const response = await cwClient.send(command);
    return response.status; // Scheduled | Running | Complete | Failed | Cancelled | Timeout | Unknown
  } catch (err) {
    console.log("Error", err);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler = async (event) => {
  let data = event["Records"].pop()
  data = data["dynamodb"]["NewImage"]
  const id = data["id"]["S"]
  console.log("Event", data);

  if (AUDIT_DISABLED) {
    // No audit backend: mark the session so the UI stops waiting and shows a notice.
    console.log("Session activity audit is disabled - skipping query");
    return updateItem(id, "disabled");
  }

  if (IS_CWLOGS) {
    const queryId = await start_query_cwlogs(data);
    if (!queryId) return;
    // Bounded wait so logs are usually ready without a manual refresh. The queryId
    // is persisted regardless, so the UI can fetch (or refresh) results afterwards.
    const TERMINAL = ["Complete", "Failed", "Cancelled", "Timeout"];
    for (let i = 0; i < 30; i++) {
      const status = await cw_query_status(queryId);
      if (!status || TERMINAL.includes(status)) break;
      await sleep(2000);
    }
    return updateItem(id, queryId);
  }

  // CloudTrail Lake
  const queryId = await start_query(data);
  let status = await get_query_status(queryId);
  while (status) {
    console.log(status);
    status = await get_query_status(queryId);
    if (status === "FINISHED") {
      console.log("query Finished - queryId:", queryId );
      const response = await updateItem (id, queryId);
      return response;
    }
  }
};
