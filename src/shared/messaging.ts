import type { Message } from "./protocol.ts";

type RuntimeApi = Pick<typeof chrome, "runtime">;

export type Messenger = <T = unknown>(message: Message) => Promise<T>;

export function createMessenger(api: RuntimeApi): Messenger {
  return (message) =>
    new Promise((resolve, reject) => {
      api.runtime.sendMessage(message, (response) => {
        if (api.runtime.lastError) return reject(new Error(api.runtime.lastError.message));
        if (!response) return reject(new Error("No response from extension."));
        if (response.ok === false) return reject(new Error(response.error || "Operation failed."));
        resolve(response as never);
      });
    });
}
