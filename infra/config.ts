export type Config = {
    projectId: string
    location: string
    slackChannelId: string
}

export const getConfig = (): Config => {
    return {
        projectId: 'プロジェクトID',
        location: 'asia-northeast1',
        slackChannelId: '通知対象のSlackチャンネルID'
    }
}