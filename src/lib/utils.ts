import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isLoopbackHost(hostname?: string | null): boolean {
  if (!hostname) {
    return false
  }
  return LOOPBACK_HOSTS.has(hostname.trim().toLowerCase())
}

function getRuntimeHost(): string {
  if (typeof window === "undefined") {
    return "localhost"
  }
  const hostname = window.location.hostname.trim()
  if (!hostname) {
    return "localhost"
  }
  return isLoopbackHost(hostname) ? "localhost" : hostname
}

export function getCanonicalLoopbackUrl(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  const { protocol, hostname, port, pathname, search, hash } = window.location
  if (!isLoopbackHost(hostname) || hostname === "localhost") {
    return null
  }
  const portPart = port ? `:${port}` : ""
  return `${protocol}//localhost${portPart}${pathname}${search}${hash}`
}

export function getDefaultGatewayUrl(): string {
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"
  return `${protocol}://${getRuntimeHost()}:18789`
}

export function resolveLocalServiceOrigin(port: number): string {
  return `http://${getRuntimeHost()}:${port}`
}

export function formatTime(value: number | string | Date | undefined | null): string {
  if (!value) return "--";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "--";
  
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  
  if (isThisYear) {
    return `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function getAvatarUrl(agentId?: string, avatarJobId?: string, fallbackSeed?: string): string {
  if (avatarJobId) {
    return `${resolveLocalServiceOrigin(7890)}/uploads/${avatarJobId}.png`;
  }
  const seed = agentId || fallbackSeed || "unknown";
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
}
