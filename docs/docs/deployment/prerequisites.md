---
layout: default
title: Prerequisites
nav_order: 2
parent: Solution deployment
---

# Prerequisites & setup

## Prerequisites

### AWS Organizations
- [AWS Organizations](https://aws.amazon.com/organizations/) managed multi account environment with [AWS IAM Identity Center](https://aws.amazon.com/iam/identity-center/) federated account access

  > TEAM cannot be used to perform the following tasks:
    - Grant temporary access to the management account
    - Manage permission sets provisioned in the management account

  Read the [security considerations]({% link docs/overview/security.md %}) section for more information.
  {: .note}

### Permission set
- Configure [Permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html) in IAM Identity center.    
  > You can either use a predefined permission set provided by Identity Center, or you can create your own permission sets using custom permissions in order to provide least-privilege access for particular operational tasks.
   {: .note}

### Dedicated TEAM account
- Dedicated AWS account for deploying TEAM Application. This account will also be configured as delegated admin for:
  - IAM Identity Center
  - CloudTrail Lake
  - Account management

  [As per AWS best practice](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices_mgmt-acct.html#best-practices_mgmt-use), it is not recommended to deploy resources in the organization management account. Designate a dedicated account for deploying the TEAM solution. We recommend that you do not deploy any other workloads in this account, and carefully manage users with access to this account based on a need-to-do principle.
  {: .note}

### Session activity audit backend
TEAM queries CloudTrail to show the API activity performed by a user during a period of elevated access. Choose one of the backends below with the `CLOUDTRAIL_AUDIT_LOGS` parameter.

> **Important:** AWS CloudTrail Lake is no longer available to new customers (effective 2026/5/31). New deployments should use the **CloudWatch Logs** backend, which AWS recommends as the successor. Existing CloudTrail Lake customers can continue to use their event data store.

**Option 1 (recommended) — Amazon CloudWatch Logs (`CLOUDTRAIL_AUDIT_LOGS=cwlogs`)**
TEAM runs CloudWatch Logs Insights queries against a log group that receives CloudTrail (organization) events.
- **Reuse an existing log group:** if you already deliver an organization trail to CloudWatch Logs, set `CloudWatchLogGroupName` to that log group's name. TEAM only needs `logs:StartQuery`/`logs:GetQueryResults` on it (granted automatically).
- **Let TEAM create one:** leave `CloudWatchLogGroupName` empty. TEAM creates an organization CloudTrail trail, an S3 bucket, and a CloudWatch Logs log group in the dedicated TEAM account. This requires the TEAM account to be the organization management account **or** a registered delegated administrator for CloudTrail (the same delegation TEAM already uses — see above).

**Option 2 — existing CloudTrail Lake event data store**
Create (or reuse) a CloudTrail Lake organization event data store in the dedicated TEAM account and pass either its ARN, or `read`/`write`/`read_write`/`none` to have TEAM create one. *Only available to existing CloudTrail Lake customers.*

**Option 3 — disabled (`CLOUDTRAIL_AUDIT_LOGS=disabled`)**
TEAM deploys without any query backend. The approval workflow is unaffected; the in-app "Session activity" view is turned off and shows a notice. Audit by correlating TEAM request records with standard CloudTrail in the target accounts.

## AWS Secrets Manager
TEAM allows you to use external repositories for deploying the solution. 
Create a secret in AWS Secret Manager containting your repository url and Access token in Secrets manager as shown below 

![custom](../assets/images/secret-manager.png)

### TEAM groups
- Create groups within AWS IAM Identity center for **TEAM admins** and **TEAM auditors**. These groups can be created locally (In Identity center) or synchronised from an external identity provider following your organisation's group membership review and attestation process.

  Refer to the [solution overview]({% link docs/overview/workflow.md %}) for more information on TEAM personas and groups
  {: .note}

## Development environment setup
- Setup [awscli](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and install [git-remote-codecommit](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html) on your local workstation

- Install [jq](https://github.com/stedolan/jq/wiki/Installation) on your local workstation

- Setup a [named profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html) for AWS CLI with sufficient permissions for the **Organization management account**

- Setup a named profile for AWS CLI with sufficient permissions for the **AWS account where the TEAM Application will be deployed in**

  You can use AWS CloudShell instead of the first two steps of setting up awscli, git-remote-codecommit, and jq on a local workstation.
  {: .note}

### 🚀 You can now [Deploy the Application]({% link docs/deployment/deployment_process.md %}).
