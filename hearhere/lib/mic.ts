/**
 * 麦克风错误友好提示。
 * 区分：非安全连接（HTTP）/ 用户拒绝权限 / 无设备 / 其他，
 * 让线上用户能看懂原因，而不是一句笼统的「无法访问麦克风」。
 */
export function getMicErrorMessage(err: unknown): string {
  // 浏览器在非 HTTPS（或 localhost 以外的 IP/域名）下会直接禁用麦克风 API
  if (
    typeof window !== "undefined" &&
    (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
  ) {
    return "当前连接不安全，浏览器已禁用麦克风。请确保使用 HTTPS 访问本站，并允许麦克风权限。";
  }

  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "麦克风权限被拒绝。请点击浏览器地址栏左侧的 🔒 图标，允许麦克风权限后重试。";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "没有检测到麦克风设备。请确认设备已连接麦克风后重试。";
      case "NotReadableError":
      case "TrackStartError":
        return "麦克风被其他应用占用（如微信/会议软件），请关闭后重试。";
      case "OverconstrainedError":
        return "麦克风设备不满足录音要求，请更换设备或浏览器后重试。";
    }
  }

  return "无法访问麦克风，请检查浏览器权限设置后重试。";
}
