import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;
  const isLocal = LOCAL_HOSTS.has(hostname);
  const secure = isSecureRequest(req);

  // P1-A: 恢复 domain 计算逻辑，确保跨域部署时 cookie 正确设置
  const shouldSetDomain =
    hostname &&
    !isLocal &&
    !isIpAddress(hostname);

  const domain = shouldSetDomain
    ? (hostname.startsWith(".") ? hostname : `.${hostname}`)
    : undefined;

  return {
    httpOnly: true,
    path: "/",
    // 本地开发使用 lax（不要求 HTTPS），生产环境使用 none + secure
    sameSite: isLocal ? "lax" : "none",
    secure: isLocal ? false : secure,
    ...(domain ? { domain } : {}),
  };
}
