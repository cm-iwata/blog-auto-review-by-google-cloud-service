
from concurrent.futures import wait
from datetime import datetime, timedelta, timezone
import feedparser
import functions_framework
from google.cloud import pubsub_v1
import os


JST = timezone(timedelta(hours=+9))
feed_url = 'https://dev.classmethod.jp/feed/'


def get_feed_entries():
    updated_since = datetime.now(JST) - timedelta(hours=1)
    feed = feedparser.parse(feed_url)
    new_entries = [
        entry for entry in feed.entries
        if datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
        .astimezone(JST) > updated_since
    ]
    return new_entries

@functions_framework.http
def main(request):

    project_id = os.environ['PROJECT_ID']
    topic_name = os.environ['TOPIC_NAME']
    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(project_id, topic_name)


    new_entries = get_feed_entries()
    futures = []
    for entry in  new_entries:
        futures.append(publisher.publish(topic_path, entry['link'].encode()))

    res = wait(futures)
    print(res)
    return 'OK'
