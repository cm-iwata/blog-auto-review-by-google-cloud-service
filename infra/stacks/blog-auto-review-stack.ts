import { Construct } from "constructs";
import { TerraformStack } from "cdktf";
import * as google from "@cdktf/provider-google";
import { RandomProvider } from "@cdktf/provider-random/lib/provider";
import { Config } from "../config";
import { StorageBucket } from "@cdktf/provider-google/lib/storage-bucket";
import { SecretManagerSecret } from "@cdktf/provider-google/lib/secret-manager-secret";
import { SecretManagerSecretVersion } from "@cdktf/provider-google/lib/secret-manager-secret-version";
import { ArchiveProvider } from "@cdktf/provider-archive/lib/provider";
import { CloudFunctions } from "../constructs/cloud-run-functions";
import { PubsubTopic } from "@cdktf/provider-google/lib/pubsub-topic";
import { CloudSchedulerJob } from "@cdktf/provider-google/lib/cloud-scheduler-job";
import { ServiceAccount } from "@cdktf/provider-google/lib/service-account";
import { ProjectIamMember } from "@cdktf/provider-google/lib/project-iam-member";

type LineAudienceStackProps = Config;

export class BlogAutoReviewStack extends TerraformStack {
  constructor(scope: Construct, id: string, props: LineAudienceStackProps) {
    super(scope, id);

    const { projectId, slackChannelId, location } = props;
    new google.provider.GoogleProvider(this, "google_provider", {
      project: projectId,
    });
    new RandomProvider(this, "random_provider");
    new ArchiveProvider(this, "archive_provider");

    const srcBucket = new StorageBucket(this, "src_bucket", {
      name: "blog-autoreview-src-bucket",
      location,
      uniformBucketLevelAccess: true,
    });

    const pubSubTopic = new PubsubTopic(this, "new_blog", {
      name: "blog-auto-review-new-blog",
      messageRetentionDuration: "600s",
    });

    const checkFeedFuncName = "blog-auto-review-check-feed";
    new CloudFunctions(this, "blog_feed", {
      functionDir: "check-feed",
      functionName: checkFeedFuncName,
      srcBucketName: srcBucket.name,
      location,
      projectId,
      environmentVariables: {
        TOPIC_NAME: pubSubTopic.name,
      },
    });

    new CloudFunctions(this, "auto_review", {
      functionDir: "auto-review",
      functionName: "blog-auto-review",
      srcBucketName: srcBucket.name,
      location,
      projectId: projectId,
      environmentVariables: {
        TOPIC_NAME: pubSubTopic.name,
        SLACK_CHANNEL_ID: slackChannelId,
      },
      eventTrigger: {
        eventType: "google.cloud.pubsub.topic.v1.messagePublished",
        pubsubTopic: pubSubTopic.id,
        triggerRegion: props.location,
        retryPolicy: "RETRY_POLICY_RETRY",
      },
    });

    const slackBotTokenSecret = new SecretManagerSecret(
      this,
      "slack_bot_token",
      {
        secretId: "blog-auto-review-slack-bot-token",
        replication: {
          auto: {},
        },
      },
    );
    new SecretManagerSecretVersion(this, "slack_bot_token_version", {
      lifecycle: {
        ignoreChanges: "all",
      },
      secret: slackBotTokenSecret.id,
      secretData:
        "手動で新しいバージョンを作成してSlackBot用のトークンを設定して下さい",
    });

    const feedCheckInvokerSa = new ServiceAccount(this, "feed_check_invoker", {
      accountId: "feed-check-invoker",
      displayName: "Feed Check Invoker Service Account",
    });

    new ProjectIamMember(this, "run_invoker", {
      project: projectId,
      role: "roles/run.invoker",
      member: feedCheckInvokerSa.member,
    });

    new CloudSchedulerJob(this, "review_trigger", {
      project: projectId,
      schedule: "0 * * * *",
      timeZone: "Asia/Tokyo",
      name: "blog-auto-review-scheduler",
      region: location,
      httpTarget: {
        uri: `https://${location}-${projectId}.cloudfunctions.net/${checkFeedFuncName}`,
        httpMethod: "POST",
        oidcToken: {
          serviceAccountEmail: feedCheckInvokerSa.email,
        },
      },
    });
  }
}
