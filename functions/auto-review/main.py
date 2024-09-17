import base64
from bs4 import BeautifulSoup
from cloudevents.http import CloudEvent
import functions_framework
from google.cloud import secretmanager
from markdownify import markdownify
import os
from slack_sdk import WebClient
import requests
import vertexai
from vertexai.generative_models import GenerativeModel, SafetySetting


system_instruction = """
あなたは企業ブログのレビュワーです

ブログ内に不適切な表現がないかチェックする必要があります。
...略
"""


def send_slack(project_id, url, review_result):
    sm_client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/blog-auto-review-slack-bot-token/versions/latest"
    response = sm_client.access_secret_version(name=name)
    slack_token = response.payload.data.decode("UTF-8")

    slack_channel = os.environ["SLACK_CHANNEL_ID"]
    slack_client = WebClient(token=slack_token)
    print(review_result)

    slack_client.chat_postMessage(
        channel=slack_channel,
        blocks=[
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": "以下のブログをレビューしました"},
            },
            {"type": "section", "text": {"type": "mrkdwn", "text": url}},
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": review_result},
            },
            {"type": "divider"},
        ],
    )


@functions_framework.cloud_event
def main(cloud_event: CloudEvent) -> None:
    url = base64.b64decode(cloud_event.data["message"]["data"]).decode()
    res = requests.get(url)
    soup = BeautifulSoup(res.text, "html.parser")
    article = soup.find("article")
    md_article = markdownify(article.prettify())
    project_id = os.environ["PROJECT_ID"]

    vertexai.init(project=project_id, location="us-central1")
    model = GenerativeModel(
        "gemini-1.5-flash-001", system_instruction=[system_instruction]
    )

    generation_config = {
        "max_output_tokens": 8192,
        "temperature": 1,
        "top_p": 0.95,
    }
    safety_settings = [
        SafetySetting(
            category=SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold=SafetySetting.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
        SafetySetting(
            category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold=SafetySetting.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
        SafetySetting(
            category=SafetySetting.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold=SafetySetting.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
        SafetySetting(
            category=SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold=SafetySetting.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        ),
    ]

    review_content = f"""
以下ブログのレビューお願いします

```
{md_article}
```
    """
    review_result = model.generate_content(
        [review_content],
        generation_config=generation_config,
        safety_settings=safety_settings,
    )

    send_slack(project_id, url, review_result.text)

    return review_result.text
