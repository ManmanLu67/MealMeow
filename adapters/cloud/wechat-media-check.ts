import { createHash, timingSafeEqual } from 'node:crypto'

type WechatSecurity = {
  mediaCheckAsync(input: {
    mediaUrl: string
    mediaType: number
    version: number
    scene: number
    openid: string
  }): Promise<{ traceId?: string; trace_id?: string }>
}

/** 微信内容安全 2.0。测试不调用它，云函数把 openapi 传进来。 */
export function createWechatMediaCheck(security: WechatSecurity, openid: string): {
  submitMedia(photo: string): Promise<{ traceId: string }>
} {
  return {
    async submitMedia(photo) {
      const res = await security.mediaCheckAsync({
        mediaUrl: photo,
        mediaType: 2,
        version: 2,
        scene: 1,
        openid,
      })
      const traceId = res.traceId || res.trace_id
      if (!traceId) throw new Error('no trace')
      return { traceId }
    },
  }
}

/** 微信消息签名：sha1(字典序拼接 token、timestamp、nonce)。token 为空则拒绝。 */
export function verifyWechatSignature(
  token: string,
  input: { signature?: unknown; timestamp?: unknown; nonce?: unknown },
): boolean {
  if (!token) return false
  if (typeof input.signature !== 'string' || typeof input.timestamp !== 'string' || typeof input.nonce !== 'string') {
    return false
  }
  const expected = createHash('sha1').update([token, input.timestamp, input.nonce].sort().join('')).digest('hex')
  const left = Buffer.from(expected)
  const right = Buffer.from(input.signature)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
